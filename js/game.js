(function () {
  'use strict';

  // ---- Einstellungen ----
  var NAME = 'Paps';              // Name im Endbildschirm
  var PHRASE = 'HAPPY BIRTHDAY';   // 13 Buchstaben = 13 Geschenke
  var LETTERS = PHRASE.replace(/ /g, '').split('');

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
    manager.on('end', function () { joy.x = joy.y = 0; });
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
  var state = 'menu';      // menu | play | tee | end
  var tt = 0;              // Zeit im aktuellen Zustand
  var player, gift, balls, collected, particles, shake, stun, clouds;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function newGift() {
    var tries = 0, g;
    do {
      g = { x: rnd(40, W - 40), y: rnd(90, H - 40), t: 0 };
      tries++;
    } while (tries < 30 && Math.hypot(g.x - player.x, g.y - player.y) < 140);
    gift = g;
  }

  function reset() {
    player = { x: W / 2, y: H / 2, vx: 0, vy: 0, face: 1, step: 0 };
    collected = 0; particles = []; shake = 0; stun = 0;
    balls = [];
    clouds = [];
    for (var i = 0; i < 4; i++) clouds.push({ x: rnd(0, W), y: rnd(10, H), s: rnd(.6, 1.3), v: rnd(4, 10) });
    newGift();
  }

  function addBall() {
    var a = rnd(0, 6.28), sp = 70 + balls.length * 10;
    var edge = Math.random() < .5;
    balls.push({ x: edge ? -10 : W + 10, y: rnd(100, H - 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8 });
    if (balls[balls.length - 1].x < 0) balls[balls.length - 1].vx = Math.abs(balls[balls.length - 1].vx);
    else balls[balls.length - 1].vx = -Math.abs(balls[balls.length - 1].vx);
  }

  function burst(x, y, n, colors, speed) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), s = rnd(.3, 1) * (speed || 160);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.6, 1.3), age: 0,
        c: colors[(Math.random() * colors.length) | 0], r: rnd(2, 4.5), g: 220 });
    }
  }
  var CONF = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'];

  function start() {
    audio();
    overlay.classList.add('hidden');
    reset();
    state = 'play'; tt = 0;
    tone(523, 0, .12, 'square', .08); tone(659, .1, .12, 'square', .08); tone(784, .2, .2, 'square', .08);
  }
  startBtn.addEventListener('click', start);

  // ---- Zeichnen: Hilfen ----
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawGrass() {
    ctx.fillStyle = '#4caf50'; ctx.fillRect(0, 0, W, H);
    var sw = 60;
    for (var i = 0; i * sw < W + sw; i++) {
      if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(i * sw, 0, sw, H); }
    }
  }
  function drawGift(g, now) {
    var bob = Math.sin(now * 5) * 3, p = 1 + Math.sin(now * 8) * .05;
    ctx.save(); ctx.translate(g.x, g.y + bob); ctx.scale(p, p);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 18, 16, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e63946'; rr(-16, -14, 32, 30, 4); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-3, -14, 6, 30); ctx.fillRect(-16, -2, 32, 6);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(-6, -17, 7, 4, -.5, 0, 7); ctx.ellipse(6, -17, 7, 4, .5, 0, 7); ctx.fill();
    ctx.restore();
    // Glitzern
    ctx.fillStyle = '#fff';
    for (var i = 0; i < 3; i++) {
      var a = now * 2 + i * 2.1;
      ctx.globalAlpha = .5 + .5 * Math.sin(now * 6 + i);
      ctx.fillRect(g.x + Math.cos(a) * 26 - 1.5, g.y + Math.sin(a) * 22 - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
  function drawGolferTop(p, now) {
    ctx.save(); ctx.translate(p.x, p.y);
    var bounce = Math.abs(Math.sin(p.step)) * 3;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 16, 13, 5, 0, 0, 7); ctx.fill();
    if (stun > 0 && Math.floor(now * 20) % 2) ctx.globalAlpha = .4;
    ctx.translate(0, -bounce);
    ctx.fillStyle = '#1d3557'; rr(-9, -2, 18, 20, 5); ctx.fill();          // Körper
    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(0, -10, 9, 0, 7); ctx.fill();   // Kopf
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, -13, 9.5, Math.PI, 0); ctx.fill();   // Kappe
    ctx.fillRect(p.face > 0 ? 0 : -14, -14, 14, 3);
    ctx.fillStyle = '#222'; ctx.fillRect(p.face * 3 - 1, -10, 2, 3);
    ctx.restore();
  }
  function drawHud(now) {
    var n = LETTERS.length, label = PHRASE, idx = 0;
    ctx.font = '700 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var cw = Math.min(22, (W - 70) / (label.length + 1)), x0 = W / 2 - label.length * cw / 2 + cw / 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(x0 - cw, 10, label.length * cw + cw, 36, 18); ctx.fill();
    for (var i = 0; i < label.length; i++) {
      var ch = label[i];
      if (ch === ' ') continue;
      idx = label.slice(0, i).replace(/ /g, '').length;
      ctx.fillStyle = idx < collected ? '#ffd23f' : 'rgba(255,255,255,.3)';
      ctx.font = '700 ' + Math.floor(cw * .95) + 'px system-ui, sans-serif';
      ctx.fillText(ch, x0 + i * cw, 29);
    }
  }

  // ---- Spielupdate ----
  function updatePlay(dt, now) {
    var inp = input(), sp = stun > 0 ? 60 : 190;
    player.vx += (inp.x * sp - player.vx) * Math.min(1, dt * 12);
    player.vy += (inp.y * sp - player.vy) * Math.min(1, dt * 12);
    player.x = Math.max(16, Math.min(W - 16, player.x + player.vx * dt));
    player.y = Math.max(40, Math.min(H - 16, player.y + player.vy * dt));
    if (Math.abs(inp.x) > .1) player.face = inp.x > 0 ? 1 : -1;
    if (Math.hypot(player.vx, player.vy) > 20) player.step += dt * 14;
    if (stun > 0) stun -= dt;
    if (shake > 0) shake -= dt;

    // Geschenk einsammeln
    if (Math.hypot(player.x - gift.x, player.y - gift.y) < 28) {
      collected++;
      burst(gift.x, gift.y, 24, CONF, 190);
      tone(660 + collected * 40, 0, .12, 'square', .09); tone(990 + collected * 40, .08, .15, 'square', .09);
      if (collected % 3 === 0 && collected < LETTERS.length) addBall();
      if (collected >= LETTERS.length) { gift = null; state = 'tee'; tt = 0; return; }
      newGift();
    }
    // Golfbälle als Hindernisse
    balls.forEach(function (b) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < 52) { b.y = 52; b.vy = Math.abs(b.vy); }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
      if (stun <= 0 && Math.hypot(player.x - b.x, player.y - b.y) < b.r + 12) {
        stun = 1.2; shake = .25;
        var d = Math.hypot(player.x - b.x, player.y - b.y) || 1;
        player.vx = (player.x - b.x) / d * 260; player.vy = (player.y - b.y) / d * 260;
        tone(140, 0, .2, 'sawtooth', .12);
      }
    });
  }

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
        melody();
        showEnd();
      }
    }
    return { L: L, theta: theta, tFly: tFly, tRoll: tRoll };
  }
  function fireworks() {
    if (state !== 'end') return;
    burst(rnd(W * .15, W * .85), rnd(H * .1, H * .5), 50, CONF.concat(['#ff9f1c', '#ff70a6']), 230);
    noise(.25, .12); tone(rnd(400, 900), 0, .2, 'sine', .06);
  }
  function showEnd() {
    setTimeout(function () {
      if (state !== 'end') return;
      titleEl.textContent = 'Happy Birthday ' + NAME + '!';
      textEl.innerHTML = 'Hole in One! 🏌️⛳<br>Alles Gute zum Geburtstag!';
      startBtn.textContent = 'Nochmal spielen';
      overlay.classList.remove('hidden');
      overlay.style.background = 'rgba(8, 30, 16, .45)';
    }, 2800);
  }
  startBtn.addEventListener('click', function () { overlay.style.background = ''; swingHit = landed = scored = false; trail = []; });

  // ---- Hauptschleife ----
  var last = performance.now(), clock = 0;
  function frame(nowMs) {
    var dt = Math.min(.05, (nowMs - last) / 1000); last = nowMs; clock += dt; tt += dt;
    var now = clock;

    ctx.save();
    if (shake > 0) ctx.translate(rnd(-3, 3), rnd(-3, 3));

    if (state === 'menu') {
      drawSky(now);
      var L0 = teeLayout(); drawCourse(L0); drawFlag(L0, now);
      drawGolferSide(L0, Math.atan2(40, 36) + Math.sin(now * 2) * .05, now);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L0.gx + (10 + Math.sin(Math.atan2(40, 36)) * 54) * L0.s, L0.gy - 4 * L0.s, 5, 0, 7); ctx.fill();
    } else if (state === 'play') {
      updatePlay(dt, now);
      drawGrass();
      if (gift) drawGift(gift, now);
      balls.forEach(function (b) {
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 6, b.r, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
        ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, 1.4, 0, 7); ctx.arc(b.x + 2, b.y + 1, 1.4, 0, 7); ctx.fill();
      });
      drawGolferTop(player, now);
      drawHud(now);
    } else {
      var r = updateTee(dt, now), L = r.L;
      drawSky(now); drawCourse(L); drawFlag(L, now);
      // Spur
      trail.forEach(function (p) {
        p.a -= dt * .6;
        if (p.a > 0) { ctx.globalAlpha = p.a; ctx.fillStyle = CONF[(p.x | 0) % CONF.length]; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill(); }
      });
      ctx.globalAlpha = 1;
      drawGolferSide(L, r.theta, now);
      // Tee + Ball
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

    // Partikel
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

  reset();
  // Hintergrund im Menü braucht Wolken
  requestAnimationFrame(frame);
})();
