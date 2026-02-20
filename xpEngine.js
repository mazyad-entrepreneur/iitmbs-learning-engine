/**
 * xpEngine.js — XP Calculation Engine
 *
 * Pure functions only. No DOM, no localStorage.
 * All XP is recalculated from scratch on every state change to guarantee
 * idempotency and eliminate any risk of double-counting.
 *
 * XP Rules:
 *   Lecture:
 *     - Watch:              +5  (once per lecture)
 *     - Memory Note:        +7  (once per lecture)
 *     - Activity question:  +1  per question completed
 *     - Final Note:         +5  (once per lecture)
 *     - Revision:           +10 per revision done (stackable, no cap)
 *   Weekly:
 *     - Practice question:  +2  per question completed
 *     - Graded question:    +2  per question completed
 *     - Weekly Memory Note: +10 (once per week)
 *     - Weekly Final Note:  +10 (once per week)
 *     - Week Completion:    +15 (only if all lecture core actions done)
 */

export const XP = {
  LECTURE_WATCH:     5,
  LECTURE_MEMORY:    7,
  LECTURE_ACTIVITY:  1,
  LECTURE_FINAL:     5,
  LECTURE_REVISION:  10,  // per revision, stackable
  PRACTICE_Q:        2,
  GRADED_Q:          2,
  WEEKLY_MEMORY:     10,
  WEEKLY_FINAL:      10,
  WEEK_COMPLETE:     15,
  XP_PER_LEVEL:      250
};

/**
 * Fully recompute XP for every lecture and week, then return global totals.
 * Mutates week.xpEarned and lec.xpEarned in-place for display.
 * Callers should use the returned value for program.totalXP.
 *
 * @param {Object} program
 * @returns {number} total XP across all weeks
 */
export function recalculateTotalXP(program) {
  let grandTotal = 0;

  for (const week of program.weeks) {
    let weekTotal = 0;
    let allCoreComplete = week.lectures.length > 0;

    /* ── Lecture XP ── */
    for (const lec of week.lectures) {
      const lecXP = calcLectureXP(lec);
      lec.xpEarned = lecXP;
      weekTotal += lecXP;

      // Core = watched + memoryNote + finalNote
      if (!lec.watched || !lec.memoryNote || !lec.finalNote) {
        allCoreComplete = false;
      }
    }

    /* ── Assignment XP ── */
    const practiceDone = clamp(week.practiceAssignment.doneQuestions, 0, week.practiceAssignment.totalQuestions);
    const gradedDone   = clamp(week.gradedAssignment.doneQuestions,   0, week.gradedAssignment.totalQuestions);
    weekTotal += practiceDone * XP.PRACTICE_Q;
    weekTotal += gradedDone   * XP.GRADED_Q;

    /* ── Weekly notes XP ── */
    if (week.weeklyMemoryNote) weekTotal += XP.WEEKLY_MEMORY;
    if (week.weeklyFinalNote)  weekTotal += XP.WEEKLY_FINAL;

    /* ── Week completion bonus ── */
    // Requires allCoreComplete AND weekCompleted checkbox ticked
    if (week.weekCompleted && allCoreComplete) {
      weekTotal += XP.WEEK_COMPLETE;
    }

    week.xpEarned = weekTotal;
    grandTotal += weekTotal;
  }

  return grandTotal;
}

/**
 * Calculate XP for a single lecture (all components).
 * @param {Object} lec
 * @returns {number}
 */
export function calcLectureXP(lec) {
  let xp = 0;
  if (lec.watched)    xp += XP.LECTURE_WATCH;
  if (lec.memoryNote) xp += XP.LECTURE_MEMORY;
  xp += clamp(lec.activityDone, 0, lec.activityTotal) * XP.LECTURE_ACTIVITY;
  if (lec.finalNote)  xp += XP.LECTURE_FINAL;
  xp += (lec.revisionCount || 0) * XP.LECTURE_REVISION;
  return xp;
}

