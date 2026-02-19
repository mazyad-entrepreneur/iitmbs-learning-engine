/**
 * ui.js — DOM Rendering Module
 *
 * All functions receive data and a callback dispatch function.
 * Zero state held here — rendering is a pure function of program state.
 * dispatch(action, payload) is how UI events bubble up to app.js.
 */

import { XP, weekXPBreakdown, weekProgress, getLevelProgress, xpToNextLevel, isWeekCoreComplete } from './xpEngine.js';

/* ────────────────────────────────────────────
   HEADER — Level, XP Bar, Streak
──────────────────────────────────────────── */

/**
 * Render the sticky header stats (level, XP bar, streak).
 * @param {Object} program
 */
export function renderHeader(program) {
  const { totalXP, level, streak } = program;
  const progress = getLevelProgress(totalXP);
  const remaining = xpToNextLevel(totalXP);

  const lvlEl     = document.getElementById('hdr-level');
  const xpEl      = document.getElementById('hdr-xp');
  const barEl     = document.getElementById('hdr-xp-bar');
  const streakEl  = document.getElementById('hdr-streak');

  if (lvlEl)    lvlEl.textContent  = `LVL ${level}`;
  if (xpEl)     xpEl.textContent   = `${totalXP} XP · ${remaining} to next`;
  if (barEl)    barEl.style.width  = `${(progress * 100).toFixed(1)}%`;
  if (streakEl) streakEl.textContent = `🔥 ${streak}d`;
}

/* ────────────────────────────────────────────
   WEEK LIST
──────────────────────────────────────────── */

/**
 * Render the full weeks list into #weeks-container.
 * @param {Object} program
 * @param {Function} dispatch
 * @param {Set<string>} expandedWeeks   - set of weekIds currently expanded
 * @param {Set<string>} expandedLectures - set of lectureIds currently expanded
 */
