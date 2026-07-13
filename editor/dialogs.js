// Neku Studio — modal dialogs + toast notifications.
// Replaces alert/confirm/prompt with pixel-styled, keyboard-friendly UI.
//
//   await confirmDlg({ title, message, okText, danger })   -> boolean
//   await promptDlg({ title, label, value, placeholder })  -> string | null
//   toast('Saved project', 'ok')                            kinds: ok | warn | err | info

function openModal({ title, bodyHTML, buttons, onOpen }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';
    overlay.innerHTML = `
      <div class="dlg" role="dialog" aria-modal="true">
        <div class="dlg-title"><img src="cwat.svg" alt="" class="dlg-cat" /><span>${title}</span></div>
        <div class="dlg-body">${bodyHTML}</div>
        <div class="dlg-actions"></div>
      </div>`;
    const actions = overlay.querySelector('.dlg-actions');
    const done = (value) => {
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 90);
      window.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.accent) el.classList.add('accent');
      if (b.danger) el.classList.add('danger-btn');
      el.addEventListener('click', () => done(b.value(overlay)));
      actions.appendChild(el);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(buttons.find((b) => b.isCancel)?.value(overlay) ?? null); }
      if (e.key === 'Enter' && !e.isComposing) {
        const primary = buttons.find((b) => b.accent);
        if (primary) { e.preventDefault(); e.stopPropagation(); done(primary.value(overlay)); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) done(buttons.find((b) => b.isCancel)?.value(overlay) ?? null);
    });
    document.body.appendChild(overlay);
    onOpen?.(overlay);
  });
}

export function confirmDlg({ title = 'CONFIRM', message = '', okText = 'OK', cancelText = 'Cancel', danger = false }) {
  return openModal({
    title,
    bodyHTML: `<div class="dlg-msg">${message}</div>`,
    buttons: [
      { label: cancelText, value: () => false, isCancel: true },
      { label: okText, value: () => true, accent: !danger, danger },
    ],
  });
}

export function promptDlg({ title = 'INPUT', label = '', value = '', placeholder = '', okText = 'OK' }) {
  return openModal({
    title,
    bodyHTML: `
      ${label ? `<div class="dlg-msg">${label}</div>` : ''}
      <input type="text" class="dlg-input" spellcheck="false" placeholder="${placeholder}" />`,
    buttons: [
      { label: 'Cancel', value: () => null, isCancel: true },
      { label: okText, value: (ov) => ov.querySelector('.dlg-input').value.trim() || null, accent: true },
    ],
    onOpen(overlay) {
      const input = overlay.querySelector('.dlg-input');
      input.value = value;
      input.focus();
      input.select();
    },
  });
}

// Info dialog with arbitrary HTML (used by About).
export function infoDlg({ title, bodyHTML, okText = 'Close' }) {
  return openModal({
    title,
    bodyHTML,
    buttons: [{ label: okText, value: () => true, accent: true, isCancel: true }],
  });
}

// --- toasts ---------------------------------------------------------------

let toastBox = null;

export function toast(message, kind = 'info', ms = 2600) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.id = 'toasts';
    document.body.appendChild(toastBox);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  const icon = { ok: '✔', warn: '▲', err: '✖', info: '◆' }[kind] || '◆';
  t.innerHTML = `<span class="toast-ico">${icon}</span><span></span>`;
  t.lastElementChild.textContent = message;
  toastBox.appendChild(t);
  while (toastBox.children.length > 5) toastBox.firstChild.remove();
  setTimeout(() => {
    t.classList.add('bye');
    setTimeout(() => t.remove(), 250);
  }, ms);
  return t;
}
