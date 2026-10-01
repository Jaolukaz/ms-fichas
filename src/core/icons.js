/**
 * Ícones de traço (caixa 24 × 24) usados na interface e no relatório.
 * IP: marcação SVG para a interface. RI: os mesmos desenhos como um único caminho `d`,
 * forma exigida pelo PDF vetorial (círculos convertidos em arcos).
 */
export const IP = {
  series: '<path d="M12 3 3 7.5 12 12l9-4.5L12 3z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  reps: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11V9.5a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/>',
  carga: '<path d="M6.5 6v12M17.5 6v12M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  cad: '<path d="M7.5 21 10.5 3h3l3 18z"/><path d="M12 16.5 16.5 7"/>',
  tr: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5M12 2.5V6"/>',
  adm: '<path d="M5 19A14 14 0 0 1 19 5"/><path d="M15 4.2 19 5l-.8 4"/><path d="m4.2 15 .8 4 4-.8"/>',
  extra: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.4v.1"/>',
  cardio: '<path d="M3 12h4l2.5-6.5 5 13 2.5-6.5h4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect x="2.5" y="6" width="13.5" height="12" rx="2"/><path d="m21.5 8-5.5 4 5.5 4z"/>',
  link: '<path d="M10 13.5a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 10.5a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  trash: '<path d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5l1 13.5h9l1-13.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  merge: '<path d="M7 3.5V9a5 5 0 0 0 10 0V3.5"/><path d="M12 14v6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3.5"/>',
  section: '<path d="M4 7h16M4 12h10M4 17h7"/>',
  play: '<path d="M7 4.5v15L19.5 12z" fill="COLOR" stroke="none"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  pdf: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  install: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  broom: '<path d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5l1 13.5h9l1-13.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
};

/** Marcação SVG de um ícone para a interface. */
export const ic = (n, c = 'currentColor', w = 1.8) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(IP[n] || '').replace(/COLOR/g, c)}</svg>`;

const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Ícones do relatório como caminho único (traço), na mesma caixa 24 × 24. */
export const RI = {
  series: 'M12 3 3 7.5 12 12l9-4.5L12 3z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  reps: 'M17 2.5l3 3-3 3 M4 11V9.5a4 4 0 0 1 4-4h12 M7 21.5l-3-3 3-3 M20 13v1.5a4 4 0 0 1-4 4H4',
  carga: 'M6.5 6v12M17.5 6v12M3.5 9v6M20.5 9v6M6.5 12h11',
  cad: 'M7.5 21 10.5 3h3l3 18z M12 16.5 16.5 7',
  tr: `${circ(12, 13.5, 7.5)} M12 9.5v4l2.5 2 M9.5 2.5h5M12 2.5V6`,
  adm: 'M5 19A14 14 0 0 1 19 5 M15 4.2 19 5l-.8 4 M4.2 15l.8 4 4-.8',
  extra: `${circ(12, 12, 8.5)} M12 8v8M8 12h8`,
  alert: 'M12 3.5 2.5 20h19L12 3.5z M12 10v4.5 M12 17.4v.1',
  cardio: 'M3 12h4l2.5-6.5 5 13 2.5-6.5h4',
  list: 'M9 6h11M9 12h11M9 18h11 M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  right: 'M9 6l6 6-6 6',
};
/** Triângulo de "play" (preenchido). */
export const RI_PLAY = 'M7 4.5v15L19.5 12z';
