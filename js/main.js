// Liga o núcleo (física, fases, robô) à tela, ao Quest (mãos na barra da vela) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { LEVELS, SYSTEMS } from './levels.js';
import { Game, starsFor } from './game.js';
import { DT, predict, accel, shadowFactor } from './physics.js';
import { makeRobot } from './robot.js';
import { buildWorld, buildSystem, buildShip, S, PLANE_Y } from './scene.js';
import { HoloMap, ZOOMS } from './map.js';
import { Panel, Label, C as UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const fmtT = (t) => `${t.toFixed(1).replace('.', ',')} s`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapHalf = (a) => { while (a > Math.PI / 2) a -= Math.PI; while (a < -Math.PI / 2) a += Math.PI; return a; };
const EYE_H = 1.6;              // olhos acima do piso da gôndola (em pé)
const MAX_TILT = 1.3;
const PRED_STEPS = 1800, PRED_EVERY = 6;   // previsão: 30 s, um ponto a cada 0,1 s

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const W = buildWorld(renderer);
const { scene, world } = W;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 20000);
const ship3d = buildShip();
const gondola = ship3d.group;
scene.add(gondola);
const rig = new THREE.Group();          // VR: referência do óculos; PC: olhos
gondola.add(rig);
rig.add(camera);

// mapa holográfico
const holo = new HoloMap();
holo.zoomIdx = clamp(save.zoom | 0, 0, ZOOMS.length - 1);
function placeMap() {
  const g = holo.group;
  if (isVR()) {
    if (g.parent !== gondola) gondola.add(g);
    g.position.set(0, 0.9, -0.55);
    g.rotation.set(-Math.PI / 2 + 0.35, 0, 0);
    g.scale.setScalar(1);
  } else {
    if (g.parent !== camera) camera.add(g);
    // PC: no canto de baixo, inclinado como uma mesa
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const visH = 2 * 0.6 * Math.tan(half), visW = visH * camera.aspect;
    const sc = Math.min(0.7, visH * 0.5 / 0.32 / 2, visW * 0.25 / 0.32);
    g.scale.setScalar(sc);
    g.position.set(visW / 2 - 0.32 * sc * 1.32, -visH / 2 + 0.32 * sc * 0.95, -0.6);
    g.rotation.set(-0.5, 0, 0);
  }
}

// menus e placas
const panel = new Panel(0.8);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const mapLabel = new Label(0.62, 1024, 230);        // placa acima do mapa (VR)
mapLabel.mesh.position.set(0, 1.25, -0.82);
mapLabel.mesh.rotation.x = -0.25;
gondola.add(mapLabel.mesh);
const msgLabel = new Label(1.3, 1024, 128);         // avisos (VR)
msgLabel.mesh.position.set(0, 2.0, -2.4);
gondola.add(msgLabel.mesh);

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'playing' | 'paused' | 'done'
let levelIndex = 0;
let game = null, view = null, viewIdx = -1;
let robot = null;
let msg = null;
let doneTimer = 0;
let lastResult = null, newRecord = false;
let menuT = 0;
let fakeVR = false;            // dev.vrView: mostra o layout do VR sem óculos (para fotos)
const isVR = () => renderer.xr.isPresenting || fakeVR;
const predPts = new Float64Array(2 * (PRED_STEPS / PRED_EVERY + 2));
let pred = { n: 0, hit: -1 };
let furlToggle = false, furlHands = false;
let prevX = 0, prevY = 0, prevP = null;
let wasShade = false, novaShown = false;
const cometNear = new Set();

const unlockedUpTo = () => {
  let n = 0;
  while (n < LEVELS.length && save.done[n]?.stars > 0) n++;
  return Math.min(n, LEVELS.length - 1);
};
const themeOf = (i) => SYSTEMS[LEVELS[i].system].theme;

function loadLevel(i) {
  levelIndex = clamp(i, 0, LEVELS.length - 1);
  game = new Game(LEVELS[levelIndex]);
  if (view) view.dispose();
  view = buildSystem(game, world);
  viewIdx = levelIndex;
  W.setTheme(themeOf(levelIndex));
  sfx.setTheme(themeOf(levelIndex));
  holo.setGame(game);
  robot?.reset();
  furlToggle = false; furlHands = false;
  acc = 0;
  prevX = game.ship.x; prevY = game.ship.y; prevP = game.P.slice();
  wasShade = false; novaShown = false; cometNear.clear();
  W.flash(0);
  msg = null;
  menuT = 0;
  look.yaw = 0; look.pitch = 0.12;
}

function startLevel(i) {
  loadLevel(i);
  app = 'playing';
  doneTimer = 0;
  panel.hide();
  showMsg(LEVELS[levelIndex].hint, 6, '#eef0ff');
  updateHint();
}

