
//postavke
const CFG = {
  bins: 1024,      
  barsCount: 48,    
  dbMin: -60,        
  dbMax: 0,
  specW: 640,        
  specH: 256,
  axisMargin: 16
};

let song = null;
let fft  = null;
let view = 'bars';            // 'bars' | 'line' | 'spectrogram' | 'scope' | 'circular'
let specG;                    
let currentName = null;

let smoothUI = 0.85;         
let prevSpec = null;          
let prevWave = null;         

const $ = (sel) => document.querySelector(sel);

//Učitavanje pjesama (iz /songs/ + ručni upload)
async function buildButtonsFromDir() {
  const box = $('#songButtons');
  if (!box) return;
  box.innerHTML = '';
  try {
    const res = await fetch('songs/');
    if (!res.ok) throw new Error('no listing');
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && h.toLowerCase().endsWith('.mp3'))
      .map(h => decodeURIComponent(h.replace(/^\.?\//,'')));

    if (!links.length) {
      box.innerHTML = '<em style="color:#9aa0aa">Nema .mp3 u /songs. Dodaj datoteke ili koristi “+ Dodaj .mp3”.</em>';
      return;
    }
    links.forEach(file => {
      const full = `songs/${file}`;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = file;
      btn.onclick = () => pickSong(full, file, btn);
      box.appendChild(btn);
    });
  } catch {
    box.innerHTML = '<em style="color:#9aa0aa">Directory listing nije dostupan — koristi “+ Dodaj .mp3”.</em>';
  }
}

async function pickSong(pathOrBlobUrl, displayName, btnEl) {
  try {
    if (typeof getAudioContext === 'function') {
      const ac = getAudioContext();
      if (ac && ac.state !== 'running') await ac.resume();
    }

    if (song) { song.stop(); song.dispose(); song = null; }
    document.querySelectorAll('#songButtons .btn').forEach(b=>b.classList.remove('playing'));
    if (btnEl) btnEl.classList.add('playing');
    currentName = displayName;
    updateNowPlaying();

    loadSound(pathOrBlobUrl, (snd) => {
      song = snd;
      rebuildFFT();         
      loop();
      song.play();
    }, (err) => {
      console.error('Load error:', err);
      alert('Ne mogu učitati: ' + displayName);
    });
  } catch (e) { console.error(e); }
}

function updateNowPlaying() {
  const el = $('#nowPlaying');
  if (!el) return;
  el.textContent = 'NOW PLAYING: ' + (currentName || '—');
}

window.addEventListener('DOMContentLoaded', () => {
  buildButtonsFromDir();

  const picker = $('#filePicker');
  if (picker) {
    picker.addEventListener('change', (ev) => {
      const files = [...ev.target.files].filter(f => f.type.startsWith('audio') || f.name.toLowerCase().endsWith('.mp3'));
      const box = $('#songButtons');
      for (const f of files) {
        const url = URL.createObjectURL(f);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = f.name;
        btn.onclick = () => pickSong(url, f.name, btn);
        box.appendChild(btn);
      }
    });
  }

  const modeBtn = $('#modeToggle');
  if (modeBtn) modeBtn.addEventListener('click', cycleView);

  // Smoothing slider
  const sld = $('#smoothSlider');
  const out = $('#smoothVal');
  if (sld && out) {
    out.textContent = Number(sld.value).toFixed(2);
    sld.addEventListener('input', () => {
      smoothUI = Number(sld.value);
      out.textContent = smoothUI.toFixed(2);
      rebuildFFT();    
    });
  }
});

function setup() {
  const wrap = document.querySelector('.canvasWrap') || document.body;
  const c = createCanvas(window.innerWidth, window.innerHeight - 56);
  c.parent(wrap);
  angleMode(RADIANS);
  strokeJoin(ROUND); strokeCap(ROUND);
  noFill();

  rebuildFFT();

  specG = createGraphics(CFG.specW, CFG.specH);
  specG.colorMode(HSB, 255);
}

function rebuildFFT() {
  fft = new p5.FFT(smoothUI, CFG.bins);
  if (song) fft.setInput(song);

  prevSpec = null;
  prevWave = null;
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight - 56);
}

function draw() {
  background(0);

  if (!song || !fft) {
    drawCenteredHint('Odaberi pjesmu iznad (ili dodaj .mp3) — tipka V mijenja prikaz , Space = Play/Pause');
    return;
  }

  switch (view) {
    case 'bars':         drawSpectrumBars();        break;
    case 'line':         drawSpectrumLine();        break;
    case 'spectrogram':  drawSpectrogram();         break;
    case 'scope':        drawScope();               break;
    case 'circular':     drawCircularWaveform();    break;
  }
}

function mousePressed() {
  if (typeof getAudioContext === 'function') {
    const ac = getAudioContext();
    if (ac && ac.state !== 'running') ac.resume();
  }
}

function keyPressed() {
  if (key === 'V' || key === 'v') cycleView();
  if (key === ' ') togglePlayPause();
}

function togglePlayPause() {
  if (!song) return;
  if (song.isPlaying()) { song.pause(); noLoop(); }
  else {
    if (typeof getAudioContext === 'function') {
      const ac = getAudioContext();
      if (ac && ac.state !== 'running') ac.resume();
    }
    song.play(); loop();
  }
}

function cycleView() {
  const order = ['bars','line','spectrogram','scope','circular'];
  const i = order.indexOf(view);
  view = order[(i + 1) % order.length];
  const btn = $('#modeToggle');
  if (btn) btn.textContent = view.charAt(0).toUpperCase() + view.slice(1);
}

//prikazi

// Bars s EMA kroz frameove
function drawSpectrumBars() {
  const raw  = fft.analyze(CFG.bins);     
  const spec = smoothArray(raw, 'spec'); 

  const bands = CFG.barsCount;
  const nyq = sampleRate() / 2;

  const bins = new Array(bands).fill(0);
  const wts  = new Array(bands).fill(0);

  for (let i = 1; i < spec.length; i++) {
    const f = i * nyq / (spec.length - 1);
    const t = Math.log10(Math.max(1, f)) / Math.log10(nyq);
    let b = Math.floor(t * bands);
    b = constrain(b, 0, bands - 1);
    bins[b] += spec[i] * i;
    wts[b]  += i;
  }

  const margin = CFG.axisMargin;
  const W = width  - margin*2;
  const H = height - margin*3 - 60;
  const barW = W / bands;

  noStroke();
  for (let b = 0; b < bands; b++) {
    const v  = wts[b] ? (bins[b]/wts[b]) : 0;
    const db = map(v, 0, 255, CFG.dbMin, CFG.dbMax);
    const h  = constrain((db - CFG.dbMin) / (CFG.dbMax - CFG.dbMin), 0, 1);
    const x = margin + b * barW;
    const y = height - margin - h*H;
    fill(149, 202, 255);
    rect(x, y, barW * 0.9, h*H, 5);
  }
  drawFreqRuler(20, 20000, margin, height - margin, W);
}

// Line s EMA
function drawSpectrumLine() {
  const raw = fft.analyze(CFG.bins);
  const s   = smoothArray(raw, 'spec');

  const margin = CFG.axisMargin;
  const y0 = height - margin, y1 = 100 + margin;

  noFill(); stroke(180, 220, 200); strokeWeight(2);
  beginShape();
  for (let i = 1; i < s.length; i++) {
    const f = indexToFreq(i, s.length);
    const x = mapLog(f, 20, 20000, margin, width - margin);
    const db = map(s[i], 0, 255, CFG.dbMin, CFG.dbMax);
    const v  = constrain((db - CFG.dbMin) / (CFG.dbMax - CFG.dbMin), 0, 1);
    const y  = y0 - v * (y0 - y1);
    vertex(x, y);
  }
  endShape();
  drawFreqRuler(20, 20000, margin, y0, width - 2*margin);
}



// Spectrogram (scroll u lijevo).
function drawSpectrogram() {
  const s = fft.analyze(512);
  specG.copy(specG, 1, 0, specG.width - 1, specG.height, 0, 0, specG.width - 1, specG.height);

  specG.loadPixels();
  for (let y = 0; y < specG.height; y++) {
    const t = 1 - y/specG.height;
    const idx = Math.floor(Math.pow(t, 3.0) * (s.length - 1));
    const val = s[idx]; // 0..255
    const col = color(val, 180, 255 - val/2);
    specG.set(specG.width - 1, y, col);
  }
  specG.updatePixels();

  const margin = CFG.axisMargin;
  image(specG, margin, 100, width - 2*margin, height - 160);
  drawFreqRuler(20, 20000, margin, height - margin, width - 2*margin);
}

// Scope (vremenska domena) s EMA
function drawScope() {
  const raw  = fft.waveform();
  const wave = smoothArray(raw, 'wave');

  const margin = CFG.axisMargin;
  const x0 = margin, x1 = width - margin;
  const y0 = 100 + margin, y1 = height - margin;

  stroke(120); strokeWeight(1); noFill();
  rect(x0, y0, x1-x0, y1-y0);

  stroke(170, 160, 255); strokeWeight(2);
  noFill(); beginShape();
  for (let i = 0; i < wave.length; i++) {
    const x = map(i, 0, wave.length-1, x0, x1);
    const y = map(wave[i], 1, -1, y0, y1);
    vertex(x, y);
  }
  endShape();
}

// Circular (polarni val + debljina ovisna o basu)
function drawCircularWaveform() {
  const raw  = fft.waveform();
  const wave = smoothArray(raw, 'wave');

  const bass = fft.getEnergy(20, 200) / 255;
  const cx = width/2, cy = height/2 + 20;
  const R  = 0.28 * Math.min(width, height);

  stroke(255); strokeWeight( lerp(2, 10, bass) );
  noFill(); beginShape();
  for (let i = 0; i < wave.length; i++) {
    const a = (i / (wave.length-1)) * TWO_PI;
    const r = R + wave[i] * R * 0.45;
    vertex(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  endShape(CLOSE);
}

//pomoćne stvari

function smoothArray(arr, kind) {
  const alpha = 1 - smoothUI; 
  if (kind === 'spec') {
    if (!prevSpec || prevSpec.length !== arr.length) prevSpec = new Array(arr.length).fill(0);
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = alpha * arr[i] + (1 - alpha) * prevSpec[i];
    prevSpec = out;
    return out;
  } else {
    if (!prevWave || prevWave.length !== arr.length) prevWave = new Array(arr.length).fill(0);
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = alpha * arr[i] + (1 - alpha) * prevWave[i];
    prevWave = out;
    return out;
  }
}

function drawCenteredHint(t) {
  push();
  noStroke(); fill(255); textAlign(CENTER, CENTER);
  textSize(Math.min(24, width * 0.03));
  text(t, width/2, height/2);
  pop();
}

function mapLog(f, fmin, fmax, xmin, xmax) {
  const lf = Math.log10(Math.max(fmin, Math.min(fmax, f)));
  const a = (lf - Math.log10(fmin)) / (Math.log10(fmax) - Math.log10(fmin));
  return xmin + a * (xmax - xmin);
}

function indexToFreq(i, N) {
  const nyq = sampleRate() / 2;
  return i * nyq / (N - 1);
}

function drawFreqRuler(fmin, fmax, x, y, W) {
  push();
  stroke(90); strokeWeight(1);
  line(x, y, x+W, y);
  noStroke(); fill(160); textAlign(CENTER, TOP); textSize(12);

  const marks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  for (const f of marks) {
    const xx = mapLog(f, fmin, fmax, x, x+W);
    stroke(90); line(xx, y, xx, y-6);
    noStroke(); fill(160);
    const label = (f >= 1000) ? (f/1000)+'k' : String(f);
    text(label, xx, y+4);
  }
  pop();
}
