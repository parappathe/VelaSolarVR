// Mapa holográfico: disco na frente do jogador com o sistema visto de cima, centrado na nave.
// Mostra estrelas, planetas, órbitas, sombras, objetivos, a vela, a força da luz e a trajetória
// prevista (pontilhada), que muda ao vivo quando a vela mexe. Tudo fica recortado no disco.
//
// Espaço local do mapa: x = direita, y = para a frente (mapa +y), z = para cima do disco.
import * as THREE from '../vendor/three/three.module.js';

export const MAP_R = 0.32;              // raio do disco (m)
export const ZOOMS = [40, 70, 120, 200, 320];   // raio visível (u)

const U = { uToMap: { value: new THREE.Matrix4() }, uR: { value: MAP_R } };

function clipMat(color, opacity = 1, additive = true) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uOp: { value: opacity } },
    vertexShader: 'uniform mat4 uToMap; varying vec2 vMap; void main(){ vMap = (uToMap * modelMatrix * vec4(position, 1.0)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOp, uR; varying vec2 vMap; void main(){ float r = length(vMap); if (r > uR) discard; float edge = smoothstep(uR, uR * 0.9, r); gl_FragColor = vec4(uColor, uOp * edge); }',
    transparent: true, depthWrite: false, depthTest: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function pointsMat() {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uPx: { value: 6 } },
    vertexShader: 'uniform mat4 uToMap; uniform float uPx; attribute vec3 color; varying vec2 vMap; varying vec3 vC; void main(){ vC = color; vMap = (uToMap * modelMatrix * vec4(position, 1.0)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx; }',
    fragmentShader: 'uniform float uR; varying vec2 vMap; varying vec3 vC; void main(){ if (length(vMap) > uR) discard; vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)); gl_FragColor = vec4(vC * a, a); }',
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
}

const circleGeo = new THREE.CircleGeometry(1, 28);
const loopGeo = (() => {
  const pts = [];
  for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)); }
  return new THREE.BufferGeometry().setFromPoints(pts);
})();
const dashGeo = (() => {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a0 = i / 48 * Math.PI * 2, a1 = (i + 0.5) / 48 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a0), Math.sin(a0), 0), new THREE.Vector3(Math.cos(a1), Math.sin(a1), 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
})();

