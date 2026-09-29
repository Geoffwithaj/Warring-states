import { h, clear } from './dom.js';

const root = () => document.getElementById('modal-root');

// Opens a modal. `actions` are footer buttons; each onClick may return false to
// keep the modal open. Returns a handle with close() and setActions().
export function openModal({ title, body, actions = [{ label: 'Close' }], wide = false, dismissable = true }) {
  const footer = h('footer');
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
  };
  const setActions = (list) => {
    clear(footer);
    for (const a of list) {
      footer.append(h('button', {
        class: a.primary ? 'primary' : a.danger ? 'danger' : '',
        disabled: !!a.disabled,
        onclick: () => {
          const keep = a.onClick ? a.onClick() === false : false;
          if (!keep) close();
        },
      }, a.label));
    }
  };
  const modal = h('div', { class: 'modal', style: wide ? { width: 'min(900px, 94vw)' } : {} },
    h('header', {}, h('h2', {}, title), h('div', { class: 'spacer' }),
      dismissable ? h('button', { class: 'small', onclick: close, title: 'Close' }, '✕') : null),
    h('div', { class: 'body' }, body),
    footer);
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back && dismissable) close(); } }, modal);
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  document.addEventListener('keydown', onKey);
  setActions(actions);
  root().append(back);
  return { close, setActions, body: modal.querySelector('.body') };
}

export function alertModal(title, message) {
  return openModal({ title, body: h('p', {}, message), actions: [{ label: 'OK', primary: true }] });
}

export function confirmModal(title, message, onYes, yesLabel = 'Yes') {
  return openModal({ title, body: h('p', {}, message), actions: [{ label: 'Cancel' }, { label: yesLabel, primary: true, onClick: onYes }] });
}