function togglePause() {
  if (app === 'playing') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); }
  updateHint();
}

function goMenu() {
  app = 'menu';
  loadLevel(unlockedUpTo());
  showScreen('main');
  updateHint();
}

function showMsg(text, t = 2, color = '#ffd25a') { msg = { text, t, color }; }

// ---------- Menus ----------
function showScreen(name) {
  const vr = isVR();
  placePanel();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Vela Solar', 74);
      p.text('Uma nave sem motor, movida a luz. Incline a vela e navegue entre as estrelas.', 512, 136, { size: 27, color: UI.dim });
      const next = unlockedUpTo();
      p.button(save.done[0] ? `Continuar: fase ${next + 1}` : 'Começar', () => startLevel(next), 262, 185, 500, 96, { size: 38 });
      p.button('Escolher fase', () => showScreen('levels'), 262, 301, 500, 80);
      p.button('Como jogar', () => showScreen('help'), 262, 401, 500, 80);
      const opt = (label, key, x, after) => p.button(`${label}: ${save[key] ? 'sim' : 'não'}`, () => { save[key] = !save[key]; storeSave(save); after?.(); showScreen('main'); }, x, 501, 240, 66, { size: 26 });
      opt('Som', 'sound', 262, () => sfx.setOn(save.sound));
      opt('FPS', 'fps', 522);
      const total = Object.values(save.done).reduce((s, d) => s + (d.stars || 0), 0);
      p.text(`Estrelas: ${total} de ${LEVELS.length * 3}`, 512, 610, { size: 26, color: UI.star });
      p.text(vr ? 'Segure o aperto (botão lateral) das duas mãos para pegar a barra da vela' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 662, { size: 22, color: UI.dim });
    } else if (name === 'levels') {
      p.title('Fases', 52);
      const up = unlockedUpTo();
      SYSTEMS.forEach((sy, gi) => {
        const y = 92 + gi * 182;
        p.text(sy.name, 60, y, { size: 24, align: 'left', bold: true, color: UI.edge });
        for (let c = 0; c < 5; c++) {
          const i = sy.from + c, l = LEVELS[i], d = save.done[i];
          p.tile(60 + c * 184, y + 18, 172, 142, {
            num: i + 1, name: l.name, stars: d?.stars || 0, done: !!d, locked: i > up, master: c === 4,
            action: () => startLevel(i),
          });
        }
      });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 646, 300, 60, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = vr ? [
        'Segure o aperto das duas mãos: você pega a barra da vela.',
        'Gire a barra (uma mão para a frente, outra para trás): a vela gira.',
        'Gire os punhos: a vela deita e empurra menos.',
        'A luz empurra a vela pela frente: de lado para a luz, nada.',
        'Inclinada a favor do movimento acelera; contra, freia a órbita.',
        'A/X ou juntar as mãos: recolhe a vela.  Manche: zoom do mapa.',
        'A linha pontilhada no mapa é para onde você vai.  B/Y: pausa.',
      ] : [
        'Arraste com o botão esquerdo (ou A/D): gira a vela.',
        'W/S: deita a vela (empurra menos) / levanta de novo.',
        'A luz empurra a vela pela frente: de lado para a luz, nada.',
        'Inclinada a favor do movimento acelera; contra, freia a órbita.',
        'Espaço: recolhe/abre a vela.  Roda do mouse: zoom do mapa.',
        'A linha pontilhada no mapa é para onde você vai.',
        'Tab: câmera (gôndola/de cima).  R: recomeça.  Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 56, 128 + i * 58, { size: 26, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 64);
      p.text(`Fase ${levelIndex + 1}: ${LEVELS[levelIndex].name}`, 512, 122, { size: 28, color: UI.dim });
      p.button('Continuar', () => togglePause(), 262, 160, 500, 80);
      p.button('Recomeçar a fase', () => startLevel(levelIndex), 262, 252, 500, 80);
      p.button('Escolher fase', () => showScreen('levels'), 262, 344, 500, 80);
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 262, 436, 245, 80, { size: 28, locked: !vr });
      p.button('Como jogar', () => showScreen('help'), 517, 436, 245, 80, { size: 28 });
      p.button('Mais baixo', () => { save.height -= 0.05; storeSave(save); recenter(); showScreen('pause'); }, 262, 528, 160, 64, { size: 24, locked: !vr });
      p.text(vr ? `altura ${save.height >= 0 ? '+' : ''}${Math.round(save.height * 100)} cm` : '', 512, 560, { size: 22, color: UI.dim });
      p.button('Mais alto', () => { save.height += 0.05; storeSave(save); recenter(); showScreen('pause'); }, 602, 528, 160, 64, { size: 24, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 610, 500, 70);
    } else if (name === 'won') {
      const r = lastResult, def = LEVELS[levelIndex], d = save.done[levelIndex];
      p.title(r.stars === 0 ? 'Chegou, mas devagar' : newRecord ? 'Novo recorde!' : 'Fase completa!', 62);
      p.stars(r.stars, 512, 140, 74);
      p.text(`Tempo: ${fmtT(r.time)}`, 512, 214, { size: 44, bold: true, color: UI.edge });
      p.text(`3 estrelas até ${def.stars[0]} s · 2 até ${def.stars[1]} s · 1 até ${def.stars[2]} s`, 512, 268, { size: 23, color: UI.dim });
      if (d) p.text(`Melhor: ${fmtT(d.time)} (${d.stars} estrela${d.stars === 1 ? '' : 's'})`, 512, 306, { size: 23, color: UI.dim });
      if (r.stars === 0) p.text('Faça em menos tempo para ganhar uma estrela e liberar a próxima.', 512, 342, { size: 23 });
      if (levelIndex < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(levelIndex + 1), 262, 370, 500, 92, { size: 36, locked: !(save.done[levelIndex]?.stars > 0) });
      else p.text('Você cruzou os três sistemas!', 512, 416, { size: 36, bold: true, color: UI.edge });
      p.button('Repetir', () => startLevel(levelIndex), 262, 478, 245, 80);
      p.button('Fases', () => showScreen('levels'), 517, 478, 245, 80);
      p.button('Menu principal', () => goMenu(), 262, 576, 500, 78);
    } else if (name === 'lost') {
      p.title('Fim da viagem', 70);
      p.text(game.lostWhy, 512, 160, { size: 38, bold: true, color: UI.red });
      p.text(lostTip(), 512, 220, { size: 25, color: UI.dim });
      p.button('Tentar de novo', () => startLevel(levelIndex), 262, 290, 500, 96, { size: 38 });
      p.button('Fases', () => showScreen('levels'), 262, 404, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 502, 500, 80);
    }
  });
}
function lostTip() {
  const k = game.lostKind;
  if (k === 'burn') return 'Fique de olho no fim da linha pontilhada: vermelho é batida.';
  if (k === 'crash') return 'Perto de planeta a gravidade puxa forte. Recolha a vela e desvie.';
  if (k === 'lost') return 'Rápido demais: incline a vela contra o movimento para frear.';
  if (k === 'shell') return 'Abra a vela de frente para a explosão: a luz dela te empurra.';
  if (k === 'timeout') return 'Tente um caminho mais curto pela previsão.';
  return '';
}

