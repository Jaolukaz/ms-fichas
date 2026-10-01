/**
 * Mídias dos exercícios, processadas no próprio aparelho.
 * Imagens: decodificadas uma de cada vez (fila, evita picos de memória com câmeras de alta
 * resolução), com a orientação da câmera aplicada, e gravadas em JPEG de alta qualidade.
 * Vídeos: um quadro é extraído para o PDF; se o navegador não conseguir decodificar o vídeo
 * (ex.: HEVC de iPhone em alguns Android), a interface oferece usar uma foto como capa.
 */
import { MEDIA } from '../core/config.js';

let queue = Promise.resolve();
const enqueue = (fn) => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };

async function decode(file) {
  if ('createImageBitmap' in globalThis) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* recurso parcial: tenta <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function canvasToRec(canvas, quality) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  const { width: w, height: h } = canvas;
  canvas.width = 0; // libera a memória do canvas (relevante no iOS)
  canvas.height = 0;
  if (!blob) throw new Error('Falha ao comprimir a imagem');
  return { buf: await blob.arrayBuffer(), type: 'image/jpeg', w, h };
}

function draw(src, w0, h0, max) {
  const k = Math.min(1, max / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * k));
  canvas.height = Math.max(1, Math.round(h0 * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Imagem do exercício (ou capa de vídeo escolhida à mão). */
export const processImage = (file, max = MEDIA.imageMax) => enqueue(async () => {
  const src = await decode(file);
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error('Imagem sem dimensões');
  const canvas = draw(src, w0, h0, max);
  src.close?.();
  return canvasToRec(canvas, MEDIA.imageQuality);
});

/** Quadro do vídeo (a 25% da duração, no máximo 1 s) para o PDF. Devolve null se não conseguir. */
export function videoPoster(file) {
  return enqueue(() => new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const end = (rec) => { if (done) return; done = true; v.removeAttribute('src'); v.load?.(); URL.revokeObjectURL(url); resolve(rec); };
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.src = url;
    v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) * 0.25); } catch { end(null); } };
    v.onseeked = () => {
      if (!v.videoWidth) { end(null); return; }
      const canvas = draw(v, v.videoWidth, v.videoHeight, MEDIA.posterMax);
      canvasToRec(canvas, 0.86).then(end, () => end(null));
    };
    v.onerror = () => end(null);
    setTimeout(() => end(null), 12000);
  }));
}

/** Object URLs das mídias para exibição (editor e prévia), liberando os antigos. */
export class MediaUrls {
  constructor() { this.urls = new Map(); }
  set(id, rec) {
    this.revoke(id);
    if (rec) this.urls.set(id, URL.createObjectURL(new Blob([rec.buf], { type: rec.type })));
  }
  get(id) { return this.urls.get(id) || null; }
  has(id) { return this.urls.has(id); }
  revoke(id) { const u = this.urls.get(id); if (u) URL.revokeObjectURL(u); this.urls.delete(id); }
  clear() { [...this.urls.keys()].forEach((k) => this.revoke(k)); }
}
