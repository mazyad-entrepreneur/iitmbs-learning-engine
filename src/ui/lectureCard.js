/**
 * src/ui/lectureCard.js — Lecture Card Components
 *
 * Builds the per-lecture DOM cards inside a week's LECTURES section.
 * All events dispatched upward via dispatch(action, payload).
 *
 * No state held here — pure DOM builder functions.
 */

import { XP } from '../../xpEngine.js';

/**
 * Build the full LECTURES section for one week.
 */
export function buildLectureSection(week, dispatch, expandedLectures) {
    const section = el('div', 'week-section');

    const sHeader = el('div', 'section-header');
    const sTitle = el('span', 'section-title');
    sTitle.textContent = 'LECTURES';
    sHeader.appendChild(sTitle);

    const addBtn = el('button', 'btn-secondary-sm');
    addBtn.textContent = '+ Add Lecture';
    sHeader.appendChild(addBtn);
    section.appendChild(sHeader);

    if (week.lectures.length === 0) {
        const empty = el('p', 'section-empty');
        empty.textContent = 'No lectures yet. Add one above.';
        section.appendChild(empty);
    } else {
        const list = el('div', 'lecture-list');
        for (const lec of week.lectures) {
            list.appendChild(buildLectureCard(lec, week.weekId, dispatch, expandedLectures));
        }
        section.appendChild(list);
    }

    addBtn.addEventListener('click', () => dispatch('ADD_LECTURE', { weekId: week.weekId }));
    return section;
}

/**
 * Build a single collapsible lecture card.
 */
function buildLectureCard(lec, weekId, dispatch, expandedLectures) {
    const isOpen = expandedLectures.has(lec.lectureId);
    const card = el('div', `lecture-card${isOpen ? ' open' : ''}`);

    /* ── Summary row (always visible) ── */
    const summary = el('div', 'lecture-summary');

    const toggleBtn = el('button', 'lecture-toggle');
    const chev = el('span', `chevron${isOpen ? ' open' : ''}`);
    chev.textContent = '›';
    toggleBtn.appendChild(chev);
    summary.appendChild(toggleBtn);

    const nameSpan = el('span', 'lecture-name');
    nameSpan.textContent = lec.lectureName;
    summary.appendChild(nameSpan);

    /* Status pills: W M F + activity count + revision count + XP */
    const pills = el('div', 'lecture-quick-stats');
    pills.appendChild(makePill('W', lec.watched, 'pill-green', 'Watched'));
    pills.appendChild(makePill('M', lec.memoryNote, 'pill-amber', 'Memory Note'));
    pills.appendChild(makePill('F', lec.finalNote, 'pill-blue', 'Final Note'));

    if (lec.activityTotal > 0) {
        const p = el('span', 'stat-pill');
        p.textContent = `${lec.activityDone}/${lec.activityTotal} act.`;
        pills.appendChild(p);
    }
    if ((lec.revisionCount || 0) > 0) {
        const p = el('span', 'stat-pill pill-purple');
        p.textContent = `×${lec.revisionCount} rev.`;
        pills.appendChild(p);
    }

    const xpSp = el('span', 'lecture-xp');
    xpSp.textContent = `${lec.xpEarned || 0} XP`;
    pills.appendChild(xpSp);
    summary.appendChild(pills);

    const delBtn = el('button', 'btn-delete-sm');
    delBtn.title = 'Delete lecture'; delBtn.textContent = '✕';
    summary.appendChild(delBtn);
    card.appendChild(summary);

    /* ── Detail panel (shown when expanded) ── */
    const detail = el('div', `lecture-detail${isOpen ? ' open' : ''}`);
    detail.appendChild(buildLectureDetail(lec, weekId, dispatch));
    card.appendChild(detail);

    /* ── Events ── */
    const doToggle = () => dispatch('TOGGLE_LECTURE', { lectureId: lec.lectureId });
    toggleBtn.addEventListener('click', doToggle);
    nameSpan.addEventListener('click', doToggle);
    delBtn.addEventListener('click', e => {
        e.stopPropagation();
        dispatch('DELETE_LECTURE', { weekId, lectureId: lec.lectureId });
    });

    return card;
}

/**
 * Build the expanded detail panel inside a lecture card.
 */
