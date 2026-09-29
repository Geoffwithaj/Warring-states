// Tiny DOM helpers.

const SVG_NS = 'http://www.w3.org/2000/svg';

function build(el, attrs, children) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && !(el instanceof SVGElement) && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const h = (tag, attrs, ...children) => build(document.createElement(tag), attrs, children);
export const s = (tag, attrs, ...children) => build(document.createElementNS(SVG_NS, tag), attrs, children);

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function bar(value, max, color) {
  return h('div', { class: 'bar' }, h('div', { style: { width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color || '' } }));
}

export function select(options, value, onChange, attrs = {}) {
  const el = h('select', { ...attrs, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
  return el;
}

export function numberInput(value, { min = 0, max = 1e9, step = 1, onInput }) {
  const el = h('input', { type: 'number', value, min, max, step, style: { width: '90px' } });
  el.addEventListener('input', () => onInput(Math.max(min, Math.min(max, Number(el.value) || 0))));
  return el;
}

// A slider paired with a number box.
export function slider(value, { min = 0, max = 100, step = 1, onInput }) {
  const range = h('input', { type: 'range', value, min, max, step });
  const num = h('input', { type: 'number', value, min, max, step, style: { width: '90px' } });
  const set = (v) => {
    v = Math.max(min, Math.min(max, Math.round(Number(v) / step) * step || 0));
    range.value = v;
    num.value = v;
    onInput(v);
  };
  range.addEventListener('input', () => set(range.value));
  num.addEventListener('change', () => set(num.value));
  return h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, range, num);
}
