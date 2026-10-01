/**
 * Controlador da aplicação: mantém o planejamento em edição e a identidade do profissional,
 * liga o formulário ao estado, salva automaticamente no IndexedDB e executa os comandos
 * (PDF, planejamentos, exportar, importar, exemplo, limpar).
 */
import { APP_VERSION } from './core/config.js';
import { ic } from './core/icons.js';
import {
  blankPlan, clone, fileBase, has, mediaIds, move, newBlock, newEx, newFicha, nextFichaName,
  normalizePlan, progRows, reid, sample, trim, uid,
} from './core/model.js';
import * as repo from './storage/repo.js';
import { $, $$, debounce, esc, fmtSize, isTouch } from './ui/dom.js';
import { datalistsHTML, identityHTML, renderAll, renderFichas, renderLogos, renderQr, renderTabs } from './ui/editor.js';
import { ask, busy, toast } from './ui/feedback.js';
import { MediaUrls, processImage, videoPoster } from './ui/media.js';
import { deliver } from './ui/share.js';
import { initPwa, promptInstall, requestPersistence } from './ui/pwa.js';
import { MEDIA } from './core/config.js';
import { buildPdf, computeLayout, getEngine, layoutToSvg } from './report/engine.js';

const app = {
  id: null,
  createdAt: null,
  plan: blankPlan(),
  config: null,
  urls: new MediaUrls(),
  avail: new Set(),
  mode: 'edit',
  storageKind: 'idb',
  // a identidade do documento é definida uma vez: no celular ela começa recolhida
  ui: { idOpen: !matchMedia('(max-width: 760px)').matches },
};
const root = () => ({ config: app.config, aluno: app.plan.aluno, fichas: app.plan.fichas });
const cf = () => app.plan.fichas[app.plan.ui.fi];

/* ============================================================
   Persistência
   ============================================================ */
function setSaveState(msg, warn = false) {
  $$('[data-save-state]').forEach((el) => { el.textContent = msg; el.classList.toggle('warn', warn); });
}

async function saveNow() {
  try {
    await repo.savePlan(app.id, app.plan, app.createdAt);
    await repo.saveConfig(app.config);
    const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setSaveState(app.storageKind === 'memory' ? 'Sem salvamento local' : `Salvo às ${t}`, app.storageKind === 'memory');
  } catch (err) {
    console.error(err);
    setSaveState('Falha ao salvar', true);
    toast('Não foi possível salvar no aparelho. Use "Exportar backup" para não perder o planejamento.', 8000);
  }
}
const scheduleSave = debounce(saveNow, 450);
const flushPending = async () => { if (scheduleSave.pending()) await scheduleSave.flush(); };

function touch() { setSaveState('Salvando…'); scheduleSave(); scheduleRender(); }

async function loadMediaFor(plan) {
  app.urls.clear();
  app.avail.clear();
  for (const id of mediaIds(plan)) {
    const rec = await repo.getMedia(id);
    if (rec) { app.urls.set(id, rec); app.avail.add(id); }
  }
}

async function openPlan(id) {
  const rec = await repo.loadPlan(id);
  if (!rec) return false;
  app.id = rec.id;
  app.createdAt = rec.createdAt;
  app.plan = rec.plan;
  await loadMediaFor(app.plan);
  await repo.setCurrentId(id);
  renderAll(app);
  updateTitle();
  scheduleRender();
  return true;
}

function updateTitle() {
  const n = trim(app.plan.aluno.nome);
  $$('[data-aluno]').forEach((el) => { el.textContent = n || 'Aluno sem nome'; });
}

/* ============================================================
   Pré-visualização A4 (mesma lista de desenho do PDF)
   ============================================================ */
const urlFor = (ref) => (ref.startsWith('media:') ? app.urls.get(ref.slice(6)) : null);

async function renderPreview() {
  if (app.mode !== 'preview') return;
  try {
    const layout = await computeLayout(root(), (id) => app.avail.has(id));
    $('#report').innerHTML = layoutToSvg(layout, urlFor).map((svg) => `<div class="a4">${svg}</div>`).join('');
    const n = layout.pages.length;
    $('#page-count').textContent = n === 1 ? '1 página' : `${n} páginas`;
    const ov = layout.overflowPages;
    const msg = $('#ovf-msg');
    msg.hidden = !ov.length;
    if (ov.length) msg.textContent = `Um exercício ou bloco é maior que a área útil da folha na página ${ov.join(', ')}. Encurte o texto ou divida em mais de um exercício.`;
  } catch (err) {
    console.error(err);
    $('#report').innerHTML = '<p class="loading">Não foi possível montar a pré-visualização. Verifique a conexão na primeira abertura e recarregue a página.</p>';
  }
}
const scheduleRender = debounce(renderPreview, 250);

