/**
 * Modelo de dados das fichas (sem DOM): criação, normalização de arquivos antigos,
 * numeração de exercícios e super-sets, e o planejamento de exemplo.
 *
 * Um planejamento é { v, aluno, fichas, ui }. A identidade do profissional (logo, nome,
 * capa, legenda) fica em `config`, compartilhada por todos os planejamentos do aparelho.
 * O formato é o mesmo da versão 1 (arquivo HTML único), o que mantém os backups compatíveis.
 */
import { DEFAULT_TRAINER, LETTERS } from './config.js';

export const SCHEMA_VERSION = 2;

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const has = (s) => String(s ?? '').trim() !== '';
export const trim = (s) => String(s ?? '').trim();
export const pad = (n) => String(n).padStart(2, '0');

/* ---------------- criação ---------------- */
export const newMedia = () => ({ tab: 'image', imageId: '', videoId: '', posterId: '', url: '', videoUrl: '' });
export const newEx = () => ({
  id: uid(), nome: '', grupo: '', series: '', reps: '', carga: '', cadencia: '', adm: '', tr: '', obs: '',
  extras: [], prog: { ativo: false, linhas: [] }, media: newMedia(), collapsed: false,
});
export const newBlock = (tipo, exercicios = []) => ({ id: uid(), tipo, titulo: '', nota: '', exercicios });
export const newFicha = (i) => ({
  id: uid(), nome: `Ficha ${LETTERS[i] || i + 1}`, foco: '', duracao: '', obs: '', blocos: [],
  cardio: { ativo: false, duracao: '', intensidade: '', obs: '' },
});
export const blankConfig = () => ({ logo: 1, capa: 'dark', legenda: true, trainer: { ...DEFAULT_TRAINER } });
export const blankAluno = () => ({ nome: '', objetivo: '', tempo: '', periodo: '', inicio: '', frequencia: '', orientacoes: '' });
export const blankPlan = () => ({ v: SCHEMA_VERSION, aluno: blankAluno(), fichas: [newFicha(0)], ui: { fi: 0 } });

/* ---------------- normalização (aceita dados da versão 1) ---------------- */
const str = (v) => (v == null ? '' : String(v));

function normEx(e) {
  const d = newEx();
  const src = e && typeof e === 'object' ? e : {};
  const out = { ...d, ...src, id: src.id || uid() };
  ['nome', 'grupo', 'series', 'reps', 'carga', 'cadencia', 'adm', 'tr', 'obs'].forEach((k) => { out[k] = str(out[k]); });
  out.extras = Array.isArray(src.extras) ? src.extras.map((x) => ({ label: str(x?.label), valor: str(x?.valor) })) : [];
  out.prog = {
    ativo: !!src.prog?.ativo,
    linhas: Array.isArray(src.prog?.linhas) ? src.prog.linhas.map((r) => ({ serie: str(r?.serie), carga: str(r?.carga), reps: str(r?.reps), nota: str(r?.nota) })) : [],
  };
  out.media = { ...d.media, ...(src.media || {}) };
  if (!['image', 'video', 'link'].includes(out.media.tab)) out.media.tab = 'image';
  out.collapsed = !!src.collapsed;
  return out;
}

export function normalizeConfig(c) {
  const b = blankConfig();
  const src = c && typeof c === 'object' ? c : {};
  const out = { ...b, ...src, trainer: { ...b.trainer, ...(src.trainer || {}) } };
  out.logo = [1, 2, 3].includes(+out.logo) ? +out.logo : 1;
  out.capa = out.capa === 'light' ? 'light' : 'dark';
  out.legenda = out.legenda !== false;
  return out;
}

