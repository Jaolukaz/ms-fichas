/**
 * Utilitários tipográficos do motor de layout.
 * Unidades: geometria em milímetros, corpo de fonte em pontos tipográficos.
 *
 * A linha de base é calculada como o navegador faz numa caixa de linha CSS:
 * meia entrelinha + ascendente da fonte. Por isso as medidas da versão web (CSS)
 * puderam ser transcritas diretamente para o motor.
 */
export const PT = 25.4 / 72; // mm por ponto
export const MM_TO_PT = 72 / 25.4;
export const PX = 25.4 / 96; // mm por pixel CSS

/** Fontes do relatório: chave → família, peso e métricas verticais (em em). */
export const FONTS = {
  o500: { file: 'Oswald-500', family: 'MS Oswald', weight: 500, asc: 1.193, desc: 0.289 },
  o600: { file: 'Oswald-600', family: 'MS Oswald', weight: 600, asc: 1.193, desc: 0.289 },
  i400: { file: 'Inter-400', family: 'MS Inter', weight: 400, asc: 0.96875, desc: 0.2412 },
  i500: { file: 'Inter-500', family: 'MS Inter', weight: 500, asc: 0.96875, desc: 0.2412 },
  i600: { file: 'Inter-600', family: 'MS Inter', weight: 600, asc: 0.96875, desc: 0.2412 },
  i700: { file: 'Inter-700', family: 'MS Inter', weight: 700, asc: 0.96875, desc: 0.2412 },
};
export const FONT_KEYS = Object.keys(FONTS);

/** Altura de uma linha (mm) para um corpo em pt e um fator de entrelinha CSS. */
export const lh = (size, factor = 1.4) => size * PT * factor;

/** Linha de base (mm) do texto numa caixa de linha que começa em `top`. */
export function baseline(top, f, size, factor = 1.4) {
  const m = FONTS[f];
  const s = size * PT;
  return top + (s * factor - (m.asc + m.desc) * s) / 2 + m.asc * s;
}

/** Normaliza espaços para que PDF e SVG exibam exatamente o mesmo texto. */
export const clean = (s) => String(s ?? '').replace(/[ \t\u00A0]+/g, ' ').trim();

/**
 * Quebra um texto em linhas que caibam em maxW (mm), respeitando quebras de parágrafo.
 * Palavras maiores que a largura são partidas por caractere (como overflow-wrap: anywhere).
 * @param {(s:string,f:string,size:number,ls?:number)=>number} measure largura em mm
 */
export function wrap(measure, text, font, size, maxW, ls = 0, firstW = maxW) {
  const out = [];
  const paras = String(text ?? '').replace(/\r/g, '').split('\n');
  for (const para of paras) {
    const words = para.split(/[ \t\u00A0]+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    const lim = () => (out.length === 0 ? firstW : maxW);
    for (let w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (measure(cand, font, size, ls) <= lim()) { line = cand; continue; }
      if (line) { out.push(line); line = ''; }
      while (measure(w, font, size, ls) > lim() && w.length > 1) {
        let i = w.length - 1;
        while (i > 1 && measure(w.slice(0, i), font, size, ls) > lim()) i -= 1;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  while (out.length > 1 && out[0] === '') out.shift();
  return out;
}

/** Corta um texto com reticências para caber numa largura. */
export function ellipsize(measure, text, font, size, maxW, ls = 0) {
  const s = clean(text);
  if (measure(s, font, size, ls) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${s.slice(0, mid).trimEnd()}…`, font, size, ls) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo).trimEnd()}…`;
}

/** Mistura duas cores hex (a sobre b) com opacidade `t`, como uma cor rgba sobre um fundo. */
export function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}