export class HoloMap {
  constructor() {
    this.group = new THREE.Group();          // posição/rotação: quem usa decide (gôndola ou câmera)
    this.content = new THREE.Group();
    this.group.add(this.content);
    this.zoomIdx = 2;
    this.items = [];
    // fundo: disco com anéis e grade
    this.bg = new THREE.Mesh(new THREE.CircleGeometry(MAP_R, 96), new THREE.ShaderMaterial({
      uniforms: { uR: U.uR, uTime: { value: 0 }, uRing: { value: 0.1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uR, uTime, uRing; varying vec2 vP;
        void main(){
          float r = length(vP) / uR;
          float rings = smoothstep(0.03, 0.0, abs(fract(length(vP) / uRing) - 0.5) - 0.47);
          float grid = max(smoothstep(0.004, 0.0, abs(vP.x)), smoothstep(0.004, 0.0, abs(vP.y)));
          float edge = smoothstep(0.94, 1.0, r) * smoothstep(1.0, 0.985, r);
          float scan = 0.5 + 0.5 * sin(r * 40.0 - uTime * 2.0);
          vec3 col = vec3(0.05, 0.12, 0.25) * (0.7 + 0.3 * scan) + vec3(0.2, 0.6, 1.0) * (rings * 0.12 + grid * 0.1) + vec3(0.4, 0.85, 1.0) * edge * 1.2;
          float a = (r < 1.0 ? 0.62 : 0.0);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    }));
    this.bg.renderOrder = 30;
    this.group.add(this.bg);
    this.content.position.z = 0.003;
    // previsão
    this.PRED = 300;
    const g = new THREE.BufferGeometry();
    this.predPos = new Float32Array(this.PRED * 3);
    this.predCol = new Float32Array(this.PRED * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.predPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.predCol, 3));
    this.pred = new THREE.Points(g, pointsMat());
    this.pred.frustumCulled = false;
    this.pred.renderOrder = 33;
    this.content.add(this.pred);
    this.endMark = new THREE.Mesh(circleGeo, clipMat('#ff5a4a', 0.95));
    this.endMark.renderOrder = 34;
    this.content.add(this.endMark);
    // nave, vela e força
    this.ship = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.016, 0), new THREE.Vector3(-0.009, -0.01, 0), new THREE.Vector3(0.009, -0.01, 0)]), clipMat('#ffffff', 1));
    this.ship.renderOrder = 35;
    this.group.add(this.ship);
    this.ship.position.z = 0.006;
    this.sailLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]), clipMat('#ffe9a8', 1));
    this.sailLine.renderOrder = 35;
    this.sailLine.position.z = 0.007;
    this.group.add(this.sailLine);
    this.force = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]), clipMat('#ffb050', 1));
    this.force.renderOrder = 35;
    this.force.position.z = 0.007;
    this.group.add(this.force);
    this.shellLine = new THREE.LineLoop(loopGeo, clipMat('#bfe0ff', 0.9));
    this.shellLine.visible = false;
    this.shellLine.renderOrder = 32;
    this.content.add(this.shellLine);
    this.time = 0;
    this.toMapInv = U.uToMap.value;
  }

  get viewR() { return ZOOMS[this.zoomIdx]; }
  zoom(dir) { this.zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, this.zoomIdx + dir)); }

  // monta os marcadores da fase
  setGame(game) {
    for (const it of this.items) this.content.remove(it.obj);
    this.items = [];
    const sys = game.sys;
    this.game = game;
    const add = (obj, upd) => { obj.renderOrder = 31; this.content.add(obj); this.items.push({ obj, upd }); return obj; };
    // sombras (atrás de planetas e luas, longe de cada estrela)
    for (const o of sys.occluders) for (const s of sys.stars) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), clipMat('#000000', 0.55, false));
      q.geometry.translate(0.5, 0, 0);
      add(q, (P, k) => {
        const bx = P[o * 2], by = P[o * 2 + 1], dx = bx - P[s * 2], dy = by - P[s * 2 + 1];
        q.rotation.z = Math.atan2(dy, dx);
        q.scale.set(500 * k, sys.bodies[o].r * 2 * k, 1);
        q.position.set((bx - this.sx) * k, (by - this.sy) * k, -0.0005);
      });
    }
    // órbitas dos corpos
    sys.bodies.forEach((b, i) => {
      const o = b.orbit;
      if (o.type === 'circ') {
        const l = new THREE.LineLoop(loopGeo, clipMat(b.kind === 'star' ? '#ffd9a0' : '#6f8cff', b.kind === 'moon' ? 0.25 : 0.32));
        add(l, (P, k) => {
          const cx = b.parent >= 0 ? P[b.parent * 2] : 0, cy = b.parent >= 0 ? P[b.parent * 2 + 1] : 0;
          l.position.set((cx - this.sx) * k, (cy - this.sy) * k, 0);
          l.scale.setScalar(o.a * k);
        });
      } else if (o.type === 'kepler') {
        const pts = [];
        for (let q = 0; q <= 128; q++) {
          const E = q / 128 * Math.PI * 2;
          const px = o.a * (Math.cos(E) - o.e), py = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
          const cw = Math.cos(o.w || 0), sw = Math.sin(o.w || 0);
          pts.push(new THREE.Vector3(px * cw - py * sw, px * sw + py * cw, 0));
        }
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), clipMat('#9fe6ff', 0.22));
        add(l, (P, k) => {
          const cx = b.parent >= 0 ? P[b.parent * 2] : 0, cy = b.parent >= 0 ? P[b.parent * 2 + 1] : 0;
          l.position.set((cx - this.sx) * k, (cy - this.sy) * k, 0);
          l.scale.setScalar(k);
        });
      }
    });
    // corpos
    sys.bodies.forEach((b, i) => {
      const star = b.kind === 'star';
      const minR = star ? 0.011 : b.kind === 'planet' ? 0.007 : 0.0045;
      if (star) {
        const glow = new THREE.Mesh(circleGeo, clipMat(b.color, 0.25));
        add(glow, (P, k) => { glow.position.set((P[i * 2] - this.sx) * k, (P[i * 2 + 1] - this.sy) * k, 0.0004); glow.scale.setScalar(Math.max(b.r * k, minR) * 2.4); });
      }
      const m = new THREE.Mesh(circleGeo, clipMat(star ? '#ffffff' : b.color, 1, false));
      if (star) m.material.uniforms.uColor.value.set(b.color).lerp(new THREE.Color('#ffffff'), 0.5);
      add(m, (P, k) => { m.position.set((P[i * 2] - this.sx) * k, (P[i * 2 + 1] - this.sy) * k, 0.0008); m.scale.setScalar(Math.max(b.r * k, minR)); });
    });
    // objetivos
    game.goals.forEach((g, gi) => {
      if (g.type === 'buoy' || g.type === 'portal') {
        const portal = g.type === 'portal';
        const l = new THREE.LineLoop(loopGeo, clipMat(portal ? '#d4a0ff' : '#ffd36a', 1));
        const dot = new THREE.Mesh(circleGeo, clipMat(portal ? '#d4a0ff' : '#ffd36a', 0.5));
        add(dot, (P, k) => {
          dot.visible = gi >= game.goalIdx;
          dot.position.set((g.x - this.sx) * k, (g.y - this.sy) * k, 0.001);
          dot.scale.setScalar(Math.max(g.r * k * 0.3, 0.003));
          dot.material.uniforms.uOp.value = gi === game.goalIdx ? 0.9 : 0.3;
        });
        add(l, (P, k) => {
          l.visible = gi >= game.goalIdx;
          const act = gi === game.goalIdx;
          l.position.set((g.x - this.sx) * k, (g.y - this.sy) * k, 0.001);
          l.scale.setScalar(Math.max(g.r * k, 0.006) * (act ? 1 + 0.08 * Math.sin(this.time * 5) : 1));
          l.material.uniforms.uOp.value = act ? 1 : 0.35;
          l.material.uniforms.uColor.value.set(portal ? '#d4a0ff' : act ? '#ffd36a' : '#8fc8ff');
        });
      } else {
        const bi = sys.index.get(g.body);
        const R = g.type === 'orbit' ? g.max : sys.bodies[bi].r + g.reach;
        const l = new THREE.LineSegments(dashGeo, clipMat(g.type === 'orbit' ? '#7fe8ff' : '#8affc8', 1));
        add(l, (P, k) => {
          l.visible = gi === game.goalIdx;
          l.position.set((P[bi * 2] - this.sx) * k, (P[bi * 2 + 1] - this.sy) * k, 0.001);
          l.scale.setScalar(Math.max(R * k, 0.008));
          l.rotation.z = this.time * 0.3;
        });
        if (g.type === 'orbit') {
          const inner = new THREE.LineLoop(loopGeo, clipMat('#ff8a7a', 0.6));
          add(inner, (P, k) => { inner.visible = gi === game.goalIdx; inner.position.copy(l.position); inner.scale.setScalar(sys.bodies[bi].r * 1.6 * k); });
        }
      }
    });
  }

  // P = corpos (u); ship = { x, y, vx, vy }; ctrl; info (luz); pts/n/hit = previsão
  update(P, ship, ctrl, light, pts, n, hit, dt) {
    this.time += dt;
    this.sx = ship.x; this.sy = ship.y;
    const k = MAP_R / this.viewR;
    this.group.updateMatrixWorld(true);
    this.toMapInv.copy(this.group.matrixWorld).invert();
    this.bg.material.uniforms.uTime.value = this.time;
    this.bg.material.uniforms.uRing.value = 20 * k * (this.viewR > 150 ? 2.5 : 1);
    for (const it of this.items) it.upd(P, k);
    // previsão
    for (let i = 0; i < this.PRED; i++) {
      if (i < n) {
        this.predPos[i * 3] = (pts[i * 2] - ship.x) * k; this.predPos[i * 3 + 1] = (pts[i * 2 + 1] - ship.y) * k; this.predPos[i * 3 + 2] = 0.002;
        const f = 1 - i / this.PRED;
        // pontilhado: um ponto aceso, um apagado
        const on = (i % 2 === 0) ? 1 : 0.35;
        this.predCol[i * 3] = (0.5 * f + 0.25) * on; this.predCol[i * 3 + 1] = (0.85 * f + 0.15) * on; this.predCol[i * 3 + 2] = (1.0) * on;
      }
    }
    this.pred.geometry.attributes.position.needsUpdate = true;
    this.pred.geometry.attributes.color.needsUpdate = true;
    this.pred.geometry.setDrawRange(0, n);
    this.endMark.visible = hit !== -1 && n > 0;
    if (this.endMark.visible) { this.endMark.position.set(this.predPos[(n - 1) * 3], this.predPos[(n - 1) * 3 + 1], 0.003); this.endMark.scale.setScalar(0.007); }
    // nave aponta para onde está indo; vela = linha perpendicular à normal
    this.ship.rotation.z = Math.atan2(ship.vy, ship.vx) - Math.PI / 2;
    this.sailLine.rotation.z = ctrl.ang + Math.PI / 2;
    const sl = 0.03 * (ctrl.furl ? 0.25 : 1) * Math.cos(ctrl.tilt);
    this.sailLine.scale.setScalar(sl);
    // força da luz: seta na direção da aceleração da luz (comprimento ~ força)
    const L = Math.min(0.09, Math.sqrt(light.mag) * 0.06);
    this.force.visible = L > 0.002;
    this.force.rotation.z = light.dir;
    this.force.scale.setScalar(L);
    // onda da nova
    const sys = this.game.sys;
    const ns = sys.stars.find(s => sys.bodies[s].nova);
    if (ns !== undefined) {
      const rs = sys.shellRadius(ns, this.game.t);
      this.shellLine.visible = rs > 0;
      this.shellLine.position.set((P[ns * 2] - ship.x) * k, (P[ns * 2 + 1] - ship.y) * k, 0.002);
      this.shellLine.scale.setScalar(Math.max(rs, 0.01) * k);
    } else this.shellLine.visible = false;
  }
}
