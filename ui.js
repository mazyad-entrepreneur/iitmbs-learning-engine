/**
 * ui.js — DOM Rendering Module
 *
 * Pure rendering — no state held here.
 * dispatch(action, payload) sends all events up to app.js.
 *
 * RULE: Never use innerHTML += on a node with children that have
 * event listeners — it destroys DOM references. Always appendChild().
 */

import { XP, weekXPBreakdown, weekProgress, getLevelProgress,
         xpToNextLevel, isWeekCoreComplete, computeLifetimeStats } from './xpEngine.js';

/* ─────────────────────────────────────────
   HEADER
───────────────────────────────────────── */

export function renderHeader(program) {
  const { totalXP, level, streak, streakFreezes } = program;
  const pct = getLevelProgress(totalXP);

  setTxt('hdr-level',  `LVL ${level}`);
  setTxt('hdr-xp',     `${totalXP} XP · ${xpToNextLevel(totalXP)} to next`);
  setTxt('hdr-streak', `🔥 ${streak}d`);

  const bar = document.getElementById('hdr-xp-bar');
  if (bar) bar.style.width = `${(pct * 100).toFixed(1)}%`;

  // Freeze display in header
  const freezeEl = document.getElementById('hdr-freeze');
  if (freezeEl) {
    freezeEl.textContent = `❄️ ×${streakFreezes || 0}`;
    freezeEl.title = `Streak Freezes: ${streakFreezes || 0}/${XP.MAX_FREEZES}. Earned by completing weeks. Auto-used if you miss a day.`;
    freezeEl.classList.toggle('freeze-empty', !streakFreezes);
  }
}

/* ─────────────────────────────────────────
   LIFETIME STATS PANEL
───────────────────────────────────────── */

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
    { label: 'Total XP',          value: program.totalXP,             icon: '⚡' },
    { label: 'Level',             value: program.level,               icon: '🏆' },
    { label: 'Best Streak',       value: `${s.bestStreak}d`,          icon: '🔥' },
    { label: 'Active Days',       value: s.activeDays,                icon: '📅' },
    { label: 'XP This Month',     value: s.xpThisMonth,               icon: '📈' },
    { label: 'Weeks Done',        value: `${s.weeksCompleted}/${s.totalWeeks}`, icon: '📚' },
    { label: 'Lectures Core Done',value: `${s.completedLectures}/${s.totalLectures}`, icon: '🎓' },
    { label: 'Total Revisions',   value: s.totalRevisions,            icon: '🔁' },
    { label: 'Activity Qs Done',  value: `${s.totalActivityDone}/${s.totalActivityTotal}`, icon: '✏️' },
    { label: 'Practice Qs Done',  value: s.totalPracticeDone,         icon: '📝' },
    { label: 'Graded Qs Done',    value: s.totalGradedDone,           icon: '✅' },
    { label: 'Streak Freezes',    value: `${s.streakFreezes}/${XP.MAX_FREEZES}`, icon: '❄️' },
  ];

  for (const c of cards) {
    const card = el('div', 'stat-card');
    const icon = el('span', 'stat-icon');
    icon.textContent = c.icon;
    const val  = el('div', 'stat-value');
    val.textContent = c.value;
    const lbl  = el('div', 'stat-label');
    lbl.textContent = c.label;
    card.appendChild(icon);
    card.appendChild(val);
    card.appendChild(lbl);
    grid.appendChild(card);
  }

  panel.appendChild(grid);
}

/* ─────────────────────────────────────────
   WEEKS LIST
───────────────────────────────────────── */

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

/* ─────────────────────────────────────────
   WEEK CARD
───────────────────────────────────────── */