export function renderWeeks(program, dispatch, expandedWeeks, expandedLectures) {
  const container = document.getElementById('weeks-container');
  if (!container) return;

  if (program.weeks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">Σ</span>
        <p>No weeks yet. Add your first module to begin.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  for (const week of program.weeks) {
    container.appendChild(buildWeekCard(week, dispatch, expandedWeeks, expandedLectures));
  }
}

/** Build a single week card element */
function buildWeekCard(week, dispatch, expandedWeeks, expandedLectures) {
  const isExpanded = expandedWeeks.has(week.weekId);
  const progress   = weekProgress(week);
  const coreOk     = isWeekCoreComplete(week);
  const bd         = weekXPBreakdown(week);

  const card = el('div', `week-card${week.weekCompleted ? ' week-done' : ''}`);
  card.dataset.weekId = week.weekId;

  /* ── Header row ── */
  const header = el('div', 'week-header');
  header.innerHTML = `
    <button class="week-toggle" aria-expanded="${isExpanded}" aria-label="Toggle week">
      <span class="chevron ${isExpanded ? 'open' : ''}">›</span>
    </button>
    <div class="week-title-group">
      <span class="week-name">${escHtml(week.weekName)}</span>
      ${week.weekCompleted ? '<span class="badge badge-done">✓ Done</span>' : ''}
    </div>
    <div class="week-meta">
      <span class="week-xp">${bd.total} XP</span>
      <button class="btn-icon btn-edit" title="Rename week">✎</button>
      <button class="btn-icon btn-delete" title="Delete week">✕</button>
    </div>`;

  /* Progress bar */
  const progRow = el('div', 'week-progress-row');
  progRow.innerHTML = `
    <div class="progress-bar-track">
      <div class="progress-bar-fill" style="width:${(progress * 100).toFixed(1)}%"></div>
    </div>
    <span class="progress-label">${Math.round(progress * 100)}%</span>`;

  header.appendChild(progRow);
  card.appendChild(header);

  /* ── Expandable body ── */
  const body = el('div', `week-body${isExpanded ? ' open' : ''}`);

  /* Lectures section */
  const lecSection = el('div', 'week-section');
  const lecHeader  = el('div', 'section-header');
  lecHeader.innerHTML = `<span class="section-title">LECTURES</span>
    <button class="btn-add-lecture btn-secondary-sm">+ Add Lecture</button>`;
  lecSection.appendChild(lecHeader);

  if (week.lectures.length === 0) {
    lecSection.innerHTML += `<p class="section-empty">No lectures. Add one above.</p>`;
  } else {
    const lecList = el('div', 'lecture-list');
    for (const lec of week.lectures) {
      lecList.appendChild(buildLectureCard(lec, week.weekId, dispatch, expandedLectures));
    }
    lecSection.appendChild(lecList);
  }
  body.appendChild(lecSection);

  /* Assignments section */
  body.appendChild(buildAssignmentSection(week, dispatch));

  /* Weekly notes & completion */
  body.appendChild(buildWeeklyActions(week, coreOk, dispatch));

  card.appendChild(body);

  /* ── Event listeners ── */
  // Toggle expand
  header.querySelector('.week-toggle').addEventListener('click', () => {
    dispatch('TOGGLE_WEEK', { weekId: week.weekId });
  });
  header.querySelector('.week-name').addEventListener('click', () => {
    dispatch('TOGGLE_WEEK', { weekId: week.weekId });
  });

  // Edit week name
  header.querySelector('.btn-edit').addEventListener('click', e => {
    e.stopPropagation();
    dispatch('EDIT_WEEK_NAME', { weekId: week.weekId });
  });

  // Delete week
  header.querySelector('.btn-delete').addEventListener('click', e => {
    e.stopPropagation();
    dispatch('DELETE_WEEK', { weekId: week.weekId });
  });

  // Add lecture
  lecHeader.querySelector('.btn-add-lecture').addEventListener('click', () => {
    dispatch('ADD_LECTURE', { weekId: week.weekId });
  });

  return card;
}

/** Build a lecture card */
function buildLectureCard(lec, weekId, dispatch, expandedLectures) {
  const isExpanded = expandedLectures.has(lec.lectureId);
  const card = el('div', `lecture-card${isExpanded ? ' open' : ''}`);
  card.dataset.lectureId = lec.lectureId;

  const allActivity = lec.activityTotal > 0
    ? `<span class="stat-pill">${lec.activityDone}/${lec.activityTotal} act.</span>`
    : '';

  /* Summary row (always visible) */
  const summary = el('div', 'lecture-summary');
  summary.innerHTML = `
    <button class="lecture-toggle" aria-expanded="${isExpanded}">
      <span class="chevron ${isExpanded ? 'open' : ''}">›</span>
    </button>
    <span class="lecture-name">${escHtml(lec.lectureName)}</span>
    <div class="lecture-quick-stats">
      ${lec.watched    ? '<span class="stat-pill pill-green">W</span>'  : '<span class="stat-pill pill-dim">W</span>'}
      ${lec.memoryNote ? '<span class="stat-pill pill-amber">M</span>'  : '<span class="stat-pill pill-dim">M</span>'}
      ${lec.finalNote  ? '<span class="stat-pill pill-blue">F</span>'   : '<span class="stat-pill pill-dim">F</span>'}
      ${allActivity}
      <span class="lecture-xp">${lec.xpEarned || 0} XP</span>
    </div>
    <button class="btn-icon btn-delete-sm" title="Delete lecture">✕</button>`;

  card.appendChild(summary);

  /* Detail panel */
  const detail = el('div', `lecture-detail${isExpanded ? ' open' : ''}`);
  detail.innerHTML = `
    <div class="lecture-actions">
      <label class="action-row${lec.watched ? ' checked' : ''}">
        <input type="checkbox" ${lec.watched ? 'checked' : ''} data-action="watched">
        <span class="checkbox-box"></span>
        <span class="action-label">Watched</span>
        <span class="action-xp">+${XP.LECTURE_WATCH} XP</span>
      </label>
      <label class="action-row${lec.memoryNote ? ' checked' : ''}">
        <input type="checkbox" ${lec.memoryNote ? 'checked' : ''} data-action="memoryNote">
        <span class="checkbox-box"></span>
        <span class="action-label">Memory Note</span>
        <span class="action-xp">+${XP.LECTURE_MEMORY} XP</span>
      </label>
      <label class="action-row${lec.finalNote ? ' checked' : ''}">
        <input type="checkbox" ${lec.finalNote ? 'checked' : ''} data-action="finalNote">
        <span class="checkbox-box"></span>
        <span class="action-label">Final Note</span>
        <span class="action-xp">+${XP.LECTURE_FINAL} XP</span>
      </label>
    </div>

    <div class="activity-row">
      <span class="activity-label">Activity Questions</span>
      <div class="activity-controls">
        <button class="btn-stepper" data-action="actTotal-dec" title="Decrease total">−</button>
        <span class="activity-count">${lec.activityDone} / ${lec.activityTotal}</span>
        <button class="btn-stepper" data-action="actTotal-inc" title="Increase total">+T</button>
        <button class="btn-stepper btn-stepper-done" data-action="actDone-inc" title="Mark done" ${lec.activityDone >= lec.activityTotal ? 'disabled' : ''}>+1</button>
        <button class="btn-stepper btn-stepper-undo" data-action="actDone-dec" title="Undo done" ${lec.activityDone <= 0 ? 'disabled' : ''}>↩</button>
      </div>
      <span class="action-xp">+${XP.LECTURE_ACTIVITY} ea.</span>
    </div>

    <div class="lecture-rename-row">
      <button class="btn-secondary-sm btn-rename-lec">✎ Rename</button>
    </div>`;

  /* Lecture action events */
  detail.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      dispatch('LECTURE_TOGGLE', {
        weekId,
        lectureId: lec.lectureId,
        field: cb.dataset.action,
        value: cb.checked
      });
    });
  });

  detail.querySelectorAll('.btn-stepper').forEach(btn => {
    btn.addEventListener('click', () => {
      dispatch('LECTURE_STEP', {
        weekId,
        lectureId: lec.lectureId,
        action: btn.dataset.action
      });
    });
  });

  detail.querySelector('.btn-rename-lec').addEventListener('click', () => {
    dispatch('RENAME_LECTURE', { weekId, lectureId: lec.lectureId });
  });

  card.appendChild(detail);

  /* Toggle expand */
  summary.querySelector('.lecture-toggle').addEventListener('click', () => {
    dispatch('TOGGLE_LECTURE', { lectureId: lec.lectureId });
  });
  summary.querySelector('.lecture-name').addEventListener('click', () => {
    dispatch('TOGGLE_LECTURE', { lectureId: lec.lectureId });
  });

  /* Delete lecture */
  summary.querySelector('.btn-delete-sm').addEventListener('click', e => {
    e.stopPropagation();
    dispatch('DELETE_LECTURE', { weekId, lectureId: lec.lectureId });
  });

  return card;
}