function setMode(mode) {
  app.mode = mode;
  document.body.classList.toggle('v-edit', mode === 'edit');
  document.body.classList.toggle('v-prev', mode === 'preview');
  $$('[data-mode]').forEach((b) => { const on = b.dataset.mode === mode; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); });
  if (mode === 'preview') {
    if (!$('#report svg')) $('#report').innerHTML = '<p class="loading">Montando páginas…</p>';
    renderPreview();
  }
  window.scrollTo({ top: 0 });
}

/* ============================================================
   Formulário
   ============================================================ */
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }

let snap = null;
const snapshot = () => { snap = JSON.stringify(app.plan); };
function undoToast(msg) {
  const s = snap;
  toast(msg, 7000, { label: 'Desfazer', onClick: () => { app.plan = normalizePlan(JSON.parse(s)); renderFichas(app); touch(); } });
}
function commit(part = 'fichas') {
  if (part === 'fichas') renderFichas(app); else if (part === 'all') renderAll(app);
  touch();
}
function focusLast(sel = '#ficha-ed .exe-name') {
  requestAnimationFrame(() => {
    const el = $$(sel).pop();
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!isTouch()) el.focus({ preventScroll: true });
  });
}
const confirmDel = (title, text, ok) => ask(title, `<p>${esc(text)}</p>`, [{ label: 'Cancelar', value: null }, { label: ok, value: 'ok', cls: 'btn-danger' }]).then((r) => r === 'ok');

const EXA = (d) => cf().blocos[+d.bi].exercicios[+d.ei];

/** Remove do aparelho as mídias que deixaram de ser usadas. */
function cleanupLater() {
  setTimeout(async () => {
    await flushPending();
    const removed = await repo.cleanupOrphans();
    removed.forEach((id) => { app.urls.revoke(id); app.avail.delete(id); });
  }, 800);
}

