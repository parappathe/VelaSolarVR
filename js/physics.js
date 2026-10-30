// Física da vela solar no plano do sistema (2D). Sem navegador e sem Three.js: roda no Node.
//
// Unidades do jogo: distância em "u" (no 3D, 1 u = 10 m), tempo em segundos.
// Corpos (estrelas, planetas, luas, cometas) andam "em trilhos": a posição é uma função exata do
// tempo (órbita circular ou de Kepler). Só a nave é integrada, com passo fixo DT e o integrador
// leapfrog (kick-drift-kick), que conserva bem a energia em órbita.
//
// Vela: a normal fica no plano, no ângulo `ang` (rad, mundo), e pode ser deitada por `tilt`
// (normal saindo do plano: a vela "embandeira"). A luz de cada estrela empurra ao longo da normal
// com aceleração lum/r² · cos²θ (θ = ângulo entre a luz e a normal). Só conta a parte da força
// que fica no plano. Vela de lado para a luz (θ = 90°) não empurra nada. Sombra de planetas e luas
// corta a luz. `dep` (0..1) é quanto da vela está aberta (recolher leva 0,4 s).

export const DT = 1 / 60;
export const DEPLOY_RATE = 2.5;       // abre/recolhe por segundo

// ---------- Corpos em trilhos ----------
// def de corpo: { id, kind: 'star'|'planet'|'moon'|'comet', name, gm, r, lum?, color,
//   orbit: { type: 'fixed', x, y } | { type: 'circ', around, a, period, phase }
//        | { type: 'kepler', around, a, e, w, period, M0 } }
// period negativo = sentido horário. `around` = id do corpo central (ou null = origem).
// Estrela pode ter nova: { t0, mult, shell } (a partir de t0 brilha `mult` vezes mais e solta uma
// onda de plasma que cresce `shell` u/s).

export class System {
  constructor(bodies, extra = {}) {
    this.bodies = bodies.map(b => ({ gm: 0, r: 1, lum: 0, ...b }));
    this.n = this.bodies.length;
    const idx = new Map(this.bodies.map((b, i) => [b.id, i]));
    this.index = idx;
    for (const b of this.bodies) {
      const o = b.orbit || { type: 'fixed', x: 0, y: 0 };
      b.orbit = o;
      b.parent = o.around != null ? idx.get(o.around) : -1;
      if (o.around != null && b.parent === undefined) throw new Error(`corpo central desconhecido: ${o.around}`);
    }
    // pais antes dos filhos
    for (let i = 0; i < this.n; i++) if (this.bodies[i].parent >= i) throw new Error('corpo central tem que vir antes');
    this.stars = this.bodies.map((b, i) => (b.lum > 0 ? i : -1)).filter(i => i >= 0);
    this.occluders = this.bodies.map((b, i) => (b.kind !== 'star' && b.r > 0 ? i : -1)).filter(i => i >= 0);
    this.wind = extra.wind || null;     // { star, strength, arms, omega }
    this.bound = extra.bound || 400;    // passou disso: perdido no espaço
  }

  // posições de todos os corpos no tempo t: out = [x0, y0, x1, y1, ...]
  positions(t, out = new Float64Array(this.n * 2)) {
    for (let i = 0; i < this.n; i++) {
      const b = this.bodies[i], o = b.orbit;
      let cx = 0, cy = 0;
      if (b.parent >= 0) { cx = out[b.parent * 2]; cy = out[b.parent * 2 + 1]; }
      if (o.type === 'fixed') { out[i * 2] = cx + o.x; out[i * 2 + 1] = cy + o.y; }
      else if (o.type === 'circ') {
        const a = o.phase + 2 * Math.PI * t / o.period;
        out[i * 2] = cx + o.a * Math.cos(a); out[i * 2 + 1] = cy + o.a * Math.sin(a);
      } else {
        const [x, y] = keplerPos(o, t);
        out[i * 2] = cx + x; out[i * 2 + 1] = cy + y;
      }
    }
    return out;
  }

  // velocidade do corpo i (diferença central, exata o bastante para as checagens de órbita)
  velocity(i, t) {
    const h = 1e-3, a = this.positions(t - h), b = this.positions(t + h);
    return [(b[i * 2] - a[i * 2]) / (2 * h), (b[i * 2 + 1] - a[i * 2 + 1]) / (2 * h)];
  }

  // brilho da estrela no tempo t (nova acende em 0,6 s)
  lumAt(i, t) {
    const b = this.bodies[i];
    if (!b.nova || t < b.nova.t0) return b.lum;
    return b.lum * (1 + (b.nova.mult - 1) * Math.min(1, (t - b.nova.t0) / 0.6));
  }
  shellRadius(i, t) {
    const nv = this.bodies[i].nova;
    return nv && t >= nv.t0 ? (t - nv.t0) * nv.shell : 0;
  }
}

