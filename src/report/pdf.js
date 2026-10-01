/**
 * Renderizador PDF vetorial.
 * Converte a lista de desenho do motor de layout num PDF A4 com texto real (selecionável e
 * nítido em qualquer ampliação), fontes Oswald e Inter embutidas em subconjunto, imagens na
 * resolução original e QR codes vetoriais clicáveis.
 * Funciona no navegador e em Node (testes automatizados).
 * Base: renderizador da Avaliação Funcional e do Planejamento de Treino da Lab-4.
 */
import {
  PDFDocument, PDFName, PDFString, LineCapStyle, LineJoinStyle, rgb, pushGraphicsState, popGraphicsState,
  setCharacterSpacing, setLineJoin, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FONT_KEYS, MM_TO_PT } from './text.js';
import { roundRectPath } from './layout.js';

export const A4_PT = [595.2756, 841.8898];
export { FONT_KEYS };

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Medidor de texto a partir dos bytes das fontes. O mesmo medidor é usado pelo layout no
 * navegador e nos testes, garantindo quebras de linha idênticas em todos os aparelhos.
 * `ls` é o espaçamento entre letras em em (como letter-spacing em CSS).
 * @returns {Promise<(s:string,f:string,size:number,ls?:number)=>number>} largura em mm
 */
export async function createMeasurer(fontBytes) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = {};
  for (const k of FONT_KEYS) fonts[k] = await doc.embedFont(fontBytes[k], { subset: false });
  const cache = new Map();
  return (s, f, size, ls = 0) => {
    const key = `${f}|${s}`;
    let w1 = cache.get(key);
    if (w1 === undefined) {
      w1 = fonts[f].widthOfTextAtSize(s, 1);
      if (cache.size > 12000) cache.clear();
      cache.set(key, w1);
    }
    const chars = [...s].length;
    return (w1 * size + (chars > 1 ? ls * size * (chars - 1) : 0)) / MM_TO_PT;
  };
}

