// Os 3 sistemas estelares e as 15 fases. Sem navegador.
//
// Fase: { name, system, hint, bodies, start, goals, stars: [3★ até, 2★ até, 1★ até] (s),
//         limit? (s, passou = falhou), wind?, bound? }
// start: { around: id|null, r, deg, dir (1 = anti-horário), gm? (massa central se around = null) }
// goals (em ordem):
//   { type: 'buoy', x, y, r }                 passar pela boia de luz (farol)
//   { type: 'orbit', body, max, secs }         ficar em órbita estável do planeta (periastro acima de
//                                              1,6 raio, apoastro abaixo de max) por secs segundos
//   { type: 'deliver', body, reach, vmax }     chegar a reach u da superfície da lua com velocidade
//                                              relativa abaixo de vmax
//   { type: 'portal', x, y, r }                portal de saída
// Coordenadas: u (1 u = 10 m no 3D). y do mapa = para a frente de quem está na gôndola.

import { System, Ship, stepShip, hitBody, DT } from './physics.js';
import { startState } from './start.js';

const D = Math.PI / 180;
const polar = (r, deg) => [r * Math.cos(deg * D), r * Math.sin(deg * D)];
const buoy = (r, deg, size = 9) => { const [x, y] = polar(r, deg); return { type: 'buoy', x, y, r: size }; };
const portal = (r, deg, size = 9) => { const [x, y] = polar(r, deg); return { type: 'portal', x, y, r: size }; };

// ---------- Sistema 1: Sol Amarelo ----------
const SOL = { id: 'sol', kind: 'star', name: 'o Sol Amarelo', gm: 11000, lum: 6600, r: 7, color: '#ffd76a', orbit: { type: 'fixed', x: 0, y: 0 } };
const amarelo = (...extra) => [SOL, ...extra];
// planeta em órbita circular (gmc = massa do centro: estrela ou par de estrelas)
const planet = (id, name, around, gmc, a, phase, gm, r, color) =>
  ({ id, kind: 'planet', name, gm, r, color, orbit: { type: 'circ', around, a, period: T(gmc, a), phase: phase * D } });
const moon = (id, name, around, a, period, phase, r, color, gm = 0) =>
  ({ id, kind: 'moon', name, gm, r, color, orbit: { type: 'circ', around, a, period, phase: phase * D } });
// período de órbita circular em volta de uma massa gm
const T = (gm, a) => 2 * Math.PI * Math.sqrt(a * a * a / gm);

// ---------- Sistema 2: Estrela Dupla ----------
// Duas estrelas em volta do centro de massa (origem), separação 70 u
const GA = 7000, GB = 4000, SEP = 70, TAB = T(GA + GB, SEP);
const ALFA = { id: 'alfa', kind: 'star', name: 'Alfa', gm: GA, lum: 4600, r: 5, color: '#fff1c8', orbit: { type: 'circ', around: null, a: SEP * GB / (GA + GB), period: TAB, phase: 0 } };
const BETA = { id: 'beta', kind: 'star', name: 'Beta', gm: GB, lum: 3000, r: 4, color: '#ff9a52', orbit: { type: 'circ', around: null, a: SEP * GA / (GA + GB), period: TAB, phase: Math.PI } };
const dupla = (...extra) => [ALFA, BETA, ...extra];
const GD = GA + GB;

// ---------- Sistema 3: Gigante Vermelha e Anã Branca ----------
// Gigante enorme e fraca de luz; anã minúscula, pesada e muito brilhante. Separação 110 u.
const GR = 14000, GW = 3000, SEP3 = 110, TRW = T(GR + GW, SEP3);
const brasa = (ph = 0) => ({ id: 'brasa', kind: 'star', name: 'a Gigante Vermelha', gm: GR, lum: 1400, r: 20, color: '#ff5a32', orbit: { type: 'circ', around: null, a: SEP3 * GW / (GR + GW), period: TRW, phase: ph * D + Math.PI } });
const faisca = (ph = 0, nova = null) => ({ id: 'faisca', kind: 'star', name: 'a Anã Branca', gm: GW, lum: 5200, r: 1.6, color: '#cfe4ff', orbit: { type: 'circ', around: null, a: SEP3 * GR / (GR + GW), period: TRW, phase: ph * D }, ...(nova ? { nova } : {}) });
const GRW = GR + GW;
const comet = (id, a, e, w, period, M0) => ({ id, kind: 'comet', name: 'um cometa', gm: 0, r: 2.2, color: '#bfefff', orbit: { type: 'kepler', around: null, a, e, w: w * D, period, M0: M0 * D } });

