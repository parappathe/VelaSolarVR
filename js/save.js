// Progresso e opções, salvos no navegador (localStorage 'velasolarvr.v1').
const KEY = 'velasolarvr.v1';
const DEFAULTS = {
  done: {},          // fases vencidas: { 0: { stars, time }, ... }
  sound: true,
  fps: false,
  height: 0,         // ajuste fino da altura no VR (m)
  cam: 'gondola',    // PC: 'gondola' ou 'top' (visão de cima)
  zoom: 2,           // zoom do mapa (índice em ZOOMS)
};

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (typeof s.done !== 'object' || !s.done) s.done = {};
    return s;
  } catch { return { ...DEFAULTS, done: {} }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