/**
 * @param {Array<{n:number, items:Array}>} pages lista de desenho
 * @param {{fonts:object, images:Record<string,{bytes:Uint8Array|ArrayBuffer,type:'png'|'jpg'}>, meta?:object}} assets
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf(pages, assets) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const meta = assets.meta || {};
  doc.setTitle(meta.title || 'Planejamento de treino', { showInWindowTitleBar: true });
  doc.setAuthor(meta.author || 'Matheus Scaldini');
  doc.setSubject('Fichas de treino');
  doc.setCreator('Fichas de treino Matheus Scaldini');
  doc.setProducer('Fichas de treino Matheus Scaldini (pdf-lib)');
  doc.setLanguage('pt-BR');
  doc.setCreationDate(meta.date || new Date());

  const fonts = {};
  for (const k of FONT_KEYS) fonts[k] = await doc.embedFont(assets.fonts[k], { subset: true });

  const embedded = new Map();
  const getImage = async (ref) => {
    if (embedded.has(ref)) return embedded.get(ref);
    const src = assets.images[ref];
    let img = null;
    if (src) {
      try { img = src.type === 'png' ? await doc.embedPng(src.bytes) : await doc.embedJpg(src.bytes); } catch (err) { console.warn('[ms-fichas] imagem ignorada no PDF', ref, err); }
    }
    embedded.set(ref, img);
    return img;
  };

  const [W, H] = A4_PT;
  const P = (mm) => mm * MM_TO_PT;
  const svgOpts = (it, tx = 0, ty = 0, s = 1) => ({
    x: P(tx), y: H - P(ty), scale: MM_TO_PT * s,
    color: it.fill ? hex(it.fill) : undefined,
    borderColor: it.stroke ? hex(it.stroke) : undefined,
    borderWidth: it.stroke ? (it.sw ?? 0.3) : undefined,
    borderLineCap: it.cap === 'round' ? LineCapStyle.Round : it.cap === 'square' ? LineCapStyle.Projecting : undefined,
    opacity: it.opacity, borderOpacity: it.opacity,
  });
  // retângulo de cantos arredondados para recorte, em coordenadas PDF
  const roundRectOps = (x, y, w, h, r) => {
    const [a, b, c, d] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v || 0, w / 2, h / 2)));
    const k = 0.5523;
    const X = P(x); const Y = H - P(y); const Wd = P(w); const Hd = P(h);
    const [ra, rb, rc, rd] = [a, b, c, d].map(P);
    return [
      moveTo(X + ra, Y),
      lineTo(X + Wd - rb, Y),
      appendBezierCurve(X + Wd - rb + k * rb, Y, X + Wd, Y - rb + k * rb, X + Wd, Y - rb),
      lineTo(X + Wd, Y - Hd + rc),
      appendBezierCurve(X + Wd, Y - Hd + rc - k * rc, X + Wd - rc + k * rc, Y - Hd, X + Wd - rc, Y - Hd),
      lineTo(X + rd, Y - Hd),
      appendBezierCurve(X + rd - k * rd, Y - Hd, X, Y - Hd + rd - k * rd, X, Y - Hd + rd),
      lineTo(X, Y - ra),
      appendBezierCurve(X, Y - ra + k * ra, X + ra - k * ra, Y, X + ra, Y),
      closePath(),
    ];
  };

  for (const pg of pages) {
    const page = doc.addPage([W, H]);
    const annots = [];
    for (const it of pg.items) {
      if (it.screen) continue; // itens apenas de tela
      switch (it.t) {
        case 'rect': {
          const rounded = Array.isArray(it.r) ? it.r.some((v) => v > 0) : it.r > 0;
          if (rounded) {
            page.drawSvgPath(roundRectPath(it.x, it.y, it.w, it.h, it.r), svgOpts(it));
          } else {
            const opts = { x: P(it.x), y: H - P(it.y + it.h), width: P(it.w), height: P(it.h) };
            if (it.fill) opts.color = hex(it.fill);
            if (it.stroke) { opts.borderColor = hex(it.stroke); opts.borderWidth = P(it.sw || 0.3); }
            if (it.opacity != null) { opts.opacity = it.opacity; opts.borderOpacity = it.opacity; }
            page.drawRectangle(opts);
          }
          break;
        }
        case 'circle':
          page.drawCircle({
            x: P(it.cx), y: H - P(it.cy), size: P(it.r),
            color: it.fill ? hex(it.fill) : undefined,
            borderColor: it.stroke ? hex(it.stroke) : undefined,
            borderWidth: it.stroke ? P(it.sw) : undefined,
            opacity: it.opacity, borderOpacity: it.opacity,
          });
          break;
        case 'path': {
          const joined = it.join && it.stroke;
          if (joined) page.pushOperators(pushGraphicsState(), setLineJoin(it.join === 'round' ? LineJoinStyle.Round : it.join === 'bevel' ? LineJoinStyle.Bevel : LineJoinStyle.Miter));
          page.drawSvgPath(it.d, svgOpts(it, it.tx, it.ty, it.s));
          if (joined) page.pushOperators(popGraphicsState());
          break;
        }
        case 'text': {
          const font = fonts[it.f];
          const chars = [...it.s].length;
          const w = font.widthOfTextAtSize(it.s, it.size) + (it.ls && chars > 1 ? it.ls * it.size * (chars - 1) : 0);
          let x = P(it.x);
          if (it.anchor === 'end') x -= w;
          else if (it.anchor === 'middle') x -= w / 2;
          if (it.ls) page.pushOperators(pushGraphicsState(), setCharacterSpacing(it.ls * it.size));
          page.drawText(it.s, { x, y: H - P(it.y), size: it.size, font, color: hex(it.color) });
          if (it.ls) page.pushOperators(popGraphicsState());
          break;
        }
        case 'image': {
          const img = await getImage(it.ref);
          if (!img) break;
          const s = it.fit === 'cover' ? Math.max(it.w / img.width, it.h / img.height) : Math.min(it.w / img.width, it.h / img.height);
          const dw = img.width * s;
          const dh = img.height * s;
          const dx = it.x + (it.w - dw) / 2;
          const dy = it.y + (it.h - dh) / 2;
          const clipped = it.fit === 'cover' || it.clipR;
          if (clipped) page.pushOperators(pushGraphicsState(), ...roundRectOps(it.x, it.y, it.w, it.h, it.clipR || 0), clip(), endPath());
          page.drawImage(img, { x: P(dx), y: H - P(dy + dh), width: P(dw), height: P(dh) });
          if (clipped) page.pushOperators(popGraphicsState());
          break;
        }
        case 'link': {
          const annot = doc.context.obj({
            Type: 'Annot', Subtype: 'Link',
            Rect: [P(it.x), H - P(it.y + it.h), P(it.x + it.w), H - P(it.y)],
            Border: [0, 0, 0],
            A: { Type: 'Action', S: 'URI', URI: PDFString.of(it.url) },
          });
          annots.push(doc.context.register(annot));
          break;
        }
        default:
          break;
      }
    }
    if (annots.length) page.node.set(PDFName.of('Annots'), doc.context.obj(annots));
  }
  return doc.save({ useObjectStreams: true });
}
