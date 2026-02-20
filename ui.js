/**
 * ui.js — DOM Rendering Module
 *
 * All functions receive data and a callback dispatch function.
 * Zero state held here — rendering is a pure function of program state.
 * dispatch(action, payload) is how UI events bubble up to app.js.
 *
 * CRITICAL RULE: Never use `innerHTML +=` on a node that has children
 * with event listeners — it destroys DOM references. Always use
 * appendChild() / createElement() for dynamic children.
 */

import { XP, weekXPBreakdown, weekProgress, getLevelProgress, xpToNextLevel, isWeekCoreComplete } from './xpEngine.js';

/* ────────────────────────────────────────────
   HEADER
──────────────────────────────────────────── */

export function renderHeader(program) {
  const { totalXP, level, streak } = program;
  const progress  = getLevelProgress(totalXP);
  const remaining = xpToNextLevel(totalXP);

  const lvlEl    = document.getElementById('hdr-level');
  const xpEl     = document.getElementById('hdr-xp');
  const barEl    = document.getElementById('hdr-xp-bar');
  const streakEl = document.getElementById('hdr-streak');

  if (lvlEl)    lvlEl.textContent = `LVL ${level}`;
  if (xpEl)     xpEl.textContent  = `${totalXP} XP · ${remaining} to next`;
  if (barEl)    barEl.style.width = `${(progress * 100).toFixed(1)}%`;
  if (streakEl) streakEl.textContent = `🔥 ${streak}d`;
}

/* ────────────────────────────────────────────
   WEEK LIST
──────────────────────────────────────────── */

export function renderWeeks(program, dispatch, expandedWeeks, expandedLectures) {
  const container = document.getElementById('weeks-container');
  if (!container) return;

  if (program.weeks.length === 0) {
    container.innerHTML = '';
    const empty = el('div', 'empty-state');
    empty.innerHTML = `<span class="empty-icon">Σ</span>
      <p>No weeks yet. Add your first module to begin.</p>`;
    container.appendChild(empty);
    return;
  }

  container.innerHTML = '';
  for (const week of program.weeks) {
    container.appendChild(buildWeekCard(week, dispatch, expandedWeeks, expandedLectures));
  }
}

/* ────────────────────────────────────────────
   WEEK CARD BUILDER
──────────────────────────────────────────── */