/** Build the practice + graded assignment section */
function buildAssignmentSection(week, dispatch) {
  const section = el('div', 'week-section');
  section.innerHTML = `<div class="section-header"><span class="section-title">ASSIGNMENTS</span></div>`;

  const buildAssRow = (label, type, total, done, xpEach) => {
    const row = el('div', 'assignment-row');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    row.innerHTML = `
      <span class="asgn-label">${label}</span>
      <div class="asgn-progress-track">
        <div class="asgn-progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="asgn-count">${done}/${total}</span>
      <div class="asgn-controls">
        <button class="btn-stepper" data-type="${type}" data-dir="total-dec">−T</button>
        <button class="btn-stepper" data-type="${type}" data-dir="total-inc">+T</button>
        <button class="btn-stepper btn-stepper-done" data-type="${type}" data-dir="done-inc" ${done >= total ? 'disabled' : ''}>+1</button>
        <button class="btn-stepper btn-stepper-undo" data-type="${type}" data-dir="done-dec" ${done <= 0 ? 'disabled' : ''}>↩</button>
      </div>
      <span class="action-xp">+${xpEach} ea.</span>`;
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatch('ASSIGNMENT_STEP', {
          weekId: week.weekId,
          type:   btn.dataset.type,
          dir:    btn.dataset.dir
        });
      });
    });
    return row;
  };

  section.appendChild(buildAssRow('Practice', 'practice',
    week.practiceAssignment.totalQuestions,
    week.practiceAssignment.doneQuestions, XP.PRACTICE_Q));

  section.appendChild(buildAssRow('Graded', 'graded',
    week.gradedAssignment.totalQuestions,
    week.gradedAssignment.doneQuestions, XP.GRADED_Q));

  return section;
}

