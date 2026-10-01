/**
 * Formulário de edição: mesmos painéis, campos e controles da versão web (ficha.html),
 * agora em módulo, com ajustes de toque para celular.
 * Cada campo carrega `data-path`, o caminho do valor dentro de { config, aluno, fichas }.
 */
import { LOGO_NAMES, SUGGESTIONS } from '../core/config.js';
import { ic } from '../core/icons.js';
import { codesFor, exCount, exSummary, fichaLetter, normUrl, ssDefault } from '../core/model.js';
import { qrSvg } from '../core/qr.js';
import { $, esc } from './dom.js';

/* ---------------- campos ---------------- */
export function F(label, path, val, o = {}) {
  const attrs = `data-path="${path}" placeholder="${esc(o.ph || '')}"${o.rr ? ` data-rr="${o.rr}"` : ''}${o.qr ? ` data-qr="${o.qr}"` : ''}${o.type ? ` inputmode="${o.type}"` : ''}`;
  const ctl = o.area
    ? `<textarea ${attrs} rows="${o.rows || 3}">${esc(val)}</textarea>`
    : `<input type="${o.url ? 'url' : 'text'}" ${attrs} value="${esc(val)}"${o.list ? ` list="${o.list}"` : ''} autocomplete="off"${o.url ? ' autocapitalize="off" autocorrect="off" spellcheck="false"' : ''}>`;
  return `<label class="f ${o.cls || ''}"><span>${label}</span>${ctl}</label>`;
}

export function datalistsHTML() {
  return Object.entries(SUGGESTIONS).map(([k, list]) => `<datalist id="dl-${k}">${list.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`).join('');
}

/* ---------------- logos (interface) ---------------- */
function trainerNames(cfg) {
  const t = cfg.trainer;
  const full = (t.nome || 'Matheus Scaldini').trim();
  const p = full.split(/\s+/);
  return { full, first: p.length > 1 ? p.slice(0, -1).join(' ') : '', last: p[p.length - 1], tit: (t.titulo || 'Personal Trainer').trim() };
}

export function logoHTML(cfg, n, c, fs) {
  const t = trainerNames(cfg);
  if (+n === 2) return `<div class="lg lg2" style="color:${c};font-size:${fs}"><svg class="lgm" viewBox="0 0 72 24" aria-hidden="true"><rect x="0" y="10.8" width="72" height="2.4" fill="${c}"/><rect x="9" y="2" width="5.5" height="20" rx="1" fill="${c}"/><rect x="15.5" y="5.5" width="3.8" height="13" rx="1" fill="${c}"/><rect x="20.3" y="9" width="2.2" height="6" fill="${c}"/><rect x="57.5" y="2" width="5.5" height="20" rx="1" fill="${c}"/><rect x="52.7" y="5.5" width="3.8" height="13" rx="1" fill="${c}"/><rect x="49.5" y="9" width="2.2" height="6" fill="${c}"/></svg><div>${t.first ? `<small>${esc(t.first.toUpperCase())}</small>` : ''}<b>${esc(t.last.toUpperCase())}</b><i>${esc(t.tit.toUpperCase())}</i></div></div>`;
  if (+n === 3) return `<div class="lg lg3" style="color:${c};font-size:${fs}"><svg class="lgm" viewBox="0 0 48 48" fill="none" stroke="${c}" aria-hidden="true"><circle cx="24" cy="24" r="21.5" stroke-width="2"/><circle cx="24" cy="24" r="17.8" stroke-width=".9"/><polyline points="12.5,30.5 12.5,17.5 18.25,24.5 24,17.5 24,30.5" stroke-width="2.6" stroke-linejoin="miter" stroke-linecap="square"/><path d="M35.5 17.5H31a3 3 0 0 0 0 6.5h1.5a3.25 3.25 0 0 1 0 6.5H27.5" stroke-width="2.6"/></svg><span class="bar"></span><div><b>${esc(t.full)}</b><i>${esc(t.tit.toUpperCase())}</i></div></div>`;
  return `<div class="lg lg1" style="color:${c};font-size:${fs}"><svg class="lgm" viewBox="0 0 48 48" fill="none" stroke="${c}" aria-hidden="true"><polygon points="24,3.5 41.8,13.75 41.8,34.25 24,44.5 6.2,34.25 6.2,13.75" stroke-width="2.4" stroke-linejoin="round"/><polyline points="15.5,31.5 15.5,17.5 24,26 32.5,17.5 32.5,31.5" stroke-width="3.6" stroke-linejoin="miter" stroke-linecap="square"/></svg><div><b>${esc(t.full.toUpperCase())}</b><i>${esc(t.tit.toUpperCase())}</i></div></div>`;
}

