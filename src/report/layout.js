/**
 * Motor de layout do PDF das fichas de treino.
 *
 * Recebe { config, aluno, fichas } e devolve, para cada página A4, uma "lista de desenho"
 * (retângulos, círculos, caminhos, textos, imagens e links) em milímetros, com origem no
 * canto superior esquerdo. A mesma lista é desenhada em SVG (prévia) e em PDF vetorial,
 * então a tela e o arquivo são idênticos por construção, em qualquer aparelho.
 *
 * As medidas foram transcritas do CSS da versão web (ficha.html, rota de impressão):
 * capa sem margens, páginas de ficha com margem de 13 mm em cima, 15 mm embaixo e 12 mm
 * nas laterais, rodapé com profissional, aluno e "Página X de Y".
 *
 * Regras de paginação (as mesmas da versão web):
 *  - cada ficha começa numa página nova, com faixa da logo e cabeçalho;
 *  - um card de exercício nunca é dividido entre páginas;
 *  - título de seção fica sempre junto do exercício seguinte;
 *  - o cabeçalho de um super-set fica junto do primeiro card do grupo, e um super-set que
 *    atravessa páginas recebe a linha lateral em cada trecho;
 *  - a capa se ajusta em etapas quando o resumo não cabe e, em último caso, o excedente
 *    segue para uma página de continuação.
 * Um bloco maior que uma página inteira é marcado em `overflowPages` (a interface avisa).
 *
 * O módulo é puro (sem DOM): a medição de texto é injetada, o que permite rodar os
 * mesmos cálculos no navegador e nos testes em Node.
 */
import { LEGEND } from '../core/config.js';
import { RI, RI_PLAY } from '../core/icons.js';
import { codesFor, exCount, fichaLetter, has, normUrl, shortUrl, ssDefault, sumSub, trim } from '../core/model.js';
import { qrMatrix, qrPath } from '../core/qr.js';
import { PT, PX, baseline, clean, ellipsize, lh, mix, wrap } from './text.js';

export const PAGE = { w: 210, h: 297, x0: 12, cw: 186, top: 13, bottom: 282 };
PAGE.right = PAGE.x0 + PAGE.cw;
export const C = {
  ink: '#1c1e21', ink2: '#3a3e44', dmut: '#6b7079', rule: '#dcdfe3', soft: '#f1f2f4',
  dark: '#1d1f22', dark2: '#282b2f', white: '#ffffff', foot: '#8a9098', play: '#16181b',
};
const B = PX; // borda de 1px CSS
const f3 = (v) => +v.toFixed(3);
const sum = (a) => a.reduce((x, y) => x + y, 0);

/* ---------------- geometria auxiliar ---------------- */
/** Caminho de retângulo com raio por canto [sup. esq., sup. dir., inf. dir., inf. esq.]. */
export function roundRectPath(x, y, w, h, r) {
  const [a, b, c, d] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v || 0, w / 2, h / 2)));
  const arc = (rr, ex, ey) => (rr ? `A${f3(rr)} ${f3(rr)} 0 0 1 ${f3(ex)} ${f3(ey)}` : `L${f3(ex)} ${f3(ey)}`);
  return `M${f3(x + a)} ${f3(y)}H${f3(x + w - b)}${arc(b, x + w, y + b)}V${f3(y + h - c)}${arc(c, x + w - c, y + h)}`
    + `H${f3(x + d)}${arc(d, x, y + h - d)}V${f3(y + a)}${arc(a, x + a, y)}Z`;
}

/** Recorta um polígono convexo pelo semiplano a·x + b·y ≤ c. */
function clipPoly(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const P = poly[i];
    const Q = poly[(i + 1) % poly.length];
    const fp = a * P[0] + b * P[1] - c;
    const fq = a * Q[0] + b * Q[1] - c;
    if (fp <= 0) out.push(P);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
    }
  }
  return out;
}

/**
 * Textura "knurl" (serrilhado da barra): duas famílias de listras diagonais cruzadas,
 * como os dois repeating-linear-gradient (135° e 45°) da versão web.
 */
export function hatchPath(x, y, w, h, period, thick) {
  const rect = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const S = Math.SQRT1_2;
  let d = '';
  for (const [ux, uy] of [[S, S], [S, -S]]) {
    const ps = rect.map((p) => p[0] * ux + p[1] * uy);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    for (let k = Math.floor(lo / period); k * period < hi; k += 1) {
      const c1 = k * period;
      let poly = clipPoly(rect, -ux, -uy, -c1);
      poly = clipPoly(poly, ux, uy, c1 + thick);
      if (poly.length >= 3) d += `M${poly.map((p) => `${f3(p[0])} ${f3(p[1])}`).join('L')}Z`;
    }
  }
  return d;
}

