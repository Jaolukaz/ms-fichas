/**
 * Renderizador SVG da lista de desenho, usado na pré-visualização A4.
 * Usa exatamente as mesmas coordenadas e quebras de linha do PDF; as fontes da prévia
 * são os mesmos arquivos embutidos no PDF (sem kerning, como no PDF).
 */
import { FONTS, PT } from './text.js';
import { roundRectPath } from './layout.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (v) => +(+v).toFixed(3);
const paint = (it) => `fill="${it.fill || 'none'}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.sw ?? 0.3)}"` : ''}${it.cap ? ` stroke-linecap="${it.cap}"` : ''}${it.join ? ` stroke-linejoin="${it.join}"` : ''}${it.opacity != null ? ` opacity="${it.opacity}"` : ''}`;

/**
 * @param {{n:number, items:Array, overflow:boolean}} pg
 * @param {(ref:string)=>string|null} urlFor URL de exibição das imagens
 * @param {string} uid prefixo único para ids de recorte
 */
export function pageToSvg(pg, urlFor, uid = 'p') {
  const out = [];
  const defs = [];
  pg.items.forEach((it, idx) => {
    switch (it.t) {
      case 'rect': {
        const rounded = Array.isArray(it.r) ? it.r.some((v) => v > 0) : it.r > 0;
        if (Array.isArray(it.r) && rounded) out.push(`<path d="${roundRectPath(it.x, it.y, it.w, it.h, it.r)}" ${paint(it)}/>`);
        else out.push(`<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${rounded ? ` rx="${n(it.r)}"` : ''} ${paint(it)}/>`);
        break;
      }
      case 'circle':
        out.push(`<circle cx="${n(it.cx)}" cy="${n(it.cy)}" r="${n(it.r)}" ${paint(it)}/>`);
        break;
      case 'path': {
        const tf = it.tx || it.ty || it.s !== 1 ? ` transform="translate(${n(it.tx)} ${n(it.ty)}) scale(${+it.s.toFixed(6)})"` : '';
        out.push(`<path${tf} d="${it.d}" ${paint(it)}/>`);
        break;
      }
      case 'text': {
        const F = FONTS[it.f];
        const size = it.size * PT;
        const anchor = it.anchor === 'start' ? '' : ` text-anchor="${it.anchor}"`;
        const ls = it.ls ? ` letter-spacing="${n(it.ls * size)}"` : '';
        // com letter-spacing, o navegador soma o espaço também após a última letra: compensa no alinhamento
        let x = it.x;
        if (it.ls && it.anchor === 'end') x += it.ls * size;
        else if (it.ls && it.anchor === 'middle') x += (it.ls * size) / 2;
        out.push(`<text x="${n(x)}" y="${n(it.y)}" font-family="${F.family}" font-weight="${F.weight}" font-size="${n(size)}" fill="${it.color}"${anchor}${ls} xml:space="preserve">${esc(it.s)}</text>`);
        break;
      }
      case 'image': {
        const url = urlFor(it.ref);
        if (!url) break;
        const par = it.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
        let cp = '';
        if (it.clipR) {
          const id = `${uid}-${pg.n}-${idx}`;
          defs.push(`<clipPath id="${id}"><path d="${roundRectPath(it.x, it.y, it.w, it.h, it.clipR)}"/></clipPath>`);
          cp = ` clip-path="url(#${id})"`;
        }
        out.push(`<image href="${esc(url)}" x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" preserveAspectRatio="${par}"${cp}/>`);
        break;
      }
      case 'link':
        out.push(`<a href="${esc(it.url)}" target="_blank" rel="noopener"><rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" fill="transparent"/></a>`);
        break;
      default:
        break;
    }
  });
  return `<svg class="pg-svg${pg.overflow ? ' overflow' : ''}" viewBox="0 0 210 297" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Página ${pg.n}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<rect width="210" height="297" fill="#fff"/>${out.join('')}</svg>`;
}
