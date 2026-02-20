/**
 * src/ui/index.js — UI Module Coordinator
 *
 * This file is the single public interface for all UI rendering.
 * app.js imports only from here — never from sub-modules directly.
 *
 * Module map:
 *   renderHeader  — header bar (level, XP bar, streak, freeze)
 *   renderStats   — lifetime stats panel grid
 *   renderWeeks   — full weeks list (delegates to weekCard.js)
 *   renderXPGraph — canvas bar chart (delegates to graph.js)
 *   showPromptModal / showConfirmModal / showToast — modals.js
 */

import { XP, getLevelProgress, xpToNextLevel, computeLifetimeStats } from '../../xpEngine.js';
import { buildWeekCard } from './weekCard.js';
import { renderXPGraph } from './graph.js';
import { showPromptModal, showConfirmModal, showToast, removeModal } from './modals.js';

/* Re-export modal/toast helpers so app.js can import them from one place */
export { renderXPGraph, showPromptModal, showConfirmModal, showToast, removeModal };

/* ── Header ── */
export function renderHeader(program) {
    const { totalXP, level, streak, streakFreezes } = program;
    const pct = getLevelProgress(totalXP);

    setTxt('hdr-level', `LVL ${level}`);
    setTxt('hdr-xp', `${totalXP} XP · ${xpToNextLevel(totalXP)} to next`);
    setTxt('hdr-streak', `🔥 ${streak}d`);

    const bar = document.getElementById('hdr-xp-bar');
    if (bar) bar.style.width = `${(pct * 100).toFixed(1)}%`;

    const freezeEl = document.getElementById('hdr-freeze');
    if (freezeEl) {
        freezeEl.textContent = `❄️ ×${streakFreezes || 0}`;
        freezeEl.title = `Streak Freezes: ${streakFreezes || 0}/${XP.MAX_FREEZES}. Earned by completing weeks. Auto-used if you miss a day.`;
        freezeEl.classList.toggle('freeze-empty', !streakFreezes);
    }
}

/* ── Lifetime Stats Panel ── */
export function renderStats(program) {
    const panel = document.getElementById('stats-section');
    if (!panel) return;

    const s = computeLifetimeStats(program);
    panel.innerHTML = '';

    const title = el('div', 'stats-title');
    title.textContent = 'LIFETIME STATS';
    panel.appendChild(title);

    const grid = el('div', 'stats-grid');

    const cards = [
        { label: 'Total XP', value: program.totalXP, icon: '⚡' },
        { label: 'Level', value: program.level, icon: '🏆' },
        { label: 'Best Streak', value: `${s.bestStreak}d`, icon: '🔥' },
        { label: 'Active Days', value: s.activeDays, icon: '📅' },
        { label: 'XP This Month', value: s.xpThisMonth, icon: '📈' },
        { label: 'Weeks Done', value: `${s.weeksCompleted}/${s.totalWeeks}`, icon: '📚' },
        { label: 'Lectures Core Done', value: `${s.completedLectures}/${s.totalLectures}`, icon: '🎓' },
        { label: 'Total Revisions', value: s.totalRevisions, icon: '🔁' },
        { label: 'Activity Qs Done', value: `${s.totalActivityDone}/${s.totalActivityTotal}`, icon: '✏️' },
        { label: 'Practice Qs Done', value: s.totalPracticeDone, icon: '📝' },
        { label: 'Graded Qs Done', value: s.totalGradedDone, icon: '✅' },
        { label: 'Streak Freezes', value: `${s.streakFreezes}/${XP.MAX_FREEZES}`, icon: '❄️' },
    ];

    for (const c of cards) {
        const card = el('div', 'stat-card');
        const icon = el('span', 'stat-icon'); icon.textContent = c.icon;
        const val = el('div', 'stat-value'); val.textContent = c.value;
        const lbl = el('div', 'stat-label'); lbl.textContent = c.label;
        card.appendChild(icon); card.appendChild(val); card.appendChild(lbl);
        grid.appendChild(card);
    }

    panel.appendChild(grid);
}

/* ── Weeks List ── */
export function renderWeeks(program, dispatch, expandedWeeks, expandedLectures) {
    const container = document.getElementById('weeks-container');
    if (!container) return;

    container.innerHTML = '';

    if (program.weeks.length === 0) {
        const empty = el('div', 'empty-state');
        empty.innerHTML = `<span class="empty-icon">Σ</span>
      <p>No weeks yet. Add your first module to begin.</p>`;
        container.appendChild(empty);
        return;
    }

    for (const week of program.weeks) {
        container.appendChild(buildWeekCard(week, dispatch, expandedWeeks, expandedLectures));
    }
}

/* ── DOM utils (local) ── */
function el(tag, cls = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}

function setTxt(id, text) {
    const e = document.getElementById(id);
    if (e) e.textContent = text;
}