const ACT = {
  idToggle: () => { app.ui.idOpen = !app.ui.idOpen; $('#sec-id').innerHTML = identityHTML(app); },
  logo: (d) => { app.config.logo = +d.v; renderLogos(app); touch(); },
  capa: (d) => { app.config.capa = d.v; $$('[data-act="capa"]').forEach((b) => { const on = b.dataset.v === d.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); touch(); },
  tab: (d) => { app.plan.ui.fi = +d.fi; commit(); },
  addFicha: () => { const p = app.plan; const f = newFicha(p.fichas.length); f.nome = nextFichaName(p.fichas); p.fichas.push(f); p.ui.fi = p.fichas.length - 1; commit(); },
  dupFicha: () => { const p = app.plan; const f = clone(cf()); reid(f); f.nome = nextFichaName(p.fichas); p.fichas.push(f); p.ui.fi = p.fichas.length - 1; commit(); toast('Ficha duplicada'); },
  moveFicha: (d) => { const p = app.plan; if (move(p.fichas, p.ui.fi, +d.d)) { p.ui.fi += +d.d; commit(); } },
  delFicha: async () => {
    const f = cf();
    if (!(await confirmDel('Excluir esta ficha?', `“${f.nome || 'Ficha'}” e todos os exercícios dela serão removidos.`, 'Excluir ficha'))) return;
    const p = app.plan;
    snapshot();
    p.fichas.splice(p.ui.fi, 1);
    if (!p.fichas.length) p.fichas.push(newFicha(0));
    p.ui.fi = Math.max(0, p.ui.fi - 1);
    commit();
    undoToast('Ficha excluída');
  },
  addEx: () => { cf().blocos.push(newBlock('ex', [newEx()])); commit(); focusLast(); },
  addSS: () => { cf().blocos.push(newBlock('ss', [newEx(), newEx()])); commit(); focusLast('#ficha-ed .ss-ed:last-of-type .exe-name'); },
  addSec: () => { cf().blocos.push(newBlock('sec')); commit(); focusLast('#ficha-ed .sec-ed .in'); },
  addToSS: (d) => { cf().blocos[+d.bi].exercicios.push(newEx()); commit(); },
  delBlock: (d) => { snapshot(); cf().blocos.splice(+d.bi, 1); commit(); undoToast('Bloco removido'); },
  delEx: (d) => {
    snapshot();
    const bl = cf().blocos;
    const b = bl[+d.bi];
    if (b.tipo === 'ex') bl.splice(+d.bi, 1);
    else {
      b.exercicios.splice(+d.ei, 1);
      if (b.exercicios.length === 1) b.tipo = 'ex';
      if (!b.exercicios.length) bl.splice(+d.bi, 1);
    }
    commit();
    undoToast('Exercício removido');
  },
  dupEx: (d) => {
    const b = cf().blocos[+d.bi];
    const e = clone(b.exercicios[+d.ei]);
    e.id = uid();
    if (b.tipo === 'ex') cf().blocos.splice(+d.bi + 1, 0, newBlock('ex', [e])); else b.exercicios.splice(+d.ei + 1, 0, e);
    commit();
    toast('Exercício duplicado');
  },
  moveBlock: (d) => { if (move(cf().blocos, +d.bi, +d.d)) commit(); },
  moveEx: (d) => { if (move(cf().blocos[+d.bi].exercicios, +d.ei, +d.d)) commit(); },
  merge: (d) => {
    const bl = cf().blocos;
    const i = +d.bi;
    const nx = bl[i + 1];
    if (!nx || nx.tipo === 'sec') return;
    bl[i] = { ...bl[i], tipo: 'ss', nota: nx.nota || bl[i].nota || '', exercicios: [...bl[i].exercicios, ...nx.exercicios] };
    bl.splice(i + 1, 1);
    commit();
    toast('Super-set criado');
  },
  split: (d) => { const bl = cf().blocos; const i = +d.bi; bl.splice(i, 1, ...bl[i].exercicios.map((e) => newBlock('ex', [e]))); commit(); },
  collapse: (d) => { const e = EXA(d); e.collapsed = !e.collapsed; commit(); },
  addExtra: (d) => { EXA(d).extras.push({ label: '', valor: '' }); commit(); focusLast(`[data-ex="${EXA(d).id}"] .xrow .in`); },
  delExtra: (d) => { EXA(d).extras.splice(+d.xi, 1); commit(); },
  addRow: (d) => { const e = EXA(d); e.prog.linhas.push({ serie: `${e.prog.linhas.length + 1}ª`, carga: '', reps: '', nota: '' }); commit(); },
  delRow: (d) => { EXA(d).prog.linhas.splice(+d.ri, 1); commit(); },
  fillRows: (d) => {
    const e = EXA(d);
    const old = e.prog.linhas;
    e.prog.linhas = progRows(e).map((r, i) => (old[i] ? { ...old[i], serie: r.serie } : r));
    commit();
  },
  mtab: (d) => { EXA(d).media.tab = d.v; commit(); },
  mremove: (d) => {
    const m = EXA(d).media;
    if (m.tab === 'image') m.imageId = '';
    else if (m.tab === 'video') { m.videoId = ''; m.posterId = ''; }
    commit();
    cleanupLater();
  },
  vfree: async (d) => {
    const m = EXA(d).media;
    const rec = m.videoId ? await repo.getMedia(m.videoId) : null;
    const size = rec?.buf ? ` (${fmtSize(rec.buf.byteLength)})` : '';
    if (!(await confirmDel('Liberar espaço?', `O arquivo de vídeo${size} será apagado deste aparelho. O quadro usado no PDF e o link público continuam salvos.`, 'Apagar o vídeo'))) return;
    m.videoId = '';
    commit();
    cleanupLater();
  },
};

/* ---------- mídia ---------- */
async function storeRec(prefix, rec) {
  const id = `${prefix}_${uid()}`;
  await repo.putMedia(id, rec);
  app.urls.set(id, rec);
  app.avail.add(id);
  requestPersistence();
  return id;
}

async function handleFile(file, kind, d) {
  if (!file) return;
  const e = EXA(d);
  const m = e.media;
  try {
    if (kind === 'image' || kind === 'poster') {
      if (file.type && !file.type.startsWith('image/')) { toast('Escolha um arquivo de imagem (JPG, PNG, WebP ou HEIC).'); return; }
      busy(true, 'Otimizando a imagem…');
      const rec = await processImage(file);
      const id = await storeRec(kind === 'image' ? 'img' : 'pst', rec);
      if (kind === 'image') { m.imageId = id; m.tab = 'image'; } else { m.posterId = id; m.tab = 'video'; }
    } else {
      if (file.type && !file.type.startsWith('video/')) { toast('Escolha um arquivo de vídeo (MP4, MOV ou WebM).'); return; }
      if (file.size > MEDIA.videoMaxBytes) { toast('Vídeo acima de 150 MB. Use um trecho curto, de até 30 segundos.', 6000); return; }
      busy(true, 'Processando o vídeo…');
      const poster = await videoPoster(file);
      const rec = await repo.blobToRec(file, { type: file.type || 'video/mp4' });
      m.videoId = await storeRec('vid', rec);
      m.posterId = poster ? await storeRec('pst', poster) : '';
      m.tab = 'video';
      if (!poster) toast('O vídeo foi salvo, mas este aparelho não conseguiu extrair um quadro. Escolha uma foto como capa para o PDF.', 7000);
    }
    commit();
    cleanupLater();
  } catch (err) {
    console.error(err);
    const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
    toast(quota ? 'Sem espaço no aparelho para esta mídia. Use "Liberar espaço" em vídeos antigos ou exporte e exclua planejamentos.' : 'Não foi possível ler este arquivo. Tente outro.', 7000);
  } finally {
    busy(false);
  }
}

function bindEditor() {
  const ed = $('#ed');
  ed.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || !ACT[b.dataset.act]) return;
    ev.preventDefault();
    ACT[b.dataset.act](b.dataset, b);
  });
  ed.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.dataset?.path || el.type === 'checkbox' || el.type === 'file') return;
    setPath(root(), el.dataset.path, el.value);
    const rr = el.dataset.rr;
    if (rr === 'tabs') renderTabs(app);
    else if (rr === 'logos') renderLogos(app);
    else if (rr === 'qr') renderQr(el.dataset.qr, el.value);
    else if (rr === 'title') updateTitle();
    touch();
  });
  ed.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset?.file) { const f = el.files && el.files[0]; el.value = ''; handleFile(f, el.dataset.file, el.dataset); return; }
    if (!el.dataset?.path || el.type !== 'checkbox') return;
    const r = root();
    setPath(r, el.dataset.path, el.checked);
    if (/\.prog\.ativo$/.test(el.dataset.path) && el.checked) {
      const e2 = getPath(r, el.dataset.path.replace(/\.prog\.ativo$/, ''));
      if (!e2.prog.linhas.length) e2.prog.linhas = progRows(e2);
    }
    if (el.dataset.rr === 'ficha') renderFichas(app);
    touch();
  });
  ['dragenter', 'dragover'].forEach((t) => ed.addEventListener(t, (e) => { const z = e.target.closest?.('.drop'); if (z) { e.preventDefault(); z.classList.add('over'); } }));
  ed.addEventListener('dragleave', (e) => { const z = e.target.closest?.('.drop'); if (z) z.classList.remove('over'); });
  ed.addEventListener('drop', (e) => {
    const z = e.target.closest?.('.drop');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file, z.dataset.drop, z.dataset);
  });
}

