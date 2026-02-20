/**
 * app.js — Application Orchestrator
 *
 * Owns all mutable state. Coordinates storage ↔ xpEngine ↔ ui.
 * All mutations go through dispatch(action, payload).
 */

import { loadProgram, saveProgram, generateId, todayISO,
         exportBackup, parseImportedBackup } from './storage.js';
import { recalculateTotalXP, getLevel, updateStreak,
         isWeekCoreComplete, XP } from './xpEngine.js';
import { renderHeader, renderStats, renderWeeks, renderXPGraph,
         showPromptModal, showConfirmModal, showToast } from './ui.js';

/* ── App state ── */
let program;
const expandedWeeks    = new Set();
const expandedLectures = new Set();
let   graphVisible     = false;
let   statsVisible     = false;

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */

export function initApp() {
  program = loadProgram();

  // Update streak (auto-uses freeze if applicable)
  const today = todayISO();
  const result = updateStreak(program, today);
  program.streak         = result.streak;
  program.bestStreak     = result.bestStreak;
  program.lastActiveDate = result.lastActiveDate;
  program.streakFreezes  = result.streakFreezes;

  if (result.freezeUsed) {
    // We'll show this toast after first render
    setTimeout(() => showToast('❄️ Streak Freeze used — streak protected!', 'info'), 600);
  }

  syncXP();
  saveProgram(program);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('[SW] Registered:', r.scope))
      .catch(e => console.warn('[SW] Failed:', e));
  }

  wireStaticListeners();
  render();
}

/* ─────────────────────────────────────────
   DISPATCH
───────────────────────────────────────── */