// Cometa numa órbita de Kepler (semieixo a, excentricidade e, em volta da origem, massa gmc)
// que passa pelo ponto Q + off (off = [para fora, de lado] em relação à origem) no tempo t.
// dir = 1 anti-horário, -1 horário. Procura a orientação e a fase certas.
function cometThrough(id, a, e, gmc, t, Q, off, dir) {
  const r0 = Math.hypot(Q.x, Q.y), ux = Q.x / r0, uy = Q.y / r0;
  const tx = Q.x + ux * off[0] - uy * off[1], ty = Q.y + uy * off[0] + ux * off[1];
  const per = T(gmc, a) * dir;
  let best = null;
  for (let wi = 0; wi < 180; wi++) {
    const w = wi * 2;
    for (let mi = 0; mi < 360; mi++) {
      const c = comet(id, a, e, w, per, mi);
      const sys = new System([c]);
      const P = sys.positions(t);
      const d = Math.hypot(P[0] - tx, P[1] - ty);
      if (!best || d < best.d) best = { d, w, mi };
    }
  }
  // ajuste fino da fase
  let m = best.mi, step = 0.5;
  for (let k = 0; k < 30; k++) {
    for (const dm of [-step, step]) {
      const P = new System([comet(id, a, e, best.w, per, m + dm)]).positions(t);
      const d = Math.hypot(P[0] - tx, P[1] - ty);
      if (d < best.d) { best.d = d; m += dm; }
    }
    step *= 0.6;
  }
  return comet(id, a, e, best.w, per, m);
}

export const SYSTEMS = [
  { name: 'Sol Amarelo', theme: 'amarelo', from: 0 },
  { name: 'Estrela Dupla', theme: 'dupla', from: 5 },
  { name: 'Gigante e Anã', theme: 'gigante', from: 10 },
];


// Boias desenhadas por um voo de referência: a partir da largada, a vela fica `rel` graus
// em relação à luz que vem do centro `ref` (+ = empurra a favor do movimento, - = freia,
// 0 = de frente, null = recolhida) por `secs` segundos, perna por perna. Uma boia é posta onde a
// nave estava em cada tempo de `marks`. Assim toda fase tem pelo menos um caminho possível.
function route(bodies, start, legs, marks, size = 9, ref = null, extra = {}) {
  const sys = new System(bodies, extra);
  const s0 = startState(sys, start);
  const ship = new Ship(s0.x, s0.y, s0.vx, s0.vy);
  const ri = ref ? sys.index.get(ref) : -1;
  const dir = start.dir ?? 1;
  const out = [];
  const ctrl = { ang: 0, tilt: 0, furl: false };
  let li = 0, legT = 0, mi = 0;
  const total = legs.reduce((a, l) => a + l[1], 0);
  let P = sys.positions(0);
  while (ship.t < total + 1e-9 && mi < marks.length) {
    const [rel] = legs[Math.min(li, legs.length - 1)];
    const cx = ri >= 0 ? P[ri * 2] : 0, cy = ri >= 0 ? P[ri * 2 + 1] : 0;
    if (rel === null) ctrl.furl = true;
    else { ctrl.furl = false; ctrl.ang = Math.atan2(ship.y - cy, ship.x - cx) + rel * D * dir; }
    P = stepShip(sys, ship, ctrl).slice();
    if (hitBody(sys, P, ship.x, ship.y) >= 0) throw new Error(`voo de referência bateu em ${sys.bodies[hitBody(sys, P, ship.x, ship.y)].id} em t=${ship.t.toFixed(1)}`);
    legT += DT;
    if (li < legs.length && legT >= legs[li][1] - 1e-9) { li++; legT = 0; }
    if (ship.t >= marks[mi] - 1e-9) { out.push({ type: 'buoy', x: +ship.x.toFixed(2), y: +ship.y.toFixed(2), r: size }); mi++; }
  }
  if (out.length !== marks.length) throw new Error('voo de referência acabou antes das boias');
  return out;
}

