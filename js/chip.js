/* =============================================================================
   js/chip.js (E3): #chip, the centrepiece.
   p .00-.50  WebGL exploded M5 package ([data-chip-canvas]): substrate with gold
              traces, die, two unified memory packages, thermal interface, BGA,
              memory stream particles, SVG leaders + labels.
   p .47-1.0  2D die floorplan ([data-die-canvas]) zooming x1 -> x24 through the
              stops of SPEC §8, with a tiled level-of-detail painter so the
              silicon stays sharp at every scale, plus the live effects (CPU load
              pulses, GPU graphics/AI modes, the Neural Accelerator MAC wave,
              Neural Engine keystroke ripples), hover tips and click-to-zoom.
   Timelines tween ChipScene.state only; THREE arrives later via APP.whenThree().
   Classic script, no import/export.
   ========================================================================== */
(function (win, doc) {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function logLerp(a, b, t) { return a * Math.pow(b / a, t); }
  function now() { return win.performance ? win.performance.now() : Date.now(); }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function h2(x, y) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function qs(s, r) { return (r || doc).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }

  /* ------------------------------------------------------- public object */
  var STOPS = [
    { key: 'full', cx: 500, cy: 430, s: 1, hud: 'Package' },
    { key: 'cpu', cx: 180, cy: 260, s: 2.6, hud: 'CPU · 10 cores' },
    { key: 'gpu', cx: 655, cy: 260, s: 1.6, hud: 'GPU · 10 cores' },
    { key: 'core7', cx: 533, cy: 370, s: 6, hud: 'Core 7 of 10' },
    { key: 'na', cx: 533, cy: 438, s: 24, hud: 'Neural Accelerator' },
    { key: 'ne', cx: 230, cy: 665, s: 2.6, hud: 'Neural Engine · 16 cores' },
    { key: 'full', cx: 500, cy: 430, s: 1, hud: 'Whole die' }
  ];
  var S = {
    rot: 0, explode: 0, stream: 0, rate: 1, glOpacity: 1, dieOpacity: 0, view: 0, wave: 0,
    load: 'light', gpu: 'ai', nePulse: 0
  };
  var ChipScene = win.ChipScene = {
    state: S,
    stops: STOPS,
    stopP: [0, 0.56, 0.66, 0.73, 0.79, 0.86, 0.95],
    goTo: function (i) { goTo(i); },
    ready: false,
    markDirty: function () { markDirty(); }
  };

  /* ------------------------------------------------ floorplan (SPEC §8) */
  var DW = 1000, DH = 860;
  var BLOCKS = [
    { key: 'super', name: 'Super cores', x: 40, y: 40, w: 280, h: 250, stop: 1, tip: ['4 super cores', 'Part of a 10-core CPU.'] },
    { key: 'eff', name: 'Efficiency cores', x: 40, y: 310, w: 280, h: 170, stop: 1, tip: ['6 efficiency cores', 'Part of a 10-core CPU.'] },
    { key: 'gpu', name: 'GPU', x: 350, y: 40, w: 610, h: 440, stop: 2, tip: ['10-core GPU', 'A Neural Accelerator in each core.'] },
    { key: 'ne', name: 'Neural Engine', x: 40, y: 510, w: 380, h: 310, stop: 5, tip: ['16-core Neural Engine', 'A separate block for machine learning.'] },
    { key: 'media', name: 'Media engines', x: 440, y: 510, w: 200, h: 150, stop: -1, tip: ['Media engines', 'Position illustrative.'] },
    { key: 'slc', name: 'System cache', x: 440, y: 680, w: 200, h: 140, stop: -1, tip: ['System level cache', 'Position illustrative.'] },
    { key: 'mem', name: 'Memory interface', x: 660, y: 510, w: 300, h: 140, stop: -1, tip: ['Memory interface', '153GB/s to up to 32GB of unified memory.'] },
    { key: 'io', name: 'Display and I/O', x: 660, y: 670, w: 300, h: 150, stop: -1, tip: ['Display and I/O', 'Drives up to two external displays.'] }
  ];
  var BK = {};
  BLOCKS.forEach(function (b) { BK[b.key] = b; });
  function grid(b, cols, rows, gap) {
    var out = [], cw = (b.w - (cols - 1) * gap) / cols, ch = (b.h - (rows - 1) * gap) / rows;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) out.push({ i: j * cols + i, col: i, row: j, x: b.x + i * (cw + gap), y: b.y + j * (ch + gap), w: cw, h: ch });
    return out;
  }
  var SUPERC = grid(BK.super, 2, 2, 8);
  var EFFC = grid(BK.eff, 3, 2, 8);
  var NEC = grid(BK.ne, 4, 4, 6);
  var GPUC = [];
  for (var gi = 0; gi < 10; gi++) GPUC.push({ i: gi, x: 350 + (gi % 5) * 122, y: 40 + Math.floor(gi / 5) * 220, w: 122, h: 220 });
  var ALU_H = 220 * 0.62, NA_H = 220 * 0.38;
  function aluRect(c) { return { x: c.x + 3, y: c.y + 3, w: c.w - 6, h: ALU_H - 4.5 }; }
  function naRect(c) { return { x: c.x + 3, y: c.y + ALU_H + 1.5, w: c.w - 6, h: NA_H - 4.5 }; }
  function aluCells(c) {
    var r = aluRect(c), out = [], g = 1.4, cw = (r.w - g * 7) / 8, ch = (r.h - g * 3) / 4;
    for (var j = 0; j < 4; j++) for (var i = 0; i < 8; i++) out.push({ x: r.x + i * (cw + g), y: r.y + j * (ch + g), w: cw, h: ch, i: i, j: j });
    return out;
  }
  var PHY = (function () {
    var b = BK.mem, n = 8, g = 4, lw = (b.w - g * (n + 1)) / n, out = [];
    for (var i = 0; i < n; i++) out.push({ x: b.x + g + i * (lw + g), y: b.y + 4, w: lw, h: b.h - 8 });
    return out;
  })();

  /* ------------------------------------------------------------ painter */
  // Monochrome silicon ramp (--die #0B0D10 up to a cool grey), precomputed strings.
  var TONES = [];
  (function () { for (var i = 0; i < 160; i++) { var t = Math.pow(i / 159, 1.15); TONES.push('rgb(' + ((7 + t * 150) | 0) + ',' + ((8 + t * 156) | 0) + ',' + ((10 + t * 166) | 0) + ')'); } })();
  function tone(t) { return TONES[t <= 0 ? 0 : t >= 1 ? 159 : (t * 159) | 0]; }
  function hit(C, x, y, w, h) { return x < C.x1 && x + w > C.x0 && y < C.y1 && y + h > C.y0; }

  function pLogic(ctx, x, y, w, h, seed, C, L, t0) {
    if (!hit(C, x, y, w, h)) return;
    ctx.fillStyle = tone(t0 * 0.4); ctx.fillRect(x, y, w, h);
    var rh = 1.6, rows = Math.floor(h / rh), xe = x + w;
    var r0 = Math.max(0, Math.floor((C.y0 - y) / rh)), r1 = Math.min(rows, Math.ceil((C.y1 - y) / rh));
    var cx0 = Math.max(x, C.x0), cx1 = Math.min(xe, C.x1);
    for (var r = r0; r < r1; r++) {
      var yy = y + r * rh, R = rng(seed + r * 7919);
      var xx = x + R() * 1.5;
      while (xx < xe) {
        var len = 0.7 + R() * R() * 8, br = R();
        if (xx + len > xe) len = xe - xx;
        if (xx > C.x1) break;
        if (xx + len > C.x0 && len > 0.3) {
          var t = t0 + (br - 0.5) * 0.14 + (vnoise(xx * 0.035 + seed % 97, yy * 0.035) - 0.5) * 0.22;
          ctx.fillStyle = tone(t);
          ctx.fillRect(xx, yy + 0.18, len - 0.18, rh - 0.36);
          if (L >= 11 && len > 1) {
            ctx.fillStyle = tone(t + 0.07);
            for (var g = xx + 0.28; g < xx + len - 0.3; g += 0.34) ctx.fillRect(g, yy + 0.42, 0.075, rh - 0.84);
          }
        }
        xx += len;
      }
      if (L >= 5 && cx1 > cx0) { ctx.fillStyle = tone(t0 + 0.2); ctx.fillRect(cx0, yy, cx1 - cx0, 0.1); }
    }
  }
  function pSram(ctx, x, y, w, h, seed, C, L, cols, rows, t0) {
    if (!hit(C, x, y, w, h)) return;
    t0 = t0 == null ? 0.2 : t0;
    ctx.fillStyle = tone(0.04); ctx.fillRect(x, y, w, h);
    var g = 0.8, sp = 1.4, cw = (w - g * (cols + 1)) / cols, ch = (h - g * (rows + 1)) / rows;
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var sx = x + g + i * (cw + g), sy = y + g + j * (ch + g);
      if (!hit(C, sx, sy, cw, ch)) continue;
      var t = t0 + h2(seed + i * 131, j * 17 + 3) * 0.05, half = (cw - sp) / 2;
      ctx.fillStyle = tone(t); ctx.fillRect(sx, sy, half, ch); ctx.fillRect(sx + half + sp, sy, half, ch);
      ctx.fillStyle = tone(t + 0.15); ctx.fillRect(sx + half + 0.25, sy, sp - 0.5, ch);
      var ya = Math.max(sy, C.y0), yb = Math.min(sy + ch, C.y1);
      if (L >= 2.5) {
        ctx.fillStyle = tone(t - 0.07);
        for (var ly = sy + Math.max(0, Math.ceil((ya - sy) / 0.9)) * 0.9; ly < yb; ly += 0.9) { ctx.fillRect(sx, ly, half, 0.3); ctx.fillRect(sx + half + sp, ly, half, 0.3); }
      }
      if (L >= 11) {
        ctx.fillStyle = tone(t + 0.045);
        var xa = Math.max(sx, C.x0), xb = Math.min(sx + cw, C.x1);
        for (var lx = sx + Math.max(0, Math.ceil((xa - sx) / 0.55)) * 0.55; lx < xb; lx += 0.55) {
          if (lx > sx + half - 0.1 && lx < sx + half + sp) continue;
          ctx.fillRect(lx, ya, 0.09, yb - ya);
        }
      }
      ctx.fillStyle = tone(t + 0.24); ctx.fillRect(sx, sy + ch - 0.7, cw, 0.7);
    }
  }
  function pLanes(ctx, x, y, w, h, seed, C, L, n, t0) {
    if (!hit(C, x, y, w, h)) return;
    var R = rng(seed), lw = w / n;
    ctx.fillStyle = tone(0.05); ctx.fillRect(x, y, w, h);
    for (var i = 0; i < n; i++) {
      var lx = x + i * lw, t = t0 + R() * 0.06;
      if (lx > C.x1 || lx + lw < C.x0) continue;
      ctx.fillStyle = tone(t); ctx.fillRect(lx + 0.2, y + 0.3, lw - 0.4, h - 0.6);
      var Rs = rng(seed + 97 * i + 3);
      ctx.fillStyle = tone(t + 0.13);
      for (var yy = y + 1.2; yy < y + h - 0.8; yy += 2.2 + Rs() * 3) if (yy > C.y0 - 1 && yy < C.y1) ctx.fillRect(lx + 0.2, yy, lw - 0.4, 0.42);
      if (L >= 10) {
        ctx.fillStyle = tone(t - 0.04);
        var ya = Math.max(y, C.y0), yb = Math.min(y + h, C.y1);
        for (var k = lx + 0.5; k < lx + lw - 0.4; k += 0.5) ctx.fillRect(k, ya, 0.07, yb - ya);
      }
    }
  }
  function pMacTex(ctx, x, y, w, h, nx, ny, seed, C, L, t0) {
    if (!hit(C, x, y, w, h)) return;
    ctx.fillStyle = tone(0.03); ctx.fillRect(x, y, w, h);
    var cw = w / nx, ch = h / ny;
    var i0 = Math.max(0, Math.floor((C.x0 - x) / cw)), i1 = Math.min(nx, Math.ceil((C.x1 - x) / cw));
    var j0 = Math.max(0, Math.floor((C.y0 - y) / ch)), j1 = Math.min(ny, Math.ceil((C.y1 - y) / ch));
    for (var i = i0; i < i1; i++) for (var j = j0; j < j1; j++) {
      var cx = x + i * cw, cy = y + j * ch, t = t0 + h2(i + seed, j) * 0.06;
      ctx.fillStyle = tone(t); ctx.fillRect(cx + cw * 0.08, cy + ch * 0.1, cw * 0.84, ch * 0.8);
      ctx.fillStyle = tone(t + 0.09); ctx.fillRect(cx + cw * 0.16, cy + ch * 0.2, cw * 0.46, ch * 0.42);
      ctx.fillStyle = tone(t + 0.16); ctx.fillRect(cx + cw * 0.16, cy + ch * 0.7, cw * 0.68, ch * 0.1);
      if (L >= 14) {
        ctx.fillStyle = tone(t + 0.04);
        ctx.fillRect(cx + cw * 0.68, cy + ch * 0.2, cw * 0.12, ch * 0.42);
      }
    }
  }
  function pSpiral(ctx, cx, cy, r, turns, lw, col) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    var s = r; ctx.moveTo(cx - s, cy - s);
    for (var k = 0; k < turns; k++) {
      var a = r - k * (r / turns) * 0.95, b = r - (k + 0.5) * (r / turns) * 0.95;
      ctx.lineTo(cx + a, cy - a); ctx.lineTo(cx + a, cy + a); ctx.lineTo(cx - b, cy + a); ctx.lineTo(cx - b, cy - b);
    }
    ctx.stroke();
  }

  // The whole die, in die units, culled to C, with detail for L px/unit.
  function paintDie(ctx, C, L) {
    ctx.save();
    // body + pad ring
    ctx.fillStyle = '#0D1014'; ctx.fillRect(0, 0, DW, DH);
    var ry0 = Math.max(0, Math.floor(C.y0 / 2.4)), ry1 = Math.min(DH / 2.4, Math.ceil(C.y1 / 2.4));
    ctx.fillStyle = tone(0.055);
    for (var r = ry0; r < ry1; r++) ctx.fillRect(Math.max(0, C.x0), r * 2.4, Math.min(DW, C.x1) - Math.max(0, C.x0), 0.55);
    ctx.strokeStyle = tone(0.34); ctx.lineWidth = 0.9; ctx.strokeRect(2.5, 2.5, DW - 5, DH - 5);
    ctx.strokeStyle = tone(0.2); ctx.lineWidth = 0.6; ctx.strokeRect(6, 6, DW - 12, DH - 12);
    var p, pw = 7;
    for (p = 16; p < DW - 16; p += 12) {
      if (p + pw < C.x0 || p > C.x1) continue;
      if (C.y0 < 30) { ctx.fillStyle = tone(0.3); ctx.fillRect(p, 12, pw, pw); ctx.fillStyle = tone(0.12); ctx.fillRect(p + 1, 23, pw - 2, 11); }
      if (C.y1 > DH - 30) { ctx.fillStyle = tone(0.3); ctx.fillRect(p, DH - 19, pw, pw); ctx.fillStyle = tone(0.12); ctx.fillRect(p + 1, DH - 34, pw - 2, 11); }
    }
    for (p = 16; p < DH - 16; p += 12) {
      if (p + pw < C.y0 || p > C.y1) continue;
      if (C.x0 < 30) { ctx.fillStyle = tone(0.3); ctx.fillRect(12, p, pw, pw); ctx.fillStyle = tone(0.12); ctx.fillRect(23, p + 1, 11, pw - 2); }
      if (C.x1 > DW - 30) { ctx.fillStyle = tone(0.3); ctx.fillRect(DW - 19, p, pw, pw); ctx.fillStyle = tone(0.12); ctx.fillRect(DW - 34, p + 1, 11, pw - 2); }
    }
    // CPU: super cores
    SUPERC.forEach(function (c, k) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 1000 + k * 50;
      ctx.fillStyle = tone(0.03); ctx.fillRect(c.x, c.y, c.w, c.h);
      pSram(ctx, c.x + 4, c.y + 4, c.w * 0.46 - 6, 30, s + 1, C, L, 3, 3, 0.2);
      pSram(ctx, c.x + c.w * 0.46 + 2, c.y + 4, c.w * 0.54 - 6, 30, s + 2, C, L, 3, 3, 0.2);
      pLogic(ctx, c.x + 4, c.y + 38, c.w - 8, 40, s + 3, C, L, 0.3);
      pLanes(ctx, c.x + 4, c.y + 82, c.w * 0.58 - 6, 35, s + 4, C, L, 20, 0.24);
      pLogic(ctx, c.x + c.w * 0.58 + 2, c.y + 82, c.w * 0.42 - 6, 35, s + 5, C, L, 0.34);
    });
    // CPU: efficiency cores
    EFFC.forEach(function (c, k) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 2000 + k * 50;
      ctx.fillStyle = tone(0.03); ctx.fillRect(c.x, c.y, c.w, c.h);
      pSram(ctx, c.x + 3, c.y + 3, c.w - 6, 16, s + 1, C, L, 3, 2, 0.18);
      pLogic(ctx, c.x + 3, c.y + 22, c.w - 6, 36, s + 2, C, L, 0.28);
      pLanes(ctx, c.x + 3, c.y + 61, c.w - 6, c.h - 64, s + 3, C, L, 14, 0.22);
    });
    // GPU
    GPUC.forEach(function (c) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 3000 + c.i * 100;
      ctx.fillStyle = tone(0.02); ctx.fillRect(c.x, c.y, c.w, c.h);
      aluCells(c).forEach(function (a, k) {
        if (!hit(C, a.x, a.y, a.w, a.h)) return;
        pLanes(ctx, a.x, a.y, a.w, a.h * 0.78, s + k, C, L, 5, 0.25);
        pSram(ctx, a.x, a.y + a.h * 0.8, a.w, a.h * 0.2, s + 50 + k, C, L, 1, 1, 0.19);
      });
      var nr = naRect(c);
      pLogic(ctx, c.x + 3, nr.y - 1.4, c.w - 6, 1.2, s + 90, C, L, 0.3);
      pMacTex(ctx, nr.x, nr.y, nr.w, nr.h, 32, 32, s + 91, C, L, 0.16);
    });
    // Neural Engine
    NEC.forEach(function (c, k) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 4000 + k * 40;
      ctx.fillStyle = tone(0.03); ctx.fillRect(c.x, c.y, c.w, c.h);
      pLogic(ctx, c.x + 3, c.y + 3, c.w - 6, 9, s, C, L, 0.3);
      pMacTex(ctx, c.x + 3, c.y + 15, c.w * 0.62 - 4, c.h - 18, 12, 10, s + 1, C, L, 0.18);
      pSram(ctx, c.x + c.w * 0.62 + 2, c.y + 15, c.w * 0.38 - 5, c.h - 18, s + 2, C, L, 2, 4, 0.2);
    });
    // Media engines
    (function (b) {
      if (!hit(C, b.x, b.y, b.w, b.h)) return;
      pLogic(ctx, b.x + 3, b.y + 3, b.w * 0.55 - 5, b.h - 6, 5001, C, L, 0.3);
      pLanes(ctx, b.x + b.w * 0.55 + 1, b.y + 3, b.w * 0.45 - 4, b.h * 0.45, 5002, C, L, 16, 0.24);
      pSram(ctx, b.x + b.w * 0.55 + 1, b.y + b.h * 0.45 + 6, b.w * 0.45 - 4, b.h * 0.55 - 9, 5003, C, L, 3, 3, 0.2);
    })(BK.media);
    // System cache
    (function (b) {
      if (!hit(C, b.x, b.y, b.w, b.h)) return;
      pSram(ctx, b.x + 3, b.y + 3, b.w * 0.5 - 6, b.h - 6, 6001, C, L, 2, 4, 0.22);
      pLogic(ctx, b.x + b.w * 0.5 - 2, b.y + 3, 4, b.h - 6, 6002, C, L, 0.3);
      pSram(ctx, b.x + b.w * 0.5 + 3, b.y + 3, b.w * 0.5 - 6, b.h - 6, 6003, C, L, 2, 4, 0.22);
    })(BK.slc);
    // Memory interface: 8 PHY lanes
    PHY.forEach(function (l, k) {
      if (!hit(C, l.x, l.y, l.w, l.h)) return;
      var s = 7000 + k * 20;
      ctx.fillStyle = tone(0.04); ctx.fillRect(l.x, l.y, l.w, l.h);
      var fx0 = Math.max(l.x + 1, C.x0), fx1 = Math.min(l.x + l.w - 1, C.x1);
      for (var f = l.x + 1.2; f < l.x + l.w - 1; f += 1.3) {
        if (f < fx0 - 1.3 || f > fx1) continue;
        var tt = 0.32 + h2(f * 10 | 0, k) * 0.12;
        ctx.fillStyle = tone(tt); ctx.fillRect(f, l.y + 2, 0.75, l.h * 0.46);
        ctx.fillStyle = tone(tt - 0.12); ctx.fillRect(f, l.y + 4 + l.h * 0.46, 0.75, l.h * 0.12);
      }
      ctx.strokeStyle = tone(0.34); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(l.x + l.w / 2, l.y + l.h * 0.72, l.w * 0.26, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(l.x + l.w / 2, l.y + l.h * 0.72, l.w * 0.16, 0, Math.PI * 2); ctx.stroke();
      pLogic(ctx, l.x + 2, l.y + l.h * 0.87, l.w - 4, l.h * 0.12, s, C, L, 0.28);
    });
    // Display and I/O
    (function (b) {
      if (!hit(C, b.x, b.y, b.w, b.h)) return;
      pLogic(ctx, b.x + 3, b.y + 3, b.w * 0.42, b.h - 6, 8001, C, L, 0.3);
      pSram(ctx, b.x + b.w * 0.42 + 6, b.y + 3, b.w * 0.16, b.h - 6, 8002, C, L, 1, 5, 0.2);
      for (var k = 0; k < 4; k++) {
        var lx = b.x + b.w * 0.6 + 2 + k * ((b.w * 0.4 - 6) / 4), lw = (b.w * 0.4 - 6) / 4 - 3;
        if (!hit(C, lx, b.y, lw, b.h)) continue;
        ctx.fillStyle = tone(0.05); ctx.fillRect(lx, b.y + 3, lw, b.h - 6);
        pSpiral(ctx, lx + lw / 2, b.y + 26, lw * 0.4, 4, 0.9, tone(0.42));
        pSpiral(ctx, lx + lw / 2, b.y + 70, lw * 0.4, 4, 0.9, tone(0.42));
        pLanes(ctx, lx + 1, b.y + 98, lw - 2, b.h - 104, 8100 + k, C, L, 6, 0.24);
      }
    })(BK.io);
    // thin-film tints per region (copper on logic + Neural Accelerators, teal on SRAM + ALUs), alpha <= .18
    ctx.globalCompositeOperation = 'overlay';
    function tint(r, col) { if (hit(C, r.x, r.y, r.w, r.h)) { ctx.fillStyle = col; ctx.fillRect(r.x, r.y, r.w, r.h); } }
    var CU = 'rgba(184,116,63,0.18)', TE = 'rgba(47,111,106,0.18)', CUs = 'rgba(184,116,63,0.1)', TEs = 'rgba(47,111,106,0.12)';
    GPUC.forEach(function (c) { tint(aluRect(c), TEs); tint(naRect(c), CU); });
    SUPERC.forEach(function (c) { tint(c, CUs); });
    EFFC.forEach(function (c) { tint(c, TEs); });
    NEC.forEach(function (c) { tint(c, CUs); });
    tint(BK.slc, TE); tint(BK.media, CUs); tint(BK.io, TEs); PHY.forEach(function (l) { tint(l, CU); });
    // top-metal power straps: faint vertical bands across the whole die
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(160,170,185,0.035)';
    for (var sx = 20; sx < DW - 20; sx += 18) { if (sx + 1.6 < C.x0 || sx > C.x1) continue; ctx.fillRect(sx, Math.max(12, C.y0), 1.6, Math.min(DH - 12, C.y1) - Math.max(12, C.y0)); }
    // thin-film sheen: copper and teal, alpha <= .18 (canvas only)
    var gA = ctx.createLinearGradient(0, 0, DW, DH);
    gA.addColorStop(0, 'rgba(184,116,63,0.16)'); gA.addColorStop(0.32, 'rgba(184,116,63,0)');
    gA.addColorStop(0.62, 'rgba(47,111,106,0)'); gA.addColorStop(1, 'rgba(47,111,106,0.17)');
    ctx.fillStyle = gA; ctx.fillRect(Math.max(0, C.x0), Math.max(0, C.y0), Math.min(DW, C.x1) - Math.max(0, C.x0), Math.min(DH, C.y1) - Math.max(0, C.y0));
    var gB = ctx.createRadialGradient(700, 180, 0, 700, 180, 520);
    gB.addColorStop(0, 'rgba(47,111,106,0.12)'); gB.addColorStop(1, 'rgba(47,111,106,0)');
    ctx.fillStyle = gB; ctx.fillRect(Math.max(0, C.x0), Math.max(0, C.y0), Math.min(DW, C.x1) - Math.max(0, C.x0), Math.min(DH, C.y1) - Math.max(0, C.y0));
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /* ------------------------------------------------------ module state */
  var A = null, gsap = null, ST = null;
  var RM = false, MOBILE = false, TOUCH = false;
  var sec, stage, glCanvas, dieCanvas, dctx, leadersSvg, labelEls = {}, tipEl, tipTitle, tipBody;
  var stepEls = [], controlEls = {}, stopBtns = [], hudLabel, hudZoom, stepperEl, prevBtn, nextBtn, neInput;
  var tl = null, pinST = null;
  var visible = false, dirty = true, lastT = 0;
  var cw = 1, ch = 1, dieDpr = 1, glDpr = 1;
  var baseCanvas = null, baseScale = 4;
  var activeStep = -1, activeStop = -1, hudText = '', zoomText = '';
  var LY = { tim: 0, die: 0, mem: 0, sub: 0, bga: 0 };
  var CAM = { m: 0 };
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, inside: false, sx: -1, sy: -1 };
  var hover = null, hoverAmt = 0, pinnedTip = false;
  var nePulses = [];
  var waveLoopT0 = 0;
  var glFailed = false, gl = null;
  var perf = { acc: 0, n: 0, steps: 0 };
  var lastGlOp = -1, lastDieOp = -1;

  function markDirty() { dirty = true; }

  /* ------------------------------------------------------------ tiles */
  var TILE = 256, tiles = new Map(), tileOrder = [], TILE_CAP = 220;
  function tileKey(l, x, y) { return l + ':' + x + ':' + y; }
  function getTile(level, tx, ty, gen) {
    var k = tileKey(level, tx, ty), t = tiles.get(k);
    if (t) return t;
    if (!gen) return null;
    var c = doc.createElement('canvas'); c.width = TILE; c.height = TILE;
    var x = c.getContext('2d'), u = TILE / level;
    x.setTransform(level, 0, 0, level, -tx * u * level, -ty * u * level);
    paintDie(x, { x0: tx * u - 1, y0: ty * u - 1, x1: (tx + 1) * u + 1, y1: (ty + 1) * u + 1 }, level);
    tiles.set(k, c); tileOrder.push(k);
    if (tileOrder.length > TILE_CAP) { var old = tileOrder.shift(); var oc = tiles.get(old); if (oc) { oc.width = oc.height = 0; } tiles.delete(old); }
    return c;
  }

  function buildBase() {
    var w = MOBILE ? 2048 : 4096;
    baseCanvas = doc.createElement('canvas');
    baseCanvas.width = w; baseCanvas.height = Math.round(w * DH / DW);
    baseScale = w / DW;
    var x = baseCanvas.getContext('2d');
    x.setTransform(baseScale, 0, 0, baseScale, 0, 0);
    paintDie(x, { x0: 0, y0: 0, x1: DW, y1: DH }, baseScale);
  }

  /* ------------------------------------------------------------ view */
  function viewAt(v) {
    v = clamp(v, 0, STOPS.length - 1);
    var i = Math.min(STOPS.length - 2, Math.floor(v)), f = v - i, a = STOPS[i], b = STOPS[i + 1];
    return { cx: lerp(a.cx, b.cx, f), cy: lerp(a.cy, b.cy, f), s: logLerp(a.s, b.s, f) };
  }
  function baseFit() { return Math.min(cw * 0.9 / DW, ch * 0.9 / DH); }
  var VIEW = { k: 1, ox: 0, oy: 0, s: 1 };
  // free frame between the copy column and the HUD, so the subject is never parked under text
  var FR = { offX: 0, offY: 0, copyR: 0, copyL: 0, copyT: 0, hudL: 1e5, copyB: 0, hudT: 1e5 };
  function computeFrame() {
    var el = stage || sec; if (!el) return;
    var sr = el.getBoundingClientRect();
    var copy = qs('.chip__copy', sec), hud = qs('.chip__hud', sec);
    var cr = copy ? copy.getBoundingClientRect() : null, hr = hud ? hud.getBoundingClientRect() : null;
    FR.copyR = cr && cr.width ? cr.right - sr.left : 0;
    FR.hudL = hr && hr.width ? hr.left - sr.left : cw;
    FR.copyB = cr && cr.height ? cr.bottom - sr.top : 0;
    FR.copyT = cr && cr.height ? cr.top - sr.top : 0;
    FR.copyL = cr && cr.width ? cr.left - sr.left : 0;
    FR.hudT = hr && hr.height ? hr.top - sr.top : ch;
    if (cw >= 900 && FR.copyR > 0 && FR.copyR < cw * 0.6) {
      FR.offX = clamp(((FR.copyR + Math.min(FR.hudL, cw)) / 2 - cw / 2) * 0.85, -240, 240); FR.offY = 0;
    } else {
      FR.offX = 0;
      FR.offY = (FR.copyB > 0 && FR.hudT < ch) ? clamp(((FR.copyB + FR.hudT) / 2 - ch / 2) * 0.8, -160, 160) : 0;
    }
  }
  function computeView() {
    var v = viewAt(S.view), k = baseFit() * v.s;
    VIEW.k = k; VIEW.s = v.s; VIEW.ox = cw / 2 + FR.offX - v.cx * k; VIEW.oy = ch / 2 + FR.offY - v.cy * k;
    return VIEW;
  }
  function toDie(px, py) { return { x: (px - VIEW.ox) / VIEW.k, y: (py - VIEW.oy) / VIEW.k }; }

  /* ------------------------------------------------------ 2D die frame */
  var MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
  var genPending = false;

  function drawDie2D(t, alpha) {
    if (!dctx) return;
    var V = computeView(), dpr = dieDpr, ctx = dctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);
    if (alpha > 0.002) {
      ctx.globalAlpha = alpha;
      drawDieContent(ctx, t, V, dpr);
      ctx.globalAlpha = 1;
    }
    drawScrims(ctx);
  }
  function drawDieContent(ctx, t, V, dpr) {
    var k = V.k;
    var vx0 = -V.ox / k, vy0 = -V.oy / k, vx1 = (cw - V.ox) / k, vy1 = (ch - V.oy) / k;
    var sx0 = clamp(vx0, 0, DW), sy0 = clamp(vy0, 0, DH), sx1 = clamp(vx1, 0, DW), sy1 = clamp(vy1, 0, DH);
    // soft halo so the die edge separates from the section surface
    if (V.s < 1.8) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 60; ctx.fillStyle = '#0D1014';
      ctx.fillRect(V.ox, V.oy, DW * k, DH * k); ctx.restore();
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    genPending = false;
    if (sx1 > sx0 && sy1 > sy0) {
      var bs = baseScale;
      ctx.drawImage(baseCanvas, sx0 * bs, sy0 * bs, (sx1 - sx0) * bs, (sy1 - sy0) * bs, V.ox + sx0 * k, V.oy + sy0 * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
      var need = k * dpr;
      if (need > bs * 1.12) {
        var maxL = MOBILE ? 16 : 32, level = 8;
        while (level < need / 1.18 && level < maxL) level *= 2;
        var u = TILE / level, t0 = now();
        var tx0 = Math.floor(sx0 / u), tx1 = Math.floor((sx1 - 1e-6) / u), ty0 = Math.floor(sy0 / u), ty1 = Math.floor((sy1 - 1e-6) / u);
        var list = [];
        for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) list.push([tx, ty, Math.abs((tx + 0.5) * u - (vx0 + vx1) / 2) + Math.abs((ty + 0.5) * u - (vy0 + vy1) / 2)]);
        list.sort(function (a, b) { return a[2] - b[2]; });
        for (var q = 0; q < list.length; q++) {
          var tx2 = list[q][0], ty2 = list[q][1];
          var tile = getTile(level, tx2, ty2, now() - t0 < 7);
          if (!tile) { genPending = true; continue; }
          var dx0 = Math.round((V.ox + tx2 * u * k) * dpr) / dpr, dy0 = Math.round((V.oy + ty2 * u * k) * dpr) / dpr;
          var dx1 = Math.round((V.ox + (tx2 + 1) * u * k) * dpr) / dpr, dy1 = Math.round((V.oy + (ty2 + 1) * u * k) * dpr) / dpr;
          ctx.drawImage(tile, dx0, dy0, dx1 - dx0, dy1 - dy0);
        }
      }
    }
    // overlays in die units
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.ox, dpr * V.oy);
    var px = 1 / k; // one CSS pixel in die units
    drawEffects(ctx, t, V, px, { x0: vx0, y0: vy0, x1: vx1, y1: vy1 });
    drawStructure(ctx, V, px);
    drawFocus(ctx, V, px);
    drawHover(ctx, px);
    // screen space: light band, vignette, labels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLight(ctx, V);
    drawLabels(ctx, V);
  }

  function drawLight(ctx, V) {
    var a0 = ctx.globalAlpha;
    // a broad specular band that drifts as the camera moves, like light glancing off polished silicon
    var cx = cw * (0.5 + 0.42 * Math.sin(S.view * 0.85 + 0.6)) + FR.offX, cy = ch * 0.45, L = Math.max(cw, ch) * 0.55;
    var g = ctx.createLinearGradient(cx - L * 0.6, cy + L * 0.5, cx + L * 0.6, cy - L * 0.5);
    g.addColorStop(0, 'rgba(236,238,242,0)'); g.addColorStop(0.46, 'rgba(236,238,242,0.02)');
    g.addColorStop(0.5, 'rgba(236,238,242,0.1)'); g.addColorStop(0.56, 'rgba(236,238,242,0.02)'); g.addColorStop(1, 'rgba(236,238,242,0)');
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    // vignette
    var R0 = Math.hypot(cw, ch) / 2, vx = cw / 2 + FR.offX, vy = ch / 2 + FR.offY;
    var v = ctx.createRadialGradient(vx, vy, R0 * 0.38, vx, vy, R0 * 1.05);
    v.addColorStop(0, 'rgba(6,6,7,0)'); v.addColorStop(1, 'rgba(6,6,7,0.6)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = a0;
  }
  function drawScrims(ctx) {
    // keeps the copy column and the HUD legible over the silicon
    if (FR.offX) {
      var cx0 = FR.copyL + (FR.copyR - FR.copyL) * 0.42, cy0 = (FR.copyT + FR.copyB) / 2;
      var rx = (FR.copyR - FR.copyL) * 0.5 + 190, ry = Math.max(220, (FR.copyB - FR.copyT) * 0.5 + 170);
      ctx.save(); ctx.translate(cx0, cy0); ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(11,13,16,0.86)'); g.addColorStop(0.55, 'rgba(11,13,16,0.72)'); g.addColorStop(1, 'rgba(11,13,16,0)');
      ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
      var g0 = ctx.createLinearGradient(0, 0, FR.copyL + 40, 0);
      g0.addColorStop(0, 'rgba(11,13,16,0.55)'); g0.addColorStop(1, 'rgba(11,13,16,0)');
      ctx.fillStyle = g0; ctx.fillRect(0, 0, FR.copyL + 40, ch);
      var x0 = Math.max(cw * 0.5, Math.min(FR.hudL, cw) - 140);
      var g2 = ctx.createLinearGradient(cw, 0, x0, 0);
      g2.addColorStop(0, 'rgba(11,13,16,0.82)'); g2.addColorStop(0.45, 'rgba(11,13,16,0.6)'); g2.addColorStop(1, 'rgba(11,13,16,0)');
      ctx.fillStyle = g2; ctx.fillRect(x0, 0, cw - x0, ch);
    } else {
      var y1 = Math.min(ch * 0.5, FR.copyB + 70);
      if (y1 > 0) { var g3 = ctx.createLinearGradient(0, 0, 0, y1); g3.addColorStop(0, 'rgba(11,13,16,0.9)'); g3.addColorStop(0.75, 'rgba(11,13,16,0.6)'); g3.addColorStop(1, 'rgba(11,13,16,0)'); ctx.fillStyle = g3; ctx.fillRect(0, 0, cw, y1); }
      var y0 = Math.max(ch * 0.5, FR.hudT - 90);
      if (y0 < ch) { var g4 = ctx.createLinearGradient(0, ch, 0, y0); g4.addColorStop(0, 'rgba(11,13,16,0.92)'); g4.addColorStop(0.6, 'rgba(11,13,16,0.7)'); g4.addColorStop(1, 'rgba(11,13,16,0)'); ctx.fillStyle = g4; ctx.fillRect(0, y0, cw, ch - y0); }
    }
  }

  function strokeR(ctx, r, px, col, wpx) { ctx.strokeStyle = col; ctx.lineWidth = px * (wpx || 1); ctx.strokeRect(r.x + px * 0.5, r.y + px * 0.5, r.w - px, r.h - px); }

  function bevel(ctx, r, px, hiA, loA) {
    ctx.fillStyle = 'rgba(236,238,242,' + hiA + ')';
    ctx.fillRect(r.x, r.y, r.w, px); ctx.fillRect(r.x, r.y, px, r.h);
    ctx.fillStyle = 'rgba(0,0,0,' + loA + ')';
    ctx.fillRect(r.x, r.y + r.h - px, r.w, px); ctx.fillRect(r.x + r.w - px, r.y, px, r.h);
  }
  function drawStructure(ctx, V, px) {
    var k = V.k;
    BLOCKS.forEach(function (b) { bevel(ctx, { x: b.x - px, y: b.y - px, w: b.w + 2 * px, h: b.h + 2 * px }, px, 0.1, 0.55); });
    if (k * 122 > 60) GPUC.forEach(function (c) { bevel(ctx, c, px, 0.06, 0.5); });
    strokeR(ctx, { x: 0, y: 0, w: DW, h: DH }, px, 'rgba(236,238,242,0.16)');
    BLOCKS.forEach(function (b) {
      strokeR(ctx, b, px, 'rgba(236,238,242,0.16)');
      if (b.w * k <= 120) return;
      var kids = b.key === 'super' ? SUPERC : b.key === 'eff' ? EFFC : b.key === 'ne' ? NEC : b.key === 'gpu' ? GPUC : b.key === 'mem' ? PHY : null;
      if (!kids) return;
      kids.forEach(function (c) {
        strokeR(ctx, c, px, '#1E232A');
        if (b.key === 'gpu' && c.w * k > 120) {
          strokeR(ctx, naRect(c), px, '#262C35');
          strokeR(ctx, aluRect(c), px, '#1E232A');
        }
      });
    });
  }

  function macCells(ctx, r, V, px, C, fn) {
    var nx = 32, ny = 32, cwu = r.w / nx, chu = r.h / ny;
    var i0 = Math.max(0, Math.floor((C.x0 - r.x) / cwu)), i1 = Math.min(nx, Math.ceil((C.x1 - r.x) / cwu));
    var j0 = Math.max(0, Math.floor((C.y0 - r.y) / chu)), j1 = Math.min(ny, Math.ceil((C.y1 - r.y) / chu));
    for (var i = i0; i < i1; i++) for (var j = j0; j < j1; j++) fn(i, j, r.x + i * cwu, r.y + j * chu, cwu, chu);
  }

  function waveValue(t) {
    // scrubbed 0->1 on approach; loops while stop 4 is active
    var w = S.wave;
    if (Math.abs(S.view - 4) < 0.35 && w >= 0.999 && !RM) {
      if (!waveLoopT0) waveLoopT0 = t;
      var ph = (((t - waveLoopT0) / 2400) + 0.82) % 1;
      return { w: ph / 0.82, fade: 1 - sstep(0.84, 1, ph) };
    }
    waveLoopT0 = 0;
    return { w: w, fade: 1 };
  }

  function drawEffects(ctx, t, V, px, C) {
    var k = V.k, time = t / 1000;
    // CPU load pulses (text-dark, never accent)
    var cpuAmt = RM ? (S.view === 1 ? 1 : 0) : clamp(1 - Math.abs(S.view - 1) * 1.4, 0, 1);
    if (cpuAmt > 0.01) {
      var cores = S.load === 'heavy' ? SUPERC.concat(EFFC) : EFFC;
      ctx.globalCompositeOperation = 'lighter';
      cores.forEach(function (c, i) {
        var ph = h2(i, cores.length) * 6.28, sp = 2.4 + h2(i + 5, 3) * 2.6;
        var a = RM ? 0.7 : (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * sp + ph), 4));
        a *= cpuAmt;
        var gx = c.x + c.w / 2, gy = c.y + c.h / 2, gr = Math.max(c.w, c.h) * 0.75;
        var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, 'rgba(245,245,247,' + (0.26 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(245,245,247,' + (0.05 * a).toFixed(3) + ')');
        ctx.fillStyle = g; ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = 'rgba(245,245,247,' + (0.55 * cpuAmt).toFixed(3) + ')'; ctx.lineWidth = px;
        ctx.strokeRect(c.x + px / 2, c.y + px / 2, c.w - px, c.h - px);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    // GPU modes
    var gpuAmt = RM ? (S.view >= 2 && S.view <= 4 ? 1 : 0) : clamp(1 - Math.max(0, Math.max(1.6 - S.view, S.view - 4.4)) * 2, 0, 1);
    if (gpuAmt > 0.01) {
      if (S.gpu === 'graphics') {
        ctx.globalCompositeOperation = 'lighter';
        GPUC.forEach(function (c) {
          if (!hit(C, c.x, c.y, c.w, c.h)) return;
          aluCells(c).forEach(function (a, n) {
            var fl = RM ? 1 : 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(time * 4.2 - (a.j * 0.9 + a.i * 0.35) + c.i * 1.3), 2);
            ctx.fillStyle = 'rgba(245,245,247,' + (0.4 * 0.6 * fl * gpuAmt).toFixed(3) + ')';
            ctx.fillRect(a.x, a.y, a.w, a.h * 0.78);
          });
        });
        ctx.globalCompositeOperation = 'source-over';
      } else {
        var wv = RM ? { w: 1, fade: 1 } : waveValue(t);
        var ww = wv.w * 1.3;
        if (ww > 0 && wv.fade > 0.01) {
          GPUC.forEach(function (c) {
            var r = naRect(c);
            if (!hit(C, r.x, r.y, r.w, r.h)) return;
            if (V.s > 12) {
              var ga = ctx.globalAlpha;
              macCells(ctx, r, V, px, C, function (i, j, x, y, w, h) {
                var b = sstep(0, 0.15, ww - (i + j) / 62) * wv.fade;
                // crisp MAC cell, drawn every frame above x12: multiplier array, adder, accumulator
                ctx.fillStyle = tone(0.07); ctx.fillRect(x, y, w, h);
                ctx.fillStyle = tone(0.13 + h2(i, j) * 0.04); ctx.fillRect(x + w * 0.05, y + h * 0.08, w * 0.9, h * 0.84);
                var mx = x + w * 0.1, my = y + h * 0.16, mw = w * 0.56, mh = h * 0.5;
                for (var a = 0; a < 4; a++) for (var q = 0; q < 3; q++) {
                  ctx.fillStyle = tone(0.3 + h2(i * 7 + a, j * 5 + q) * 0.1);
                  ctx.fillRect(mx + a * mw / 4 + px, my + q * mh / 3 + px, mw / 4 - 2 * px, mh / 3 - 2 * px);
                }
                ctx.fillStyle = tone(0.22); ctx.fillRect(x + w * 0.71, y + h * 0.16, w * 0.19, h * 0.5);
                ctx.fillStyle = tone(0.4); ctx.fillRect(x + w * 0.1, y + h * 0.74, w * 0.8, h * 0.09);
                ctx.fillStyle = tone(0.18); ctx.fillRect(x, y + h * 0.4, w, px * 1.2); ctx.fillRect(x + w * 0.4, y, px * 1.2, h);
                if (b > 0.004) {
                  ctx.globalCompositeOperation = 'lighter';
                  ctx.fillStyle = 'rgba(242,163,58,' + (0.12 * b).toFixed(3) + ')'; ctx.fillRect(x, y, w, h);
                  ctx.fillStyle = 'rgba(242,163,58,' + (0.5 * b).toFixed(3) + ')'; ctx.fillRect(mx, my, mw, mh);
                  ctx.fillStyle = 'rgba(242,163,58,' + (0.3 * b).toFixed(3) + ')'; ctx.fillRect(x + w * 0.71, y + h * 0.16, w * 0.19, h * 0.5);
                  ctx.fillStyle = 'rgba(242,163,58,' + (0.85 * b).toFixed(3) + ')'; ctx.fillRect(x + w * 0.1, y + h * 0.74, w * 0.8, h * 0.09);
                  ctx.globalCompositeOperation = 'source-over';
                }
              });
              ctx.globalAlpha = ga;
            } else {
              // coarse: diagonal accent sweep across the block
              var steps = 16, sw = r.w / steps, sh = r.h / steps;
              for (var a = 0; a < steps; a++) for (var bj = 0; bj < steps; bj++) {
                var b2 = sstep(0, 0.15, ww - (a + bj) * 2 / 62) * wv.fade;
                if (b2 < 0.01) continue;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = 'rgba(242,163,58,' + (0.42 * b2).toFixed(3) + ')';
                ctx.fillRect(r.x + a * sw, r.y + bj * sh, sw - px, sh - px);
                ctx.globalCompositeOperation = 'source-over';
              }
            }
          });
        }
      }
    }
    // Neural Engine ripples from the memory interface
    if (nePulses.length) {
      var path = [[660, 540], [650, 540], [650, 495], [230, 495], [230, 510]];
      var segs = [], tot = 0;
      for (var q = 1; q < path.length; q++) { var L2 = Math.hypot(path[q][0] - path[q - 1][0], path[q][1] - path[q - 1][1]); segs.push(L2); tot += L2; }
      for (var n = nePulses.length - 1; n >= 0; n--) {
        var age = t - nePulses[n];
        if (age > 1400) { nePulses.splice(n, 1); continue; }
        var travel = RM ? 1 : clamp(age / 420, 0, 1);
        if (travel < 1) {
          var d = travel * tot, head = pointOn(path, segs, d), tail = pointOn(path, segs, Math.max(0, d - 60));
          var g = ctx.createLinearGradient(tail[0], tail[1], head[0], head[1]);
          g.addColorStop(0, 'rgba(245,245,247,0)'); g.addColorStop(1, 'rgba(245,245,247,0.95)');
          ctx.strokeStyle = g; ctx.lineWidth = Math.max(px * 2, 2.2); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tail[0], tail[1]);
          var acc = 0;
          for (var s2 = 0; s2 < segs.length; s2++) { acc += segs[s2]; if (acc > d - 60 && acc < d) ctx.lineTo(path[s2 + 1][0], path[s2 + 1][1]); }
          ctx.lineTo(head[0], head[1]); ctx.stroke();
        }
        var arrive = nePulses[n] + (RM ? 0 : 420);
        NEC.forEach(function (c) {
          var tt = t - (arrive + c.row * 40);
          if (tt < 0) return;
          var a = Math.exp(-tt / 260) * (RM ? 0.5 : 1);
          if (a < 0.01) return;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(245,245,247,' + (0.24 * a).toFixed(3) + ')'; ctx.fillRect(c.x, c.y, c.w, c.h);
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(245,245,247,' + (0.8 * a).toFixed(3) + ')'; ctx.lineWidth = px;
          ctx.strokeRect(c.x + px / 2, c.y + px / 2, c.w - px, c.h - px);
        });
      }
    }
    // pointer glint: a soft light that follows the pointer across the silicon
    if (ptr.inside && !TOUCH && !RM) {
      var pd = toDie(ptr.sx, ptr.sy), rr = 220 / k;
      var gl2 = ctx.createRadialGradient(pd.x, pd.y, 0, pd.x, pd.y, rr);
      gl2.addColorStop(0, 'rgba(245,245,247,0.06)'); gl2.addColorStop(1, 'rgba(245,245,247,0)');
      ctx.fillStyle = gl2; ctx.fillRect(pd.x - rr, pd.y - rr, rr * 2, rr * 2);
    }
  }
  function pointOn(path, segs, d) {
    for (var i = 0; i < segs.length; i++) {
      if (d <= segs[i]) { var f = segs[i] ? d / segs[i] : 0; return [lerp(path[i][0], path[i + 1][0], f), lerp(path[i][1], path[i + 1][1], f)]; }
      d -= segs[i];
    }
    return path[path.length - 1];
  }

  // the subject of each stop gets a drafting-style frame; the rest of the die dims around it
  var FOCUS = [null, [BK.super, BK.eff], [BK.gpu], [GPUC[6]], null, [BK.ne], null];
  function drawFocus(ctx, V, px) {
    var v = S.view, i = Math.round(v), f = FOCUS[i];
    if (!f) return;
    var amt = RM ? 1 : clamp(1 - Math.abs(v - i) * 2.2, 0, 1);
    if (amt < 0.01) return;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    f.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    var pad = 6 * px;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    ctx.beginPath(); ctx.rect(-DW, -DH, DW * 3, DH * 3); ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = 'rgba(6,6,7,' + (0.42 * amt).toFixed(3) + ')'; ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(245,245,247,' + (0.34 * amt).toFixed(3) + ')'; ctx.lineWidth = px;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    var tk = 14 * px; ctx.lineWidth = 1.5 * px; ctx.strokeStyle = 'rgba(245,245,247,' + (0.9 * amt).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + tk); ctx.lineTo(x0, y0); ctx.lineTo(x0 + tk, y0);
    ctx.moveTo(x1 - tk, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + tk);
    ctx.moveTo(x1, y1 - tk); ctx.lineTo(x1, y1); ctx.lineTo(x1 - tk, y1);
    ctx.moveTo(x0 + tk, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - tk);
    ctx.stroke();
  }

  function hoverRect() {
    if (!hover) return null;
    if (hover.kind === 'na') return naRect(GPUC[hover.core]);
    if (hover.kind === 'core') return GPUC[hover.core];
    return BK[hover.key];
  }
  var lastHoverRect = null;
  function drawHover(ctx, px) {
    var r = hoverRect() || lastHoverRect;
    if (hover) lastHoverRect = hoverRect();
    if (!r || hoverAmt < 0.01) return;
    ctx.fillStyle = 'rgba(245,245,247,' + (0.05 * hoverAmt).toFixed(3) + ')'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(245,245,247,' + (0.62 * hoverAmt).toFixed(3) + ')'; ctx.lineWidth = px;
    ctx.strokeRect(r.x + px / 2, r.y + px / 2, r.w - px, r.h - px);
    // corner ticks, drafting style
    var tk = 10 * px; ctx.lineWidth = px * 1.5; ctx.strokeStyle = 'rgba(245,245,247,' + (0.9 * hoverAmt).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + tk); ctx.lineTo(r.x, r.y); ctx.lineTo(r.x + tk, r.y);
    ctx.moveTo(r.x + r.w - tk, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + tk);
    ctx.moveTo(r.x + r.w, r.y + r.h - tk); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w - tk, r.y + r.h);
    ctx.moveTo(r.x + tk, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x, r.y + r.h - tk);
    ctx.stroke();
  }

  function drawLabels(ctx, V) {
    var k = V.k;
    ctx.font = '500 11px ' + MONO;
    try { ctx.letterSpacing = '0.88px'; } catch (e) { /* older engines */ }
    ctx.textBaseline = 'top';
    function lab(text, r, force, alpha) {
      var sw = r.w * k;
      if (sw <= 120 && !force) return;
      var x = V.ox + r.x * k + 8, y = V.oy + r.y * k + 8;
      var tw = ctx.measureText(text).width;
      if (tw > sw - 14) return;
      if (x > cw || y > ch || x + tw < 0 || y + 12 < 0) return;
      ctx.fillStyle = 'rgba(161,161,166,' + (alpha || 0.9) + ')';
      ctx.fillText(text, x, y);
    }
    BLOCKS.forEach(function (b) { lab(b.name.toUpperCase(), b, RM); });
    if (BK.gpu.w * k > 120) GPUC.forEach(function (c) {
      if (c.w * k > 120) {
        lab('CORE ' + (c.i + 1), { x: c.x, y: c.y + 16 / k, w: c.w, h: c.h }, false, 0.75);
        var nr = naRect(c);
        lab('NEURAL ACCELERATOR', nr, false, 0.85);
      }
    });
  }

  /* --------------------------------------------------------- hit test */
  function pickAt(px, py) {
    var d = toDie(px, py);
    if (d.x < 0 || d.y < 0 || d.x > DW || d.y > DH) return null;
    for (var i = 0; i < BLOCKS.length; i++) {
      var b = BLOCKS[i];
      if (d.x >= b.x && d.x <= b.x + b.w && d.y >= b.y && d.y <= b.y + b.h) {
        if (b.key === 'gpu' && S.view >= 1.5) {
          for (var j = 0; j < GPUC.length; j++) {
            var c = GPUC[j];
            if (d.x >= c.x && d.x <= c.x + c.w && d.y >= c.y && d.y <= c.y + c.h) {
              var nr = naRect(c);
              if (S.view >= 2.5 && d.y >= nr.y) return { kind: 'na', key: 'gpu', core: j };
              return { kind: 'core', key: 'gpu', core: j };
            }
          }
        }
        return { kind: 'block', key: b.key };
      }
    }
    return null;
  }
  function tipFor(h) {
    if (h.kind === 'na') return ['Neural Accelerator', 'One per GPU core.'];
    if (h.kind === 'core') return ['GPU core ' + (h.core + 1) + ' of 10', 'A Neural Accelerator in each core.'];
    return BK[h.key].tip;
  }
  function stopFor(h) {
    if (h.kind === 'na') return 4;
    if (h.kind === 'core') return 3;
    return BK[h.key].stop;
  }
  function sameHover(a, b) { return a && b && a.kind === b.kind && a.key === b.key && a.core === b.core; }

  function showTip(h, px, py) {
    if (!tipEl) return;
    if (!h) { tipEl.hidden = true; return; }
    var tp = tipFor(h);
    if (tipTitle && tipTitle.textContent !== tp[0]) tipTitle.textContent = tp[0];
    if (tipBody && tipBody.textContent !== tp[1]) tipBody.textContent = tp[1];
    tipEl.hidden = false;
    if (!MOBILE && px != null) {
      var w = tipEl.offsetWidth || 220, hh = tipEl.offsetHeight || 60;
      var x = clamp(px + 18, 12, cw - w - 12), y = clamp(py + 18, 12, ch - hh - 12);
      if (px + 18 + w > cw - 12) x = clamp(px - w - 18, 12, cw - w - 12);
      tipEl.style.setProperty('--x', Math.round(x) + 'px'); tipEl.style.setProperty('--y', Math.round(y) + 'px');
    }
  }

  function localXY(e) {
    var r = dieCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function dieInteractive() { return S.dieOpacity > 0.5 || RM || glFailed || !G; }

  function onDieMove(e) {
    var p = localXY(e);
    ptr.sx = p.x; ptr.sy = p.y; ptr.inside = true;
    if (!dieInteractive() || pinnedTip) { markDirty(); return; }
    var h = pickAt(p.x, p.y);
    if (!sameHover(h, hover)) {
      hover = h;
      if (!doc.documentElement.classList.contains('has-cursor')) dieCanvas.style.cursor = h && stopFor(h) >= 0 ? 'pointer' : '';
    }
    showTip(hover, p.x, p.y);
    markDirty();
  }
  function onDieLeave() {
    ptr.inside = false;
    if (!pinnedTip) { hover = null; showTip(null); }
    markDirty();
  }
  function onDieClick(e) {
    if (!dieInteractive()) return;
    var p = localXY(e), h = pickAt(p.x, p.y);
    if (!h) { unpinTip(); return; }
    var st = stopFor(h);
    hover = h;
    showTip(h, p.x, p.y);
    if (st >= 0) { pinnedTip = false; goTo(st); }
    else { pinnedTip = true; }
    markDirty();
  }
  function unpinTip() { if (pinnedTip || hover) { pinnedTip = false; hover = null; showTip(null); markDirty(); } }

  /* --------------------------------------------------------- navigation */
  function currentStop() {
    if (RM) return FRAMES[rmFrame].stop;
    var p = tl ? tl.progress() : 0;
    if (p < 0.5) return 0;
    return clamp(Math.round(S.view), 0, 6);
  }
  function goTo(i) {
    i = clamp(i | 0, 0, STOPS.length - 1);
    if (RM) { for (var f = 0; f < FRAMES.length; f++) if (FRAMES[f].stop === i) { applyRM(f); return; } return; }
    if (!pinST || !A) return;
    var y = pinST.start + ChipScene.stopP[i] * (pinST.end - pinST.start);
    A.scrollTo(y, { duration: 1.2 });
  }

  /* ---------------------------------------------------------- DOM sync */
  var STEP_RANGES = [[0, 0.10], [0.10, 0.30], [0.30, 0.42], [0.50, 0.62], [0.62, 0.82], [0.82, 0.90], [0.90, 1.001]];
  var CONTROL_STEP = { rate: 2, load: 3, gpu: 4, ne: 5 };

  function setActiveStep(k) {
    if (k === activeStep) return;
    activeStep = k;
    stepEls.forEach(function (el, i) { el.classList.toggle('is-active', i === k); });
    Object.keys(controlEls).forEach(function (key) { controlEls[key].classList.toggle('is-active', CONTROL_STEP[key] === k); });
  }
  function setActiveStop(i) {
    if (i === activeStop) return;
    activeStop = i;
    var cur = null;
    stopBtns.forEach(function (b) {
      if (+b.getAttribute('data-stop') === i) { b.setAttribute('aria-current', 'step'); cur = b; } else b.removeAttribute('aria-current');
    });
    // phones: the stop list is a swipe strip, so keep the current stop in view
    var strip = cur && cur.closest('[data-chip-stops]');
    if (strip && strip.scrollWidth > strip.clientWidth + 1) {
      var br = cur.getBoundingClientRect(), sr = strip.getBoundingClientRect();
      var left = Math.max(0, strip.scrollLeft + (br.left - sr.left) - (strip.clientWidth - br.width) / 2);
      try { strip.scrollTo({ left: left, behavior: RM ? 'auto' : 'smooth' }); } catch (e) { strip.scrollLeft = left; }
    }
    if (A) A.bus.emit('chip:stop', { index: i, key: STOPS[i].key });
  }
  function syncHud(p) {
    var stop = currentStop();
    setActiveStop(stop);
    var txt = (!RM && p < 0.47 && G) ? 'Package' : STOPS[stop].hud;
    if (txt !== hudText && hudLabel) { hudText = txt; hudLabel.textContent = txt; }
    var s = (!RM && p < 0.47 && G) ? 1 : viewAt(S.view).s;
    var z = '×' + s.toFixed(1);
    if (z !== zoomText && hudZoom) { zoomText = z; hudZoom.textContent = z; }
  }
  function onProgress() {
    var p = tl ? tl.progress() : 0;
    var k = -1;
    for (var i = 0; i < STEP_RANGES.length; i++) if (p >= STEP_RANGES[i][0] && p < STEP_RANGES[i][1]) k = i;
    setActiveStep(k);
    syncHud(p);
    // the silicon moves under a still pointer while scrolling: keep the hover + tip honest
    if (!pinnedTip && (hover || ptr.inside)) {
      var h = ptr.inside && dieInteractive() ? pickAt(ptr.sx, ptr.sy) : null;
      if (!sameHover(h, hover)) { hover = h; showTip(h, ptr.sx, ptr.sy); }
    }
    markDirty();
  }

  /* ----------------------------------------------------------- controls */
  function wireSeg(el, fn) {
    if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-value]');
      if (!b || !el.contains(b)) return;
      qsa('button[data-value]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      fn(b.getAttribute('data-value'));
      markDirty();
    });
  }

  /* ------------------------------------------------ reduced motion (RM) */
  var FRAMES = [
    { stop: 0, step: 0 }, { stop: 0, step: 1 }, { stop: 0, step: 2, hl: 'mem' }, { stop: 1, step: 3 },
    { stop: 2, step: 4 }, { stop: 3, step: 4 }, { stop: 4, step: 4 }, { stop: 5, step: 5 }, { stop: 6, step: 6 }
  ];
  var rmFrame = 0;
  function applyRM(i, immediate) {
    i = clamp(i, 0, FRAMES.length - 1);
    var prev = FRAMES[rmFrame], f = FRAMES[i];
    rmFrame = i;
    var swap = function () {
      S.view = f.stop;
      hover = f.hl ? { kind: 'block', key: f.hl } : null; hoverAmt = f.hl ? 1 : 0;
      markDirty(); syncHud(1);
    };
    if (immediate || !gsap) {
      swap();
    } else {
      if (prev.stop !== f.stop || prev.hl !== f.hl) {
        gsap.to(dieCanvas, { opacity: 0, duration: 0.1, ease: 'none', overwrite: true, onComplete: function () { swap(); gsap.to(dieCanvas, { opacity: 1, duration: 0.1, ease: 'none' }); } });
      } else swap();
    }
    setActiveStep(f.step);
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === FRAMES.length - 1;
  }

  /* ================================================================ GL */
  var G = null; // the three.js scene bundle

  function glFail() {
    if (glFailed) return;
    glFailed = true;
    if (glCanvas) glCanvas.style.visibility = 'hidden';
    if (A) A.bus.emit('webgl:unsupported', { module: 'chip' });
    markDirty();
  }

  function buildGL(res) {
    if (G || glFailed) return;
    if (!res || !res.THREE) { glFail(); return; }
    var THREE = res.THREE, AD = res.ADDONS || {};
    try {
      gl = glCanvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false });
    } catch (e) { gl = null; }
    if (!gl) { glFail(); return; }
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl, antialias: true, alpha: true });
    } catch (e2) { glFail(); return; }
    renderer.setPixelRatio(glDpr);
    renderer.setSize(cw, ch, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    var scene = new THREE.Scene();
    var pm = new THREE.PMREMGenerator(renderer);
    var envScene = AD.RoomEnvironment ? new AD.RoomEnvironment() : null;
    if (envScene) {
      scene.environment = pm.fromScene(envScene, 0.04).texture;
      if (envScene.dispose) envScene.dispose();
    }
    pm.dispose();
    scene.environmentIntensity = 0.85;
    if (scene.environmentRotation) scene.environmentRotation.set(0.85, 0.4, 0);
    var camera = new THREE.PerspectiveCamera(30, cw / ch, 0.1, 200);
    camera.setViewOffset(cw, ch, -FR.offX, -FR.offY, cw, ch);
    var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-6, 14, 8); scene.add(key);
    var rimL = new THREE.DirectionalLight(0xffe4c8, 0.6); rimL.position.set(10, 4, -10); scene.add(rimL);

    var root = new THREE.Group(); scene.add(root);
    function tex(c, srgb) {
      var t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso; t.needsUpdate = true;
      return t;
    }

    /* ---- layout (SPEC §8) */
    var SUB = { w: 12, t: 0.35, d: 9 }, DIE = { w: 5.2, t: 0.12, d: 5.2 * DH / DW, x: -1.6 }, MEM = { w: 2.4, t: 0.25, d: 1.9, x: 3.4, z: 1.2 };
    var TIM = { w: 5.4, t: 0.02, d: 4.7 };

    /* ---- substrate top canvas: solder mask, gold traces, pads */
    var SPX = MOBILE ? 1536 : 2560, SPY = Math.round(SPX * SUB.d / SUB.w);
    var traces = substrateTraces(SUB, DIE, MEM);
    function paintSub(mode) {
      var c = doc.createElement('canvas'); c.width = SPX; c.height = SPY;
      var x = c.getContext('2d');
      x.setTransform(SPX / SUB.w, 0, 0, SPY / SUB.d, SPX / 2, SPY / 2);
      paintSubstrate(x, traces, mode, SUB, DIE, MEM);
      return c;
    }
    var subAlb = tex(paintSub('albedo'), true), subOrm = tex(paintSub('orm'), false);
    var subTopMat = new THREE.MeshPhysicalMaterial({ map: subAlb, roughnessMap: subOrm, metalnessMap: subOrm, roughness: 1, metalness: 1, clearcoat: 0.35, clearcoatRoughness: 0.4 });
    var subSideMat = new THREE.MeshStandardMaterial({ color: 0x0F1A14, roughness: 0.6, metalness: 0.05 });
    var subBotMat = new THREE.MeshStandardMaterial({ color: 0x0B120E, roughness: 0.7 });
    var substrate = new THREE.Group(); root.add(substrate);
    var subMesh = new THREE.Mesh(new THREE.BoxGeometry(SUB.w, SUB.t, SUB.d), [subSideMat, subSideMat, subTopMat, subBotMat, subSideMat, subSideMat]);
    subMesh.position.y = SUB.t / 2; substrate.add(subMesh);
    // decoupling capacitors
    var caps = capList(DIE, MEM);
    var capBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhysicalMaterial({ color: 0x8a6f52, roughness: 0.5, clearcoat: 0.3 }), caps.length);
    var capEnds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd4d6da, roughness: 0.25, metalness: 1 }), caps.length * 2);
    var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    caps.forEach(function (c, i) {
      var lx = c.rot ? c.w : c.l, lz = c.rot ? c.l : c.w;
      m4.compose(v3.set(c.x, SUB.t + c.h / 2, c.z), q4, s3.set(c.rot ? lx : lx * 0.62, c.h, c.rot ? lz * 0.62 : lz)); capBody.setMatrixAt(i, m4);
      for (var e = 0; e < 2; e++) {
        var off = (e ? 1 : -1) * c.l * 0.4;
        if (c.rot) m4.compose(v3.set(c.x, SUB.t + c.h / 2, c.z + off), q4, s3.set(lx * 1.02, c.h * 1.02, c.l * 0.2));
        else m4.compose(v3.set(c.x + off, SUB.t + c.h / 2, c.z), q4, s3.set(c.l * 0.2, c.h * 1.02, lz * 1.02));
        capEnds.setMatrixAt(i * 2 + e, m4);
      }
    });
    substrate.add(capBody); substrate.add(capEnds);

    /* ---- die */
    var dieGroup = new THREE.Group(); root.add(dieGroup);
    var dieTex = tex(baseCanvas, true);
    var dieTopMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: dieTex, emissive: 0xffffff, emissiveMap: dieTex, emissiveIntensity: 0.75,
      metalness: 0.3, roughness: 0.25, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [300, 520],
      clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.26
    });
    var dieSideMat = new THREE.MeshPhysicalMaterial({ color: 0x16191E, metalness: 0.3, roughness: 0.25, clearcoat: 0.6 });
    var underfill = new THREE.Mesh(new THREE.BoxGeometry(DIE.w + 0.14, 0.05, DIE.d + 0.14), new THREE.MeshPhysicalMaterial({ color: 0x14130f, roughness: 0.4, clearcoat: 0.6 }));
    underfill.position.set(DIE.x, SUB.t + 0.025, 0); dieGroup.add(underfill);
    var dieBody = new THREE.Mesh(new THREE.BoxGeometry(DIE.w, DIE.t, DIE.d), dieSideMat);
    dieBody.position.set(DIE.x, SUB.t + 0.03 + DIE.t / 2, 0); dieGroup.add(dieBody);
    var dieTopY = SUB.t + 0.03 + DIE.t + 0.001;
    var dieTop = new THREE.Mesh(new THREE.PlaneGeometry(DIE.w, DIE.d), dieTopMat);
    dieTop.rotation.x = -Math.PI / 2; dieTop.position.set(DIE.x, dieTopY, 0); dieGroup.add(dieTop);

    /* ---- unified memory packages */
    var memGeo = AD.RoundedBoxGeometry ? new AD.RoundedBoxGeometry(MEM.w, MEM.t, MEM.d, 2, 0.045) : new THREE.BoxGeometry(MEM.w, MEM.t, MEM.d);
    var memMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.0, clearcoat: 0.08, clearcoatRoughness: 0.6 });
    var markC = doc.createElement('canvas'); markC.width = 512; markC.height = 404;
    (function (c) {
      var x = c.getContext('2d');
      x.fillStyle = 'rgba(200,204,210,0.22)'; x.beginPath(); x.arc(38, 38, 11, 0, Math.PI * 2); x.fill();
      x.font = '500 30px ' + MONO; x.fillStyle = 'rgba(200,204,210,0.16)';
      try { x.letterSpacing = '4px'; } catch (e) { /* ignore */ }
      x.fillText('UNIFIED MEMORY', 70, 200); x.font = '500 22px ' + MONO; x.fillText('M5', 70, 240);
    })(markC);
    var markMat = new THREE.MeshBasicMaterial({ map: tex(markC, true), transparent: true, depthWrite: false, toneMapped: false });
    var mems = [-1, 1].map(function (sz) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(memGeo, memMat); body.position.y = MEM.t / 2 + 0.01; g.add(body);
      var mk = new THREE.Mesh(new THREE.PlaneGeometry(MEM.w * 0.9, MEM.d * 0.9), markMat);
      mk.rotation.x = -Math.PI / 2; mk.position.y = MEM.t + 0.012; g.add(mk);
      g.position.set(MEM.x, SUB.t, sz * MEM.z);
      g.userData.z = sz * MEM.z;
      root.add(g); return g;
    });

    /* ---- thermal interface */
    var timMat = new THREE.MeshPhysicalMaterial({ color: 0x9AA0A6, transparent: true, opacity: 0.35, roughness: 0.3, metalness: 0.6, depthWrite: false });
    var tim = new THREE.Mesh(new THREE.BoxGeometry(TIM.w, TIM.t, TIM.d), timMat);
    var timBaseY = dieTopY + TIM.t / 2 + 0.002;
    tim.position.set(DIE.x, timBaseY, 0); tim.renderOrder = 3; root.add(tim);

    /* ---- ball grid array 28 x 20 */
    var bgaGeo = new THREE.SphereGeometry(0.12, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    var bga = new THREE.InstancedMesh(bgaGeo, new THREE.MeshStandardMaterial({ color: 0xBFC3C7, metalness: 1, roughness: 0.35 }), 28 * 20);
    var bi = 0;
    for (var ix = 0; ix < 28; ix++) for (var iz = 0; iz < 20; iz++) {
      m4.compose(v3.set(-5.4 + ix * 0.4, -0.1, -4.04 + iz * 0.425), q4, s3.set(1, 0.85, 1)); bga.setMatrixAt(bi++, m4);
    }
    var bgaGroup = new THREE.Group(); bgaGroup.add(bga); root.add(bgaGroup);

    /* ---- contact flash lines */
    function rectLine(x, y, z, w, d) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x - w / 2, y, z - d / 2, x + w / 2, y, z - d / 2, x + w / 2, y, z - d / 2, x + w / 2, y, z + d / 2, x + w / 2, y, z + d / 2, x - w / 2, y, z + d / 2, x - w / 2, y, z + d / 2, x - w / 2, y, z - d / 2], 3));
      var m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      var l = new THREE.LineSegments(g, m); l.renderOrder = 9; l.visible = false; return l;
    }
    var flashes = {
      tim: rectLine(DIE.x, dieTopY + 0.003, 0, DIE.w, DIE.d),
      die: rectLine(DIE.x, SUB.t + 0.004, 0, DIE.w + 0.14, DIE.d + 0.14),
      mem: rectLine(MEM.x, SUB.t + 0.004, MEM.z, MEM.w, MEM.d),
      mem2: rectLine(MEM.x, SUB.t + 0.004, -MEM.z, MEM.w, MEM.d),
      bga: rectLine(0, -0.002, 0, SUB.w, SUB.d)
    };
    dieGroup.add(flashes.tim);
    Object.keys(flashes).forEach(function (k) { if (k !== 'tim') substrate.add(flashes[k]); });
    var flashT = { tim: -1e9, die: -1e9, mem: -1e9, bga: -1e9 };
    var prevLY = { tim: 0, die: 0, mem: 0, bga: 0 };

    /* ---- memory stream: 600 points on two cubic Beziers, memory -> die edge */
    var NPTS = 600, curves = [new THREE.CubicBezierCurve3(), new THREE.CubicBezierCurve3()];
    var sprite = doc.createElement('canvas'); sprite.width = sprite.height = 64;
    (function (c) { var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); })(sprite);
    var ptsGeo = new THREE.BufferGeometry();
    var ptsPos = new Float32Array(NPTS * 3);
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
    var seeds = [];
    var R = rng(777);
    for (var pi = 0; pi < NPTS; pi++) seeds.push({ c: pi % 2, t: R(), sp: 0.8 + R() * 0.4, ox: (R() - 0.5) * 0.5, oy: (R() - 0.5) * 0.18, oz: (R() - 0.5) * 0.7 });
    var ptsMat = new THREE.PointsMaterial({ color: 0xF5F5F7, size: 0.11, map: tex(sprite, false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
    var points = new THREE.Points(ptsGeo, ptsMat); points.frustumCulled = false; points.renderOrder = 8; points.visible = false;
    root.add(points);
    var streamPhase = 0;

    G = {
      THREE: THREE, renderer: renderer, scene: scene, camera: camera, root: root,
      substrate: substrate, dieGroup: dieGroup, mems: mems, tim: tim, timBaseY: timBaseY, bgaGroup: bgaGroup,
      dieTopY: dieTopY, DIE: DIE, MEM: MEM, SUB: SUB, TIM: TIM, flashes: flashes, flashT: flashT, prevLY: prevLY,
      curves: curves, seeds: seeds, ptsPos: ptsPos, ptsGeo: ptsGeo, points: points, NPTS: NPTS,
      streamPhase: streamPhase, v: new THREE.Vector3(), tgt: new THREE.Vector3(), first: true,
      orbit: { tx: 0, ty: 0 }
    };

    var done = function () {
      if (!G) return;
      ChipScene.ready = true;
      glRender(now(), 0);
      if (A) A.bus.emit('chip:firstframe', {});
      markDirty();
    };
    try {
      glPose(now(), 0);
      if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(done, done); else done();
    } catch (e3) { done(); }
  }

  function substrateTraces(SUB, DIE, MEM) {
    var out = [], dx1 = DIE.x + DIE.w / 2, dx0 = DIE.x - DIE.w / 2, dz = DIE.d / 2;
    // die <-> unified memory buses
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 18; i++) {
        var z0 = s * (0.32 + i * 0.1), z1 = s * (MEM.z - MEM.d / 2 + 0.12 + i * ((MEM.d - 0.24) / 17));
        var xa = dx1 + 0.08 + (i % 4) * 0.02, jog = Math.abs(z1 - z0);
        var xb = Math.min(xa + jog, MEM.x - MEM.w / 2 - 0.1);
        out.push({ pts: [[dx1 - 0.02, z0], [xa, z0], [xb, z1], [MEM.x - MEM.w / 2 + 0.05, z1]], w: 0.016 });
      }
    });
    // fan-out to the substrate edges: left, top and bottom
    for (var i = 0; i < 26; i++) {
      var t = i / 25, z0 = -dz + 0.2 + t * (DIE.d - 0.4), ze = -SUB.d / 2 + 0.55 + t * (SUB.d - 1.1);
      var xm = dx0 - 0.12 - Math.abs(t - 0.5) * 0.3, xe = -SUB.w / 2 + 0.28;
      var xj = xm - Math.abs(ze - z0);
      if (xj < xe + 0.1) xj = xe + 0.1;
      out.push({ pts: [[dx0 + 0.02, z0], [xm, z0], [xj, ze], [xe, ze]], w: 0.018 });
    }
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 30; i++) {
        var t = i / 29, x0 = dx0 + 0.25 + t * (DIE.w - 0.5), xe = -SUB.w / 2 + 0.7 + t * (SUB.w * 0.62);
        var zm = s * (dz + 0.12 + Math.abs(t - 0.5) * 0.25), ze = s * (SUB.d / 2 - 0.28);
        var zj = zm + s * Math.abs(xe - x0);
        if (Math.abs(zj) > Math.abs(ze) - 0.1) zj = ze - s * 0.1;
        out.push({ pts: [[x0, s * (dz - 0.02)], [x0, zm], [x0 + (xe > x0 ? 1 : -1) * Math.abs(zj - zm), zj], [xe, zj], [xe, ze]], w: 0.018 });
      }
    });
    // memory package outer edge -> right edge fingers
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 14; i++) {
        var z = s * (MEM.z - MEM.d / 2 + 0.15 + i * ((MEM.d - 0.3) / 13));
        out.push({ pts: [[MEM.x + MEM.w / 2 - 0.05, z], [SUB.w / 2 - 0.28, z]], w: 0.016 });
      }
    });
    return out;
  }
  function capList(DIE, MEM) {
    var c = [];
    function row(x0, z0, n, dx, dz, rot) { for (var i = 0; i < n; i++) c.push({ x: x0 + i * dx, z: z0 + i * dz, l: 0.2, w: 0.11, h: 0.09, rot: rot }); }
    row(DIE.x - 2.2, -DIE.d / 2 - 0.5, 15, 0.3, 0, false);
    row(DIE.x - 2.2, DIE.d / 2 + 0.5, 15, 0.3, 0, false);
    row(MEM.x - 0.9, -0.05, 7, 0.3, 0, false);
    row(DIE.x - DIE.w / 2 - 0.5, -1.5, 11, 0, 0.3, true);
    return c;
  }
  function paintSubstrate(x, traces, mode, SUB, DIE, MEM) {
    var A_ = mode === 'albedo', W = SUB.w, H = SUB.d, R = rng(71);
    // G = roughness, B = metalness for the ORM map
    x.fillStyle = A_ ? '#0F1A14' : 'rgb(0,150,0)';
    x.fillRect(-W / 2, -H / 2, W, H);
    if (A_) {
      for (var i = 0; i < 9000; i++) {
        var px = -W / 2 + R() * W, pz = -H / 2 + R() * H, s = 0.02 + R() * 0.08;
        x.fillStyle = R() < 0.5 ? 'rgba(40,70,52,0.07)' : 'rgba(0,0,0,0.12)';
        x.fillRect(px, pz, s, s);
      }
      // woven glass under the mask
      x.fillStyle = 'rgba(60,100,78,0.035)';
      for (var gx = -W / 2; gx < W / 2; gx += 0.09) x.fillRect(gx, -H / 2, 0.035, H);
      for (var gz = -H / 2; gz < H / 2; gz += 0.09) x.fillRect(-W / 2, gz, W, 0.035);
      // buried plane outlines
      x.strokeStyle = 'rgba(70,120,90,0.12)'; x.lineWidth = 0.03;
      x.strokeRect(-W / 2 + 0.45, -H / 2 + 0.45, W - 0.9, H - 0.9);
    }
    var gold = A_ ? '#C9A45C' : 'rgb(0,80,255)', goldHi = 'rgba(255,230,170,0.35)';
    x.lineCap = 'round'; x.lineJoin = 'round';
    traces.forEach(function (t) {
      x.strokeStyle = gold; x.lineWidth = t.w; x.beginPath();
      t.pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.stroke();
      if (A_) { x.strokeStyle = goldHi; x.lineWidth = t.w * 0.35; x.stroke(); }
      var e = t.pts[t.pts.length - 1], s0 = t.pts[0];
      x.fillStyle = gold; x.beginPath(); x.arc(e[0], e[1], t.w * 1.7, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(s0[0], s0[1], t.w * 1.2, 0, Math.PI * 2); x.fill();
    });
    // edge fingers
    x.fillStyle = gold;
    for (var fx = -W / 2 + 0.5; fx < W / 2 - 0.4; fx += 0.2) { x.fillRect(fx, -H / 2 + 0.08, 0.1, 0.18); x.fillRect(fx, H / 2 - 0.26, 0.1, 0.18); }
    for (var fz = -H / 2 + 0.5; fz < H / 2 - 0.4; fz += 0.2) { x.fillRect(-W / 2 + 0.08, fz, 0.18, 0.1); x.fillRect(W / 2 - 0.26, fz, 0.18, 0.1); }
    // via fields
    x.strokeStyle = A_ ? 'rgba(201,164,92,0.55)' : 'rgb(0,100,200)'; x.lineWidth = 0.012;
    function vias(x0, z0, cols, rows, p) {
      for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
        if (R() < 0.2) continue;
        x.beginPath(); x.arc(x0 + i * p, z0 + j * p, p * 0.24, 0, Math.PI * 2); x.stroke();
      }
    }
    vias(-5.3, -3.9, 10, 6, 0.13); vias(-5.3, 3.1, 10, 6, 0.13); vias(4.1, -3.9, 9, 5, 0.13); vias(4.1, 3.3, 9, 5, 0.13);
    vias(1.35, -0.55, 6, 9, 0.13);
    // component pads + silkscreen
    capList(DIE, MEM).forEach(function (c) {
      x.fillStyle = gold;
      if (c.rot) { x.fillRect(c.x - c.w * 0.3, c.z - c.l * 0.62, c.w * 0.6, c.l * 0.28); x.fillRect(c.x - c.w * 0.3, c.z + c.l * 0.34, c.w * 0.6, c.l * 0.28); }
      else { x.fillRect(c.x - c.l * 0.62, c.z - c.w * 0.3, c.l * 0.28, c.w * 0.6); x.fillRect(c.x + c.l * 0.34, c.z - c.w * 0.3, c.l * 0.28, c.w * 0.6); }
    });
    [[-5.55, -4.05], [5.55, 4.05], [5.55, -4.05]].forEach(function (f) {
      x.fillStyle = gold; x.beginPath(); x.arc(f[0], f[1], 0.08, 0, Math.PI * 2); x.fill();
      x.strokeStyle = gold; x.lineWidth = 0.015; x.beginPath(); x.arc(f[0], f[1], 0.15, 0, Math.PI * 2); x.stroke();
    });
    if (A_) {
      x.strokeStyle = 'rgba(226,230,222,0.32)'; x.lineWidth = 0.018;
      x.strokeRect(DIE.x - DIE.w / 2 - 0.12, -DIE.d / 2 - 0.12, DIE.w + 0.24, DIE.d + 0.24);
      [-1, 1].forEach(function (s) { x.strokeRect(MEM.x - MEM.w / 2 - 0.08, s * MEM.z - MEM.d / 2 - 0.08, MEM.w + 0.16, MEM.d + 0.16); });
      x.fillStyle = 'rgba(226,230,222,0.5)';
      x.beginPath(); x.moveTo(-5.85, -4.35); x.lineTo(-5.45, -4.35); x.lineTo(-5.85, -3.95); x.closePath(); x.fill();
      // contact shadows under the die and memory
      x.save(); x.filter = 'blur(10px)'; x.fillStyle = 'rgba(0,0,0,0.55)';
      x.fillRect(DIE.x - DIE.w / 2 - 0.05, -DIE.d / 2 - 0.05, DIE.w + 0.1, DIE.d + 0.1);
      [-1, 1].forEach(function (s) { x.fillRect(MEM.x - MEM.w / 2, s * MEM.z - MEM.d / 2, MEM.w, MEM.d); });
      x.restore();
    }
  }

  // camera helpers: spherical interpolation around moving targets
  function sph(r, phi, th, tx, ty, tz, out) {
    out.x = tx + r * Math.sin(phi) * Math.sin(th);
    out.y = ty + r * Math.cos(phi);
    out.z = tz + r * Math.sin(phi) * Math.cos(th);
    return out;
  }
  var P0 = { r: 26, phi: 0.0004, th: 0, tx: 0, ty: 0, tz: 0 };
  var P1 = { r: Math.hypot(14, 11, 16), phi: Math.acos(11 / Math.hypot(14, 11, 16)), th: Math.atan2(14, 16), tx: 0, ty: 1, tz: 0 };

  function p2Pose() {
    // P2 matches the 2D die at x1 (die fits 90% of the viewport) for an invisible hand-off
    var base = baseFit(), dieWorldD = G.DIE.d;
    var h = (ch * dieWorldD) / (base * DH * 2 * Math.tan(15 * Math.PI / 180));
    return { r: h, phi: 0.0012, th: 0, tx: G.DIE.x, ty: G.dieTopY, tz: 0 };
  }
  function fitR(r) {
    // keep the 12-unit substrate (plus its labels) inside the free frame
    var a = cw / ch, freeW = FR.offX ? (Math.min(FR.hudL, cw) - FR.copyR) / cw : 1;
    var need = lerp(7.4, 9.6, S.rot) / (Math.tan(15 * Math.PI / 180) * a * clamp(freeW + 0.28, 0.6, 1));
    return Math.max(r, need);
  }

  function glPose(t, dt) {
    var THREE = G.THREE, time = t / 1000;
    function ov(v) { return v >= 0 ? v : v * 0.12; }
    // layers
    G.tim.position.y = G.timBaseY + 3.2 * ov(LY.tim);
    G.dieGroup.position.y = 2.2 * ov(LY.die);
    G.mems.forEach(function (g) { g.position.y = G.SUB.t + 1.2 * ov(LY.mem); g.position.x = G.MEM.x + 0.8 * ov(LY.mem); });
    G.bgaGroup.position.y = -1.4 * ov(LY.bga);
    // the camera passes through the thermal interface on its way into the die
    G.tim.material.opacity = 0.35 * (1 - 0.35 * clamp(LY.tim, 0, 1)) * (1 - sstep(0.25, 0.85, CAM.m));
    G.tim.visible = G.tim.material.opacity > 0.002;
    // landing flashes (reassembly only)
    ['tim', 'die', 'mem', 'bga'].forEach(function (k) {
      if (G.prevLY[k] > 0.03 && LY[k] <= 0.003 && S.explode < 0.99) G.flashT[k] = t;
      G.prevLY[k] = LY[k];
      var a = 1 - clamp((t - G.flashT[k]) / 150, 0, 1);
      var ls = k === 'mem' ? [G.flashes.mem, G.flashes.mem2] : [G.flashes[k]];
      ls.forEach(function (l) { l.visible = a > 0.001; l.material.opacity = a; });
    });
    // camera
    var r = S.rot, m = CAM.m, c;
    var A1 = {
      r: lerp(P0.r, P1.r, r), phi: lerp(P0.phi, P1.phi, r), th: lerp(P0.th, P1.th, r),
      tx: lerp(P0.tx, P1.tx, r), ty: lerp(P0.ty, P1.ty, r), tz: 0
    };
    if (m > 0) {
      var B = p2Pose();
      c = { r: logLerp(A1.r, B.r, m), phi: lerp(A1.phi, B.phi, m), th: lerp(A1.th, B.th, m), tx: lerp(A1.tx, B.tx, m), ty: lerp(A1.ty, B.ty, m), tz: 0 };
      c.r = logLerp(fitR(A1.r), B.r, m);
    } else { c = A1; c.r = fitR(c.r); }
    // pointer orbit + idle breathing, fading out as the camera settles on the die
    var free = (1 - m) * (RM ? 0 : 1);
    G.orbit.tx += (ptr.tx - G.orbit.tx) * Math.min(1, dt * 3.5);
    G.orbit.ty += (ptr.ty - G.orbit.ty) * Math.min(1, dt * 3.5);
    var th = c.th + (G.orbit.tx * 0.07 + Math.sin(time * 0.22) * 0.02 * r) * free;
    var phi = Math.max(0.0004, c.phi + (G.orbit.ty * 0.045) * free * r);
    sph(c.r, phi, th, c.tx, c.ty, c.tz, G.v);
    G.camera.position.copy(G.v);
    G.tgt.set(c.tx, c.ty, c.tz);
    G.camera.lookAt(G.tgt);
    // stream
    var nVis = Math.round(G.NPTS * clamp(S.stream, 0, 1));
    G.points.visible = nVis > 0;
    if (nVis > 0) {
      var dieEdgeX = G.DIE.x + G.DIE.w / 2, dy = G.dieGroup.position.y + G.dieTopY;
      G.curves.forEach(function (cv, i) {
        var z = G.mems[i].userData.z, mp = G.mems[i].position;
        cv.v0.set(mp.x - G.MEM.w * 0.2, mp.y + G.MEM.t + 0.05, z);
        cv.v1.set(mp.x - G.MEM.w * 0.6, mp.y + 1.5, z * 0.9);
        cv.v2.set(dieEdgeX + 0.8, dy + 1.0, z * 0.7);
        cv.v3.set(dieEdgeX - 0.35, dy + 0.02, z * 0.55);
      });
      G.streamPhase += dt * 0.32 * S.rate;
      var pos = G.ptsPos, tmp = G.v;
      for (var i = 0; i < nVis; i++) {
        var sd = G.seeds[i], u = (sd.t + G.streamPhase * sd.sp) % 1;
        G.curves[sd.c].getPoint(u, tmp);
        var fade = Math.sin(u * Math.PI);
        pos[i * 3] = tmp.x + sd.ox * fade; pos[i * 3 + 1] = tmp.y + sd.oy * fade; pos[i * 3 + 2] = tmp.z + sd.oz * fade;
      }
      G.ptsGeo.setDrawRange(0, nVis);
      G.ptsGeo.attributes.position.needsUpdate = true;
      G.points.material.opacity = clamp(S.stream * 1.6, 0, 1);
    }
  }
  function glRender(t, dt) {
    if (!G) return;
    glPose(t, dt);
    G.renderer.render(G.scene, G.camera);
    updateLeaders();
  }

  /* ----------------------------------------------- labels + leaders */
  var LABELS = [
    { key: 'tim', side: -1 }, { key: 'die', side: 1 }, { key: 'mem', side: 1 }, { key: 'sub', side: -1 }, { key: 'bga', side: 1 }
  ];
  var labelState = {};
  var leaderEls = {};
  function setupLeaders() {
    if (!leadersSvg) return;
    var NS = 'http://www.w3.org/2000/svg';
    LABELS.forEach(function (l) {
      var g = doc.createElementNS(NS, 'g');
      var p = doc.createElementNS(NS, 'path');
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1');
      p.setAttribute('vector-effect', 'non-scaling-stroke'); p.setAttribute('stroke-opacity', '0.55');
      var dot = doc.createElementNS(NS, 'circle');
      dot.setAttribute('r', '2.5'); dot.setAttribute('fill', 'currentColor'); dot.setAttribute('opacity', '0');
      g.appendChild(p); g.appendChild(dot); leadersSvg.appendChild(g);
      leaderEls[l.key] = { path: p, dot: dot, len: 0 };
      labelState[l.key] = { on: false, v: 0, tw: null };
    });
  }
  function sepFor(k) { return k === 'sub' ? Math.max(LY.bga, LY.mem) : LY[k]; }
  function updateLabelToggles() {
    LABELS.forEach(function (l) {
      var st = labelState[l.key]; if (!st) return;
      var want = sepFor(l.key) > 0.5 && !glFailed && !RM && (tl ? tl.progress() < 0.42 : true);
      if (want === st.on) return;
      st.on = want;
      var el = labelEls[l.key];
      if (el) el.classList.toggle('is-visible', want);
      if (st.tw) st.tw.kill();
      if (gsap) st.tw = gsap.to(st, { v: want ? 1 : 0, duration: 0.6, ease: want ? 'power2.out' : 'power2.in', onUpdate: markDirty });
      else st.v = want ? 1 : 0;
    });
  }
  var anchorV = null;
  function anchorFor(k) {
    var T = G.THREE; if (!anchorV) anchorV = new T.Vector3();
    var v = anchorV, D = G.DIE, M = G.MEM, U = G.SUB;
    if (k === 'tim') v.set(D.x - G.TIM.w / 2, G.tim.position.y, G.TIM.d / 2);
    else if (k === 'die') v.set(D.x + D.w / 2, G.dieGroup.position.y + G.dieTopY, -D.d / 2);
    else if (k === 'mem') { var g = G.mems[0]; v.set(g.position.x + M.w / 2, g.position.y + M.t, g.position.z - M.d / 2); }
    else if (k === 'sub') v.set(-U.w * 0.22, U.t, U.d / 2);   // front edge, clear of the copy column
    else v.set(5.4, G.bgaGroup.position.y, -4.04);
    v.project(G.camera);
    return { x: (v.x + 1) / 2 * cw, y: (1 - v.y) / 2 * ch, z: v.z };
  }
  function updateLeaders() {
    if (!G || !leadersSvg) return;
    var any = false;
    LABELS.forEach(function (l) { if (labelState[l.key] && labelState[l.key].v > 0.001) any = true; });
    if (!any) { LABELS.forEach(function (l) { var e = leaderEls[l.key]; if (e && e.shown) { e.path.setAttribute('d', ''); e.dot.setAttribute('opacity', '0'); e.shown = false; } }); return; }
    // column x: just outside the package's projected bounds
    var pts = LABELS.map(function (l) { return anchorFor(l.key); });
    var zoneL = FR.offX ? FR.copyR + 20 : 16, zoneR = FR.offX ? Math.min(FR.hudL, cw) - 20 : cw - 16;
    LABELS.forEach(function (l, i) {
      var st = labelState[l.key], e = leaderEls[l.key], el = labelEls[l.key];
      if (!st || !e) return;
      var p = pts[i], v = st.v;
      if (MOBILE) { if (e.shown) { e.path.setAttribute('d', ''); e.dot.setAttribute('opacity', '0'); e.shown = false; } return; }
      var lw = el ? (el._w || (el._w = el.offsetWidth || 120)) : 120;
      var colX = l.side < 0 ? clamp(p.x - 70, zoneL + lw + 10, zoneR) : clamp(p.x + 70, zoneL, zoneR - lw - 10);
      var ly = clamp(p.y - 34, 70, ch - 70);
      var ex = l.side < 0 ? colX - 6 : colX + 6;
      var ex0 = p.x + l.side * Math.abs(ly - p.y);
      if ((l.side < 0 && ex0 < ex) || (l.side > 0 && ex0 > ex)) ex0 = ex;
      var d = 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + 'L' + ex0.toFixed(1) + ' ' + ly.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + ly.toFixed(1);
      var len = Math.hypot(ex0 - p.x, ly - p.y) + Math.abs(ex - ex0);
      e.path.setAttribute('d', d);
      e.path.setAttribute('stroke-dasharray', len.toFixed(1));
      e.path.setAttribute('stroke-dashoffset', (len * (1 - v)).toFixed(1));
      e.dot.setAttribute('cx', p.x.toFixed(1)); e.dot.setAttribute('cy', p.y.toFixed(1)); e.dot.setAttribute('opacity', (v * 0.9).toFixed(2));
      e.shown = true;
      if (el) {
        var tx = l.side < 0 ? colX - lw - 10 : colX + 10;
        el.style.setProperty('--x', Math.round(tx) + 'px'); el.style.setProperty('--y', Math.round(ly - 12) + 'px');
      }
    });
  }

  /* ------------------------------------------------------------ sizing */
  function measure() {
    var el = stage || sec;
    cw = Math.max(1, (el && el.clientWidth) || win.innerWidth);
    ch = Math.max(1, (el && el.clientHeight) || win.innerHeight);
    var cap = MOBILE ? 1.5 : 2;
    var d = Math.min(win.devicePixelRatio || 1, cap);
    dieDpr = Math.min(d, perf.steps ? [2, 1.5, 1.25, 1][perf.steps] || 1 : d);
    glDpr = dieDpr;
    if (dieCanvas) {
      var W = Math.round(cw * dieDpr), H = Math.round(ch * dieDpr);
      if (dieCanvas.width !== W || dieCanvas.height !== H) { dieCanvas.width = W; dieCanvas.height = H; }
    }
    computeFrame();
    if (leadersSvg) leadersSvg.setAttribute('viewBox', '0 0 ' + cw + ' ' + ch);
    Object.keys(labelEls).forEach(function (k) { labelEls[k]._w = 0; });
    if (G) {
      G.renderer.setPixelRatio(glDpr);
      G.renderer.setSize(cw, ch, false);
      G.camera.aspect = cw / ch;
      G.camera.setViewOffset(cw, ch, -FR.offX, -FR.offY, cw, ch);
      G.camera.updateProjectionMatrix();
    }
    markDirty();
  }

  function perfSample(ms) {
    perf.acc += ms; perf.n++;
    if (perf.n < 40) return;
    var avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
    if (avg > 18 && perf.steps < 3 && dieDpr > 1) {
      perf.steps++;
      var next = [2, 1.5, 1.25, 1][perf.steps];
      if (next < dieDpr) {
        measure();
        if (A) A.bus.emit('perf:dpr', { module: 'chip', dpr: dieDpr });
      }
    }
  }

  /* ------------------------------------------------------------- tick */
  function tick() {
    if (!visible) { lastT = 0; return; }
    var t = now(), dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    var frameMs = lastT ? t - lastT : 16;
    lastT = t;
    // pointer lerp
    var pdx = ptr.x - ptr.tx, pdy = ptr.y - ptr.ty;
    if (Math.abs(pdx) > 1e-4 || Math.abs(pdy) > 1e-4) { ptr.tx += pdx * 0.06; ptr.ty += pdy * 0.06; dirty = true; }
    var hTarget = hover ? 1 : 0;
    if (Math.abs(hoverAmt - hTarget) > 0.005) { hoverAmt += (hTarget - hoverAmt) * Math.min(1, dt * 12); dirty = true; } else hoverAmt = hTarget;
    // canvas opacities
    var glOp = glFailed || RM || !G ? 0 : S.glOpacity;
    var dieOp = RM || glFailed || !G ? 1 : S.dieOpacity;
    if (glCanvas && glOp !== lastGlOp) { glCanvas.style.opacity = glOp.toFixed(3); glCanvas.style.visibility = glOp > 0.001 ? 'visible' : 'hidden'; lastGlOp = glOp; }
    if (dieOp !== lastDieOp) { lastDieOp = dieOp; dirty = true; }
    updateLabelToggles();
    if (glOp <= 0.001 && leadersShown()) clearLeaders();
    var rendered = false;
    // GL
    if (G && glOp > 0.001) {
      var anim = S.stream > 0.001 || (S.explode > 0 && S.explode < 1) || S.rot > 0.02 || labelsAnimating();
      var flashing = false; Object.keys(G.flashT).forEach(function (k) { if (t - G.flashT[k] < 170) flashing = true; });
      if (dirty || anim || flashing) { glRender(t, dt); rendered = true; }
    }
    // 2D
    if (dctx) {
      var dieAnim = genPending || nePulses.length > 0 || hoverAmt % 1 !== 0 || (!RM && (
        (Math.abs(S.view - 1) < 0.72) || (S.view > 1.5 && S.view < 4.5) || ptr.inside));
      if (dieOp <= 0.001) dieAnim = false;
      if (dirty || dieAnim) { drawDie2D(t, dieOp); rendered = true; }
    }
    dirty = false;
    if (rendered) perfSample(frameMs);
  }
  function leadersShown() { for (var k in leaderEls) if (leaderEls[k].shown) return true; return false; }
  function clearLeaders() { for (var k in leaderEls) { var e = leaderEls[k]; e.path.setAttribute('d', ''); e.dot.setAttribute('opacity', '0'); e.shown = false; } }
  function labelsAnimating() {
    for (var k in labelState) { var v = labelState[k].v; if (v > 0.001 && v < 0.999) return true; }
    return false;
  }

  /* ------------------------------------------------------------- init */
  function init(app) {
    A = app; gsap = app.gsap; ST = app.ScrollTrigger;
    RM = !!app.reducedMotion; MOBILE = !!app.isMobile; TOUCH = !!app.isTouch;
    sec = doc.getElementById('chip');
    if (!sec) return;
    stage = qs('.chip__stage', sec);
    glCanvas = qs('[data-chip-canvas]', sec);
    dieCanvas = qs('[data-die-canvas]', sec);
    leadersSvg = qs('[data-chip-leaders]', sec);
    qsa('[data-chip-label]', sec).forEach(function (el) { labelEls[el.getAttribute('data-chip-label')] = el; });
    tipEl = qs('[data-chip-tip]', sec); tipTitle = qs('[data-chip-tip-title]', sec); tipBody = qs('[data-chip-tip-body]', sec);
    stepEls = [];
    qsa('[data-chip-step]', sec).forEach(function (el) { stepEls[+el.getAttribute('data-chip-step')] = el; });
    qsa('[data-chip-control]', sec).forEach(function (el) { controlEls[el.getAttribute('data-chip-control')] = el; });
    stopBtns = qsa('[data-stop]', sec);
    hudLabel = qs('[data-chip-hud-label]', sec); hudZoom = qs('[data-chip-zoom]', sec);
    stepperEl = qs('[data-chip-stepper]', sec); prevBtn = qs('[data-chip-prev]', sec); nextBtn = qs('[data-chip-next]', sec);
    neInput = qs('[data-chip-ne-input]', sec);
    if (dieCanvas) dctx = dieCanvas.getContext('2d');

    buildBase();
    measure();
    setupLeaders();

    // controls
    wireSeg(controlEls.rate && (controlEls.rate.matches('.seg') ? controlEls.rate : qs('.seg', controlEls.rate)), function (v) { S.rate = v === 'm4' ? 1 / 1.3 : 1; });
    wireSeg(controlEls.load, function (v) { S.load = v === 'heavy' ? 'heavy' : 'light'; });
    wireSeg(controlEls.gpu, function (v) { S.gpu = v === 'graphics' ? 'graphics' : 'ai'; });
    if (neInput) neInput.addEventListener('input', function () { S.nePulse++; nePulses.push(now()); if (nePulses.length > 24) nePulses.shift(); markDirty(); });
    stopBtns.forEach(function (b) { b.addEventListener('click', function () { goTo(+b.getAttribute('data-stop')); }); });

    // die pointer
    if (dieCanvas) {
      dieCanvas.addEventListener('pointermove', onDieMove);
      dieCanvas.addEventListener('pointerleave', onDieLeave);
      dieCanvas.addEventListener('click', onDieClick);
    }
    // stage pointer: GL orbit
    (stage || sec).addEventListener('pointermove', function (e) {
      if (TOUCH) return;
      ptr.x = clamp((e.clientX / win.innerWidth) * 2 - 1, -1, 1);
      ptr.y = clamp((e.clientY / win.innerHeight) * 2 - 1, -1, 1);
      markDirty();
    });
    doc.addEventListener('pointerdown', function (e) {
      if (!pinnedTip) return;
      if (e.target === dieCanvas || (tipEl && tipEl.contains(e.target))) return;
      unpinTip();
    });
    // keyboard: arrows move between stops while focus is inside #chip
    sec.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { unpinTip(); return; }
      var tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var d = e.key === 'ArrowRight' ? 1 : -1;
        if (RM) applyRM(rmFrame + d); else goTo(currentStop() + d);
      }
    });

    // visibility: render only while the section is on screen
    if ('IntersectionObserver' in win) {
      new IntersectionObserver(function (en) {
        en.forEach(function (x) { visible = x.isIntersecting; if (visible) { lastT = 0; markDirty(); } });
      }, { rootMargin: '10% 0px 10% 0px' }).observe(sec);
    } else visible = true;

    if (RM) {
      S.glOpacity = 0; S.dieOpacity = 1; S.rot = 1; S.wave = 1;
      if (glCanvas) glCanvas.style.visibility = 'hidden';
      if (stepperEl) stepperEl.hidden = false;
      if (prevBtn) prevBtn.addEventListener('click', function () { applyRM(rmFrame - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { applyRM(rmFrame + 1); });
      applyRM(0, true);
      ChipScene.ready = true;
    } else if (gsap && ST) {
      buildTimeline(app);
    }

    if (gsap) gsap.ticker.add(tick);
    if (app.bus) app.bus.on('resize', function (p) { MOBILE = p && typeof p.isMobile === 'boolean' ? p.isMobile : MOBILE; measure(); });

    if (!RM) {
      var hasGL = false;
      try { var probe = win.WebGL2RenderingContext; hasGL = !!probe; } catch (e) { hasGL = false; }
      if (!hasGL) glFail();
      else app.whenThree().then(buildGL, glFail);
    }
    // pre-warm the deep-zoom tiles while the visitor is still up top
    idle(function () { prewarm(3); });
    markDirty();
    onProgress();
  }

  function idle(fn) { if (win.requestIdleCallback) win.requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(fn, 1500); }
  function prewarm(stopIdx) {
    var st = STOPS[stopIdx], k = baseFit() * st.s, need = k * dieDpr;
    if (need <= baseScale * 1.12) return;
    var maxL = MOBILE ? 16 : 32, level = 8;
    while (level < need / 1.18 && level < maxL) level *= 2;
    var u = TILE / level;
    var x0 = st.cx - cw / 2 / k, x1 = st.cx + cw / 2 / k, y0 = st.cy - ch / 2 / k, y1 = st.cy + ch / 2 / k;
    var todo = [];
    for (var ty = Math.floor(Math.max(0, y0) / u); ty <= Math.floor(Math.min(DH - 1e-3, y1) / u); ty++)
      for (var tx = Math.floor(Math.max(0, x0) / u); tx <= Math.floor(Math.min(DW - 1e-3, x1) / u); tx++) todo.push([tx, ty]);
    (function step(deadline) {
      var t0 = now();
      while (todo.length && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 4 : now() - t0 < 8)) { var c = todo.shift(); getTile(level, c[0], c[1], true); }
      if (todo.length) idle(step);
    })();
  }

  function buildTimeline(app) {
    tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec, start: 'top top', end: app.pinEnd(7), pin: true, scrub: 0.8, invalidateOnRefresh: true
      },
      onUpdate: onProgress
    });
    pinST = tl.scrollTrigger;
    tl.to(S, { rot: 1, duration: 0.10, ease: 'power2.inOut' }, 0);
    // explode, layers staggered by .02
    ['tim', 'die', 'mem', 'sub', 'bga'].forEach(function (k, i) {
      var o = {}; o[k] = 1;
      o.duration = 0.12; o.ease = 'power3.inOut';
      tl.to(LY, o, 0.10 + i * 0.02);
    });
    tl.to(S, { explode: 1, duration: 0.20 }, 0.10);
    tl.to(S, { stream: 1, duration: 0.12 }, 0.30);
    // reassembly: bottom layers land first, each with back.out(1.4)
    ['bga', 'sub', 'mem', 'die', 'tim'].forEach(function (k, i) {
      var o = {}; o[k] = 0;
      o.duration = 0.016; o.ease = 'back.out(1.4)';
      tl.to(LY, o, 0.42 + i * 0.008);
    });
    tl.to(S, { explode: 0, duration: 0.08 }, 0.42);
    tl.to(S, { stream: 0, duration: 0.04 }, 0.42);
    tl.to(CAM, { m: 1, duration: 0.08, ease: 'power3.inOut' }, 0.42);
    tl.to(S, { glOpacity: 0, duration: 0.03 }, 0.47);
    tl.to(S, { dieOpacity: 1, duration: 0.03 }, 0.47);
    // the die dive: view lands exactly on each stop at ChipScene.stopP
    tl.to(S, { view: 1, duration: 0.055, ease: 'power2.inOut' }, 0.50);
    tl.to(S, { view: 2, duration: 0.035, ease: 'power2.inOut' }, 0.62);
    tl.to(S, { view: 3, duration: 0.05, ease: 'power2.inOut' }, 0.68);
    tl.to(S, { view: 4, duration: 0.05, ease: 'power2.inOut' }, 0.74);
    tl.to(S, { wave: 1, duration: 0.06 }, 0.76);
    tl.to(S, { view: 5, duration: 0.04, ease: 'power2.inOut' }, 0.82);
    tl.to(S, { view: 6, duration: 0.05, ease: 'power2.inOut' }, 0.90);
    // copy steps fade via .is-active (css transition), toggled in onProgress
    tl.set({}, {}, 1);
  }

  if (win.APP && typeof win.APP.register === 'function') win.APP.register('chip', init, { order: 30 });
})(window, document);
