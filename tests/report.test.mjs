/**
 * Testes do motor de relatório (layout + PDF), executados em Node: `npm test`.
 * Garantem as diretrizes da versão web: A4 exato, nada fora da folha, cards nunca cortados,
 * seção presa ao exercício seguinte, super-set com cabeçalho junto do primeiro card,
 * capa que se ajusta ao número de fichas, ordem alfabética das fichas e backup compatível.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { layoutDoc, PAGE } from '../src/report/layout.js';
import { renderPdf, A4_PT } from '../src/report/pdf.js';
import { FONTS } from '../src/report/text.js';
import {
  blankConfig, blankPlan, fichaLetter, newFicha, nextFichaName, normalizeConfig, normalizePlan, sample,
} from '../src/core/model.js';
import { qrMatrix } from '../src/core/qr.js';
import { loadAssets } from './helpers.mjs';

const docOf = (plan, cfg = blankConfig()) => ({ config: cfg, aluno: plan.aluno, fichas: plan.fichas });
const ctxOf = (a, extra = {}) => ({ measure: a.measure, issued: '01/10/2026', ...extra });
const texts = (pages) => pages.flatMap((p) => p.items.filter((it) => it.t === 'text').map((it) => ({ n: p.n, s: it.s, y: it.y })));

function assertInside(pages) {
  for (const pg of pages) {
    for (const it of pg.items) {
      if (it.t === 'rect' || it.t === 'image') {
        assert.ok(it.x >= -0.01 && it.y >= -0.01 && it.x + it.w <= PAGE.w + 0.01 && it.y + it.h <= PAGE.h + 0.01, `item fora da folha na página ${pg.n}`);
      }
      if (it.t === 'text') assert.ok(it.y > 0 && it.y <= PAGE.h - 2, `texto fora da folha na página ${pg.n}: "${it.s}"`);
    }
  }
}

/** Nas páginas de ficha, nada (exceto o rodapé) passa da margem inferior de 15 mm. */
function assertBottom(pages) {
  for (const pg of pages.filter((p) => p.kind === 'ficha' && !p.overflow)) {
    for (const it of pg.items) {
      if (it.t === 'rect') assert.ok(it.y + it.h <= PAGE.bottom + 0.05, `bloco além da margem inferior na página ${pg.n}`);
      if (it.t === 'text' && !/^Página \d+ de \d+$/.test(it.s) && it.y < PAGE.bottom + 3) assert.ok(it.y <= PAGE.bottom, `texto além da margem na página ${pg.n}`);
    }
  }
}

test('métricas das fontes conferem com os arquivos embutidos', async () => {
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  const a = await loadAssets();
  for (const [k, f] of Object.entries(FONTS)) {
    const font = fontkit.create(a.fonts[k]);
    assert.ok(Math.abs(font.ascent / font.unitsPerEm - f.asc) < 0.002, `ascendente de ${k}`);
    assert.ok(Math.abs(-font.descent / font.unitsPerEm - f.desc) < 0.002, `descendente de ${k}`);
  }
});

test('exemplo do Arthur: 9 páginas A4, sem excesso e dentro das margens', async () => {
  const a = await loadAssets();
  const { pages, overflowPages } = layoutDoc(docOf(sample()), ctxOf(a));
  assert.equal(pages.length, 9);
  assert.deepEqual(overflowPages, []);
  assertInside(pages);
  assertBottom(pages);
  const doc = await PDFDocument.load(await renderPdf(pages, a));
  assert.equal(doc.getPageCount(), 9);
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    assert.ok(Math.abs(width - A4_PT[0]) < 0.01 && Math.abs(height - A4_PT[1]) < 0.01, 'página não é A4');
  }
  const all = texts(pages).map((t) => t.s);
  assert.ok(all.includes('Página 9 de 9'));
  assert.ok(!texts(pages).some((t) => t.n === 1 && /^Página/.test(t.s)), 'a capa não leva rodapé');
  ['ARTHUR MEDRADO', 'Supino inclinado com barra', 'Super-set A', 'CORE', 'Cardio ao final'].forEach((s) => assert.ok(all.includes(s), `faltou "${s}"`));
});

test('cada ficha começa numa página nova', async () => {
  const a = await loadAssets();
  const { pages } = layoutDoc(docOf(sample()), ctxOf(a));
  const starts = ['Peito e tríceps', 'Costas e bíceps', 'Core, ombros e braços'].map((s) => texts(pages).find((t) => t.n > 1 && t.s === s));
  starts.forEach((t) => assert.ok(t && t.y < 60, 'título da ficha deveria estar no topo da página'));
  assert.equal(new Set(starts.map((t) => t.n)).size, 3);
});

