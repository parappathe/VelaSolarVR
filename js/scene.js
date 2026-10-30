// Tudo que se desenha em 3D: céu com nebulosa e estrelas, estrelas com halo (sprites aditivos),
// planetas, luas, cometas, boias de luz, portal, onda da nova, vento de partículas, a gôndola,
// a vela solar (ondula e brilha com a luz), a barra e o cordame, e a previsão no plano.
//
// Coordenadas: o mapa (física) usa u; no 3D 1 u = S metros. A gôndola fica parada na origem e o
// "mundo" (grupo world) anda ao contrário da nave. O plano do sistema fica PLANE_Y metros abaixo
// do piso da gôndola, para ver o disco um pouco de cima. Mapa (x, y) -> 3D (x·S, PLANE_Y, -y·S).
import * as THREE from '../vendor/three/three.module.js';

export const S = 10;
export const PLANE_Y = -30;
export const SAIL_C = new THREE.Vector3(0, 11, -8);   // centro da vela, na frente e acima
export const SAIL_SIZE = 12;

const rand = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hashStr = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 2147483647; return h || 1; };

export const THEMES = {
  amarelo: { a: [0.25, 0.32, 0.75], b: [0.55, 0.2, 0.6], c: [0.7, 0.6, 0.45], fog: '#04060f' },
  dupla: { a: [0.15, 0.55, 0.6], b: [0.75, 0.35, 0.2], c: [0.5, 0.6, 0.7], fog: '#03080c' },
  gigante: { a: [0.7, 0.18, 0.12], b: [0.25, 0.3, 0.7], c: [0.75, 0.45, 0.35], fog: '#0a0406' },
};

// ---------- texturas de canvas ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function radialTex(stops) {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
const TEX = {};
function textures() {
  if (TEX.halo) return TEX;
  TEX.halo = radialTex([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,255,255,0.85)'], [0.22, 'rgba(255,255,255,0.32)'], [0.5, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
  TEX.soft = radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
  TEX.rays = canvasTex(512, 512, (g, w, h) => {
    g.translate(w / 2, h / 2);
    const R = rand(5);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.2, len = w * (0.22 + R() * 0.28), wd = 2 + R() * 5;
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr; g.lineWidth = wd; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke();
    }
  });
  TEX.dot = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  return TEX;
}

function planetTexture(id, color, kind) {
  const R = rand(hashStr(id));
  const base = new THREE.Color(color);
  return canvasTex(512, 256, (g, w, h) => {
    if (kind === 'gas') {
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const band = Math.sin(t * 22 + Math.sin(t * 7) * 2) * 0.5 + 0.5;
        const c = base.clone().offsetHSL((band - 0.5) * 0.05, (band - 0.5) * 0.15, (band - 0.5) * 0.22 + (R() - 0.5) * 0.03);
        g.fillStyle = `#${c.getHexString()}`; g.fillRect(0, y, w, 1);
      }
      for (let i = 0; i < 8; i++) {
        const x = R() * w, y = h * (0.2 + R() * 0.6), rx = 10 + R() * 30;
        g.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.1})`;
        g.beginPath(); g.ellipse(x, y, rx, rx * 0.35, 0, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.fillStyle = `#${base.getHexString()}`; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const x = R() * w, y = R() * h, r = 2 + R() * 22 * (R() < 0.1 ? 2 : 1);
        const c = base.clone().offsetHSL(0, -0.05, (R() - 0.55) * 0.25);
        g.fillStyle = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},0.55)`;
        g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      }
      // calotas
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.1, 'rgba(255,255,255,0)');
      gr.addColorStop(0.9, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.6)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
}

// ---------- materiais com shader ----------
const NOISE = `
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector3() }, uFlash: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uA, uB, uC, uFlash; varying vec3 vDir; ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float n = fbm(d * 2.2 + 1.3), n2 = fbm(d * 4.5 + vec3(5.0, 1.0, 2.0)), n3 = fbm(d * 9.0);
        vec3 col = vec3(0.006, 0.008, 0.02);
        col += uA * pow(smoothstep(0.42, 0.85, n), 1.6) * 0.42;
        col += uB * pow(smoothstep(0.5, 0.9, n2), 1.8) * 0.3;
        float band = exp(-pow(d.y * 2.6 + 0.35 * sin(d.x * 2.0 + d.z), 2.0));
        col += uC * band * (0.06 + 0.12 * n3);
        col *= 0.85 + 0.3 * n3;
        col += uFlash * (0.6 + 0.4 * n);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
}

