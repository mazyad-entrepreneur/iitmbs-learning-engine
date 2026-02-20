/**
 * app.js — Application Orchestrator
 *
 * Owns all mutable state and coordinates between:
 *   storage.js   → persistence
 *   xpEngine.js  → XP computation
 *   ui.js        → rendering
 *
 * Architecture: Event dispatch pattern.
 *   dispatch(action, payload) → mutate state → save → re-render
 */

import { loadProgram, saveProgram, generateId, todayISO } from './storage.js';
import {
  recalculateTotalXP,
  getLevel,
  updateStreak,
  isWeekCoreComplete
} from './xpEngine.js';
import {
  renderHeader,
  renderWeeks,
  renderXPGraph,
  showPromptModal,
  showConfirmModal,
  showToast
} from './ui.js';

/* ────────────────────────────────────────────
   APP STATE
──────────────────────────────────────────── */

let program;

// UI-only state (not persisted)
const expandedWeeks    = new Set();
const expandedLectures = new Set();
let   graphVisible     = false;

/* ────────────────────────────────────────────
   INIT
──────────────────────────────────────────── */

export function initApp() {
  program = loadProgram();

  // Update streak on app open
  const today = todayISO();
  const { streak, lastActiveDate } = updateStreak(program, today);
  program.streak         = streak;
  program.lastActiveDate = lastActiveDate;

  // Initial XP sync (handles schema migration gaps)
  syncXP();
  saveProgram(program);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Failed:', err));
  }

  wireStaticListeners();
  render();
}

/* ────────────────────────────────────────────
   DISPATCH
──────────────────────────────────────────── */

function dispatch(action, payload = {}) {
  switch (action) {

    /* ═══ WEEK MANAGEMENT ═══ */

    case 'ADD_WEEK':
      showPromptModal('New Week', 'e.g. Week 1: Linear Algebra', '', name => {
        addWeek(name);
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
      showConfirmModal(`Delete "${w.weekName}" and all its lectures?`, () => {
        program.weeks = program.weeks.filter(x => x.weekId !== payload.weekId);
        expandedWeeks.delete(payload.weekId);
        commit('Week deleted.');
      });
      break;
    }

    case 'TOGGLE_WEEK':
      toggle(expandedWeeks, payload.weekId);
      render(); // UI-only — no save needed
      break;

    /* ═══ LECTURE MANAGEMENT ═══ */

    case 'ADD_LECTURE': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      showPromptModal('New Lecture', 'e.g. Lecture 3: Eigenvalues', '', name => {
        w.lectures.push(createLecture(name));
        expandedWeeks.add(payload.weekId); // keep week open
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
        // If week was marked complete but core is now broken, un-mark it
        if (w.weekCompleted && !isWeekCoreComplete(w)) {
          w.weekCompleted = false;
        }
        commit('Lecture deleted.');
      });
      break;
    }

    case 'TOGGLE_LECTURE':
      toggle(expandedLectures, payload.lectureId);
      render();
      break;

    /* ═══ LECTURE BOOLEAN TOGGLES ═══ */

    case 'LECTURE_TOGGLE': {
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!lec) break;

      lec[payload.field] = payload.value;

      // Un-ticking a core action invalidates week completion
      if (!payload.value && ['watched', 'memoryNote', 'finalNote'].includes(payload.field)) {
        const w = findWeek(payload.weekId);
        if (w && w.weekCompleted) {
          w.weekCompleted = false;
          showToast('Week completion un-marked (core action unchecked).', 'warn');
        }
      }

      const gained = syncXP();
      recordXPHistory(gained);
      save();
      render();
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
        case 'actDone-inc':
          if (lec.activityDone < lec.activityTotal) lec.activityDone++;
          break;
        case 'actDone-dec':
          if (lec.activityDone > 0) lec.activityDone--;
          break;
        case 'rev-inc':
          lec.revisionCount = (lec.revisionCount || 0) + 1;
          break;
        case 'rev-dec':
          lec.revisionCount = Math.max(0, (lec.revisionCount || 0) - 1);
          break;
      }

      const gained = syncXP();
      recordXPHistory(gained);
      save();
      render();
      break;
    }

    /* ═══ ASSIGNMENT STEPPERS ═══ */

    case 'ASSIGNMENT_STEP': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      const asgn = payload.type === 'practice'
        ? w.practiceAssignment
        : w.gradedAssignment;

      switch (payload.dir) {
        case 'total-inc': asgn.totalQuestions++; break;
        case 'total-dec':
          asgn.totalQuestions = Math.max(0, asgn.totalQuestions - 1);
          asgn.doneQuestions  = Math.min(asgn.doneQuestions, asgn.totalQuestions);
          break;
        case 'done-inc':
          if (asgn.doneQuestions < asgn.totalQuestions) asgn.doneQuestions++;
          break;
        case 'done-dec':
          if (asgn.doneQuestions > 0) asgn.doneQuestions--;
          break;
      }

      const gained = syncXP();
      recordXPHistory(gained);
      save();
      render();
      break;
    }

    /* ═══ WEEKLY TOGGLES ═══ */

    case 'WEEK_TOGGLE': {
      const w = findWeek(payload.weekId);
      if (!w) break;

      // Guard: week completion requires all core lecture actions done
      if (payload.field === 'weekCompleted' && payload.value && !isWeekCoreComplete(w)) {
        showToast('Complete all lecture core actions first (Watched + Memory Note + Final Note).', 'warn');
        render(); // re-render to revert checkbox visual
        break;
      }

      w[payload.field] = payload.value;

      const gained = syncXP();
      recordXPHistory(gained);
      save();
      render();

      if (payload.field === 'weekCompleted' && payload.value) {
        showToast('🎉 Week complete! +15 XP bonus earned.', 'success');
      }
      break;
    }

    /* ═══ GRAPH TOGGLE ═══ */

    case 'TOGGLE_GRAPH':
      graphVisible = !graphVisible;
      const graphSection = document.getElementById('graph-section');
      const graphBtn     = document.getElementById('btn-graph');
      if (graphSection) graphSection.classList.toggle('hidden', !graphVisible);
      if (graphBtn)     graphBtn.textContent = graphVisible ? '▲ Hide Graph' : '▼ XP Graph';
      if (graphVisible) setTimeout(() => renderXPGraph(program.xpHistory), 50);
      break;

    default:
      console.warn('[App] Unknown action:', action, payload);
  }
}