function placePanel() {
  if (isVR()) {
    if (panel.mesh.parent !== gondola) gondola.add(panel.mesh);
    panel.mesh.scale.setScalar(1);
    panel.mesh.position.set(0, EYE_H + save.height - 0.05, -1.05);
    panel.mesh.rotation.set(-0.05, 0, 0);
    return;
  }
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.rotation.set(0, 0, 0);
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.8, visH * 0.92 / 0.5625));
}

function finishWin() {
  const r = game.result;
  lastResult = r;
  const prev = save.done[levelIndex];
  newRecord = !prev || r.time < prev.time;
  if (r.stars > 0 || prev) {
    save.done[levelIndex] = { stars: Math.max(r.stars, prev?.stars || 0), time: Math.min(r.time, prev?.time ?? Infinity) };
    storeSave(save);
  } else newRecord = false;
  app = 'done';
  showScreen('won');
  for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
  updateHint();
}
function finishLost() {
  app = 'done';
  showScreen('lost');
  updateHint();
}

// ---------- Controles do VR ----------
const ctrls = [];
const markGeo = new THREE.SphereGeometry(0.022, 10, 8);
const markMat = new THREE.MeshBasicMaterial({ color: '#9fd8ff' });
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffc864 }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(markGeo, markMat);
  grip.add(mark);
  const entry = { ctrl, grip, laser, mark, source: null, side: null, prevButtons: [], hoverIndex: -1, stickY: 0 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (entry.side) holds[entry.side] = null; entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (entry.source?.hand && entry.side) holds[entry.side] = null; });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (entry.side && !entry.source?.hand) grabBar(entry.side); });
  ctrl.addEventListener('squeezeend', () => { if (entry.side && !entry.source?.hand) holds[entry.side] = null; });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}

