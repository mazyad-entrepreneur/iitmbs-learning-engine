/**
 * src/ui/weekCard.js — Week Card Components
 *
 * Builds the week card DOM, including:
 *   - Week header (name, progress bar, XP badge, edit/delete)
 *   - Assignment section (practice + graded steppers)
 *   - Weekly milestones section (memory note, final note, complete)
 *
 * Imports lecture section from lectureCard.js.
 * All events dispatched upward via dispatch(action, payload).
 */

import { XP, weekXPBreakdown, weekProgress, isWeekCoreComplete } from '../../xpEngine.js';
import { buildLectureSection } from './lectureCard.js';

/**
 * Build the full week card DOM element.
 */
export function buildWeekCard(week, dispatch, expandedWeeks, expandedLectures) {
    const isOpen = expandedWeeks.has(week.weekId);
    const progress = weekProgress(week);
    const coreOk = isWeekCoreComplete(week);
    const bd = weekXPBreakdown(week);

    const card = el('div', `week-card${week.weekCompleted ? ' week-done' : ''}`);

    /* ── Header ── */
    const header = el('div', 'week-header');

    const toggleBtn = el('button', 'week-toggle');
    toggleBtn.setAttribute('aria-label', 'Toggle week');
    const chev = el('span', `chevron${isOpen ? ' open' : ''}`);
    chev.textContent = '›';
    toggleBtn.appendChild(chev);
    header.appendChild(toggleBtn);

    const titleGroup = el('div', 'week-title-group');
    const nameSpan = el('span', 'week-name');
    nameSpan.textContent = week.weekName;
    titleGroup.appendChild(nameSpan);
    if (week.weekCompleted) {
        const badge = el('span', 'badge badge-done');
        badge.textContent = '✓ Done';
        titleGroup.appendChild(badge);
    }
    header.appendChild(titleGroup);

    const meta = el('div', 'week-meta');
    const xpBadge = el('span', 'week-xp');
    xpBadge.textContent = `${bd.total} XP`;
    const editBtn = el('button', 'btn-icon btn-edit');
    editBtn.title = 'Rename week'; editBtn.textContent = '✎';
    const delBtn = el('button', 'btn-icon btn-delete');
    delBtn.title = 'Delete week'; delBtn.textContent = '✕';
    meta.appendChild(xpBadge); meta.appendChild(editBtn); meta.appendChild(delBtn);
    header.appendChild(meta);

    /* Progress bar */
    const progRow = el('div', 'week-progress-row');
    const track = el('div', 'progress-bar-track');
    const fill = el('div', 'progress-bar-fill');
    fill.style.width = `${(progress * 100).toFixed(1)}%`;
    track.appendChild(fill);
    const pctLbl = el('span', 'progress-label');
    pctLbl.textContent = `${Math.round(progress * 100)}%`;
    progRow.appendChild(track); progRow.appendChild(pctLbl);
    header.appendChild(progRow);

    card.appendChild(header);

    /* ── Body (collapsed/expanded) ── */
    const body = el('div', `week-body${isOpen ? ' open' : ''}`);
    body.appendChild(buildLectureSection(week, dispatch, expandedLectures));
    body.appendChild(buildAssignmentSection(week, dispatch));
    body.appendChild(buildWeeklyMilestones(week, coreOk, dispatch));
    card.appendChild(body);

    /* ── Events ── */
    const doToggle = () => dispatch('TOGGLE_WEEK', { weekId: week.weekId });
    toggleBtn.addEventListener('click', doToggle);
    nameSpan.addEventListener('click', doToggle);
    editBtn.addEventListener('click', e => {
        e.stopPropagation();
        dispatch('EDIT_WEEK_NAME', { weekId: week.weekId });
    });
    delBtn.addEventListener('click', e => {
        e.stopPropagation();
        dispatch('DELETE_WEEK', { weekId: week.weekId });
    });

    return card;
}

/**
 * Build the ASSIGNMENTS section (practice + graded question trackers).
 */