function keplerPos(o, t) {
  const n = 2 * Math.PI / o.period;
  const M = (o.M0 || 0) + n * t;
  let E = M;
  for (let k = 0; k < 6; k++) E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
  const px = o.a * (Math.cos(E) - o.e), py = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const cw = Math.cos(o.w || 0), sw = Math.sin(o.w || 0);
  return [px * cw - py * sw, px * sw + py * cw];
}

// ---------- Vela ----------
// Força da luz de UMA estrela (aceleração), para os testes e o HUD.
// lx, ly: direção da luz (da estrela para a nave), unitária. Devolve [ax, ay].
export function sailPush(lum, r2, lx, ly, ang, tilt = 0, dep = 1) {
  let nx = Math.cos(ang), ny = Math.sin(ang);
  let c = nx * lx + ny * ly;
  if (c < 0) { nx = -nx; ny = -ny; c = -c; }       // a luz sempre empurra para longe dela
  const ct = Math.cos(tilt), cc = c * ct;
  const m = lum / r2 * cc * cc * ct * dep;
  return [m * nx, m * ny];
}

// quanto da luz da estrela s chega no ponto (x, y): 1 = toda, 0 = sombra total
export function shadowFactor(sys, P, s, x, y) {
  const sx = P[s * 2], sy = P[s * 2 + 1];
  let f = 1;
  for (const i of sys.occluders) {
    const bx = P[i * 2], by = P[i * 2 + 1], R = sys.bodies[i].r;
    let ux = bx - sx, uy = by - sy;
    const ul = Math.hypot(ux, uy);
    if (ul < 1e-9) continue;
    ux /= ul; uy /= ul;
    const wx = x - bx, wy = y - by;
    const along = wx * ux + wy * uy;
    if (along <= 0) continue;
    const perp = Math.abs(wx * uy - wy * ux);
    // borda suave (penumbra) de 15% do raio
    const k = (perp - R * 0.85) / (R * 0.3);
    if (k >= 1) continue;
    const sm = k <= 0 ? 0 : k * k * (3 - 2 * k);
    // logo atrás do corpo a sombra começa suave também
    const fade = Math.min(1, along / (R * 0.5));
    f *= 1 - (1 - sm) * fade;
  }
  return f;
}

// Aceleração total na nave. P = posições dos corpos no tempo t. sail = { ang, tilt, dep }.
// info (opcional) recebe: light (aceleração da luz, u/s²), shade (0..1, 1 = sombra), wind.
export function accel(sys, P, x, y, sail, t, info = null) {
  let ax = 0, ay = 0;
  const B = sys.bodies;
  for (let i = 0; i < sys.n; i++) {
    const b = B[i];
    if (!b.gm) continue;
    const dx = P[i * 2] - x, dy = P[i * 2 + 1] - y;
    let r2 = dx * dx + dy * dy;
    const soft = b.r * 0.5;
    if (r2 < soft * soft) r2 = soft * soft;
    const inv = b.gm / (r2 * Math.sqrt(r2));
    ax += dx * inv; ay += dy * inv;
  }
  let light = 0, shade = 0, windA = 0;
  const dep = sail.dep;
  if (dep > 0) {
    const nx0 = Math.cos(sail.ang), ny0 = Math.sin(sail.ang), ct = Math.cos(sail.tilt || 0);
    for (const s of sys.stars) {
      const dx = x - P[s * 2], dy = y - P[s * 2 + 1];
      const r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
      const lx = dx / r, ly = dy / r;
      let nx = nx0, ny = ny0, c = nx * lx + ny * ly;
      if (c < 0) { nx = -nx; ny = -ny; c = -c; }
      const sh = shadowFactor(sys, P, s, x, y);
      const cc = c * ct;
      const m = sys.lumAt(s, t) / r2 * cc * cc * ct * dep * sh;
      ax += m * nx; ay += m * ny;
      light += m;
      shade = Math.max(shade, 1 - sh);
      const w = sys.wind;
      if (w && w.star === s) {
        // vento de partículas: braços em espiral que giram com a estrela, empurram para fora
        const th = Math.atan2(dy, dx) - w.omega * t - r * (w.twist || 0);
        const g = Math.max(0, Math.cos(w.arms * th));
        const wm = w.strength / r2 * g * g * g * g * c * ct * dep * sh;
        ax += wm * lx; ay += wm * ly;
        windA += wm;
      }
    }
  }
  if (info) { info.light = light; info.shade = shade; info.wind = windA; }
  return [ax, ay];
}

// ---------- Nave ----------
export class Ship {
  constructor(x = 0, y = 0, vx = 0, vy = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.ax = 0; this.ay = 0;
    this.k = 0;              // passo atual (t = k · DT)
    this.dep = 1;            // vela aberta
    this.ready = false;      // aceleração inicial calculada
  }
  get t() { return this.k * DT; }
  copyFrom(o) {
    this.x = o.x; this.y = o.y; this.vx = o.vx; this.vy = o.vy;
    this.ax = o.ax; this.ay = o.ay; this.k = o.k; this.dep = o.dep; this.ready = o.ready;
    return this;
  }
  clone() { return new Ship().copyFrom(this); }
}