export function logoPickHTML(cfg) {
  return [1, 2, 3].map((n) => `<button type="button" class="logo-opt ${cfg.logo === n ? 'on' : ''}" data-act="logo" data-v="${n}" aria-pressed="${cfg.logo === n}">${logoHTML(cfg, n, '#e9ebee', n === 2 ? '12px' : '13px')}<span class="ln"><i></i>${LOGO_NAMES[n]}</span></button>`).join('');
}

/* ---------------- painéis ---------------- */
export function identityHTML(app) {
  const c = app.config;
  const t = c.trainer;
  const open = app.ui.idOpen;
  const resumo = [`Logo ${LOGO_NAMES[c.logo]}`, t.nome, c.capa === 'light' ? 'capa clara' : 'capa grafite'].filter(Boolean).join(' · ');
  return `<header class="panel-h tog"><h2>Identidade do documento</h2><p>${open ? 'Logo e dados do profissional que aparecem na capa e no rodapé das páginas. Valem para todos os alunos.' : esc(resumo)}</p>
    <button type="button" class="ib tog-b ${open ? 'rot' : ''}" data-act="idToggle" aria-expanded="${open}" aria-label="${open ? 'Recolher identidade' : 'Editar identidade'}">${ic('down')}</button></header>
  ${open ? '' : '<div hidden>'}
  <div class="logo-pick" id="logo-pick">${logoPickHTML(c)}</div>
  <div class="grid g4">
    ${F('Nome do profissional', 'config.trainer.nome', t.nome, { rr: 'logos' })}
    ${F('Título', 'config.trainer.titulo', t.titulo, { rr: 'logos' })}
    ${F('CREF', 'config.trainer.cref', t.cref, { ph: '000000-G/MG' })}
    ${F('Contato', 'config.trainer.contato', t.contato, { ph: '@instagram ou WhatsApp' })}
  </div>
  <div class="opts">
    <div class="opt">Capa do PDF <div class="seg">${[['dark', 'Grafite'], ['light', 'Clara, economiza tinta']].map(([v, l]) => `<button type="button" data-act="capa" data-v="${v}" class="${c.capa === v ? 'on' : ''}" aria-pressed="${c.capa === v}">${l}</button>`).join('')}</div></div>
    <label class="sw"><input type="checkbox" data-path="config.legenda" ${c.legenda ? 'checked' : ''}>Incluir legenda dos termos na capa</label>
  </div>${open ? '' : '</div>'}`;
}

export function alunoHTML(app) {
  const a = app.plan.aluno;
  return `<header class="panel-h"><h2>Aluno e planejamento</h2><p>Informações da capa do PDF.</p></header>
  <div class="grid g4">
    ${F('Nome do aluno', 'aluno.nome', a.nome, { cls: 'span2', ph: 'Nome e sobrenome', rr: 'title' })}
    ${F('Versão / período', 'aluno.periodo', a.periodo, { ph: '2025/1' })}
    ${F('Início do ciclo', 'aluno.inicio', a.inicio, { ph: '03/02/2025' })}
    ${F('Objetivo', 'aluno.objetivo', a.objetivo, { cls: 'span2', ph: 'Ex.: hipertrofia de membros superiores' })}
    ${F('Tempo de treino', 'aluno.tempo', a.tempo, { ph: '60 a 80 minutos' })}
    ${F('Frequência semanal', 'aluno.frequencia', a.frequencia, { ph: '4 vezes por semana' })}
    ${F('Orientações gerais', 'aluno.orientacoes', a.orientacoes, { cls: 'full', area: 1, rows: 3, ph: 'Aquecimento, hidratação, como registrar as cargas… (aparece na capa, até cerca de 7 linhas)' })}
  </div>`;
}

