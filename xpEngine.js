/**
 * xpEngine.js — XP Calculation Engine
 *
 * Pure functions only. No DOM, no localStorage.
 * All XP recalculated from scratch every time — no double-counting possible.
 *
 * XP Rules:
 *   Per Lecture:
 *     Watched          +5  (once)
 *     Memory Note      +7  (once)
 *     Activity Q       +1  per question done
 *     Final Note       +5  (once)
 *     Revision         +10 per revision (stackable, no cap)
 *   Per Week:
 *     Practice Q       +2  per question done
 *     Graded Q         +2  per question done
 *     Weekly Memory    +10 (once)
 *     Weekly Final     +10 (once)
 *     Week Complete    +15 (only when all lecture core actions done)
 */

export const XP = {
  LECTURE_WATCH:     5,
  LECTURE_MEMORY:    7,
  LECTURE_ACTIVITY:  1,
  LECTURE_FINAL:     5,
  LECTURE_REVISION:  10,
  PRACTICE_Q:        2,
  GRADED_Q:          2,
  WEEKLY_MEMORY:     10,
  WEEKLY_FINAL:      10,
  WEEK_COMPLETE:     15,
  XP_PER_LEVEL:      250,
  MAX_FREEZES:       3    // maximum streak freezes you can hold
};

/**
 * Recompute XP for all weeks. Mutates lec.xpEarned and week.xpEarned
 * in-place for display, returns grand total for program.totalXP.
 */
export function recalculateTotalXP(program) {
  let grand = 0;

  for (const week of program.weeks) {
    let weekTotal = 0;
    let coreComplete = week.lectures.length > 0;

    for (const lec of week.lectures) {
      const xp = calcLectureXP(lec);
      lec.xpEarned = xp;
      weekTotal += xp;
      if (!lec.watched || !lec.memoryNote || !lec.finalNote) coreComplete = false;
    }

    const pd = clamp(week.practiceAssignment.doneQuestions, 0, week.practiceAssignment.totalQuestions);
    const gd = clamp(week.gradedAssignment.doneQuestions,   0, week.gradedAssignment.totalQuestions);
    weekTotal += pd * XP.PRACTICE_Q + gd * XP.GRADED_Q;

    if (week.weeklyMemoryNote) weekTotal += XP.WEEKLY_MEMORY;
    if (week.weeklyFinalNote)  weekTotal += XP.WEEKLY_FINAL;
    if (week.weekCompleted && coreComplete) weekTotal += XP.WEEK_COMPLETE;

    week.xpEarned = weekTotal;
    grand += weekTotal;
  }

  return grand;
}

/** XP for a single lecture */
export function calcLectureXP(lec) {
  let xp = 0;
  if (lec.watched)    xp += XP.LECTURE_WATCH;
  if (lec.memoryNote) xp += XP.LECTURE_MEMORY;
  xp += clamp(lec.activityDone, 0, lec.activityTotal) * XP.LECTURE_ACTIVITY;
  if (lec.finalNote)  xp += XP.LECTURE_FINAL;
  xp += (lec.revisionCount || 0) * XP.LECTURE_REVISION;
  return xp;
}

/** True only if every lecture in the week has all 3 core actions done */
export function isWeekCoreComplete(week) {
  if (!week.lectures || week.lectures.length === 0) return false;
  return week.lectures.every(l => l.watched && l.memoryNote && l.finalNote);
}

/** XP breakdown for display */
export function weekXPBreakdown(week) {
  const lectureXP    = week.lectures.reduce((s, l) => s + (l.xpEarned || 0), 0);
  const practiceXP   = clamp(week.practiceAssignment.doneQuestions, 0, week.practiceAssignment.totalQuestions) * XP.PRACTICE_Q;
  const gradedXP     = clamp(week.gradedAssignment.doneQuestions,   0, week.gradedAssignment.totalQuestions)   * XP.GRADED_Q;
  const memoryXP     = week.weeklyMemoryNote ? XP.WEEKLY_MEMORY : 0;
  const finalXP      = week.weeklyFinalNote  ? XP.WEEKLY_FINAL  : 0;
  const completionXP = (week.weekCompleted && isWeekCoreComplete(week)) ? XP.WEEK_COMPLETE : 0;
  return { lectureXP, practiceXP, gradedXP, memoryXP, finalXP, completionXP,
           total: lectureXP + practiceXP + gradedXP + memoryXP + finalXP + completionXP };
}

/** Level from total XP (1-indexed) */
export function getLevel(totalXP) {
  return Math.floor(totalXP / XP.XP_PER_LEVEL) + 1;
}

/** Progress within current level as 0–1 */
export function getLevelProgress(totalXP) {
  return (totalXP % XP.XP_PER_LEVEL) / XP.XP_PER_LEVEL;
}