function buildWeekCard(week, dispatch, expandedWeeks, expandedLectures) {
  const isOpen   = expandedWeeks.has(week.weekId);
  const progress = weekProgress(week);
  const coreOk   = isWeekCoreComplete(week);
  const bd       = weekXPBreakdown(week);

  const card = el('div', `week-card${week.weekCompleted ? ' week-done' : ''}`);

  /* Header */
  const header = el('div', 'week-header');

  const toggleBtn = el('button', 'week-toggle');
  toggleBtn.setAttribute('aria-label', 'Toggle week');
  const chev = el('span', `chevron${isOpen ? ' open' : ''}`);
  chev.textContent = '›';
  toggleBtn.appendChild(chev);
  header.appendChild(toggleBtn);

  const titleGroup = el('div', 'week-title-group');
  const nameSpan   = el('span', 'week-name');
  nameSpan.textContent = week.weekName;
  titleGroup.appendChild(nameSpan);
  if (week.weekCompleted) {
    const badge = el('span', 'badge badge-done');
    badge.textContent = '✓ Done';
    titleGroup.appendChild(badge);
  }
  header.appendChild(titleGroup);

  const meta   = el('div', 'week-meta');
  const xpBadge = el('span', 'week-xp');
  xpBadge.textContent = `${bd.total} XP`;
  const editBtn = el('button', 'btn-icon btn-edit');
  editBtn.title = 'Rename week'; editBtn.textContent = '✎';
  const delBtn  = el('button', 'btn-icon btn-delete');
  delBtn.title  = 'Delete week';  delBtn.textContent = '✕';
  meta.appendChild(xpBadge);
  meta.appendChild(editBtn);
  meta.appendChild(delBtn);
  header.appendChild(meta);

  /* Progress bar */
  const progRow = el('div', 'week-progress-row');
  const track   = el('div', 'progress-bar-track');
  const fill    = el('div', 'progress-bar-fill');
  fill.style.width = `${(progress * 100).toFixed(1)}%`;
  track.appendChild(fill);
  const pctLbl  = el('span', 'progress-label');
  pctLbl.textContent = `${Math.round(progress * 100)}%`;
  progRow.appendChild(track);
  progRow.appendChild(pctLbl);
  header.appendChild(progRow);

  card.appendChild(header);

  /* Body */
  const body = el('div', `week-body${isOpen ? ' open' : ''}`);
  body.appendChild(buildLectureSection(week, dispatch, expandedLectures));
  body.appendChild(buildAssignmentSection(week, dispatch));
  body.appendChild(buildWeeklyActions(week, coreOk, dispatch));
  card.appendChild(body);

  /* Events */
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

/* ─────────────────────────────────────────
   LECTURE SECTION
   CRITICAL: No innerHTML += here — destroys event listeners
───────────────────────────────────────── */

function buildLectureSection(week, dispatch, expandedLectures) {
  const section = el('div', 'week-section');

  const sHeader = el('div', 'section-header');
  const sTitle  = el('span', 'section-title');
  sTitle.textContent = 'LECTURES';
  sHeader.appendChild(sTitle);

  const addBtn = el('button', 'btn-secondary-sm');
  addBtn.textContent = '+ Add Lecture';
  sHeader.appendChild(addBtn);
  section.appendChild(sHeader);

  if (week.lectures.length === 0) {
    const empty = el('p', 'section-empty');
    empty.textContent = 'No lectures yet. Add one above.';
    section.appendChild(empty);      // ← appendChild, NOT innerHTML +=
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

/* ─────────────────────────────────────────
   LECTURE CARD
───────────────────────────────────────── */

function buildLectureCard(lec, weekId, dispatch, expandedLectures) {
  const isOpen = expandedLectures.has(lec.lectureId);
  const card   = el('div', `lecture-card${isOpen ? ' open' : ''}`);

  /* Summary row */
  const summary = el('div', 'lecture-summary');

  const toggleBtn = el('button', 'lecture-toggle');
  const chev = el('span', `chevron${isOpen ? ' open' : ''}`);
  chev.textContent = '›';
  toggleBtn.appendChild(chev);
  summary.appendChild(toggleBtn);

  const nameSpan = el('span', 'lecture-name');
  nameSpan.textContent = lec.lectureName;
  summary.appendChild(nameSpan);

  /* Quick pills */
  const pills = el('div', 'lecture-quick-stats');
  pills.appendChild(makePill('W', lec.watched,    'pill-green', 'Watched'));
  pills.appendChild(makePill('M', lec.memoryNote, 'pill-amber', 'Memory Note'));
  pills.appendChild(makePill('F', lec.finalNote,  'pill-blue',  'Final Note'));
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

  /* Detail panel */
  const detail = el('div', `lecture-detail${isOpen ? ' open' : ''}`);
  detail.appendChild(buildLectureDetail(lec, weekId, dispatch));
  card.appendChild(detail);

  /* Events */
  const doToggle = () => dispatch('TOGGLE_LECTURE', { lectureId: lec.lectureId });
  toggleBtn.addEventListener('click', doToggle);
  nameSpan.addEventListener('click',  doToggle);
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    dispatch('DELETE_LECTURE', { weekId, lectureId: lec.lectureId });
  });

  return card;
}

function buildLectureDetail(lec, weekId, dispatch) {
  const wrap = el('div', 'lecture-detail-inner');

  /* Core checkboxes */
  const actions = el('div', 'lecture-actions');
  actions.appendChild(checkRow('Watched',     `+${XP.LECTURE_WATCH} XP`,   lec.watched,
    v => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'watched',    value: v })));
  actions.appendChild(checkRow('Memory Note', `+${XP.LECTURE_MEMORY} XP`,  lec.memoryNote,
    v => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'memoryNote', value: v })));
  actions.appendChild(checkRow('Final Note',  `+${XP.LECTURE_FINAL} XP`,   lec.finalNote,
    v => dispatch('LECTURE_TOGGLE', { weekId, lectureId: lec.lectureId, field: 'finalNote',  value: v })));
  wrap.appendChild(actions);

  /* Activity questions */
  wrap.appendChild(stepperRow(
    'Activity Questions',
    `${lec.activityDone} / ${lec.activityTotal}`,
    `+${XP.LECTURE_ACTIVITY} ea.`,
    [
      { label: '−T', action: 'actTotal-dec', title: 'Remove from total' },
      { label: '+T', action: 'actTotal-inc', title: 'Add to total' },
      { label: '+1', action: 'actDone-inc',  title: 'Mark one done', cls: 'btn-stepper-done', disabled: lec.activityDone >= lec.activityTotal },
      { label: '↩',  action: 'actDone-dec',  title: 'Undo one',       cls: 'btn-stepper-undo', disabled: lec.activityDone <= 0 }
    ],
    a => dispatch('LECTURE_STEP', { weekId, lectureId: lec.lectureId, action: a })
  ));

  /* Revisions */
  wrap.appendChild(stepperRow(
    'Revisions',
    `${lec.revisionCount || 0} done`,
    `+${XP.LECTURE_REVISION} ea.`,
    [
      { label: '+1', action: 'rev-inc', title: 'Log a revision', cls: 'btn-stepper-done' },
      { label: '↩',  action: 'rev-dec', title: 'Remove last',    cls: 'btn-stepper-undo', disabled: (lec.revisionCount || 0) <= 0 }
    ],
    a => dispatch('LECTURE_STEP', { weekId, lectureId: lec.lectureId, action: a })
  ));

  /* Quick notes textarea */
  const notesWrap = el('div', 'notes-wrap');
  const notesLbl  = el('label', 'notes-label');
  notesLbl.textContent = 'Quick Notes';
  const textarea  = el('textarea', 'notes-textarea');
  textarea.placeholder = 'Jot anything about this lecture…';
  textarea.value = lec.notes || '';
  textarea.rows  = 3;

  let saveTimer;
  textarea.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      dispatch('SAVE_LECTURE_NOTE', { weekId, lectureId: lec.lectureId, text: textarea.value });
    }, 500); // debounce 500ms
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

