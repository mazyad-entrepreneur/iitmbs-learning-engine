/**
 * src/ui/modals.js — Modal & Toast Components
 *
 * showPromptModal  — text input dialog
 * showConfirmModal — yes/no danger dialog
 * showToast        — temporary notification
 * removeModal      — close any open modal
 */

export function removeModal() {
    document.querySelector('.modal-overlay')?.remove();
}

export function showPromptModal(title, placeholder, defaultValue, onConfirm) {
    removeModal();
    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal');
    const ttl = el('div', 'modal-title'); ttl.textContent = title;
    const input = document.createElement('input');
    input.className = 'modal-input'; input.type = 'text';
    input.placeholder = placeholder; input.value = defaultValue || '';
    input.maxLength = 120; input.autocomplete = 'off';
    const acts = el('div', 'modal-actions');
    const cancl = el('button', 'modal-btn btn-cancel'); cancl.textContent = 'Cancel';
    const conf = el('button', 'modal-btn btn-confirm'); conf.textContent = 'Confirm';
    acts.appendChild(cancl); acts.appendChild(conf);
    modal.appendChild(ttl); modal.appendChild(input); modal.appendChild(acts);
    overlay.appendChild(modal); document.body.appendChild(overlay);
    setTimeout(() => { input.focus(); input.select(); }, 20);

    const submit = () => {
        const v = input.value.trim();
        if (!v) {
            input.classList.add('input-error');
            setTimeout(() => input.classList.remove('input-error'), 400);
            return;
        }
        removeModal();
        onConfirm(v);
    };

    conf.addEventListener('click', submit);
    cancl.addEventListener('click', removeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') removeModal();
    });
}

export function showConfirmModal(message, onConfirm) {
    removeModal();
    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal modal-danger');
    const ttl = el('div', 'modal-title'); ttl.textContent = 'Confirm';
    const msg = el('p', 'modal-msg'); msg.textContent = message;
    const acts = el('div', 'modal-actions');
    const canc = el('button', 'modal-btn btn-cancel'); canc.textContent = 'Cancel';
    const del = el('button', 'modal-btn btn-danger'); del.textContent = 'Confirm';
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
    setTimeout(() => {
        t.classList.remove('toast-visible');
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

/* ── Shared DOM helper (local to this module) ── */
function el(tag, cls = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}