function starSurfaceMaterial(color, big) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uBoost: { value: 1 }, uWhite: { value: big ? 0.18 : 0.55 }, uGain: { value: big ? 1.15 : 2.2 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uBoost, uWhite, uGain; varying vec3 vN; varying vec3 vP; varying vec3 vV; ${NOISE}
      void main(){
        vec3 p = normalize(vP);
        float g = fbm(p * 7.0 + vec3(uTime * 0.05, uTime * 0.03, 0.0));
        float limb = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 hot = mix(uColor, vec3(1.0), uWhite);
        vec3 col = mix(uColor * 0.8, hot, g) * (0.45 + 0.75 * pow(limb, 0.5));
        gl_FragColor = vec4(col * uGain * uBoost, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// vela: membrana que ondula (mais quando a luz empurra) e brilha com a cor da luz que bate
function sailMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBillow: { value: 0 }, uLight: { value: new THREE.Color(0, 0, 0) }, uDep: { value: 1 }, uShade: { value: 0 } },
    vertexShader: `uniform float uTime, uBillow; varying vec2 vUv; varying float vWave;
      void main(){
        vUv = uv;
        vec3 p = position;
        vec2 c = uv - 0.5;
        float edge = (1.0 - 4.0 * c.x * c.x) * (1.0 - 4.0 * c.y * c.y);
        float w = sin(uv.x * 9.0 + uTime * 2.3) * sin(uv.y * 7.0 - uTime * 1.7) * 0.18 + sin(uv.y * 15.0 + uTime * 4.0) * 0.05;
        p.z += edge * (uBillow * 2.4 + w * (0.25 + uBillow));
        vWave = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uLight; uniform float uTime, uDep, uShade; varying vec2 vUv; varying float vWave;
      void main(){
        vec2 c = vUv - 0.5;
        float grid = max(smoothstep(0.47, 0.5, abs(fract(vUv.x * 6.0) - 0.5)), smoothstep(0.47, 0.5, abs(fract(vUv.y * 6.0) - 0.5)));
        float rim = smoothstep(0.43, 0.5, max(abs(c.x), abs(c.y)));
        float diag = smoothstep(0.012, 0.0, abs(abs(c.x) - abs(c.y))) * 0.6;
        vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vUv.x * 0.8 + vUv.y * 0.5 + vWave * 0.8 + uTime * 0.05));
        vec3 L = uLight / (1.0 + length(uLight) * 0.6);
        vec3 base = vec3(0.07, 0.08, 0.16) + irid * 0.06;
        float sheen = 0.55 + 0.45 * sin(vUv.y * 3.0 + vWave * 4.0 + uTime * 0.6);
        vec3 lit = L * (0.35 + 0.25 * irid) * sheen;
        float hot = smoothstep(0.55, 0.0, length(c)) * 0.35;
        vec3 col = base + lit + L * hot + (grid * 0.18 + rim * 0.8 + diag) * (vec3(0.45, 0.7, 1.0) * 0.3 + L * 0.8);
        float a = 0.5 + rim * 0.4 + length(L) * 0.12;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
  });
}

function shellMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#bfe0ff') }, uA: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor * (pow(f, 3.0) * 2.5 + 0.06) * uA, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

function additive(map, color, opacity = 1) {
  return new THREE.SpriteMaterial({ map, color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// ---------- mundo ----------
export function buildWorld(renderer) {
  const T = textures();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#020308');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), skyMaterial());
  sky.renderOrder = -10;
  scene.add(sky);
  // estrelas de fundo (tamanhos e cores variados)
  {
    const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    const R = rand(11);
    for (let i = 0; i < N; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2;
      // mais estrelas perto da faixa da galáxia
      const y = R() < 0.4 ? u * 0.25 : u;
      const ss = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * ss * 8500, y * 8500, Math.sin(a) * ss * 8500], i * 3);
      const tint = R();
      const c = tint < 0.2 ? [1, 0.8, 0.6] : tint < 0.45 ? [0.7, 0.8, 1] : [1, 1, 1];
      const b = 0.35 + R() * 0.65;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      size[i] = R() < 0.03 ? 3.5 + R() * 2 : 1.2 + R() * 1.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; gl_PointSize = size; }',
      fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a, 1.0); }',
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.renderOrder = -9;
    pts.frustumCulled = false;
    scene.add(pts);
  }
  scene.add(new THREE.AmbientLight('#26304a', 0.55));
  const world = new THREE.Group();     // anda ao contrário da nave
  scene.add(world);

  return {
    scene, world, sky,
    // clarão no céu (nova): intensidade 0..1, some sozinho com decay()
    flash(v, color = [0.8, 0.9, 1.0]) { sky.material.uniforms.uFlash.value.set(color[0] * v, color[1] * v, color[2] * v); },
    decay(dt) { sky.material.uniforms.uFlash.value.multiplyScalar(Math.exp(-dt * 0.9)); },
    setTheme(name) {
      const t = THEMES[name] || THEMES.amarelo;
      sky.material.uniforms.uA.value.set(...t.a);
      sky.material.uniforms.uB.value.set(...t.b);
      sky.material.uniforms.uC.value.set(...t.c);
    },
  };
}

// ---------- sistema da fase: corpos, objetivos, efeitos ----------
export function buildSystem(game, world) {
  const T = textures();
  const group = new THREE.Group();
  const sys = game.sys;
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };
  const bodies = [];
  const lights = [];
  const sphere = keep(new THREE.SphereGeometry(1, 48, 24));
  const sphereLo = keep(new THREE.SphereGeometry(1, 20, 12));

  sys.bodies.forEach((b, i) => {
    const node = new THREE.Group();
    const R = b.r * S;
    const entry = { node, b, i, spin: 0 };
    if (b.kind === 'star') {
      const big = b.r > 10;
      const mat = keep(starSurfaceMaterial(b.color, big));
      const core = new THREE.Mesh(sphere, mat);
      core.scale.setScalar(R);
      node.add(core);
      // halo proporcional ao brilho (sprites aditivos)
      const glow = Math.sqrt(b.lum / 4000);
      const halo = new THREE.Sprite(keep(additive(T.halo, b.color, 0.9)));
      halo.scale.setScalar((big ? R * 5 : Math.max(R * 9, 420)) * Math.max(0.7, glow));
      if (big) halo.material.opacity = 0.75;
      const halo2 = new THREE.Sprite(keep(additive(T.soft, b.color, 0.35)));
      halo2.scale.setScalar(halo.scale.x * 2.6);
      const rays = new THREE.Sprite(keep(additive(T.rays, b.color, big ? 0.25 : 0.6)));
      rays.scale.setScalar(halo.scale.x * 1.7);
      for (const s of [halo2, halo, rays]) node.add(s);
      const light = new THREE.PointLight(b.color, 2.6, 0, 0);
      node.add(light);
      lights.push(light);
      Object.assign(entry, { mat, halo, halo2, rays, light, baseHalo: halo.scale.x });
    } else if (b.kind === 'comet') {
      const core = new THREE.Mesh(sphereLo, keep(new THREE.MeshStandardMaterial({ color: '#c8d6e0', roughness: 0.9, emissive: '#557788', emissiveIntensity: 0.6 })));
      core.scale.setScalar(R);
      node.add(core);
      const coma = new THREE.Sprite(keep(additive(T.soft, '#9fdfff', 0.45)));
      coma.scale.setScalar(R * 6);
      node.add(coma);
      // cauda: dois planos cruzados, apontando para longe da estrela
      const tailGeo = keep(new THREE.PlaneGeometry(1, 1));
      tailGeo.translate(0, 0.5, 0);
      const tailTex = keep(canvasTex(64, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(200,240,255,0.35)'); gr.addColorStop(1, 'rgba(220,250,255,0.9)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const gx = g.createLinearGradient(0, 0, w, 0);
        gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
      }));
      tailTex.wrapS = THREE.ClampToEdgeWrapping;
      const tailMat = keep(new THREE.MeshBasicMaterial({ map: tailTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: '#7fc8ff' }));
      const tail = new THREE.Group();
      const t1 = new THREE.Mesh(tailGeo, tailMat), t2 = new THREE.Mesh(tailGeo, tailMat);
      t2.rotation.y = Math.PI / 2;
      tail.add(t1, t2);
      tail.scale.set(R * 7, R * 110, R * 7);
      node.add(tail);
      Object.assign(entry, { tail });
    } else {
      const gas = b.kind === 'planet' && b.r >= 6;
      const tex = keep(planetTexture(b.id, b.color, gas ? 'gas' : 'rock'));
      const mat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, emissive: new THREE.Color(b.color).multiplyScalar(0.06) }));
      const ball = new THREE.Mesh(sphere, mat);
      ball.scale.setScalar(R);
      ball.rotation.z = 0.3;
      node.add(ball);
      if (b.kind === 'planet') {
        const atmo = new THREE.Sprite(keep(additive(T.soft, b.color, 0.28)));
        atmo.scale.setScalar(R * 3.0);
        node.add(atmo);
      }
      if (gas) {
        const ringTex = keep(canvasTex(256, 8, (g, w) => {
          for (let x = 0; x < w; x++) { const a = 0.15 + 0.5 * Math.abs(Math.sin(x * 0.21) * Math.sin(x * 0.047)); g.fillStyle = `rgba(230,200,160,${x < 30 ? 0 : a})`; g.fillRect(x, 0, 1, 8); }
        }));
        const ringGeo = keep(new THREE.RingGeometry(R * 1.35, R * 2.3, 96, 1));
        // uv radial para a textura do anel
        const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
        for (let k = 0; k < pos.count; k++) { const r = Math.hypot(pos.getX(k), pos.getY(k)); uv.setXY(k, (r - R * 1.35) / (R * 0.95), 0.5); }
        const ring = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: '#ffffff' })));
        ring.rotation.x = -Math.PI / 2 + 0.35;
        node.add(ring);
      }
      Object.assign(entry, { ball });
    }
    group.add(node);
    bodies.push(entry);
  });

  // ----- objetivos -----
  const goals = [];
  const torusGeo = keep(new THREE.TorusGeometry(1, 0.018, 8, 96));
  const beamGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true));
  game.goals.forEach((g, gi) => {
    const node = new THREE.Group();
    const e = { node, g, gi };
    if (g.type === 'buoy' || g.type === 'portal') {
      const R = g.r * S;
      const portal = g.type === 'portal';
      const color = portal ? '#c58bff' : '#ffd36a';
      const ringMat = keep(new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const ring = new THREE.Mesh(torusGeo, ringMat);
      ring.scale.set(R, R, R * (portal ? 3 : 1.5));
      const ring2 = new THREE.Mesh(torusGeo, ringMat);
      ring2.scale.set(R * 0.92, R * 0.92, R * 0.8);
      const yaw = new THREE.Group();
      yaw.add(ring, ring2);
      const glow = new THREE.Sprite(keep(additive(T.halo, color, 0.8)));
      glow.scale.setScalar(R * 0.5);
      const flare = new THREE.Sprite(keep(additive(T.rays, color, 0.5)));
      flare.scale.setScalar(R * 1.1);
      node.add(yaw, glow, flare);
      if (portal) {
        const disc = new THREE.Mesh(keep(new THREE.CircleGeometry(R * 0.9, 64)), keep(new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: `uniform float uTime; varying vec2 vUv;
            void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
              float s = 0.5 + 0.5 * sin(a * 5.0 + r * 14.0 - uTime * 3.0);
              vec3 col = mix(vec3(0.5, 0.25, 1.0), vec3(0.9, 0.7, 1.0), s) * (1.0 - r) * 1.4;
              gl_FragColor = vec4(col, 1.0);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })));
        yaw.add(disc);
        e.disc = disc;
      }
      Object.assign(e, { yaw, ring, ring2, ringMat, glow, flare, R });
    } else if (g.type === 'orbit') {
      // zona de órbita: anel no plano com o raio máximo
      const zoneMat = keep(new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const zone = new THREE.Mesh(keep(new THREE.RingGeometry(0.985, 1, 128)), zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.scale.setScalar(g.max * S);
      const inner = new THREE.Mesh(zone.geometry, zoneMat);
      inner.rotation.x = -Math.PI / 2;
      const bi = game.sys.index.get(g.body);
      inner.scale.setScalar(game.sys.bodies[bi].r * 1.6 * S);
      node.add(zone, inner);
      Object.assign(e, { zone, zoneMat, body: bi });
    } else if (g.type === 'deliver') {
      const bi = game.sys.index.get(g.body);
      const R = (game.sys.bodies[bi].r + g.reach) * S;
      const beamMat = keep(new THREE.MeshBasicMaterial({ color: '#8affc8', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.scale.set(R, 260, R);
      beam.position.y = 130 - 40;
      const ring = new THREE.Mesh(torusGeo, keep(new THREE.MeshBasicMaterial({ color: '#8affc8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(R, R, R * 2);
      node.add(beam, ring);
      Object.assign(e, { beam, beamMat, body: bi });
    }
    group.add(node);
    goals.push(e);
  });

  // ----- onda da nova -----
  let shell = null;
  const novaStar = sys.stars.find(s => sys.bodies[s].nova);
  if (novaStar !== undefined) {
    shell = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 48, 24)), keep(shellMaterial()));
    shell.visible = false;
    group.add(shell);
  }

  // ----- vento de partículas -----
  let wind = null;
  if (sys.wind) {
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seeds = new Float32Array(N * 2);
    const R = rand(31);
    for (let i = 0; i < N; i++) { seeds[i * 2] = R(); seeds[i * 2 + 1] = R(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = keep(new THREE.PointsMaterial({ size: 60, map: T.dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    group.add(pts);
    keep(g);
    wind = { pts, pos, col, seeds, N };
  }

  // ----- previsão no plano (pontos) -----
  const PRED = 300;
  const predGeo = keep(new THREE.BufferGeometry());
  const predPos = new Float32Array(PRED * 3), predCol = new Float32Array(PRED * 3);
  predGeo.setAttribute('position', new THREE.BufferAttribute(predPos, 3));
  predGeo.setAttribute('color', new THREE.BufferAttribute(predCol, 3));
  const predMat = keep(new THREE.PointsMaterial({ size: 6, map: T.dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const pred = new THREE.Points(predGeo, predMat);
  pred.frustumCulled = false;
  group.add(pred);

  world.add(group);

  const toW = (x, y, out) => out.set(x * S, PLANE_Y, -y * S);
  const tmp = new THREE.Vector3();

  return {
    group, lights,
    // P = posições dos corpos (u), sx, sy = nave (u), t = tempo do jogo
    update(P, sx, sy, t, dt) {
      // o mundo anda ao contrário da nave
      world.position.set(-sx * S, 0, sy * S);
      for (const e of bodies) {
        const x = P[e.i * 2], y = P[e.i * 2 + 1];
        toW(x, y, e.node.position);
        if (e.b.kind === 'star') {
          e.mat.uniforms.uTime.value = t;
          const boost = sys.lumAt(e.i, t) / e.b.lum;
          e.mat.uniforms.uBoost.value = Math.min(2.5, boost);
          e.halo.scale.setScalar(e.baseHalo * (1 + (boost - 1) * 0.35) * (1 + Math.sin(t * 1.3 + e.i) * 0.015));
          e.halo2.scale.setScalar(e.halo.scale.x * 2.6);
          e.rays.material.rotation = t * 0.02 * (e.i % 2 ? -1 : 1);
          e.light.intensity = 2.6 * Math.min(3, boost);
        } else if (e.b.kind === 'comet') {
          // cauda para longe da estrela mais forte
          let bx = 0, by = 0, best = -1;
          for (const s of sys.stars) { const dx = x - P[s * 2], dy = y - P[s * 2 + 1], w = sys.bodies[s].lum / (dx * dx + dy * dy); if (w > best) { best = w; bx = dx; by = dy; } }
          const L = Math.hypot(bx, by) || 1;
          tmp.set(bx / L, 0, -by / L);
          e.tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp);
        } else if (e.ball) e.ball.rotation.y += dt * 0.05;
      }
      // objetivos
      const gi = game.goalIdx;
      for (const e of goals) {
        const g = e.g;
        const active = e.gi === gi, future = e.gi > gi;
        e.node.visible = active || (future && (g.type === 'buoy' || g.type === 'portal')) ;
        if (!e.node.visible) continue;
        if (g.type === 'buoy' || g.type === 'portal') {
          toW(g.x, g.y, e.node.position);
          // o anel vira para a nave (dá para passar por dentro de qualquer lado)
          const dx = sx - g.x, dy = sy - g.y;
          e.yaw.rotation.y = Math.atan2(dx, -dy);
          const pulse = active ? 0.75 + 0.25 * Math.sin(t * 4) : 0.25;
          e.ringMat.opacity = pulse;
          e.ringMat.color.set(g.type === 'portal' ? '#c58bff' : active ? '#ffd36a' : '#7fc8ff');
          e.glow.material.opacity = active ? 0.9 : 0.3;
          e.flare.material.opacity = active ? 0.55 : 0.12;
          e.flare.material.rotation = t * 0.1;
          e.ring2.rotation.z = t * 0.4;
          if (e.disc) e.disc.material.uniforms.uTime.value = t;
        } else {
          const x = P[e.body * 2], y = P[e.body * 2 + 1];
          toW(x, y, e.node.position);
          if (e.zoneMat) e.zoneMat.opacity = 0.35 + 0.25 * Math.sin(t * 3) + (game.goal?.hold > 0 ? 0.3 : 0);
          if (e.beamMat) e.beamMat.opacity = 0.16 + 0.08 * Math.sin(t * 5);
        }
      }
      // onda da nova
      if (shell) {
        const rs = sys.shellRadius(novaStar, t);
        shell.visible = rs > 0;
        if (rs > 0) { toW(P[novaStar * 2], P[novaStar * 2 + 1], shell.position); shell.scale.setScalar(rs * S); }
      }
      // vento: partículas saem da estrela; brilham onde o braço da espiral está passando
      if (wind) {
        const w = sys.wind, si = w.star;
        const cx = P[si * 2], cy = P[si * 2 + 1], R0 = sys.bodies[si].r * 1.1;
        for (let k = 0; k < wind.N; k++) {
          const a = wind.seeds[k * 2] * Math.PI * 2;
          const life = (wind.seeds[k * 2 + 1] + t * 0.05) % 1;
          const r = R0 + life * 320;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          const th = a - w.omega * t - r * (w.twist || 0);
          const gg = Math.max(0, Math.cos(w.arms * th)) ** 4 * (1 - life) * Math.min(1, life * 8);
          wind.pos[k * 3] = x * S; wind.pos[k * 3 + 1] = PLANE_Y + Math.sin(k * 12.9898) * 140 * life; wind.pos[k * 3 + 2] = -y * S;
          wind.col[k * 3] = 1.0 * gg; wind.col[k * 3 + 1] = 0.6 * gg; wind.col[k * 3 + 2] = 0.4 * gg;
        }
        wind.pts.geometry.attributes.position.needsUpdate = true;
        wind.pts.geometry.attributes.color.needsUpdate = true;
      }
    },
    // pontos da previsão (u); hit = bateu no fim
    setPrediction(pts, n, hit) {
      for (let k = 0; k < PRED; k++) {
        if (k < n) {
          predPos[k * 3] = pts[k * 2] * S; predPos[k * 3 + 1] = PLANE_Y; predPos[k * 3 + 2] = -pts[k * 2 + 1] * S;
          const f = (1 - k / PRED) * Math.min(1, k / 25);   // perto da nave some (fica embaixo da gôndola)
          const red = hit !== -1 && k > n - 12;
          predCol[k * 3] = red ? 1 : 0.55 * f + 0.15; predCol[k * 3 + 1] = red ? 0.25 : 0.85 * f + 0.1; predCol[k * 3 + 2] = red ? 0.2 : 1.0 * f + 0.2;
        } else { predPos[k * 3 + 1] = -1e6; }
      }
      predGeo.attributes.position.needsUpdate = true;
      predGeo.attributes.color.needsUpdate = true;
      predGeo.setDrawRange(0, n);
    },
    dispose() {
      world.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  };
}

// ---------- gôndola, vela, barra, cordame ----------
export function buildShip() {
  const T = textures();
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#4a5470', roughness: 0.5, metalness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a25a', roughness: 0.45, metalness: 0.35, emissive: '#3a2a10', emissiveIntensity: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#7fd8ff' });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a2a', roughness: 0.8 });
  // piso e casco
  // piso com uma rosa dos ventos que brilha de leve
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3b2a22'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#43302a' : '#36261f'; g.fillRect(0, i * h / 18, w, h / 18 - 2); }
    g.translate(w / 2, h / 2);
    g.strokeStyle = '#7fd8ff'; g.lineWidth = 3;
    for (const r of [0.46, 0.3]) { g.beginPath(); g.arc(0, 0, w * r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(127,216,255,0.85)';
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, L = w * (k % 2 ? 0.26 : 0.42);
      g.beginPath(); g.moveTo(Math.cos(a) * L, Math.sin(a) * L);
      g.lineTo(Math.cos(a + 0.12) * w * 0.06, Math.sin(a + 0.12) * w * 0.06); g.lineTo(Math.cos(a - 0.12) * w * 0.06, Math.sin(a - 0.12) * w * 0.06);
      g.closePath(); g.fill();
    }
  });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, emissive: '#ffffff', emissiveMap: floorTex, emissiveIntensity: 0.25 });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 40), [wood, floorMat, wood]);
  floor.position.y = -0.04;
  group.add(floor);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1.2, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal);
  hull.scale.y = 0.75;
  hull.position.y = -0.08;
  group.add(hull);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.03, 8, 64), glowMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.06;
  group.add(rim);
  // grade
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.025, 8, 64), brass);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 1.0;
  group.add(rail);
  const rail2 = rail.clone();
  rail2.position.y = 0.55;
  rail2.scale.setScalar(1.0);
  group.add(rail2);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 8), brass);
    post.position.set(Math.cos(a) * 1.1, 0.5, Math.sin(a) * 1.1);
    group.add(post);
  }
  // pedestal do mapa
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.82, 12), brass);
  ped.position.set(0, 0.41, -0.55);
  group.add(ped);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.04, 48), metal);
  plate.position.set(0, 0.86, -0.55);
  plate.rotation.x = 0.35;
  group.add(plate);
  // lanternas
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Sprite(additive(T.soft, '#ffcf8a', 0.55));
    lamp.scale.setScalar(0.22);
    lamp.position.set(sx * 0.78, 1.08, 0.78);
    group.add(lamp);
  }
  // mastro curto atrás e luz interna
  const lampLight = new THREE.PointLight('#ffcf9a', 0.9, 4, 1.5);
  lampLight.position.set(0, 1.6, 0.6);
  group.add(lampLight);

  // ----- vela -----
  const sailGroup = new THREE.Group();     // pivô no centro da vela
  sailGroup.position.copy(SAIL_C);
  sailGroup.rotation.order = 'YXZ';
  const sailMat = sailMaterial();
  const membrane = new THREE.Mesh(new THREE.PlaneGeometry(SAIL_SIZE, SAIL_SIZE, 28, 28), sailMat);
  const furlPivot = new THREE.Group();     // recolher: a vela sobe e se fecha na verga de cima
  furlPivot.position.y = SAIL_SIZE / 2;
  membrane.position.y = -SAIL_SIZE / 2;
  furlPivot.add(membrane);
  sailGroup.add(furlPivot);
  const sparMat = new THREE.MeshBasicMaterial({ color: '#d9b26a' });
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, SAIL_SIZE * 1.04, 10), sparMat);
  spar.rotation.z = Math.PI / 2;
  spar.position.y = SAIL_SIZE / 2;
  const spar2 = spar.clone();
  spar2.position.y = -SAIL_SIZE / 2;
  sailGroup.add(spar, spar2);
  const sparGlow = new THREE.Sprite(additive(T.soft, '#ffe2a0', 0.0));
  sparGlow.scale.setScalar(SAIL_SIZE * 1.9);
  sailGroup.add(sparGlow);
  group.add(sailGroup);

  // ----- barra (retranca) e cordame -----
  const bar = new THREE.Group();
  const barRod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 10), brass);
  barRod.rotation.z = Math.PI / 2;
  bar.add(barRod);
  for (const sx of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10), wood);
    grip.rotation.z = Math.PI / 2;
    grip.position.x = sx * 0.3;
    bar.add(grip);
  }
  const barGlow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), glowMat);
  barGlow.rotation.y = Math.PI / 2;
  bar.add(barGlow);
  group.add(bar);
  const rigGeo = new THREE.BufferGeometry();
  const rigPos = new Float32Array(4 * 3);
  rigGeo.setAttribute('position', new THREE.BufferAttribute(rigPos, 3));
  const rigging = new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.55 }));
  rigging.frustumCulled = false;
  group.add(rigging);

  // marcador da visão de cima (só aparece nela): brilho e a linha da vela
  const topMark = new THREE.Group();
  const topGlow = new THREE.Sprite(additive(T.halo, '#ffffff', 0.9));
  topGlow.scale.setScalar(1);
  const topSail = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12), new THREE.MeshBasicMaterial({ color: '#ffe9a8', side: THREE.DoubleSide }));
  topSail.rotation.x = -Math.PI / 2;
  const topSailPivot = new THREE.Group();
  topSailPivot.add(topSail);
  topMark.add(topGlow, topSailPivot);
  topMark.position.y = PLANE_Y;
  topMark.visible = false;
  group.add(topMark);

  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  return {
    group, bar, sailGroup, sailMat, membrane,
    // visão de cima: tamanho do marcador (m) e ângulo da vela
    setTopMark(on, size, ang, dep) {
      topMark.visible = on;
      if (!on) return;
      topGlow.scale.setScalar(size * 1.4);
      topSailPivot.rotation.y = ang + Math.PI / 2;
      topSail.scale.set(size * 2.2 * Math.max(0.2, dep), size, 1);
    },
    // ang = normal da vela no mapa (rad); tilt (rad); dep 0..1; light: cor da luz que bate (Color)
    setSail(ang, tilt, dep, light, billow, shade, t) {
      // normal no 3D: mapa (cos, sin) -> (cos, 0, -sin)
      const nx = Math.cos(ang), nz = -Math.sin(ang);
      sailGroup.rotation.y = Math.atan2(nx, nz);
      sailGroup.rotation.x = -tilt;
      const d = Math.max(0.04, dep);
      furlPivot.scale.set(0.35 + 0.65 * d, d, 1);
      sailMat.uniforms.uTime.value = t;
      sailMat.uniforms.uBillow.value = billow;
      sailMat.uniforms.uLight.value.copy(light);
      sailMat.uniforms.uDep.value = dep;
      sailMat.uniforms.uShade.value = shade;
      sparGlow.material.opacity = Math.min(0.5, (light.r + light.g + light.b) * 0.12) * dep;
      sparGlow.material.color.copy(light).multiplyScalar(0.6).addScalar(0.1);
    },
    // barra: centro c e direção s (espaço da gôndola)
    setBar(c, s, roll = 0) {
      bar.position.copy(c);
      bar.quaternion.setFromUnitVectors(_a.set(1, 0, 0), _b.copy(s).normalize());
      bar.rotateX(roll);
      // cordame: das pontas da barra até os cantos de baixo da vela
      sailGroup.updateMatrix();
      // cada ponta da barra liga no canto de baixo da vela que fica do mesmo lado (sem cruzar)
      const c0 = _b.set(-SAIL_SIZE / 2, -SAIL_SIZE / 2, 0).applyMatrix4(sailGroup.matrix).clone();
      const c1 = _b.set(SAIL_SIZE / 2, -SAIL_SIZE / 2, 0).applyMatrix4(sailGroup.matrix).clone();
      const left = _a.copy(s).normalize().multiplyScalar(-0.34).add(c).clone();
      const right = _a.copy(s).normalize().multiplyScalar(0.34).add(c).clone();
      const swap = left.distanceToSquared(c0) + right.distanceToSquared(c1) > left.distanceToSquared(c1) + right.distanceToSquared(c0);
      const [cl, cr] = swap ? [c1, c0] : [c0, c1];
      rigPos.set([left.x, left.y, left.z, cl.x, cl.y, cl.z, right.x, right.y, right.z, cr.x, cr.y, cr.z]);
      rigGeo.attributes.position.needsUpdate = true;
    },
  };
}