// controle: { ang, tilt, furl }  (furl = vela recolhida)
const _P = { a: null, b: null };
export function stepShip(sys, ship, ctrl, info = null, Pnext = null) {
  if (!ship.ready) {
    const P0 = sys.positions(ship.t, _P.a && _P.a.length === sys.n * 2 ? _P.a : (_P.a = new Float64Array(sys.n * 2)));
    const a0 = accel(sys, P0, ship.x, ship.y, { ang: ctrl.ang, tilt: ctrl.tilt, dep: ship.dep }, ship.t);
    ship.ax = a0[0]; ship.ay = a0[1]; ship.ready = true;
  }
  const h = DT * 0.5;
  ship.vx += ship.ax * h; ship.vy += ship.ay * h;
  ship.x += ship.vx * DT; ship.y += ship.vy * DT;
  ship.k++;
  const target = ctrl.furl ? 0 : 1;
  if (ship.dep < target) ship.dep = Math.min(target, ship.dep + DEPLOY_RATE * DT);
  else if (ship.dep > target) ship.dep = Math.max(target, ship.dep - DEPLOY_RATE * DT);
  if (Math.abs(ship.dep - target) < 1e-9) ship.dep = target;
  const t = ship.t;
  const P = Pnext || sys.positions(t, _P.b && _P.b.length === sys.n * 2 ? _P.b : (_P.b = new Float64Array(sys.n * 2)));
  const a = accel(sys, P, ship.x, ship.y, { ang: ctrl.ang, tilt: ctrl.tilt, dep: ship.dep }, t, info);
  ship.ax = a[0]; ship.ay = a[1];
  ship.vx += ship.ax * h; ship.vy += ship.ay * h;
  return P;
}

// Bateu em algum corpo? Devolve o índice ou -1. (P = posições no tempo atual)
export function hitBody(sys, P, x, y) {
  for (let i = 0; i < sys.n; i++) {
    const b = sys.bodies[i];
    const dx = x - P[i * 2], dy = y - P[i * 2 + 1];
    if (dx * dx + dy * dy < b.r * b.r) return i;
  }
  return -1;
}

// Energia específica da nave (cinética + potencial de todos os corpos), para os testes.
export function energy(sys, ship) {
  const P = sys.positions(ship.t);
  let e = 0.5 * (ship.vx * ship.vx + ship.vy * ship.vy);
  for (let i = 0; i < sys.n; i++) {
    const g = sys.bodies[i].gm;
    if (g) e -= g / Math.hypot(ship.x - P[i * 2], ship.y - P[i * 2 + 1]);
  }
  return e;
}

// Previsão: copia a nave e simula `steps` passos com o controle parado. Grava um ponto a cada
// `every` passos em out (x, y alternados). Para ao bater ou sair do mapa.
// Devolve { n (pontos gravados), hit (índice do corpo, -1, ou -2 = perdido), steps }.
const _pred = new Ship();
export function predict(sys, ship, ctrl, steps, every, out) {
  const s = _pred.copyFrom(ship);
  let n = 0, hit = -1, k = 0;
  const maxPts = out.length >> 1;
  for (k = 1; k <= steps; k++) {
    const P = stepShip(sys, s, ctrl);
    if (k % every === 0 && n < maxPts) { out[n * 2] = s.x; out[n * 2 + 1] = s.y; n++; }
    hit = hitBody(sys, P, s.x, s.y);
    if (hit >= 0) break;
    if (s.x * s.x + s.y * s.y > sys.bound * sys.bound) { hit = -2; break; }
  }
  if (hit !== -1 && n < maxPts) { out[n * 2] = s.x; out[n * 2 + 1] = s.y; n++; }
  return { n, hit, steps: Math.min(k, steps) };
}

// Elementos da órbita da nave em volta do corpo i: { bound, a, e, peri, apo, r, vrel }
export function orbitAround(sys, i, ship, P = null) {
  P = P || sys.positions(ship.t);
  const [bvx, bvy] = sys.velocity(i, ship.t);
  const rx = ship.x - P[i * 2], ry = ship.y - P[i * 2 + 1];
  const vx = ship.vx - bvx, vy = ship.vy - bvy;
  const r = Math.hypot(rx, ry), v2 = vx * vx + vy * vy, mu = sys.bodies[i].gm;
  const E = v2 / 2 - mu / r;
  const h = rx * vy - ry * vx;
  const ex = (vy * h) / mu - rx / r, ey = (-vx * h) / mu - ry / r;
  const e = Math.hypot(ex, ey);
  if (E >= 0) return { bound: false, e, r, vrel: Math.sqrt(v2), E };
  const a = -mu / (2 * E);
  return { bound: true, a, e, peri: a * (1 - e), apo: a * (1 + e), r, vrel: Math.sqrt(v2), E };
}

// Velocidade de órbita circular em volta de uma massa gm à distância r
export const circV = (gm, r) => Math.sqrt(gm / r);