// mão no espaço da gôndola
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function handLocal(side) {
  const e = entryFor(side);
  if (!e) return null;
  rig.updateMatrix();
  _v.copy(e.grip.position).applyMatrix4(rig.matrix);
  _q.copy(rig.quaternion).multiply(e.grip.quaternion);
  if (!Number.isFinite(_v.x)) return null;
  return { p: _v.clone(), q: _q.clone() };
}
const holds = { left: null, right: null };
let tilt0 = 0;
function grabBar(side) {
  const h = handLocal(side);
  if (!h) return;
  holds[side] = { q0: h.q.clone() };
  for (const s of ['left', 'right']) if (holds[s]) { const hh = handLocal(s); if (hh) holds[s].q0 = hh.q.clone(); }
  tilt0 = game?.ctrl.tilt || 0;
  pulse(side, 0.3, 25);
  sfx.click();
}
function twistAbout(qNow, q0, axis) {
  _q2.copy(qNow).multiply(_q.copy(q0).invert());
  const d = _q2.x * axis.x + _q2.y * axis.y + _q2.z * axis.z;
  let a = 2 * Math.atan2(d, _q2.w);
  while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
  return clamp(a, -1.5, 1.5);
}
// pose da barra a partir das mãos: { c, s, roll } no espaço da gôndola, ou null (largada)
const _ax = new THREE.Vector3();
function vrBarPose() {
  const hl = holds.left ? handLocal('left') : null, hr = holds.right ? handLocal('right') : null;
  if (hl && hr) {
    const c = hl.p.clone().add(hr.p).multiplyScalar(0.5);
    const s = hr.p.clone().sub(hl.p);
    const l = s.length();
    if (l < 0.02) return { c, s: new THREE.Vector3(1, 0, 0), roll: 0, together: true };
    s.divideScalar(l);
    const roll = (twistAbout(hl.q, holds.left.q0, s) + twistAbout(hr.q, holds.right.q0, s)) / 2;
    return { c, s, roll, together: l < 0.14 };
  }
  const one = hl ? ['left', hl] : hr ? ['right', hr] : null;
  if (!one) return null;
  const [side, h] = one;
  _ax.set(1, 0, 0).applyQuaternion(h.q);
  const s = _ax.clone(), sg = side === 'left' ? 1 : -1;
  return { c: h.p.clone().addScaledVector(s, 0.3 * sg), s, roll: twistAbout(h.q, holds[side].q0, s), together: false };
}

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) {
    if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } }
    return;
  }
  if (entry.source?.hand && entry.side) grabBar(entry.side);   // mão rastreada: pinça segura a barra
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) { if (app === 'playing' || app === 'paused') togglePause(); }   // B ou Y
    if (b[4] && !e.prevButtons[4] && app === 'playing') toggleFurl();                                // A ou X
    e.prevButtons = b;
    // manche para cima/baixo: zoom do mapa
    const y = gp.axes[3] ?? 0;
    if (Math.abs(y) > 0.7 && Math.abs(e.stickY) <= 0.7) setZoom(y > 0 ? 1 : -1);
    e.stickY = y;
  }
}
function toggleFurl() {
  furlToggle = !furlToggle;
  sfx.furl(furlToggle);
}
function setZoom(dir) {
  holo.zoom(dir);
  save.zoom = holo.zoomIdx; storeSave(save);
}

// ---------- VR: sessão e recentralizar ----------
let recenterIn = 0;
function recenter() {
  if (!renderer.xr.isPresenting) return;
  // põe os olhos no meio da gôndola, olhando para a frente, na altura certa (sentado ou em pé)
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, EYE_H + save.height - head.y, 0.15 - head.z);
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 6;
  if (camera.parent !== rig) rig.add(camera);
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  placeMap();
  if (panel.visible) placePanel();
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  holds.left = holds.right = null;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  placeMap();
  if (panel.visible) placePanel();
  onResize();
  updateHint();
});