function dispatch(action, payload = {}) {
  switch (action) {

    /* ═══ WEEK ═══ */

    case 'ADD_WEEK':
      showPromptModal('New Week', 'e.g. Week 1: Linear Algebra', '', name => {
        const week = makeWeek(name);
        program.weeks.push(week);
        expandedWeeks.add(week.weekId);
        commit('Week added.');
      });
      break;

    case 'EDIT_WEEK_NAME': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      showPromptModal('Rename Week', 'Week name', w.weekName, name => {
        w.weekName = name;
        commit('Week renamed.');
      });
      break;
    }

    case 'DELETE_WEEK': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      showConfirmModal(`Delete "${w.weekName}" and all its data?`, () => {
        program.weeks = program.weeks.filter(x => x.weekId !== payload.weekId);
        expandedWeeks.delete(payload.weekId);
        commit('Week deleted.');
      });
      break;
    }

    case 'TOGGLE_WEEK':
      toggle(expandedWeeks, payload.weekId);
      render();
      break;

    /* ═══ LECTURE ═══ */

    case 'ADD_LECTURE': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      showPromptModal('New Lecture', 'e.g. Lecture 3: Eigenvalues', '', name => {
        w.lectures.push(makeLecture(name));
        expandedWeeks.add(payload.weekId);
        commit('Lecture added.');
      });
      break;
    }

    case 'RENAME_LECTURE': {
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!lec) break;
      showPromptModal('Rename Lecture', 'Lecture name', lec.lectureName, name => {
        lec.lectureName = name;
        commit('Lecture renamed.');
      });
      break;
    }

    case 'DELETE_LECTURE': {
      const w   = findWeek(payload.weekId);
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!w || !lec) break;
      showConfirmModal(`Delete "${lec.lectureName}"?`, () => {
        w.lectures = w.lectures.filter(l => l.lectureId !== payload.lectureId);
        expandedLectures.delete(payload.lectureId);
        if (w.weekCompleted && !isWeekCoreComplete(w)) w.weekCompleted = false;
        commit('Lecture deleted.');
      });
      break;
    }

    case 'TOGGLE_LECTURE':
      toggle(expandedLectures, payload.lectureId);
      render();
      break;

    /* ═══ LECTURE NOTES (auto-save, no re-render) ═══ */

    case 'SAVE_LECTURE_NOTE': {
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (lec) { lec.notes = payload.text; save(); }
      break;
    }

    /* ═══ LECTURE BOOLEAN TOGGLES ═══ */

    case 'LECTURE_TOGGLE': {
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!lec) break;
      lec[payload.field] = payload.value;
      if (!payload.value && ['watched','memoryNote','finalNote'].includes(payload.field)) {
        const w = findWeek(payload.weekId);
        if (w && w.weekCompleted) {
          w.weekCompleted = false;
          showToast('Week completion removed (core action unchecked).', 'warn');
        }
      }
      xpCommit();
      break;
    }

    /* ═══ LECTURE STEPPERS ═══ */

    case 'LECTURE_STEP': {
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!lec) break;
      switch (payload.action) {
        case 'actTotal-inc': lec.activityTotal++; break;
        case 'actTotal-dec':
          lec.activityTotal = Math.max(0, lec.activityTotal - 1);
          lec.activityDone  = Math.min(lec.activityDone, lec.activityTotal);
          break;
        case 'actDone-inc': if (lec.activityDone < lec.activityTotal) lec.activityDone++; break;
        case 'actDone-dec': if (lec.activityDone > 0) lec.activityDone--; break;
        case 'rev-inc': lec.revisionCount = (lec.revisionCount || 0) + 1; break;
        case 'rev-dec': lec.revisionCount = Math.max(0, (lec.revisionCount || 0) - 1); break;
      }
      xpCommit();
      break;
    }

    /* ═══ ASSIGNMENT STEPPERS ═══ */

    case 'ASSIGNMENT_STEP': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      const a = payload.type === 'practice' ? w.practiceAssignment : w.gradedAssignment;
      switch (payload.dir) {
        case 'total-inc': a.totalQuestions++; break;
        case 'total-dec':
          a.totalQuestions = Math.max(0, a.totalQuestions - 1);
          a.doneQuestions  = Math.min(a.doneQuestions, a.totalQuestions);
          break;
        case 'done-inc': if (a.doneQuestions < a.totalQuestions) a.doneQuestions++; break;
        case 'done-dec': if (a.doneQuestions > 0) a.doneQuestions--; break;
      }
      xpCommit();
      break;
    }

    /* ═══ WEEKLY TOGGLES ═══ */

    case 'WEEK_TOGGLE': {
      const w = findWeek(payload.weekId);
      if (!w) break;

      if (payload.field === 'weekCompleted' && payload.value && !isWeekCoreComplete(w)) {
        showToast('Complete all lecture core actions first (Watched + Memory Note + Final Note).', 'warn');
        render();
        break;
      }

      w[payload.field] = payload.value;

      // Reward: earn a streak freeze when completing a week (max 3)
      if (payload.field === 'weekCompleted' && payload.value) {
        if ((program.streakFreezes || 0) < XP.MAX_FREEZES) {
          program.streakFreezes = (program.streakFreezes || 0) + 1;
          setTimeout(() => showToast(`🎉 Week complete! +15 XP · ❄️ Earned a Streak Freeze (${program.streakFreezes}/${XP.MAX_FREEZES})`, 'success'), 100);
        } else {
          setTimeout(() => showToast('🎉 Week complete! +15 XP bonus.', 'success'), 100);
        }
      }

      xpCommit();
      break;
    }

    /* ═══ GRAPH ═══ */

    case 'TOGGLE_GRAPH':
      graphVisible = !graphVisible;
      document.getElementById('graph-section')?.classList.toggle('hidden', !graphVisible);
      document.getElementById('btn-graph').textContent = graphVisible ? '▲ Hide Graph' : '▼ XP Graph';
      if (graphVisible) setTimeout(() => renderXPGraph(program.xpHistory), 50);
      break;

    /* ═══ STATS PANEL ═══ */

    case 'TOGGLE_STATS':
      statsVisible = !statsVisible;
      document.getElementById('stats-section')?.classList.toggle('hidden', !statsVisible);
      document.getElementById('btn-stats').textContent = statsVisible ? '▲ Hide Stats' : '◎ Stats';
      if (statsVisible) renderStats(program);
      break;

    /* ═══ EXPORT ═══ */

    case 'EXPORT_DATA': {
      const filename = exportBackup(program);
      showToast(`✓ Backup downloaded: ${filename}`, 'success');
      break;
    }

    /* ═══ IMPORT ═══ */

    case 'IMPORT_DATA':
      document.getElementById('import-file-input')?.click();
      break;

    default:
      console.warn('[App] Unknown action:', action, payload);
  }
}

