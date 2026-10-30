// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem usam navegador.
import { System, Ship, DT, sailPush, shadowFactor, accel, stepShip, predict, energy, orbitAround, hitBody, DEPLOY_RATE } from '../js/physics.js';
import { Game, starsFor, COUNTDOWN } from '../js/game.js';
import { startState } from '../js/start.js';
import { LEVELS, SYSTEMS } from '../js/levels.js';
import { makeRobot } from '../js/robot.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}
const D = Math.PI / 180;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const mag = (v) => Math.hypot(v[0], v[1]);
const sun = (extra = []) => new System([{ id: 'sol', kind: 'star', name: 'Sol', gm: 11000, lum: 6600, r: 7, orbit: { type: 'fixed', x: 0, y: 0 } }, ...extra]);

console.log('Vela e luz');
{
  // luz vindo do Sol (origem) para a nave em (0, -100): direção (0, -1)
  const lum = 6600, r2 = 100 * 100;
  const full = mag(sailPush(lum, r2, 0, -1, -90 * D));
  ok(near(full, lum / r2, 1e-12), `de frente empurra o máximo (${full.toFixed(4)} = lum/r²)`);
  const edge = mag(sailPush(lum, r2, 0, -1, 0));
  ok(edge < 1e-12, `vela de lado para a luz não empurra (${edge.toExponential(1)})`);
  let maxOther = 0;
  for (let a = -180; a <= 180; a += 1) if (a !== -90 && a !== 90) maxOther = Math.max(maxOther, mag(sailPush(lum, r2, 0, -1, a * D)));
  ok(maxOther < full, 'qualquer outro ângulo empurra menos que de frente');
  const at60 = mag(sailPush(lum, r2, 0, -1, (-90 + 60) * D));
  ok(near(at60 / full, 0.25, 1e-9), `a 60° da luz empurra cos² = 25% (${(at60 / full * 100).toFixed(1)}%)`);
  // a força segue a normal (e sempre para longe da luz, dos dois lados da vela)
  const p = sailPush(lum, r2, 0, -1, -60 * D), q = sailPush(lum, r2, 0, -1, 120 * D);
  ok(near(Math.atan2(p[1], p[0]), -60 * D, 1e-9), 'força na direção da normal da vela');
  ok(near(p[0], q[0], 1e-12) && near(p[1], q[1], 1e-12), 'virar a vela 180° dá a mesma força (a luz empurra pela frente)');
  ok(p[1] < 0, 'a luz sempre empurra para longe da estrela');
  // 1/r²
  const far = mag(sailPush(lum, 4 * r2, 0, -1, -90 * D));
  ok(near(far / full, 0.25, 1e-12), 'o dobro da distância: um quarto do empurrão (1/r²)');
  // embandeirar (tilt) diminui
  const tilt = mag(sailPush(lum, r2, 0, -1, -90 * D, 60 * D));
  ok(tilt < full * 0.2, `vela deitada 60° empurra pouco (${(tilt / full * 100).toFixed(0)}%)`);
  // recolhida não empurra
  const sys = sun();
  const P = sys.positions(0);
  const a0 = accel(sys, P, 0, -100, { ang: -90 * D, tilt: 0, dep: 0 }, 0);
  ok(near(a0[1], 1.1, 1e-9) && near(a0[0], 0, 1e-12), 'vela recolhida: só a gravidade');
  const a1 = accel(sys, P, 0, -100, { ang: -90 * D, tilt: 0, dep: 1 }, 0);
  ok(near(a1[1], 1.1 - 0.66, 1e-9), 'vela aberta de frente: gravidade menos a luz');
  // recolher leva 1/DEPLOY_RATE s
  const ship = new Ship(0, -100, 10.5, 0);
  const ctrl = { ang: -90 * D, tilt: 0, furl: true };
  for (let i = 0; i < Math.ceil(1 / DEPLOY_RATE / DT); i++) stepShip(sys, ship, ctrl);
  ok(ship.dep === 0, `vela recolhe em ${(1 / DEPLOY_RATE).toFixed(1)} s`);
}

