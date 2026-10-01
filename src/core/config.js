/**
 * Configuração central: textos fixos, sugestões dos campos e identidade.
 * Para trocar uma sugestão, um rótulo ou um texto da legenda, basta editar este arquivo.
 */
export const APP_ID = 'ms-fichas';
export const APP_VERSION = '2.0.0';
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Profissional padrão (aparece em novos aparelhos e após "Restaurar padrão"). */
export const DEFAULT_TRAINER = { nome: 'Matheus Scaldini', titulo: 'Personal Trainer', cref: '', contato: '' };

export const LOGO_NAMES = { 1: 'Hexágono', 2: 'Barra', 3: 'Anilha' };

/** Sugestões que aparecem ao digitar nos campos de prescrição (datalist). */
export const SUGGESTIONS = {
  series: ['3', '4', '5', '4 (1ª moderada + 3 com progressão)', '3 + 1 de aquecimento'],
  reps: ['8 a 10', '10 a 12', '12', '15', 'Mín. 9 a 12', 'Até a falha', '7 + 7 + 7'],
  carga: ['Leve', 'Moderada', 'Alta', 'Progressiva (ver tabela)', 'Peso corporal'],
  cad: ['1:1', '1:2 (sobe 1s, desce 2s)', '2:2', '2:1', '1:3 (descida lenta)'],
  adm: ['Alta', 'Completa', 'Parcial', 'Parcial (meia amplitude)'],
  tr: ['30s', '45s', '60s', '60 a 90s', '90s', '2 min'],
};

/** Legenda dos termos impressa na capa (opcional). */
export const LEGEND = [
  ['Cadência', 'Tempo de cada fase do movimento. 1:2 significa subir em 1 segundo e descer em 2.'],
  ['Descanso (TR)', 'Pausa entre uma série e a próxima, contada no relógio.'],
  ['Amplitude (ADM)', 'Quanto do movimento é percorrido. Alta indica o arco completo, com controle.'],
  ['Super-set', 'Exercícios feitos em sequência, sem pausa entre eles. O descanso vem ao final.'],
];

/** Mídia: limites de processamento no aparelho. */
export const MEDIA = {
  imageMax: 1800, // lado maior, em px (cerca de 970 dpi na coluna de 47 mm do PDF)
  imageQuality: 0.88,
  posterMax: 1400,
  videoMaxBytes: 150 * 1024 * 1024,
};
