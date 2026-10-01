/**
 * QR code: a matriz é gerada uma vez e desenhada como vetor (interface, prévia e PDF).
 * Módulos escuros vizinhos na mesma linha são unidos em um só retângulo, o que deixa
 * o caminho curto e o PDF leve.
 */
import qrcode from 'qrcode-generator';

const cache = new Map();

/** @returns {{n:number, dark:(r:number,c:number)=>boolean}|null} */
export function qrMatrix(text) {
  if (!text) return null;
  if (cache.has(text)) return cache.get(text);
  let out = null;
  try {
    const q = qrcode(0, 'M');
    // bytes UTF-8 como "string binária": acentos e símbolos em links funcionam em qualquer leitor
    q.addData(unescape(encodeURIComponent(text)), 'Byte');
    q.make();
    const n = q.getModuleCount();
    out = { n, dark: (r, c) => q.isDark(r, c) };
  } catch {
    out = null;
  }
  if (cache.size > 200) cache.clear();
  cache.set(text, out);
  return out;
}

const f3 = (v) => +v.toFixed(3);

/** Caminho SVG dos módulos escuros, em (x, y) com lado total `size` (sem a margem branca). */
export function qrPath(text, x = 0, y = 0, size = 1) {
  const m = qrMatrix(text);
  if (!m) return '';
  const k = size / m.n;
  let d = '';
  for (let r = 0; r < m.n; r += 1) {
    let c = 0;
    while (c < m.n) {
      if (!m.dark(r, c)) { c += 1; continue; }
      let e = c;
      while (e < m.n && m.dark(r, e)) e += 1;
      d += `M${f3(x + c * k)} ${f3(y + r * k)}h${f3((e - c) * k)}v${f3(k)}h${f3(-(e - c) * k)}z`;
      c = e;
    }
  }
  return d;
}

/** SVG completo (com margem branca de 2 módulos) para a interface. */
export function qrSvg(text, color = '#1c1e21') {
  const m = qrMatrix(text);
  if (!m) return '';
  const n = m.n;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#ffffff"/><path d="${qrPath(text, 0, 0, n)}" fill="${color}"/></svg>`;
}