function buildWeekCard(week, dispatch, expandedWeeks, expandedLectures) {
  const isExpanded = expandedWeeks.has(week.weekId);
  const progress   = weekProgress(week);
  const coreOk     = isWeekCoreComplete(week);
  const bd         = weekXPBreakdown(week);

  const card = el('div', `week-card${week.weekCompleted ? ' week-done' : ''}`);
  card.dataset.weekId = week.weekId;

  /* ── Week Header ── */
  const header = el('div', 'week-header');

  // Toggle button
  const toggleBtn = el('button', 'week-toggle');
  toggleBtn.setAttribute('aria-expanded', isExpanded);
  toggleBtn.setAttribute('aria-label', 'Toggle week');
  const chevron = el('span', `chevron${isExpanded ? ' open' : ''}`);
  chevron.textContent = '›';
  toggleBtn.appendChild(chevron);
  header.appendChild(toggleBtn);

  // Title group
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

  // Meta: XP badge + edit + delete
  const meta = el('div', 'week-meta');
  const xpBadge = el('span', 'week-xp');
  xpBadge.textContent = `${bd.total} XP`;
  const editBtn = el('button', 'btn-icon btn-edit');
  editBtn.title = 'Rename week';
  editBtn.textContent = '✎';
  const delBtn = el('button', 'btn-icon btn-delete');
  delBtn.title = 'Delete week';
  delBtn.textContent = '✕';
  meta.appendChild(xpBadge);
  meta.appendChild(editBtn);
  meta.appendChild(delBtn);
  header.appendChild(meta);

  // Progress bar row
  const progRow = el('div', 'week-progress-row');
  const track = el('div', 'progress-bar-track');
  const fill  = el('div', 'progress-bar-fill');
  fill.style.width = `${(progress * 100).toFixed(1)}%`;
  track.appendChild(fill);
  const label = el('span', 'progress-label');
  label.textContent = `${Math.round(progress * 100)}%`;
  progRow.appendChild(track);
  progRow.appendChild(label);
  header.appendChild(progRow);

  card.appendChild(header);

  /* ── Week Body ── */
  const body = el('div', `week-body${isExpanded ? ' open' : ''}`);

  // 1. Lectures section
  body.appendChild(buildLectureSection(week, dispatch, expandedLectures));

  // 2. Assignments section
  body.appendChild(buildAssignmentSection(week, dispatch));

  // 3. Weekly milestones
  body.appendChild(buildWeeklyActions(week, coreOk, dispatch));

  card.appendChild(body);

  /* ── Wire header events ── */
  const doToggle = () => dispatch('TOGGLE_WEEK', { weekId: week.weekId });
  toggleBtn.addEventListener('click', doToggle);
  nameSpan.addEventListener('click',  doToggle);

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

/* ────────────────────────────────────────────
   LECTURE SECTION
   FIX: Never use innerHTML += here — always use DOM methods
   so event listeners on existing nodes are preserved.
──────────────────────────────────────────── */

function buildLectureSection(week, dispatch, expandedLectures) {
  const section = el('div', 'week-section');

  /* Section header row — built with DOM, not innerHTML */
  const sectionHeader = el('div', 'section-header');

  const sectionTitle = el('span', 'section-title');
  sectionTitle.textContent = 'LECTURES';
  sectionHeader.appendChild(sectionTitle);

  // "+ Add Lecture" button
  const addBtn = el('button', 'btn-add-lecture btn-secondary-sm');
  addBtn.textContent = '+ Add Lecture';
  sectionHeader.appendChild(addBtn);

  section.appendChild(sectionHeader);

  // Lectures list or empty message — appended AFTER sectionHeader
  if (week.lectures.length === 0) {
    const emptyMsg = el('p', 'section-empty');
    emptyMsg.textContent = 'No lectures. Add one above.';
    section.appendChild(emptyMsg);   // ← DOM append, NOT innerHTML +=
  } else {
    const lecList = el('div', 'lecture-list');
    for (const lec of week.lectures) {
      lecList.appendChild(buildLectureCard(lec, week.weekId, dispatch, expandedLectures));
    }
    section.appendChild(lecList);
  }

  // Wire "+ Add Lecture" click — addBtn is a live DOM reference
  addBtn.addEventListener('click', () => {
    dispatch('ADD_LECTURE', { weekId: week.weekId });
  });

  return section;
}

/* ────────────────────────────────────────────
   LECTURE CARD BUILDER
──────────────────────────────────────────── */

function buildLectureCard(lec, weekId, dispatch, expandedLectures) {
  const isExpanded = expandedLectures.has(lec.lectureId);

  const card = el('div', `lecture-card${isExpanded ? ' open' : ''}`);
  card.dataset.lectureId = lec.lectureId;

  /* ── Summary row (always visible) ── */
  const summary = el('div', 'lecture-summary');

  const toggleBtn = el('button', 'lecture-toggle');
  toggleBtn.setAttribute('aria-expanded', isExpanded);
  const chev = el('span', `chevron${isExpanded ? ' open' : ''}`);
  chev.textContent = '›';
  toggleBtn.appendChild(chev);
  summary.appendChild(toggleBtn);

  const nameSp = el('span', 'lecture-name');
  nameSp.textContent = lec.lectureName;
  summary.appendChild(nameSp);

  // Quick status pills
  const pills = el('div', 'lecture-quick-stats');
  pills.appendChild(makePill('W', lec.watched,    'pill-green', 'Watched'));
  pills.appendChild(makePill('M', lec.memoryNote, 'pill-amber', 'Memory Note'));
  pills.appendChild(makePill('F', lec.finalNote,  'pill-blue',  'Final Note'));
  if (lec.activityTotal > 0) {
    const actPill = el('span', 'stat-pill');
    actPill.textContent = `${lec.activityDone}/${lec.activityTotal} act.`;
    pills.appendChild(actPill);
  }
  if ((lec.revisionCount || 0) > 0) {
    const revPill = el('span', 'stat-pill pill-purple');
    revPill.textContent = `×${lec.revisionCount} rev.`;
    pills.appendChild(revPill);
  }
  const xpSp = el('span', 'lecture-xp');
  xpSp.textContent = `${lec.xpEarned || 0} XP`;
  pills.appendChild(xpSp);
  summary.appendChild(pills);

  // Delete lecture button
  const delBtn = el('button', 'btn-delete-sm');
  delBtn.title = 'Delete lecture';
  delBtn.textContent = '✕';
  summary.appendChild(delBtn);

  card.appendChild(summary);

  /* ── Detail panel ── */
  const detail = el('div', `lecture-detail${isExpanded ? ' open' : ''}`);
  detail.appendChild(buildLectureDetail(lec, weekId, dispatch));
  card.appendChild(detail);

  /* ── Events ── */
  const doToggle = () => dispatch('TOGGLE_LECTURE', { lectureId: lec.lectureId });
  toggleBtn.addEventListener('click', doToggle);
  nameSp.addEventListener('click',    doToggle);

  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    dispatch('DELETE_LECTURE', { weekId, lectureId: lec.lectureId });
  });

  return card;
}