// ---------- Mouse e teclado (PC) ----------
const look = { yaw: 0, pitch: 0.12 };
const keys = new Set();
const mouse = { ndc: new THREE.Vector2(0, 0), dragL: false, dragR: false, lx: 0, ly: 0 };
const raycaster = new THREE.Raycaster();
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app !== 'playing') return;
  if (e.button === 0) mouse.dragL = true;
  if (e.button === 2) mouse.dragR = true;
  mouse.lx = e.clientX; mouse.ly = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* nada */ }
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 0) mouse.dragL = false;
  if (e.button === 2) mouse.dragR = false;
});
canvas.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  const dx = e.clientX - mouse.lx, dy = e.clientY - mouse.ly;
  mouse.lx = e.clientX; mouse.ly = e.clientY;
  if (app !== 'playing' || dev.autoplay) return;
  if (mouse.dragL) {
    // arrastar para a direita gira a vela no sentido horário (visto de cima)
    game.ctrl.ang -= dx * 0.006;
    game.ctrl.tilt = clamp(game.ctrl.tilt + dy * 0.004, 0, MAX_TILT);
  } else if (mouse.dragR) {
    look.yaw = clamp(look.yaw - dx * 0.004, -2.6, 2.6);
    look.pitch = clamp(look.pitch - dy * 0.004, -1.2, 1.2);
  }
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(e.deltaY > 0 ? 1 : -1); }, { passive: false });
window.addEventListener('blur', () => { keys.clear(); mouse.dragL = mouse.dragR = false; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === 'tab' || k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (e.repeat) return;
  if (k === 'escape' || k === 'p') { if (app === 'playing' || app === 'paused') togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (k === 'tab') { save.cam = save.cam === 'gondola' ? 'top' : 'gondola'; storeSave(save); placeMap(); return; }
  if (k === '+' || k === '=') { setZoom(-1); return; }
  if (k === '-') { setZoom(1); return; }
  if (app !== 'playing') return;
  if (k === 'r') { startLevel(levelIndex); return; }
  keys.add(k);
  if (k === ' ' && !dev.autoplay) toggleFurl();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.visible) placePanel();
  placeMap();
}
window.addEventListener('resize', onResize);

function pcControls(dt) {
  if (renderer.xr.isPresenting || dev.autoplay || app !== 'playing') return;
  const c = game.ctrl;
  if (keys.has('a') || keys.has('arrowleft')) c.ang += 1.1 * dt;
  if (keys.has('d') || keys.has('arrowright')) c.ang -= 1.1 * dt;
  if (keys.has('w') || keys.has('arrowup')) c.tilt = clamp(c.tilt + 0.9 * dt, 0, MAX_TILT);
  if (keys.has('s') || keys.has('arrowdown')) c.tilt = clamp(c.tilt - 0.9 * dt, 0, MAX_TILT);
  c.furl = furlToggle;
}

// VR: barra -> vela. Sem as mãos na barra, a vela fica como estava.
let barPose = null;
function vrControls(dt) {
  barPose = null;
  if (!renderer.xr.isPresenting) return;
  const pose = vrBarPose();
  barPose = pose;
  if (!pose || dev.autoplay || app !== 'playing') { if (!dev.autoplay && app === 'playing') game.ctrl.furl = furlToggle || false; return; }
  const c = game.ctrl;
  // direção da barra no plano (gôndola: x direita, -z frente) -> normal da vela no mapa
  const target = Math.atan2(pose.s.x, pose.s.z);
  c.ang += wrapHalf(target - c.ang) * Math.min(1, dt * 14);
  c.tilt = clamp(Math.abs(tilt0 + pose.roll), 0, MAX_TILT);
  furlHands = pose.together;
  c.furl = furlToggle || furlHands;
}

// ---------- Câmera do PC ----------
function updatePcCamera() {
  if (renderer.xr.isPresenting) return;
  if (fakeVR) { rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); camera.position.set(0, EYE_H, 0.15); camera.rotation.set(fakeVR.pitch, fakeVR.yaw, 0, 'YXZ'); return; }
  if (save.cam === 'top' && app !== 'menu') {
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    const h = ZOOMS[holo.zoomIdx] * S * 1.45;
    camera.position.set(0, h + PLANE_Y, h * 0.12);
    camera.rotation.set(-Math.PI / 2 + 0.12, 0, 0, 'YXZ');
    return;
  }
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, EYE_H + 0.15, 0.55);
  if (app === 'menu') { look.yaw = Math.sin(menuT * 0.07) * 0.25; look.pitch = 0.18; }
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
}

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    e.mark.visible = vr && !!e.source && !e.source.hand;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 1.5;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    canvas.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else if (!vr) canvas.style.cursor = mouse.dragL ? 'grabbing' : 'grab';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const msgEl = document.getElementById('msg');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.innerHTML = app === 'playing'
    ? '<span>Arraste (ou A/D): gira a vela · W/S: deita · Espaço: recolhe · roda: zoom · Tab: câmera · Esc: pausa</span>'
    : '<span>Clique nas opções do painel</span>';
}
function goalText() {
  const g = game.goal;
  if (!g) return 'Pronto!';
  const s = game.ship, P = game.P, sys = game.sys;
  const N = game.goals.length;
  if (g.type === 'buoy') return `Boia ${game.goalIdx + 1} de ${N} · ${Math.round(Math.hypot(s.x - g.x, s.y - g.y))} u`;
  if (g.type === 'portal') {
    let t = `Portal de saída · ${Math.round(Math.hypot(s.x - g.x, s.y - g.y))} u`;
    for (const st of sys.stars) { const rs = sys.shellRadius(st, game.t); if (rs > 0) t += ` · onda a ${Math.max(0, Math.round(Math.hypot(s.x - P[st * 2], s.y - P[st * 2 + 1]) - rs))} u`; }
    return t;
  }
  const bi = sys.index.get(g.body), b = sys.bodies[bi];
  const d = Math.hypot(s.x - P[bi * 2], s.y - P[bi * 2 + 1]);
  if (g.type === 'orbit') {
    if (g.hold > 0) return `Em órbita de ${b.name}: ${g.hold.toFixed(0)} de ${g.secs} s`;
    const o = game.orbitInfo;
    const why = !o || d > g.max * 1.5 ? `${Math.round(d)} u` : !o.bound ? 'rápido demais, freie' : o.peri <= b.r * 1.6 ? 'baixo demais' : 'órbita larga demais';
    return `Órbita de ${b.name} · ${why}`;
  }
  const [bvx, bvy] = sys.velocity(bi, game.t);
  const vr = Math.hypot(s.vx - bvx, s.vy - bvy);
  return `Entregar em ${b.name} · ${Math.round(Math.max(0, d - b.r))} u · ${vr.toFixed(1).replace('.', ',')} u/s (máx ${g.vmax})`;
}
function timeText() {
  if (game.state === 'count') return `Partida em ${Math.ceil(game.count)}…`;
  const st = starsFor(game.def, game.time);
  return `${fmtT(game.time)}  ${'★'.repeat(st)}${'☆'.repeat(3 - st)}`;
}
let lightRel = 0;
function updateHud(dt) {
  const vr = isVR();
  const playing = app === 'playing' || app === 'done';
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const shade = game.info.shade > 0.5;
  if (!vr) {
    mapLabel.mesh.visible = msgLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    const furled = game.ship.dep < 0.5;
    const html = `<b>${levelIndex + 1}. ${LEVELS[levelIndex].name}</b><br>${timeText()}<br><em>${goalText()}</em><br>` +
      `Luz <span class="bar"><i style="width:${Math.round(Math.min(1, lightRel) * 100)}%"></i></span>${furled ? ' <span class="warn">vela recolhida</span>' : shade ? ' <span class="warn">na sombra</span>' : ''}`;
    if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    const mtxt = msg && playing ? msg.text : '';
    if (msgEl.dataset.last !== mtxt) { msgEl.textContent = mtxt; msgEl.style.color = msg?.color || '#fff'; msgEl.dataset.last = mtxt; }
    msgEl.style.display = mtxt ? 'block' : 'none';
    return;
  }
  hudEl.style.display = 'none'; msgEl.style.display = 'none';
  mapLabel.mesh.visible = playing;
  msgLabel.mesh.visible = playing && !!msg;
  if (!playing) return;
  const bars = Math.round(Math.min(1, lightRel) * 10);
  mapLabel.set([
    { text: `${levelIndex + 1}. ${LEVELS[levelIndex].name}`, size: 0.22, color: UI.edge },
    { text: timeText(), size: 0.3, color: '#ffffff' },
    { text: goalText(), size: 0.24, color: '#cfe4ff' },
    { text: game.ship.dep < 0.5 ? 'vela recolhida' : shade ? 'na sombra' : `luz ${'▮'.repeat(bars)}${'▯'.repeat(10 - bars)}`, size: 0.2, color: shade ? '#ff9a8a' : '#ffd36a', bold: false },
  ]);
  if (msg) msgLabel.set([{ text: msg.text, size: 0.6, color: msg.color, bold: false }]);
}