/* ────────────────────────────────────────────
   FACTORIES
──────────────────────────────────────────── */

function addWeek(name) {
  const week = {
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
  program.weeks.push(week);
  expandedWeeks.add(week.weekId);
  commit('Week added.');
}

function createLecture(name) {
  return {
    lectureId:     generateId('l'),
    lectureName:   name,
    watched:       false,
    memoryNote:    false,
    activityTotal: 0,
    activityDone:  0,
    finalNote:     false,
    revisionCount: 0,
    xpEarned:      0
  };
}

/* ────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────── */

function findWeek(weekId) {
  return program.weeks.find(w => w.weekId === weekId) || null;
}

function findLecture(weekId, lectureId) {
  const w = findWeek(weekId);
  if (!w) return null;
  return w.lectures.find(l => l.lectureId === lectureId) || null;
}

function toggle(set, key) {
  set.has(key) ? set.delete(key) : set.add(key);
}

function syncXP() {
  const prev      = program.totalXP;
  program.totalXP = recalculateTotalXP(program);
  program.level   = getLevel(program.totalXP);
  return Math.max(0, program.totalXP - prev);
}

function recordXPHistory(gained) {
  if (gained <= 0) return;
  const today = todayISO();
  program.xpHistory[today] = (program.xpHistory[today] || 0) + gained;

  // Trim entries older than 365 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const key of Object.keys(program.xpHistory)) {
    if (key < cutoffStr) delete program.xpHistory[key];
  }
}

function save() {
  saveProgram(program);
}

function commit(toastMsg) {
  syncXP();
  save();
  render();
  if (toastMsg) showToast(toastMsg, 'info');
}

function render() {
  renderHeader(program);
  renderWeeks(program, dispatch, expandedWeeks, expandedLectures);
  if (graphVisible) renderXPGraph(program.xpHistory);
}

/* ────────────────────────────────────────────
   STATIC EVENT LISTENERS
──────────────────────────────────────────── */

function wireStaticListeners() {
  document.getElementById('btn-add-week')?.addEventListener('click', () => {
    dispatch('ADD_WEEK');
  });

  document.getElementById('btn-graph')?.addEventListener('click', () => {
    dispatch('TOGGLE_GRAPH');
  });

  // Redraw graph on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (graphVisible) renderXPGraph(program.xpHistory);
    }, 150);
  });
}