function buildAssignmentSection(week, dispatch) {
    const section = el('div', 'week-section');
    const sH = el('div', 'section-header');
    const sT = el('span', 'section-title');
    sT.textContent = 'ASSIGNMENTS'; sH.appendChild(sT); section.appendChild(sH);

    section.appendChild(makeAssignmentRow(
        'Practice', 'practice',
        week.practiceAssignment.totalQuestions,
        week.practiceAssignment.doneQuestions,
        XP.PRACTICE_Q, week.weekId, dispatch
    ));
    section.appendChild(makeAssignmentRow(
        'Graded', 'graded',
        week.gradedAssignment.totalQuestions,
        week.gradedAssignment.doneQuestions,
        XP.GRADED_Q, week.weekId, dispatch
    ));

    return section;
}

function makeAssignmentRow(label, type, total, done, xpEach, weekId, dispatch) {
    const row = el('div', 'assignment-row');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const lbl = el('span', 'asgn-label'); lbl.textContent = label; row.appendChild(lbl);
    const trk = el('div', 'asgn-progress-track');
    const fl = el('div', 'asgn-progress-fill'); fl.style.width = `${pct}%`;
    trk.appendChild(fl); row.appendChild(trk);
    const cnt = el('span', 'asgn-count'); cnt.textContent = `${done}/${total}`; row.appendChild(cnt);
    const ctrl = el('div', 'asgn-controls');

    const btns = [
        { label: '−T', dir: 'total-dec' },
        { label: '+T', dir: 'total-inc' },
        { label: '+1', dir: 'done-inc', cls: 'btn-stepper-done', disabled: done >= total },
        { label: '↩', dir: 'done-dec', cls: 'btn-stepper-undo', disabled: done <= 0 }
    ];
    for (const b of btns) {
        const btn = el('button', `btn-stepper${b.cls ? ' ' + b.cls : ''}`);
        btn.textContent = b.label;
        if (b.disabled) btn.disabled = true;
        btn.addEventListener('click', () => dispatch('ASSIGNMENT_STEP', { weekId, type, dir: b.dir }));
        ctrl.appendChild(btn);
    }
    row.appendChild(ctrl);

    const xpSp = el('span', 'action-xp'); xpSp.textContent = `+${xpEach} ea.`; row.appendChild(xpSp);
    return row;
}

/**
 * Build the WEEKLY MILESTONES section.
 * "Mark Week Complete" is locked until all lecture core actions are done.
 */
function buildWeeklyMilestones(week, coreOk, dispatch) {
    const section = el('div', 'week-section');
    const sH = el('div', 'section-header');
    const sT = el('span', 'section-title');
    sT.textContent = 'WEEKLY MILESTONES'; sH.appendChild(sT); section.appendChild(sH);

    const div = el('div', 'lecture-actions');
    div.appendChild(checkRow('Weekly Memory Note', `+${XP.WEEKLY_MEMORY} XP`, week.weeklyMemoryNote,
        v => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weeklyMemoryNote', value: v })));
    div.appendChild(checkRow('Weekly Final Note', `+${XP.WEEKLY_FINAL} XP`, week.weeklyFinalNote,
        v => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weeklyFinalNote', value: v })));
    div.appendChild(checkRow(
        coreOk ? 'Mark Week Complete' : 'Mark Week Complete · finish all lecture core actions first',
        `+${XP.WEEK_COMPLETE} XP`,
        week.weekCompleted,
        v => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weekCompleted', value: v }),
        !coreOk
    ));
    section.appendChild(div);
    return section;
}

/* ── Local helpers (same as in other ui modules) ── */

function checkRow(labelText, xpText, checked, onChange, locked = false) {
    const row = el('div', `action-row${checked ? ' checked' : ''}${locked ? ' row-locked' : ''}`);
    const box = el('span', 'checkbox-box');
    const lbl = el('span', 'action-label'); lbl.textContent = labelText;
    const xp = el('span', 'action-xp'); xp.textContent = xpText;
    row.appendChild(box); row.appendChild(lbl); row.appendChild(xp);
    if (!locked) {
        let state = checked;
        row.addEventListener('click', () => {
            state = !state;
            row.classList.toggle('checked', state);
            onChange(state);
        });
    }
    return row;
}

function el(tag, cls = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}