// ---------- Eventos do jogo -> som, vibração, avisos ----------
function both(v, ms) { pulse('left', v, ms); pulse('right', v, ms); }
function handleEvents(evs) {
  for (const ev of evs) {
    if (ev.type === 'tick') { sfx.tick(ev.n); showMsg(String(ev.n), 0.9, '#ffffff'); }
    else if (ev.type === 'go') { sfx.go(); showMsg('Vela ao vento!', 1.4, '#ffd36a'); }
    else if (ev.type === 'goal') {
      const g = game.goals[ev.i];
      both(0.5, 60);
      if (game.state === 'won') continue;
      if (g.type === 'buoy') { sfx.buoy(); showMsg(`Boia ${ev.i + 1} ✓`, 1.3, '#ffd36a'); }
      else { sfx.goal(); showMsg(g.type === 'orbit' ? 'Órbita estável!' : 'Carga entregue!', 1.8, '#8affc8'); }
    } else if (ev.type === 'fast') showMsg(`Rápido demais para entregar: ${ev.v.toFixed(1).replace('.', ',')} u/s`, 1.8, '#ff9a8a');
    else if (ev.type === 'won') { sfx.win(); doneTimer = 1.6; showMsg(`Chegou! ${fmtT(ev.time)}`, 2, '#ffd36a'); }
    else if (ev.type === 'lost') { sfx.lose(ev.kind); both(1, 200); game.lostKind = ev.kind; doneTimer = 1.4; showMsg(ev.why, 2, '#ff9a8a'); }
  }
}
// avisos que não são eventos da física: sombra, cometa perto, nova
function watchWorld() {
  const sys = game.sys, s = game.ship, P = game.P;
  const sh = game.info.shade > 0.5 && s.dep > 0.5;
  if (sh !== wasShade && game.state === 'flying') {
    sfx.shade(sh);
    if (sh) {
      let name = 'um planeta';
      for (const o of sys.occluders) for (const st of sys.stars) if (shadowFactor({ ...sys, occluders: [o] }, P, st, s.x, s.y) < 0.5) name = sys.bodies[o].name;
      showMsg(`Na sombra de ${name}: sem luz`, 1.6, '#b9c1f0');
    }
  }
  wasShade = sh;
  sys.bodies.forEach((b, i) => {
    if (b.kind !== 'comet') return;
    const d = Math.hypot(s.x - P[i * 2], s.y - P[i * 2 + 1]);
    if (d < 22 && !cometNear.has(i)) { cometNear.add(i); sfx.comet(); both(0.35, 120); showMsg('Cometa passando!', 1.2, '#bfefff'); }
    else if (d > 40) cometNear.delete(i);
  });
  for (const st of sys.stars) {
    const nv = sys.bodies[st].nova;
    if (nv && !novaShown && game.t >= nv.t0) { novaShown = true; sfx.nova(); W.flash(0.9); both(1, 400); showMsg('A Anã Branca explodiu! Corra para o portal!', 3, '#ffffff'); }
  }
}

