// Uma fase em andamento: sistema, nave, controle da vela, objetivos, cronômetro, falhas e
// estrelas. Sem navegador: os testes e o robô usam direto.
import { System, Ship, DT, stepShip, hitBody, orbitAround, accel } from './physics.js';
import { startState } from './start.js';
export { startState };

export const COUNTDOWN = 3;          // segundos de "3, 2, 1" antes de soltar a nave

// estrelas pelo tempo: stars = [3 estrelas até, 2 até, 1 até] (s). Acima do último: 0.
export function starsFor(def, t) {
  const [a, b, c] = def.stars;
  return t <= a ? 3 : t <= b ? 2 : t <= c ? 1 : 0;
}

export class Game {
  constructor(def) {
    this.def = def;
    this.sys = new System(def.bodies, { wind: def.wind ? { ...def.wind, star: def.bodies.findIndex(b => b.id === def.wind.star) } : null, bound: def.bound || 420 });
    const s = startState(this.sys, def.start);
    this.ship = new Ship(s.x, s.y, s.vx, s.vy);
    // vela começa de frente para a estrela mais forte (empurrando para fora)
    const P = this.sys.positions(0);
    const st = this.sys.stars[0];
    this.ctrl = { ang: def.start.ang ?? Math.atan2(s.y - P[st * 2 + 1], s.x - P[st * 2]), tilt: 0, furl: false };
    this.goals = def.goals.map(g => ({ ...g, done: false, hold: 0 }));
    this.goalIdx = 0;
    this.state = 'count';     // 'count' | 'flying' | 'won' | 'lost'
    this.count = COUNTDOWN;
    this.time = 0;            // cronômetro da fase (s)
    this.events = [];
    this.info = { light: 0, shade: 0, wind: 0 };
    this.P = P.slice();
    this.lostWhy = '';
    this.result = null;
    this.orbitInfo = null;
    this.gravInfo();
  }

  get goal() { return this.goals[this.goalIdx] || null; }
  get t() { return this.ship.t; }

  // dado um objetivo, onde ele está agora (para mapa, robô e checagem)
  goalPos(g, P = this.P) {
    if (g.type === 'buoy' || g.type === 'portal') return [g.x, g.y];
    const i = this.sys.index.get(g.body);
    return [P[i * 2], P[i * 2 + 1]];
  }

  gravInfo() {
    // força da luz parada (sem passo), para o HUD na contagem
    const P = this.sys.positions(this.ship.t);
    accel(this.sys, P, this.ship.x, this.ship.y, { ang: this.ctrl.ang, tilt: this.ctrl.tilt, dep: this.ship.dep }, this.ship.t, this.info);
  }

  // avança DT. Durante a contagem a nave fica parada (dá para ajeitar a vela vendo a previsão).
  step() {
    this.events.length = 0;
    if (this.state === 'count') {
      const before = Math.ceil(this.count);
      this.count -= DT;
      if (Math.ceil(this.count) !== before && this.count > 0) this.events.push({ type: 'tick', n: Math.ceil(this.count) });
      if (this.count <= 0) { this.state = 'flying'; this.events.push({ type: 'go' }); }
      this.ship.ready = false;
      this.gravInfo();
      return;
    }
    if (this.state !== 'flying') return;
    const sys = this.sys, ship = this.ship;
    const P = stepShip(sys, ship, this.ctrl, this.info);
    this.P.set(P);
    this.time += DT;
    const t = ship.t;

    // falhas
    const hit = hitBody(sys, P, ship.x, ship.y);
    if (hit >= 0) {
      const b = sys.bodies[hit];
      return this.lose(b.kind === 'star' ? `A vela queimou em ${b.name}` : `Bateu em ${b.name}`, b.kind === 'star' ? 'burn' : 'crash');
    }
    if (ship.x * ship.x + ship.y * ship.y > sys.bound * sys.bound) return this.lose('Perdido no espaço profundo', 'lost');
    for (const s of sys.stars) {
      const rs = sys.shellRadius(s, t);
      if (rs > 0 && Math.hypot(ship.x - P[s * 2], ship.y - P[s * 2 + 1]) < rs) return this.lose('A onda da nova te alcançou', 'shell');
    }
    if (this.def.limit && this.time > this.def.limit) return this.lose('Acabou o tempo', 'timeout');

    // objetivo atual
    const g = this.goal;
    if (!g) return;
    let ok = false;
    if (g.type === 'buoy' || g.type === 'portal') {
      ok = Math.hypot(ship.x - g.x, ship.y - g.y) < g.r;
    } else if (g.type === 'orbit') {
      const i = sys.index.get(g.body);
      if (ship.k % 3 === 0) {
        const o = orbitAround(sys, i, ship, P);
        const R = sys.bodies[i].r;
        const good = o.bound && o.peri > R * 1.6 && o.apo < g.max && o.r < g.max;
        this.orbitInfo = { ...o, good };
        if (good) g.hold += 3 * DT; else g.hold = 0;
      }
      ok = g.hold >= g.secs;
    } else if (g.type === 'deliver') {
      const i = sys.index.get(g.body);
      const dx = ship.x - P[i * 2], dy = ship.y - P[i * 2 + 1];
      if (Math.hypot(dx, dy) < sys.bodies[i].r + g.reach) {
        const [bvx, bvy] = sys.velocity(i, t);
        const vr = Math.hypot(ship.vx - bvx, ship.vy - bvy);
        if (vr < g.vmax) ok = true;
        else if (!this._fastWarn) { this._fastWarn = true; this.events.push({ type: 'fast', v: vr }); }
      } else this._fastWarn = false;
    }
    if (ok) {
      g.done = true;
      this.events.push({ type: 'goal', i: this.goalIdx, kind: g.type });
      this.goalIdx++;
      this.orbitInfo = null;
      if (this.goalIdx >= this.goals.length) this.win();
    }
  }

  win() {
    this.state = 'won';
    const stars = starsFor(this.def, this.time);
    this.result = { time: this.time, stars };
    this.events.push({ type: 'won', time: this.time, stars });
  }
  lose(why, kind) {
    this.state = 'lost';
    this.lostWhy = why;
    this.events.push({ type: 'lost', why, kind });
  }
}