export function tabsHTML(app) {
  const p = app.plan;
  return p.fichas.map((f, i) => {
    const n = exCount(f);
    return `<button type="button" class="tab ${i === p.ui.fi ? 'on' : ''}" data-act="tab" data-fi="${i}" role="tab" aria-selected="${i === p.ui.fi}"><span class="plate">${esc(fichaLetter(f, i))}</span><span><b>${esc(f.nome || 'Ficha')}</b><small>${esc(f.foco || `${n} exercício${n === 1 ? '' : 's'}`)}</small></span></button>`;
  }).join('') + `<button type="button" class="tab tab-add" data-act="addFicha">${ic('plus')}Nova ficha</button>`;
}

export function fichasHTML(app) {
  return `<header class="panel-h"><h2>Fichas</h2><p>Cada ficha vira uma sessão no PDF. Exercícios, super-sets e seções podem ser reordenados.</p></header>
  <div class="tabs" id="tabs" role="tablist">${tabsHTML(app)}</div>
  <div id="ficha-ed">${fichaEdHTML(app)}</div>`;
}

export function fichaEdHTML(app) {
  const p = app.plan;
  const fi = p.ui.fi;
  const f = p.fichas[fi];
  const base = `fichas.${fi}`;
  const codes = codesFor(f);
  const n = p.fichas.length;
  return `<div class="fmeta">
    <div class="grid">
      ${F('Nome da ficha', `${base}.nome`, f.nome, { rr: 'tabs', ph: 'Ficha A' })}
      ${F('Foco da sessão', `${base}.foco`, f.foco, { rr: 'tabs', ph: 'Ex.: peito e tríceps' })}
      ${F('Duração', `${base}.duracao`, f.duracao, { ph: '60 a 80 min' })}
    </div>
    <div class="facts">
      <button type="button" class="ib" data-act="moveFicha" data-d="-1" title="Mover ficha para a esquerda" aria-label="Mover ficha para a esquerda" ${fi === 0 ? 'disabled' : ''}>${ic('left')}</button>
      <button type="button" class="ib" data-act="moveFicha" data-d="1" title="Mover ficha para a direita" aria-label="Mover ficha para a direita" ${fi === n - 1 ? 'disabled' : ''}>${ic('right')}</button>
      <button type="button" class="ib" data-act="dupFicha" title="Duplicar ficha" aria-label="Duplicar ficha">${ic('copy')}</button>
      <button type="button" class="ib del" data-act="delFicha" title="Excluir ficha" aria-label="Excluir ficha">${ic('trash')}</button>
    </div>
  </div>
  ${F('Observações da ficha', `${base}.obs`, f.obs, { area: 1, rows: 2, ph: 'Aparece logo abaixo do título da ficha no PDF (opcional)' })}
  <div class="blocks">${f.blocos.length ? f.blocos.map((b, bi) => blockEdHTML(app, fi, bi, codes[bi])).join('') : '<div class="empty"><b>Ficha vazia</b>Adicione o primeiro exercício pelos botões abaixo.</div>'}</div>
  <div class="addbar">
    <button type="button" class="btn" data-act="addEx">${ic('plus')}Exercício</button>
    <button type="button" class="btn" data-act="addSS">${ic('merge')}Super-set</button>
    <button type="button" class="btn" data-act="addSec">${ic('section')}Título de seção</button>
  </div>
  ${cardioEdHTML(app, fi)}`;
}

function blockEdHTML(app, fi, bi, code) {
  const f = app.plan.fichas[fi];
  const b = f.blocos[bi];
  const base = `fichas.${fi}.blocos.${bi}`;
  const last = f.blocos.length - 1;
  const mv = `<button type="button" class="ib" data-act="moveBlock" data-bi="${bi}" data-d="-1" title="Subir" aria-label="Subir" ${bi === 0 ? 'disabled' : ''}>${ic('up')}</button><button type="button" class="ib" data-act="moveBlock" data-bi="${bi}" data-d="1" title="Descer" aria-label="Descer" ${bi === last ? 'disabled' : ''}>${ic('down')}</button>`;
  if (b.tipo === 'sec') return `<div class="sec-ed"><input class="in" data-path="${base}.titulo" value="${esc(b.titulo)}" placeholder="Título da seção, por exemplo: Core, ou Conjugados de bíceps e tríceps"><div class="acts">${mv}<button type="button" class="ib del" data-act="delBlock" data-bi="${bi}" title="Remover seção" aria-label="Remover seção">${ic('trash')}</button></div></div>`;
  if (b.tipo === 'ex') return exEdHTML(app, fi, bi, 0, code.single, false, mv);
  return `<div class="ss-ed">
    <div class="ss-ed-h"><span class="ss-tag">Super-set ${code.letter}</span><input class="in" data-path="${base}.nota" value="${esc(b.nota)}" placeholder="${esc(ssDefault(code.codes))}">
      <div class="acts"><button type="button" class="btn ghost sm" data-act="split" data-bi="${bi}">Desagrupar</button>${mv}<button type="button" class="ib del" data-act="delBlock" data-bi="${bi}" title="Remover super-set" aria-label="Remover super-set">${ic('trash')}</button></div></div>
    ${b.exercicios.map((e, ei) => exEdHTML(app, fi, bi, ei, code.codes[ei], true)).join('')}
    <div><button type="button" class="linkbtn" data-act="addToSS" data-bi="${bi}">${ic('plus')}Adicionar exercício ao super-set</button></div>
  </div>`;
}