// Põe um planeta (def com gmc = massa do centro) onde o voo de referência passa no tempo t,
// deslocado off = [para fora da luz, de lado] u. Acerta a fase da órbita para isso.
function placeOnRoute(bodies, start, legs, t, pl, off = [0, 0], ref = null, atRadius = 0, shadeFrom = null) {
  const sys = new System(bodies);
  const s0 = startState(sys, start);
  const ship = new Ship(s0.x, s0.y, s0.vx, s0.vy);
  const ri = ref ? sys.index.get(ref) : -1;
  const ctrl = { ang: 0, tilt: 0, furl: false };
  let li = 0, legT = 0;
  let P = sys.positions(0);
  while (ship.t < t - 1e-9) {
    const [rel] = legs[Math.min(li, legs.length - 1)];
    const cx = ri >= 0 ? P[ri * 2] : 0, cy = ri >= 0 ? P[ri * 2 + 1] : 0;
    if (rel === null) ctrl.furl = true;
    else { ctrl.furl = false; ctrl.ang = Math.atan2(ship.y - cy, ship.x - cx) + rel * D * (start.dir ?? 1); }
    P = stepShip(sys, ship, ctrl).slice();
    legT += DT;
    if (li < legs.length && legT >= legs[li][1] - 1e-9) { li++; legT = 0; }
  }
  const r = Math.hypot(ship.x, ship.y), ux = ship.x / r, uy = ship.y / r;
  if (atRadius) off = [atRadius - r, 0];      // na mesma linha da luz, nesse raio
  let qx = ship.x + ux * off[0] - uy * off[1], qy = ship.y + uy * off[0] + ux * off[1];
  if (shadeFrom) {
    // entre a estrela e a nave, a shadeFrom[1] u da nave: a nave fica na sombra dessa estrela
    const si = sys.index.get(shadeFrom[0]), sx = P[si * 2], sy = P[si * 2 + 1];
    const dl = Math.hypot(ship.x - sx, ship.y - sy);
    qx = ship.x - (ship.x - sx) / dl * shadeFrom[1]; qy = ship.y - (ship.y - sy) / dl * shadeFrom[1];
  }
  const a = Math.hypot(qx, qy);
  const per = T(pl.gmc, a) * Math.sign(pl.orbit.period);
  const phase = Math.atan2(qy, qx) - 2 * Math.PI * t / per;
  const { gmc, ...rest } = pl;
  return { ...rest, orbit: { ...pl.orbit, a, phase, period: per } };
}

// ---------- As fases ----------
const L = [];

