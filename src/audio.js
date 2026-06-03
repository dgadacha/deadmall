// Audio procédural — aucun asset. Drone d'ambiance + SFX + battement de cœur + grognements.

let actx = null;
let noiseBuf = null;
let droneStarted = false;

export function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const len = actx.sampleRate * 0.5;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random()*2 - 1;
  if (!droneStarted) { startDrone(); droneStarted = true; }
}

// drone basse fréquence continu — ambiance horreur
function startDrone() {
  const o1 = actx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 41;
  const o2 = actx.createOscillator(); o2.type = 'sine';     o2.frequency.value = 55;
  const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320;
  const g = actx.createGain(); g.gain.value = 0.055;
  const lfo = actx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.11;
  const lfoG = actx.createGain(); lfoG.gain.value = 0.025;
  lfo.connect(lfoG).connect(g.gain);
  o1.connect(filter); o2.connect(filter); filter.connect(g).connect(actx.destination);
  o1.start(); o2.start(); lfo.start();
}

function blip({ freq=440, type='square', dur=0.1, vol=0.3, slideTo=null } = {}) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}

function noise({ dur=0.1, vol=0.3, hp=600 } = {}) {
  if (!actx) return;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const g = actx.createGain();
  const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  s.connect(f).connect(g).connect(actx.destination);
  s.start(); s.stop(actx.currentTime + dur);
}

export const sfx = {
  pistol:  () => { noise({dur:0.08, vol:0.35, hp:900}); blip({freq:220, slideTo:60, type:'square', dur:0.09, vol:0.25}); },
  shotgun: () => { noise({dur:0.18, vol:0.5,  hp:300}); blip({freq:120, slideTo:40, type:'sawtooth', dur:0.18, vol:0.3}); },
  hit:     () => blip({freq:1200, type:'square', dur:0.03, vol:0.15}),
  zdeath:  () => { noise({dur:0.25, vol:0.3, hp:200}); blip({freq:90, slideTo:30, type:'sawtooth', dur:0.3, vol:0.2}); },
  hurt:    () => { noise({dur:0.2, vol:0.4, hp:150}); blip({freq:160, slideTo:50, type:'sawtooth', dur:0.2, vol:0.25}); },
  reload:  () => { blip({freq:300, type:'square', dur:0.04, vol:0.2});
                   setTimeout(() => blip({freq:500, type:'square', dur:0.04, vol:0.2}), 140); },
  buy:     () => { blip({freq:600, type:'square', dur:0.07, vol:0.25});
                   setTimeout(() => blip({freq:900, type:'square', dur:0.1, vol:0.25}), 80); },
  nope:    () => blip({freq:140, type:'square', dur:0.12, vol:0.25}),
  wave:    () => blip({freq:80, type:'sawtooth', dur:0.55, vol:0.32, slideTo:30}),
  blackout:() => { noise({dur:0.6, vol:0.35, hp:60}); blip({freq:55, slideTo:20, type:'sawtooth', dur:0.7, vol:0.3}); },
  heart:   () => {
    if (!actx) return;
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
    const g = actx.createGain();
    g.gain.setValueAtTime(0, actx.currentTime);
    g.gain.linearRampToValueAtTime(0.45, actx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.18);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.18);
  },
  distantGrunt: () => {
    noise({dur:0.45, vol:0.12, hp:80});
    blip({freq:70, slideTo:48, type:'sawtooth', dur:0.5, vol:0.08});
  },
};