function exEdHTML(app, fi, bi, ei, code, inSS, mv) {
  const f = app.plan.fichas[fi];
  const b = f.blocos[bi];
  const e = b.exercicios[ei];
  const base = `fichas.${fi}.blocos.${bi}.exercicios.${ei}`;
  const d = `data-bi="${bi}" data-ei="${ei}"`;
  const nx = f.blocos[bi + 1];
  const moves = inSS
    ? `<button type="button" class="ib" data-act="moveEx" ${d} data-d="-1" title="Subir no super-set" aria-label="Subir no super-set" ${ei === 0 ? 'disabled' : ''}>${ic('up')}</button><button type="button" class="ib" data-act="moveEx" ${d} data-d="1" title="Descer no super-set" aria-label="Descer no super-set" ${ei === b.exercicios.length - 1 ? 'disabled' : ''}>${ic('down')}</button>`
    : mv;
  const merge = !inSS && nx && nx.tipo !== 'sec' ? `<button type="button" class="ib" data-act="merge" data-bi="${bi}" title="Conjugar com o próximo (super-set)" aria-label="Conjugar com o próximo (super-set)">${ic('merge')}</button>` : '';
  return `<article class="exe ${e.collapsed ? 'collapsed' : ''}" data-ex="${e.id}">
    <header class="exe-h"><span class="code">${esc(code)}</span>
      <input class="exe-name" data-path="${base}.nome" value="${esc(e.nome)}" placeholder="Nome do exercício" aria-label="Nome do exercício">
      <span class="exe-sum">${esc(exSummary(e))}</span>
      <div class="acts">${merge}<button type="button" class="ib" data-act="dupEx" ${d} title="Duplicar exercício" aria-label="Duplicar exercício">${ic('copy')}</button>${moves}
        <button type="button" class="ib ${e.collapsed ? '' : 'rot'}" data-act="collapse" ${d} title="${e.collapsed ? 'Expandir' : 'Recolher'}" aria-label="${e.collapsed ? 'Expandir' : 'Recolher'}" aria-expanded="${!e.collapsed}">${ic('down')}</button>
        <button type="button" class="ib del" data-act="delEx" ${d} title="Remover exercício" aria-label="Remover exercício">${ic('trash')}</button></div>
    </header>
    <div class="exe-b">
      ${mediaEdHTML(app, e, base, d)}
      <div class="exe-fields">
        <div class="pgrid">
          ${F('Grupo muscular / foco', `${base}.grupo`, e.grupo, { cls: 'span3', ph: 'Ex.: peitoral superior' })}
          ${F('Séries', `${base}.series`, e.series, { list: 'dl-series', ph: '4' })}
          ${F('Repetições', `${base}.reps`, e.reps, { list: 'dl-reps', ph: '10 a 12' })}
          ${F('Carga', `${base}.carga`, e.carga, { list: 'dl-carga', ph: 'Moderada, 20 kg…' })}
          ${F('Cadência', `${base}.cadencia`, e.cadencia, { list: 'dl-cad', ph: '1:2' })}
          ${F('Amplitude (ADM)', `${base}.adm`, e.adm, { list: 'dl-adm', ph: 'Alta' })}
          ${F('Descanso (TR)', `${base}.tr`, e.tr, { list: 'dl-tr', ph: '60 a 90s' })}
        </div>
        <div class="sub">
          <div class="sub-h"><b>Parâmetros extras</b><button type="button" class="linkbtn" data-act="addExtra" ${d}>${ic('plus')}Adicionar parâmetro</button>
          ${e.extras.length ? '' : '<p class="hint">Para tempo de execução, pegada, inclinação do banco ou qualquer outro dado.</p>'}</div>
          ${e.extras.map((x, xi) => `<div class="xrow"><input class="in" data-path="${base}.extras.${xi}.label" value="${esc(x.label)}" placeholder="Nome, ex.: Tempo de execução" aria-label="Nome do parâmetro"><input class="in" data-path="${base}.extras.${xi}.valor" value="${esc(x.valor)}" placeholder="Valor, ex.: 40s (20 + 10 + 10)" aria-label="Valor do parâmetro"><button type="button" class="ib del" data-act="delExtra" ${d} data-xi="${xi}" title="Remover parâmetro" aria-label="Remover parâmetro">${ic('x')}</button></div>`).join('')}
        </div>
        <div class="sub">
          <div class="sub-h"><label class="sw"><input type="checkbox" data-path="${base}.prog.ativo" data-rr="ficha" ${e.prog.ativo ? 'checked' : ''}>Tabela de progressão por série</label>
          ${e.prog.ativo ? `<button type="button" class="linkbtn" data-act="fillRows" ${d}>Recriar linhas pelo nº de séries</button>` : ''}</div>
          ${e.prog.ativo ? `<div class="prow h"><span>Série</span><span>Carga</span><span>Repetições</span><span>Nota</span><span></span></div>
          ${e.prog.linhas.map((r, ri) => `<div class="prow"><input class="in" data-path="${base}.prog.linhas.${ri}.serie" value="${esc(r.serie)}" aria-label="Série"><input class="in" data-path="${base}.prog.linhas.${ri}.carga" value="${esc(r.carga)}" placeholder="15 kg" aria-label="Carga"><input class="in" data-path="${base}.prog.linhas.${ri}.reps" value="${esc(r.reps)}" placeholder="12" aria-label="Repetições"><input class="in" data-path="${base}.prog.linhas.${ri}.nota" value="${esc(r.nota)}" placeholder="moderada" aria-label="Nota"><button type="button" class="ib del" data-act="delRow" ${d} data-ri="${ri}" title="Remover série" aria-label="Remover série">${ic('x')}</button></div>`).join('')}
          <div><button type="button" class="linkbtn" data-act="addRow" ${d}>${ic('plus')}Adicionar série</button></div>` : ''}
        </div>
        ${F('Atenção / dica técnica', `${base}.obs`, e.obs, { area: 1, rows: 2, ph: 'Ex.: atenção para não roubar com o tronco' })}
      </div>
    </div>
  </article>`;
}