/* ─────────────────────────────────────────
   ASSIGNMENTS
───────────────────────────────────────── */

function buildAssignmentSection(week, dispatch) {
  const section = el('div', 'week-section');
  const sH = el('div', 'section-header');
  const sT = el('span', 'section-title');
  sT.textContent = 'ASSIGNMENTS'; sH.appendChild(sT); section.appendChild(sH);

  const makeRow = (label, type, total, done, xpEach) => {
    const row  = el('div', 'assignment-row');
    const pct  = total > 0 ? Math.round((done / total) * 100) : 0;
    const lbl  = el('span', 'asgn-label'); lbl.textContent = label; row.appendChild(lbl);
    const trk  = el('div', 'asgn-progress-track');
    const fl   = el('div', 'asgn-progress-fill'); fl.style.width = `${pct}%`;
    trk.appendChild(fl); row.appendChild(trk);
    const cnt  = el('span', 'asgn-count'); cnt.textContent = `${done}/${total}`; row.appendChild(cnt);
    const ctrl = el('div', 'asgn-controls');
    const btns = [
      { label: '−T', dir: 'total-dec' }, { label: '+T', dir: 'total-inc' },
      { label: '+1', dir: 'done-inc', cls: 'btn-stepper-done', disabled: done >= total },
      { label: '↩',  dir: 'done-dec', cls: 'btn-stepper-undo', disabled: done <= 0 }
    ];
    for (const b of btns) {
      const btn = el('button', `btn-stepper${b.cls ? ' '+b.cls : ''}`);
      btn.textContent = b.label;
      if (b.disabled) btn.disabled = true;
      btn.addEventListener('click', () => dispatch('ASSIGNMENT_STEP', { weekId: week.weekId, type, dir: b.dir }));
      ctrl.appendChild(btn);
    }
    row.appendChild(ctrl);
    const xpSp = el('span', 'action-xp'); xpSp.textContent = `+${xpEach} ea.`; row.appendChild(xpSp);
    return row;
  };

  section.appendChild(makeRow('Practice', 'practice',
    week.practiceAssignment.totalQuestions, week.practiceAssignment.doneQuestions, XP.PRACTICE_Q));
  section.appendChild(makeRow('Graded', 'graded',
    week.gradedAssignment.totalQuestions, week.gradedAssignment.doneQuestions, XP.GRADED_Q));

  return section;
}

