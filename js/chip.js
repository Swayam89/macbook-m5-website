/* =============================================================================
   js/chip.js (E3): #chip, the centrepiece.
   p .00-.50  WebGL exploded M5 package ([data-chip-canvas]), lit and finished with
              RenderKit (js/render-kit.js + js/materials.js, LOOKDEV-BRIEF §6): a
              camera-locked macro lightformer studio, solder mask over copper relief,
              ENIG gold only where the mask is open, SAC solder balls, thin-film die,
              laser-marked mould packages; MSAA x4 HalfFloat pipeline with idle AO +
              32-sample accumulation. Memory stream particles, SVG leaders + labels.
   p .47-1.0  2D die floorplan ([data-die-canvas]) zooming x1 -> x24 through the
              stops of SPEC §8: a micrograph-style painter (thin-film colours, logic
              partitions, standard-cell rows, SRAM bit cells, power grid, metal fill,
              bump grid) with level-of-detail tiles up to 64 texels per die unit, a
              cached static layer, lamp band + lens DOF/vignette at the deep stops,
              plus the live effects (CPU load pulses, GPU graphics/AI modes, the
              Neural Accelerator MAC wave, Neural Engine keystroke ripples), hover
              tips and click-to-zoom. Falls back to the plain three.js path when the
              kit is absent, and to the 2D die alone without WebGL.
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
  // A die under a reflected-light microscope, not a UI diagram. Every region is a thin-film colour
  // (passivation + inter-metal dielectric over patterned copper): the hue comes from film interference,
  // so it differs by block (metal density) and drifts a little from macro to macro. Each ramp runs
  // shadow (etched gaps) -> film -> bright film -> the pale metal of the top layers catching the lamp.
  // Detail is level-of-detail aware: features smaller than ~2 texels at the painting scale L (texels per
  // die unit) are replaced by their average tone, so no level moires when the browser resamples it.
  var FILMS = {
    body:  ['#040507', '#171b22', '#394150', '#b7bfcc'],
    cpu:   ['#0b0812', '#57477a', '#9a88c0', '#e9e0f7'],
    eff:   ['#09091a', '#4d4b85', '#8f8bc6', '#e0defa'],
    gpu:   ['#051013', '#325d6b', '#76a8b3', '#d8f0f2'],
    na:    ['#0b0905', '#5a4a2c', '#9c8656', '#efe4c6'],
    ne:    ['#0e0c05', '#6b5d34', '#a8985f', '#efe6c0'],
    sram:  ['#06080c', '#40485a', '#7f8a9f', '#dfe4ee'],
    phy:   ['#110806', '#77462f', '#b97f5d', '#f4dac8'],
    io:    ['#050d09', '#35594a', '#709f8a', '#d6ede2'],
    media: ['#0d070c', '#5e4159', '#9d7b97', '#efdcec']
  };
  var FILM_T = [0, 0.44, 0.72, 1], FILM_SAT = 0.66;
  var RAMP_N = 256, rampCache = {};
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function shiftHue(c, deg, lm) {
    // rotate the chroma around the grey axis (cheap hue shift that keeps luma), then scale lightness
    var r = c[0], g = c[1], b = c[2], a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    var k = 1 / 3, s3 = Math.sqrt(k);
    var m00 = cs + (1 - cs) * k, m01 = k * (1 - cs) - s3 * sn, m02 = k * (1 - cs) + s3 * sn;
    var m10 = k * (1 - cs) + s3 * sn, m11 = cs + k * (1 - cs), m12 = k * (1 - cs) - s3 * sn;
    var m20 = k * (1 - cs) - s3 * sn, m21 = k * (1 - cs) + s3 * sn, m22 = cs + k * (1 - cs);
    return [clamp((r * m00 + g * m01 + b * m02) * lm, 0, 255), clamp((r * m10 + g * m11 + b * m12) * lm, 0, 255), clamp((r * m20 + g * m21 + b * m22) * lm, 0, 255)];
  }
  // pal(key, variant): 256 precomputed rgb() strings. Variants 0..6 = +-8 deg hue, +-5% lightness (per macro).
  function pal(key, v) {
    v = v == null ? 0 : ((v % 7) + 7) % 7;
    var ck = key + v;
    if (rampCache[ck]) return rampCache[ck];
    var f = FILMS[key] || FILMS.body, hs = (v - 3) * 2.7, lm = 1 + (((v * 5) % 7) - 3) * 0.017;
    // film colours are muted in a real micrograph: pull every stop 30% toward its own luma
    var st = f.map(function (hx) {
      var c = shiftHue(hexRgb(hx), hs, lm), y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      return [y + (c[0] - y) * FILM_SAT, y + (c[1] - y) * FILM_SAT, y + (c[2] - y) * FILM_SAT];
    }), out = [];
    for (var i = 0; i < RAMP_N; i++) {
      var t = i / (RAMP_N - 1), s = 0;
      while (s < FILM_T.length - 2 && t > FILM_T[s + 1]) s++;
      var u = (t - FILM_T[s]) / (FILM_T[s + 1] - FILM_T[s]);
      u = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      // the shadow segment (etched gaps, channels, cell walls at t0 - .1 .. - .2) falls off faster, so
      // gaps read near-black under the lamp instead of a lifted mid-film haze
      if (s === 0) u = Math.pow(u, 2.1);
      var a = st[s], b = st[s + 1];
      out.push('rgb(' + (a[0] + (b[0] - a[0]) * u | 0) + ',' + (a[1] + (b[1] - a[1]) * u | 0) + ',' + (a[2] + (b[2] - a[2]) * u | 0) + ')');
    }
    return (rampCache[ck] = out);
  }
  function col(P, t) { return P[t <= 0 ? 0 : t >= 1 ? RAMP_N - 1 : (t * (RAMP_N - 1)) | 0]; }
  function hit(C, x, y, w, h) { return x < C.x1 && x + w > C.x0 && y < C.y1 && y + h > C.y0; }

  // standard-cell logic: placement rows (RH) of cells with poly gates, M1 rails, M2/M3 routing
  var RH = 0.45;
  function pLogic(ctx, x, y, w, h, seed, C, L, P, t0, rp, depth) {
    if (!hit(C, x, y, w, h)) return;
    depth = depth || 0;
    // a large logic area is a patchwork of placement partitions (units synthesised separately), with
    // routing channels between them: split it like a treemap, each partition a slightly different film
    if (depth < 3 && w * h > 240 && Math.min(w, h) > 7) {
      var Q = rng(seed * 13 + 7), cut = w > h * 1.15 ? 1 : h > w * 1.15 ? 0 : (Q() < 0.5 ? 1 : 0);
      var f = 0.3 + Q() * 0.4, gch = 0.6, ta = t0 + (Q() - 0.5) * 0.12, tb = t0 + (Q() - 0.5) * 0.12;
      ctx.fillStyle = col(P, t0 - 0.2);
      if (cut) {
        var w1 = (w - gch) * f;
        ctx.fillRect(x + w1, y, gch, h);
        if (L >= 6) { ctx.fillStyle = col(P, t0 + 0.02); for (var ci = 0; ci < 3; ci++) ctx.fillRect(x + w1 + 0.1 + ci * 0.17, Math.max(y, C.y0), 0.06, Math.min(y + h, C.y1) - Math.max(y, C.y0)); }
        pLogic(ctx, x, y, w1, h, seed * 3 + 1, C, L, P, ta, rp, depth + 1);
        pLogic(ctx, x + w1 + gch, y, w - w1 - gch, h, seed * 3 + 2, C, L, P, tb, rp, depth + 1);
      } else {
        var h1 = (h - gch) * f;
        ctx.fillRect(x, y + h1, w, gch);
        if (L >= 6) { ctx.fillStyle = col(P, t0 + 0.02); for (var cj = 0; cj < 3; cj++) ctx.fillRect(Math.max(x, C.x0), y + h1 + 0.1 + cj * 0.17, Math.min(x + w, C.x1) - Math.max(x, C.x0), 0.06); }
        pLogic(ctx, x, y, w, h1, seed * 3 + 1, C, L, P, ta, rp, depth + 1);
        pLogic(ctx, x, y + h1 + gch, w, h - h1 - gch, seed * 3 + 2, C, L, P, tb, rp, depth + 1);
      }
      return;
    }
    var RP = rp || RH, cs = RP / RH;
    var xe = x + w, ye = y + h;
    var cx0 = Math.max(x, C.x0), cx1 = Math.min(xe, C.x1);
    ctx.fillStyle = col(P, t0 - 0.13); ctx.fillRect(cx0, Math.max(y, C.y0), cx1 - cx0, Math.min(ye, C.y1) - Math.max(y, C.y0));
    var rows = Math.max(1, Math.floor(h / RP)), rh = h / rows;
    var r0 = Math.max(0, Math.floor((C.y0 - y) / rh)), r1 = Math.min(rows, Math.ceil((C.y1 - y) / rh));
    var rowPx = rh * L, r, R, xx, len, t, yy;
    for (r = r0; r < r1; r++) {
      yy = y + r * rh; R = rng(seed + r * 7919);
      if (rowPx < 3.6) {
        // coarse: the rows average into a mottled tone; long runs + low-frequency placement density
        xx = x;
        while (xx < xe) {
          len = 2 + R() * 10; if (xx + len > xe) len = xe - xx;
          if (xx > C.x1) break;
          if (xx + len > C.x0) {
            t = t0 + (R() - 0.5) * 0.08 + (vnoise(xx * 0.03 + seed % 97, yy * 0.03) - 0.5) * 0.24;
            ctx.fillStyle = col(P, t); ctx.fillRect(xx, yy, len, rh * 0.86);
          }
          xx += len;
        }
        continue;
      }
      xx = x + R() * 0.5;
      var gap = L >= 10 ? 0.05 : 0;
      while (xx < xe) {
        len = (0.28 + R() * R() * 3.2) * cs; var br = R();
        if (xx + len > xe) len = xe - xx;
        if (xx > C.x1) break;
        if (xx + len > C.x0 && len > 0.1) {
          t = t0 + (br - 0.5) * 0.15 + (vnoise(xx * 0.035 + seed % 97, yy * 0.035) - 0.5) * 0.2;
          ctx.fillStyle = col(P, t);
          ctx.fillRect(xx, yy + rh * 0.09, len - gap, rh * 0.82);
          if (L * cs >= 22 && len > 0.36 * cs) {
            // poly gates at contacted pitch, with diffusion breaks
            ctx.fillStyle = col(P, t + 0.1);
            for (var g = xx + 0.09 * cs; g < xx + len - 0.1 * cs; g += 0.15 * cs) ctx.fillRect(g, yy + rh * 0.2, 0.042 * cs, rh * 0.6);
            if (L * cs >= 44) {
              ctx.fillStyle = col(P, t + 0.3);
              for (var q = xx + 0.16; q < xx + len - 0.12; q += 0.3) ctx.fillRect(q, yy + rh * (br > 0.5 ? 0.3 : 0.58), 0.05, 0.05);
            }
          }
        }
        xx += len;
      }
      // M1 power rails between rows (VDD / VSS alternate)
      if (L * cs >= 9) { ctx.fillStyle = col(P, t0 + ((r & 1) ? 0.16 : 0.22)); ctx.fillRect(cx0, yy, cx1 - cx0, 0.065 * cs); }
    }
    // M2: horizontal routing on tracks inside the rows
    if (L >= 6) {
      for (r = r0; r < r1; r++) {
        R = rng(seed * 3 + r * 131 + 17);
        var n = 1 + ((R() * 3.2) | 0);
        for (var k = 0; k < n; k++) {
          var sx = x + R() * w, sl = Math.min(w * 0.45, (0.6 + R() * R() * 11) * cs), tr = (1 + ((R() * 4) | 0)) * rh / 5, tt = t0 + 0.06 + R() * 0.1;
          if (sx > C.x1 || sx + sl < C.x0) continue;
          ctx.fillStyle = col(P, tt); ctx.fillRect(sx, y + r * rh + tr, Math.min(sl, xe - sx), 0.06 * cs);
        }
      }
    }
    // M3: vertical routing in 2-unit bands
    if (L >= 12) {
      var b0 = Math.max(0, Math.floor((C.x0 - x) / 2)), b1 = Math.min(Math.ceil(w / 2), Math.ceil((C.x1 - x) / 2));
      var nv = Math.max(1, Math.round(h / 3));
      for (var b = b0; b < b1; b++) {
        R = rng(seed * 7 + b * 977 + 5);
        for (var v = 0; v < nv; v++) {
          var vy = y + R() * h, vl = Math.min(h * 0.45, (0.6 + R() * R() * 7) * cs), vx = x + b * 2 + R() * 2, vt = t0 + 0.08 + R() * 0.1;
          if (vy > C.y1 || vy + vl < C.y0 || vx > xe) continue;
          ctx.fillStyle = col(P, vt); ctx.fillRect(vx, vy, 0.06 * cs, Math.min(vl, ye - vy));
        }
      }
    }
  }

  // SRAM macro: sub-arrays of 6T bit cells (wordlines / bitline pairs), row decoder spine, sense-amp strip
  var BCW = 0.18, BCH = 0.28;
  function bitcells(ctx, x, y, w, h, C, L, P, t) {
    var xa = Math.max(x, C.x0), xb = Math.min(x + w, C.x1), ya = Math.max(y, C.y0), yb = Math.min(y + h, C.y1);
    if (xb <= xa || yb <= ya) return;
    var ly, lx;
    if (BCH * L >= 2.4) {
      ctx.fillStyle = col(P, t - 0.09);
      for (ly = y + Math.ceil((ya - y) / BCH) * BCH; ly < yb; ly += BCH) ctx.fillRect(xa, ly, xb - xa, BCH * 0.26);
      ctx.fillStyle = col(P, t + 0.08);
      for (lx = x + Math.ceil((xa - x) / BCW) * BCW; lx < xb; lx += BCW) ctx.fillRect(lx, ya, BCW * 0.28, yb - ya);
      if (BCW * L >= 7) {
        // shared contacts: a staggered dot per cell pair
        ctx.fillStyle = col(P, t + 0.26);
        for (ly = y + Math.ceil((ya - y) / (BCH * 2)) * BCH * 2; ly < yb; ly += BCH * 2)
          for (lx = x + Math.ceil((xa - x) / (BCW * 2)) * BCW * 2; lx < xb; lx += BCW * 2) ctx.fillRect(lx + BCW * 0.55, ly + BCH * 0.45, 0.045, 0.045);
      }
    } else if (BCH * 4 * L >= 3.2) {
      // the array reads as a fine sheen: one faint line per 4 wordlines
      ctx.fillStyle = col(P, t - 0.035);
      for (ly = y + Math.ceil((ya - y) / (BCH * 4)) * BCH * 4; ly < yb; ly += BCH * 4) ctx.fillRect(xa, ly, xb - xa, BCH * 1.4);
    }
  }
  function pSram(ctx, x, y, w, h, seed, C, L, cols, rows, P, t0) {
    if (!hit(C, x, y, w, h)) return;
    P = P || pal('sram', seed); t0 = t0 == null ? 0.42 : t0;
    ctx.fillStyle = col(P, 0.08); ctx.fillRect(x, y, w, h);
    var g = 0.7, sp = Math.min(1.1, w * 0.08), cw = (w - g * (cols + 1)) / cols, ch = (h - g * (rows + 1)) / rows;
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var sx = x + g + i * (cw + g), sy = y + g + j * (ch + g);
      if (!hit(C, sx, sy, cw, ch)) continue;
      var t = t0 + (h2(seed + i * 131, j * 17 + 3) - 0.5) * 0.07, half = (cw - sp) / 2;
      var sa = Math.min(0.9, ch * 0.14), ah = ch - sa;
      ctx.fillStyle = col(P, t); ctx.fillRect(sx, sy, half, ah); ctx.fillRect(sx + half + sp, sy, half, ah);
      bitcells(ctx, sx, sy, half, ah, C, L, P, t); bitcells(ctx, sx + half + sp, sy, half, ah, C, L, P, t);
      // row decoder spine
      ctx.fillStyle = col(P, t - 0.16); ctx.fillRect(sx + half, sy, sp, ah);
      if (sp * L >= 6) {
        ctx.fillStyle = col(P, t + 0.02);
        var ya = Math.max(sy, C.y0), yb = Math.min(sy + ah, C.y1);
        for (var ly = sy + Math.max(0, Math.ceil((ya - sy) / (BCH * 2))) * BCH * 2; ly < yb; ly += BCH * 2) ctx.fillRect(sx + half + sp * 0.12, ly, sp * 0.76, BCH * 0.7);
      }
      // sense amps + column mux
      ctx.fillStyle = col(P, t + 0.14); ctx.fillRect(sx, sy + ah, cw, sa);
      if (L >= 8) {
        ctx.fillStyle = col(P, t - 0.02);
        var xa = Math.max(sx, C.x0), xb = Math.min(sx + cw, C.x1);
        for (var lx = sx + Math.max(0, Math.ceil((xa - sx) / (BCW * 2))) * BCW * 2; lx < xb; lx += BCW * 2) ctx.fillRect(lx, sy + ah + sa * 0.15, BCW * 0.7, sa * 0.7);
      }
      // dummy ring around each sub-array
      if (L >= 5) {
        ctx.fillStyle = col(P, t + 0.18);
        var e = Math.min(0.12, 1.2 / L + 0.04);
        ctx.fillRect(sx, sy, cw, e); ctx.fillRect(sx, sy, e, ch); ctx.fillRect(sx + cw - e, sy, e, ch);
      }
    }
  }
  // datapath lanes (ALUs, register-file slices): bit-sliced columns with repeating stage bands
  function pLanes(ctx, x, y, w, h, seed, C, L, n, P, t0) {
    if (!hit(C, x, y, w, h)) return;
    var R = rng(seed), lw = w / n;
    ctx.fillStyle = col(P, 0.07); ctx.fillRect(x, y, w, h);
    for (var i = 0; i < n; i++) {
      var lx = x + i * lw, t = t0 + (R() - 0.5) * 0.08;
      if (lx > C.x1 || lx + lw < C.x0) continue;
      ctx.fillStyle = col(P, t); ctx.fillRect(lx + 0.12, y + 0.2, lw - 0.24, h - 0.4);
      var Rs = rng(seed + 97 * i + 3);
      for (var yy = y + 1; yy < y + h - 0.7; yy += 1.6 + Rs() * 2.6) {
        var bh = 0.3 + Rs() * 0.5, bt = t + 0.1 + Rs() * 0.1;
        if (yy > C.y0 - 1 && yy < C.y1) { ctx.fillStyle = col(P, bt); ctx.fillRect(lx + 0.12, yy, lw - 0.24, bh); }
      }
      if (lw * L >= 10 && L >= 10) {
        // bit slices
        ctx.fillStyle = col(P, t - 0.06);
        var ya = Math.max(y, C.y0), yb = Math.min(y + h, C.y1);
        for (var k = lx + 0.34; k < lx + lw - 0.2; k += 0.34) ctx.fillRect(k, ya, 0.06, yb - ya);
      }
      if (L >= 24) {
        ctx.fillStyle = col(P, t + 0.22);
        var ya2 = Math.max(y, C.y0), yb2 = Math.min(y + h, C.y1);
        for (var m = y + Math.ceil((ya2 - y) / 0.5) * 0.5; m < yb2; m += 0.5) ctx.fillRect(lx + 0.12, m, lw - 0.24, 0.05);
      }
    }
  }
  // MAC arrays (Neural Accelerator / Neural Engine): each cell = multiplier logic + a register-file
  // macro + accumulator strip, framed by the cell's power straps
  function pMacTex(ctx, x, y, w, h, nx, ny, seed, C, L, P, t0) {
    if (!hit(C, x, y, w, h)) return;
    ctx.fillStyle = col(P, 0.06); ctx.fillRect(x, y, w, h);
    var cw = w / nx, ch = h / ny, PS = pal('sram', seed + 3);
    var i0 = Math.max(0, Math.floor((C.x0 - x) / cw)), i1 = Math.min(nx, Math.ceil((C.x1 - x) / cw));
    var j0 = Math.max(0, Math.floor((C.y0 - y) / ch)), j1 = Math.min(ny, Math.ceil((C.y1 - y) / ch));
    var fine = Math.min(cw, ch) * L >= 26;
    for (var i = i0; i < i1; i++) for (var j = j0; j < j1; j++) {
      var cx = x + i * cw, cy = y + j * ch, t = t0 + (h2(i + seed, j) - 0.5) * 0.06 + (vnoise(i * 0.23 + seed % 31, j * 0.23) - 0.5) * 0.08;
      if (!fine) {
        ctx.fillStyle = col(P, t - 0.08); ctx.fillRect(cx + cw * 0.06, cy + ch * 0.08, cw * 0.88, ch * 0.84);
        ctx.fillStyle = col(P, t + 0.02 + (h2(i * 3 + seed, j * 5) - 0.5) * 0.1); ctx.fillRect(cx + cw * 0.1, cy + ch * 0.16, cw * 0.54, ch * 0.5);
        ctx.fillStyle = col(PS, t + 0.12); ctx.fillRect(cx + cw * 0.7, cy + ch * 0.16, cw * 0.2, ch * 0.5);
        ctx.fillStyle = col(P, t + 0.24); ctx.fillRect(cx + cw * 0.1, cy + ch * 0.74, cw * 0.8, ch * 0.09);
        continue;
      }
      // the cell floor between the macros is an etched trench: near-black, so the macros stand up off it
      ctx.fillStyle = col(P, t - 0.26); ctx.fillRect(cx, cy, cw, ch);
      pLogic(ctx, cx + cw * 0.06, cy + ch * 0.1, cw * 0.58, ch * 0.6, seed * 31 + i * 1013 + j * 7, C, L, P, t, 0.2);
      ctx.fillStyle = col(PS, t - 0.04); ctx.fillRect(cx + cw * 0.68, cy + ch * 0.1, cw * 0.24, ch * 0.6);
      bitcells(ctx, cx + cw * 0.68, cy + ch * 0.1, cw * 0.24, ch * 0.6, C, L, PS, t - 0.04);
      ctx.fillStyle = col(P, t + 0.1); ctx.fillRect(cx + cw * 0.06, cy + ch * 0.76, cw * 0.86, ch * 0.1);
      if (L >= 12) {
        ctx.fillStyle = col(P, t - 0.02);
        for (var a = cx + cw * 0.08; a < cx + cw * 0.9; a += 0.11) ctx.fillRect(a, cy + ch * 0.77, 0.04, ch * 0.08);
      }
      // cell straps (VDD/VSS ring of the MAC cell)
      ctx.fillStyle = col(P, t + 0.1);
      ctx.fillRect(cx, cy, cw, 0.05); ctx.fillRect(cx, cy, 0.05, ch);
    }
  }
  function pSpiral(ctx, cx, cy, r, turns, lw, colr) {
    ctx.strokeStyle = colr; ctx.lineWidth = lw; ctx.beginPath();
    var s = r; ctx.moveTo(cx - s, cy - s);
    for (var k = 0; k < turns; k++) {
      var a = r - k * (r / turns) * 0.95, b = r - (k + 0.5) * (r / turns) * 0.95;
      ctx.lineTo(cx + a, cy - a); ctx.lineTo(cx + a, cy + a); ctx.lineTo(cx - b, cy + a); ctx.lineTo(cx - b, cy - b);
    }
    ctx.stroke();
  }
  // metal fill: the foundry's density fill in every channel between blocks (tiny staggered squares)
  function metalFill(ctx, C, L, P) {
    if (L < 7) return;
    var p = 1.2, s = 0.46;
    var x0 = Math.max(0, C.x0), x1 = Math.min(DW, C.x1), y0 = Math.max(0, C.y0), y1 = Math.min(DH, C.y1);
    for (var yy = Math.floor(y0 / p) * p; yy < y1; yy += p) {
      var off = (Math.round(yy / p) & 1) * p * 0.5;
      ctx.fillStyle = col(P, 0.3 + h2(yy * 7 | 0, 5) * 0.08);
      for (var xx = Math.floor((x0 - off) / p) * p + off; xx < x1; xx += p) ctx.fillRect(xx, yy, s, s);
    }
  }
  // top two metals: the global power grid (thick straps) + via stacks where they cross
  function powerGrid(ctx, C, L) {
    var p = 9, sw = 0.62, sh = 0.5, x0 = Math.max(12, C.x0), x1 = Math.min(DW - 12, C.x1), y0 = Math.max(12, C.y0), y1 = Math.min(DH - 12, C.y1);
    if (x1 <= x0 || y1 <= y0) return;
    var sx, sy, deep = L >= 16;
    if (L < 6) {
      // far away the straps average into a faint sheen over the blocks
      var a = L < 3 ? 0.08 : 0.12;
      ctx.fillStyle = 'rgba(190,198,212,' + a + ')';
      for (sx = Math.ceil((x0 - sw) / p) * p; sx < x1; sx += p) ctx.fillRect(sx, y0, sw, y1 - y0);
      ctx.fillStyle = 'rgba(176,184,198,' + (a * 0.62).toFixed(3) + ')';
      for (sy = Math.ceil((y0 - sh) / p) * p + p * 0.5; sy < y1; sy += p) ctx.fillRect(x0, sy, x1 - x0, sh);
      return;
    }
    // close up they are OPAQUE thick top copper: a solid bar with a one-texel bright lip on the lamp side
    // (upper left), a dark shadowed lip on the far side and a thin dark trench each side where the
    // passivation steps down. The lamp overlay then lifts them along its band like real metal.
    var tx = Math.max(1 / L, 0.03), tr = Math.max(1.5 / L, 0.04), ga = ctx.globalAlpha;
    // at the cluster / core stops (L 8..16) the straps are 3-4 px wide and a full-strength cage would
    // fight the blocks, so they come in part-way and reach full metal from the macro stops (L 32+)
    ctx.globalAlpha = ga * (0.42 + 0.58 * sstep(10, 40, L));
    function hBars(fill, off, w) { ctx.fillStyle = fill; for (sy = Math.ceil((y0 - sh) / p) * p + p * 0.5; sy < y1; sy += p) ctx.fillRect(x0, sy + off, x1 - x0, w); }
    function vBars(fill, off, w) { ctx.fillStyle = fill; for (sx = Math.ceil((x0 - sw) / p) * p; sx < x1; sx += p) ctx.fillRect(sx + off, y0, w, y1 - y0); }
    // lower strap layer (horizontal) first, the top layer (vertical) crosses over it
    hBars('rgb(8,9,11)', -tr, sh + 2 * tr);
    hBars('rgb(62,65,71)', 0, sh);                             // lower layer: seen through more dielectric
    hBars('rgb(128,132,140)', 0, tx);
    hBars('rgb(30,32,37)', sh - tx, tx);
    vBars('rgb(8,9,11)', -tr, sw + 2 * tr);
    vBars('rgb(96,99,107)', 0, sw);
    vBars('rgb(126,130,138)', sw * 0.18, sw * 0.26);           // the flat crown catches a little more lamp
    vBars('rgb(196,200,208)', 0, tx);
    vBars('rgb(34,36,41)', sw - tx, tx);
    if (deep) {
      // stress-relief slots along the straps
      ctx.fillStyle = 'rgb(24,26,30)';
      for (sx = Math.ceil((x0 - sw) / p) * p; sx < x1; sx += p)
        for (var sly = Math.ceil(y0 / 2.2) * 2.2; sly < y1; sly += 2.2) ctx.fillRect(sx + sw * 0.4, sly, sw * 0.2, 0.9);
    }
    if (L >= 14) {
      // via arrays at the crossings: 3 x 2 cuts
      ctx.fillStyle = 'rgb(16,17,20)';
      for (sx = Math.ceil((x0 - sw) / p) * p; sx < x1; sx += p)
        for (sy = Math.ceil((y0 - sh) / p) * p + p * 0.5; sy < y1; sy += p)
          for (var vi = 0; vi < 3; vi++) for (var vj = 0; vj < 2; vj++) ctx.fillRect(sx + 0.08 + vi * 0.18, sy + 0.1 + vj * 0.2, 0.1, 0.1);
    }
    ctx.globalAlpha = ga;
  }
  // flip-chip bump / TSV landing grid: faint octagonal UBM pads on a staggered 36-unit pitch
  function bumpGrid(ctx, C, L) {
    var p = 36, r = 5.2;
    var x0 = Math.max(0, C.x0 - r), x1 = Math.min(DW, C.x1 + r), y0 = Math.max(0, C.y0 - r), y1 = Math.min(DH, C.y1 + r);
    ctx.lineWidth = Math.max(0.5 / L, 0.22);
    for (var j = Math.floor((y0 - 24) / p); j * p + 24 < y1; j++) {
      var yy = 24 + j * p, off = (j & 1) ? p / 2 : 0;
      if (yy < 20 || yy > DH - 20) continue;
      for (var i = Math.floor((x0 - 24 - off) / p); i * p + 24 + off < x1; i++) {
        var xx = 24 + off + i * p;
        if (xx < 20 || xx > DW - 20) continue;
        ctx.beginPath();
        for (var k = 0; k < 8; k++) { var a = (k + 0.5) * Math.PI / 4; ctx.lineTo(xx + Math.cos(a) * r, yy + Math.sin(a) * r); }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fill();
        ctx.strokeStyle = 'rgba(214,220,232,0.075)'; ctx.stroke();
      }
    }
  }

  // The whole die, in die units, culled to C, with detail for L texels/unit.
  function paintDie(ctx, C, L) {
    ctx.save();
    var PB = pal('body', 0), PBs = pal('body', 4);
    // die body: dielectric over dense fill, a dark cool grey with a slow thickness drift
    ctx.fillStyle = col(PB, 0.16); ctx.fillRect(Math.max(0, C.x0), Math.max(0, C.y0), Math.min(DW, C.x1) - Math.max(0, C.x0), Math.min(DH, C.y1) - Math.max(0, C.y0));
    metalFill(ctx, C, L, PB);
    // seal ring: concentric metal walls around the die
    [[1.2, 0.5, 0.62], [2.4, 0.35, 0.5], [3.4, 0.3, 0.44], [7.5, 0.25, 0.34]].forEach(function (s) {
      ctx.fillStyle = col(PB, s[2]);
      var o = s[0], lw = s[1];
      ctx.fillRect(o, o, DW - 2 * o, lw); ctx.fillRect(o, DH - o - lw, DW - 2 * o, lw);
      ctx.fillRect(o, o, lw, DH - 2 * o); ctx.fillRect(DW - o - lw, o, lw, DH - 2 * o);
    });
    // I/O pad ring: aluminium bond pads, their passivation openings and the ESD / driver cells
    var p, pw = 7;
    function pad(px, py, horiz) {
      var w = horiz ? pw : 11, h = horiz ? 11 : pw;
      ctx.fillStyle = col(PBs, 0.26); ctx.fillRect(px, py, w, h);
      ctx.fillStyle = col(PBs, 0.66); ctx.fillRect(px + 0.8, py + 0.8, w - 1.6, (horiz ? pw : h) - 1.6);
      ctx.fillStyle = col(PBs, 0.5); ctx.fillRect(px + 1.8, py + 1.8, w - 3.6, (horiz ? pw : h) - 3.6);
    }
    for (p = 16; p < DW - 16; p += 12) {
      if (p + pw < C.x0 || p > C.x1) continue;
      if (C.y0 < 36) { pad(p, 11, true); pLogic(ctx, p + 0.5, 23.5, pw - 1, 9, 9100 + p, C, L, PBs, 0.3); }
      if (C.y1 > DH - 36) { pad(p, DH - 22, true); pLogic(ctx, p + 0.5, DH - 33, pw - 1, 9, 9200 + p, C, L, PBs, 0.3); }
    }
    for (p = 16; p < DH - 16; p += 12) {
      if (p + pw < C.y0 || p > C.y1) continue;
      if (C.x0 < 36) { pad(11, p, false); pLogic(ctx, 23.5, p + 0.5, 9, pw - 1, 9300 + p, C, L, PBs, 0.3); }
      if (C.x1 > DW - 36) { pad(DW - 22, p, false); pLogic(ctx, DW - 33, p + 0.5, 9, pw - 1, 9400 + p, C, L, PBs, 0.3); }
    }
    // CPU: super cores (L1 I/D caches, front end, execution lanes, load/store)
    SUPERC.forEach(function (c, k) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 1000 + k * 50, P = pal('cpu', k), PS = pal('sram', k + 1);
      ctx.fillStyle = col(P, 0.05); ctx.fillRect(c.x, c.y, c.w, c.h);
      pSram(ctx, c.x + 4, c.y + 4, c.w * 0.46 - 6, 30, s + 1, C, L, 3, 3, PS, 0.44);
      pSram(ctx, c.x + c.w * 0.46 + 2, c.y + 4, c.w * 0.54 - 6, 30, s + 2, C, L, 3, 3, PS, 0.44);
      pLogic(ctx, c.x + 4, c.y + 38, c.w - 8, 40, s + 3, C, L, P, 0.4);
      pLanes(ctx, c.x + 4, c.y + 82, c.w * 0.58 - 6, 35, s + 4, C, L, 20, P, 0.38);
      pLogic(ctx, c.x + c.w * 0.58 + 2, c.y + 82, c.w * 0.42 - 6, 35, s + 5, C, L, P, 0.44);
    });
    // CPU: efficiency cores
    EFFC.forEach(function (c, k) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 2000 + k * 50, P = pal('eff', k), PS = pal('sram', k + 2);
      ctx.fillStyle = col(P, 0.05); ctx.fillRect(c.x, c.y, c.w, c.h);
      pSram(ctx, c.x + 3, c.y + 3, c.w - 6, 16, s + 1, C, L, 3, 2, PS, 0.42);
      pLogic(ctx, c.x + 3, c.y + 22, c.w - 6, 36, s + 2, C, L, P, 0.4);
      pLanes(ctx, c.x + 3, c.y + 61, c.w - 6, c.h - 64, s + 3, C, L, 14, P, 0.36);
    });
    // GPU cores: shader ALUs + register files, the Neural Accelerator MAC array below
    GPUC.forEach(function (c) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 3000 + c.i * 100, P = pal('gpu', c.i), PS = pal('sram', c.i + 3), PN = pal('na', c.i);
      ctx.fillStyle = col(P, 0.04); ctx.fillRect(c.x, c.y, c.w, c.h);
      aluCells(c).forEach(function (a, k) {
        if (!hit(C, a.x, a.y, a.w, a.h)) return;
        pLanes(ctx, a.x, a.y, a.w, a.h * 0.78, s + k, C, L, 5, P, 0.4);
        pSram(ctx, a.x, a.y + a.h * 0.8, a.w, a.h * 0.2, s + 50 + k, C, L, 1, 1, PS, 0.42);
      });
      var nr = naRect(c);
      pLogic(ctx, c.x + 3, nr.y - 1.4, c.w - 6, 1.2, s + 90, C, L, P, 0.44);
      pMacTex(ctx, nr.x, nr.y, nr.w, nr.h, 32, 32, s + 91, C, L, PN, 0.4);
    });
    // Neural Engine: 16 cores, MAC arrays + local SRAM
    NEC.forEach(function (c, k) {
      if (!hit(C, c.x, c.y, c.w, c.h)) return;
      var s = 4000 + k * 40, P = pal('ne', k), PS = pal('sram', k + 4);
      ctx.fillStyle = col(P, 0.05); ctx.fillRect(c.x, c.y, c.w, c.h);
      pLogic(ctx, c.x + 3, c.y + 3, c.w - 6, 9, s, C, L, P, 0.42);
      pMacTex(ctx, c.x + 3, c.y + 15, c.w * 0.62 - 4, c.h - 18, 12, 10, s + 1, C, L, P, 0.4);
      pSram(ctx, c.x + c.w * 0.62 + 2, c.y + 15, c.w * 0.38 - 5, c.h - 18, s + 2, C, L, 2, 4, PS, 0.44);
    });
    // Media engines
    (function (b) {
      if (!hit(C, b.x, b.y, b.w, b.h)) return;
      var P = pal('media', 2);
      pLogic(ctx, b.x + 3, b.y + 3, b.w * 0.55 - 5, b.h - 6, 5001, C, L, P, 0.42);
      pLanes(ctx, b.x + b.w * 0.55 + 1, b.y + 3, b.w * 0.45 - 4, b.h * 0.45, 5002, C, L, 16, P, 0.38);
      pSram(ctx, b.x + b.w * 0.55 + 1, b.y + b.h * 0.45 + 6, b.w * 0.45 - 4, b.h * 0.55 - 9, 5003, C, L, 3, 3, pal('sram', 5), 0.42);
    })(BK.media);
    // System level cache: two big SRAM banks around a tag / control spine
    (function (b) {
      if (!hit(C, b.x, b.y, b.w, b.h)) return;
      var PS = pal('sram', 6);
      pSram(ctx, b.x + 3, b.y + 3, b.w * 0.5 - 6, b.h - 6, 6001, C, L, 2, 4, PS, 0.46);
      pLogic(ctx, b.x + b.w * 0.5 - 2, b.y + 3, 4, b.h - 6, 6002, C, L, pal('body', 2), 0.42);
      pSram(ctx, b.x + b.w * 0.5 + 3, b.y + 3, b.w * 0.5 - 6, b.h - 6, 6003, C, L, 2, 4, PS, 0.46);
    })(BK.slc);
    // Memory interface: 8 PHY lanes (DQ drivers, DLL rings, the training logic)
    PHY.forEach(function (l, k) {
      if (!hit(C, l.x, l.y, l.w, l.h)) return;
      var s = 7000 + k * 20, P = pal('phy', k);
      ctx.fillStyle = col(P, 0.08); ctx.fillRect(l.x, l.y, l.w, l.h);
      var fx0 = Math.max(l.x + 1, C.x0), fx1 = Math.min(l.x + l.w - 1, C.x1);
      for (var f = l.x + 1.2; f < l.x + l.w - 1; f += 1.3) {
        if (f < fx0 - 1.3 || f > fx1) continue;
        var tt = 0.46 + h2(f * 10 | 0, k) * 0.12;
        ctx.fillStyle = col(P, tt); ctx.fillRect(f, l.y + 2, 0.75, l.h * 0.46);
        ctx.fillStyle = col(P, tt - 0.16); ctx.fillRect(f, l.y + 4 + l.h * 0.46, 0.75, l.h * 0.12);
        if (L >= 16) { ctx.fillStyle = col(P, tt + 0.2); for (var fy = l.y + 2.4; fy < l.y + 2 + l.h * 0.46; fy += 0.7) ctx.fillRect(f + 0.1, fy, 0.55, 0.12); }
      }
      ctx.strokeStyle = col(P, 0.62); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(l.x + l.w / 2, l.y + l.h * 0.72, l.w * 0.26, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col(P, 0.5);
      ctx.beginPath(); ctx.arc(l.x + l.w / 2, l.y + l.h * 0.72, l.w * 0.16, 0, Math.PI * 2); ctx.stroke();
      pLogic(ctx, l.x + 2, l.y + l.h * 0.87, l.w - 4, l.h * 0.12, s, C, L, P, 0.42);
    });
    // Display and I/O: controllers, PHY SRAM, 4 SerDes lanes with their inductors
    (function (b) {
      if (!hit(C, b.x, b.y, b.w, b.h)) return;
      var P = pal('io', 1);
      pLogic(ctx, b.x + 3, b.y + 3, b.w * 0.42, b.h - 6, 8001, C, L, P, 0.42);
      pSram(ctx, b.x + b.w * 0.42 + 6, b.y + 3, b.w * 0.16, b.h - 6, 8002, C, L, 1, 5, pal('sram', 0), 0.42);
      for (var k = 0; k < 4; k++) {
        var lx = b.x + b.w * 0.6 + 2 + k * ((b.w * 0.4 - 6) / 4), lw = (b.w * 0.4 - 6) / 4 - 3;
        if (!hit(C, lx, b.y, lw, b.h)) continue;
        ctx.fillStyle = col(P, 0.1); ctx.fillRect(lx, b.y + 3, lw, b.h - 6);
        pSpiral(ctx, lx + lw / 2, b.y + 26, lw * 0.4, 4, 0.9, col(pal('phy', k), 0.66));
        pSpiral(ctx, lx + lw / 2, b.y + 70, lw * 0.4, 4, 0.9, col(pal('phy', k + 2), 0.66));
        pLanes(ctx, lx + 1, b.y + 98, lw - 2, b.h - 104, 8100 + k, C, L, 6, P, 0.38);
      }
    })(BK.io);
    // top metals + bump landing grid over everything
    powerGrid(ctx, C, L);
    bumpGrid(ctx, C, L);
    // film thickness drifts slowly across the wafer: a very low-frequency hue drift (<= 7%)
    var cx0 = Math.max(0, C.x0), cy0 = Math.max(0, C.y0), cx1 = Math.min(DW, C.x1), cy1 = Math.min(DH, C.y1);
    ctx.globalCompositeOperation = 'soft-light';
    var gA = ctx.createLinearGradient(0, 0, DW, DH);
    gA.addColorStop(0, 'rgba(214,150,96,0.22)'); gA.addColorStop(0.45, 'rgba(128,128,128,0)');
    gA.addColorStop(0.7, 'rgba(128,128,128,0)'); gA.addColorStop(1, 'rgba(90,160,176,0.22)');
    ctx.fillStyle = gA; ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
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
  var DBG = (win.location && /[?&]chipdebug\b/.test(win.location.search)) ? (win.__CHIPDBG = { samples: [], steps: [], gl: 0, die: 0, dieMax: 0, perf: perf, tiles: {} }) : null;

  /* ------------------------------------------------------------ tiles */
  // LRU tile cache (Map keeps insertion order; a hit re-inserts the key, eviction takes the oldest)
  var TILE = 256, tiles = new Map(), TILE_CAP = 300;
  function tileKey(l, x, y) { return l + ':' + x + ':' + y; }
  function maxLevel() { return MOBILE ? 16 : 64; }
  function getTile(level, tx, ty, gen) {
    var k = tileKey(level, tx, ty), t = tiles.get(k);
    if (t) { tiles.delete(k); tiles.set(k, t); return t; }
    if (!gen) return null;
    var c = doc.createElement('canvas'); c.width = TILE; c.height = TILE;
    // CPU-rastered tiles: painting cost lands inside this frame's 6 ms budget instead of stalling the
    // GPU process later (an accelerated canvas only records here and rasterises on first draw)
    var x = c.getContext('2d', { willReadFrequently: true }), u = TILE / level;
    x.setTransform(level, 0, 0, level, -tx * u * level, -ty * u * level);
    var tp0 = DBG ? now() : 0;
    paintDie(x, { x0: tx * u - 1, y0: ty * u - 1, x1: (tx + 1) * u + 1, y1: (ty + 1) * u + 1 }, level);
    if (DBG) { var tpm = now() - tp0, tl2 = DBG.tiles[level] || (DBG.tiles[level] = { n: 0, sum: 0, max: 0 }); tl2.n++; tl2.sum += tpm; tl2.max = Math.max(tl2.max, tpm); }
    tiles.set(k, c);
    var cap = MOBILE ? 160 : TILE_CAP;
    while (tiles.size > cap) { var old = tiles.keys().next().value, oc = tiles.get(old); if (oc) { oc.width = oc.height = 0; } tiles.delete(old); }
    return c;
  }

  function buildBase() {
    var w = MOBILE ? 2048 : 4096;
    baseCanvas = doc.createElement('canvas');
    baseCanvas.width = w; baseCanvas.height = Math.round(w * DH / DW);
    baseScale = w / DW;
    var x = baseCanvas.getContext('2d');
    x.setTransform(baseScale, 0, 0, baseScale, 0, 0);
    var bp0 = now();
    paintDie(x, { x0: 0, y0: 0, x1: DW, y1: DH }, baseScale);
    if (DBG) DBG.baseMs = now() - bp0;
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

  // Two layers. The STATIC layer (base + LOD tiles + block structure + lens DOF + lamp band) depends
  // only on the view and the pointer, so it is cached in an offscreen canvas and rebuilt only when
  // those change or tiles are still arriving. Every frame then costs one full-screen copy plus the
  // live effects, focus frame, hover, vignette, labels and scrims.
  var SL = { c: null, x: null, key: '', vk: '', settleT: 0, dof: 0, pending: false };
  function drawDie2D(t, alpha) {
    if (!dctx) return;
    var V = computeView(), dpr = dieDpr, ctx = dctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);
    genPending = false;
    if (alpha > 0.002) {
      var W = dieCanvas.width, H = dieCanvas.height;
      if (!SL.c) { SL.c = doc.createElement('canvas'); SL.x = SL.c.getContext('2d'); }
      if (SL.c.width !== W || SL.c.height !== H) { SL.c.width = W; SL.c.height = H; SL.key = ''; }
      var vk = V.k.toFixed(5) + '|' + V.ox.toFixed(2) + '|' + V.oy.toFixed(2) + '|' + W + 'x' + H;
      if (vk !== SL.vk) { SL.vk = vk; SL.settleT = t; SL.dof = 0; }
      // the lens blur only develops once the view has settled (moving frames stay sharp and cheap)
      if (t - SL.settleT > 140 && SL.dof < 1) SL.dof = Math.min(1, SL.dof + 0.25);
      var key = vk + '|' + SL.dof + '|' + lightDrift().toFixed(4) + '|' + (RM ? 1 : 0);
      if (key !== SL.key || SL.pending) { buildStatic(SL.x, t, V, dpr); SL.key = key; }
      if (SL.pending || (SL.dof < 1 && !RM && sstep(4.5, 16, V.s) > 0.02)) genPending = true;   // keep frames coming
      ctx.globalAlpha = alpha;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(SL.c, 0, 0);
      drawLive(ctx, t, V, dpr);
      ctx.globalAlpha = 1;
    }
    drawScrims(ctx);
  }
  function buildStatic(ctx, t, V, dpr) {
    var k = V.k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    var vx0 = -V.ox / k, vy0 = -V.oy / k, vx1 = (cw - V.ox) / k, vy1 = (ch - V.oy) / k;
    var sx0 = clamp(vx0, 0, DW), sy0 = clamp(vy0, 0, DH), sx1 = clamp(vx1, 0, DW), sy1 = clamp(vy1, 0, DH);
    // soft halo so the die edge separates from the section surface
    if (V.s < 1.8) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 60; ctx.fillStyle = '#0a0c10';
      ctx.fillRect(V.ox, V.oy, DW * k, DH * k); ctx.restore();
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    SL.pending = false;
    if (sx1 > sx0 && sy1 > sy0) {
      var bs = baseScale;
      ctx.drawImage(baseCanvas, sx0 * bs, sy0 * bs, (sx1 - sx0) * bs, (sy1 - sy0) * bs, V.ox + sx0 * k, V.oy + sy0 * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
      var need = k * dpr;
      if (need > bs * 1.12) {
        var maxL = maxLevel(), level = 8;
        while (level < need / 1.18 && level < maxL) level *= 2;
        var u = TILE / level, t0 = now();
        var tx0 = Math.floor(sx0 / u), tx1 = Math.floor((sx1 - 1e-6) / u), ty0 = Math.floor(sy0 / u), ty1 = Math.floor((sy1 - 1e-6) / u);
        var list = [];
        for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) list.push([tx, ty, Math.abs((tx + 0.5) * u - (vx0 + vx1) / 2) + Math.abs((ty + 0.5) * u - (vy0 + vy1) / 2)]);
        list.sort(function (a, b) { return a[2] - b[2]; });
        for (var q = 0; q < list.length; q++) {
          var tx2 = list[q][0], ty2 = list[q][1];
          var tile = getTile(level, tx2, ty2, now() - t0 < 6);
          if (!tile) { SL.pending = true; continue; }
          var dx0 = Math.round((V.ox + tx2 * u * k) * dpr) / dpr, dy0 = Math.round((V.oy + ty2 * u * k) * dpr) / dpr;
          var dx1 = Math.round((V.ox + (tx2 + 1) * u * k) * dpr) / dpr, dy1 = Math.round((V.oy + (ty2 + 1) * u * k) * dpr) / dpr;
          ctx.drawImage(tile, dx0, dy0, dx1 - dx0, dy1 - dy0);
        }
      }
    }
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.ox, dpr * V.oy);
    drawStructure(ctx, V, 1 / k);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDOF(ctx, SL.c, V, SL.dof);
    drawLight(ctx, V);
  }
  function drawLive(ctx, t, V, dpr) {
    var k = V.k;
    var vx0 = -V.ox / k, vy0 = -V.oy / k, vx1 = (cw - V.ox) / k, vy1 = (ch - V.oy) / k;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.ox, dpr * V.oy);
    var px = 1 / k; // one CSS pixel in die units
    drawEffects(ctx, t, V, px, { x0: vx0, y0: vy0, x1: vx1, y1: vy1 });
    drawFocus(ctx, V, px);
    drawHover(ctx, px);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette(ctx, V);
    drawLabels(ctx, V);
  }

  // Macro lens at deep stops: the focal plane is the centre of the free frame; the periphery falls
  // off into a soft blur (a 1/6-scale copy, blurred, masked by a radial ramp). Only from about x5 up,
  // so the whole-die and cluster views stay tack sharp.
  var dofC = null, dofX = null;
  function drawDOF(ctx, src, V, ramp) {
    var amt = RM ? 0 : sstep(4.5, 16, V.s) * (ramp == null ? 1 : ramp);
    if (amt < 0.02 || !src) return;
    var W = src.width, H = src.height, w = Math.max(8, Math.round(W / 6)), h = Math.max(8, Math.round(H / 6));
    if (!dofC) { dofC = doc.createElement('canvas'); dofX = dofC.getContext('2d'); }
    if (dofC.width !== w || dofC.height !== h) { dofC.width = w; dofC.height = h; }
    dofX.globalCompositeOperation = 'copy';
    dofX.imageSmoothingEnabled = true; dofX.imageSmoothingQuality = 'medium';
    dofX.filter = 'blur(' + (0.8 + 1.4 * amt).toFixed(2) + 'px)';
    dofX.drawImage(src, 0, 0, w, h);
    dofX.filter = 'none';
    dofX.globalCompositeOperation = 'destination-in';
    var cx = (cw / 2 + FR.offX) / cw * w, cy = (ch / 2 + FR.offY) / ch * h, R = Math.hypot(w, h) * 0.5;
    // the blur is confined to the outer rim of the frame (from 72% of the half-diagonal): the field the
    // copy and the HUD sit over stays tack sharp
    var g = dofX.createRadialGradient(cx, cy, R * 0.72, cx, cy, R * 1.0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,' + (0.5 * amt).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,' + (0.9 * amt).toFixed(3) + ')');
    dofX.fillStyle = g; dofX.fillRect(0, 0, w, h);
    dofX.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dofC, 0, 0, W, H); ctx.restore();
  }

  // The lamp: a wide soft band (a gaussian 35% of the view across) tilted 20 degrees, drifting with the
  // camera and the pointer, like a coaxial microscope lamp glancing off the top metal. Overlay keeps the
  // etched gaps dark while the patterned metal lifts; the band carries a ~6% thin-film hue shift from
  // its warm to its cool flank. Then a lens vignette that deepens at the deep stops.
  var BAND_WARM = [255, 214, 176], BAND_MID = [236, 240, 250], BAND_COOL = [172, 208, 255];
  function drawLight(ctx, V) {
    var a0 = ctx.globalAlpha;
    var drift = lightDrift();
    var cx = cw * (0.5 + drift) + FR.offX, cy = ch * 0.5 + FR.offY;
    var ang = 20 * Math.PI / 180, nx = Math.cos(ang), ny = Math.sin(ang);
    var sig = Math.max(cw, ch) * 0.35 * 0.5, Lh = sig * 3.2;
    var gO = ctx.createLinearGradient(cx - nx * Lh, cy - ny * Lh, cx + nx * Lh, cy + ny * Lh);
    for (var i = 0; i <= 16; i++) {
      var u = i / 16, d = (u - 0.5) * 2 * Lh / sig, a = Math.exp(-d * d * 0.5);
      var k = clamp((u - 0.5) * 2.4, -1, 1), c0 = k < 0 ? BAND_WARM : BAND_COOL, m = Math.abs(k);
      var r = BAND_MID[0] + (c0[0] - BAND_MID[0]) * m | 0, g = BAND_MID[1] + (c0[1] - BAND_MID[1]) * m | 0, b = BAND_MID[2] + (c0[2] - BAND_MID[2]) * m | 0;
      gO.addColorStop(u, 'rgba(' + r + ',' + g + ',' + b + ',' + (0.36 * a).toFixed(3) + ')');
    }
    // only on the silicon (overlay on a transparent pixel would paint the band onto the page)
    var rx0 = Math.max(0, V.ox), ry0 = Math.max(0, V.oy), rx1 = Math.min(cw, V.ox + DW * V.k), ry1 = Math.min(ch, V.oy + DH * V.k);
    if (rx1 > rx0 && ry1 > ry0) {
      // overlay only: it lifts the lit film and metal but leaves the etched gaps black (a screen pass
      // on top lifted every black and read as haze)
      ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = gO; ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a0;
  }
  function lightDrift() { return RM ? 0.08 : 0.34 * Math.sin(S.view * 0.85 + 0.6) + 0.16 * ptr.tx; }
  // lens vignette (stronger and tighter at the deep stops)
  function drawVignette(ctx, V) {
    var deep = sstep(3, 18, V.s);
    var R0 = Math.hypot(cw, ch) / 2, vx = cw / 2 + FR.offX, vy = ch / 2 + FR.offY;
    var v = ctx.createRadialGradient(vx, vy, R0 * (0.62 - 0.04 * deep), vx, vy, R0 * 1.05);
    v.addColorStop(0, 'rgba(6,6,7,0)'); v.addColorStop(0.55, 'rgba(6,6,7,' + (0.16 + 0.1 * deep).toFixed(3) + ')'); v.addColorStop(1, 'rgba(6,6,7,' + (0.55 + 0.15 * deep).toFixed(3) + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
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
    BLOCKS.forEach(function (b) { bevel(ctx, { x: b.x - px, y: b.y - px, w: b.w + 2 * px, h: b.h + 2 * px }, px, 0.06, 0.35); });
    if (k * 122 > 60) GPUC.forEach(function (c) { bevel(ctx, c, px, 0.05, 0.3); });
    strokeR(ctx, { x: 0, y: 0, w: DW, h: DH }, px, 'rgba(236,238,242,0.12)');
    BLOCKS.forEach(function (b) {
      strokeR(ctx, b, px, 'rgba(236,238,242,0.06)');
      if (b.w * k <= 120) return;
      var kids = b.key === 'super' ? SUPERC : b.key === 'eff' ? EFFC : b.key === 'ne' ? NEC : b.key === 'gpu' ? GPUC : b.key === 'mem' ? PHY : null;
      if (!kids) return;
      kids.forEach(function (c) {
        strokeR(ctx, c, px, 'rgba(4,5,7,0.5)');
        if (b.key === 'gpu' && c.w * k > 120) {
          strokeR(ctx, naRect(c), px, 'rgba(4,5,7,0.45)');
          strokeR(ctx, aluRect(c), px, 'rgba(4,5,7,0.4)');
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

  // wave profile behind a front at x = 0: fast attack, exponential decay to an 18% residual
  function waveB(x) {
    if (RM) return 0.16;
    if (x <= 0) return 0;
    return sstep(0, 0.025, x) * (0.06 + 0.94 * Math.exp(-x / 0.07));
  }
  var glowSprites = [];
  function glowSprite(kind) {
    if (glowSprites[kind]) return glowSprites[kind];
    var c = doc.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    var rgb = kind ? '205,226,255' : '255,178,84';
    g.addColorStop(0, 'rgba(' + rgb + ',0.9)'); g.addColorStop(0.35, 'rgba(' + rgb + ',0.42)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (glowSprites[kind] = c);
  }
  function drawEffects(ctx, t, V, px, C) {
    var k = V.k, time = t / 1000, ga0 = ctx.globalAlpha;
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
        // shader ALUs light from within: a cool glow rolling through the lanes, never flat fills
        ctx.globalCompositeOperation = 'lighter';
        GPUC.forEach(function (c) {
          if (!hit(C, c.x, c.y, c.w, c.h)) return;
          aluCells(c).forEach(function (a) {
            var fl = RM ? 1 : 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * 4.2 - (a.j * 0.9 + a.i * 0.35) + c.i * 1.3), 3);
            var al = 0.2 * fl * gpuAmt;
            if (al < 0.004) return;
            ctx.globalAlpha = ga0 * al;
            ctx.drawImage(glowSprite(1), a.x - a.w * 0.2, a.y - a.h * 0.15, a.w * 1.4, a.h * 1.1);
          });
        });
        ctx.globalAlpha = ga0;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // MAC wave: a travelling front of activity sweeps the Neural Accelerator arrays diagonally,
        // glowing from under the passivation and settling to a faint residual as it moves on
        var wv = RM ? { w: 1, fade: 1 } : waveValue(t);
        var ww = wv.w * 1.3;
        if (ww > 0 && wv.fade > 0.01) {
          GPUC.forEach(function (c) {
            var r = naRect(c);
            if (!hit(C, r.x, r.y, r.w, r.h)) return;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
            // the soft band, in cell space: phase (i + j) / 62 runs along the diagonal of the array
            ctx.translate(r.x, r.y); ctx.scale(r.w / 32, r.h / 32);
            var g = ctx.createLinearGradient(0, 0, 31, 31);
            for (var q = 0; q <= 20; q++) {
              var ph = q / 20, bb = waveB(ww - ph) * wv.fade;
              g.addColorStop(ph, 'rgba(242,163,58,' + (0.22 * bb).toFixed(3) + ')');
            }
            ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
            ctx.restore();
            if (V.s > 7) {
              // per cell: the accumulator strip and multiplier core light up as the front passes
              ctx.globalCompositeOperation = 'lighter';
              macCells(ctx, r, V, px, C, function (i, j, x, y, w, h) {
                var b = waveB(ww - (i + j) / 62) * wv.fade;
                if (b < 0.02) return;
                ctx.globalAlpha = ga0 * b * 0.7;
                ctx.drawImage(glowSprite(0), x - w * 0.1, y - h * 0.05, w * 0.84, h * 0.84);
                ctx.fillStyle = 'rgba(255,196,120,0.6)'; ctx.fillRect(x + w * 0.06, y + h * 0.76, w * 0.86, h * 0.1);
              });
              ctx.globalAlpha = ga0;
              ctx.globalCompositeOperation = 'source-over';
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

  // Macro studio for the package (LOOKDEV-BRIEF §6 / §8.4): a cool black void with one soft top key,
  // two low rake strips that give every ball, pad and trace edge a crisp glint, a rear gradient softbox
  // for the glossy mask / die at the 3/4 view, and a thin rim line. az is degrees from the camera side
  // toward +x (the studio turns with the camera), el is elevation.
  function lf(az, el, d, o) {
    var a = az * Math.PI / 180, e = el * Math.PI / 180;
    o.p = [d * Math.sin(a) * Math.cos(e), d * Math.sin(e), d * Math.cos(a) * Math.cos(e)];
    return o;
  }
  var CHIP_STUDIO = {
    dome: { zenith: 0.022, horizon: 0.007, nadir: 0.003, zExp: 0.7, nExp: 0.6, hot: 0 },
    exposure: 1.1, background: '#000000', floor: [0.004, 0.004, 0.005], tint: [0.955, 0.97, 1.0],
    panels: [
      lf(180, 74, 30, { s: 'rect', w: 30, h: 30, I: 1.7, soft: [0.6, 0.6], grad: [0.7, 0] }),          // keyTop (over, slightly behind)
      lf(-70, 7, 30, { s: 'rect', w: 30, h: 1.2, I: 8, soft: [0.35, 0.45], grad: [0.3, 0] }),           // rake L
      lf(70, 7, 30, { s: 'rect', w: 30, h: 1.2, I: 7, soft: [0.35, 0.45], grad: [0.3, 0] }),            // rake R
      lf(180, 2, 30, { s: 'rect', w: 40, h: 0.8, I: 6, soft: [0.3, 0.45], grad: [0, 0] }),              // rimBack
      lf(186, 30, 30, { s: 'rect', w: 44, h: 30, I: 1.0, soft: [0.6, 0.6], grad: [0.4, 0.85] }),      // rearHigh: mask + die sheen at 3/4
      lf(-35, 40, 30, { s: 'rect', w: 9, h: 16, I: 0.9, soft: [0.5, 0.5], grad: [0.5, 0.4] }),         // soft fill: ball fronts, cap bodies
      lf(0, 12, 30, { s: 'rect', w: 36, h: 3, I: 0.5, soft: [0.4, 0.5], grad: [0.2, 0] })              // low front sweep: front walls
    ]
  };

  // height (canvas, grey) -> tangent-space normal map on the GPU (Sobel, mipmapped, anisotropic)
  function heightToNormal(THREE, renderer, src, w, h, strength) {
    var ht = new THREE.CanvasTexture(src); ht.colorSpace = THREE.NoColorSpace; ht.generateMipmaps = false; ht.minFilter = THREE.LinearFilter;
    var rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    rt.texture.colorSpace = THREE.NoColorSpace;
    rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
    var mat = new THREE.ShaderMaterial({
      uniforms: { tH: { value: ht }, texel: { value: new THREE.Vector2(1 / w, 1 / h) }, k: { value: strength } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tH; uniform vec2 texel; uniform float k; varying vec2 vUv;',
        'float H(float x, float y){ return texture2D(tH, vUv + vec2(x, y) * texel * 1.5).r; }',
        'void main(){',
        '  float dx = (H(1.,-1.) + 2.*H(1.,0.) + H(1.,1.)) - (H(-1.,-1.) + 2.*H(-1.,0.) + H(-1.,1.));',
        '  float dy = (H(-1.,1.) + 2.*H(0.,1.) + H(1.,1.)) - (H(-1.,-1.) + 2.*H(0.,-1.) + H(1.,-1.));',
        '  vec3 n = normalize(vec3(-dx * k, -dy * k, 1.0));',
        '  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);',
        '}'].join('\n'),
      depthTest: false, depthWrite: false, toneMapped: false
    });
    var sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; sc.add(q);
    var prevRT = renderer.getRenderTarget(), prevTM = renderer.toneMapping, prevAC = renderer.autoClear;
    renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true;
    renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prevRT);
    renderer.toneMapping = prevTM; renderer.autoClear = prevAC;
    q.geometry.dispose(); mat.dispose(); ht.dispose();
    rt.texture.userData.rt = rt;
    return rt.texture;
  }

  // concave underfill fillet swept around a w x d footprint: height h0 up the die wall, r out on the substrate
  function filletRing(THREE, w, d, r, h0, segs) {
    var path = [], hw = w / 2, hd = d / 2, cs = 6, k;
    var corners = [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, Math.PI * 1.5]];
    // path entries: corner point + outward direction rotating through the corner
    corners.forEach(function (c) {
      for (k = 0; k <= cs; k++) { var ang = c[2] + (k / cs) * Math.PI / 2; path.push([c[0], c[1], Math.cos(ang), Math.sin(ang)]); }
    });
    var prof = [];
    for (k = 0; k <= segs; k++) { var th = k / segs * Math.PI / 2; prof.push([r - r * Math.cos(th), (h0) - h0 * Math.sin(th)]); }
    // prof: (outward offset, height): th=0 -> (0, h0) on the wall, th=90 -> (r, 0) on the substrate
    var pos = [], idx = [], P = path.length, J = prof.length;
    for (var i = 0; i < P; i++) for (var j = 0; j < J; j++) {
      var pp = path[i], o = prof[j][0];
      pos.push(pp[0] + pp[2] * o, prof[j][1], pp[1] + pp[3] * o);
    }
    for (i = 0; i < P; i++) {
      var i2 = (i + 1) % P;
      for (j = 0; j < J - 1; j++) {
        var a0 = i * J + j, a1 = i2 * J + j, b0 = i * J + j + 1, b1 = i2 * J + j + 1;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // make sure normals face outward/up
    var n = g.attributes.normal;
    if (n.getY(Math.floor(J / 2)) < 0) { for (i = 0; i < idx.length; i += 3) { var tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }

  function buildGL(res) {
    if (G || glFailed) return;
    if (!res || !res.THREE) { glFail(); return; }
    var THREE = res.THREE, AD = res.ADDONS || {};
    var RK = win.RenderKit, RKM = RK && RK.materials;
    // the RenderKit pipeline owns AA (MSAA x4 scene target + still-frame accumulation), so the canvas
    // itself needs no multisampling; without the kit we fall back to a plain MSAA canvas
    var usePipe = !!(RK && RK.createPipeline && RK.createStudio);
    try {
      gl = glCanvas.getContext('webgl2', { antialias: !usePipe, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false });
    } catch (e) { gl = null; }
    if (!gl) { glFail(); return; }
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl, antialias: !usePipe, alpha: true });
    } catch (e2) { glFail(); return; }
    renderer.setPixelRatio(glDpr);
    renderer.setSize(cw, ch, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = CHIP_STUDIO.exposure;
    renderer.setClearColor(0x000000, 0);
    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    var scene = new THREE.Scene();
    var studio = null;
    if (RK && RK.createStudio) {
      try { studio = RK.createStudio(renderer, { scene: scene, preset: CHIP_STUDIO, size: 512 }); } catch (eS) { studio = null; }
    }
    if (!studio) {
      var pm = new THREE.PMREMGenerator(renderer);
      var envScene = AD.RoomEnvironment ? new AD.RoomEnvironment() : null;
      if (envScene) { scene.environment = pm.fromScene(envScene, 0.04).texture; if (envScene.dispose) envScene.dispose(); }
      pm.dispose();
      scene.environmentIntensity = 0.6;
      var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-6, 14, 8); scene.add(key);
    }
    var camera = new THREE.PerspectiveCamera(30, cw / ch, 0.1, 200);
    camera.setViewOffset(cw, ch, -FR.offX, -FR.offY, cw, ch);

    var root = new THREE.Group(); scene.add(root);
    function tex(c, srgb) {
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = maxAniso; t.needsUpdate = true;
      return t;
    }
    function phys(p) { return new THREE.MeshPhysicalMaterial(p); }

    /* ---- layout (SPEC §8) */
    var SUB = { w: 12, t: 0.35, d: 9 }, DIE = { w: 5.2, t: 0.12, d: 5.2 * DH / DW, x: -1.6 }, MEM = { w: 2.4, t: 0.25, d: 1.9, x: 3.4, z: 1.2 };
    var TIM = { w: 5.4, t: 0.02, d: 4.7 };

    /* ---- substrate: solder mask over copper, ENIG gold only where the mask is open */
    var SPX = MOBILE ? 1536 : 2560, SPY = Math.round(SPX * SUB.d / SUB.w);
    var traces = substrateTraces(SUB, DIE, MEM);
    function paintSub(mode) {
      var c = doc.createElement('canvas'); c.width = SPX; c.height = SPY;
      var x = c.getContext('2d');
      x.setTransform(SPX / SUB.w, 0, 0, SPY / SUB.d, SPX / 2, SPY / 2);
      paintSubstrate(x, traces, mode, SUB, DIE, MEM, SPX / SUB.w);
      return c;
    }
    var subAlb = tex(paintSub('albedo'), true), subOrm = tex(paintSub('orm'), false);
    var subNrm = heightToNormal(THREE, renderer, paintSub('height'), SPX, SPY, 1.1);
    // mask: very dark green epoxy (base, rough 0.5) under its glossy polymer skin (coat 1.0 / 0.16).
    // The coat follows the copper relief (the same normal map), so the rake light draws every trace.
    // ORM: R = coat (0 over exposed gold), G = roughness, B = metalness.
    var subTopMat = phys({
      map: subAlb, roughnessMap: subOrm, metalnessMap: subOrm, roughness: 1, metalness: 1,
      normalMap: subNrm, normalScale: new THREE.Vector2(1, 1),
      clearcoat: 1, clearcoatMap: subOrm, clearcoatRoughness: 0.16, clearcoatNormalMap: subNrm, clearcoatNormalScale: new THREE.Vector2(0.9, 0.9),
      specularIntensity: 0.6
    });
    // laminate edge: BT core with the copper planes showing as thin bright lines
    var edgeC = doc.createElement('canvas'); edgeC.width = 8; edgeC.height = 256;
    (function (c) {
      var x = c.getContext('2d');
      x.fillStyle = '#10150f'; x.fillRect(0, 0, 8, 256);
      [[0, 14, '#0b1a12'], [242, 14, '#0b1a12']].forEach(function (b) { x.fillStyle = b[2]; x.fillRect(0, b[0], 8, b[1]); });
      [16, 58, 100, 146, 190, 236].forEach(function (y, i) { x.fillStyle = i % 2 ? '#b07a52' : '#c28a5c'; x.fillRect(0, y, 8, 5); });
      [36, 80, 124, 168, 212].forEach(function (y) { x.fillStyle = '#2a2a1c'; x.fillRect(0, y, 8, 10); });
    })(edgeC);
    var edgeT = tex(edgeC, true);
    var subSideMat = phys({ map: edgeT, roughness: 0.55, metalness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    var subBotMat = phys({ color: 0x0B120E, roughness: 0.7 });
    var substrate = new THREE.Group(); root.add(substrate);
    var subMesh = new THREE.Mesh(new THREE.BoxGeometry(SUB.w, SUB.t, SUB.d), [subSideMat, subSideMat, subTopMat, subBotMat, subSideMat, subSideMat]);
    subMesh.position.y = SUB.t / 2; substrate.add(subMesh);

    // soft contact shadows of the die and memory on the mask; they fade as the parts lift away
    function shadowTex() {
      var c = doc.createElement('canvas'); c.width = 256; c.height = 256;
      var x = c.getContext('2d');
      x.filter = 'blur(14px)'; x.fillStyle = '#000'; x.fillRect(44, 44, 168, 168); x.filter = 'none';
      return tex(c, false);
    }
    var shT = shadowTex();
    function shadowPlane(w, d, x, z) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shT, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, SUB.t + 0.0015, z); m.renderOrder = 1;
      m.userData.noContactShadow = true;
      substrate.add(m); return m;
    }
    var shDie = shadowPlane((DIE.w + 0.2) * 1.55, (DIE.d + 0.2) * 1.55, DIE.x, 0);
    var shMem = [-1, 1].map(function (sz) { return shadowPlane(MEM.w * 1.6, MEM.d * 1.6, MEM.x, sz * MEM.z); });

    // decoupling capacitors (0201 MLCC): ceramic body + tin terminations, rounded like the real parts
    var caps = capList(DIE, MEM);
    var RB = AD.RoundedBoxGeometry;
    var capBodyGeo = RB ? new RB(0.13, 0.09, 0.11, 2, 0.01) : new THREE.BoxGeometry(0.13, 0.09, 0.11);
    var capEndGeo = RB ? new RB(0.042, 0.094, 0.114, 2, 0.012) : new THREE.BoxGeometry(0.042, 0.094, 0.114);
    var capBody = new THREE.InstancedMesh(capBodyGeo, phys({ color: 0x8c7258, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35 }), caps.length);
    var capEnds = new THREE.InstancedMesh(capEndGeo, phys({ color: 0xc8c8c8, roughness: 0.35, metalness: 1 }), caps.length * 2);
    var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    caps.forEach(function (c, i) {
      q4.setFromAxisAngle(up, c.rot ? Math.PI / 2 : 0);
      m4.compose(v3.set(c.x, SUB.t + 0.045, c.z), q4, s3); capBody.setMatrixAt(i, m4);
      for (var e = 0; e < 2; e++) {
        var off = (e ? 1 : -1) * 0.079;
        if (c.rot) v3.set(c.x, SUB.t + 0.047, c.z + off); else v3.set(c.x + off, SUB.t + 0.047, c.z);
        m4.compose(v3, q4, s3); capEnds.setMatrixAt(i * 2 + e, m4);
      }
    });
    substrate.add(capBody); substrate.add(capEnds);

    /* ---- die: polished silicon under a thin-film passivation, the floorplan in the metal below */
    var dieGroup = new THREE.Group(); root.add(dieGroup);
    var dieTex = tex(baseCanvas, true);
    // metal-layer micro grid: 1-texel grooves between the top-metal fill tiles (4 cells per ~100 px)
    var gridC = doc.createElement('canvas'); gridC.width = gridC.height = 256;
    (function (c) {
      var x = c.getContext('2d');
      x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, 256, 256);
      x.fillStyle = 'rgb(70,70,70)';
      for (var i = 0; i < 8; i++) { x.fillRect(i * 32, 0, 2, 256); x.fillRect(0, i * 32, 256, 2); }
      x.fillStyle = 'rgb(175,175,175)';
      for (var a = 0; a < 8; a++) for (var b = 0; b < 8; b++) if (h2(a, b) > 0.55) x.fillRect(a * 32 + 8, b * 32 + 8, 16, 16);
    })(gridC);
    var gridN = heightToNormal(THREE, renderer, gridC, 256, 256, 1.2);
    gridN.repeat.set(DIE.w / 0.14 / 8, DIE.d / 0.14 / 8);
    var dieTopMat = RKM && RKM.siliconDie ? RKM.siliconDie({ THREE: THREE, iridescence: 0.2 }) : phys({ metalness: 1, roughness: 0.1, iridescence: 0.2, iridescenceIOR: 1.46, iridescenceThicknessRange: [300, 430] });
    dieTopMat.color = new THREE.Color(0xffffff);
    dieTopMat.map = dieTex;                        // F0 = the patterned metal under the film
    // a low emissive floor only: the floorplan colour comes from the lit metal + the thin film, not from a
    // glow (at .25 the die read as back-lit stained glass)
    dieTopMat.emissive = new THREE.Color(0xffffff); dieTopMat.emissiveMap = dieTex; dieTopMat.emissiveIntensity = 0.1;
    dieTopMat.iridescence = 0.42;
    // part metal (the patterned copper), part dielectric (the passivation's white reflection on top),
    // which keeps the film colour at the saturation of the 2D micrograph it hands off to
    dieTopMat.metalness = 0.6; dieTopMat.roughness = 0.13;
    dieTopMat.normalMap = gridN; dieTopMat.normalScale = new THREE.Vector2(0.35, 0.35);
    dieTopMat.needsUpdate = true;
    // sawn silicon edge + backside: dark, fine-ground
    var dieSideMat = phys({ color: 0x1b1e24, metalness: 0.6, roughness: 0.32 });
    var fillet = new THREE.Mesh(filletRing(THREE, DIE.w, DIE.d, 0.075, 0.1, 6), phys({ color: 0x14130f, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25, side: THREE.DoubleSide }));
    fillet.position.set(DIE.x, SUB.t, 0); dieGroup.add(fillet);
    var dieBody = new THREE.Mesh(new THREE.BoxGeometry(DIE.w, DIE.t, DIE.d), dieSideMat);
    dieBody.position.set(DIE.x, SUB.t + 0.03 + DIE.t / 2, 0); dieGroup.add(dieBody);
    var dieTopY = SUB.t + 0.03 + DIE.t + 0.001;
    var dieTop = new THREE.Mesh(new THREE.PlaneGeometry(DIE.w, DIE.d), dieTopMat);
    dieTop.rotation.x = -Math.PI / 2; dieTop.position.set(DIE.x, dieTopY, 0); dieGroup.add(dieTop);
    // C4 bump field on the substrate under the die (seen once the die lifts)
    (function () {
      var nx = 30, nz = 24, pts = [];
      for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++) pts.push([DIE.x - DIE.w / 2 + 0.2 + i * (DIE.w - 0.4) / (nx - 1), -DIE.d / 2 + 0.2 + j * (DIE.d - 0.4) / (nz - 1)]);
      var bg = new THREE.SphereGeometry(0.045, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      var bm = new THREE.InstancedMesh(bg, phys({ color: 0xc9ccd0, metalness: 1, roughness: 0.2 }), pts.length);
      pts.forEach(function (p, i) { m4.compose(v3.set(p[0], SUB.t + 0.002, p[1]), q4.identity(), s3.set(1, 0.7, 1)); bm.setMatrixAt(i, m4); });
      s3.set(1, 1, 1);
      substrate.add(bm);
    })();

    /* ---- unified memory packages: satin mould compound, laser marking, pin-1 dimple */
    var memGeo = RB ? new RB(MEM.w, MEM.t, MEM.d, 3, 0.045) : new THREE.BoxGeometry(MEM.w, MEM.t, MEM.d);
    var bbN = RK && RK.textures && RK.textures.beadBlast ? RK.textures.beadBlast({ THREE: THREE }) : null;
    if (bbN) { bbN = bbN.clone(); bbN.repeat.set(6, 6); bbN.wrapS = bbN.wrapT = THREE.RepeatWrapping; }
    var memMat = phys({ color: 0x111111, roughness: 0.55, metalness: 0.0, clearcoat: 0.1, clearcoatRoughness: 0.5, normalMap: bbN, normalScale: new THREE.Vector2(0.25, 0.25) });
    var markC = doc.createElement('canvas'); markC.width = 1024; markC.height = 810;
    (function (c) {
      var x = c.getContext('2d');
      x.fillStyle = '#fff';
      try { x.letterSpacing = '6px'; } catch (e) { /* ignore */ }
      x.font = '600 64px ' + MONO; x.fillText('UNIFIED MEMORY', 150, 380);
      try { x.letterSpacing = '4px'; } catch (e) { /* ignore */ }
      x.font = '500 46px ' + MONO; x.fillText('M5  LPDDR5X', 150, 470);
      x.font = '500 34px ' + MONO; x.globalAlpha = 0.8; x.fillText('X9  2531  A1', 150, 548);
      x.globalAlpha = 1;
      // pin-1 dimple rim (laser-cleaned ring)
      x.lineWidth = 6; x.strokeStyle = '#fff'; x.beginPath(); x.arc(92, 92, 40, 0, Math.PI * 2); x.stroke();
    })(markC);
    var markT = tex(markC, true);
    // laser marking = rougher, lighter mould surface, lit like the body (not an unlit decal)
    var markMat = phys({ color: 0x565656, map: markT, alphaMap: markT, transparent: true, roughness: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var dimpleMat = phys({ color: 0x080808, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.12 });
    var mems = [-1, 1].map(function (sz) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(memGeo, memMat); body.position.y = MEM.t / 2 + 0.01; g.add(body);
      var mk = new THREE.Mesh(new THREE.PlaneGeometry(MEM.w * 0.9, MEM.d * 0.9), markMat);
      mk.rotation.x = -Math.PI / 2; mk.position.y = MEM.t + 0.0105; mk.renderOrder = 2; g.add(mk);
      var dim = new THREE.Mesh(new THREE.CircleGeometry(0.08, 32), dimpleMat);
      dim.rotation.x = -Math.PI / 2;
      dim.position.set(-MEM.w * 0.45 + 0.19, MEM.t + 0.0102, -MEM.d * 0.45 + 0.19); g.add(dim);
      g.position.set(MEM.x, SUB.t, sz * MEM.z);
      g.userData.z = sz * MEM.z;
      root.add(g); return g;
    });

    /* ---- thermal interface: satin grey paste sheet with a fine stipple */
    // a satin paste film, not a card: stippled normal, and opacity that climbs toward grazing angles
    // (a thin film is seen through face-on and goes milky edge-on), so it reads as a layer with thickness
    var timN = bbN ? bbN.clone() : null;
    if (timN) { timN.repeat.set(14, 14); timN.needsUpdate = true; }
    // spread paste is never one flat grey: a soft mottle (thicker / thinner) + faint spreader streaks
    var mottleC = doc.createElement('canvas'); mottleC.width = mottleC.height = 256;
    (function (c) {
      var x = c.getContext('2d'), im = x.createImageData(256, 256), d = im.data;
      for (var yy = 0; yy < 256; yy++) for (var xx = 0; xx < 256; xx++) {
        var v = 0.5 * vnoise(xx / 26, yy / 26) + 0.3 * vnoise(xx / 9 + 17, yy / 9) + 0.2 * vnoise(xx / 3.2, yy / 40 + 5);
        var g = 150 + (v - 0.5) * 120 | 0, o = (yy * 256 + xx) * 4;
        d[o] = d[o + 1] = d[o + 2] = clamp(g, 0, 255); d[o + 3] = 255;
      }
      x.putImageData(im, 0, 0);
    })(mottleC);
    var mottleT = tex(mottleC, true); mottleT.wrapS = mottleT.wrapT = THREE.RepeatWrapping; mottleT.repeat.set(2, 2);
    var timMat = phys({ color: 0xa3a9b0, map: mottleT, transparent: true, opacity: 0.42, roughness: 0.55, metalness: 0.0, sheen: 0.7, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xd4dae2), depthWrite: false, normalMap: timN, normalScale: new THREE.Vector2(0.9, 0.9) });
    timMat.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', [
        'float timNV = clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );',
        'diffuseColor.a = clamp( diffuseColor.a * ( 0.45 + 2.6 * pow( 1.0 - timNV, 2.0 ) ), 0.0, 0.94 );',
        '#include <opaque_fragment>'].join('\n'));
    };
    timMat.customProgramCacheKey = function () { return 'chip-tim-fresnel'; };
    var tim = new THREE.Mesh(RB ? new RB(TIM.w, TIM.t, TIM.d, 2, 0.008) : new THREE.BoxGeometry(TIM.w, TIM.t, TIM.d), timMat);
    var timBaseY = dieTopY + TIM.t / 2 + 0.002;
    tim.position.set(DIE.x, timBaseY, 0); tim.renderOrder = 3; root.add(tim);

    /* ---- ball grid array 28 x 20: SAC305 solder spheres on ENIG pads */
    var bgaGeo = new THREE.SphereGeometry(0.12, 20, 12);
    // SAC305 reflows to a satin tin-silver: rougher than a mirror ball, so each sphere integrates the
    // overhead softbox into a silver-grey body with one soft highlight instead of mirroring the black void
    var bga = new THREE.InstancedMesh(bgaGeo, phys({ color: 0xc9ccd0, metalness: 1, roughness: 0.3, envMapIntensity: 1.9 }), 28 * 20);
    var padGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.02, 28);
    var goldMat = RKM && RKM.goldPad ? RKM.goldPad({ THREE: THREE, roughness: 0.22 }) : phys({ color: 0xe6c27a, metalness: 1, roughness: 0.22 });
    var pads = new THREE.InstancedMesh(padGeo, goldMat, 28 * 20);
    var bi = 0;
    for (var ix = 0; ix < 28; ix++) for (var iz = 0; iz < 20; iz++) {
      var bx = -5.4 + ix * 0.4, bz = -4.04 + iz * 0.425;
      m4.compose(v3.set(bx, -0.11, bz), q4.identity(), s3.set(1, 0.86, 1)); bga.setMatrixAt(bi, m4);
      m4.compose(v3.set(bx, -0.01, bz), q4.identity(), s3.set(1, 1, 1)); pads.setMatrixAt(bi, m4);
      bi++;
    }
    // the ENIG pads belong to the substrate underside: when the balls drop away the pads stay put (hidden
    // under the substrate from above), instead of riding on the balls as gold caps
    var bgaGroup = new THREE.Group(); bgaGroup.add(bga); root.add(bgaGroup); substrate.add(pads);

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

    /* ---- post: RenderKit pipeline (MSAA x4 HalfFloat scene, idle GTAO + 32-sample accumulation) */
    var pipe = null, bloomAnchor = null;
    if (usePipe) {
      try {
        pipe = RK.createPipeline(renderer, scene, camera, {
          alpha: true, quality: MOBILE ? 'low' : 'auto',
          // chip units are ~mm: AO reaches under a 0.09 cap / along the 0.12 die edge, not across the board
          ao: { radius: 0.32, distanceExponent: 2.0, thickness: 0.35, distanceFallOff: 0.5, scale: 1.3, intensity: 0.9 },
          bloom: { strength: 0.3, radius: 0.9 }
        });
        points.layers.enable(pipe.bloomLayer);
        Object.keys(flashes).forEach(function (k) { flashes[k].layers.enable(pipe.bloomLayer); });
        // the kit only runs bloom when a MESH sits on the bloom layer: a zero-size anchor switches
        // it on exactly while the memory stream is visible (points and flash lines are not meshes)
        bloomAnchor = new THREE.Mesh(new THREE.PlaneGeometry(1e-4, 1e-4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        bloomAnchor.layers.enable(pipe.bloomLayer); bloomAnchor.visible = false; bloomAnchor.userData.noContactShadow = true;
        root.add(bloomAnchor);
      } catch (eP) { pipe = null; if (win.console) console.warn('[chip] pipeline off:', eP && eP.message); }
    }

    G = {
      THREE: THREE, renderer: renderer, scene: scene, camera: camera, root: root, studio: studio, pipe: pipe, pipeMore: false, bloomAnchor: bloomAnchor,
      substrate: substrate, dieGroup: dieGroup, mems: mems, tim: tim, timBaseY: timBaseY, bgaGroup: bgaGroup,
      shDie: shDie, shMem: shMem,
      dieTopY: dieTopY, DIE: DIE, MEM: MEM, SUB: SUB, TIM: TIM, flashes: flashes, flashT: flashT, prevLY: prevLY,
      curves: curves, seeds: seeds, ptsPos: ptsPos, ptsGeo: ptsGeo, points: points, NPTS: NPTS,
      streamPhase: streamPhase, v: new THREE.Vector3(), tgt: new THREE.Vector3(), fwd: new THREE.Vector3(), first: true,
      orbit: { tx: 0, ty: 0 }
    };
    if (win.location && /[?&]chipdebug\b/.test(win.location.search)) win.__CHIPG = G;

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
  // Substrate top, painted in board units. mode:
  //   'albedo' sRGB colour: mask over laminate (lighter green where copper runs under it), ENIG gold, silkscreen
  //   'orm'    R = clearcoat (mask skin; 0 on exposed gold), G = roughness, B = metalness
  //   'height' grey relief: copper under the mask stands ~25 um proud, mask openings sink, tented vias dimple
  function paintSubstrate(x, traces, mode, SUB, DIE, MEM, ppu) {
    var ALB = mode === 'albedo', ORM = mode === 'orm', HGT = mode === 'height', W = SUB.w, H = SUB.d, R = rng(71);
    var px = 1 / (ppu || 200);
    var BASE = ALB ? '#0e2319' : ORM ? 'rgb(255,128,0)' : 'rgb(110,110,110)';
    x.fillStyle = BASE; x.fillRect(-W / 2, -H / 2, W, H);
    var i;
    if (ALB) {
      // mask thickness mottling
      for (i = 0; i < 9000; i++) {
        var qx = -W / 2 + R() * W, qz = -H / 2 + R() * H, s = 0.02 + R() * 0.08;
        x.fillStyle = R() < 0.5 ? 'rgba(40,70,52,0.05)' : 'rgba(0,0,0,0.09)';
        x.fillRect(qx, qz, s, s);
      }
      // buried plane outlines ghosting through
      x.strokeStyle = 'rgba(60,110,84,0.1)'; x.lineWidth = 0.03;
      x.strokeRect(-W / 2 + 0.45, -H / 2 + 0.45, W - 0.9, H - 0.9);
    }
    // woven glass under the mask (faint in colour, a real texture in the coat)
    if (ALB || HGT) {
      x.fillStyle = ALB ? 'rgba(60,100,78,0.03)' : 'rgba(255,255,255,0.012)';
      for (var gx = -W / 2; gx < W / 2; gx += 0.09) x.fillRect(gx, -H / 2, 0.035, H);
      for (var gz = -H / 2; gz < H / 2; gz += 0.09) x.fillRect(-W / 2, gz, W, 0.035);
    }
    // copper traces under the mask
    var TR = ALB ? '#1d3a28' : ORM ? 'rgb(255,112,0)' : 'rgb(200,200,200)';
    x.lineCap = 'round'; x.lineJoin = 'round';
    traces.forEach(function (t) {
      x.strokeStyle = TR; x.lineWidth = t.w; x.beginPath();
      t.pts.forEach(function (p, j) { if (j) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.stroke();
      if (ALB) { x.strokeStyle = 'rgba(70,118,86,0.22)'; x.lineWidth = t.w * 0.4; x.stroke(); }
    });
    // ENIG gold where the mask is open: trace-end lands, cap pads, edge fingers, fiducials
    var GOLD = ALB ? '#e6c27a' : ORM ? 'rgb(0,56,255)' : 'rgb(70,70,70)';
    function openPad(fn) {
      if (HGT) {
        // mask opening: a sunken window, the pad's own surface a little higher than the window floor
        x.fillStyle = 'rgb(40,40,40)'; fn(1.25); x.fillStyle = GOLD; fn(1);
      } else { x.fillStyle = GOLD; fn(1); }
    }
    traces.forEach(function (t) {
      var e = t.pts[t.pts.length - 1];
      openPad(function (k) { x.beginPath(); x.arc(e[0], e[1], t.w * 1.7 * k, 0, Math.PI * 2); x.fill(); });
    });
    for (var fx = -W / 2 + 0.5; fx < W / 2 - 0.4; fx += 0.2) {
      (function (fx) { openPad(function (k) { x.fillRect(fx - 0.005 * k, -H / 2 + 0.08, 0.1 * k, 0.18); x.fillRect(fx - 0.005 * k, H / 2 - 0.26, 0.1 * k, 0.18); }); })(fx);
    }
    for (var fz = -H / 2 + 0.5; fz < H / 2 - 0.4; fz += 0.2) {
      (function (fz) { openPad(function (k) { x.fillRect(-W / 2 + 0.08, fz - 0.005 * k, 0.18, 0.1 * k); x.fillRect(W / 2 - 0.26, fz - 0.005 * k, 0.18, 0.1 * k); }); })(fz);
    }
    // tented via fields: a raised ring with a dimple, same mask colour, a hint lighter
    function vias(x0, z0, cols, rows, p) {
      for (var a = 0; a < cols; a++) for (var b = 0; b < rows; b++) {
        if (R() < 0.2) continue;
        var cx = x0 + a * p, cz = z0 + b * p;
        if (HGT) {
          x.fillStyle = 'rgb(190,190,190)'; x.beginPath(); x.arc(cx, cz, p * 0.3, 0, Math.PI * 2); x.fill();
          x.fillStyle = 'rgb(80,80,80)'; x.beginPath(); x.arc(cx, cz, p * 0.13, 0, Math.PI * 2); x.fill();
        } else if (ALB) {
          x.strokeStyle = 'rgba(62,104,78,0.55)'; x.lineWidth = 0.014; x.beginPath(); x.arc(cx, cz, p * 0.22, 0, Math.PI * 2); x.stroke();
        }
      }
    }
    vias(-5.3, -3.9, 10, 6, 0.13); vias(-5.3, 3.1, 10, 6, 0.13); vias(4.1, -3.9, 9, 5, 0.13); vias(4.1, 3.3, 9, 5, 0.13);
    vias(1.35, -0.55, 6, 9, 0.13);
    // component pads
    capList(DIE, MEM).forEach(function (c) {
      openPad(function (k) {
        if (c.rot) { x.fillRect(c.x - c.w * 0.32 * k, c.z - c.l * 0.62, c.w * 0.64 * k, c.l * 0.3); x.fillRect(c.x - c.w * 0.32 * k, c.z + c.l * 0.32, c.w * 0.64 * k, c.l * 0.3); }
        else { x.fillRect(c.x - c.l * 0.62, c.z - c.w * 0.32 * k, c.l * 0.3, c.w * 0.64 * k); x.fillRect(c.x + c.l * 0.32, c.z - c.w * 0.32 * k, c.l * 0.3, c.w * 0.64 * k); }
      });
    });
    // die C4 landing pads and memory BGA lands (hidden until the parts lift)
    (function () {
      var nx = 30, nz = 24;
      openPad(function (k) {
        for (var a = 0; a < nx; a++) for (var b = 0; b < nz; b++) {
          x.beginPath(); x.arc(DIE.x - DIE.w / 2 + 0.2 + a * (DIE.w - 0.4) / (nx - 1), -DIE.d / 2 + 0.2 + b * (DIE.d - 0.4) / (nz - 1), 0.05 * k, 0, Math.PI * 2); x.fill();
        }
      });
      [-1, 1].forEach(function (s) {
        openPad(function (k) {
          for (var a = 0; a < 12; a++) for (var b = 0; b < 9; b++) {
            x.beginPath(); x.arc(MEM.x - MEM.w / 2 + 0.2 + a * (MEM.w - 0.4) / 11, s * MEM.z - MEM.d / 2 + 0.2 + b * (MEM.d - 0.4) / 8, 0.055 * k, 0, Math.PI * 2); x.fill();
          }
        });
      });
    })();
    // fiducials: gold dot in a clear ring
    [[-5.55, -4.05], [5.55, 4.05], [5.55, -4.05]].forEach(function (f) {
      if (HGT) { x.fillStyle = 'rgb(40,40,40)'; x.beginPath(); x.arc(f[0], f[1], 0.17, 0, Math.PI * 2); x.fill(); }
      else if (ALB) { x.fillStyle = '#18261d'; x.beginPath(); x.arc(f[0], f[1], 0.17, 0, Math.PI * 2); x.fill(); }
      else { x.fillStyle = 'rgb(0,90,0)'; x.beginPath(); x.arc(f[0], f[1], 0.17, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = GOLD; x.beginPath(); x.arc(f[0], f[1], 0.08, 0, Math.PI * 2); x.fill();
    });
    // silkscreen: matte epoxy ink printed on the mask (no coat, rough)
    var SILK = ALB ? 'rgba(214,220,210,0.55)' : ORM ? 'rgb(0,200,0)' : 'rgb(150,150,150)';
    x.strokeStyle = SILK; x.lineWidth = 0.018;
    x.strokeRect(DIE.x - DIE.w / 2 - 0.12, -DIE.d / 2 - 0.12, DIE.w + 0.24, DIE.d + 0.24);
    [-1, 1].forEach(function (s) { x.strokeRect(MEM.x - MEM.w / 2 - 0.08, s * MEM.z - MEM.d / 2 - 0.08, MEM.w + 0.16, MEM.d + 0.16); });
    x.fillStyle = SILK;
    x.beginPath(); x.moveTo(-5.85, -4.35); x.lineTo(-5.45, -4.35); x.lineTo(-5.85, -3.95); x.closePath(); x.fill();
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
    var THREE = G.THREE;
    function ov(v) { return v >= 0 ? v : v * 0.12; }
    // layers
    G.tim.position.y = G.timBaseY + 3.2 * ov(LY.tim);
    G.dieGroup.position.y = 2.2 * ov(LY.die);
    G.mems.forEach(function (g) { g.position.y = G.SUB.t + 1.2 * ov(LY.mem); g.position.x = G.MEM.x + 0.8 * ov(LY.mem); });
    G.bgaGroup.position.y = -1.4 * ov(LY.bga);
    // the camera passes through the thermal interface on its way into the die
    G.tim.material.opacity = 0.3 * (1 + 0.6 * clamp(LY.tim, 0, 1)) * (1 - sstep(0.25, 0.85, CAM.m));
    G.tim.visible = G.tim.material.opacity > 0.002;
    // contact shadows fade as the parts lift off the mask
    G.shDie.material.opacity = 0.85 * (1 - sstep(0.02, 0.45, LY.die));
    G.shDie.visible = G.shDie.material.opacity > 0.004;
    G.shMem.forEach(function (m) { m.material.opacity = 0.8 * (1 - sstep(0.02, 0.45, LY.mem)); m.visible = m.material.opacity > 0.004; });
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
    // pointer orbit, fading out as the camera settles on the die. No idle breathing: a still camera
    // lets the pipeline converge (32-sample AA + AO) instead of re-rendering a drifting frame forever.
    var free = (1 - m) * (RM ? 0 : 1);
    G.orbit.tx += (ptr.tx - G.orbit.tx) * Math.min(1, dt * 3.5);
    G.orbit.ty += (ptr.ty - G.orbit.ty) * Math.min(1, dt * 3.5);
    if (Math.abs(ptr.tx - G.orbit.tx) < 2e-4) G.orbit.tx = ptr.tx;
    if (Math.abs(ptr.ty - G.orbit.ty) < 2e-4) G.orbit.ty = ptr.ty;
    var th = c.th + (G.orbit.tx * 0.07) * free;
    var phi = Math.max(0.0004, c.phi + (G.orbit.ty * 0.045) * free * r);
    sph(c.r, phi, th, c.tx, c.ty, c.tz, G.v);
    G.camera.position.copy(G.v);
    G.tgt.set(c.tx, c.ty, c.tz);
    G.camera.lookAt(G.tgt);
    // the studio turns with the camera (+10 deg), so the softboxes always land where they were designed
    if (G.studio) {
      var yaw = th + 10 * Math.PI / 180;
      if (G.studio.getRotation() !== yaw) G.studio.setRotation(yaw);
    }
    // stream
    var nVis = Math.round(G.NPTS * clamp(S.stream, 0, 1));
    G.points.visible = nVis > 0;
    if (G.bloomAnchor) G.bloomAnchor.visible = nVis > 0;
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
    if (G.pipe) {
      // the stream particles and flash lines animate without moving any transform: tell the pipeline
      G.pipe.setMoving(G.points.visible || G.flashing);
      if (G.flashing) G.pipe.invalidate();
      G.pipeMore = G.pipe.render(dt);
    } else G.renderer.render(G.scene, G.camera);
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
      if (G.pipe) G.pipe.setSize(cw, ch, glDpr);
      else { G.renderer.setPixelRatio(glDpr); G.renderer.setSize(cw, ch, false); }
      G.camera.aspect = cw / ch;
      G.camera.setViewOffset(cw, ch, -FR.offX, -FR.offY, cw, ch);
      G.camera.updateProjectionMatrix();
    }
    markDirty();
  }

  // Adaptive DPR, last resort only: one-off hitches (tile painting, shader compiles) must not cost the
  // whole section its Retina resolution, and a display that runs at 30 Hz is not "slow". A step needs
  // most of 90 rendered frames to miss the learned display interval by a clear margin.
  function perfSample(ms) {
    if (ms > 200) return;
    perf.ema = perf.ema ? perf.ema * 0.9 + ms * 0.1 : ms;
    perf.n++;
    if (perf.n > 20) perf.base = Math.min(perf.base || 1e9, perf.ema);
    if (ms > Math.max(21, (perf.base || 16.7) * 1.35)) perf.slow = (perf.slow || 0) + 1;
    if (perf.n < 90) return;
    var frac = (perf.slow || 0) / perf.n; perf.n = 0; perf.slow = 0;
    if (DBG) DBG.samples.push({ frac: +frac.toFixed(2), base: +(perf.base || 0).toFixed(1), ema: +perf.ema.toFixed(1), view: +S.view.toFixed(2), p: tl ? +tl.progress().toFixed(3) : -1 });
    if (frac > 0.6 && perf.steps < 3 && dieDpr > 1) {
      if (DBG) DBG.steps.push({ frac: frac, base: perf.base, view: S.view, p: tl ? tl.progress() : -1 });
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
      var orbiting = Math.abs(ptr.tx - G.orbit.tx) > 1e-5 || Math.abs(ptr.ty - G.orbit.ty) > 1e-5;
      var anim = S.stream > 0.001 || (S.explode > 0 && S.explode < 1) || labelsAnimating() || orbiting;
      var flashing = false; Object.keys(G.flashT).forEach(function (k) { if (t - G.flashT[k] < 170) flashing = true; });
      G.flashing = flashing;
      if (dirty || anim || flashing || G.pipeMore) { var g0 = now(); glRender(t, dt); rendered = true; if (DBG) DBG.gl = DBG.gl * 0.9 + (now() - g0) * 0.1; }
    }
    // 2D
    if (dctx) {
      var dieAnim = genPending || nePulses.length > 0 || hoverAmt % 1 !== 0 || (!RM && (
        (Math.abs(S.view - 1) < 0.72) || (S.view > 1.5 && S.view < 4.5) || ptr.inside));
      if (dieOp <= 0.001) dieAnim = false;
      if (dirty || dieAnim) { var d0 = now(); drawDie2D(t, dieOp); rendered = true; if (DBG) { var dm = now() - d0; DBG.die = DBG.die * 0.9 + dm * 0.1; DBG.dieMax = Math.max(DBG.dieMax, dm); } }
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
    idle(function () { prewarm(3); prewarm(4); });
    markDirty();
    onProgress();
  }

  function idle(fn) { if (win.requestIdleCallback) win.requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(fn, 1500); }
  function prewarm(stopIdx) {
    var st = STOPS[stopIdx], k = baseFit() * st.s, need = k * dieDpr;
    if (need <= baseScale * 1.12) return;
    var maxL = maxLevel(), level = 8;
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
