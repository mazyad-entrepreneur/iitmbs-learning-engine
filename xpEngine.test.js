/**
 * xpEngine.test.js — Unit tests for the XP calculation engine
 *
 * Run with: node --test xpEngine.test.js
 * (Requires Node.js 18+ — uses built-in test runner, zero dependencies)
 *
 * Tests cover:
 *   1. calcLectureXP    — XP per lecture item
 *   2. updateStreak     — all 4 date scenarios
 *   3. recalculateTotalXP — program-level XP sum
 *   4. getLevel / getLevelProgress / xpToNextLevel
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    calcLectureXP,
    recalculateTotalXP,
    updateStreak,
    isWeekCoreComplete,
    getLevel,
    getLevelProgress,
    xpToNextLevel,
    weekProgress,
    XP,
} from './xpEngine.js';

/* ─── Factories ─── */

function makeLec(overrides = {}) {
    return {
        watched: false,
        memoryNote: false,
        activityTotal: 0,
        activityDone: 0,
        finalNote: false,
        revisionCount: 0,
        xpEarned: 0,
        ...overrides,
    };
}

function makeAssignment(total = 0, done = 0) {
    return { totalQuestions: total, doneQuestions: done };
}

function makeWeek(overrides = {}) {
    return {
        lectures: [],
        practiceAssignment: makeAssignment(),
        gradedAssignment: makeAssignment(),
        weeklyMemoryNote: false,
        weeklyFinalNote: false,
        weekCompleted: false,
        xpEarned: 0,
        ...overrides,
    };
}

function makeProgram(weeks = []) {
    return { weeks, totalXP: 0, streak: 0, bestStreak: 0, streakFreezes: 0, lastActiveDate: null };
}

/* ─── calcLectureXP ─── */

test('calcLectureXP: empty lecture = 0 XP', () => {
    assert.equal(calcLectureXP(makeLec()), 0);
});

test('calcLectureXP: watched only = +5 XP', () => {
    assert.equal(calcLectureXP(makeLec({ watched: true })), XP.LECTURE_WATCH);
});

test('calcLectureXP: all core actions = 5+7+5 = 17 XP', () => {
    assert.equal(
        calcLectureXP(makeLec({ watched: true, memoryNote: true, finalNote: true })),
        XP.LECTURE_WATCH + XP.LECTURE_MEMORY + XP.LECTURE_FINAL
    );
});

test('calcLectureXP: activity questions capped at total', () => {
    // activityDone > activityTotal should be clamped to total
    const xp = calcLectureXP(makeLec({ activityTotal: 3, activityDone: 10 }));
    assert.equal(xp, 3 * XP.LECTURE_ACTIVITY);
});

test('calcLectureXP: revisions are stackable', () => {
    const xp = calcLectureXP(makeLec({ revisionCount: 4 }));
    assert.equal(xp, 4 * XP.LECTURE_REVISION);
});

test('calcLectureXP: full lecture (all actions + 5 activity + 2 revisions)', () => {
    const expected =
        XP.LECTURE_WATCH + XP.LECTURE_MEMORY + XP.LECTURE_FINAL +
        5 * XP.LECTURE_ACTIVITY + 2 * XP.LECTURE_REVISION;
    const xp = calcLectureXP(makeLec({
        watched: true, memoryNote: true, finalNote: true,
        activityTotal: 5, activityDone: 5, revisionCount: 2,
    }));
    assert.equal(xp, expected);
});

/* ─── recalculateTotalXP ─── */

test('recalculateTotalXP: empty program = 0', () => {
    assert.equal(recalculateTotalXP(makeProgram()), 0);
});

test('recalculateTotalXP: one watched lecture', () => {
    const lec = makeLec({ watched: true });
    const week = makeWeek({ lectures: [lec] });
    assert.equal(recalculateTotalXP(makeProgram([week])), XP.LECTURE_WATCH);
});