/* ─────────────────────────────────────────
   FACTORIES
───────────────────────────────────────── */

function makeWeek(name) {
  return {
    weekId:    generateId('w'),
    weekName:  name,
    lectures:  [],
    practiceAssignment: { totalQuestions: 0, doneQuestions: 0 },
    gradedAssignment:   { totalQuestions: 0, doneQuestions: 0 },
    weeklyMemoryNote: false,
    weeklyFinalNote:  false,
    weekCompleted:    false,
    xpEarned:         0
  };
}

function makeLecture(name) {
  return {
    lectureId:     generateId('l'),
    lectureName:   name,
    watched:       false,
    memoryNote:    false,
    activityTotal: 0,
    activityDone:  0,
    finalNote:     false,
    revisionCount: 0,
    notes:         '',
    xpEarned:      0
  };
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function findWeek(id)            { return program.weeks.find(w => w.weekId === id) || null; }
function findLecture(wId, lId)   {
  const w = findWeek(wId);
  return w ? (w.lectures.find(l => l.lectureId === lId) || null) : null;
}
function toggle(set, key)        { set.has(key) ? set.delete(key) : set.add(key); }

function syncXP() {
  const prev      = program.totalXP;
  program.totalXP = recalculateTotalXP(program);
  program.level   = getLevel(program.totalXP);
  return Math.max(0, program.totalXP - prev);
}

function recordXP(gained) {
  if (gained <= 0) return;
  const today = todayISO();
  program.xpHistory[today] = (program.xpHistory[today] || 0) + gained;
  // Trim beyond 365 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const k of Object.keys(program.xpHistory))
    if (k < cutoffStr) delete program.xpHistory[k];
}

function save()   { saveProgram(program); }

/** XP recalc + record + save + render — used after any data change */
function xpCommit() {
  const gained = syncXP();
  recordXP(gained);
  save();
  render();
}

/** Full commit with optional toast */
function commit(msg) {
  xpCommit();
  if (msg) showToast(msg, 'info');
}

function render() {
  renderHeader(program);
  renderWeeks(program, dispatch, expandedWeeks, expandedLectures);
  if (graphVisible) renderXPGraph(program.xpHistory);
  if (statsVisible) renderStats(program);
}

/* ─────────────────────────────────────────
   STATIC LISTENERS
───────────────────────────────────────── */

function wireStaticListeners() {
  document.getElementById('btn-add-week')?.addEventListener('click', () => dispatch('ADD_WEEK'));
  document.getElementById('btn-graph')?.addEventListener('click',    () => dispatch('TOGGLE_GRAPH'));
  document.getElementById('btn-stats')?.addEventListener('click',    () => dispatch('TOGGLE_STATS'));
  document.getElementById('btn-export')?.addEventListener('click',   () => dispatch('EXPORT_DATA'));
  document.getElementById('btn-import')?.addEventListener('click',   () => dispatch('IMPORT_DATA'));

  // Hidden file input for import
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        const result = parseImportedBackup(ev.target.result);
        fileInput.value = ''; // reset so same file can trigger again

        if (!result.ok) {
          showToast(`Import failed: ${result.error}`, 'warn');
          return;
        }

        const wc = result.program.weeks.length;
        const xp = result.program.totalXP;
        showConfirmModal(
          `Import backup?\n\n${wc} weeks · ${xp} XP total\n\nThis REPLACES all current data.`,
          () => {
            program = result.program;
            saveProgram(program);
            syncXP();
            render();
            showToast(`✓ Restored: ${wc} weeks imported.`, 'success');
          }
        );
      };
      reader.readAsText(file);
    });
  }

  // Redraw graph on resize
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (graphVisible) renderXPGraph(program.xpHistory); }, 150);
  });
}
