/**
 * Ponte entre a interface e o motor de relatório.
 * O pdf-lib é carregado sob demanda (import dinâmico), para que o formulário abra rápido
 * mesmo em celulares modestos; o motor fica pronto em segundo plano logo após a abertura.
 */
import { layoutDoc } from './layout.js';
import { pageToSvg } from './svg.js';
import { FONTS } from './text.js';
import { brDate, fileBase, trim } from '../core/model.js';
import o500 from '../assets/fonts/Oswald-500.ttf?url';
import o600 from '../assets/fonts/Oswald-600.ttf?url';
import i400 from '../assets/fonts/Inter-400.ttf?url';
import i500 from '../assets/fonts/Inter-500.ttf?url';
import i600 from '../assets/fonts/Inter-600.ttf?url';
import i700 from '../assets/fonts/Inter-700.ttf?url';

const FONT_URLS = { o500, o600, i400, i500, i600, i700 };
const bytesOf = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

let enginePromise;
/** Carrega fontes e o módulo de PDF uma única vez. */
export function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [pdf, fontList] = await Promise.all([
        import('./pdf.js'),
        Promise.all(Object.keys(FONTS).map(async (k) => [k, await bytesOf(FONT_URLS[k])])),
      ]);
      const fonts = Object.fromEntries(fontList);
      const measure = await pdf.createMeasurer(fonts);
      return { pdf, fonts, measure };
    })();
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

/**
 * @param {{config:object, aluno:object, fichas:Array}} doc
 * @param {(id:string)=>boolean} hasMedia
 */
export async function computeLayout(doc, hasMedia) {
  const e = await getEngine();
  return layoutDoc(doc, { measure: e.measure, hasMedia, issued: brDate() });
}

export function layoutToSvg(layout, urlFor) {
  return layout.pages.map((pg) => pageToSvg(pg, urlFor, 'pv'));
}

/** Garante JPEG ou PNG (formatos aceitos no PDF); outros formatos são convertidos no aparelho. */
async function pdfImage(rec) {
  if (/jpe?g/i.test(rec.type)) return { type: 'jpg', bytes: new Uint8Array(rec.buf) };
  if (/png/i.test(rec.type)) return { type: 'png', bytes: new Uint8Array(rec.buf) };
  const bmp = await createImageBitmap(new Blob([rec.buf], { type: rec.type }));
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  c.width = 0; c.height = 0;
  return { type: 'jpg', bytes: new Uint8Array(await blob.arrayBuffer()) };
}

/**
 * @param {{config:object, aluno:object, fichas:Array}} doc
 * @param {(id:string)=>Promise<{buf:ArrayBuffer,type:string}|undefined>} getMedia
 * @param {Set<string>} available ids de mídia presentes no aparelho
 * @returns {Promise<{file: File, layout: object}>}
 */
export async function buildPdf(doc, getMedia, available) {
  const e = await getEngine();
  const layout = await computeLayout(doc, (id) => available.has(id));
  const images = {};
  const refs = new Set(layout.pages.flatMap((p) => p.items.filter((it) => it.t === 'image').map((it) => it.ref)));
  for (const ref of refs) {
    const rec = await getMedia(ref.replace(/^media:/, ''));
    if (rec) {
      try { images[ref] = await pdfImage(rec); } catch (err) { console.warn('[ms-fichas] imagem ignorada', ref, err); }
    }
  }
  const nome = trim(doc.aluno.nome);
  const bytes = await e.pdf.renderPdf(layout.pages, {
    fonts: e.fonts,
    images,
    meta: { title: nome ? `Planejamento de treino | ${nome}` : 'Planejamento de treino', author: trim(doc.config.trainer?.nome) || 'Matheus Scaldini' },
  });
  return { file: new File([bytes], `${fileBase(doc.aluno)}.pdf`, { type: 'application/pdf' }), layout };
}