/** Build weekly notes + completion toggle */
function buildWeeklyActions(week, coreOk, dispatch) {
  const section = el('div', 'week-section');

  section.innerHTML = `
    <div class="section-header"><span class="section-title">WEEKLY MILESTONES</span></div>
    <div class="lecture-actions">
      <label class="action-row${week.weeklyMemoryNote ? ' checked' : ''}">
        <input type="checkbox" ${week.weeklyMemoryNote ? 'checked' : ''} data-action="weeklyMemoryNote">
        <span class="checkbox-box"></span>
        <span class="action-label">Weekly Memory Note</span>
        <span class="action-xp">+${XP.WEEKLY_MEMORY} XP</span>
      </label>
      <label class="action-row${week.weeklyFinalNote ? ' checked' : ''}">
        <input type="checkbox" ${week.weeklyFinalNote ? 'checked' : ''} data-action="weeklyFinalNote">
        <span class="checkbox-box"></span>
        <span class="action-label">Weekly Final Note</span>
        <span class="action-xp">+${XP.WEEKLY_FINAL} XP</span>
      </label>
      <label class="action-row${week.weekCompleted ? ' checked' : ''}${!coreOk ? ' row-locked' : ''}">
        <input type="checkbox" ${week.weekCompleted ? 'checked' : ''} ${!coreOk ? 'disabled' : ''} data-action="weekCompleted">
        <span class="checkbox-box"></span>
        <span class="action-label">Mark Week Complete ${!coreOk ? '<span class="lock-hint">(complete all lecture core actions first)</span>' : ''}</span>
        <span class="action-xp">+${XP.WEEK_COMPLETE} XP</span>
      </label>
    </div>`;

  section.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      dispatch('WEEK_TOGGLE', {
        weekId: week.weekId,
        field:  cb.dataset.action,
        value:  cb.checked
      });
    });
  });

  return section;
}

/* ────────────────────────────────────────────
   XP HISTORY GRAPH (Canvas)
──────────────────────────────────────────── */

/**
 * Draw daily XP history bar chart on the canvas element #xp-chart.
 * Shows last 30 days, skipping days with 0 XP.
 * @param {Object} xpHistory - { "YYYY-MM-DD": number }
 */