/* ---------------- folha ---------------- */
class Sheet {
  constructor(n, kind) {
    this.n = n;
    this.kind = kind;
    this.items = [];
    this.overflow = false;
  }
  add(it) { this.items.push(it); }
  /** Retângulo; com `inset`, o traço fica por dentro da caixa, como uma borda CSS. */
  rect(x, y, w, h, fill, extra = {}) {
    if (extra.inset && extra.stroke) {
      const k = (extra.sw || 0) / 2;
      const r = Array.isArray(extra.r) ? extra.r.map((v) => Math.max(0, v - k)) : Math.max(0, (extra.r || 0) - k);
      const { inset, ...rest } = extra;
      this.add({ t: 'rect', x: x + k, y: y + k, w: w - 2 * k, h: h - 2 * k, fill, ...rest, r });
      return;
    }
    this.add({ t: 'rect', x, y, w, h, fill, ...extra });
  }
  circle(cx, cy, r, fill, extra = {}) { this.add({ t: 'circle', cx, cy, r, fill, ...extra }); }
  path(d, extra = {}) { if (d) this.add({ t: 'path', d, tx: 0, ty: 0, s: 1, ...extra }); }
  text(x, y, s, f, size, color, extra = {}) { if (s) this.add({ t: 'text', x, y, s, f, size, color, anchor: 'start', ls: 0, ...extra }); }
  image(ref, x, y, w, h, extra = {}) { this.add({ t: 'image', ref, x, y, w, h, fit: 'contain', ...extra }); }
  link(x, y, w, h, url) { if (/^https?:\/\//i.test(url || '')) this.add({ t: 'link', x, y, w, h, url }); }
  /** Ícone de traço da caixa 24 × 24, com lado `size` mm. */
  icon(name, x, y, size, color, sw = 1.8) { this.path(RI[name], { tx: x, ty: y, s: size / 24, stroke: color, sw, cap: 'round', join: 'round' }); }
  /** QR code com margem branca de 2 módulos, em caixa quadrada de lado `size`. */
  qr(url, x, y, size, color = C.ink) {
    const m = qrMatrix(url);
    if (!m) return;
    const k = size / (m.n + 4);
    this.rect(x, y, size, size, C.white);
    this.path(qrPath(url, x + 2 * k, y + 2 * k, m.n * k), { fill: color });
  }
}

/**
 * @param {{config:object, aluno:object, fichas:Array}} doc
 * @param {{measure:Function, hasMedia?:(id:string)=>boolean, issued?:string}} ctx
 * @returns {{pages:Array<Sheet>, overflowPages:number[]}}
 */
export function layoutDoc(doc, ctx) {
  return new Layout(doc, ctx).run();
}

class Layout {
  constructor(doc, ctx) {
    this.cfg = doc.config;
    this.aluno = doc.aluno;
    this.fichas = doc.fichas;
    this.m = ctx.measure;
    this.hasMedia = ctx.hasMedia || (() => false);
    this.issued = ctx.issued || '';
    this.pages = [];
    this.gid = 0;
    const t = this.cfg.trainer || {};
    const full = trim(t.nome) || 'Matheus Scaldini';
    const parts = full.split(/\s+/);
    this.tn = { full, first: parts.length > 1 ? parts.slice(0, -1).join(' ') : '', last: parts[parts.length - 1], tit: trim(t.titulo) || 'Personal Trainer' };
  }

  /* ================= texto ================= */
  w(s, f, size, ls = 0) { return this.m(s, f, size, ls); }
  lines(s, f, size, maxW, ls = 0) { return wrap(this.m, s, f, size, Math.max(1, maxW), ls); }
  /** Uma linha de texto cuja caixa de linha (CSS) começa em `top`. */
  T(pg, x, top, s, f, size, color, k = 1.4, extra = {}) { pg.text(x, baseline(top, f, size, k), s, f, size, color, extra); }
  /** Várias linhas empilhadas; devolve a altura ocupada. */
  P(pg, x, top, lines, f, size, color, k = 1.4, extra = {}) {
    lines.forEach((l, i) => this.T(pg, x, top + i * lh(size, k), l, f, size, color, k, extra));
    return lines.length * lh(size, k);
  }

  /**
   * Quebra de linha com trechos de fontes diferentes (ex.: "Atenção:" em negrito + texto).
   * @returns {Array<Array<{s:string,f:string,x:number}>>}
   */
  wrapRuns(runs, size, maxW) {
    const words = [];
    runs.forEach((r) => String(r.s).replace(/\r/g, '').split('\n').forEach((para, pi) => {
      if (pi > 0) words.push({ br: true });
      para.split(/[ \t\u00A0]+/).filter(Boolean).forEach((s) => words.push({ s, f: r.f }));
    }));
    const lines = [];
    let line = [];
    let x = 0;
    const flush = () => { lines.push(line); line = []; x = 0; };
    for (const wd of words) {
      if (wd.br) { flush(); continue; }
      const sp = line.length ? this.w(' ', wd.f, size) : 0;
      let ww = this.w(wd.s, wd.f, size);
      if (line.length && x + sp + ww > maxW) flush();
      let s = wd.s;
      while (ww > maxW && s.length > 1) {
        let i = s.length - 1;
        while (i > 1 && this.w(s.slice(0, i), wd.f, size) > maxW) i -= 1;
        line.push({ s: s.slice(0, i), f: wd.f, x: 0 });
        flush();
        s = s.slice(i);
        ww = this.w(s, wd.f, size);
      }
      const gap = line.length ? this.w(' ', wd.f, size) : 0;
      line.push({ s, f: wd.f, x: x + gap });
      x += gap + ww;
    }
    if (line.length || !lines.length) flush();
    // une palavras vizinhas da mesma fonte num só texto (PDF mais leve)
    return lines.map((ln) => ln.reduce((acc, it) => {
      const last = acc[acc.length - 1];
      if (last && last.f === it.f) last.s += ` ${it.s}`; else acc.push({ ...it });
      return acc;
    }, []));
  }

  /* ================= execução ================= */
  run() {
    this.coverPages();
    this.fichas.forEach((f, i) => this.fichaPages(f, i));
    const total = this.pages.length;
    const t = this.cfg.trainer || {};
    const left = [trim(t.nome), trim(t.titulo)].filter(Boolean).join(', ');
    const mid = [trim(this.aluno.nome), trim(this.aluno.periodo)].filter(Boolean).join(', ');
    this.pages.forEach((pg) => {
      if (pg.kind === 'cover') return;
      const y = baseline(PAGE.bottom + 5.6, 'i400', 7.5, 1.4);
      pg.text(PAGE.x0, y, ellipsize(this.m, left, 'i400', 7.5, 62), 'i400', 7.5, C.foot);
      pg.text(105, y, ellipsize(this.m, mid, 'i400', 7.5, 56), 'i400', 7.5, C.foot, { anchor: 'middle' });
      pg.text(PAGE.right, y, `Página ${pg.n} de ${total}`, 'i400', 7.5, C.foot, { anchor: 'end' });
    });
    return { pages: this.pages, overflowPages: this.pages.filter((p) => p.overflow).map((p) => p.n) };
  }

  addPage(kind) {
    const pg = new Sheet(this.pages.length + 1, kind);
    this.pages.push(pg);
    return pg;
  }

  /* ================= logos ================= */
  /** Logo escolhida em `em` pt, com a cor do texto e do fundo (para a opacidade dos detalhes). */
  logoModel(n, emPt, color, bg) {
    const E = emPt * PT;
    const { full, first, last, tit } = this.tn;
    const op = (a) => mix(color, bg, a);
    if (+n === 2) {
      const markW = 3.75 * E;
      const markH = 1.25 * E;
      const L = [];
      if (first) L.push({ s: first.toUpperCase(), f: 'i500', size: 0.5 * emPt, ls: 0.46, c: op(0.72), mt: 0 });
      L.push({ s: last.toUpperCase(), f: 'o600', size: 1.75 * emPt, ls: 0.13, c: color, mt: 0.2 * E, mb: 0.18 * E });
      L.push({ s: tit.toUpperCase(), f: 'i500', size: 0.44 * emPt, ls: 0.42, c: op(0.6), mt: 0 });
      const textH = sum(L.map((l) => (l.mt || 0) + l.size * PT + (l.mb || 0)));
      const w = Math.max(markW, ...L.map((l) => this.w(l.s, l.f, l.size, l.ls)));
      const h = markH + 0.5 * E + textH;
      return {
        w, h,
        draw: (pg, x, top) => {
          const k = markH / 24;
          const mx = x + (w - markW) / 2;
          [[0, 10.8, 72, 2.4, 0], [9, 2, 5.5, 20, 1], [15.5, 5.5, 3.8, 13, 1], [20.3, 9, 2.2, 6, 0], [57.5, 2, 5.5, 20, 1], [52.7, 5.5, 3.8, 13, 1], [49.5, 9, 2.2, 6, 0]]
            .forEach(([rx, ry, rw, rh, rr]) => pg.rect(mx + rx * k, top + ry * k, rw * k, rh * k, color, rr ? { r: rr * k } : {}));
          let y = top + markH + 0.5 * E;
          L.forEach((l) => {
            y += l.mt || 0;
            this.T(pg, x + w / 2, y, l.s, l.f, l.size, l.c, 1, { anchor: 'middle', ls: l.ls });
            y += l.size * PT + (l.mb || 0);
          });
        },
      };
    }
    if (+n === 3) {
      const mark = 3 * E;
      const bSize = 1.08 * emPt;
      const iSize = 0.5 * emPt;
      const textW = Math.max(this.w(full, 'i600', bSize, -0.005), this.w(tit.toUpperCase(), 'i500', iSize, 0.32));
      const textH = bSize * PT * 1.1 + 0.62 * E + iSize * PT;
      const h = Math.max(mark, textH);
      const w = mark + 0.72 * E + B + 0.72 * E + textW;
      return {
        w, h,
        draw: (pg, x, top) => {
          const s = mark / 48;
          const my = top + (h - mark) / 2;
          const st = (d, sw, extra = {}) => pg.path(d, { tx: x, ty: my, s, stroke: color, sw, ...extra });
          st('M2.5 24a21.5 21.5 0 1 0 43 0a21.5 21.5 0 1 0 -43 0', 2);
          st('M6.2 24a17.8 17.8 0 1 0 35.6 0a17.8 17.8 0 1 0 -35.6 0', 0.9);
          st('M12.5 30.5L12.5 17.5L18.25 24.5L24 17.5L24 30.5', 2.6, { cap: 'square', join: 'miter' });
          st('M35.5 17.5H31a3 3 0 0 0 0 6.5h1.5a3.25 3.25 0 0 1 0 6.5H27.5', 2.6);
          pg.rect(x + mark + 0.72 * E, top, B, h, op(0.3));
          const tx = x + mark + 1.44 * E + B;
          const ty = top + (h - textH) / 2;
          this.T(pg, tx, ty, full, 'i600', bSize, color, 1.1, { ls: -0.005 });
          this.T(pg, tx, ty + bSize * PT * 1.1 + 0.62 * E, tit.toUpperCase(), 'i500', iSize, op(0.62), 1, { ls: 0.32 });
        },
      };
    }
    const mark = 2.7 * E;
    const bSize = 1.2 * emPt;
    const iSize = 0.5 * emPt;
    const bTxt = full.toUpperCase();
    const iTxt = tit.toUpperCase();
    const textW = Math.max(this.w(bTxt, 'o600', bSize, 0.07), this.w(iTxt, 'i500', iSize, 0.36));
    const textH = bSize * PT + 0.62 * E + iSize * PT;
    const h = Math.max(mark, textH);
    const w = mark + 0.72 * E + textW;
    return {
      w, h,
      draw: (pg, x, top) => {
        const s = mark / 48;
        const my = top + (h - mark) / 2;
        pg.path('M24 3.5L41.8 13.75L41.8 34.25L24 44.5L6.2 34.25L6.2 13.75Z', { tx: x, ty: my, s, stroke: color, sw: 2.4, join: 'round' });
        pg.path('M15.5 31.5L15.5 17.5L24 26L32.5 17.5L32.5 31.5', { tx: x, ty: my, s, stroke: color, sw: 3.6, join: 'miter', cap: 'square' });
        const tx = x + mark + 0.72 * E;
        const ty = top + (h - textH) / 2;
        this.T(pg, tx, ty, bTxt, 'o600', bSize, color, 1, { ls: 0.07 });
        this.T(pg, tx, ty + bSize * PT + 0.62 * E, iTxt, 'i500', iSize, op(0.66), 1, { ls: 0.36 });
      },
    };
  }

  /** Placa circular com a letra da ficha (anilha). */
  plate(pg, cx, cy, R, letter, size, P) {
    pg.circle(cx, cy, R, P.bg);
    pg.circle(cx, cy, R - P.ring[0], null, { stroke: P.ringC, sw: P.ring[1] });
    if (P.ring2) pg.circle(cx, cy, R - P.ring2[0], null, { stroke: P.ring2C, sw: P.ring2[1] });
    this.T(pg, cx, cy - (size * PT) / 2, letter, 'o600', size, P.fg, 1, { anchor: 'middle' });
  }

  /* ================= capa ================= */
  coverPalette() {
    const light = this.cfg.capa === 'light';
    return light ? {
      light, bg: C.white, text: C.ink, period: C.dmut, periodB: C.ink, k: C.dmut, goal: C.ink2,
      knurl: mix(C.ink, C.white, 0.4), line: C.rule, metaSpan: C.dmut, h3: C.ink, row: C.soft, fc: C.ink2, vSpan: C.dmut,
      sub: C.ink2, more: C.dmut, notes: C.ink2, notesB: C.ink, legend: C.dmut, legendB: C.ink, foot: C.dmut, footB: C.ink,
      plate: { bg: C.dark, fg: C.white, ringC: '#7c828a' },
    } : {
      light, bg: C.dark, text: '#f1f2f4', period: '#9ca2aa', periodB: C.white, k: '#a1a7af', goal: '#cfd3d8',
      knurl: mix(C.white, C.dark, 0.26), line: '#3b3f45', metaSpan: '#9ca2aa', h3: '#e3e6e9', row: C.dark2, fc: '#adb2b9', vSpan: '#8e949c',
      sub: '#adb2b9', more: '#9ca2aa', notes: '#cfd3d8', notesB: '#e3e6e9', legend: '#9ca2aa', legendB: '#e3e6e9', foot: '#9ca2aa', footB: '#eceef1',
      plate: { bg: '#eceef1', fg: C.dark, ringC: '#8b9199' },
    };
  }

  /** Paleta das linhas do resumo numa página branca (continuação da capa). */
  static contPalette() {
    return { text: C.ink, row: C.soft, fc: C.ink2, vSpan: C.dmut, sub: C.ink2, plate: { bg: C.dark, fg: C.white, ringC: '#7c828a' } };
  }

  /** Linha do resumo de uma ficha. mode: 'normal' | 'compact' | 'cols2'. */
  rowModel(f, i, mode, dense, rw, K) {
    const compact = mode !== 'normal';
    const pad = compact ? [1.3, 3, 1.3, 2] : [dense ? 1.8 : 2.8, 4, dense ? 1.8 : 2.8, 3];
    const gap = compact ? 3 : 4;
    const pl = compact ? 8.5 : 11;
    const plCol = compact ? 8.5 : 12;
    const mb = compact ? 1.2 : (dense ? 1.4 : 2);
    const nmS = compact ? 10.5 : 12.5;
    const fcS = compact ? 7.6 : 8.5;
    const fcM = compact ? 0.3 : 0.8;
    const vals = [['Duração', f.duracao || 'Livre'], ['Exercícios', String(exCount(f))], ['Cardio', f.cardio.ativo ? (f.cardio.duracao || 'Sim') : 'Não']];
    const vCols = compact ? [27, 17, 27] : [30, 21, 30];
    const nm = f.nome || 'Ficha';
    const midW = mode === 'cols2' ? rw - pad[1] - pad[3] - plCol - gap : rw - pad[1] - pad[3] - plCol - sum(vCols) - 4 * gap;
    let nameLines;
    let fcLines;
    let subLine = '';
    if (mode === 'cols2') {
      nameLines = [ellipsize(this.m, nm, 'o500', nmS, midW, 0.01)];
      fcLines = has(f.foco) ? [ellipsize(this.m, f.foco, 'i400', fcS, midW)] : [];
      subLine = ellipsize(this.m, sumSub(f), 'i400', 7.3, midW);
    } else {
      nameLines = this.lines(nm, 'o500', nmS, midW, 0.01);
      fcLines = has(f.foco) ? this.lines(f.foco, 'i400', fcS, midW) : [];
    }
    const nameH = nameLines.length * lh(nmS, 1.1) + (fcLines.length ? fcM + fcLines.length * lh(fcS) : 0) + (subLine ? 0.4 + lh(7.3) : 0);
    const vsS = compact ? 6.2 : 6.8;
    const vbS = compact ? 8.4 : 9.2;
    const vbM = compact ? 0.2 : 0.4;
    const vLines = vals.map(([, v], k) => this.lines(v, 'i600', vbS, vCols[k]));
    const vH = mode === 'cols2' ? 0 : Math.max(...vLines.map((l) => lh(vsS) + vbM + l.length * lh(vbS)));
    const content = Math.max(pl, nameH, vH);
    const h = content + pad[0] + pad[2];
    const ring = compact ? [0.7, 0.2] : [0.925, 0.25];
    return {
      h, mb,
      draw: (pg, x, y) => {
        pg.rect(x, y, rw, h, K.row, { r: 2 });
        const cy = y + pad[0] + content / 2;
        this.plate(pg, x + pad[3] + pl / 2, cy, pl / 2, fichaLetter(f, i), compact ? 11.5 : 15, { ...K.plate, ring });
        let tx = x + pad[3] + plCol + gap;
        let ty = cy - nameH / 2;
        ty += this.P(pg, tx, ty, nameLines, 'o500', nmS, K.text, 1.1, { ls: 0.01 });
        if (fcLines.length) ty += fcM + this.P(pg, tx, ty + fcM, fcLines, 'i400', fcS, K.fc);
        if (subLine) this.T(pg, tx, ty + 0.4, subLine, 'i400', 7.3, K.sub);
        if (mode === 'cols2') return;
        tx += midW + gap;
        vals.forEach(([label], k) => {
          const vh = lh(vsS) + vbM + vLines[k].length * lh(vbS);
          const vy = cy - vh / 2;
          this.T(pg, tx, vy, label, 'i400', vsS, K.vSpan);
          this.P(pg, tx, vy + lh(vsS) + vbM, vLines[k], 'i600', vbS, K.text);
          tx += vCols[k] + gap;
        });
      },
    };
  }

  /** Lista de linhas do resumo (uma coluna, ou duas colunas lidas de cima para baixo). */
  listModel(idx, mode, dense, width, K) {
    if (mode !== 'cols2') {
      const rows = idx.map((i) => this.rowModel(this.fichas[i], i, mode, dense, width, K));
      return {
        h: sum(rows.map((r) => r.h + r.mb)),
        draw: (pg, x, y) => { let yy = y; rows.forEach((r) => { r.draw(pg, x, yy); yy += r.h + r.mb; }); },
      };
    }
    const cw = (width - 4) / 2;
    const rows = idx.map((i) => this.rowModel(this.fichas[i], i, 'cols2', dense, cw, K));
    const nr = Math.max(1, Math.ceil(rows.length / 2));
    const track = Array.from({ length: nr }, (_, r) => Math.max(...[rows[r], rows[r + nr]].filter(Boolean).map((x) => x.h + x.mb)));
    return {
      h: sum(track),
      draw: (pg, x, y) => {
        rows.forEach((r, k) => {
          const col = Math.floor(k / nr);
          const row = k % nr;
          r.draw(pg, x + col * (cw + 4), y + sum(track.slice(0, row)));
        });
      },
    };
  }

  /** Miolo da capa para uma combinação de etapas de ajuste. */
  coverBody(T, idx, withNotes, withMore, K) {
    const a = this.aluno;
    const W = 178;
    const parts = [];
    const add = (mt, h, draw, mb = 0) => parts.push({ mt, h, draw, mb });
    // nome, objetivo
    const nome = has(a.nome) ? clean(a.nome) : 'Nome do aluno';
    const L = nome.length;
    const size = L <= 12 ? 60 : L <= 18 ? 52 : L <= 26 ? 42 : 34;
    const nameLines = this.lines(nome.toLocaleUpperCase('pt-BR'), 'o600', size, W, 0.004);
    const goalLines = has(a.objetivo) ? this.lines(a.objetivo, 'i400', 13, 155) : [];
    const heroH = lh(10) + 3 + nameLines.length * lh(size, 0.95) + (goalLines.length ? 5 + goalLines.length * lh(13, 1.35) : 0);
    add(T.tight ? 10 : 24, heroH, (pg, x, y) => {
      this.T(pg, x, y, 'Plano individual de', 'i400', 10, K.k);
      let yy = y + lh(10) + 3;
      yy += this.P(pg, x, yy, nameLines, 'o600', size, K.text, 0.95, { ls: 0.004 });
      if (goalLines.length) this.P(pg, x, yy + 5, goalLines, 'i400', 13, K.goal, 1.35);
    });
    // serrilhado
    add(T.tight ? 7 : 11, 3.4, (pg, x, y) => pg.path(hatchPath(x, y, W, 3.4, 1.3, 0.3), { fill: K.knurl }), T.tight ? 5 : 8);
    // dados do ciclo
    const n = this.fichas.length;
    const metas = [['Tempo de treino', a.tempo], ['Frequência', a.frequencia], ['Início', a.inicio], ['Fichas', `${n} ${n === 1 ? 'ficha' : 'fichas'}`]].filter((x) => has(x[1]));
    if (metas.length) {
      const cw = W / metas.length;
      const cells = metas.map(([l, v], k) => ({ l, lines: this.lines(v, 'o500', 12.5, cw - (k ? 8 + B : 4), 0.01) }));
      const ch = 7.2 + lh(7.5) + 1.3 + Math.max(...cells.map((c) => c.lines.length)) * lh(12.5, 1.15);
      add(0, ch + 2 * B, (pg, x, y) => {
        pg.rect(x, y, W, B, K.line);
        pg.rect(x, y + ch + B, W, B, K.line);
        cells.forEach((c, k) => {
          const cx = x + k * cw;
          if (k) pg.rect(cx, y + B, B, ch, K.line);
          const tx = cx + (k ? 4 + B : 0);
          this.T(pg, tx, y + B + 3.6, c.l, 'i400', 7.5, K.metaSpan);
          this.P(pg, tx, y + B + 3.6 + lh(7.5) + 1.3, c.lines, 'o500', 12.5, K.text, 1.15, { ls: 0.01 });
        });
      });
    }
    // resumo das fichas
    const mode = T.cols2 ? 'cols2' : T.compact ? 'compact' : 'normal';
    const list = this.listModel(idx, mode, T.dense, W, K);
    const sumH = 11.5 * PT + 3.6 + list.h + (withMore ? 1.5 + lh(7.8) : 0);
    add(T.tight ? 6 : 9, sumH, (pg, x, y) => {
      this.T(pg, x, y, 'Fichas deste ciclo', 'o500', 11.5, K.h3, 1, { ls: 0.03 });
      list.draw(pg, x, y + 11.5 * PT + 3.6);
      if (withMore) this.T(pg, x, y + 11.5 * PT + 3.6 + list.h + 1.5, 'Continua na próxima página.', 'i400', 7.8, K.more);
    });
    // orientações gerais
    if (withNotes && has(a.orientacoes)) {
      let nl = this.lines(a.orientacoes, 'i400', 9, 170);
      if (nl.length > 7) { nl = nl.slice(0, 7); nl[6] = ellipsize(this.m, `${nl[6]}…`, 'i400', 9, 170); }
      add(T.tight ? 5 : 7, 11.5 * PT + 2.4 + nl.length * lh(9, 1.5), (pg, x, y) => {
        this.T(pg, x, y, 'Orientações gerais', 'o500', 11.5, K.notesB, 1, { ls: 0.03 });
        this.P(pg, x, y + 11.5 * PT + 2.4, nl, 'i400', 9, K.notes, 1.5);
      });
    }
    const h = sum(parts.map((p) => p.mt + p.h + p.mb));
    return {
      h,
      draw: (pg, x, y) => { let yy = y; parts.forEach((p) => { yy += p.mt; p.draw(pg, x, yy); yy += p.h + p.mb; }); },
    };
  }

  coverPages() {
    const K = this.coverPalette();
    const pg = this.addPage('cover');
    const cfg = this.cfg;
    const a = this.aluno;
    const X = 16;
    const W = 178;
    if (!K.light) pg.rect(0, 0, 210, 297, K.bg);
    // topo: logo e período
    const logo = this.logoModel(cfg.logo, +cfg.logo === 2 ? 11 : 12, K.text, K.bg);
    const per = trim(a.periodo) || String(new Date().getFullYear());
    const perH = lh(8.5) + 1 + lh(17, 1.1);
    const topH = Math.max(logo.h, perH);
    logo.draw(pg, X, 16);
    this.T(pg, X + W, 16, 'Planejamento de treino', 'i400', 8.5, K.period, 1.4, { anchor: 'end' });
    this.T(pg, X + W, 16 + lh(8.5) + 1, per, 'o500', 17, K.periodB, 1.1, { anchor: 'end', ls: 0.02 });
    // rodapé da capa (de baixo para cima)
    const t = cfg.trainer || {};
    const dateTxt = `Emitido em ${this.issued}`;
    const dateW = this.w(dateTxt, 'i400', 8);
    const who = [{ s: trim(t.nome), f: 'i600', c: K.footB }, { s: trim(t.titulo), f: 'i400', c: K.foot }];
    if (has(t.cref)) who.push({ s: `CREF ${trim(t.cref)}`, f: 'i400', c: K.foot });
    if (has(t.contato)) who.push({ s: trim(t.contato), f: 'i400', c: K.foot });
    const whoMax = W - dateW - 8;
    const whoRows = [[]];
    let rx = 0;
    who.filter((it) => it.s).forEach((it) => {
      const s = ellipsize(this.m, it.s, it.f, 8, whoMax);
      const ww = this.w(s, it.f, 8);
      const g = whoRows[whoRows.length - 1].length ? 4 : 0;
      if (rx + g + ww > whoMax && whoRows[whoRows.length - 1].length) { whoRows.push([]); rx = 0; }
      const gg = whoRows[whoRows.length - 1].length ? 4 : 0;
      whoRows[whoRows.length - 1].push({ ...it, s, x: rx + gg });
      rx += gg + ww;
    });
    const whoH = whoRows.length * lh(8) + (whoRows.length - 1) * 1;
    const footH = 4 + Math.max(whoH, lh(8));
    const footTop = 297 - 12 - footH;
    pg.rect(X, footTop, W, B, K.line);
    whoRows.forEach((row, r) => row.forEach((it) => this.T(pg, X + it.x, footTop + 4 + r * (lh(8) + 1), it.s, it.f, 8, it.c)));
    this.T(pg, X + W, footTop + footH - lh(8), dateTxt, 'i400', 8, K.foot, 1.4, { anchor: 'end' });
    // legenda
    let legendTop = footTop;
    if (cfg.legenda) {
      const colW = (W - 15) / 4;
      const cols = LEGEND.map(([b, s]) => ({ b, lines: this.lines(s, 'i400', 7.3, colW) }));
      const lhH = 6 + Math.max(...cols.map((c) => lh(8) + 0.8 + c.lines.length * lh(7.3))) + 5;
      legendTop = footTop - lhH;
      cols.forEach((c, k) => {
        const cx = X + k * (colW + 5);
        this.T(pg, cx, legendTop + 6, c.b, 'i600', 8, K.legendB);
        this.P(pg, cx, legendTop + 6 + lh(8) + 0.8, c.lines, 'i400', 7.3, K.legend);
      });
    }
    // miolo: tenta as etapas de ajuste em ordem
    const bodyTop = 16 + topH;
    const avail = legendTop - bodyTop;
    const n = this.fichas.length;
    const all = this.fichas.map((_, i) => i);
    const tiers = [{ dense: n > 5 }, { dense: n > 5, compact: true }, { dense: n > 5, compact: true, cols2: true }, { dense: n > 5, compact: true, cols2: true, tight: true }];
    for (const T of tiers) {
      const body = this.coverBody(T, all, true, false, K);
      if (body.h <= avail + 0.01) { body.draw(pg, X, bodyTop); return; }
    }
    // continuação: primeiro as orientações, depois as últimas fichas
    const T = tiers[tiers.length - 1];
    let k = n;
    let body = this.coverBody(T, all, false, false, K);
    while (body.h > avail + 0.01 && k > 1) {
      k -= 1;
      body = this.coverBody(T, all.slice(0, k), false, true, K);
    }
    body.draw(pg, X, bodyTop);
    if (body.h > avail + 0.01) pg.overflow = true;
    this.coverContinuation(all.slice(k), has(a.orientacoes));
  }

  /** Página(s) de continuação do resumo da capa. */
  coverContinuation(idx, notes) {
    const K = Layout.contPalette();
    let rest = idx.slice();
    while (rest.length || notes) {
      const pg = this.addPage('ficha');
      let y = PAGE.top;
      const strip = this.stripModel();
      strip.draw(pg, PAGE.x0, y);
      y += strip.h + 7;
      if (rest.length) {
        let k = rest.length;
        let list = this.listModel(rest.slice(0, k), 'cols2', false, PAGE.cw, K);
        while (k > 1 && y + 11.5 * PT + 3.6 + list.h > PAGE.bottom) { k -= 1; list = this.listModel(rest.slice(0, k), 'cols2', false, PAGE.cw, K); }
        this.T(pg, PAGE.x0, y, 'Fichas deste ciclo, continuação', 'o500', 11.5, C.ink, 1, { ls: 0.03 });
        list.draw(pg, PAGE.x0, y + 11.5 * PT + 3.6);
        y += 11.5 * PT + 3.6 + list.h;
        rest = rest.slice(k);
        if (rest.length) continue;
      }
      if (notes) {
        const nl = this.lines(this.aluno.orientacoes, 'i400', 9, 170);
        const nh = 11.5 * PT + 2.4 + nl.length * lh(9, 1.5);
        if (y > PAGE.top + strip.h + 7.01 && y + 8 + nh > PAGE.bottom) continue;
        const ny = y > PAGE.top + strip.h + 7.01 ? y + 8 : y;
        this.T(pg, PAGE.x0, ny, 'Orientações gerais', 'o500', 11.5, C.ink, 1, { ls: 0.03 });
        this.P(pg, PAGE.x0, ny + 11.5 * PT + 2.4, nl, 'i400', 9, C.ink2, 1.5);
        if (ny + nh > PAGE.bottom) pg.overflow = true;
        notes = false;
      }
    }
  }

  /* ================= páginas das fichas ================= */
  stripModel() {
    const cfg = this.cfg;
    const a = this.aluno;
    const logo = this.logoModel(cfg.logo, +cfg.logo === 2 ? 6.5 : 7.5, C.ink, C.white);
    const maxW = PAGE.cw - logo.w - 8;
    const nm = has(a.nome) ? ellipsize(this.m, a.nome, 'i600', 8.6, maxW) : '';
    const per = has(a.periodo) ? ellipsize(this.m, a.periodo, 'i400', 8, maxW) : '';
    const rH = (nm ? lh(8.6, 1.3) : 0) + (per ? lh(8, 1.3) : 0);
    const h = Math.max(logo.h, rH);
    return {
      h,
      draw: (pg, x, y) => {
        logo.draw(pg, x, y + (h - logo.h) / 2);
        let ry = y + (h - rH) / 2;
        const rx = x + PAGE.cw;
        if (nm) { this.T(pg, rx, ry, nm, 'i600', 8.6, C.ink, 1.3, { anchor: 'end' }); ry += lh(8.6, 1.3); }
        if (per) this.T(pg, rx, ry, per, 'i400', 8, C.dmut, 1.3, { anchor: 'end' });
      },
    };
  }

  headModel(f, i) {
    const n = exCount(f);
    const cd = f.cardio;
    const chips = [];
    if (has(f.duracao)) chips.push(['tr', f.duracao]);
    chips.push(['list', `${n} exercício${n === 1 ? '' : 's'}`]);
    if (cd.ativo) chips.push(['cardio', `Cardio${has(cd.duracao) ? ` ${cd.duracao}` : ''}`]);
    const chipH = 2 * B + 2.4 + Math.max(3.4, lh(8.4));
    const chipW = chips.map(([, s]) => 2 * B + 6.4 + 3.4 + 1.8 + this.w(s, 'i400', 8.4));
    const chipsW = Math.max(...chipW);
    const chipsH = chips.length * chipH + (chips.length - 1) * 1.6;
    const title = has(f.foco) ? f.foco : (f.nome || 'Ficha');
    const tW = PAGE.cw - 25 - 12 - chipsW;
    const tLines = this.lines(title, 'o600', 23, tW, 0.005);
    const kLines = has(f.foco) ? [ellipsize(this.m, f.nome, 'i400', 9, tW)] : [];
    const tH = (kLines.length ? lh(9) + 1 : 0) + tLines.length * lh(23, 1.05);
    const content = Math.max(25, tH, chipsH);
    return {
      h: content + 5 + 0.7, mb: 6,
      draw: (pg, x, y) => {
        this.plate(pg, x + 12.5, y + content / 2, 12.5, fichaLetter(f, i), 36,
          { bg: C.dark, fg: C.white, ring: [1.7, 0.4], ringC: '#7a8088', ring2: [5.575, 0.35], ring2C: '#4f545b' });
        let ty = y + (content - tH) / 2;
        const tx = x + 25 + 6;
        if (kLines.length) { this.T(pg, tx, ty, kLines[0], 'i400', 9, C.dmut); ty += lh(9) + 1; }
        this.P(pg, tx, ty, tLines, 'o600', 23, C.ink, 1.05, { ls: 0.005 });
        let cy = y + (content - chipsH) / 2;
        chips.forEach(([ico, s], k) => {
          const cw = chipW[k];
          const cx = x + PAGE.cw - cw;
          pg.rect(cx, cy, cw, chipH, null, { r: chipH / 2, stroke: C.rule, sw: B, inset: true });
          pg.icon(ico, cx + B + 3.2, cy + (chipH - 3.4) / 2, 3.4, C.dmut, 1.8);
          this.T(pg, cx + B + 3.2 + 3.4 + 1.8, cy + B + 1.2 + (chipH - 2 * B - 2.4 - lh(8.4)) / 2, s, 'i400', 8.4, C.ink2);
          cy += chipH + 1.6;
        });
        pg.rect(x, y + content + 5, PAGE.cw, 0.7, C.ink);
      },
    };
  }

  noteModel(f) {
    const lines = this.lines(f.obs, 'i400', 9, PAGE.cw - 8);
    const h = 6 + lines.length * lh(9, 1.5);
    return {
      h, mb: 5,
      draw: (pg, x, y) => { pg.rect(x, y, PAGE.cw, h, C.soft, { r: 2 }); this.P(pg, x + 4, y + 3, lines, 'i400', 9, C.ink2, 1.5); },
    };
  }

  /** Mídia do exercício disponível para o PDF. */
  mediaOf(e) {
    const m = e.media;
    if (m.tab === 'image' && m.imageId && this.hasMedia(m.imageId)) return { kind: 'image', ref: `media:${m.imageId}` };
    if (m.tab === 'video' && (m.posterId || m.videoId)) {
      const vu = normUrl(m.videoUrl);
      return { kind: 'video', ref: m.posterId && this.hasMedia(m.posterId) ? `media:${m.posterId}` : null, url: vu };
    }
    if (m.tab === 'link' && has(m.url)) return { kind: 'link', url: normUrl(m.url) };
    return null;
  }

  /** Card de exercício com largura W. */
  cardModel(e, code, W) {
    const media = this.mediaOf(e);
    const mw = media ? 47 : 0;
    const cw = W - 2 * B - mw - 9;
    const parts = [];
    // cabeçalho: código, nome e grupo
    const codeW = Math.max(9, this.w(code, 'o600', 16, 0.02) + 0.02 * 16 * PT);
    const tw = cw - codeW - 3;
    const nameLines = this.lines(e.nome || 'Exercício sem nome', 'o500', 13.5, tw, 0.005);
    const grpLines = has(e.grupo) ? this.lines(e.grupo, 'i400', 8, tw) : [];
    const nameH = nameLines.length * lh(13.5, 1.15);
    const tH = nameH + (grpLines.length ? 0.9 + grpLines.length * lh(8) : 0);
    parts.push({
      h: Math.max(0.2 + 16 * PT, tH),
      draw: (pg, x, y) => {
        this.T(pg, x, y + 0.2, code, 'o600', 16, C.ink, 1, { ls: 0.02 });
        this.P(pg, x + codeW + 3, y, nameLines, 'o500', 13.5, C.ink, 1.15, { ls: 0.005 });
        if (grpLines.length) this.P(pg, x + codeW + 3, y + nameH + 0.9, grpLines, 'i400', 8, C.dmut);
      },
    });
    // grade de parâmetros
    const tiles = [['series', 'Séries', e.series], ['reps', 'Repetições', e.reps], ['carga', 'Carga', e.carga], ['cad', 'Cadência', e.cadencia], ['tr', 'Descanso', e.tr], ['adm', 'Amplitude', e.adm]]
      .concat(e.extras.filter((x) => has(x.valor)).map((x) => ['extra', x.label || 'Parâmetro', x.valor]))
      .filter((t) => has(t[2]));
    if (tiles.length) {
      const cols = Math.min(3, tiles.length);
      const cellW = (cw - 2 * B - (cols - 1) * B) / cols;
      const txW = cellW - 5.2 - 5.8;
      const cells = tiles.map(([ico, label, val]) => {
        const ll = this.lines(label, 'i400', 6.9, txW);
        const vl = this.lines(String(val).trim(), 'o500', 11, txW, 0.005);
        return { ico, ll, vl, h: 4.4 + Math.max(4.1, ll.length * lh(6.9, 1.2) + 0.3 + vl.length * lh(11, 1.2)) };
      });
      const nRows = Math.ceil(cells.length / cols);
      const rowH = Array.from({ length: nRows }, (_, r) => Math.max(...cells.slice(r * cols, r * cols + cols).map((c) => c.h)));
      const gh = 2 * B + sum(rowH) + (nRows - 1) * B;
      parts.push({
        h: gh,
        draw: (pg, x, y) => {
          pg.rect(x, y, cw, gh, C.rule, { r: 1.6 });
          const ir = 1.6 - B;
          for (let k = 0; k < nRows * cols; k += 1) {
            const r = Math.floor(k / cols);
            const c = k % cols;
            const cx = x + B + c * (cellW + B);
            const cy = y + B + sum(rowH.slice(0, r)) + r * B;
            const rad = [r === 0 && c === 0 ? ir : 0, r === 0 && c === cols - 1 ? ir : 0, r === nRows - 1 && c === cols - 1 ? ir : 0, r === nRows - 1 && c === 0 ? ir : 0];
            pg.rect(cx, cy, cellW, rowH[r], C.white, { r: rad });
            const cell = cells[k];
            if (!cell) continue;
            pg.icon(cell.ico, cx + 2.6, cy + 2.2 + 0.3, 3.8, C.dmut, 1.7);
            const tx = cx + 2.6 + 3.8 + 2;
            const lH = this.P(pg, tx, cy + 2.2, cell.ll, 'i400', 6.9, C.dmut, 1.2);
            this.P(pg, tx, cy + 2.2 + lH + 0.3, cell.vl, 'o500', 11, C.ink, 1.2, { ls: 0.005 });
          }
        },
      });
    }
    // progressão por série
    const rows = e.prog.ativo ? e.prog.linhas.filter((r) => has(r.carga) || has(r.reps) || has(r.nota)) : [];
    if (rows.length) {
      const boxes = rows.map((r, k) => {
        const head = `${trim(r.serie) || `${k + 1}ª`} série`;
        const big = trim(r.carga) || trim(r.reps);
        const small = [];
        if (has(r.carga) && has(r.reps)) small.push(`${trim(r.reps)} reps`);
        if (has(r.nota)) small.push(trim(r.nota));
        const inner = Math.max(this.w(head, 'i400', 6.7), big ? this.w(big, 'o600', 11) : 0, ...small.map((s) => this.w(s, 'i400', 7.1)));
        const bw = Math.min(cw, Math.max(16, inner + 5.2 + 2 * B));
        const h = 2 * B + 3 + lh(6.7) + 0.2 + (big ? lh(11, 1.15) : 0) + small.length * lh(7.1);
        return { head, big, small, w: bw, h };
      });
      // itens em linha: caixa, seta, caixa… com quebra de linha
      const items = [];
      boxes.forEach((b, k) => { if (k) items.push({ arrow: true, w: 3 }); items.push(b); });
      const flines = [[]];
      let lx = 0;
      items.forEach((it) => {
        const cur = flines[flines.length - 1];
        const g = cur.length ? 1.4 : 0;
        if (cur.length && lx + g + it.w > cw) { flines.push([it]); lx = it.w; } else { cur.push(it); lx += g + it.w; }
      });
      const lineH = flines.map((ln) => Math.max(3, ...ln.filter((it) => !it.arrow).map((it) => it.h)));
      const ph = lh(7) + 1.4 + sum(lineH) + (flines.length - 1) * 1.4;
      parts.push({
        h: ph,
        draw: (pg, x, y) => {
          this.T(pg, x, y, 'Progressão por série', 'i400', 7, C.dmut);
          let ly = y + lh(7) + 1.4;
          flines.forEach((ln, li) => {
            let ix = x;
            ln.forEach((it, k) => {
              if (k) ix += 1.4;
              if (it.arrow) {
                pg.icon('right', ix, ly + (lineH[li] - 3) / 2, 3, '#a3a9b0', 2);
              } else {
                pg.rect(ix, ly, it.w, lineH[li], C.soft, { r: 1.4, stroke: C.rule, sw: B, inset: true });
                let ty = ly + B + 1.5;
                this.T(pg, ix + B + 2.6, ty, it.head, 'i400', 6.7, C.dmut);
                ty += lh(6.7) + 0.2;
                if (it.big) { this.T(pg, ix + B + 2.6, ty, it.big, 'o600', 11, C.ink, 1.15); ty += lh(11, 1.15); }
                it.small.forEach((s) => { this.T(pg, ix + B + 2.6, ty, s, 'i400', 7.1, C.ink2); ty += lh(7.1); });
              }
              ix += it.w;
            });
            ly += lineH[li] + 1.4;
          });
        },
      });
    }
    // alerta
    if (has(e.obs)) {
      const aw = cw - 0.8 - 6 - 4 - 2.4;
      const al = this.wrapRuns([{ s: 'Atenção:', f: 'i700' }, { s: ` ${String(e.obs).trim()}`, f: 'i400' }], 8.8, aw);
      const ah = 4.8 + Math.max(4.2, al.length * lh(8.8, 1.45));
      parts.push({
        h: ah,
        draw: (pg, x, y) => {
          pg.rect(x, y, cw, ah, C.soft, { r: [0, 1.4, 1.4, 0] });
          pg.rect(x, y, 0.8, ah, C.ink);
          pg.icon('alert', x + 0.8 + 3, y + 2.4 + 0.2, 4, C.ink, 1.9);
          const tx = x + 0.8 + 3 + 4 + 2.4;
          al.forEach((ln, k) => ln.forEach((run) => this.T(pg, tx + run.x, y + 2.4 + k * lh(8.8, 1.45), run.s, run.f, 8.8, C.ink, 1.45)));
        },
      });
    }
    // link público do vídeo
    if (media && media.kind === 'video' && media.url) {
      const sTxt = this.lines(shortUrl(media.url), 'i400', 6.8, cw - 18);
      const vh = Math.max(15, lh(8.4) + sTxt.length * lh(6.8));
      parts.push({
        h: vh,
        draw: (pg, x, y) => {
          pg.qr(media.url, x, y + (vh - 15) / 2, 15);
          const th = lh(8.4) + sTxt.length * lh(6.8);
          const ty = y + (vh - th) / 2;
          this.T(pg, x + 18, ty, 'Assista à execução', 'i700', 8.4, C.ink);
          this.P(pg, x + 18, ty + lh(8.4), sTxt, 'i400', 6.8, C.dmut);
          pg.link(x, y, cw, vh, media.url);
        },
      });
    }
    const exbH = 8 + sum(parts.map((p) => p.h)) + 3 * (parts.length - 1);
    // coluna de mídia
    let mediaH = 0;
    let linkCol = null;
    if (media) {
      mediaH = 47;
      if (media.kind === 'link') {
        const spanL = this.lines('Aponte a câmera para ver a execução', 'i600', 7.4, 40);
        const smallL = this.lines(shortUrl(media.url), 'i400', 6.4, 40);
        const ch = 31 + 2 + spanL.length * lh(7.4, 1.3) + 2 + smallL.length * lh(6.4, 1.25);
        linkCol = { spanL, smallL, ch };
        mediaH = Math.max(47, 8 + ch);
      }
    }
    const inner = Math.max(mediaH, exbH);
    const H = inner + 2 * B;
    return {
      h: H, mb: 4.5, mt: 0,
      draw: (pg, x, y) => {
        pg.rect(x, y, W, H, C.white, { r: 2.6 });
        if (media) {
          const mx = x + B;
          const my = y + B;
          const ir = 2.6 - B;
          const colW = 47 - B;
          const clipR = [ir, 0, 0, ir];
          pg.rect(mx, my, colW, inner, media.kind === 'link' ? C.white : C.soft, { r: clipR });
          if (media.kind === 'image') pg.image(media.ref, mx, my, colW, inner, { clipR });
          if (media.kind === 'video') {
            if (media.ref) pg.image(media.ref, mx, my, colW, inner, { clipR });
            const cx = mx + colW / 2;
            const cy = my + inner / 2;
            pg.circle(cx, cy, 6, C.play, { opacity: 0.84 });
            pg.path(RI_PLAY, { tx: cx - 2.75 + 0.8 - 0.4, ty: cy - 2.75, s: 5.5 / 24, fill: C.white });
            const capL = this.lines('Vídeo demonstrativo com o personal', 'i400', 7, colW - 4);
            const capH = 2.8 + capL.length * lh(7, 1.25);
            pg.rect(mx, my + inner - capH, colW, capH, C.play, { opacity: 0.84, r: [0, 0, 0, ir] });
            capL.forEach((l, k) => this.T(pg, cx, my + inner - capH + 1.4 + k * lh(7, 1.25), l, 'i400', 7, C.white, 1.25, { anchor: 'middle' }));
          }
          if (media.kind === 'link') {
            const cx = mx + colW / 2;
            let cy = my + (inner - linkCol.ch) / 2;
            pg.qr(media.url, cx - 15.5, cy, 31);
            cy += 33;
            linkCol.spanL.forEach((l) => { this.T(pg, cx, cy, l, 'i600', 7.4, C.ink, 1.3, { anchor: 'middle' }); cy += lh(7.4, 1.3); });
            cy += 2;
            linkCol.smallL.forEach((l) => { this.T(pg, cx, cy, l, 'i400', 6.4, C.dmut, 1.25, { anchor: 'middle' }); cy += lh(6.4, 1.25); });
            pg.link(mx, my, colW, inner, media.url);
          }
          pg.rect(x + 47, my, B, inner, C.rule);
        }
        let yy = y + B + 4;
        const bx = x + B + mw + 4.5;
        parts.forEach((p, k) => { if (k) yy += 3; p.draw(pg, bx, yy); yy += p.h; });
        pg.rect(x, y, W, H, null, { r: 2.6, stroke: C.rule, sw: B, inset: true });
      },
    };
  }

  secModel(b, W) {
    const s = clean(b.titulo).toLocaleUpperCase('pt-BR');
    const tw = this.w(s, 'o600', 11, 0.14) + 0.14 * 11 * PT;
    const h = 11 * PT;
    return {
      h, mt: 6, mb: 4,
      draw: (pg, x, y) => {
        this.T(pg, x, y, ellipsize(this.m, s, 'o600', 11, W - 10, 0.14), 'o600', 11, C.ink, 1, { ls: 0.14 });
        const hx = x + Math.min(tw, W - 10) + 3.5;
        if (x + W - hx > 1) pg.path(hatchPath(hx, y + (h - 2.4) / 2, x + W - hx, 2.4, 1.2, 0.3), { fill: mix(C.ink, C.white, 0.45) });
      },
    };
  }

  ssHeadModel(letter, text, W) {
    const badge = `Super-set ${letter}`;
    const bw = this.w(badge, 'o600', 9.5, 0.06) + 0.06 * 9.5 * PT + 5.2;
    const bh = 9.5 * PT + 3.2;
    let dW = W - bw - 3;
    const below = dW < 50;
    if (below) dW = W;
    const dl = this.lines(text, 'i400', 8.6, dW);
    const dH = dl.length * lh(8.6);
    const h = below ? bh + 3 + dH : Math.max(bh, dH);
    return {
      h, mt: 0, mb: 3,
      draw: (pg, x, y) => {
        const by = below ? y : y + (h - bh) / 2;
        pg.rect(x, by, bw, bh, C.ink, { r: 1 });
        this.T(pg, x + 2.6, by + 1.6, badge, 'o600', 9.5, C.white, 1, { ls: 0.06 });
        if (below) this.P(pg, x, y + bh + 3, dl, 'i400', 8.6, C.ink2);
        else this.P(pg, x + bw + 3, y + (h - dH) / 2, dl, 'i400', 8.6, C.ink2);
      },
    };
  }

  cardioModel(cd, W) {
    const vs = [['Duração', cd.duracao], ['Intensidade', cd.intensidade]].filter((v) => has(v[1])).map(([l, v]) => ({ l, v: clean(v) }));
    vs.forEach((v) => { v.w = 5 + B + Math.max(this.w(v.l, 'i400', 7), this.w(v.v, 'o500', 13)); });
    const ctW = W - 10 - 11 - 5 - sum(vs.map((v) => v.w + 5));
    const pl = has(cd.obs) ? this.lines(cd.obs, 'i400', 8.2, ctW) : [];
    const ctH = lh(13, 1.1) + (pl.length ? 0.8 + pl.length * lh(8.2) : 0);
    const vH = lh(7) + lh(13, 1.15);
    const content = Math.max(11, ctH, vH);
    const h = content + 8;
    return {
      h, mt: 6, mb: 0,
      draw: (pg, x, y) => {
        pg.rect(x, y, W, h, C.dark, { r: 2.6 });
        const cy = y + 4 + content / 2;
        pg.circle(x + 5 + 5.5, cy, 5.5, '#34383d');
        pg.icon('cardio', x + 5 + 5.5 - 2.75, cy - 2.75, 5.5, C.white, 2);
        const tx = x + 5 + 11 + 5;
        let ty = cy - ctH / 2;
        this.T(pg, tx, ty, 'Cardio ao final', 'o500', 13, C.white, 1.1, { ls: 0.01 });
        ty += lh(13, 1.1) + 0.8;
        this.P(pg, tx, ty, pl, 'i400', 8.2, '#bcc1c7');
        let vx = tx + ctW + 5;
        vs.forEach((v) => {
          const vy = cy - vH / 2;
          pg.rect(vx, vy, B, vH, '#3f444a');
          this.T(pg, vx + B + 5, vy, v.l, 'i400', 7, '#9ca2aa');
          this.T(pg, vx + B + 5, vy + lh(7), v.v, 'o500', 13, C.white, 1.15);
          vx += v.w + 5;
        });
      },
    };
  }

  emptyModel() {
    return { h: 20 + lh(10), mt: 0, mb: 0, draw: (pg, x, y) => this.T(pg, x, y + 10, 'Nenhum exercício nesta ficha.', 'i400', 10, C.dmut) };
  }

  /* ---------- fluxo de página ---------- */
  newFichaPage() {
    this.closeSS();
    this.pg = this.addPage('ficha');
    this.y = PAGE.top;
    this.prevMb = 0;
    this.atTop = true;
    this.hasHead = false;
    this.hasBody = false;
  }

  closeSS() {
    const s = this.ss;
    if (s && this.pg) this.pg.rect(PAGE.x0, s.y0, 0.9, s.y1 - s.y0, C.ink);
    this.ss = null;
  }

  /** Simula a colocação de um conjunto de blocos a partir do estado atual. */
  sim(unit) {
    let y = this.y;
    let prev = this.prevMb;
    let atTop = this.atTop;
    let cur = this.ss ? this.ss.gid : 0;
    const pos = unit.map((b) => {
      const g = b.ss || 0;
      let gap;
      if (g !== cur) { if (cur) prev = Math.max(prev, 4.5); cur = g; }
      gap = atTop ? 0 : Math.max(prev, b.mt || 0);
      const top = y + gap;
      y = top + b.h;
      prev = b.mb || 0;
      atTop = false;
      return top;
    });
    return { pos, bottom: y, fits: y <= PAGE.bottom + 0.01 };
  }

  commit(unit, r) {
    unit.forEach((b, k) => {
      const top = r.pos[k];
      const g = b.ss || 0;
      if (!this.ss || this.ss.gid !== g) {
        this.closeSS();
        if (g) this.ss = { gid: g, y0: top, y1: top };
      }
      const inSS = !!g;
      const x = PAGE.x0 + (inSS ? 4.9 : 0);
      b.draw(this.pg, x, top);
      if (this.ss) this.ss.y1 = top + b.h;
      this.prevMb = b.mb || 0;
    });
    this.y = r.bottom;
    this.atTop = false;
    this.hasBody = true;
  }

  placeUnit(unit) {
    let r = this.sim(unit);
    if (!r.fits && (this.hasBody || this.hasHead)) {
      const save = { y: this.y, prevMb: this.prevMb, atTop: this.atTop, ss: this.ss };
      this.y = PAGE.top; this.prevMb = 0; this.atTop = true; this.ss = null;
      const fresh = this.sim(unit);
      Object.assign(this, save);
      if (fresh.fits || this.hasBody) { this.newFichaPage(); r = this.sim(unit); }
    }
    this.commit(unit, r);
    if (!r.fits) this.pg.overflow = true;
  }

  fichaPages(f, i) {
    this.newFichaPage();
    // cabeçalho fixo da ficha (sempre no topo da primeira página dela)
    const head = [this.stripModel(), this.headModel(f, i)];
    head[0].mb = 7;
    if (has(f.obs)) head.push(this.noteModel(f));
    let y = PAGE.top;
    head.forEach((b, k) => {
      if (k) y += Math.max(head[k - 1].mb, 0);
      b.draw(this.pg, PAGE.x0, y);
      y += b.h;
    });
    this.y = y;
    this.prevMb = head[head.length - 1].mb;
    this.atTop = false;
    this.hasHead = true;

    const codes = codesFor(f);
    const units = [];
    let pending = [];
    const W = PAGE.cw;
    const WS = PAGE.cw - 4.9;
    f.blocos.forEach((b, bi) => {
      if (b.tipo === 'sec') { if (has(b.titulo)) pending.push(this.secModel(b, W)); return; }
      if (b.tipo === 'ex') {
        if (!b.exercicios[0]) return;
        units.push([...pending, this.cardModel(b.exercicios[0], codes[bi].single, W)]);
        pending = [];
        return;
      }
      const c = codes[bi];
      this.gid += 1;
      const g = this.gid;
      const head2 = { ...this.ssHeadModel(c.letter, has(b.nota) ? clean(b.nota) : ssDefault(c.codes), WS), ss: g };
      b.exercicios.forEach((e, ei) => {
        const card = { ...this.cardModel(e, c.codes[ei], WS), ss: g };
        if (ei === 0) { units.push([...pending, head2, card]); pending = []; } else units.push([card]);
      });
    });
    if (!units.length && !pending.length) units.push([this.emptyModel()]);
    if (f.cardio.ativo) { units.push([...pending, this.cardioModel(f.cardio, W)]); pending = []; }
    if (pending.length) units.push(pending);
    units.forEach((u) => this.placeUnit(u));
    this.closeSS();
  }
}