/** Converte qualquer estado salvo (v1 ou v2) num planejamento válido. */
export function normalizePlan(s) {
  const src = s && typeof s === 'object' ? s : {};
  const b = blankPlan();
  const out = { v: SCHEMA_VERSION, aluno: { ...b.aluno, ...(src.aluno || {}) }, ui: { fi: 0, ...(src.ui || {}) } };
  Object.keys(out.aluno).forEach((k) => { out.aluno[k] = str(out.aluno[k]); });
  const fichas = Array.isArray(src.fichas) && src.fichas.length ? src.fichas : b.fichas;
  out.fichas = fichas.map((f, i) => {
    const d = newFicha(i);
    return {
      ...d, ...f, id: f?.id || uid(),
      nome: str(f?.nome ?? d.nome), foco: str(f?.foco), duracao: str(f?.duracao), obs: str(f?.obs),
      cardio: { ...d.cardio, ...(f?.cardio || {}), ativo: !!f?.cardio?.ativo },
      blocos: (Array.isArray(f?.blocos) ? f.blocos : []).map((bl) => {
        const tipo = ['ex', 'ss', 'sec'].includes(bl?.tipo) ? bl.tipo : 'ex';
        return { ...newBlock(tipo), ...bl, tipo, titulo: str(bl?.titulo), nota: str(bl?.nota), exercicios: (Array.isArray(bl?.exercicios) ? bl.exercicios : []).map(normEx) };
      }).filter((bl) => bl.tipo === 'sec' || bl.exercicios.length),
    };
  });
  out.ui.fi = Math.min(Math.max(0, +out.ui.fi || 0), out.fichas.length - 1);
  return out;
}

/* ---------------- auxiliares de ficha ---------------- */
export function fichaLetter(f, i) {
  const m = /ficha\s+([a-z]|\d{1,2})\b/i.exec(f.nome || '');
  return (m ? m[1] : ((f.nome || '').trim()[0] || LETTERS[i] || '?')).toUpperCase();
}

/** Códigos exibidos: 01, 02… para exercícios simples; A1, A2… para super-sets. */
export function codesFor(f) {
  let n = 0;
  let s = 0;
  return f.blocos.map((b) => {
    if (b.tipo === 'ex') { n += 1; return { single: pad(n) }; }
    if (b.tipo === 'ss') { const L = LETTERS[s] || 'Z'; s += 1; return { letter: L, codes: b.exercicios.map((_, i) => L + (i + 1)) }; }
    return {};
  });
}

export const exCount = (f) => f.blocos.reduce((a, b) => a + (b.tipo === 'sec' ? 0 : b.exercicios.length), 0);
export const joinPt = (a) => (a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);
export const ssDefault = (codes) => `Execute ${joinPt(codes)} em sequência, sem pausa entre eles; o descanso vale ao final da volta.`;

/** Sempre a letra seguinte à maior já usada: as abas ficam em ordem alfabética crescente. */
export function nextFichaName(fichas) {
  const used = fichas.map((f, i) => fichaLetter(f, i)).filter((l) => LETTERS.includes(l));
  const max = used.length ? Math.max(...used.map((l) => LETTERS.indexOf(l))) : -1;
  const L = LETTERS[max + 1] || [...LETTERS].find((l) => !used.includes(l));
  return `Ficha ${L || fichas.length + 1}`;
}

export function reid(f) {
  f.id = uid();
  f.blocos.forEach((b) => { b.id = uid(); b.exercicios.forEach((e) => { e.id = uid(); }); });
}
export function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}
export function seriesCount(e) { const m = /\d+/.exec(e.series || ''); return m ? Math.min(12, Math.max(1, +m[0])) : 3; }
export const progRows = (e) => Array.from({ length: seriesCount(e) }, (_, i) => ({ serie: `${i + 1}ª`, carga: '', reps: '', nota: '' }));
export function exSummary(e) {
  return [has(e.series) && has(e.reps) ? `${e.series} × ${e.reps}` : (e.series || e.reps), e.carga, e.tr].filter(has).join('   ');
}
export function sumSub(f) {
  const n = exCount(f);
  return [f.duracao || 'Duração livre', `${n} ${n === 1 ? 'exercício' : 'exercícios'}`, f.cardio.ativo ? `Cardio${has(f.cardio.duracao) ? ` ${f.cardio.duracao}` : ''}` : 'Sem cardio'].join(' · ');
}