test('recalculateTotalXP: week complete bonus added', () => {
    const lec = makeLec({ watched: true, memoryNote: true, finalNote: true });
    const week = makeWeek({ lectures: [lec], weekCompleted: true });
    const expected = XP.LECTURE_WATCH + XP.LECTURE_MEMORY + XP.LECTURE_FINAL + XP.WEEK_COMPLETE;
    assert.equal(recalculateTotalXP(makeProgram([week])), expected);
});

test('recalculateTotalXP: week complete NOT awarded if core incomplete', () => {
    // watched only — memoryNote and finalNote missing
    const lec = makeLec({ watched: true });
    const week = makeWeek({ lectures: [lec], weekCompleted: true });
    // XP_WEEK_COMPLETE should NOT be included
    assert.equal(recalculateTotalXP(makeProgram([week])), XP.LECTURE_WATCH);
});

/* ─── updateStreak ─── */

test('updateStreak: first ever open starts streak at 1', () => {
    const p = makeProgram();
    const r = updateStreak(p, '2026-01-10');
    assert.equal(r.streak, 1);
    assert.equal(r.freezeUsed, false);
});

test('updateStreak: same day does not increment streak', () => {
    const p = { ...makeProgram(), streak: 5, lastActiveDate: '2026-01-10' };
    const r = updateStreak(p, '2026-01-10');
    assert.equal(r.streak, 5);
});

test('updateStreak: consecutive day increments streak', () => {
    const p = { ...makeProgram(), streak: 3, lastActiveDate: '2026-01-10' };
    const r = updateStreak(p, '2026-01-11');
    assert.equal(r.streak, 4);
    assert.equal(r.freezeUsed, false);
});

test('updateStreak: 2-day gap with freeze uses freeze and preserves streak', () => {
    const p = { ...makeProgram(), streak: 7, lastActiveDate: '2026-01-10', streakFreezes: 2 };
    const r = updateStreak(p, '2026-01-12');
    assert.equal(r.streak, 8);
    assert.equal(r.streakFreezes, 1);
    assert.equal(r.freezeUsed, true);
});

test('updateStreak: 2-day gap WITHOUT freeze resets streak', () => {
    const p = { ...makeProgram(), streak: 7, lastActiveDate: '2026-01-10', streakFreezes: 0 };
    const r = updateStreak(p, '2026-01-12');
    assert.equal(r.streak, 1);
    assert.equal(r.freezeUsed, false);
});

test('updateStreak: 3+ day gap always resets streak', () => {
    const p = { ...makeProgram(), streak: 10, lastActiveDate: '2026-01-01', streakFreezes: 3 };
    const r = updateStreak(p, '2026-01-10');
    assert.equal(r.streak, 1);
});

/* ─── Level helpers ─── */

test('getLevel: 0 XP = level 1', () => {
    assert.equal(getLevel(0), 1);
});

test('getLevel: 250 XP = level 2', () => {
    assert.equal(getLevel(250), 2);
});

test('getLevel: 499 XP = level 2', () => {
    assert.equal(getLevel(499), 2);
});

test('xpToNextLevel: 0 XP needs 250 more', () => {
    assert.equal(xpToNextLevel(0), 250);
});

test('xpToNextLevel: 100 XP needs 150 more', () => {
    assert.equal(xpToNextLevel(100), 150);
});

test('getLevelProgress: 125 XP = 0.5 through current level', () => {
    assert.equal(getLevelProgress(125), 0.5);
});

/* ─── isWeekCoreComplete ─── */

test('isWeekCoreComplete: false for empty lectures', () => {
    assert.equal(isWeekCoreComplete(makeWeek()), false);
});

test('isWeekCoreComplete: true when all lectures have W+M+F', () => {
    const lec = makeLec({ watched: true, memoryNote: true, finalNote: true });
    assert.equal(isWeekCoreComplete(makeWeek({ lectures: [lec] })), true);
});

test('isWeekCoreComplete: false when one lecture missing finalNote', () => {
    const lec = makeLec({ watched: true, memoryNote: true, finalNote: false });
    assert.equal(isWeekCoreComplete(makeWeek({ lectures: [lec] })), false);
});
