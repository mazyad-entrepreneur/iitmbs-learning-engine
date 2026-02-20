/**
 * app.js — Application Orchestrator
 *
 * Owns all mutable state. Coordinates storage ↔ xpEngine ↔ ui.
 * All mutations go through dispatch(action, payload).
 *
 * Actions are handled by named functions below — no giant switch-case.
 * Each handler follows the same pattern:
 *   1. Find the relevant data (week/lecture)
 *   2. Mutate it
 *   3. Call commit() or xpCommit() to save + re-render
 */

import {
  loadProgram, saveProgram, generateId, todayISO,
  exportBackup, parseImportedBackup
} from './storage.js';
import {
  recalculateTotalXP, getLevel, updateStreak,
  isWeekCoreComplete, XP
} from './xpEngine.js';
import {
  renderHeader, renderStats, renderWeeks, renderXPGraph,
  showPromptModal, showConfirmModal, showToast
} from './src/ui/index.js';

/* ── App state ── */
let program;
const expandedWeeks = new Set();
const expandedLectures = new Set();
let graphVisible = false;
let statsVisible = false;

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */

export function initApp() {
  program = loadProgram();

  // Update streak using real device clock
  const today = todayISO();          // returns YYYY-MM-DD string from new Date()
  const result = updateStreak(program, today);
  program.streak = result.streak;
  program.bestStreak = result.bestStreak;
  program.lastActiveDate = result.lastActiveDate;
  program.streakFreezes = result.streakFreezes;

  if (result.freezeUsed) {
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
   DISPATCH — routes actions to named handlers
───────────────────────────────────────── */

function dispatch(action, payload = {}) {
  const handler = ACTION_HANDLERS[action];
  if (handler) {
    handler(payload);
  } else {
    console.warn('[App] Unknown action:', action, payload);
  }
}

/**
 * Action handler map.
 * Each key is an action name, value is a function(payload) => void.
 * Handlers may call commit(), xpCommit(), or render() directly.
 */
const ACTION_HANDLERS = {

  /* ══ WEEK ══ */

  ADD_WEEK: () => {
    showPromptModal('New Week', 'e.g. Week 1: Linear Algebra', '', name => {
      const week = makeWeek(name);
      program.weeks.push(week);
      expandedWeeks.add(week.weekId);
      commit('Week added.');
    });
  },

  EDIT_WEEK_NAME: ({ weekId }) => {
    const w = findWeek(weekId);
    if (!w) return;
    showPromptModal('Rename Week', 'Week name', w.weekName, name => {
      w.weekName = name;
      commit('Week renamed.');
    });
  },

  DELETE_WEEK: ({ weekId }) => {
    const w = findWeek(weekId);
    if (!w) return;
    showConfirmModal(`Delete "${w.weekName}" and all its data?`, () => {
      program.weeks = program.weeks.filter(x => x.weekId !== weekId);
      expandedWeeks.delete(weekId);
      commit('Week deleted.');
    });
  },

  TOGGLE_WEEK: ({ weekId }) => {
    toggle(expandedWeeks, weekId);
    render();
  },

  /* ══ LECTURE ══ */

  ADD_LECTURE: ({ weekId }) => {
    const w = findWeek(weekId);
    if (!w) return;
    showPromptModal('New Lecture', 'e.g. Lecture 3: Eigenvalues', '', name => {
      w.lectures.push(makeLecture(name));
      expandedWeeks.add(weekId);
      commit('Lecture added.');
    });
  },

  RENAME_LECTURE: ({ weekId, lectureId }) => {
    const lec = findLecture(weekId, lectureId);
    if (!lec) return;
    showPromptModal('Rename Lecture', 'Lecture name', lec.lectureName, name => {
      lec.lectureName = name;
      commit('Lecture renamed.');
    });
  },

  DELETE_LECTURE: ({ weekId, lectureId }) => {
    const w = findWeek(weekId);
    const lec = findLecture(weekId, lectureId);
    if (!w || !lec) return;
    showConfirmModal(`Delete "${lec.lectureName}"?`, () => {
      w.lectures = w.lectures.filter(l => l.lectureId !== lectureId);
      expandedLectures.delete(lectureId);
      if (w.weekCompleted && !isWeekCoreComplete(w)) w.weekCompleted = false;
      commit('Lecture deleted.');
    });
  },

  TOGGLE_LECTURE: ({ lectureId }) => {
    toggle(expandedLectures, lectureId);
    render();
  },

  /* ══ LECTURE NOTES (auto-save, no re-render) ══ */

  SAVE_LECTURE_NOTE: ({ weekId, lectureId, text }) => {
    const lec = findLecture(weekId, lectureId);
    if (lec) { lec.notes = text; save(); }
  },

  /* ══ LECTURE BOOLEAN TOGGLES ══ */

  LECTURE_TOGGLE: ({ weekId, lectureId, field, value }) => {
    const lec = findLecture(weekId, lectureId);
    if (!lec) return;
    lec[field] = value;
    // If unchecking a core action, remove week completion
    if (!value && ['watched', 'memoryNote', 'finalNote'].includes(field)) {
      const w = findWeek(weekId);
      if (w && w.weekCompleted) {
        w.weekCompleted = false;
        showToast('Week completion removed (core action unchecked).', 'warn');
      }
    }
    xpCommit();
  },

  /* ══ LECTURE STEPPERS ══ */

  LECTURE_STEP: ({ weekId, lectureId, action }) => {
    const lec = findLecture(weekId, lectureId);
    if (!lec) return;
    switch (action) {
      case 'actTotal-inc': lec.activityTotal++; break;
      case 'actTotal-dec':
        lec.activityTotal = Math.max(0, lec.activityTotal - 1);
        lec.activityDone = Math.min(lec.activityDone, lec.activityTotal);
        break;
      case 'actDone-inc': if (lec.activityDone < lec.activityTotal) lec.activityDone++; break;
      case 'actDone-dec': if (lec.activityDone > 0) lec.activityDone--; break;
      case 'rev-inc': lec.revisionCount = (lec.revisionCount || 0) + 1; break;
      case 'rev-dec': lec.revisionCount = Math.max(0, (lec.revisionCount || 0) - 1); break;
    }
    xpCommit();
  },

  /* ══ ASSIGNMENT STEPPERS ══ */

  ASSIGNMENT_STEP: ({ weekId, type, dir }) => {
    const w = findWeek(weekId);
    if (!w) return;
    const a = type === 'practice' ? w.practiceAssignment : w.gradedAssignment;
    switch (dir) {
      case 'total-inc': a.totalQuestions++; break;
      case 'total-dec':
        a.totalQuestions = Math.max(0, a.totalQuestions - 1);
        a.doneQuestions = Math.min(a.doneQuestions, a.totalQuestions);
        break;
      case 'done-inc': if (a.doneQuestions < a.totalQuestions) a.doneQuestions++; break;
      case 'done-dec': if (a.doneQuestions > 0) a.doneQuestions--; break;
    }
    xpCommit();
  },

  /* ══ WEEKLY TOGGLES ══ */

  WEEK_TOGGLE: ({ weekId, field, value }) => {
    const w = findWeek(weekId);
    if (!w) return;

    if (field === 'weekCompleted' && value && !isWeekCoreComplete(w)) {
      showToast('Complete all lecture core actions first (Watched + Memory Note + Final Note).', 'warn');
      render();
      return;
    }

    w[field] = value;

    if (field === 'weekCompleted' && value) {
      if ((program.streakFreezes || 0) < XP.MAX_FREEZES) {
        program.streakFreezes = (program.streakFreezes || 0) + 1;
        setTimeout(() => showToast(
          `🎉 Week complete! +15 XP · ❄️ Earned a Streak Freeze (${program.streakFreezes}/${XP.MAX_FREEZES})`,
          'success'
        ), 100);
      } else {
        setTimeout(() => showToast('🎉 Week complete! +15 XP bonus.', 'success'), 100);
      }
    }
    xpCommit();
  },

  /* ══ GRAPH ══ */

  TOGGLE_GRAPH: () => {
    graphVisible = !graphVisible;
    document.getElementById('graph-section')?.classList.toggle('hidden', !graphVisible);
    document.getElementById('btn-graph').textContent = graphVisible ? '▲ Hide Graph' : '▼ XP Graph';
    if (graphVisible) setTimeout(() => renderXPGraph(program.xpHistory), 50);
  },

  /* ══ STATS PANEL ══ */

  TOGGLE_STATS: () => {
    statsVisible = !statsVisible;
    document.getElementById('stats-section')?.classList.toggle('hidden', !statsVisible);
    document.getElementById('btn-stats').textContent = statsVisible ? '▲ Hide Stats' : '◎ Stats';
    if (statsVisible) renderStats(program);
  },

  /* ══ EXPORT ══ */

  EXPORT_DATA: () => {
    const filename = exportBackup(program);
    showToast(`✓ Backup downloaded: ${filename}`, 'success');
  },

  /* ══ IMPORT ══ */

  IMPORT_DATA: () => {
    document.getElementById('import-file-input')?.click();
  },
};

/* ─────────────────────────────────────────
   FACTORIES
───────────────────────────────────────── */

function makeWeek(name) {
  return {
    weekId: generateId('w'),
    weekName: name,
    lectures: [],
    practiceAssignment: { totalQuestions: 0, doneQuestions: 0 },
    gradedAssignment: { totalQuestions: 0, doneQuestions: 0 },
    weeklyMemoryNote: false,
    weeklyFinalNote: false,
    weekCompleted: false,
    xpEarned: 0
  };
}

function makeLecture(name) {
  return {
    lectureId: generateId('l'),
    lectureName: name,
    watched: false,
    memoryNote: false,
    activityTotal: 0,
    activityDone: 0,
    finalNote: false,
    revisionCount: 0,
    notes: '',
    xpEarned: 0
  };
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function findWeek(id) { return program.weeks.find(w => w.weekId === id) || null; }
function findLecture(wId, lId) {
  const w = findWeek(wId);
  return w ? (w.lectures.find(l => l.lectureId === lId) || null) : null;
}
function toggle(set, key) { set.has(key) ? set.delete(key) : set.add(key); }

/** Recalculate total XP and level. Returns XP gained since last calculation. */
function syncXP() {
  const prev = program.totalXP;
  program.totalXP = recalculateTotalXP(program);
  program.level = getLevel(program.totalXP);
  return Math.max(0, program.totalXP - prev);
}

/** Record XP earned today in the xpHistory map (keyed by YYYY-MM-DD). */
function recordXP(gained) {
  if (gained <= 0) return;
  const today = todayISO();
  program.xpHistory[today] = (program.xpHistory[today] || 0) + gained;
  // Trim entries older than 365 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const k of Object.keys(program.xpHistory)) {
    if (k < cutoffStr) delete program.xpHistory[k];
  }
}

function save() { saveProgram(program); }

/** XP recalc + record + save + re-render — after any data change */
function xpCommit() {
  const gained = syncXP();
  recordXP(gained);
  save();
  render();
}

/** Full commit: xpCommit + optional info toast */
function commit(msg) {
  xpCommit();
  if (msg) showToast(msg, 'info');
}

function render() {
  try {
    renderHeader(program);
    renderWeeks(program, dispatch, expandedWeeks, expandedLectures);
    if (graphVisible) renderXPGraph(program.xpHistory);
    if (statsVisible) renderStats(program);
  } catch (err) {
    console.error('[App] Render error:', err);
  }
}

/* ─────────────────────────────────────────
   STATIC LISTENERS
───────────────────────────────────────── */

function wireStaticListeners() {
  document.getElementById('btn-add-week')?.addEventListener('click', () => dispatch('ADD_WEEK'));
  document.getElementById('btn-graph')?.addEventListener('click', () => dispatch('TOGGLE_GRAPH'));
  document.getElementById('btn-stats')?.addEventListener('click', () => dispatch('TOGGLE_STATS'));
  document.getElementById('btn-export')?.addEventListener('click', () => dispatch('EXPORT_DATA'));
  document.getElementById('btn-import')?.addEventListener('click', () => dispatch('IMPORT_DATA'));

  /* Hidden file input for import */
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        const result = parseImportedBackup(ev.target.result);
        fileInput.value = '';   // reset so same file can trigger again

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

  /* Redraw graph on window resize */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (graphVisible) renderXPGraph(program.xpHistory);
    }, 150);
  });
}