/* ============================================================
   Comandos
   ============================================================ */
async function cmdPdf() {
  await flushPending();
  busy(true, 'Preparando o PDF…');
  let layout;
  try {
    layout = await computeLayout(root(), (id) => app.avail.has(id));
  } catch (err) {
    busy(false);
    console.error(err);
    toast('Não foi possível carregar o gerador de PDF. Verifique a conexão na primeira abertura e tente novamente.', 7000);
    return;
  }
  busy(false);
  const issues = [];
  if (!trim(app.plan.aluno.nome)) issues.push('O nome do aluno não foi informado.');
  if (!app.plan.fichas.some((f) => f.blocos.some((b) => b.tipo !== 'sec'))) issues.push('Nenhum exercício foi adicionado às fichas.');
  if (layout.overflowPages.length) issues.push(`Há conteúdo maior que a área útil da folha na página ${layout.overflowPages.join(', ')}.`);
  if (issues.length) {
    const r = await ask('Revise antes de gerar',
      `<p>Encontramos pontos que podem deixar o PDF incompleto:</p><ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
      [{ label: 'Voltar e corrigir', value: 'back' }, { label: 'Gerar mesmo assim', value: 'go', cls: 'btn-primary' }]);
    if (r !== 'go') return;
  }
  busy(true, 'Gerando o PDF…');
  try {
    const { file } = await buildPdf(root(), repo.getMedia, app.avail);
    busy(false);
    const n = trim(app.plan.aluno.nome);
    await deliver(file, { kind: 'pdf', heading: 'PDF pronto', title: `Ficha de treino${n ? ` | ${n}` : ''}` });
  } catch (err) {
    busy(false);
    console.error(err);
    toast('Falha ao gerar o PDF. Tente novamente; se persistir, exporte um backup e envie ao suporte.', 7000);
  }
}

async function cmdExport() {
  await flushPending();
  busy(true, 'Preparando o backup…');
  const { json, skippedVideos } = await repo.buildExport(app.plan, app.config);
  busy(false);
  const file = new File([json], `Backup_${fileBase(app.plan.aluno)}.json`, { type: 'application/json' });
  await deliver(file, {
    kind: 'json',
    heading: 'Backup do planejamento',
    title: 'Backup das fichas de treino',
    note: `<p>O arquivo guarda o aluno, as fichas, as imagens e a identidade do documento. Use "Importar backup" em qualquer aparelho para reabri-lo; ele também abre na versão de computador.${skippedVideos ? ' Os vídeos não entram no backup; os quadros usados no PDF, sim.' : ''}</p>`,
  });
}

async function cmdImport(file) {
  if (!file) return;
  busy(true, 'Importando…');
  try {
    await flushPending();
    const { id, config } = await repo.importBackup(await file.text());
    if (config) { app.config = config; await repo.saveConfig(config); }
    await openPlan(id);
    busy(false);
    setMode('edit');
    toast('Backup importado e aberto para edição. Os planejamentos anteriores continuam salvos.', 6000);
  } catch (err) {
    busy(false);
    toast(err.message || 'Não foi possível importar este arquivo.', 6000);
  }
}

async function cmdNew() {
  if ($('#plans').open) $('#plans').close();
  await flushPending();
  const { id } = await repo.createPlan();
  await openPlan(id);
  setMode('edit');
  toast('Novo planejamento iniciado. O anterior continua salvo em "Alunos".');
}

async function cmdExample() {
  const p = app.plan;
  const filled = has(p.aluno.nome) || p.fichas.some((f) => f.blocos.length);
  if (filled) {
    const r = await ask('Carregar exemplo', '<p>O exemplo (Arthur Medrado, 2025/1) será aberto como um novo planejamento. O preenchimento atual continua salvo em "Alunos".</p>',
      [{ label: 'Cancelar', value: null }, { label: 'Abrir exemplo', value: 'ok', cls: 'btn-primary' }]);
    if (r !== 'ok') return;
    await flushPending();
    const { id } = await repo.createPlan(sample());
    await openPlan(id);
  } else {
    const keep = p.ui;
    app.plan = sample();
    app.plan.ui = { ...keep, fi: 0 };
    renderAll(app);
    updateTitle();
    touch();
  }
  setMode('edit');
  toast('Exemplo carregado');
}

async function cmdClear() {
  const ok = await confirmDel('Limpar formulário?', 'Os dados do aluno, as fichas, os exercícios e as mídias deste planejamento serão apagados. A logo e os dados do profissional continuam salvos.', 'Limpar tudo');
  if (!ok) return;
  app.plan = blankPlan();
  renderAll(app);
  updateTitle();
  setMode('edit');
  await saveNow();
  cleanupLater();
  toast('Formulário limpo');
}

const when = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

async function cmdPlans() {
  await flushPending();
  const list = await repo.listPlans();
  $('#plans-list').innerHTML = list.length
    ? list.map((p) => `
      <li class="ev ${p.id === app.id ? 'current' : ''}">
        <div class="ev-info"><b>${esc(p.name.trim() || 'Aluno sem nome')}</b>
          <span>${esc([p.periodo, p.fichas === 1 ? '1 ficha' : `${p.fichas} fichas`].filter(Boolean).join(', '))}. Editado em ${when(p.updatedAt)}</span>
          ${p.id === app.id ? '<em>Em edição</em>' : ''}</div>
        <div class="ev-act">
          ${p.id === app.id ? '' : `<button type="button" class="btn sm" data-plan-open="${p.id}">Abrir</button>`}
          <button type="button" class="ib del" data-plan-del="${p.id}" aria-label="Excluir planejamento de ${esc(p.name || 'aluno sem nome')}">${ic('trash')}</button>
        </div>
      </li>`).join('')
    : '<li class="list-empty">Nenhum planejamento salvo.</li>';
  $('#plans-count').textContent = `${list.length} ${list.length === 1 ? 'planejamento salvo' : 'planejamentos salvos'} neste aparelho`;
  if (!$('#plans').open) $('#plans').showModal();
}

async function cmdDelete(id) {
  const rec = await repo.loadPlan(id);
  const nome = rec?.plan.aluno.nome.trim() || 'aluno sem nome';
  $('#plans').close();
  const r = await ask('Excluir planejamento',
    `<p>O planejamento de <b>${esc(nome)}</b>, com as imagens e os vídeos enviados, será apagado deste aparelho. Essa ação não pode ser desfeita.</p><p>Se quiser guardar uma cópia, use "Exportar backup" antes.</p>`,
    [{ label: 'Cancelar', value: null }, { label: 'Excluir', value: 'del', cls: 'btn-danger' }]);
  if (r !== 'del') { cmdPlans(); return; }
  await repo.deletePlan(id);
  if (id === app.id) {
    const rest = await repo.listPlans();
    if (rest.length) await openPlan(rest[0].id);
    else { const { id: nid } = await repo.createPlan(); await openPlan(nid); }
  }
  toast('Planejamento excluído.');
  cmdPlans();
}

function bindChrome() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode], [data-cmd], [data-plan-open], [data-plan-del]');
    if (!b || b.closest('#ed')) return;
    if (b.dataset.mode) { setMode(b.dataset.mode); return; }
    if (b.dataset.planOpen) {
      $('#plans').close();
      flushPending().then(() => openPlan(b.dataset.planOpen)).then(() => { setMode('edit'); toast('Planejamento aberto.'); });
      return;
    }
    if (b.dataset.planDel) { cmdDelete(b.dataset.planDel); return; }
    const { cmd } = b.dataset;
    if (b.closest('#menu')) $('#menu').close();
    if (cmd === 'pdf') cmdPdf();
    else if (cmd === 'export') cmdExport();
    else if (cmd === 'import') $('#file-json').click();
    else if (cmd === 'new') cmdNew();
    else if (cmd === 'plans') cmdPlans();
    else if (cmd === 'example') cmdExample();
    else if (cmd === 'clear') cmdClear();
    else if (cmd === 'menu') $('#menu').showModal();
    else if (cmd === 'install') promptInstall();
    else if (cmd === 'close-plans') $('#plans').close();
  });
  $('#file-json').addEventListener('change', (e) => { cmdImport(e.target.files[0]); e.target.value = ''; });
  ['#menu', '#plans'].forEach((sel) => $(sel).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }));
  // salva ao sair ou ao mandar o app para segundo plano (comum no celular)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPending(); });
  window.addEventListener('pagehide', () => { flushPending(); });
}

/* ============================================================
   Inicialização
   ============================================================ */
export async function start() {
  $$('[data-icon]').forEach((el) => { el.innerHTML = ic(el.dataset.icon); });
  $('#datalists').innerHTML = datalistsHTML();
  $('#app-version').textContent = `Versão ${APP_VERSION}. Os dados ficam somente neste aparelho.`;
  document.body.classList.toggle('touch', isTouch());
  bindEditor();
  bindChrome();

  app.storageKind = await repo.initRepo();
  const migrated = await repo.migrateLegacy();
  app.config = await repo.getConfig();
  const id = migrated || (await repo.getCurrentId());
  if (!id || !(await openPlan(id))) {
    const all = await repo.listPlans();
    if (all.length) await openPlan(all[0].id);
    else { const r = await repo.createPlan(); await openPlan(r.id); }
  }
  if (migrated) toast('Preenchimento da versão anterior recuperado.');
  if (app.storageKind === 'memory') { setSaveState('Sem salvamento local', true); toast('Este navegador não permite salvar no aparelho. Use "Exportar backup" ao terminar.', 8000); } else setSaveState('Salvo no aparelho');

  initPwa();
  // carrega o motor de PDF em segundo plano, depois que a tela já está utilizável
  const warm = () => getEngine().catch((err) => console.warn('[ms-fichas] motor de PDF ainda não carregado', err));
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 }); else setTimeout(warm, 800);
  window.__msApp = app; // diagnóstico (console e testes)
}