// cor e força da luz que bate na vela (para o brilho, o som e a vibração)
const lightColor = new THREE.Color();
const _c = new THREE.Color();
function sailLight(P, x, y) {
  const sys = game.sys, c = game.ctrl;
  lightColor.setRGB(0, 0, 0);
  let total = 0;
  const nx = Math.cos(c.ang), ny = Math.sin(c.ang), ct = Math.cos(c.tilt);
  for (const s of sys.stars) {
    const dx = x - P[s * 2], dy = y - P[s * 2 + 1], r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
    const cc = Math.abs((nx * dx + ny * dy) / r) * ct;
    const I = sys.lumAt(s, game.t) / r2 * cc * cc * shadowFactor(sys, P, s, x, y);
    total += I;
    lightColor.add(_c.set(sys.bodies[s].color).multiplyScalar(Math.min(3, I / 0.35)));
  }
  return total;
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const okXR = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!okXR) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), time = 0;
let fpsFrames = 0, fpsTime = 0, frameNo = 0, hapT = 0;
const lerpP = new Float64Array(64);
const _bc = new THREE.Vector3(), _bs = new THREE.Vector3();

function tick(dt) {
  time += dt;
  frameNo++;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();
  vrControls(dt);
  pcControls(dt);

  // física em passos fixos
  const evs = [];
  const running = app === 'playing' || app === 'done';
  if (running && (game.state === 'count' || game.state === 'flying' || game.state === 'won')) {
    acc += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) {
      prevX = game.ship.x; prevY = game.ship.y; prevP.set(game.P);
      if (dev.autoplay && app === 'playing') robot.step(game);
      if (game.state === 'won') {
        // segue voando depois de ganhar (só para ver), sem contar tempo nem eventos
        const r = game.result, t = game.time;
        game.state = 'flying'; game.step();
        game.state = 'won'; game.result = r; game.time = t; game.events.length = 0;
      }
      else game.step();
      evs.push(...game.events);
    }
    acc -= n * DT;
  } else acc = 0;
  if (app === 'menu') menuT += dt;
  W.decay(dt);
  handleEvents(evs);
  if (app === 'playing') watchWorld();
  if (app === 'playing' && doneTimer > 0) { doneTimer -= dt; if (doneTimer <= 0) (game.state === 'won' ? finishWin() : finishLost()); }

  // posição mostrada (interpolada entre os passos)
  const a = clamp(acc / DT, 0, 1);
  const sys = game.sys, n2 = sys.n * 2;
  let P;
  if (app === 'menu') P = sys.positions(menuT, lerpP.subarray(0, n2));
  else { P = lerpP.subarray(0, n2); for (let k = 0; k < n2; k++) P[k] = prevP[k] + (game.P[k] - prevP[k]) * a; }
  const sx = app === 'menu' ? game.ship.x : prevX + (game.ship.x - prevX) * a;
  const sy = app === 'menu' ? game.ship.y : prevY + (game.ship.y - prevY) * a;

  // previsão (no Quest, um quadro sim, um não)
  if (!IS_QUEST || frameNo % 2 === 0 || pred.n === 0) {
    if (game.state === 'count' || game.state === 'flying') pred = predict(sys, game.ship, game.ctrl, PRED_STEPS, PRED_EVERY, predPts);
    else if (game.state === 'lost') pred = { n: 0, hit: -1 };
  }
  view.setPrediction(predPts, pred.n, pred.hit);
  view.update(P, sx, sy, app === 'menu' ? menuT : game.t, dt);

  // vela, barra, luz
  const L = sailLight(P, sx, sy);
  lightRel = L / 0.5;
  const ctrl = game.ctrl;
  ship3d.setSail(ctrl.ang, ctrl.tilt, game.ship.dep, lightColor, Math.min(1, L / 0.6) * game.ship.dep, game.info.shade, time);
  if (vr && barPose) ship3d.setBar(barPose.c, barPose.s, barPose.roll);
  else {
    _bs.set(Math.sin(ctrl.ang), 0, Math.cos(ctrl.ang));
    _bc.set(0, 1.12, -0.2);
    ship3d.setBar(_bc, _bs, ctrl.tilt);
  }
  sfx.setSail(app === 'playing' ? lightRel : 0, game.ship.dep);
  hapT -= dt;
  if (vr && hapT <= 0 && app === 'playing' && game.state === 'flying') {
    hapT = 0.12;
    const v = Math.min(0.35, lightRel * 0.28) * game.ship.dep;
    if (v > 0.02) for (const s of ['left', 'right']) if (holds[s]) pulse(s, v, 40);
  }

  // mapa
  const gax = accel(sys, game.P, game.ship.x, game.ship.y, { ang: ctrl.ang, tilt: ctrl.tilt, dep: game.ship.dep }, game.t);
  const g0 = accel(sys, game.P, game.ship.x, game.ship.y, { ang: 0, tilt: 0, dep: 0 }, game.t);
  const lx = gax[0] - g0[0], ly = gax[1] - g0[1];
  holo.update(P, { x: sx, y: sy, vx: game.ship.vx, vy: game.ship.vy }, ctrl, { mag: Math.hypot(lx, ly), dir: Math.atan2(ly, lx) }, predPts, pred.n, pred.hit, dt);
  holo.group.visible = !(save.cam === 'top' && !isVR() && app !== 'menu');

  const topOn = save.cam === 'top' && !isVR() && app !== 'menu';
  ship3d.setTopMark(topOn, ZOOMS[holo.zoomIdx] * S * 0.07, ctrl.ang, game.ship.dep);
  updatePcCamera();
  updateHud(dt);
  updateMenuRays();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.loadLevel(3)        abre a fase 3 (1 a 15)