function buildLectureDetail(lec, weekId, dispatch) {
    const wrap = el('div', 'lecture-detail-inner');

    /* Core checkboxes: Watched, Memory Note, Final Note */
    const actions = el('div', 'lecture-actions');
    actions.appendChild(checkRow('Watched', `+${XP.LECTURE_WATCH} XP`, lec.watched,
        v => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'watched', value: v })));
    actions.appendChild(checkRow('Memory Note', `+${XP.LECTURE_MEMORY} XP`, lec.memoryNote,
        v => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'memoryNote', value: v })));
    actions.appendChild(checkRow('Final Note', `+${XP.LECTURE_FINAL} XP`, lec.finalNote,
        v => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'finalNote', value: v })));
    wrap.appendChild(actions);

    /* Activity questions stepper */
    wrap.appendChild(stepperRow(
        'Activity Questions',
        `${lec.activityDone} / ${lec.activityTotal}`,
        `+${XP.LECTURE_ACTIVITY} ea.`,
        [
            { label: '−T', action: 'actTotal-dec', title: 'Remove from total' },
            { label: '+T', action: 'actTotal-inc', title: 'Add to total' },
            { label: '+1', action: 'actDone-inc', title: 'Mark one done', cls: 'btn-stepper-done', disabled: lec.activityDone >= lec.activityTotal },
            { label: '↩', action: 'actDone-dec', title: 'Undo one', cls: 'btn-stepper-undo', disabled: lec.activityDone <= 0 }
        ],
        a => dispatch('LECTURE_STEP', { weekId, lectureId: lec.lectureId, action: a })
    ));

    /* Revisions stepper */
    wrap.appendChild(stepperRow(
        'Revisions',
        `${lec.revisionCount || 0} done`,
        `+${XP.LECTURE_REVISION} ea.`,
        [
            { label: '+1', action: 'rev-inc', title: 'Log a revision', cls: 'btn-stepper-done' },
            { label: '↩', action: 'rev-dec', title: 'Remove last', cls: 'btn-stepper-undo', disabled: (lec.revisionCount || 0) <= 0 }
        ],
        a => dispatch('LECTURE_STEP', { weekId, lectureId: lec.lectureId, action: a })
    ));

    /* Quick notes textarea — auto-saves after 500ms idle */
    const notesWrap = el('div', 'notes-wrap');
    const notesLbl = el('label', 'notes-label');
    notesLbl.textContent = 'Quick Notes';
    const textarea = el('textarea', 'notes-textarea');
    textarea.placeholder = 'Jot anything about this lecture…';
    textarea.value = lec.notes || '';
    textarea.rows = 3;

    let saveTimer;
    textarea.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            dispatch('SAVE_LECTURE_NOTE', { weekId, lectureId: lec.lectureId, text: textarea.value });
        }, 500);
    });

    notesWrap.appendChild(notesLbl);
    notesWrap.appendChild(textarea);
    wrap.appendChild(notesWrap);

    /* Rename button */
    const renameRow = el('div', 'lecture-rename-row');
    const renameBtn = el('button', 'btn-secondary-sm');
    renameBtn.textContent = '✎ Rename';
    renameBtn.addEventListener('click', () => dispatch('RENAME_LECTURE', { weekId, lectureId: lec.lectureId }));
    renameRow.appendChild(renameBtn);
    wrap.appendChild(renameRow);

    return wrap;
}

/* ── Reusable builders (local) ── */

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

function stepperRow(labelText, countText, xpText, btns, onClick) {
    const row = el('div', 'activity-row');
    const lbl = el('span', 'activity-label'); lbl.textContent = labelText; row.appendChild(lbl);
    const cnt = el('span', 'activity-count'); cnt.textContent = countText; row.appendChild(cnt);
    const ctrl = el('div', 'activity-controls');
    for (const b of btns) {
        const btn = el('button', `btn-stepper${b.cls ? ' ' + b.cls : ''}`);
        btn.textContent = b.label; btn.title = b.title || '';
        if (b.disabled) btn.disabled = true;
        btn.addEventListener('click', () => onClick(b.action));
        ctrl.appendChild(btn);
    }
    row.appendChild(ctrl);
    const xpSp = el('span', 'action-xp'); xpSp.textContent = xpText; row.appendChild(xpSp);
    return row;
}

function makePill(text, active, activeCls, title) {
    const p = el('span', `stat-pill ${active ? activeCls : 'pill-dim'}`);
    p.textContent = text; p.title = title; return p;
}

function el(tag, cls = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}