/** Build the inner content of the expanded lecture detail panel */
function buildLectureDetail(lec, weekId, dispatch) {
  const wrap = el('div', 'lecture-detail-inner');

  /* Core action checkboxes */
  const actionsDiv = el('div', 'lecture-actions');
  actionsDiv.appendChild(buildCheckRow(
    'watched', 'Watched', `+${XP.LECTURE_WATCH} XP`, lec.watched,
    val => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'watched', value: val })
  ));
  actionsDiv.appendChild(buildCheckRow(
    'memoryNote', 'Memory Note', `+${XP.LECTURE_MEMORY} XP`, lec.memoryNote,
    val => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'memoryNote', value: val })
  ));
  actionsDiv.appendChild(buildCheckRow(
    'finalNote', 'Final Note', `+${XP.LECTURE_FINAL} XP`, lec.finalNote,
    val => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'finalNote', value: val })
  ));
  wrap.appendChild(actionsDiv);

  /* Activity questions stepper */
  wrap.appendChild(buildStepperRow(
    'Activity Questions',
    `${lec.activityDone} / ${lec.activityTotal}`,
    `+${XP.LECTURE_ACTIVITY} ea.`,
    [
      { label: '−T', action: 'actTotal-dec', title: 'Remove total' },
      { label: '+T', action: 'actTotal-inc', title: 'Add to total' },
      { label: '+1', action: 'actDone-inc',  title: 'Mark one done', cls: 'btn-stepper-done', disabled: lec.activityDone >= lec.activityTotal },
      { label: '↩',  action: 'actDone-dec',  title: 'Undo one done', cls: 'btn-stepper-undo', disabled: lec.activityDone <= 0 }
    ],
    action => dispatch('LECTURE_STEP', { weekId, lectureId: lec.lectureId, action })
  ));

  /* Revision stepper */
  wrap.appendChild(buildStepperRow(
    'Revisions',
    `${lec.revisionCount || 0} done`,
    `+${XP.LECTURE_REVISION} ea.`,
    [
      { label: '+1', action: 'rev-inc', title: 'Log a revision', cls: 'btn-stepper-done' },
      { label: '↩',  action: 'rev-dec', title: 'Remove last revision', cls: 'btn-stepper-undo', disabled: (lec.revisionCount || 0) <= 0 }
    ],
    action => dispatch('LECTURE_STEP', { weekId, lectureId: lec.lectureId, action })
  ));

  /* Rename button */
  const renameRow = el('div', 'lecture-rename-row');
  const renameBtn = el('button', 'btn-secondary-sm btn-rename-lec');
  renameBtn.textContent = '✎ Rename';
  renameBtn.addEventListener('click', () => {
    dispatch('RENAME_LECTURE', { weekId, lectureId: lec.lectureId });
  });
  renameRow.appendChild(renameBtn);
  wrap.appendChild(renameRow);

  return wrap;
}

/* ────────────────────────────────────────────
   ASSIGNMENT SECTION
──────────────────────────────────────────── */

function buildAssignmentSection(week, dispatch) {
  const section = el('div', 'week-section');

  const sHeader = el('div', 'section-header');
  const sTitle  = el('span', 'section-title');
  sTitle.textContent = 'ASSIGNMENTS';
  sHeader.appendChild(sTitle);
  section.appendChild(sHeader);

  section.appendChild(buildAssignmentRow(
    'Practice', 'practice',
    week.practiceAssignment.totalQuestions,
    week.practiceAssignment.doneQuestions,
    XP.PRACTICE_Q, week.weekId, dispatch
  ));

  section.appendChild(buildAssignmentRow(
    'Graded', 'graded',
    week.gradedAssignment.totalQuestions,
    week.gradedAssignment.doneQuestions,
    XP.GRADED_Q, week.weekId, dispatch
  ));

  return section;
}

