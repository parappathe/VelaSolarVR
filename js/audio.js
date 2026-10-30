// Sons sintetizados na hora (sem arquivos): zumbido da vela que sobe com a força da luz, ambiente
// espacial (acorde lento e um sopro grave), e avisos: contagem, largada, boia, órbita, entrega,
// recolher/abrir a vela, sombra, cometa passando, nova, vitória e derrota. Só começa depois de um
// clique ou da entrada no VR (regra do navegador). Os testes nunca carregam este arquivo.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.theme = 'amarelo'; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.75 : 0;
      this.master.connect(this.ctx.destination);
      this.startHum();
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.75 : 0, this.ctx.currentTime, 0.05);
  }

  noiseBuffer(sec, brown = 0.97) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = brown * b + (1 - brown) * (Math.random() * 2 - 1); d[i] = b * 4 + (Math.random() * 2 - 1) * 0.15; }
    return buf;
  }

  // zumbido da vela: duas serras desafinadas num passa-banda + chiado fino (a luz batendo)
  startHum() {
    const c = this.ctx;
    this.humGain = c.createGain(); this.humGain.gain.value = 0;
    this.humFilter = c.createBiquadFilter(); this.humFilter.type = 'bandpass'; this.humFilter.frequency.value = 500; this.humFilter.Q.value = 2.5;
    this.humFilter.connect(this.humGain); this.humGain.connect(this.master);
    this.humOsc = [];
    for (const [f, type] of [[110, 'sawtooth'], [110.7, 'sawtooth'], [220.4, 'triangle']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(this.humFilter); o.start();
      this.humOsc.push(o);
    }
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer(2, 0.3); src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    this.hissGain = c.createGain(); this.hissGain.gain.value = 0;
    src.connect(f); f.connect(this.hissGain); this.hissGain.connect(this.master); src.start();
  }

  // ambiente: acorde de senos bem baixo que respira devagar + sopro grave
  startAmbient() {
    const c = this.ctx;
    this.amb = c.createGain(); this.amb.gain.value = 0.0;
    this.amb.connect(this.master);
    this.pad = [];
    for (const f of [55, 82.4, 110, 164.8, 246.9]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.05;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lg = c.createGain(); lg.gain.value = 0.035;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      o.connect(g); g.connect(this.amb); o.start();
      this.pad.push(o);
    }
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer(4, 0.995); src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = c.createGain(); g.gain.value = 0.18;
    src.connect(f); f.connect(g); g.connect(this.amb); src.start();
    this.amb.gain.setTargetAtTime(0.5, c.currentTime, 2);
  }

  setTheme(name) {
    this.theme = name;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sets = { amarelo: [55, 82.4, 110, 164.8, 246.9], dupla: [49, 73.4, 98, 146.8, 220], gigante: [41.2, 61.7, 82.4, 123.5, 185] };
    (sets[name] || sets.amarelo).forEach((f, i) => this.pad[i]?.frequency.setTargetAtTime(f, t, 1.5));
  }

  // força: 0..1 (luz relativa); dep: vela aberta 0..1
  setSail(force, dep) {
    if (!this.humGain) return;
    const t = this.ctx.currentTime, s = Math.min(1, force);
    this.humGain.gain.setTargetAtTime((0.015 + 0.13 * s) * dep, t, 0.08);
    this.humFilter.frequency.setTargetAtTime(260 + 1300 * s, t, 0.1);
    const base = 92 + 70 * s;
    this.humOsc[0].frequency.setTargetAtTime(base, t, 0.15);
    this.humOsc[1].frequency.setTargetAtTime(base * 1.007, t, 0.15);
    this.humOsc[2].frequency.setTargetAtTime(base * 2.003, t, 0.15);
    this.hissGain.gain.setTargetAtTime(0.03 * s * dep, t, 0.1);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005, pan = 0 } = {}) {
    const c = this.ctx;
    if (!c) return null;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(g, pan);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  out(node, pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p); p.connect(this.master);
    } else node.connect(this.master);
  }
  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', sweep = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  click() { this.tone(1320, 0.05, { vol: 0.06, type: 'triangle' }); }
  tick(n) { this.tone(n === 1 ? 880 : 660, 0.18, { vol: 0.09, type: 'triangle' }); }
  go() { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.5, { vol: 0.08, type: 'triangle', at: i * 0.06 })); }
  furl(closing) { this.noise(0.45, { vol: 0.12, freq: closing ? 2400 : 700, sweep: closing ? 0.3 : 3.5, q: 0.8 }); }
  buoy() {
    // sino de vidro: parciais inarmônicas
    for (const [f, v, d] of [[1046, 0.1, 1.4], [1046 * 2.76, 0.04, 0.9], [1046 * 5.4, 0.02, 0.5]]) this.tone(f, d, { vol: v, attack: 0.002 });
    this.tone(1568, 1.2, { vol: 0.05, at: 0.1, attack: 0.002 });
  }
  orbitTick() { this.tone(1760, 0.12, { vol: 0.035, type: 'sine' }); }
  goal() { [659, 880, 1108, 1318].forEach((f, i) => this.tone(f, 0.6, { vol: 0.07, type: 'triangle', at: i * 0.09 })); }
  shade(enter) { this.noise(0.8, { vol: 0.08, freq: enter ? 900 : 300, sweep: enter ? 0.25 : 3, q: 0.6, type: 'lowpass' }); }
  comet() { this.noise(1.6, { vol: 0.16, freq: 3000, sweep: 0.15, q: 1.2 }); }
  nova() {
    this.tone(55, 3.5, { vol: 0.35, type: 'sawtooth', slide: 0.5, attack: 0.02 });
    this.noise(3.0, { vol: 0.4, freq: 2000, sweep: 0.08, q: 0.5, type: 'lowpass' });
    this.tone(1400, 2.0, { vol: 0.05, slide: 0.3, attack: 0.01 });
  }
  win() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => { this.tone(f, 0.9, { vol: 0.08, type: 'triangle', at: i * 0.12 }); this.tone(f * 1.5, 0.7, { vol: 0.03, at: i * 0.12 + 0.05 }); });
  }
  lose(kind) {
    if (kind === 'crash' || kind === 'burn') this.noise(1.2, { vol: 0.35, freq: 600, sweep: 0.2, q: 0.7, type: 'lowpass' });
    this.tone(392, 0.6, { vol: 0.1, type: 'sawtooth', slide: 0.6 });
    this.tone(294, 0.9, { vol: 0.08, type: 'sawtooth', at: 0.3, slide: 0.5 });
  }
  star(n) { this.tone(1046 * (1 + n * 0.26), 0.35, { vol: 0.09, type: 'triangle' }); }
}
