import { readFile } from 'node:fs/promises';
import { createMeasurer } from '../src/report/pdf.js';
import { FONTS, FONT_KEYS } from '../src/report/text.js';

const rel = (p) => new URL(p, import.meta.url);

/** Carrega as fontes do relatório e (opcional) imagens de teste, como o navegador faria. */
export async function loadAssets() {
  const fonts = {};
  for (const k of FONT_KEYS) fonts[k] = await readFile(rel(`../src/assets/fonts/${FONTS[k].file}.ttf`));
  const images = {};
  try { images['media:img_test'] = { type: 'jpg', bytes: await readFile(rel('fixtures/exercicio.jpg')) }; } catch { /* opcional */ }
  return { fonts, images, measure: await createMeasurer(fonts) };
}