export function renderXPGraph(xpHistory) {
  const canvas = document.getElementById('xp-chart');
  if (!canvas) return;

  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.offsetWidth;
  const H      = canvas.offsetHeight;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);

  /* Generate last-30-days labels */
  const days   = [];
  const today  = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const values = days.map(d => xpHistory[d] || 0);
  const maxVal = Math.max(...values, 1);

  const padL   = 40, padR = 16, padT = 20, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = Math.max(2, (chartW / days.length) - 2);
  const gap    = (chartW - barW * days.length) / (days.length + 1);

  /* Grid lines */
  const gridLines = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();

    // Y-axis labels
    const val = Math.round(maxVal - (maxVal / gridLines) * i);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `${10 * dpr / dpr}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(val, padL - 4, y + 4);
  }

  /* Bars */
  days.forEach((day, i) => {
    const v    = values[i];
    const barH = (v / maxVal) * chartH;
    const x    = padL + gap + i * (barW + gap);
    const y    = padT + chartH - barH;

    // Bar color: today = amber, rest = teal
    const isToday = day === new Date().toISOString().slice(0, 10);
    const alpha   = v > 0 ? 1 : 0.15;

    if (isToday) {
      ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`; // amber
    } else {
      ctx.fillStyle = `rgba(56, 189, 148, ${alpha})`;  // teal
    }

    const radius = Math.min(3, barH / 2);
    roundRect(ctx, x, y, barW, barH, radius);
    ctx.fill();

    // X-axis label every 5 days
    if (i % 5 === 0 || isToday) {
      ctx.fillStyle = isToday ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.25)';
      ctx.font      = `${9}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(day.slice(5), x + barW / 2, H - padB + 14);
    }
  });

  /* X-axis line */
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  ctx.lineTo(W - padR, padT + chartH);
  ctx.stroke();
}

/** Helper: rounded rectangle path */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* ────────────────────────────────────────────
   MODAL HELPERS
──────────────────────────────────────────── */

/**
 * Show a simple inline prompt modal.
 * @param {string} title
 * @param {string} placeholder
 * @param {string} defaultValue
 * @param {Function} onConfirm  - called with trimmed input string
 */
export function showPromptModal(title, placeholder, defaultValue, onConfirm) {
  removeModal();
  const overlay = el('div', 'modal-overlay');
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-title">${escHtml(title)}</div>
      <input class="modal-input" type="text" placeholder="${escHtml(placeholder)}"
             value="${escHtml(defaultValue)}" maxlength="120" autocomplete="off">
      <div class="modal-actions">
        <button class="btn-cancel modal-btn">Cancel</button>
        <button class="btn-confirm modal-btn btn-primary">Confirm</button>
      </div>
    </div>`;

  const input   = overlay.querySelector('.modal-input');
  const confirm = overlay.querySelector('.btn-confirm');
  const cancel  = overlay.querySelector('.btn-cancel');

  const submit = () => {
    const val = input.value.trim();
    if (!val) { input.classList.add('input-error'); return; }
    removeModal();
    onConfirm(val);
  };

  confirm.addEventListener('click', submit);
  cancel.addEventListener('click', removeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') removeModal();
    input.classList.remove('input-error');
  });

  document.body.appendChild(overlay);
  // Focus and select all for easy overwriting
  setTimeout(() => { input.focus(); input.select(); }, 10);
}

/** Show a confirm/delete modal */
export function showConfirmModal(message, onConfirm) {
  removeModal();
  const overlay = el('div', 'modal-overlay');
  overlay.innerHTML = `
    <div class="modal modal-danger" role="dialog" aria-modal="true">
      <div class="modal-title">Confirm Delete</div>
      <p class="modal-msg">${escHtml(message)}</p>
      <div class="modal-actions">
        <button class="btn-cancel modal-btn">Cancel</button>
        <button class="btn-delete-confirm modal-btn btn-danger">Delete</button>
      </div>
    </div>`;

  overlay.querySelector('.btn-cancel').addEventListener('click', removeModal);
  overlay.querySelector('.btn-delete-confirm').addEventListener('click', () => {
    removeModal();
    onConfirm();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
  document.body.appendChild(overlay);
}

/** Show a brief toast notification */
export function showToast(message, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = el('div', `toast toast-${type}`);
  toast.id = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/** Remove any open modal */
export function removeModal() {
  document.querySelector('.modal-overlay')?.remove();
}

/* ────────────────────────────────────────────
   UTILITIES
──────────────────────────────────────────── */

/** Create an element with optional className */
function el(tag, className = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/** Escape HTML to prevent XSS */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
