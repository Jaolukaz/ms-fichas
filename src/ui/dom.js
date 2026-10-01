export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function debounce(fn, ms) {
  let t;
  let lastArgs;
  const d = (...a) => { lastArgs = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; return fn(...(lastArgs || [])); } return undefined; };
  d.pending = () => !!t;
  return d;
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);