/** Ids de mídia (imagens, vídeos e quadros) usados por um planejamento. */
export function mediaIds(plan) {
  const ids = new Set();
  plan.fichas.forEach((f) => f.blocos.forEach((b) => b.exercicios.forEach((e) => {
    ['imageId', 'videoId', 'posterId'].forEach((k) => { if (e.media[k]) ids.add(e.media[k]); });
  })));
  return ids;
}

/* ---------------- links ---------------- */
export function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^[a-z][\w+.-]*:\/\//i.test(s)) s = `https://${s}`;
  return s;
}
export const isWebUrl = (u) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(u);
export function shortUrl(u) { const s = u.replace(/^https?:\/\/(www\.)?/i, ''); return s.length > 42 ? `${s.slice(0, 40)}…` : s; }

/* ---------------- nomes de arquivo ---------------- */
export const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
export const fileBase = (aluno) => ['Ficha', slug(aluno.nome) || 'Aluno', slug(aluno.periodo)].filter(Boolean).join('_');
export const brDate = (d = new Date()) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/* ---------------- exemplo (Arthur Medrado 2025/1) ---------------- */
export function sample() {
  const E = (nome, o = {}) => {
    const e = newEx();
    const { prog, extras, ...rest } = o;
    Object.assign(e, { nome }, rest);
    if (prog) e.prog = { ativo: true, linhas: prog.map(([serie, carga, reps, nota]) => ({ serie, carga: carga || '', reps: reps || '', nota: nota || '' })) };
    if (extras) e.extras = extras.map(([label, valor]) => ({ label, valor }));
    return e;
  };
  const X = (e) => newBlock('ex', [e]);
  const SS = (nota, ...es) => { const b = newBlock('ss', es); b.nota = nota; return b; };
  const SEC = (t) => { const b = newBlock('sec'); b.titulo = t; return b; };
  const std = (o = {}) => ({ series: '3', reps: '12', cadencia: '1:1', carga: 'Alta', adm: 'Alta', tr: '90s', ...o });

  const A = newFicha(0); A.foco = 'Peito e tríceps'; A.duracao = '60 a 80 min';
  A.blocos = [
    X(E('Supino inclinado com barra', { grupo: 'Peitoral superior', series: '4', reps: 'Mín. 9 a 12', cadencia: '1:2 (sobe 1s, desce 2s)', carga: 'Progressiva (ver tabela)', adm: 'Alta', tr: '60 a 90s', obs: 'Aumentar a carga a cada série é obrigatório, mesmo que as repetições caiam.', prog: [['1ª', '15 kg', '', 'moderada'], ['2ª', '17 kg'], ['3ª', '20 kg'], ['4ª', '22 kg']] })),
    X(E('Crossover na polia alta', std({ grupo: 'Peitoral', series: '4', tr: '60 a 90s', obs: 'Não roubar com o tronco.' }))),
    SS('Supino com halteres e, sem pausa, flexões até a falha. Descanso de 90s ao final.',
      E('Supino reto com halteres', std({ grupo: 'Peitoral', series: '4', obs: 'Não roubar com o tronco.' })),
      E('Flexão de braço, pegada aberta', { grupo: 'Peitoral', series: '4', reps: 'Mín. 8, até a falha', cadencia: '1:1', carga: 'Peso corporal', adm: 'Alta' })),
    X(E('Tríceps testa na polia', std({ grupo: 'Tríceps', cadencia: '1:2', carga: 'Progressiva (ver tabela)', obs: 'Não roubar com o tronco.', prog: [['1ª', '', '', 'moderada'], ['2ª', '', '', 'progressão'], ['3ª', '', '', 'progressão']] }))),
    X(E('Tríceps francês com halter', std({ grupo: 'Tríceps', cadencia: '1:2', carga: 'Moderada', obs: 'Manter o cotovelo estável durante todo o movimento.' }))),
  ];
  A.cardio = { ativo: true, duracao: '10 a 15 min', intensidade: '8 a 12 km/h', obs: 'Esteira, ao final da sessão.' };

  const B = newFicha(1); B.foco = 'Costas e bíceps'; B.duracao = '60 a 80 min';
  B.blocos = [
    X(E('Remada fechada supinada no pulley', { grupo: 'Dorsais', series: '4', reps: 'Mín. 9 a 12', cadencia: '1:2 (sobe 1s, desce 2s)', carga: 'Progressiva (ver tabela)', adm: 'Alta', tr: '60 a 90s', obs: 'Aumentar a carga a cada série é obrigatório, mesmo que as repetições caiam.', prog: [['1ª', '40 kg', '', 'moderada'], ['2ª', '45 kg'], ['3ª', '50 kg'], ['4ª', '55 kg']] })),
    X(E('Remada curvada na polia, pegada supinada aberta', std({ grupo: 'Dorsais e romboides', cadencia: '1:2' }))),
    X(E('Remada cavalinho na máquina', std({ grupo: 'Dorsais e trapézio médio' }))),
    X(E('Remada unilateral com halter', std({ grupo: 'Dorsais' }))),
    X(E('Rosca direta com barra', { grupo: 'Bíceps', series: '3', reps: '7 + 7 + 7', cadencia: '1:1', carga: 'Alta, reduzindo', adm: 'Alta', tr: '90s', obs: 'As primeiras 7 repetições com carga alta; retire anilhas da barra até as últimas 7 serem com carga baixa. Use o suporte da barra para facilitar a troca.' })),
    X(E('Rosca concentrada Arnold', std({ grupo: 'Bíceps' }))),
  ];
  B.cardio = { ativo: true, duracao: '15 min', intensidade: '10 km/h', obs: '' };

  const C = newFicha(2); C.foco = 'Core, ombros e braços'; C.duracao = '60 a 80 min';
  C.blocos = [
    SEC('Core'),
    X(E('Prancha de 6 para 3 apoios', { series: '3', tr: '40s', extras: [['Tempo de execução', '40s (20s + 10s + 10s)']], obs: 'Comece com 6 apoios, retire as bases cruzadas (perna direita e braço esquerdo) e depois troque para o lado oposto.' })),
    X(E('Prancha lateral', { series: '3', tr: '40s', extras: [['Tempo de execução', '15s cada lado']], obs: 'Sem descanso na troca de lado.' })),
    SEC('Ombros'),
    X(E('Elevação lateral unilateral na polia', std({ grupo: 'Deltoide lateral', carga: 'Moderada' }))),
    SS('', E('Desenvolvimento vertical com barra', std({ grupo: 'Deltoides', carga: 'Moderada' })), E('Remada alta com barra', std({ grupo: 'Deltoides e trapézio', carga: 'Moderada' }))),
    X(E('Elevação frontal com halter', std({ grupo: 'Deltoide anterior', carga: 'Moderada' }))),
    SEC('Conjugados de bíceps e tríceps'),
    SS('', E('Rosca martelo bilateral', std({ grupo: 'Bíceps e braquiorradial' })), E('Tríceps mergulho no banco', std({ grupo: 'Tríceps', carga: 'Peso corporal' }))),
    SS('', E('Rosca na polia', std({ grupo: 'Bíceps' })), E('Tríceps na polia', std({ grupo: 'Tríceps' }))),
  ];
  C.cardio = { ativo: true, duracao: '15 min', intensidade: '10 km/h', obs: '' };

  return {
    v: SCHEMA_VERSION,
    aluno: { nome: 'Arthur Medrado', objetivo: 'Hipertrofia de membros superiores (MMSS)', tempo: '60 a 80 minutos', periodo: '2025/1', inicio: '', frequencia: '', orientacoes: '' },
    fichas: [A, B, C],
    ui: { fi: 0 },
  };
}
