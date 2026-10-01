/**
 * Repositório local: planejamentos (um por aluno), mídias dos exercícios e identidade do
 * profissional. Tudo fica no aparelho; nada é enviado a servidores.
 *
 * Backup (.json): mesmo formato da versão 1 (arquivo HTML único), { app, v, state, media },
 * com as imagens e os quadros de vídeo em data URL. Um backup exportado aqui abre na versão 1
 * e vice-versa. Vídeos não entram no backup, como na versão 1.
 */
import { openStore } from './db.js';
import { APP_ID } from '../core/config.js';
import { SCHEMA_VERSION, blankPlan, clone, mediaIds, normalizeConfig, normalizePlan } from '../core/model.js';

const LEGACY_KEY = 'ms-fichas:v1';
const LEGACY_DB = 'ms-fichas-media';

let store;

export async function initRepo() {
  store = await openStore();
  return store.kind;
}

export const newId = () => globalThis.crypto?.randomUUID?.() || `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ---------- identidade do profissional ---------- */
export async function getConfig() { return normalizeConfig(await store.get('meta', 'config')); }
export const saveConfig = (cfg) => store.put('meta', cfg, 'config');

/* ---------- planejamentos ---------- */
export async function listPlans() {
  const all = await store.getAll('plans');
  return all
    .map((r) => ({
      id: r.id, name: r.plan?.aluno?.nome || '', periodo: r.plan?.aluno?.periodo || '',
      fichas: r.plan?.fichas?.length || 0, updatedAt: r.updatedAt, createdAt: r.createdAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadPlan(id) {
  const r = await store.get('plans', id);
  return r ? { ...r, plan: normalizePlan(r.plan) } : null;
}

export async function savePlan(id, plan, createdAt) {
  const now = Date.now();
  await store.put('plans', { id, v: SCHEMA_VERSION, plan, createdAt: createdAt || now, updatedAt: now });
  return now;
}

export async function createPlan(plan = blankPlan()) {
  const id = newId();
  await savePlan(id, plan);
  return { id, plan };
}

export async function deletePlan(id) {
  await store.del('plans', id);
  await cleanupOrphans();
}

export async function getCurrentId() { return store.get('meta', 'current'); }
export async function setCurrentId(id) { return store.put('meta', id, 'current'); }
export async function getMeta(key) { return store.get('meta', key); }
export async function setMeta(key, value) { return store.put('meta', value, key); }

/* ---------- mídias ---------- */
/** @typedef {{buf:ArrayBuffer,type:string,w?:number,h?:number}} MediaRec */
export const getMedia = (id) => store.get('media', id);
export const putMedia = (id, rec) => store.put('media', rec, id);
export const delMedia = (id) => store.del('media', id);

/** Apaga mídias que nenhum planejamento usa mais (troca de imagem, exclusões). */
export async function cleanupOrphans() {
  const used = new Set();
  (await store.getAll('plans')).forEach((r) => mediaIds(normalizePlan(r.plan)).forEach((id) => used.add(id)));
  const keys = await store.keys('media');
  const orphans = keys.filter((k) => !used.has(k));
  if (orphans.length) await store.delMany('media', orphans);
  return orphans;
}

/** Espaço ocupado por mídias de um planejamento (bytes). */
export async function mediaSize(plan) {
  let total = 0;
  for (const id of mediaIds(plan)) { const r = await getMedia(id); if (r?.buf) total += r.buf.byteLength; }
  return total;
}

/* ---------- conversões ---------- */
export async function blobToRec(blob, extra = {}) {
  return { buf: await blob.arrayBuffer(), type: blob.type || 'application/octet-stream', ...extra };
}
export const recToBlob = (rec) => new Blob([rec.buf], { type: rec.type });

function recToDataUrl(rec) {
  const bytes = new Uint8Array(rec.buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${rec.type};base64,${btoa(bin)}`;
}

async function dataUrlToRec(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return blobToRec(blob);
}

/* ---------- backup ---------- */
/** @returns {Promise<{json:string, skippedVideos:number}>} */
export async function buildExport(plan, config) {
  const media = {};
  let skippedVideos = 0;
  for (const id of mediaIds(plan)) {
    const rec = await getMedia(id);
    if (!rec) continue;
    if ((rec.type || '').startsWith('video/')) { skippedVideos += 1; continue; }
    media[id] = recToDataUrl(rec);
  }
  const s = clone(plan);
  delete s.ui;
  const state = { ...s, v: 1, config };
  return { json: JSON.stringify({ app: APP_ID, v: 1, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state, media }), skippedVideos };
}

/**
 * Importa um backup (versão 1 ou 2) como novo planejamento.
 * @returns {Promise<{id:string, plan:object, config:object|null}>}
 */
export async function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Arquivo inválido: o conteúdo não é um JSON legível.'); }
  if (!data || data.app !== APP_ID || !data.state || typeof data.state !== 'object') {
    throw new Error('Arquivo inválido: não é um backup das fichas de treino.');
  }
  for (const [id, d] of Object.entries(data.media || {})) {
    try { await putMedia(id, await dataUrlToRec(d)); } catch (err) { console.warn('[ms-fichas] mídia ignorada no backup', id, err); }
  }
  const plan = normalizePlan(data.state);
  plan.ui = { fi: 0 };
  const id = newId();
  await savePlan(id, plan);
  return { id, plan, config: data.state.config ? normalizeConfig(data.state.config) : null };
}

/* ---------- versão 1 no mesmo endereço ---------- */
function legacyMedia(ids) {
  return new Promise((resolve) => {
    const out = {};
    if (!ids.size || !globalThis.indexedDB) { resolve(out); return; }
    let r;
    try { r = indexedDB.open(LEGACY_DB); } catch { resolve(out); return; }
    r.onerror = () => resolve(out);
    r.onupgradeneeded = () => { r.transaction.abort(); };
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('files')) { db.close(); resolve(out); return; }
      const tx = db.transaction('files', 'readonly');
      const st = tx.objectStore('files');
      ids.forEach((id) => { const g = st.get(id); g.onsuccess = () => { if (g.result) out[id] = g.result; }; });
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); resolve(out); };
    };
  });
}

/** Recupera o preenchimento da versão 1 quando ela foi usada no mesmo endereço. */
export async function migrateLegacy() {
  let raw;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const plan = normalizePlan(data);
    const empty = !plan.aluno.nome && !plan.fichas.some((f) => f.blocos.length);
    if (data.config) await saveConfig(normalizeConfig(data.config));
    let id = null;
    if (!empty) {
      const blobs = await legacyMedia(mediaIds(plan));
      for (const [mid, blob] of Object.entries(blobs)) await putMedia(mid, await blobToRec(blob));
      ({ id } = await createPlan(plan));
    }
    localStorage.removeItem(LEGACY_KEY);
    return id;
  } catch (err) {
    console.warn('[ms-fichas] falha ao migrar a versão 1', err);
    return null;
  }
}
