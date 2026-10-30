// Robô piloto: mexe só no ângulo da vela e em recolher (como o jogador). A cada meio segundo
// testa várias posições da vela usando a mesma previsão que o jogador vê no mapa (simula alguns
// segundos à frente com a vela parada) e fica com a que chega melhor no objetivo atual.
// Usado pelos testes (calibrar as estrelas) e pelo dev.autoplay. Sem navegador.
import { DT, Ship, stepShip, hitBody } from './physics.js';

const D = Math.PI / 180;

export function makeRobot(opts = {}) {
  const every = opts.every ?? 30;           // decide a cada 30 passos (0,5 s)
  const horizon = opts.horizon ?? 1200;     // olha 20 s à frente
  const angles = [];
  for (let a = 0; a < 180; a += 15) angles.push(a * D);
  const SEGLEN = opts.segLen ?? 90;          // cada trecho do plano dura 1,5 s
  const NSEG = Math.ceil(horizon / SEGLEN);
  const MUT = opts.mutations ?? 40;
  let wait = 0;
  let best = null;
  let table = null, views = null;
  const sim = new Ship();

  function buildTable(game, H) {
    const sys = game.sys, n2 = sys.n * 2;
    if (!table || table.length !== (H + 1) * n2) {
      table = new Float64Array((H + 1) * n2);
      views = [];
      for (let j = 0; j <= H; j++) views.push(table.subarray(j * n2, (j + 1) * n2));
    }
    const k0 = game.ship.k;
    for (let j = 0; j <= H; j++) sys.positions((k0 + j) * DT, views[j]);
  }

  // custo de um estado no passo j da previsão (menor = melhor; 0 = objetivo cumprido)
  function costAt(game, g, j, s) {
    const sys = game.sys;
    const P = views[j];
    if (g.type === 'buoy' || g.type === 'portal') {
      const d = Math.hypot(s.x - g.x, s.y - g.y);
      return Math.max(0, d - g.r * 0.6);
    }
    const i = sys.index.get(g.body);
    const bx = P[i * 2], by = P[i * 2 + 1];
    const jp = Math.min(j + 1, views.length - 1), jm = Math.max(j - 1, 0);
    const bvx = (views[jp][i * 2] - views[jm][i * 2]) / ((jp - jm) * DT);
    const bvy = (views[jp][i * 2 + 1] - views[jm][i * 2 + 1]) / ((jp - jm) * DT);
    const rx = s.x - bx, ry = s.y - by, r = Math.hypot(rx, ry);
    const vx = s.vx - bvx, vy = s.vy - bvy;
    const body = sys.bodies[i];
    if (g.type === 'deliver') {
      const d = Math.max(0, r - body.r - g.reach * 0.7);
      const vr = Math.hypot(vx, vy);
      let c = d + 3 * Math.max(0, vr - g.vmax * 0.75);
      // lua de um planeta: primeiro ficar presa na gravidade do planeta, depois chegar na lua
      const pi = body.parent, pb = pi >= 0 ? sys.bodies[pi] : null;
      if (pb && pb.kind === 'planet' && c > 0) {
        const pvx = (views[jp][pi * 2] - views[jm][pi * 2]) / ((jp - jm) * DT);
        const pvy = (views[jp][pi * 2 + 1] - views[jm][pi * 2 + 1]) / ((jp - jm) * DT);
        const qx = s.x - P[pi * 2], qy = s.y - P[pi * 2 + 1], qr = Math.hypot(qx, qy);
        const wx = s.vx - pvx, wy = s.vy - pvy;
        const Ep = (wx * wx + wy * wy) / 2 - pb.gm / qr;
        if (Ep >= 0) c += 25 + Ep * 2;
      }
      return c;
    }
    // órbita: pelos elementos da órbita em volta do planeta (passar raspando não engana)
    const mu = body.gm, v2 = vx * vx + vy * vy;
    const E = v2 / 2 - mu / r;
    const lo = body.r * 1.6 * 1.15, hi = g.max * 0.85;
    if (E >= 0) return 40 + E * 2 + Math.max(0, r - g.max) * 0.3;
    const h = rx * vy - ry * vx;
    const ex = (vy * h) / mu - rx / r, ey = (-vx * h) / mu - ry / r;
    const e = Math.hypot(ex, ey), a = -mu / (2 * E);
    const peri = a * (1 - e), apo = a * (1 + e);
    return Math.min(40, Math.max(0, lo - peri) * 2 + Math.max(0, apo - hi));
  }

  // plano = lista de SEG controles (cada um vale SEGLEN passos): número = ângulo, null = recolhida
  // Custo do plano: cumprir os próximos objetivos em ordem (até 4), o quanto antes. Cada
  // objetivo cumprido vale 100; o tempo conta 2 por segundo; o primeiro que faltou conta pela
  // distância mais perto que o plano chegou dele. Bater ou se perder custa 1000.
  function evaluate(game, list, plan, H) {
    const sys = game.sys;
    sim.copyFrom(game.ship);
    const ctrl = { ang: 0, tilt: 0, furl: false };
    const g = list[0];
    const keeping = g.type === 'orbit' && g.hold > 0;
    const keepSteps = keeping ? Math.min(H, Math.ceil((g.secs - g.hold + 1) / DT)) : 0;
    let worst = 0, q = 0, tLast = 0, part = Infinity;
    const N = list.length;
    let dead = false, jEnd = H;
    for (let j = 1; j <= H; j++) {
      const c = plan[Math.min(plan.length - 1, Math.floor((j - 1 + offset) / SEGLEN))];
      if (c === null) ctrl.furl = true; else { ctrl.furl = false; ctrl.ang = c; }
      stepShip(sys, sim, ctrl, null, views[j]);
      const P = views[j];
      dead = hitBody(sys, P, sim.x, sim.y) >= 0 || sim.x * sim.x + sim.y * sim.y > sys.bound * sys.bound;
      if (!dead) for (const st of sys.stars) {
        const rs = sys.shellRadius(st, sim.t);
        if (rs > 0 && Math.hypot(sim.x - P[st * 2], sim.y - P[st * 2 + 1]) < rs + 4) dead = true;
      }
      if (dead) { jEnd = j; break; }
      if (j % 6 === 0 || j === 1) {
        if (keeping) { if (j <= keepSteps) worst = Math.max(worst, costAt(game, g, j, sim)); else break; continue; }
        const cst = costAt(game, list[q], j, sim);
        const v = cst + 2.0 * (j * DT - tLast);
        if (v < part) part = v;
        if (cst === 0) {
          tLast = j * DT; q++; part = Infinity;
          if (q >= N || list[q].type === 'orbit' && q > 0) break;
        }
      }
    }
    if (keeping) return dead ? 3000 + (H - jEnd) : worst;
    let J = 100 * (N - q) + 2 * tLast + (q < N ? Math.min(part, 5000) : 0);
    if (dead) J += 1000 + (H - jEnd) * 0.05;
    return J;
  }

  const opts2 = [null, ...angles];
  const rnd = mulberry(opts.seed ?? 7);
  let plan = null, offset = 0;

  return {
    reset() { wait = 0; best = null; plan = null; offset = 0; },
    step(game) {
      if (game.state !== 'flying' && game.state !== 'count') return;
      if (game.state === 'flying') offset++;
      if (--wait > 0) return;
      wait = every;
      const g = game.goal;
      if (!g) return;
      const list = game.goals.slice(game.goalIdx, game.goalIdx + 4);
      const H = horizon;
      buildTable(game, H);
      // o plano anda junto com o tempo: descarta os segmentos que já passaram
      while (plan && offset >= SEGLEN) { plan.shift(); plan.push(plan[plan.length - 1]); offset -= SEGLEN; }
      if (game.state === 'count') offset = 0;
      if (!plan || plan.length !== NSEG) plan = new Array(NSEG).fill(null);
      let bestJ = evaluate(game, list, plan, H);
      let bestPlan = plan.slice();
      // planos constantes (como a previsão do jogador)
      for (const o of opts2) {
        const p = new Array(NSEG).fill(o);
        const J = evaluate(game, list, p, H);
        if (J < bestJ) { bestJ = J; bestPlan = p; }
      }
      // mutações do melhor plano
      for (let it = 0; it < MUT; it++) {
        const p = bestPlan.slice();
        const k = Math.floor(rnd() * NSEG);
        const kind = rnd();
        if (kind < 0.45) p[k] = opts2[Math.floor(rnd() * opts2.length)];
        else if (kind < 0.8) { if (p[k] !== null) p[k] = (p[k] + (rnd() - 0.5) * 0.5 + Math.PI) % Math.PI; else p[k] = angles[Math.floor(rnd() * angles.length)]; }
        else { const v = opts2[Math.floor(rnd() * opts2.length)]; for (let q = k; q < NSEG; q++) p[q] = v; }
        const J = evaluate(game, list, p, H);
        if (J < bestJ) { bestJ = J; bestPlan = p; }
      }
      plan = bestPlan;
      const c = plan[Math.floor(offset / SEGLEN)] ?? plan[0];
      best = { furl: c === null, ang: c ?? game.ctrl.ang };
      game.ctrl.furl = c === null;
      if (c !== null) game.ctrl.ang = c;
      game.ctrl.tilt = 0;
    },
    get plan() { return plan; },
    get choice() { return best; },
  };
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