/**
 * Check if all lecture core actions in a week are complete.
 * Core = watched + memoryNote + finalNote for every lecture.
 * A week with zero lectures cannot be "core complete".
 * @param {Object} week
 * @returns {boolean}
 */
export function isWeekCoreComplete(week) {
  if (!week.lectures || week.lectures.length === 0) return false;
  return week.lectures.every(lec => lec.watched && lec.memoryNote && lec.finalNote);
}

/**
 * Compute XP breakdown for a week (for display).
 * @param {Object} week
 * @returns {Object}
 */
export function weekXPBreakdown(week) {
  const lectureXP    = week.lectures.reduce((s, l) => s + (l.xpEarned || 0), 0);
  const practiceXP   = clamp(week.practiceAssignment.doneQuestions, 0, week.practiceAssignment.totalQuestions) * XP.PRACTICE_Q;
  const gradedXP     = clamp(week.gradedAssignment.doneQuestions,   0, week.gradedAssignment.totalQuestions)   * XP.GRADED_Q;
  const memoryXP     = week.weeklyMemoryNote ? XP.WEEKLY_MEMORY : 0;
  const finalXP      = week.weeklyFinalNote  ? XP.WEEKLY_FINAL  : 0;
  const completionXP = (week.weekCompleted && isWeekCoreComplete(week)) ? XP.WEEK_COMPLETE : 0;

  return {
    lectureXP, practiceXP, gradedXP, memoryXP, finalXP, completionXP,
    total: lectureXP + practiceXP + gradedXP + memoryXP + finalXP + completionXP
  };
}

/**
 * Compute level from total XP (1-indexed).
 */
export function getLevel(totalXP) {
  return Math.floor(totalXP / XP.XP_PER_LEVEL) + 1;
}

/**
 * Progress within current level as 0–1.
 */
export function getLevelProgress(totalXP) {
  return (totalXP % XP.XP_PER_LEVEL) / XP.XP_PER_LEVEL;
}

/**
 * XP needed to reach next level.
 */
export function xpToNextLevel(totalXP) {
  return XP.XP_PER_LEVEL - (totalXP % XP.XP_PER_LEVEL);
}

/**
 * Week completion progress as a 0–1 fraction.
 * Counts all boolean flags + question counts.
 */
export function weekProgress(week) {
  let done = 0, total = 0;

  for (const lec of week.lectures) {
    // Core booleans: watched, memoryNote, finalNote
    total += 3;
    if (lec.watched)    done++;
    if (lec.memoryNote) done++;
    if (lec.finalNote)  done++;

    if (lec.activityTotal > 0) {
      total += lec.activityTotal;
      done  += clamp(lec.activityDone, 0, lec.activityTotal);
    }
  }

  const pTotal = week.practiceAssignment.totalQuestions;
  const gTotal = week.gradedAssignment.totalQuestions;
  total += pTotal + gTotal + 2; // +2 for weekly memory + final notes
  done  += clamp(week.practiceAssignment.doneQuestions, 0, pTotal);
  done  += clamp(week.gradedAssignment.doneQuestions,   0, gTotal);
  if (week.weeklyMemoryNote) done++;
  if (week.weeklyFinalNote)  done++;

  return total > 0 ? done / total : 0;
}

/**
 * Update streak. Returns { streak, lastActiveDate }.
 */
export function updateStreak(program, today) {
  const last = program.lastActiveDate;
  if (!last) return { streak: 1, lastActiveDate: today };
  if (last === today) return { streak: program.streak, lastActiveDate: today };

  const diffDays = Math.round((new Date(today) - new Date(last)) / 86400000);
  if (diffDays === 1) return { streak: program.streak + 1, lastActiveDate: today };
  return { streak: 1, lastActiveDate: today };
}

/** Clamp n between lo and hi */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n || 0));
}