test('seção fica junto do exercício seguinte e o super-set junto do primeiro card', async () => {
  const a = await loadAssets();
  const p = sample();
  // força muitos textos longos para provocar quebras de página em vários pontos
  const L = 'Manter a escápula encaixada e o core ativo durante toda a execução. '.repeat(4);
  p.fichas.forEach((f) => f.blocos.forEach((b) => b.exercicios.forEach((e, i) => { if (i % 2 === 0) e.obs = L; })));
  const { pages, overflowPages } = layoutDoc(docOf(p), ctxOf(a));
  assert.deepEqual(overflowPages, []);
  assertBottom(pages);
  const t = texts(pages);
  const pageOf = (s) => t.find((x) => x.s === s).n;
  assert.equal(pageOf('OMBROS'), pageOf('Elevação lateral unilateral na polia'));
  assert.equal(pageOf('CONJUGADOS DE BÍCEPS E TRÍCEPS'), pageOf('Rosca martelo bilateral'));
  assert.equal(pageOf('Super-set B'), pageOf('Rosca martelo bilateral'));
  assert.equal(pageOf('Super-set A'), pageOf('Supino reto com halteres'));
});

test('bloco maior que uma página é sinalizado, e o PDF é gerado mesmo assim', async () => {
  const a = await loadAssets();
  const p = sample();
  p.fichas[0].blocos[0].exercicios[0].obs = 'Texto muito longo. '.repeat(400);
  const { pages, overflowPages } = layoutDoc(docOf(p), ctxOf(a));
  assert.equal(overflowPages.length, 1);
  const doc = await PDFDocument.load(await renderPdf(pages, a));
  assert.equal(doc.getPageCount(), pages.length);
});

test('capa: muitas fichas compactam o resumo e, no limite, criam página de continuação', async () => {
  const a = await loadAssets();
  const make = (n) => {
    const p = sample();
    while (p.fichas.length < n) { const f = newFicha(p.fichas.length); f.nome = nextFichaName(p.fichas); f.foco = 'Treino complementar'; p.fichas.push(f); }
    p.aluno.orientacoes = 'Aquecer 5 minutos antes de começar. Anotar as cargas de cada série.';
    return p;
  };
  const cover = (n) => {
    const { pages } = layoutDoc(docOf(make(n)), ctxOf(a));
    return { pages, cont: texts(pages).some((t) => t.s === 'Fichas deste ciclo, continuação' || (t.n === 2 && t.s === 'Orientações gerais')) };
  };
  const c12 = cover(12);
  assert.equal(c12.cont, false, '12 fichas devem caber na capa');
  assert.ok(texts(c12.pages).some((t) => t.n === 1 && t.s === 'Ficha L'));
  const c30 = cover(30);
  assert.equal(c30.cont, true, '30 fichas pedem página de continuação');
  assert.ok(texts(c30.pages).some((t) => t.n === 1 && t.s === 'Continua na próxima página.'));
  assertInside(c30.pages);
});

test('novas fichas seguem a ordem alfabética', () => {
  const p = blankPlan();
  for (let i = 0; i < 4; i += 1) { const f = newFicha(p.fichas.length); f.nome = nextFichaName(p.fichas); p.fichas.push(f); }
  assert.deepEqual(p.fichas.map((f) => f.nome), ['Ficha A', 'Ficha B', 'Ficha C', 'Ficha D', 'Ficha E']);
  p.fichas.splice(1, 1);
  assert.equal(nextFichaName(p.fichas), 'Ficha F');
  assert.equal(fichaLetter({ nome: 'Ficha 27' }, 26), '27');
});

test('backup da versão 1 é aceito sem perdas', () => {
  const v1 = { v: 1, config: { logo: 3, capa: 'light', legenda: false, trainer: { nome: 'Matheus Scaldini', cref: '123' } }, ...sample(), ui: { fi: 2 } };
  const plan = normalizePlan(JSON.parse(JSON.stringify(v1)));
  assert.equal(plan.fichas.length, 3);
  assert.equal(plan.ui.fi, 2);
  assert.equal(plan.fichas[0].blocos[0].exercicios[0].prog.linhas.length, 4);
  const cfg = normalizeConfig(v1.config);
  assert.deepEqual([cfg.logo, cfg.capa, cfg.legenda, cfg.trainer.cref, cfg.trainer.titulo], [3, 'light', false, '123', 'Personal Trainer']);
});

test('mídias: imagem embutida, QR vetorial com link clicável', async () => {
  const a = await loadAssets();
  const p = sample();
  p.fichas[0].blocos[0].exercicios[0].media = { tab: 'image', imageId: 'img_test', videoId: '', posterId: '', url: '', videoUrl: '' };
  p.fichas[0].blocos[1].exercicios[0].media = { tab: 'link', imageId: '', videoId: '', posterId: '', url: 'youtube.com/watch?v=abc123', videoUrl: '' };
  const { pages } = layoutDoc(docOf(p), ctxOf(a, { hasMedia: (id) => id === 'img_test' }));
  const items = pages[1].items;
  assert.ok(items.some((it) => it.t === 'image' && it.ref === 'media:img_test'));
  assert.ok(items.some((it) => it.t === 'link' && it.url === 'https://youtube.com/watch?v=abc123'));
  assert.ok(qrMatrix('https://youtube.com/watch?v=abc123').n >= 21);
  const bytes = await renderPdf(pages, a);
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPages()[1].node.Annots();
  assert.ok(annots && annots.size() >= 1, 'link do QR ausente no PDF');
  assert.ok(bytes.length < 600 * 1024, 'PDF deveria ser leve para envio pelo WhatsApp');
});
