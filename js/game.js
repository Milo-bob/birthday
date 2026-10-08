(function () {
  'use strict';

  // ---- Einstellungen ----
  var NAME = 'Paps';              // Name im Endbildschirm

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('overlay');
  var titleEl = document.getElementById('title');
  var textEl = document.getElementById('text');
  var startBtn = document.getElementById('start');
  var muteBtn = document.getElementById('mute');

  var W = 800, H = 450, S = 1, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var pw = window.innerWidth, ph = window.innerHeight;
    canvas.width = Math.round(pw * DPR);
    canvas.height = Math.round(ph * DPR);
    S = Math.min(pw, ph) / 440;          // Logische Einheiten pro CSS-Pixel
    W = pw / S; H = ph / S;
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Audio ----
  var actx = null, muted = false;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type, vol) {
    var a = audio(); if (!a || muted) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'triangle'; o.frequency.value = freq;
    var t = a.currentTime + (start || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol) {
    var a = audio(); if (!a || muted) return;
    var n = a.sampleRate * dur, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), g = a.createGain();
    g.gain.value = vol || 0.3; s.buffer = b; s.connect(g); g.connect(a.destination); s.start();
  }
  var NOTE = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3 };
  function melody() {
    // "Happy Birthday to you" (C-Dur)
    var m = [['G4', .35], ['G4', .15], ['A4', .5], ['G4', .5], ['C5', .5], ['B4', 1],
             ['G4', .35], ['G4', .15], ['A4', .5], ['G4', .5], ['D4', .5], ['C5', 1]];
    var t = 0;
    m.forEach(function (n) { tone(NOTE[n[0]] * (n[0] === 'D4' ? 2 : 1), t, n[1] * 0.9, 'triangle', 0.18); t += n[1]; });
  }
  muteBtn.addEventListener('click', function () { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; });

  // ---- Eingabe: nipplejs + Tastatur ----
  var joy = { x: 0, y: 0 }, keys = {};
  var manager = null;
  try {
    manager = nipplejs.create({
      zone: document.getElementById('zone'),
      mode: 'dynamic',
      color: '#ffffff',
      size: 120,
      fadeTime: 150
    });
    manager.on('move', function (e, data) {
      if (!data.vector) return;
      var f = Math.min(data.distance / 60, 1);
      joy.x = data.vector.x * f; joy.y = -data.vector.y * f;  // nipplejs: y nach oben
    });
    manager.on('start', function () { aiming = true; });
    manager.on('end', function () {
      var l = Math.hypot(joy.x, joy.y);
      if (l > 0.05) released = { x: joy.x, y: joy.y, power: Math.min(1, l) };
      aiming = false; joy.x = joy.y = 0;
    });
  } catch (e) {}
  window.addEventListener('keydown', function (e) { keys[e.key.toLowerCase()] = true; if (e.key.indexOf('Arrow') === 0) e.preventDefault(); });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  function input() {
    var x = joy.x, y = joy.y;
    if (keys.arrowleft || keys.a) x -= 1;
    if (keys.arrowright || keys.d) x += 1;
    if (keys.arrowup || keys.w) y -= 1;
    if (keys.arrowdown || keys.s) y += 1;
    var l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x: x, y: y };
  }

  // ---- Zustand ----
  var state = 'menu';      // menu | l1 | between | l2 | tee | end
  var tt = 0;              // Zeit im aktuellen Zustand
  var particles = [], shake = 0, clouds = [];
  var M = null;            // aktuelles Labyrinth
  var ball, strokes = 0, released = null, aiming = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  for (var ci = 0; ci < 4; ci++) clouds.push({ x: rnd(0, 800), y: rnd(10, 400), s: rnd(.6, 1.3), v: rnd(4, 10) });

  var CONF = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'];
  function burst(x, y, n, colors, speed) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), s = rnd(.3, 1) * (speed || 160);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.6, 1.3), age: 0,
        c: colors[(Math.random() * colors.length) | 0], r: rnd(2, 4.5), g: 220 });
    }
  }

  // ---- Labyrinth ----
  // Wandbits: 1=N 2=E 4=S 8=W (gesetzt = offen)
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], BIT = [1, 2, 4, 8];

  function genMaze(target, maxC, maxR) {
    var cols = Math.max(5, Math.min(maxC, Math.floor((W - 20) / target)));
    var rows = Math.max(5, Math.min(maxR, Math.floor((H - 66) / target)));
    var cs = Math.min((W - 20) / cols, (H - 66) / rows);
    var m = { cols: cols, rows: rows, cs: cs, ox: (W - cols * cs) / 2, oy: 56 + (H - 66 - rows * cs) / 2, o: [], rects: [] };
    var i, n = cols * rows, seen = [];
    for (i = 0; i < n; i++) { m.o[i] = 0; seen[i] = false; }
    var stack = [0]; seen[0] = true;
    while (stack.length) {
      var cur = stack[stack.length - 1], cx = cur % cols, cy = (cur / cols) | 0, opts = [];
      for (var d = 0; d < 4; d++) {
        var nx = cx + DX[d], ny = cy + DY[d];
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]) opts.push(d);
      }
      if (!opts.length) { stack.pop(); continue; }
      var dd = opts[(Math.random() * opts.length) | 0], nn = (cy + DY[dd]) * cols + cx + DX[dd];
      m.o[cur] |= BIT[dd]; m.o[nn] |= BIT[(dd + 2) % 4]; seen[nn] = true; stack.push(nn);
    }
    // ein paar Wände entfernen, damit es Rundwege gibt
    for (i = 0; i < n * .1; i++) {
      var c = (Math.random() * n) | 0, x = c % cols, y = (c / cols) | 0, e = (Math.random() * 4) | 0;
      var xx = x + DX[e], yy = y + DY[e];
      if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) { m.o[c] |= BIT[e]; m.o[yy * cols + xx] |= BIT[(e + 2) % 4]; }
    }
    // Entfernungen vom Start (Breitensuche)
    m.dist = []; for (i = 0; i < n; i++) m.dist[i] = -1;
    var q = [0]; m.dist[0] = 0;
    while (q.length) {
      var u = q.shift(), ux = u % cols, uy = (u / cols) | 0;
      for (var k = 0; k < 4; k++) if (m.o[u] & BIT[k]) {
        var v = (uy + DY[k]) * cols + ux + DX[k];
        if (m.dist[v] < 0) { m.dist[v] = m.dist[u] + 1; q.push(v); }
      }
    }
    m.goal = 0; for (i = 0; i < n; i++) if (m.dist[i] > m.dist[m.goal]) m.goal = i;
    // Lösungsweg
    m.path = {}; var p = m.goal;
    while (p !== 0) {
      m.path[p] = true;
      var px = p % cols, py = (p / cols) | 0;
      for (var k2 = 0; k2 < 4; k2++) if (m.o[p] & BIT[k2]) {
        var w = (py + DY[k2]) * cols + px + DX[k2];
        if (m.dist[w] === m.dist[p] - 1) { p = w; break; }
      }
    }
    m.path[0] = true;
    // Wand-Rechtecke
    var t = 7, R = m.rects;
    function rect(x1, y1, w1, h1) { R.push({ x: x1, y: y1, w: w1, h: h1 }); }
    for (i = 0; i < n; i++) {
      var gx = i % cols, gy = (i / cols) | 0, X = m.ox + gx * cs, Y = m.oy + gy * cs;
      if (!(m.o[i] & 1)) rect(X - t / 2, Y - t / 2, cs + t, t);
      if (!(m.o[i] & 8)) rect(X - t / 2, Y - t / 2, t, cs + t);
      if (gy === rows - 1) rect(X - t / 2, Y + cs - t / 2, cs + t, t);
      if (gx === cols - 1) rect(X + cs - t / 2, Y - t / 2, t, cs + t);
    }
    return m;
  }
  function cellCenter(i) { return { x: M.ox + (i % M.cols + .5) * M.cs, y: M.oy + (((i / M.cols) | 0) + .5) * M.cs }; }
  function cellAt(x, y) {
    var cx = Math.floor((x - M.ox) / M.cs), cy = Math.floor((y - M.oy) / M.cs);
    if (cx < 0 || cy < 0 || cx >= M.cols || cy >= M.rows) return -1;
    return cy * M.cols + cx;
  }
  // Kreis gegen Wände; gibt true zurück, wenn berührt (Normale in hitN)
  var hitN = { x: 0, y: 0 };
  function collide(o, r) {
    var hit = false;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < M.rects.length; i++) {
        var q = M.rects[i];
        var cx = Math.max(q.x, Math.min(o.x, q.x + q.w)), cy = Math.max(q.y, Math.min(o.y, q.y + q.h));
        var dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          var d = Math.sqrt(d2);
          if (d < 0.0001) { dx = 0; dy = -1; d = 0; } else { dx /= d; dy /= d; }
          o.x += dx * (r - d); o.y += dy * (r - d);
          hitN.x = dx; hitN.y = dy; hit = true;
        }
      }
    }
    return hit;
  }

  // ---- Level aufbauen ----
  function setupLevel1() {
    M = genMaze(40, 11, 13);
    var n = M.cols * M.rows;
    M.sand = {}; M.water = {};
    for (var i = 1; i < n; i++) {
      if (i === M.goal) continue;
      var r = Math.random();
      if (!M.path[i] && r < .08) M.water[i] = true;
      else if (r < .14 + (M.path[i] ? .1 : 0)) M.sand[i] = true;
    }
    var s = cellCenter(0);
    ball = { x: s.x, y: s.y, vx: 0, vy: 0 };
    state = 'l1'; tt = 0;
  }
  function setupLevel2() {
    var x0 = 14, y0 = 60, x1 = W - 14, y1 = H - 14, fw = x1 - x0, fh = y1 - y0, t = 12;
    var portrait = fh > fw;
    M = { rects: [], x0: x0, y0: y0, x1: x1, y1: y1, mover: null };
    M.rects.push({ x: x0 - t, y: y0 - t, w: fw + 2 * t, h: t }, { x: x0 - t, y: y1, w: fw + 2 * t, h: t },
                 { x: x0 - t, y: y0 - t, w: t, h: fh + 2 * t }, { x: x1, y: y0 - t, w: t, h: fh + 2 * t });
    var off = rnd(-.25, .25) * (portrait ? fw : fh);
    var sp = portrait ? { x: x0 + fw / 2 - off, y: y1 - 36 } : { x: x0 + 36, y: y0 + fh / 2 - off };
    var hp = portrait ? { x: x0 + fw / 2 + off, y: y0 + 36 } : { x: x1 - 36, y: y0 + fh / 2 + off };
    M.start = sp; M.hole = hp;
    // Zonen, die frei bleiben: Start, Loch, Bahn des beweglichen Balkens
    var long0 = portrait ? y0 : x0, longLen = portrait ? fh : fw, lat0 = portrait ? x0 : y0, latLen = portrait ? fw : fh;
    function box(l, la, ll, lw) { return portrait ? { x: la, y: l, w: lw, h: ll } : { x: l, y: la, w: ll, h: lw }; }
    var mid = long0 + longLen / 2, bw = Math.min(90, latLen * .3), bt = 16;
    var mv = portrait ? { x: lat0 + 30, y: mid - bt / 2, w: bw, h: bt } : { x: mid - bt / 2, y: lat0 + 30, w: bt, h: bw };
    M.mover = mv; M.rects.push(mv);
    mv.axis = portrait ? 'x' : 'y'; mv.lo = lat0 + 30; mv.hi = lat0 + latLen - 30 - bw; mv.dir = 1; mv.speed = 55;
    var zones = [box(mid - bt / 2 - 6, lat0, bt + 12, latLen)];
    function free(r) {
      var pad = 36, ok = true;
      zones.forEach(function (z) { if (r.x - pad < z.x + z.w && r.x + r.w + pad > z.x && r.y - pad < z.y + z.h && r.y + r.h + pad > z.y) ok = false; });
      [sp, hp].forEach(function (c) { if (Math.hypot(Math.max(r.x, Math.min(c.x, r.x + r.w)) - c.x, Math.max(r.y, Math.min(c.y, r.y + r.h)) - c.y) < 60) ok = false; });
      return ok;
    }
    var tries = 0, placed = 0;
    while (placed < 4 && tries++ < 300) {
      var vert = Math.random() < .5, w = vert ? rnd(16, 24) : rnd(46, 90), h = vert ? rnd(46, 90) : rnd(16, 24);
      var r = { x: rnd(x0 + 30, x1 - 30 - w), y: rnd(y0 + 30, y1 - 30 - h), w: w, h: h };
      if (!free(r)) continue;
      M.rects.push(r); zones.push({ x: r.x, y: r.y, w: r.w, h: r.h }); placed++;
    }
    ball = { x: sp.x, y: sp.y, vx: 0, vy: 0 };
    strokes = 0; released = null;
    state = 'l2'; tt = 0;
  }

  function start() {
    audio();
    if (!vid.dataset.primed) {
      vid.dataset.primed = '1'; vid.preload = 'auto'; vid.muted = true;
      var pr = vid.play();
      if (pr && pr.then) pr.then(function () { vid.pause(); vid.currentTime = 0; vid.muted = false; }).catch(function () { vid.muted = false; });
    }
    overlay.classList.add('hidden'); overlay.style.background = '';
    swingHit = landed = scored = false; trail = []; particles = [];
    setupLevel1();
    tone(523, 0, .12, 'square', .08); tone(659, .1, .12, 'square', .08); tone(784, .2, .2, 'square', .08);
  }
  startBtn.addEventListener('click', start);

  // ---- Zeichnen: Hilfen ----
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawGolferTop(p, now, scale) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(scale, scale);
    var bounce = Math.abs(Math.sin(p.step)) * 3;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 16, 13, 5, 0, 0, 7); ctx.fill();
    ctx.translate(0, -bounce);
    ctx.fillStyle = '#1d3557'; rr(-9, -2, 18, 20, 5); ctx.fill();
    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(0, -10, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, -13, 9.5, Math.PI, 0); ctx.fill();
    ctx.fillRect(p.face > 0 ? 0 : -14, -14, 14, 3);
    ctx.fillStyle = '#222'; ctx.fillRect(p.face * 3 - 1, -10, 2, 3);
    ctx.restore();
  }
  function drawMaze(floor, wall, wallTop) {
    ctx.fillStyle = floor; ctx.fillRect(M.ox, M.oy, M.cols * M.cs, M.rows * M.cs);
    return;
  }
  function drawWalls(color, top) {
    M.rects.forEach(function (q) {
      ctx.fillStyle = color; ctx.fillRect(q.x, q.y, q.w, q.h);
      ctx.fillStyle = top; ctx.fillRect(q.x, q.y, q.w, Math.min(2, q.h)); // dünne Lichtkante
    });
  }
  function drawHud(label, w) {
    ctx.font = '700 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    w = w || 150;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(W / 2 - w / 2, 12, w, 32, 16); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, 29);
  }
  function drawToast(msg, sub) {
    var a = tt < .3 ? tt / .3 : tt > 3 ? Math.max(0, 1 - (tt - 3) / .6) : 1;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(W / 2 - 170, H - 100, 340, 62, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 20px system-ui, sans-serif'; ctx.fillText(msg, W / 2, H - 80);
    ctx.font = '500 15px system-ui, sans-serif'; ctx.fillText(sub, W / 2, H - 56);
    ctx.globalAlpha = 1;
  }

  // ---- Level 1: Golfball-Labyrinth ----
  var splash = 0;
  function updateL1(dt) {
    var inp = input(), c = cellAt(ball.x, ball.y);
    var onSand = c >= 0 && M.sand[c];
    ball.vx += inp.x * 560 * dt; ball.vy += inp.y * 560 * dt;
    var f = Math.exp(-dt * (onSand ? 5.5 : 1.1));
    ball.vx *= f; ball.vy *= f;
    var sp = Math.hypot(ball.vx, ball.vy), max = onSand ? 90 : 200;
    if (sp > max) { ball.vx *= max / sp; ball.vy *= max / sp; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (collide(ball, 8)) {
      var vn = ball.vx * hitN.x + ball.vy * hitN.y;
      if (vn < 0) {
        ball.vx -= 1.5 * vn * hitN.x; ball.vy -= 1.5 * vn * hitN.y;
        if (-vn > 60) tone(300 + Math.random() * 60, 0, .05, 'square', .04);
      }
    }
    c = cellAt(ball.x, ball.y);
    if (c >= 0 && M.water[c]) {
      var cc = cellCenter(c);
      if (Math.hypot(ball.x - cc.x, ball.y - cc.y) < M.cs * .3) {
        burst(ball.x, ball.y, 18, ['#8ecae6', '#ffffff', '#219ebc'], 120);
        noise(.2, .25); tone(220, 0, .25, 'sine', .1);
        var s = cellCenter(0); ball.x = s.x; ball.y = s.y; ball.vx = ball.vy = 0;
      }
    }
    var g = cellCenter(M.goal);
    if (Math.hypot(ball.x - g.x, ball.y - g.y) < 10) {
      burst(g.x, g.y, 40, CONF, 220); tone(784, 0, .15, 'square', .1); tone(1047, .12, .25, 'square', .1);
      state = 'between'; tt = 0;
    }
  }
  function drawL1(now) {
    ctx.fillStyle = '#2f7a3e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7ec26f'; ctx.fillRect(M.ox, M.oy, M.cols * M.cs, M.rows * M.cs);
    for (var i = 0; i < M.cols * M.rows; i++) {
      var ctr = cellCenter(i), cs = M.cs;
      if ((i % M.cols + ((i / M.cols) | 0)) % 2) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(ctr.x - cs / 2, ctr.y - cs / 2, cs, cs); }
      if (M.sand[i]) {
        ctx.fillStyle = '#e6cf8a'; rr(ctr.x - cs * .42, ctr.y - cs * .42, cs * .84, cs * .84, 10); ctx.fill();
        ctx.fillStyle = '#c9b06a';
        for (var d = 0; d < 6; d++) ctx.fillRect(ctr.x + Math.sin(i * 7 + d * 2.3) * cs * .3, ctr.y + Math.cos(i * 3 + d * 1.7) * cs * .3, 2, 2);
      }
      if (M.water[i]) {
        ctx.fillStyle = '#3a9bd9'; ctx.beginPath(); ctx.ellipse(ctr.x, ctr.y, cs * .34, cs * .28, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.ellipse(ctr.x, ctr.y, cs * (.14 + .06 * Math.sin(now * 3 + i)), cs * .1, 0, 0, 7); ctx.stroke();
      }
    }
    // Start-Markierung + Loch + Fahne
    var s = cellCenter(0);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, 7); ctx.fill();
    var g = cellCenter(M.goal);
    ctx.fillStyle = '#12301a'; ctx.beginPath(); ctx.arc(g.x, g.y, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x, g.y - 30); ctx.stroke();
    ctx.fillStyle = '#ff595e'; ctx.beginPath(); ctx.moveTo(g.x, g.y - 30); ctx.lineTo(g.x + 16, g.y - 25 + Math.sin(now * 6) * 1.5); ctx.lineTo(g.x, g.y - 20); ctx.fill();
    drawWalls('#1f5a2a', '#3e8d4c');
    // Ball
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(ball.x + 2, ball.y + 5, 8, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(ball.x - 2, ball.y - 2, 1.3, 0, 7); ctx.arc(ball.x + 2, ball.y + 1, 1.3, 0, 7); ctx.fill();
    drawHud('Level 1 von 2');
    drawToast('Bring den Ball ins Loch!', 'Sand bremst, Wasser wirft dich zurück.');
  }

  // ---- Level 2: Minigolf ----
  function updateL2(dt) {
    var mv = M.mover;
    mv[mv.axis] += mv.dir * mv.speed * dt;
    if (mv[mv.axis] > mv.hi) { mv[mv.axis] = mv.hi; mv.dir = -1; }
    if (mv[mv.axis] < mv.lo) { mv[mv.axis] = mv.lo; mv.dir = 1; }
    var sp = Math.hypot(ball.vx, ball.vy);
    if (released) {
      if (sp < 12 && released.power > .12) {
        var l = Math.hypot(released.x, released.y), v = 140 + released.power * 460;
        ball.vx = released.x / l * v; ball.vy = released.y / l * v; strokes++;
        noise(.08, .35); tone(900, 0, .05, 'square', .08);
      }
      released = null;
    }
    sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      var steps = Math.max(1, Math.ceil(sp * dt / 4)), sdt = dt / steps;
      for (var i = 0; i < steps; i++) {
        ball.x += ball.vx * sdt; ball.y += ball.vy * sdt;
        if (collide(ball, 7)) {
          var vn = ball.vx * hitN.x + ball.vy * hitN.y;
          if (vn < 0) {
            ball.vx -= 1.85 * vn * hitN.x; ball.vy -= 1.85 * vn * hitN.y;
            if (-vn > 80) tone(260 + Math.random() * 60, 0, .05, 'square', .05);
          }
        }
      }
      var f = Math.exp(-dt * 1.1); ball.vx *= f; ball.vy *= f;
      if (Math.hypot(ball.vx, ball.vy) < 10) ball.vx = ball.vy = 0;
    }
    var h = M.hole;
    if (Math.hypot(ball.x - h.x, ball.y - h.y) < 10 && Math.hypot(ball.vx, ball.vy) < 330) {
      burst(h.x, h.y, 40, CONF, 220); tone(784, 0, .15, 'square', .1); tone(1047, .12, .25, 'square', .1);
      state = 'tee'; tt = 0;
    }
  }
  function drawL2(now) {
    ctx.fillStyle = '#2f7a3e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#58b05a'; ctx.fillRect(M.x0, M.y0, M.x1 - M.x0, M.y1 - M.y0);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (var yy = M.y0, k = 0; yy < M.y1; yy += 40, k++) if (k % 2) ctx.fillRect(M.x0, yy, M.x1 - M.x0, Math.min(40, M.y1 - yy));
    var s = M.start, h = M.hole;
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#12301a'; ctx.beginPath(); ctx.arc(h.x, h.y, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x, h.y - 30); ctx.stroke();
    ctx.fillStyle = '#ff595e'; ctx.beginPath(); ctx.moveTo(h.x, h.y - 30); ctx.lineTo(h.x + 16, h.y - 25 + Math.sin(now * 6) * 1.5); ctx.lineTo(h.x, h.y - 20); ctx.fill();
    drawWalls('#8a5a2b', '#b8844a');
    // Zielhilfe
    var stopped = Math.hypot(ball.vx, ball.vy) < 12;
    if (aiming && stopped) {
      var jx = joy.x, jy = joy.y, pw = Math.min(1, Math.hypot(jx, jy));
      if (pw > .02) {
        var ux = jx / Math.hypot(jx, jy), uy = jy / Math.hypot(jx, jy), len = 24 + pw * 130;
        ctx.fillStyle = pw > .12 ? '#fff' : 'rgba(255,255,255,.4)';
        for (var d = 16; d < len; d += 11) { ctx.beginPath(); ctx.arc(ball.x + ux * d, ball.y + uy * d, 2.6, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(ball.x + ux * len, ball.y + uy * len, 5, 0, 7); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(ball.x + 2, ball.y + 5, 7, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(ball.x - 2, ball.y - 2, 1.2, 0, 7); ctx.arc(ball.x + 2, ball.y + 1, 1.2, 0, 7); ctx.fill();
    drawHud('Level 2 von 2 · Schläge: ' + strokes, 230);
    drawToast('Joystick ziehen, loslassen = Schlag!', 'Je weiter du ziehst, desto kräftiger.');
  }
  var fadeIn = 0;

  // ---- Abschlag-Szene ----
  var T_TEE = { stand: 1.4, back: 1.1, down: 0.22, fly: 3.2, roll: 1.1 };
  function teeLayout() {
    var gy = H * .78;
    var s = Math.max(1.1, Math.min(2.2, W / 260, H / 300));
    return { gy: gy, gx: W * .14, s: s, bx: W * .14 + 54 * Math.min(s, 1.6), holeX: W * .86 };
  }
  var swingHit = false, landed = false, scored = false;

  function drawSky(now) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5ec2f2'); g.addColorStop(1, '#d8f3ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    clouds.forEach(function (c) {
      c.x += c.v * 0.016; if (c.x > W + 80) c.x = -80;
      var cy = (c.y % (H * .5)) + 10;
      ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.arc(c.x, cy, 18 * c.s, 0, 7); ctx.arc(c.x + 20 * c.s, cy + 4, 14 * c.s, 0, 7); ctx.arc(c.x - 20 * c.s, cy + 5, 13 * c.s, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
  function drawCourse(L) {
    ctx.fillStyle = '#6dc36a'; ctx.beginPath(); ctx.moveTo(0, L.gy - 6);
    ctx.quadraticCurveTo(W * .5, L.gy - 30, W, L.gy - 6); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.fillStyle = '#4caf50'; ctx.fillRect(0, L.gy + 12, W, H);
    // Loch + Fahne
    ctx.fillStyle = '#1b3a1d'; ctx.beginPath(); ctx.ellipse(L.holeX, L.gy + 6, 11, 4, 0, 0, 7); ctx.fill();
  }
  function drawFlag(L, now) {
    var x = L.holeX, top = L.gy - 78;
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, L.gy + 4); ctx.lineTo(x, top); ctx.stroke();
    ctx.fillStyle = '#ff595e'; ctx.beginPath(); ctx.moveTo(x, top);
    var w = Math.sin(now * 6) * 3;
    ctx.lineTo(x + 34, top + 11 + w); ctx.lineTo(x, top + 24); ctx.fill();
  }
  function drawGolferSide(L, theta, now) {
    var s = L.s, gx = L.gx, gy = L.gy;
    ctx.save(); ctx.translate(gx, gy); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(8, 2, 22, 4, 0, 0, 7); ctx.fill();
    // Beine
    ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-2, -26); ctx.lineTo(-8, 0); ctx.moveTo(4, -26); ctx.lineTo(12, 0); ctx.stroke();
    // Oberkörper
    ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(1, -26); ctx.lineTo(3, -52); ctx.stroke();
    // Kopf + Kappe
    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(6, -62, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(6, -64, 8.5, Math.PI, 0); ctx.fill(); ctx.fillRect(6, -66, 12, 3);
    // Arme + Schläger
    var hx = 10, hy = -40, Lc = 54;
    var cx = hx + Math.sin(theta) * Lc, cy = hy + Math.cos(theta) * Lc;
    ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(3, -50); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 6;
    var ux = Math.sin(theta), uy = Math.cos(theta);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(theta) * 9, cy - Math.sin(theta) * 9); ctx.stroke();
    ctx.restore();
  }
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  var ballPos = { x: 0, y: 0 }, trail = [];
  function updateTee(dt, now) {
    var L = teeLayout(), t = tt;
    var tBack = T_TEE.stand, tDown = tBack + T_TEE.back, tFly = tDown + T_TEE.down;
    var tRoll = tFly + T_TEE.fly, tEnd = tRoll + T_TEE.roll;
    var theta;
    var addr = Math.atan2(40, 36) ;
    if (t < tBack) theta = addr + Math.sin(now * 3) * .02;
    else if (t < tDown) theta = addr + (-2.62 - addr) * ease((t - tBack) / T_TEE.back);
    else if (t < tFly) theta = -2.62 + (addr + 2.62) * ((t - tDown) / T_TEE.down);
    else theta = addr + (3.75 - addr) * ease((t - tFly) / 0.7);
    var restY = L.gy - 4 * L.s;
    var bx0 = L.gx + (10 + Math.sin(addr) * 54) * L.s;
    ballPos.x = bx0; ballPos.y = restY;

    if (t >= tFly && !swingHit) {
      swingHit = true; shake = .3; noise(.15, .5); tone(1200, 0, .08, 'square', .12);
      burst(bx0, restY, 20, ['#ffffff', '#ffd23f'], 220);
    }
    if (t >= tFly && t < tRoll) {
      var u = (t - tFly) / T_TEE.fly;
      var ex = L.holeX - 26;
      ballPos.x = bx0 + (ex - bx0) * u;
      ballPos.y = restY - Math.sin(u * Math.PI) * H * .62;
      if (Math.floor(now * 60) % 2) trail.push({ x: ballPos.x, y: ballPos.y, a: 1 });
      if (!landed && u > .96) { landed = true; }
    } else if (t >= tRoll) {
      var v = Math.min(1, (t - tRoll) / T_TEE.roll);
      ballPos.x = L.holeX - (1 - Math.sin(v * Math.PI / 2)) * 26 + 0;
      ballPos.x = L.holeX - 26 * (1 - v);
      ballPos.y = restY + 2 + (v > .9 ? (v - .9) * 60 : 0);
      if (!scored && v >= 1) {
        scored = true; state = 'end'; tt = 0;
        for (var i = 0; i < 6; i++) setTimeout(fireworks, i * 350);
        setTimeout(playVideo, 2400);
      }
    }
    return { L: L, theta: theta, tFly: tFly, tRoll: tRoll };
  }
  function fireworks() {
    if (state !== 'end') return;
    burst(rnd(W * .15, W * .85), rnd(H * .1, H * .5), 50, CONF.concat(['#ff9f1c', '#ff70a6']), 230);
    noise(.25, .12); tone(rnd(400, 900), 0, .2, 'sine', .06);
  }
  var vbox = document.getElementById('vbox'), vid = document.getElementById('vid');
  var vplay = document.getElementById('vplay'), vskip = document.getElementById('vskip');
  function playVideo() {
    if (state !== 'end') return;
    vbox.classList.remove('hidden'); vplay.classList.add('hidden');
    vid.muted = muted; vid.currentTime = 0;
    var p = vid.play();
    if (p && p.catch) p.catch(function () { vplay.classList.remove('hidden'); });
  }
  function endVideo() {
    if (vbox.classList.contains('hidden')) return;
    vid.pause(); vbox.classList.add('hidden');
    if (state !== 'end') return;
    for (var i = 0; i < 4; i++) setTimeout(fireworks, i * 300);
    showEnd();
  }
  vid.addEventListener('ended', endVideo);
  vid.addEventListener('error', endVideo);
  vskip.addEventListener('click', endVideo);
  vplay.addEventListener('click', function () { vplay.classList.add('hidden'); vid.play().catch(endVideo); });
  function showEnd() {
    titleEl.textContent = 'Happy Birthday ' + NAME + '!';
    textEl.innerHTML = 'Hole in One! 🏌️⛳<br>Alles Gute zum Geburtstag!';
    startBtn.textContent = 'Nochmal spielen';
    overlay.classList.remove('hidden');
    overlay.style.background = 'rgba(8, 30, 16, .45)';
  }

  // ---- Hauptschleife ----
  var last = performance.now(), clock = 0;
  function frame(nowMs) {
    var dt = Math.min(.05, (nowMs - last) / 1000); last = nowMs; clock += dt; tt += dt;
    var now = clock;

    ctx.save();
    if (shake > 0) { shake -= dt; ctx.translate(rnd(-3, 3), rnd(-3, 3)); }

    if (state === 'menu') {
      drawSky(now);
      var L0 = teeLayout(); drawCourse(L0); drawFlag(L0, now);
      drawGolferSide(L0, Math.atan2(40, 36) + Math.sin(now * 2) * .05, now);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L0.gx + (10 + Math.sin(Math.atan2(40, 36)) * 54) * L0.s, L0.gy - 4 * L0.s, 5, 0, 7); ctx.fill();
    } else if (state === 'l1') {
      updateL1(dt); drawL1(now);
    } else if (state === 'between') {
      drawL1(now);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 32px system-ui, sans-serif'; ctx.fillText('Level 1 geschafft!', W / 2, H / 2);
      if (tt > 1.6) setupLevel2();
    } else if (state === 'l2') {
      updateL2(dt); if (state === 'l2') drawL2(now);
    }
    if (state === 'tee' || state === 'end') {
      var r = updateTee(dt, now), L = r.L;
      drawSky(now); drawCourse(L); drawFlag(L, now);
      trail.forEach(function (p) {
        p.a -= dt * .6;
        if (p.a > 0) { ctx.globalAlpha = p.a; ctx.fillStyle = CONF[(p.x | 0) % CONF.length]; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill(); }
      });
      ctx.globalAlpha = 1;
      drawGolferSide(L, r.theta, now);
      if (tt < r.tFly) { ctx.fillStyle = '#e8d3a2'; ctx.fillRect(ballPos.x - 1.5, L.gy - 2 * L.s, 3, 2 * L.s); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ballPos.x, ballPos.y - 4, 5.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#0003'; ctx.lineWidth = 1; ctx.stroke();
      if (state === 'tee' && tt < 1.4) {
        ctx.fillStyle = '#fff'; ctx.font = '800 30px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.shadowColor = '#0008'; ctx.shadowBlur = 6;
        ctx.fillText('Zeit für den Abschlag!', W / 2, H * .22);
        ctx.shadowBlur = 0;
      }
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.age += dt;
      if (p.age > p.life) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