// 1
{
  const bodies = amarelo();
  const start = { around: 'sol', r: 80, deg: -90, dir: 1 };
  L.push({
    name: 'Primeira luz', system: 0,
    hint: 'Vire a vela de frente para o Sol: a luz empurra e a órbita cresce. Passe pelas boias.',
    bodies, start, goals: route(bodies, start, [[30, 22]], [6, 13, 20]),
  });
}
// 2
{
  const bodies = amarelo();
  const start = { around: 'sol', r: 120, deg: -90, dir: 1 };
  L.push({
    name: 'Frear a órbita', system: 0,
    hint: 'Incline a vela contra o movimento: ela freia, a órbita encolhe e você cai para perto do Sol.',
    bodies, start, goals: route(bodies, start, [[-50, 26]], [8, 16, 25]),
  });
}
// 3
{
  const bodies = amarelo(planet('aurora', 'Aurora', 'sol', 11000, 170, 140, 260, 4, '#6fb7ff'));
  const start = { around: 'sol', r: 95, deg: -90, dir: 1 };
  L.push({
    name: 'Colar de faróis', system: 0,
    hint: 'Acelere, deixe correr e freie para pegar as boias em ordem. A linha pontilhada mostra o caminho.',
    bodies, start, goals: route(bodies, start, [[35, 9], [null, 6], [-40, 12], [10, 10]], [5, 11, 18, 26, 35]),
  });
}
// 4
{
  const bodies = amarelo(planet('aurora', 'Aurora', 'sol', 11000, 120, -84, 1500, 4.5, '#6fb7ff'));
  L.push({
    name: 'Órbita de Aurora', system: 0,
    hint: 'Alcance Aurora devagar e entre em órbita dela: a gravidade do planeta te segura.',
    bodies, start: { around: 'sol', r: 108, deg: -108, dir: 1 },
    goals: [{ type: 'orbit', body: 'aurora', max: 30, secs: 8 }],
  });
}
// 5
{
  const bodies = amarelo(
    planet('brisa', 'Brisa', 'sol', 11000, 125, -85, 380, 4.5, '#7fe0b0'),
    moon('perola', 'Pérola', 'brisa', 18, T(380, 18), 0, 1.6, '#f2eee0'),
  );
  L.push({
    name: 'Carga para Pérola', system: 0,
    hint: 'Entregue a carga na lua Pérola: chegue bem perto dela e devagar.',
    bodies, start: { around: 'sol', r: 108, deg: -112, dir: 1 },
    goals: [{ type: 'deliver', body: 'perola', reach: 5, vmax: 7 }],
  });
}
// 6
{
  const bodies = dupla();
  const start = { around: null, gm: GD, r: 110, deg: -90, dir: 1 };
  L.push({
    name: 'Duas luzes', system: 1,
    hint: 'Agora são duas estrelas girando: a luz vem de dois lados e muda o tempo todo.',
    bodies, start, goals: route(bodies, start, [[30, 10], [-20, 14]], [6, 14, 23]),
  });
}
// 7
{
  const start = { around: null, gm: GD, r: 105, deg: -110, dir: 1 };
  const legs = [[25, 10], [-10, 14], [-35, 18]];
  const titan = placeOnRoute(dupla(), start, legs, 24, { ...planet('titan', 'Titã', null, GD, 150, 0, 150, 9, '#d9a066'), gmc: GD }, [0, 0], null, 0, ['alfa', 35]);
  const bodies = dupla(titan);
  L.push({
    name: 'Sombra do gigante', system: 1,
    hint: 'Na sombra do planeta a luz some e a vela não empurra. Passe pela boia escondida na sombra.',
    bodies, start, goals: route(bodies, start, legs, [7, 24, 33, 41]),
  });
}
// 8
{
  const start = { around: null, gm: GD, r: 110, deg: -95, dir: 1 };
  const legs = [[35, 12], [null, 30]];
  const titan = placeOnRoute(dupla(), start, legs, 12, { ...planet('titan', 'Titã', null, GD, 150, 0, 500, 7, '#d9a066'), gmc: GD }, [-15, 25]);
  const bodies = dupla(titan);
  L.push({
    name: 'Estilingue', system: 1,
    hint: 'Passe raspando atrás de Titã: a gravidade dele te arremessa até as boias distantes.',
    bodies, start, goals: route(bodies, start, legs, [6, 17, 27], 10),
  });
}
// 9
{
  const bodies = dupla(planet('lume', 'Lume', null, GD, 140, -80, 1500, 4.5, '#a98bff'));
  L.push({
    name: 'Órbita dupla', system: 1,
    hint: 'Entre em órbita do planeta Lume, com as duas estrelas puxando a vela.',
    bodies, start: { around: null, gm: GD, r: 130, deg: -95, dir: 1 },
    goals: [{ type: 'orbit', body: 'lume', max: 30, secs: 8 }],
  });
}
// 10
{
  const bodies = dupla(
    planet('lume', 'Lume', null, GD, 140, -60, 420, 4, '#a98bff'),
    moon('cristal', 'Cristal', 'lume', 18, T(420, 18), 90, 1.5, '#c8f4ff'),
  );
  const start = { around: null, gm: GD, r: 120, deg: -100, dir: 1 };
  L.push({
    name: 'Lua de cristal', system: 1,
    hint: 'Pegue a boia e depois entregue a carga em Cristal, a lua de Lume.',
    bodies, start, goals: [...route(bodies, start, [[30, 8]], [6]), { type: 'deliver', body: 'cristal', reach: 5, vmax: 7 }],
  });
}
// 11
{
  const bodies = [brasa(), faisca()];
  const start = { around: null, gm: GRW, r: 190, deg: -90, dir: 1 };
  L.push({
    name: 'Luz de brasa', system: 2,
    hint: 'Longe da Anã Branca a luz é fraca: a Gigante Vermelha quase não empurra. Planeje antes.',
    bodies, start, goals: route(bodies, start, [[30, 32]], [9, 19, 30], 8),
  });
}
// 12
{
  const bodies = [brasa(), faisca()];
  const wind = { star: 'brasa', strength: 9000, arms: 3, omega: 0.25, twist: 0.012 };
  const start = { around: null, gm: GRW, r: 180, deg: -100, dir: 1 };
  L.push({
    name: 'Vento estelar', system: 2,
    hint: 'Rajadas de vento de partículas saem da Gigante em espiral e empurram a vela aberta.',
    bodies, wind, start, goals: route(bodies, start, [[20, 14], [-25, 14], [10, 12]], [8, 17, 27, 38], 8, null, { wind: { ...wind, star: 0 } }),
  });
}
// 13
{
  const start = { around: null, gm: GRW, r: 185, deg: -90, dir: 1 };
  const legs = [[30, 20], [-20, 20]];
  // cada cometa passa a ~11 u da rota de referência num certo tempo (de frente ou cruzando)
  const at = route([brasa(), faisca()], start, legs, [6, 15, 24, 33], 1);
  const comets = [
    cometThrough('c1', 150, 0.75, GRW, 6, at[0], [0, 11], -1),
    cometThrough('c2', 230, 0.7, GRW, 15, at[1], [-11, 0], 1),
    cometThrough('c3', 140, 0.8, GRW, 24, at[2], [0, -11], -1),
    cometThrough('c4', 260, 0.72, GRW, 33, at[3], [11, 0], 1),
  ];
  const bodies = [brasa(), faisca(), ...comets];
  L.push({
    name: 'Chuva de cometas', system: 2,
    hint: 'Cometas cruzam o caminho. Desvie deles: bater num cometa é o fim da viagem.',
    bodies, start, goals: route(bodies, start, legs, [8, 18, 28, 38], 8),
  });
}
// 14
{
  const bodies = [brasa(), faisca(), planet('geada', 'Geada', 'faisca', GW, 12, -40, 60, 1.6, '#9fd6ff')];
  L.push({
    name: 'Perto da Anã', system: 2,
    hint: 'Perto da Anã Branca a luz é mais forte que a gravidade: um toque na vela muda tudo.',
    bodies, start: { around: 'faisca', r: 26, deg: 160, dir: 1 },
    goals: [{ type: 'deliver', body: 'geada', reach: 4, vmax: 6 }],
  });
}
// 15
{
  const bodies = [brasa(), faisca(0, { t0: 5, mult: 5, shell: 14 })];
  L.push({
    name: 'Fuga da nova', system: 2,
    hint: 'A Anã Branca vai explodir! Abra a vela de frente para a explosão e corra até o portal.',
    bodies, start: { around: 'faisca', r: 18, deg: 0, dir: 1 },
    goals: [portal(330, 15, 14)],
  });
}

// estrelas (3★, 2★, 1★ em segundos): calibradas pelo robô em tests/run.js
const STARS = [
  [22, 30, 50], [24, 32, 55], [32, 43, 72], [40, 60, 110], [18, 25, 45],
  [24, 32, 55], [39, 52, 88], [29, 39, 65], [22, 30, 55], [40, 55, 100],
  [33, 44, 75], [39, 52, 88], [40, 54, 90], [16, 35, 80], [18, 24, 40],
];
L.forEach((l, i) => { l.stars = STARS[i]; });

export const LEVELS = L;
