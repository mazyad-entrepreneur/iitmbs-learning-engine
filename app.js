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
 *
 * All state mutations go through dispatch() to guarantee
 * consistent save + XP recalculation + re-render cycle.
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

/** Current program (mutated in place, then saved) */
let program;

/** UI-only state (not persisted) */
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

  // Initial XP sync (in case of schema migration)
  syncXP();
  saveProgram(program);

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registered, scope:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  }

  // Wire static DOM event listeners
  wireStaticListeners();

  // First render
  render();
}

/* ────────────────────────────────────────────
   DISPATCH — central state mutation handler
──────────────────────────────────────────── */

/**
 * All actions flow through here.
 * @param {string} action - action type
 * @param {Object} payload
 */
function dispatch(action, payload = {}) {
  switch (action) {

    /* ── Week management ── */
    case 'ADD_WEEK':
      showPromptModal('Add Week', 'e.g. Week 1: Linear Algebra', '', name => {
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
      showConfirmModal(`Delete "${w.weekName}" and all its data?`, () => {
        program.weeks = program.weeks.filter(x => x.weekId !== payload.weekId);
        expandedWeeks.delete(payload.weekId);
        commit('Week deleted.');
      });
      break;
    }

    case 'TOGGLE_WEEK':
      toggle(expandedWeeks, payload.weekId);
      render(); // UI-only, no save needed
      break;

    /* ── Lecture management ── */
    case 'ADD_LECTURE': {
      const w = findWeek(payload.weekId);
      if (!w) break;
      showPromptModal('Add Lecture', 'e.g. Lecture 3: Eigenvalues', '', name => {
        w.lectures.push(createLecture(name));
        expandedWeeks.add(payload.weekId); // auto-expand week
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
      const w = findWeek(payload.weekId);
      if (!w) break;
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!lec) break;
      showConfirmModal(`Delete "${lec.lectureName}"?`, () => {
        w.lectures = w.lectures.filter(l => l.lectureId !== payload.lectureId);
        expandedLectures.delete(payload.lectureId);
        // If week was marked complete but now core is broken, unmark it
        if (w.weekCompleted && !isWeekCoreComplete(w)) {
          w.weekCompleted = false;
        }
        commit('Lecture deleted.');
      });
      break;
    }

    case 'TOGGLE_LECTURE':
      toggle(expandedLectures, payload.lectureId);
      render(); // UI-only
      break;

    /* ── Lecture field toggles ── */
    case 'LECTURE_TOGGLE': {
      const lec = findLecture(payload.weekId, payload.lectureId);
      if (!lec) break;
      lec[payload.field] = payload.value;

      // If un-checking a core action and week was complete, unmark it
      if (!payload.value && ['watched', 'memoryNote', 'finalNote'].includes(payload.field)) {
        const w = findWeek(payload.weekId);
        if (w && w.weekCompleted) w.weekCompleted = false;
      }

      const xpGained = syncXP();
      recordXPHistory(xpGained);
      save();
      render();
      break;
    }

    /* ── Lecture activity steppers ── */
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
      }

      const xpGained = syncXP();
      recordXPHistory(xpGained);
      save();
      render();
      break;
    }

    /* ── Assignment steppers ── */
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

      const xpGained = syncXP();
      recordXPHistory(xpGained);
      save();
      render();
      break;
    }

    /* ── Weekly toggles ── */
    case 'WEEK_TOGGLE': {
      const w = findWeek(payload.weekId);
      if (!w) break;

      // weekCompleted requires core completion check
      if (payload.field === 'weekCompleted' && payload.value && !isWeekCoreComplete(w)) {
        showToast('Complete all lecture core actions first.', 'warn');
        render(); // re-render to uncheck the box
        break;
      }

      w[payload.field] = payload.value;
      const xpGained = syncXP();
      recordXPHistory(xpGained);
      save();
      render();
      if (payload.field === 'weekCompleted' && payload.value) {
        showToast(`🎉 Week complete! +15 XP bonus`, 'success');
      }
      break;
    }

    /* ── Graph toggle ── */
    case 'TOGGLE_GRAPH':
      graphVisible = !graphVisible;
      document.getElementById('graph-section').classList.toggle('hidden', !graphVisible);
      document.getElementById('btn-graph').textContent = graphVisible ? '▲ Hide Graph' : '▼ XP Graph';
      if (graphVisible) {
        setTimeout(() => renderXPGraph(program.xpHistory), 50);
      }
      break;

    default:
      console.warn('[App] Unknown action:', action);
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
    weeklyMemoryNote:   false,
    weeklyFinalNote:    false,
    weekCompleted:      false,
    xpEarned:           0
  };
  program.weeks.push(week);
  expandedWeeks.add(week.weekId); // auto-expand new week
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

/**
 * Recalculate total XP, update level.
 * @returns {number} XP delta (gained since last call)
 */
function syncXP() {
  const prevXP    = program.totalXP;
  program.totalXP = recalculateTotalXP(program);
  program.level   = getLevel(program.totalXP);
  return Math.max(0, program.totalXP - prevXP);
}

/**
 * Record XP gained today in xpHistory.
 * @param {number} gained
 */
function recordXPHistory(gained) {
  if (gained <= 0) return;
  const today = todayISO();
  program.xpHistory[today] = (program.xpHistory[today] || 0) + gained;

  // Trim history older than 365 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const key of Object.keys(program.xpHistory)) {
    if (key < cutoffStr) delete program.xpHistory[key];
  }
}

/** Save to localStorage */
function save() {
  saveProgram(program);
}

/** Shorthand: syncXP + save + render, with optional toast */
function commit(toastMsg) {
  syncXP();
  save();
  render();
  if (toastMsg) showToast(toastMsg, 'info');
}

/** Full re-render cycle */
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

  // Redraw graph on window resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (graphVisible) renderXPGraph(program.xpHistory);
    }, 150);
  });
}