function buildAssignmentRow(label, type, total, done, xpEach, weekId, dispatch) {
  const row = el('div', 'assignment-row');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const lbl = el('span', 'asgn-label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const track = el('div', 'asgn-progress-track');
  const fill  = el('div', 'asgn-progress-fill');
  fill.style.width = `${pct}%`;
  track.appendChild(fill);
  row.appendChild(track);

  const count = el('span', 'asgn-count');
  count.textContent = `${done}/${total}`;
  row.appendChild(count);

  row.appendChild(buildStepperRow(
    '', '', `+${xpEach} ea.`,
    [
      { label: '−T', dir: 'total-dec', title: 'Remove total' },
      { label: '+T', dir: 'total-inc', title: 'Add to total' },
      { label: '+1', dir: 'done-inc',  title: 'Mark one done', cls: 'btn-stepper-done', disabled: done >= total },
      { label: '↩',  dir: 'done-dec',  title: 'Undo one done', cls: 'btn-stepper-undo', disabled: done <= 0 }
    ],
    dir => dispatch('ASSIGNMENT_STEP', { weekId, type, dir }),
    true // compact
  ));

  return row;
}

/* ────────────────────────────────────────────
   WEEKLY MILESTONES
──────────────────────────────────────────── */

function buildWeeklyActions(week, coreOk, dispatch) {
  const section = el('div', 'week-section');

  const sHeader = el('div', 'section-header');
  const sTitle  = el('span', 'section-title');
  sTitle.textContent = 'WEEKLY MILESTONES';
  sHeader.appendChild(sTitle);
  section.appendChild(sHeader);

  const actionsDiv = el('div', 'lecture-actions');

  actionsDiv.appendChild(buildCheckRow(
    'weeklyMemoryNote', 'Weekly Memory Note', `+${XP.WEEKLY_MEMORY} XP`,
    week.weeklyMemoryNote,
    val => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weeklyMemoryNote', value: val })
  ));

  actionsDiv.appendChild(buildCheckRow(
    'weeklyFinalNote', 'Weekly Final Note', `+${XP.WEEKLY_FINAL} XP`,
    week.weeklyFinalNote,
    val => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weeklyFinalNote', value: val })
  ));

  // Week complete — locked if core not done
  const completeRow = buildCheckRow(
    'weekCompleted',
    coreOk
      ? 'Mark Week Complete'
      : 'Mark Week Complete · complete all lecture core actions first',
    `+${XP.WEEK_COMPLETE} XP`,
    week.weekCompleted,
    val => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weekCompleted', value: val }),
    !coreOk // locked
  );
  actionsDiv.appendChild(completeRow);

  section.appendChild(actionsDiv);
  return section;
}

/* ────────────────────────────────────────────
   REUSABLE BUILDERS
──────────────────────────────────────────── */

/**
 * Build a checkbox action row using pure DOM construction.
 * @param {string} field        - data-action identifier
 * @param {string} labelText    - visible label
 * @param {string} xpText       - XP badge text
 * @param {boolean} checked     - current state
 * @param {Function} onChange   - called with new boolean value
 * @param {boolean} [locked]    - if true, row is disabled/greyed
 */
function buildCheckRow(field, labelText, xpText, checked, onChange, locked = false) {
  const row = el('div', `action-row${checked ? ' checked' : ''}${locked ? ' row-locked' : ''}`);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = locked;
  input.dataset.action = field;
  input.style.display = 'none';

  const box = el('span', 'checkbox-box');
  const lbl = el('span', 'action-label');
  lbl.textContent = labelText;
  const xp  = el('span', 'action-xp');
  xp.textContent = xpText;

  row.appendChild(input);
  row.appendChild(box);
  row.appendChild(lbl);
  row.appendChild(xp);

  if (!locked) {
    row.addEventListener('click', () => {
      const newVal = !input.checked;
      input.checked = newVal;
      row.classList.toggle('checked', newVal);
      onChange(newVal);
    });
  }

  return row;
}

/**
 * Build a stepper row.
 * @param {string} labelText
 * @param {string} countText
 * @param {string} xpText
 * @param {Array}  btns         - array of { label, action|dir, title, cls?, disabled? }
 * @param {Function} onClick    - called with action or dir string
 * @param {boolean} [compact]   - omit label/count spans
 */
function buildStepperRow(labelText, countText, xpText, btns, onClick, compact = false) {
  const row = el('div', compact ? 'asgn-controls' : 'activity-row');

  if (!compact) {
    const lbl = el('span', 'activity-label');
    lbl.textContent = labelText;
    row.appendChild(lbl);
  }

  const controls = compact ? row : el('div', 'activity-controls');

  for (const b of btns) {
    const btn = el('button', `btn-stepper${b.cls ? ' ' + b.cls : ''}`);
    btn.textContent = b.label;
    btn.title = b.title || '';
    if (b.disabled) btn.disabled = true;
    btn.addEventListener('click', () => onClick(b.action || b.dir));
    controls.appendChild(btn);
  }

  if (!compact) {
    const countSp = el('span', 'activity-count');
    countSp.textContent = countText;
    row.appendChild(countSp);
    row.appendChild(controls);
  }

  const xpSp = el('span', 'action-xp');
  xpSp.textContent = xpText;
  row.appendChild(xpSp);

  return row;
}

/** Make a quick-stat pill */
function makePill(text, active, activeCls, title) {
  const p = el('span', `stat-pill ${active ? activeCls : 'pill-dim'}`);
  p.textContent = text;
  p.title = title;
  return p;
}

/* ────────────────────────────────────────────
   XP HISTORY GRAPH (Canvas)
──────────────────────────────────────────── */

export function renderXPGraph(xpHistory) {
  const canvas = document.getElementById('xp-chart');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const W    = canvas.offsetWidth;
  const H    = canvas.offsetHeight;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Build last 30 days
  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const values = days.map(d => xpHistory[d] || 0);
  const maxVal = Math.max(...values, 1);
  const todayStr = today.toISOString().slice(0, 10);

  const padL = 40, padR = 16, padT = 20, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = Math.max(2, chartW / days.length - 2);
  const gap    = (chartW - barW * days.length) / (days.length + 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y); ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font      = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padL - 4, y + 4);
  }

  // Bars
  days.forEach((day, i) => {
    const v    = values[i];
    const barH = (v / maxVal) * chartH;
    const x    = padL + gap + i * (barW + gap);
    const y    = padT + chartH - barH;
    const isToday = day === todayStr;

    ctx.fillStyle = isToday
      ? `rgba(245,158,11,${v > 0 ? 1 : 0.2})`
      : `rgba(56,189,148,${v > 0 ? 0.85 : 0.12})`;

    if (barH > 0) {
      const r = Math.min(3, barH / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.arcTo(x + barW, y,       x + barW, y + r,       r);
      ctx.lineTo(x + barW, y + barH);
      ctx.lineTo(x,         y + barH);
      ctx.lineTo(x,         y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.fill();
    }

    if (i % 5 === 0 || isToday) {
      ctx.fillStyle = isToday ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.25)';
      ctx.font      = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(day.slice(5), x + barW / 2, H - padB + 14);
    }
  });

  // X-axis
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  ctx.lineTo(W - padR, padT + chartH);
  ctx.stroke();
}