console.log('Sombra');
{
  const sys = sun([{ id: 'p', kind: 'planet', name: 'P', gm: 0, r: 5, orbit: { type: 'fixed', x: 0, y: -60 } }]);
  const P = sys.positions(0);
  ok(shadowFactor(sys, P, 0, 0, -80) < 0.01, 'atrás do planeta: sombra');
  ok(shadowFactor(sys, P, 0, 3, -90) < 0.01, 'perto do eixo da sombra, ainda sombra');
  ok(shadowFactor(sys, P, 0, 12, -80) === 1, 'ao lado da sombra: luz cheia');
  ok(shadowFactor(sys, P, 0, 0, -40) === 1, 'entre a estrela e o planeta: luz cheia');
  const info = {};
  accel(sys, P, 0, -80, { ang: -90 * D, tilt: 0, dep: 1 }, 0, info);
  ok(info.light < 1e-3 && info.shade > 0.99, 'na sombra a vela não recebe empurrão');
  const half = shadowFactor(sys, P, 0, 5, -80);
  ok(half > 0.2 && half < 0.8, `borda da sombra é suave (${half.toFixed(2)})`);
}

console.log('Gravidade e órbitas');
{
  const sys = sun();
  // órbita circular sem vela: raio estável
  const s0 = startState(sys, { around: 'sol', r: 100, deg: -90, dir: 1 });
  const ship = new Ship(s0.x, s0.y, s0.vx, s0.vy);
  const ctrl = { ang: 0, tilt: 0, furl: true };
  ship.dep = 0;
  let rmin = 1e9, rmax = 0;
  const T = 2 * Math.PI * Math.sqrt(100 ** 3 / 11000);
  for (let i = 0; i < 3 * T / DT; i++) { stepShip(sys, ship, ctrl); const r = Math.hypot(ship.x, ship.y); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
  ok(rmax - rmin < 0.05, `órbita circular fica circular por 3 voltas (variação ${(rmax - rmin).toFixed(4)} u)`);
  // órbita excêntrica: energia conservada
  const e = new Ship(0, -100, 13, 0); e.dep = 0;
  const E0 = energy(sys, e);
  let worst = 0;
  for (let i = 0; i < 6 * T / DT; i++) { stepShip(sys, e, ctrl); if (i % 30 === 0) worst = Math.max(worst, Math.abs(energy(sys, e) - E0) / Math.abs(E0)); }
  ok(worst < 2e-3, `órbita excêntrica sem vela conserva a energia (erro máx ${(worst * 100).toFixed(3)}%)`);
  // vela de frente: a luz é uma "gravidade negativa"
  const lifted = new Ship(s0.x, s0.y, s0.vx, s0.vy);
  for (let i = 0; i < 10 / DT; i++) stepShip(sys, lifted, { ang: -90 * D, tilt: 0, furl: false });
  ok(Math.hypot(lifted.x, lifted.y) > 108, `vela de frente para o Sol: a nave se afasta (${Math.hypot(lifted.x, lifted.y).toFixed(0)} u)`);
  // bordejar: a 35° a favor do movimento acelera; contra freia (cai para perto da estrela)
  const tack = (rel) => {
    const s = new Ship(s0.x, s0.y, s0.vx, s0.vy);
    for (let i = 0; i < 25 / DT; i++) stepShip(sys, s, { ang: Math.atan2(s.y, s.x) + rel * D, tilt: 0, furl: false });
    const h = s.x * s.vy - s.y * s.vx;
    return h;
  };
  const h0 = 100 * Math.sqrt(110);
  ok(tack(35) > h0 * 1.05, 'vela inclinada a favor do movimento ganha momento angular (acelera a órbita)');
  ok(tack(-35) < h0 * 0.95, 'vela inclinada contra o movimento perde momento angular (freia a órbita)');
  const inward = new Ship(s0.x, s0.y, s0.vx, s0.vy);
  let rIn = 1e9;
  for (let i = 0; i < 40 / DT; i++) { stepShip(sys, inward, { ang: Math.atan2(inward.y, inward.x) - 55 * D, tilt: 0, furl: false }); rIn = Math.min(rIn, Math.hypot(inward.x, inward.y)); }
  ok(rIn < 90, `freando com a vela dá para se aproximar da estrela (chegou a ${rIn.toFixed(0)} u)`);
  // estilingue: passar atrás de um planeta que anda aumenta a velocidade; pela frente, diminui
  const pl = { id: 'p', kind: 'planet', name: 'P', gm: 800, r: 3, orbit: { type: 'fixed', x: 0, y: 0 } };
  const moving = new System([{ ...pl, orbit: { type: 'circ', around: null, a: 1e5, period: 2 * Math.PI * 1e5 / 10, phase: -Math.PI / 2 } }]);
  // planeta em (0, -100000) andando para +x a 10 u/s; a nave sobe (+y) cruzando a trilha dele
  const fly = (x0) => { const s = new Ship(x0, -1e5 - 60, 0, 9); s.dep = 0; for (let i = 0; i < 16 / DT; i++) { stepShip(moving, s, ctrl); if (Math.hypot(s.x - moving.positions(s.t)[0], s.y - moving.positions(s.t)[1]) < 3) return -99; } return Math.hypot(s.vx, s.vy) - 9; };
  let gainBehind = -99, lossFront = 99;
  for (let x0 = 20; x0 <= 50; x0 += 2) gainBehind = Math.max(gainBehind, fly(x0));
  for (let x0 = 62; x0 <= 90; x0 += 2) lossFront = Math.min(lossFront, fly(x0));
  ok(gainBehind > 3, `estilingue: passar atrás do planeta ganha ${gainBehind.toFixed(1)} u/s`);
  ok(lossFront < -2, `passar na frente do planeta perde ${(-lossFront).toFixed(1)} u/s`);
  // corpos de Kepler voltam ao mesmo lugar depois de um período
  const kc = new System([{ id: 'c', kind: 'comet', gm: 0, r: 1, orbit: { type: 'kepler', around: null, a: 150, e: 0.6, w: 0.7, period: 80, M0: 0.3 } }]);
  const A = kc.positions(3), B = kc.positions(83);
  ok(near(A[0], B[0], 1e-6) && near(A[1], B[1], 1e-6), 'cometa (órbita de Kepler) é periódico');
  // elementos da órbita em volta de um planeta
  const ps = new System([{ ...pl, gm: 500, orbit: { type: 'fixed', x: 50, y: 0 } }]);
  const o = orbitAround(ps, 0, new Ship(60, 0, 0, Math.sqrt(500 / 10)));
  ok(o.bound && near(o.e, 0, 1e-6) && near(o.peri, 10, 1e-6), 'órbita circular em volta do planeta: e = 0, raio 10');
}

console.log('Previsão');
{
  const def = LEVELS[6];   // estrela dupla com planeta (luz de dois lados, sombra)
  const g = new Game(def);
  const ship = g.ship;
  const ctrl = { ang: 0.4, tilt: 0.2, furl: false };
  for (let i = 0; i < 30; i++) stepShip(g.sys, ship, ctrl);
  const pts = new Float64Array(2 * 200);
  const pr = predict(g.sys, ship, ctrl, 1200, 6, pts);
  ok(pr.n >= 150, `previsão de 20 s gravou ${pr.n} pontos`);
  const s = ship.clone();
  let worst = 0;
  for (let k = 1; k <= pr.n * 6; k++) {
    stepShip(g.sys, s, ctrl);
    if (k % 6 === 0) worst = Math.max(worst, Math.hypot(s.x - pts[(k / 6 - 1) * 2], s.y - pts[(k / 6 - 1) * 2 + 1]));
  }
  ok(worst < 1e-9, `previsão bate com a simulação (diferença ${worst.toExponential(1)} u em ${(pr.n * 6 * DT).toFixed(0)} s)`);
  ok(ship.k === 30, 'prever não mexe na nave');
  // recolhendo no meio: a previsão inclui o tempo de recolher
  const c2 = { ang: 0.7, tilt: 0, furl: true };
  const pr2 = predict(g.sys, ship, c2, 300, 1, new Float64Array(600));
  const s2 = ship.clone();
  for (let k = 0; k < 300; k++) stepShip(g.sys, s2, c2);
  ok(pr2.n === 300, 'previsão com a vela recolhendo');
  // previsão avisa batida
  const crash = new Ship(0, -60, 0, 0);
  const pr3 = predict(sun(), crash, { ang: 0, tilt: 0, furl: true }, 3000, 10, new Float64Array(600));
  ok(pr3.hit === 0, 'previsão mostra quando vai cair na estrela');
}

console.log('Objetivos e fases');
{
  const base = { name: 't', system: 0, hint: '', stars: [10, 20, 30], bodies: [{ id: 'sol', kind: 'star', name: 'o Sol', gm: 11000, lum: 6600, r: 7, orbit: { type: 'fixed', x: 0, y: 0 } }] };
  const run = (g, sec) => { for (let i = 0; i < sec / DT && (g.state === 'count' || g.state === 'flying'); i++) g.step(); };
  // contagem: nave parada
  let g = new Game({ ...base, start: { around: 'sol', r: 100, deg: -90 }, goals: [{ type: 'buoy', x: 100, y: 0, r: 8 }] });
  const x0 = g.ship.x;
  run(g, COUNTDOWN - 0.1);
  ok(g.state === 'count' && g.ship.x === x0, 'na contagem a nave fica parada');
  // boia na órbita: passa sozinho, com a vela recolhida
  g = new Game({ ...base, start: { around: 'sol', r: 100, deg: -90 }, goals: [{ type: 'buoy', x: 100 * Math.cos(-60 * D), y: 100 * Math.sin(-60 * D), r: 6 }] });
  g.ctrl.furl = true;
  run(g, 20);
  ok(g.state === 'won' && g.time > 4 && g.time < 6, `boia na órbita: chegou em ${g.time.toFixed(1)} s`);
  ok(starsFor(base, 9) === 3 && starsFor(base, 15) === 2 && starsFor(base, 25) === 1 && starsFor(base, 31) === 0, 'estrelas por tempo');
  // boias em ordem: a segunda não conta antes da primeira
  g = new Game({ ...base, start: { around: 'sol', r: 100, deg: -90 }, goals: [{ type: 'buoy', x: 0, y: 100, r: 6 }, { type: 'buoy', x: 100, y: 0, r: 6 }] });
  g.ctrl.furl = true;
  run(g, 20);
  ok(g.goalIdx === 0, 'boias em ordem (passar na segunda antes não conta)');
  // cair na estrela
  g = new Game({ ...base, start: { x: 0, y: -50, vx: 0, vy: 0 }, goals: [{ type: 'buoy', x: 100, y: 0, r: 6 }] });
  run(g, 30);
  ok(g.state === 'lost' && /queimou/.test(g.lostWhy), 'cair na estrela queima a vela');
  // perdido no espaço
  g = new Game({ ...base, start: { x: 0, y: -100, vx: 30, vy: 0 }, bound: 200, goals: [{ type: 'buoy', x: 100, y: 0, r: 6 }] });
  run(g, 60);
  ok(g.state === 'lost' && /Perdido/.test(g.lostWhy), 'fugir do sistema = perdido no espaço');
  // tempo limite
  g = new Game({ ...base, limit: 5, start: { around: 'sol', r: 100, deg: -90 }, goals: [{ type: 'buoy', x: 0, y: 100, r: 6 }] });
  run(g, 20);
  ok(g.state === 'lost' && g.lostWhy === 'Acabou o tempo', 'tempo limite');
  // órbita estável de um planeta (parado longe do Sol)
  const pb = [...base.bodies, { id: 'p', kind: 'planet', name: 'P', gm: 500, r: 3, orbit: { type: 'fixed', x: 300, y: 0 } }];
  g = new Game({ ...base, bodies: pb, bound: 600, start: { around: 'p', r: 10, deg: 0 }, goals: [{ type: 'orbit', body: 'p', max: 20, secs: 5 }] });
  g.ctrl.furl = true;
  run(g, 15);
  ok(g.state === 'won' && near(g.time, 5, 0.2), `órbita estável por 5 s cumpre o objetivo (${g.time.toFixed(1)} s)`);
  g = new Game({ ...base, bodies: pb, bound: 600, start: { around: 'p', r: 10, deg: 0, speed: 1.6 }, goals: [{ type: 'orbit', body: 'p', max: 20, secs: 5 }] });
  g.ctrl.furl = true;
  run(g, 15);
  ok(g.state !== 'won', 'rápido demais (escapando do planeta) não conta como órbita');
  // bater no planeta
  g = new Game({ ...base, bodies: pb, bound: 600, start: { x: 300, y: -30, vx: 0, vy: 0 }, goals: [{ type: 'orbit', body: 'p', max: 20, secs: 5 }] });
  g.ctrl.furl = true;
  run(g, 30);
  ok(g.state === 'lost' && /Bateu/.test(g.lostWhy), 'cair no planeta = bateu');
  // entregar carga: chegar devagar
  const mb = [...pb, { id: 'm', kind: 'moon', name: 'M', gm: 0, r: 1, orbit: { type: 'fixed', x: 0, y: 20, around: 'p' } }];
  g = new Game({ ...base, bodies: mb, bound: 600, start: { x: 300, y: 24, vx: 0, vy: 0 }, goals: [{ type: 'deliver', body: 'm', reach: 4, vmax: 5 }] });
  g.ctrl.furl = true;
  run(g, 5);
  ok(g.state === 'won', 'entregar a carga chegando devagar na lua');
  g = new Game({ ...base, bodies: mb, bound: 600, start: { x: 285, y: 24, vx: 30, vy: 0 }, goals: [{ type: 'deliver', body: 'm', reach: 4, vmax: 5 }] });
  g.ctrl.furl = true;
  run(g, 1.2 + COUNTDOWN);
  ok(g.state !== 'won' && g.events !== null, 'passar rápido pela lua não entrega');
  // nova: a onda alcança a nave parada
  const nb = [{ ...base.bodies[0], nova: { t0: 1, mult: 5, shell: 20 } }];
  g = new Game({ ...base, bodies: nb, start: { around: 'sol', r: 60, deg: 0 }, goals: [{ type: 'portal', x: 0, y: 300, r: 8 }] });
  g.ctrl.furl = true;
  run(g, 10);
  ok(g.state === 'lost' && /nova/.test(g.lostWhy), 'a onda da nova alcança quem não foge');
  const sysN = new System(nb);
  ok(sysN.lumAt(0, 3) === 6600 * 5 && sysN.lumAt(0, 0.5) === 6600, 'a nova brilha 5 vezes mais depois de explodir');
}

console.log('Validação das 15 fases');
{
  ok(LEVELS.length === 15, `${LEVELS.length} fases`);
  ok(SYSTEMS.length === 3 && SYSTEMS.every((s, i) => LEVELS.filter(l => l.system === i).length === 5), '3 sistemas com 5 fases cada');
  LEVELS.forEach((l, i) => {
    const n = i + 1;
    ok(l.name && l.hint && l.goals.length > 0, `fase ${n} tem nome, dica e objetivos`);
    ok(l.stars.length === 3 && l.stars[0] < l.stars[1] && l.stars[1] < l.stars[2], `fase ${n}: estrelas em ordem`);
    const g = new Game(l);
    const bound = g.sys.bound;
    for (const goal of l.goals) {
      if (goal.type === 'buoy' || goal.type === 'portal') ok(Math.hypot(goal.x, goal.y) < bound - goal.r, `fase ${n}: boia dentro do mapa`);
      else ok(g.sys.index.has(goal.body), `fase ${n}: corpo do objetivo existe (${goal.body})`);
    }
    // a largada não começa dentro de nada nem no caminho certo de uma batida imediata
    const P = g.sys.positions(0);
    ok(hitBody(g.sys, P, g.ship.x, g.ship.y) < 0, `fase ${n}: largada fora dos corpos`);
  });
  // sistemas: Sol Amarelo tem 1 estrela; os outros têm 2
  ok(LEVELS.filter(l => l.system === 0).every(l => new Game(l).sys.stars.length === 1), 'Sol Amarelo: uma estrela');
  ok(LEVELS.filter(l => l.system > 0).every(l => new Game(l).sys.stars.length === 2), 'Estrela Dupla e Gigante e Anã: duas estrelas');
  // a boia escondida da fase 7 está na sombra de Titã quando o voo de referência passa por ela
  {
    const l = LEVELS[6], sys = new System(l.bodies), P = sys.positions(24), b = l.goals[1];
    ok(Math.min(...sys.stars.map(s => shadowFactor(sys, P, s, b.x, b.y))) < 0.2, 'fase 7: a boia escondida fica na sombra de Titã');
  }
  ok(LEVELS[11].wind && LEVELS[12].bodies.filter(b => b.kind === 'comet').length >= 3 && LEVELS[14].bodies.some(b => b.nova), 'fases com vento, cometas e nova');
}

console.log('Robô (só mexe na vela) nas 15 fases');
{
  const t0 = Date.now();
  LEVELS.forEach((l, i) => {
    const g = new Game(l), r = makeRobot();
    let minComet = Infinity, onlySail = true;
    while ((g.state === 'count' || g.state === 'flying') && g.time < 240) {
      r.step(g);
      if (g.ctrl.tilt !== 0 || Object.keys(g.ctrl).length !== 3) onlySail = false;
      g.step();
      g.sys.bodies.forEach((b, k) => { if (b.kind === 'comet') minComet = Math.min(minComet, Math.hypot(g.ship.x - g.P[k * 2], g.ship.y - g.P[k * 2 + 1])); });
    }
    const st = g.result?.stars ?? 0;
    console.log(`  ${String(i + 1).padStart(2)} ${l.name.padEnd(20)} ${g.state === 'won' ? `${g.time.toFixed(1).padStart(5)} s  ${'★'.repeat(st)}${'·'.repeat(3 - st)}  (limites ${l.stars.join(' / ')} s)` : 'FALHOU: ' + (g.lostWhy || 'não terminou')}${Number.isFinite(minComet) ? `  cometa mais perto ${minComet.toFixed(1)} u` : ''}`);
    ok(onlySail, `fase ${i + 1}: o robô só mexe no ângulo da vela e em recolher`);
    ok(g.state === 'won', `robô completa a fase ${i + 1}`);
    ok(g.state !== 'won' || g.time <= l.stars[2] * 0.75, `fase ${i + 1}: folga para 1 estrela (${g.time.toFixed(1)} s de ${l.stars[2]} s)`);
  });
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

console.log(`\n${count - fails} de ${count} verificações passaram.`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