/** XP needed to reach next level */
export function xpToNextLevel(totalXP) {
  return XP.XP_PER_LEVEL - (totalXP % XP.XP_PER_LEVEL);
}

/** Week completion progress as 0–1 */
export function weekProgress(week) {
  let done = 0, total = 0;
  for (const lec of week.lectures) {
    total += 3;
    if (lec.watched)    done++;
    if (lec.memoryNote) done++;
    if (lec.finalNote)  done++;
    if (lec.activityTotal > 0) {
      total += lec.activityTotal;
      done  += clamp(lec.activityDone, 0, lec.activityTotal);
    }
  }
  const pT = week.practiceAssignment.totalQuestions;
  const gT = week.gradedAssignment.totalQuestions;
  total += pT + gT + 2;
  done  += clamp(week.practiceAssignment.doneQuestions, 0, pT);
  done  += clamp(week.gradedAssignment.doneQuestions,   0, gT);
  if (week.weeklyMemoryNote) done++;
  if (week.weeklyFinalNote)  done++;
  return total > 0 ? done / total : 0;
}

/**
 * Update streak. Handles streak freeze automatically.
 * If a day was missed AND freezes are available, the freeze is consumed
 * and streak is preserved.
 *
 * @param {Object} program
 * @param {string} today - YYYY-MM-DD
 * @returns {{ streak, bestStreak, lastActiveDate, streakFreezes, freezeUsed }}
 */
export function updateStreak(program, today) {
  const last     = program.lastActiveDate;
  const freezes  = program.streakFreezes || 0;
  const best     = program.bestStreak    || 0;

  if (!last) {
    // First ever open
    return { streak: 1, bestStreak: Math.max(1, best),
             lastActiveDate: today, streakFreezes: freezes, freezeUsed: false };
  }

  if (last === today) {
    // Already counted today
    return { streak: program.streak, bestStreak: best,
             lastActiveDate: today, streakFreezes: freezes, freezeUsed: false };
  }

  const diffDays = Math.round((new Date(today) - new Date(last)) / 86400000);

  if (diffDays === 1) {
    // Perfect — consecutive day
    const newStreak = program.streak + 1;
    return { streak: newStreak, bestStreak: Math.max(newStreak, best),
             lastActiveDate: today, streakFreezes: freezes, freezeUsed: false };
  }

  if (diffDays === 2 && freezes > 0) {
    // Missed exactly 1 day AND has a freeze — auto-use it
    const newStreak = program.streak + 1;
    return { streak: newStreak, bestStreak: Math.max(newStreak, best),
             lastActiveDate: today, streakFreezes: freezes - 1, freezeUsed: true };
  }

  // Streak broken
  return { streak: 1, bestStreak: best,
           lastActiveDate: today, streakFreezes: freezes, freezeUsed: false };
}

/**
 * Compute lifetime stats across the whole program.
 * Called once per render for the stats panel.
 */
export function computeLifetimeStats(program) {
  let totalLectures = 0, completedLectures = 0;
  let totalRevisions = 0;
  let totalActivityDone = 0, totalActivityTotal = 0;
  let totalPracticeDone = 0, totalGradedDone = 0;
  let weeksCompleted = 0;

  for (const week of program.weeks) {
    if (week.weekCompleted) weeksCompleted++;
    totalPracticeDone += clamp(week.practiceAssignment.doneQuestions, 0, week.practiceAssignment.totalQuestions);
    totalGradedDone   += clamp(week.gradedAssignment.doneQuestions,   0, week.gradedAssignment.totalQuestions);

    for (const lec of week.lectures) {
      totalLectures++;
      if (lec.watched && lec.memoryNote && lec.finalNote) completedLectures++;
      totalRevisions    += lec.revisionCount || 0;
      totalActivityDone += clamp(lec.activityDone, 0, lec.activityTotal);
      totalActivityTotal += lec.activityTotal || 0;
    }
  }

  // XP this month
  const monthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const xpThisMonth = Object.entries(program.xpHistory)
    .filter(([d]) => d.startsWith(monthPrefix))
    .reduce((s, [, v]) => s + v, 0);

  // Active days total (days with any XP)
  const activeDays = Object.values(program.xpHistory).filter(v => v > 0).length;

  return {
    totalWeeks:       program.weeks.length,
    weeksCompleted,
    totalLectures,
    completedLectures,
    totalRevisions,
    totalActivityDone,
    totalActivityTotal,
    totalPracticeDone,
    totalGradedDone,
    xpThisMonth,
    activeDays,
    bestStreak:    program.bestStreak || 0,
    streakFreezes: program.streakFreezes || 0
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n || 0));
}