/* ─────────────────────────────────────────
   WEEKLY MILESTONES
───────────────────────────────────────── */

function buildWeeklyActions(week, coreOk, dispatch) {
  const section = el('div', 'week-section');
  const sH = el('div', 'section-header');
  const sT = el('span', 'section-title');
  sT.textContent = 'WEEKLY MILESTONES'; sH.appendChild(sT); section.appendChild(sH);

  const div = el('div', 'lecture-actions');
  div.appendChild(checkRow('Weekly Memory Note', `+${XP.WEEKLY_MEMORY} XP`, week.weeklyMemoryNote,
    v => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weeklyMemoryNote', value: v })));
  div.appendChild(checkRow('Weekly Final Note',  `+${XP.WEEKLY_FINAL} XP`,  week.weeklyFinalNote,
    v => dispatch('WEEK_TOGGLE', { weekId: week.weekId, field: 'weeklyFinalNote',  value: v })));
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

/* ─────────────────────────────────────────
   XP HISTORY GRAPH
───────────────────────────────────────── */

export function renderXPGraph(xpHistory) {
  const canvas = document.getElementById('xp-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth;
  const H   = canvas.offsetHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const days = [];
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const values = days.map(d => xpHistory[d] || 0);
  const maxVal = Math.max(...values, 1);
  const padL = 40, padR = 16, padT = 20, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = Math.max(2, chartW / days.length - 2);
  const gap    = (chartW - barW * days.length) / (days.length + 1);

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle   = 'rgba(255,255,255,0.3)';
    ctx.font        = '10px JetBrains Mono, monospace';
    ctx.textAlign   = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padL - 4, y + 4);
  }

  // Bars
  days.forEach((day, i) => {
    const v    = values[i];
    const barH = (v / maxVal) * chartH;
    const x    = padL + gap + i * (barW + gap);
    const y    = padT + chartH - barH;
    const isT  = day === todayStr;
    ctx.fillStyle = isT
      ? `rgba(245,158,11,${v > 0 ? 1 : 0.2})`
      : `rgba(56,189,148,${v > 0 ? 0.85 : 0.12})`;
    if (barH > 0) {
      const r = Math.min(3, barH / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.arcTo(x + barW, y, x + barW, y + r, r);
      ctx.lineTo(x + barW, y + barH);
      ctx.lineTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.fill();
    }
    if (i % 5 === 0 || isT) {
      ctx.fillStyle = isT ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.25)';
      ctx.font      = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(day.slice(5), x + barW / 2, H - padB + 14);
    }
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.moveTo(padL, padT + chartH); ctx.lineTo(W - padR, padT + chartH); ctx.stroke();
}

/* ─────────────────────────────────────────
   MODALS
───────────────────────────────────────── */

export function showPromptModal(title, placeholder, defaultValue, onConfirm) {
  removeModal();
  const overlay = el('div', 'modal-overlay');
  const modal   = el('div', 'modal');
  const ttl     = el('div', 'modal-title'); ttl.textContent = title;
  const input   = document.createElement('input');
  input.className = 'modal-input'; input.type = 'text';
  input.placeholder = placeholder; input.value = defaultValue || '';
  input.maxLength = 120; input.autocomplete = 'off';
  const acts   = el('div', 'modal-actions');
  const cancl  = el('button', 'modal-btn btn-cancel');  cancl.textContent = 'Cancel';
  const conf   = el('button', 'modal-btn btn-confirm'); conf.textContent  = 'Confirm';
  acts.appendChild(cancl); acts.appendChild(conf);
  modal.appendChild(ttl); modal.appendChild(input); modal.appendChild(acts);
  overlay.appendChild(modal); document.body.appendChild(overlay);
  setTimeout(() => { input.focus(); input.select(); }, 20);

  const submit = () => {
    const v = input.value.trim();
    if (!v) { input.classList.add('input-error'); setTimeout(() => input.classList.remove('input-error'), 400); return; }
    removeModal(); onConfirm(v);
  };
  conf.addEventListener('click', submit);
  cancl.addEventListener('click', removeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') removeModal(); });
}

export function showConfirmModal(message, onConfirm) {
  removeModal();
  const overlay = el('div', 'modal-overlay');
  const modal   = el('div', 'modal modal-danger');
  const ttl  = el('div', 'modal-title'); ttl.textContent = 'Confirm';
  const msg  = el('p', 'modal-msg'); msg.textContent = message;
  const acts = el('div', 'modal-actions');
  const canc = el('button', 'modal-btn btn-cancel'); canc.textContent = 'Cancel';
  const del  = el('button', 'modal-btn btn-danger'); del.textContent  = 'Confirm';
  acts.appendChild(canc); acts.appendChild(del);
  modal.appendChild(ttl); modal.appendChild(msg); modal.appendChild(acts);
  overlay.appendChild(modal); document.body.appendChild(overlay);
  canc.addEventListener('click', removeModal);
  del.addEventListener('click', () => { removeModal(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
}

export function showToast(message, type = 'info') {
  document.getElementById('toast')?.remove();
  const t = el('div', `toast toast-${type}`);
  t.id = 'toast'; t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => { t.classList.remove('toast-visible'); setTimeout(() => t.remove(), 300); }, 3000);
}

export function removeModal() {
  document.querySelector('.modal-overlay')?.remove();
}

/* ─────────────────────────────────────────
   REUSABLE BUILDERS
───────────────────────────────────────── */

/**
 * Build a checkbox action row entirely with DOM (no innerHTML).
 */
function checkRow(labelText, xpText, checked, onChange, locked = false) {
  const row = el('div', `action-row${checked ? ' checked' : ''}${locked ? ' row-locked' : ''}`);
  const box = el('span', 'checkbox-box');
  const lbl = el('span', 'action-label'); lbl.textContent = labelText;
  const xp  = el('span', 'action-xp');   xp.textContent  = xpText;
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

/**
 * Build a stepper row with label, count, buttons, and XP note.
 */
function stepperRow(labelText, countText, xpText, btns, onClick) {
  const row  = el('div', 'activity-row');
  const lbl  = el('span', 'activity-label'); lbl.textContent = labelText; row.appendChild(lbl);
  const cnt  = el('span', 'activity-count'); cnt.textContent = countText; row.appendChild(cnt);
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

/* ─────────────────────────────────────────
   UTILS
───────────────────────────────────────── */

function el(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function setTxt(id, text) {
  const e = document.getElementById(id);
  if (e) e.textContent = text;
}