// dev.autoplay = true     o robô pilota (só mexe na vela, como o jogador)
// dev.advance(20)         avança 20 s de jogo na hora, sem esperar a animação
// dev.state()             resumo: tela, fase, tempo, objetivo, nave
// dev.snapshot()          imagem da tela (JPEG em data URL)
// dev.resetSave()         apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) {
    this._auto = !!v;
    robot = v ? makeRobot() : null;
  },
  loadLevel(n) { startLevel(n - 1); return this.state(); },
  advance(sec, step = 1 / 72) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  state() {
    const s = game.ship;
    return {
      tela: app, fase: levelIndex + 1, nome: LEVELS[levelIndex].name, estado: game.state,
      tempo: +game.time.toFixed(2), objetivo: game.goalIdx + 1, objetivos: game.goals.length, texto: goalText(),
      nave: { x: +s.x.toFixed(1), y: +s.y.toFixed(1), velocidade: +Math.hypot(s.vx, s.vy).toFixed(2), vela: +(game.ctrl.ang * 180 / Math.PI % 360).toFixed(0), aberta: +s.dep.toFixed(2) },
      luz: +game.info.light.toFixed(3), sombra: +game.info.shade.toFixed(2),
      motivo: game.lostWhy || null, resultado: game.result, salvo: save.done[levelIndex] || null,
      camera: save.cam, zoom: ZOOMS[holo.zoomIdx],
    };
  },
  snapshot(w = 960) {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  },
  resetSave() { save.done = {}; storeSave(save); },
  setCam(c) { save.cam = c; storeSave(save); placeMap(); },
  // mostra o layout do VR (mapa na gôndola, placas) com a câmera nos olhos: vrView(true, inclinação, giro)
  vrView(on, pitch = -0.5, yaw = 0) { fakeVR = on ? { pitch, yaw } : false; camera.fov = on ? 90 : 70; camera.updateProjectionMatrix(); placeMap(); if (panel.visible) placePanel(); },
};
window.dev = dev;
window.vela = { dev, get game() { return game; }, save, sfx, startLevel, goMenu, camera, scene, renderer, holo };

placeMap();
goMenu();
renderer.setAnimationLoop(frame);