function dropHTML(kind, d, title, sub) {
  return `<label class="drop" data-drop="${kind}" ${d}>${ic(kind)}<b><span class="t-desk">Arraste ${title} ou clique</span><span class="t-touch">Toque para escolher ${title}</span></b><span>${sub}</span><input type="file" accept="${kind}/*" data-file="${kind}" ${d} aria-label="Escolher ${title}"></label>`;
}

function mediaEdHTML(app, e, base, d) {
  const m = e.media;
  const urls = app.urls;
  const tabs = [['image', 'Imagem'], ['video', 'Vídeo'], ['link', 'Link']].map(([v, l]) => `<button type="button" class="${m.tab === v ? 'on' : ''}" data-act="mtab" data-v="${v}" ${d} aria-pressed="${m.tab === v}">${ic(v)}${l}</button>`).join('');
  let body = '';
  if (m.tab === 'image') {
    const u = urls.get(m.imageId);
    body = u
      ? `<div class="mprev" style="background-image:url('${u}')" role="img" aria-label="Imagem do exercício"></div>
      <div class="mbar"><label class="btn sm">${ic('upload')}Trocar<input type="file" accept="image/*" data-file="image" ${d} hidden></label><button type="button" class="btn sm" data-act="mremove" ${d}>${ic('trash')}Remover</button></div>`
      : (m.imageId ? '<p class="hint">A imagem não foi encontrada neste aparelho. Envie novamente.</p>' : '') + dropHTML('image', d, 'uma imagem', 'JPG, PNG, WebP ou HEIC. O tamanho é otimizado automaticamente.');
  } else if (m.tab === 'video') {
    const u = urls.get(m.videoId);
    const p = urls.get(m.posterId);
    if (u || p) {
      const player = u
        ? `<video src="${u}" ${p ? `poster="${p}"` : ''} controls muted playsinline preload="metadata"></video>`
        : `<div class="poster-only" style="background-image:url('${p}')" role="img" aria-label="Quadro do vídeo"><span>Somente o quadro do PDF está salvo</span></div>`;
      body = `<div class="mprev">${player}</div>
      <div class="mbar"><label class="btn sm">${ic('upload')}Trocar<input type="file" accept="video/*" data-file="video" ${d} hidden></label><button type="button" class="btn sm" data-act="mremove" ${d}>${ic('trash')}Remover</button></div>
      <div class="mbar"><label class="btn sm ghost">${ic('image')}${p ? 'Trocar capa' : 'Escolher capa'}<input type="file" accept="image/*" data-file="poster" ${d} hidden></label>${u ? `<button type="button" class="btn sm ghost" data-act="vfree" ${d} title="Apaga o arquivo de vídeo e mantém só o quadro usado no PDF">Liberar espaço</button>` : ''}</div>
      ${p ? '' : '<p class="hint warn">Não foi possível extrair um quadro deste vídeo neste aparelho. Escolha uma foto como capa para o PDF.</p>'}
      ${F('Link público do vídeo (opcional)', `${base}.media.videoUrl`, m.videoUrl, { ph: 'https://…', url: 1 })}
      <p class="hint">O PDF mostra um quadro do vídeo. Com um link público, o aluno também recebe um QR code para assistir.</p>`;
    } else {
      body = (m.videoId ? '<p class="hint">O vídeo não foi encontrado neste aparelho. Envie novamente.</p>' : '') + dropHTML('video', d, 'um vídeo curto', 'MP4, MOV ou WebM, de preferência até 30 segundos.');
    }
  } else {
    const u = normUrl(m.url);
    body = `${F('Endereço do vídeo', `${base}.media.url`, m.url, { rr: 'qr', qr: e.id, ph: 'youtube.com/…, instagram.com/…', url: 1 })}
      <div class="qrbox" id="qr-${e.id}">${u ? qrSvg(u) : '<p class="hint">O QR code aparece aqui</p>'}</div>
      <p class="hint">YouTube, Instagram, Google Drive ou qualquer link público. No PDF vira um QR code clicável.</p>`;
  }
  return `<div class="media-ed"><div class="seg sm" role="group" aria-label="Tipo de mídia">${tabs}</div>${body}</div>`;
}

