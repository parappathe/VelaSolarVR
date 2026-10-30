// Estado de largada da nave (órbita circular em volta de um corpo, ou posição e velocidade dadas).
// Sem navegador.

// Posição e velocidade de partida. start = { around, r, deg, dir, gm?, ang? } (órbita circular
// em volta de um corpo; gm opcional para usar a massa de um par de estrelas) ou { x, y, vx, vy }.
export function startState(sys, start) {
  if (start.around === undefined) return { x: start.x, y: start.y, vx: start.vx, vy: start.vy };
  let cx = 0, cy = 0, cvx = 0, cvy = 0, gm = start.gm;
  if (start.around) {
    const i = sys.index.get(start.around);
    const P = sys.positions(0);
    cx = P[i * 2]; cy = P[i * 2 + 1];
    [cvx, cvy] = sys.velocity(i, 0);
    gm = gm ?? sys.bodies[i].gm;
  }
  const a = start.deg * Math.PI / 180, dir = start.dir ?? 1;
  const v = Math.sqrt(gm / start.r) * (start.speed ?? 1);
  return {
    x: cx + start.r * Math.cos(a), y: cy + start.r * Math.sin(a),
    vx: cvx - Math.sin(a) * v * dir, vy: cvy + Math.cos(a) * v * dir,
  };
}