/* ────────────────────────────────────────────
   MODALS
──────────────────────────────────────────── */

export function showPromptModal(title, placeholder, defaultValue, onConfirm) {
  removeModal();

  const overlay = el('div', 'modal-overlay');
  const modal   = el('div', 'modal');

  const titleEl = el('div', 'modal-title');
  titleEl.textContent = title;

  const input = document.createElement('input');
  input.className   = 'modal-input';
  input.type        = 'text';
  input.placeholder = placeholder;
  input.value       = defaultValue || '';
  input.maxLength   = 120;
  input.autocomplete = 'off';

  const actions  = el('div', 'modal-actions');
  const cancelBtn  = el('button', 'modal-btn btn-cancel');
  cancelBtn.textContent = 'Cancel';
  const confirmBtn = el('button', 'modal-btn btn-confirm btn-primary');
  confirmBtn.textContent = 'Confirm';

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  modal.appendChild(titleEl);
  modal.appendChild(input);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Focus & select
  setTimeout(() => { input.focus(); input.select(); }, 20);

  const submit = () => {
    const val = input.value.trim();
    if (!val) {
      input.classList.add('input-error');
      setTimeout(() => input.classList.remove('input-error'), 400);
      return;
    }
    removeModal();
    onConfirm(val);
  };

  confirmBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click',  removeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') removeModal();
  });
}

export function showConfirmModal(message, onConfirm) {
  removeModal();

  const overlay  = el('div', 'modal-overlay');
  const modal    = el('div', 'modal modal-danger');
  const titleEl  = el('div', 'modal-title');
  titleEl.textContent = 'Confirm Delete';
  const msg      = el('p', 'modal-msg');
  msg.textContent = message;
  const actions  = el('div', 'modal-actions');
  const cancelBtn  = el('button', 'modal-btn btn-cancel');
  cancelBtn.textContent = 'Cancel';
  const delBtn     = el('button', 'modal-btn btn-danger');
  delBtn.textContent = 'Delete';

  actions.appendChild(cancelBtn);
  actions.appendChild(delBtn);
  modal.appendChild(titleEl);
  modal.appendChild(msg);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener('click', removeModal);
  delBtn.addEventListener('click', () => { removeModal(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
}

export function showToast(message, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = el('div', `toast toast-${type}`);
  toast.id = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

export function removeModal() {
  document.querySelector('.modal-overlay')?.remove();
}

/* ────────────────────────────────────────────
   UTILS
──────────────────────────────────────────── */

function el(tag, className = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