function cardioEdHTML(app, fi) {
  const c = app.plan.fichas[fi].cardio;
  const b = `fichas.${fi}.cardio`;
  return `<div class="cardio-ed"><label class="sw"><input type="checkbox" data-path="${b}.ativo" data-rr="ficha" ${c.ativo ? 'checked' : ''}>Cardio ao final da ficha</label>
  ${c.ativo ? `<div class="grid g4">${F('Duração', `${b}.duracao`, c.duracao, { ph: '15 minutos' })}${F('Intensidade / velocidade', `${b}.intensidade`, c.intensidade, { ph: '8 a 12 km/h' })}${F('Modalidade e observações', `${b}.obs`, c.obs, { cls: 'span2', ph: 'Esteira, bicicleta, escada…' })}</div>` : ''}</div>`;
}

/* ---------------- renderização ---------------- */
export function renderAll(app) {
  $('#sec-id').innerHTML = identityHTML(app);
  $('#sec-aluno').innerHTML = alunoHTML(app);
  renderFichas(app);
}
export function renderFichas(app) {
  const p = app.plan;
  p.ui.fi = Math.min(Math.max(0, p.ui.fi || 0), p.fichas.length - 1);
  $('#sec-fichas').innerHTML = fichasHTML(app);
}
export function renderTabs(app) { const t = $('#tabs'); if (t) t.innerHTML = tabsHTML(app); }
export function renderLogos(app) { const l = $('#logo-pick'); if (l) l.innerHTML = logoPickHTML(app.config); }
export function renderQr(id, url) {
  const box = document.getElementById(`qr-${id}`);
  const u = normUrl(url);
  if (box) box.innerHTML = u ? qrSvg(u) : '<p class="hint">O QR code aparece aqui</p>';
}
