/* RenderKit — materials.js  (material + texture owner)
 * ---------------------------------------------------------------------------------------------------------
 * Classic script (no import/export, works from file://). Attaches RenderKit.textures and RenderKit.materials.
 * THREE is read lazily at CALL time (opts.THREE || window.THREE), never at script-eval time, because three
 * arrives later through the importmap shim's 'three:ready' event.
 *
 * Tuned under the procedural strip-light studio (RenderKit.createStudio) with Neutral/AgX tone mapping,
 * shot at DPR 2 in lookdev-lab/materials.html. Values are "how the real thing photographs", not raw lab
 * measurements; every non-obvious number has its reason next to it. See materials-notes.md for what failed.
 *
 * TEXTURES  RenderKit.textures.<fn>(opts) -> THREE.Texture
 *   All data maps are NoColorSpace, RepeatWrapping, trilinear + anisotropy 16 (three clamps that to the GPU
 *   max at upload, i.e. "renderer max"), mipmapped, tileable. The CALLER sets .repeat. Companion maps that
 *   belong to the same surface hang off tex.rk (NOT tex.userData: three JSON-clones userData on .clone(),
 *   which would serialise the pixel data):
 *     beadBlast(o)    -> tangent-space normal (grain)       .rk = { roughnessMap, roughnessMean }
 *     brushed(o)      -> anisotropyMap (RG dir, B strength) .rk = { roughnessMap, roughnessMean, normalMap }
 *     perforation(o)  -> ORM (R=AO, G=rough x, B=metal x) or with o.output:'alpha' an alphaMap (G = hole)
 *                                                           .rk = { normalMap, alphaMap(when orm), pitch }
 *     legendAtlas(chars, o) -> 2048 mask (white glyph = legend/emissive). userData.cells{label:[u0,v0,u1,v1]}
 *     weave(o)        -> normal                             .rk = { ormMap, alphaMap }
 *     knurl(o)        -> normal                             .rk = { ormMap }
 *     microScratch(o) -> roughness factor (G), mean .rk.mean (use as clearcoatRoughnessMap / roughnessMap)
 *
 * MATERIALS RenderKit.materials.<fn>(opts) -> THREE.MeshPhysicalMaterial (tuned, documented inline)
 *   anodizedAluminum diamondCutEdge glossyPolycarbonate softTouchPlastic glassCover glossyBlackGlass keycap
 *   rubber silicone meshGrille goldPad pcbSolderMask siliconDie emissiveScreen  (+ trackpadGlass, led extras)
 *   Common opts: THREE, repeat (number | [x,y]) for the surface detail maps, envMapIntensity.
 *   Live-tweakable uniforms of shader-extended materials live on material.rk.uniforms.
 *   Do not material.clone() the extended ones (keycap, polycarbonate, silicone): three does not copy
 *   onBeforeCompile; call the factory again instead.
 * ------------------------------------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  var RK = root.RenderKit = root.RenderKit || {};
  var TX = RK.textures = RK.textures || {};
  var MT = RK.materials = RK.materials || {};

  /* ---------------------------------------------------------------- helpers */
  function T3(o) {
    var T = (o && o.THREE) || root.THREE;
    if (!T) throw new Error('RenderKit.materials: THREE is not loaded yet (wait for "three:ready")');
    return T;
  }
  function def(v, d) { return v === undefined || v === null ? d : v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function aniso(o) {
    if (o && o.renderer && o.renderer.capabilities) return o.renderer.capabilities.getMaxAnisotropy();
    return 16;                                   // three clamps to capabilities.getMaxAnisotropy() on upload
  }
  // mulberry32: deterministic textures, so a reload does not change the look
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function white(w, h, r) { var f = new Float32Array(w * h); for (var i = 0; i < f.length; i++) f[i] = r() - 0.5; return f; }
  // separable blur with wrap-around (tileable). sigma <= 4: true gaussian; larger: 3 box passes (~gaussian)
  function blurAxis(src, w, h, sigma, axis) {
    if (!(sigma > 0)) return src;
    var out = new Float32Array(w * h), n = axis ? h : w, m = axis ? w : h, line = new Float32Array(n), res = new Float32Array(n);
    var i, j, k;
    var get = axis ? function (a, b) { return src[a * w + b]; } : function (a, b) { return src[b * w + a]; };
    var put = axis ? function (a, b, v) { out[a * w + b] = v; } : function (a, b, v) { out[b * w + a] = v; };
    if (sigma <= 4) {
      var R = Math.ceil(sigma * 3), ker = [], s = 0;
      for (k = -R; k <= R; k++) { var g = Math.exp(-k * k / (2 * sigma * sigma)); ker.push(g); s += g; }
      for (k = 0; k < ker.length; k++) ker[k] /= s;
      for (j = 0; j < m; j++) {
        for (i = 0; i < n; i++) line[i] = get(i, j);
        for (i = 0; i < n; i++) { var acc = 0; for (k = -R; k <= R; k++) acc += line[((i + k) % n + n) % n] * ker[k + R]; put(i, j, acc); }
      }
      return out;
    }
    var rad = Math.max(1, Math.round(Math.sqrt(12 * sigma * sigma / 3 + 1) / 2 - 0.5)), win = 2 * rad + 1;
    for (j = 0; j < m; j++) {
      for (i = 0; i < n; i++) line[i] = get(i, j);
      for (var pass = 0; pass < 3; pass++) {
        var a2 = 0; for (k = -rad; k <= rad; k++) a2 += line[((k % n) + n) % n];
        for (i = 0; i < n; i++) { res[i] = a2 / win; a2 += line[(i + rad + 1) % n] - line[((i - rad) % n + n) % n]; }
        line.set(res);
      }
      for (i = 0; i < n; i++) put(i, j, line[i]);
    }
    return out;
  }
  function blur(f, w, h, sx, sy) { return blurAxis(blurAxis(f, w, h, sx, 0), w, h, def(sy, sx), 1); }
  // tileable value noise, `cells` lattice cells across the tile
  function valueNoise(w, h, cells, r) {
    var g = new Float32Array(cells * cells), out = new Float32Array(w * h), x, y;
    for (var i = 0; i < g.length; i++) g[i] = r();
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var gx = x / w * cells, gy = y / h * cells, x0 = Math.floor(gx), y0 = Math.floor(gy);
      var fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      out[y * w + x] = (g[y0 * cells + x0] * (1 - fx) + g[y0 * cells + x1] * fx) * (1 - fy) + (g[y1 * cells + x0] * (1 - fx) + g[y1 * cells + x1] * fx) * fy;
    }
    return out;
  }
  function standardize(f) {
    var n = f.length, m = 0, v = 0, i;
    for (i = 0; i < n; i++) m += f[i]; m /= n;
    for (i = 0; i < n; i++) v += (f[i] - m) * (f[i] - m); v = Math.sqrt(v / n) || 1;
    for (i = 0; i < n; i++) f[i] = (f[i] - m) / v;
    return f;
  }
  // height -> tangent-space normal (+X = +u, +Y = +v: DataTexture row 0 is v = 0, flipY false)
  function heightToNormal(hf, w, h, strength) {
    var out = new Uint8Array(w * h * 4);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = (hf[y * w + (x + 1) % w] - hf[y * w + (x - 1 + w) % w]) * 0.5 * strength;
      var dy = (hf[((y + 1) % h) * w + x] - hf[((y - 1 + h) % h) * w + x]) * 0.5 * strength;
      var il = 1 / Math.sqrt(dx * dx + dy * dy + 1), o = (y * w + x) * 4;
      out[o] = Math.round((-dx * il * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((-dy * il * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((il * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
    return out;
  }
  function packRGBA(w, h, fr, fg, fb, fa) {           // each f*: function(i) -> 0..1
    var out = new Uint8Array(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      out[i * 4] = Math.round(clamp(fr(i), 0, 1) * 255);
      out[i * 4 + 1] = Math.round(clamp(fg(i), 0, 1) * 255);
      out[i * 4 + 2] = Math.round(clamp(fb(i), 0, 1) * 255);
      out[i * 4 + 3] = fa ? Math.round(clamp(fa(i), 0, 1) * 255) : 255;
    }
    return out;
  }
  function dataTex(T, data, w, h, o, name) {
    var t = new T.DataTexture(data, w, h, T.RGBAFormat, T.UnsignedByteType);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = aniso(o); t.colorSpace = T.NoColorSpace; t.name = name || '';
    t.needsUpdate = true;
    return t;
  }
  function canvasEl(w, h) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* ---------------------------------------------------------------- TEXTURES */

  /* beadBlast: bead-blasted anodised aluminium. The beads leave overlapping micro-craters a few texels wide
   * (gaussian-blurred white noise, sigma ~0.9 texel); roughness varies +-4% at ~2-texel scale (o.mottle > 0
   * blends in a low-frequency cloudiness; off by default because inside a tiled map it repeats visibly). The normal map
   * is deliberately strong; materials scale it with normalScale (0.1..0.35) so one texture serves all finishes.
   * Mipmaps average the grain toward flat at distance, so it never shimmers; it resolves only when a texel
   * covers >= 1 px (close-ups on Retina), which is exactly how the real finish reads in photographs. */
  TX.beadBlast = function (o) {
    o = o || {};
    var T = T3(o), S = def(o.size, 512), r = rng(def(o.seed, 1337));
    var grain = standardize(blur(white(S, S, r), S, S, def(o.grain, 0.9)));
    var coarse = standardize(blur(white(S, S, r), S, S, 2.2));
    var mott = standardize(valueNoise(S, S, def(o.mottleCells, 8), r));
    var nrm = heightToNormal(grain, S, S, def(o.strength, 0.9));
    var tex = dataTex(T, nrm, S, S, o, 'rk.beadBlast.normal');
    // mottle defaults to 0: any low-frequency variation inside a TILED map shows up as a visible repeat grid
    // across a laptop-sized panel (seen in the lab on the chamfer slab); keep only texel-scale variation
    var mean = def(o.roughMean, 0.78), amp = def(o.roughAmp, 0.04), mw = def(o.mottle, 0);
    var rv = function (i) { return mean + amp * ((1 - mw) * coarse[i] + mw * mott[i]); };
    tex.rk = { roughnessMap: dataTex(T, packRGBA(S, S, rv, rv, rv), S, S, o, 'rk.beadBlast.roughness'), roughnessMean: mean };
    return tex;
  };

  /* brushed: anisotropic brushing. Linear (streaks along +u) or radial (o.radial: concentric turning marks
   * around uv 0.5,0.5 — cylinder caps, speaker caps, crowns). Returns the anisotropyMap in three's encoding:
   * RG = direction in tangent space mapped from [-1,1], B = strength (multiplied by material.anisotropy).
   * Streaks = white noise stretched along the brush (sigma o.length texels) — two octaves so it is not a
   * barcode. The same streak field modulates roughness (+-o.roughAmp) and gives a faint cross-streak normal. */
  TX.brushed = function (o) {
    o = o || {};
    var T = T3(o), S = def(o.size, 1024), r = rng(def(o.seed, 4242));
    var s1 = standardize(blur(white(S, S, r), S, S, def(o.length, 60), def(o.width, 0.7)));
    var s2 = standardize(blur(white(S, S, r), S, S, def(o.length, 60) * 0.2, 0.5));
    var lin = new Float32Array(S * S), i, x, y;
    for (i = 0; i < lin.length; i++) lin[i] = 0.75 * s1[i] + 0.45 * s2[i];
    var field = lin, dirX = null, dirY = null;
    if (o.radial) {
      field = new Float32Array(S * S); dirX = new Float32Array(S * S); dirY = new Float32Array(S * S);
      var c = S / 2;
      for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
        var dx = x + 0.5 - c, dy = y + 0.5 - c, rad = Math.sqrt(dx * dx + dy * dy) || 1e-3;
        var ang = Math.atan2(dy, dx), u = ((ang / (Math.PI * 2) + 1) % 1) * S, v = Math.min(S - 1, rad * 1.0);
        var ui = Math.floor(u) % S, vi = Math.floor(v) % S, fu = u - Math.floor(u);
        field[y * S + x] = lin[vi * S + ui] * (1 - fu) + lin[vi * S + (ui + 1) % S] * fu;
        dirX[y * S + x] = -dy / rad; dirY[y * S + x] = dx / rad;      // tangent to the circle
      }
    }
    var str = def(o.strength, 0.85), sv = def(o.strengthVar, 0.15);
    var tex = dataTex(T, packRGBA(S, S,
      function (k) { return (dirX ? dirX[k] : 1) * 0.5 + 0.5; },
      function (k) { return (dirY ? dirY[k] : 0) * 0.5 + 0.5; },
      function (k) { return str + sv * field[k] * 0.5; }), S, S, o, 'rk.brushed.anisotropy');
    var mean = def(o.roughMean, 0.7), amp = def(o.roughAmp, 0.06);
    var rv = function (k) { return mean + amp * field[k]; };
    tex.rk = {
      roughnessMap: dataTex(T, packRGBA(S, S, rv, rv, rv), S, S, o, 'rk.brushed.roughness'), roughnessMean: mean,
      normalMap: dataTex(T, heightToNormal(field, S, S, def(o.normalStrength, 0.25)), S, S, o, 'rk.brushed.normal')
    };
    return tex;
  };

  /* perforation: speaker / vent hole field. Staggered (checkerboard-offset) round holes, `pitch` texels apart
   * on the square lattice (holes also at the half-offset sites), radius o.radius * pitch, with a small
   * countersink chamfer (o.bevel * pitch) so the rim catches a highlight like a drilled hole does.
   * Default output 'orm' (use as aoMap + roughnessMap + metalnessMap on an opaque surface: holes go black
   * because aoMap also occludes env SPECULAR in three's physical model). 'alpha' output is a hole-coverage
   * mask (G) for an overlay plane (black, transparent). tex.rk.colorMap is the matching albedo / F0 mask
   * (holes #050505): use it as .map so the minified grille keeps its hole coverage (AO alone read 0.96x the
   * deck on the MacBook, the eye expects ~0.7x). All are anti-aliased over one texel and mip down to the
   * correct average, so a grille never moirés when small. */
  TX.perforation = function (o) {
    o = o || {};
    var T = T3(o), P = def(o.pitch, 32), S = def(o.size, P * 16);
    S = Math.round(S / P) * P;
    var R = def(o.radius, 0.2) * P, B = def(o.bevel, 0.07) * P, stagger = def(o.stagger, true);
    var solid = new Float32Array(S * S), hgt = new Float32Array(S * S), bev = new Float32Array(S * S);
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var px = x + 0.5, py = y + 0.5;
      var ax = (Math.floor(px / P) + 0.5) * P, ay = (Math.floor(py / P) + 0.5) * P;
      var d = Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
      if (stagger) {
        var bx = Math.round(px / P) * P, by = Math.round(py / P) * P;
        d = Math.min(d, Math.sqrt((px - bx) * (px - bx) + (py - by) * (py - by)));
      }
      var k = y * S + x;
      solid[k] = sstep(R - 0.6, R + 0.6, d);
      bev[k] = d >= R && d < R + B ? 1 - (d - R) / B : 0;
      hgt[k] = d < R ? -1.6 : d < R + B ? -(R + B - d) / B * 0.8 : 0;
    }
    var nrm = dataTex(T, heightToNormal(blur(hgt, S, S, 0.6), S, S, def(o.strength, 2.2)), S, S, o, 'rk.perforation.normal');
    var holeAO = def(o.holeAO, 0.04);
    var orm = dataTex(T, packRGBA(S, S,
      function (i) { return holeAO + (1 - holeAO) * solid[i] * (1 - 0.25 * bev[i]); },   // R: AO
      function (i) { return solid[i] > 0.5 ? 1 - 0.45 * bev[i] : 1; },                  // G: roughness x (bevel shinier)
      function (i) { return solid[i]; }), S, S, o, 'rk.perforation.orm');             // B: metalness x
    var alpha = dataTex(T, packRGBA(S, S,
      function (i) { return 1 - solid[i]; }, function (i) { return 1 - solid[i]; }, function (i) { return 1 - solid[i]; }), S, S, o, 'rk.perforation.alpha');
    // colour (F0 for metal) mask: the holes are black (#050505) and the countersink a little darker. AO alone
    // only occludes the INDIRECT light and its effect fades out of the mip chain, so a minified grille read
    // as the bare deck tone (0.96x); multiplying F0 keeps the hole coverage in every mip (~0.7x the deck).
    var holeC = def(o.holeColor, 0.02);
    var colorM = dataTex(T, packRGBA(S, S,
      function (i) { var v = holeC + (1 - holeC) * solid[i] * (1 - 0.35 * bev[i]); return v; },
      function (i) { return holeC + (1 - holeC) * solid[i] * (1 - 0.35 * bev[i]); },
      function (i) { return holeC + (1 - holeC) * solid[i] * (1 - 0.35 * bev[i]); }), S, S, o, 'rk.perforation.color');
    var out = o.output === 'alpha' ? alpha : orm;
    out.rk = { normalMap: nrm, alphaMap: alpha, ormMap: orm, colorMap: colorM, pitch: P, size: S };
    return out;
  };

  /* legendAtlas: crisp keycap legends. 2048^2 canvas, one square cell per entry, white glyph on black, so the
   * same texture is the albedo mix mask AND the backlight emissive mask. Entries: 'A' | 'esc' |
   * { text, sub, align:'center'|'left'|'right', size, y } | function(ctx, x, y, w, h). Glyphs are rendered
   * big (cell 128..256 px) and minified with trilinear + 16x anisotropic filtering, which keeps them crisp
   * at grazing keyboard angles. userData.cells[label] = [u0, v0, u1, v1] (flipY-aware), userData.rects[i]. */
  TX.legendAtlas = function (chars, o) {
    o = o || {};
    var T = T3(o), S = def(o.size, 2048);
    var list = typeof chars === 'string' ? Array.from(chars) : (chars || []).slice();
    var cols = def(o.cols, Math.max(1, Math.ceil(Math.sqrt(list.length)))), cw = S / cols, ch = cw;
    var c = canvasEl(S, S), x = c.getContext('2d');
    var family = def(o.family, '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Helvetica Neue", Helvetica, Arial, sans-serif');
    var weight = def(o.weight, 500);
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.textBaseline = 'middle';
    var cells = {}, rects = [];
    list.forEach(function (e, i) {
      var cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch, key;
      x.save(); x.beginPath(); x.rect(cx, cy, cw, ch); x.clip();
      if (typeof e === 'function') { e(x, cx, cy, cw, ch); key = 'fn' + i; }
      else {
        var sp = typeof e === 'string' ? { text: e } : e, txt = String(sp.text || ''), single = Array.from(txt).length === 1;
        var px = Math.round(ch * def(sp.size, single ? (sp.sub ? 0.26 : 0.36) : 0.2));
        x.font = weight + ' ' + px + 'px ' + family;
        var mw = x.measureText(txt).width, maxW = cw * 0.8;
        if (mw > maxW) { px = Math.floor(px * maxW / mw); x.font = weight + ' ' + px + 'px ' + family; }
        var al = def(sp.align, 'center'), pad = cw * 0.14;
        x.textAlign = al;
        var tx = al === 'left' ? cx + pad : al === 'right' ? cx + cw - pad : cx + cw / 2;
        var ty = cy + ch * def(sp.y, sp.sub ? 0.36 : 0.5);
        x.fillText(txt, tx, ty);
        if (sp.sub) {
          var spx = Math.round(ch * def(sp.subSize, 0.15));
          x.font = weight + ' ' + spx + 'px ' + family;
          var sw = x.measureText(String(sp.sub)).width;
          if (sw > maxW) { spx = Math.floor(spx * maxW / sw); x.font = weight + ' ' + spx + 'px ' + family; }
          x.fillText(String(sp.sub), tx, cy + ch * 0.7);
        }
        key = def(sp.key, txt);
      }
      x.restore();
      var rect = [cx / S, 1 - (cy + ch) / S, (cx + cw) / S, 1 - cy / S];
      rects.push(rect); cells[key] = rect;
    });
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.NoColorSpace; t.anisotropy = aniso(o);
    t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.generateMipmaps = true;
    t.name = 'rk.legendAtlas';
    t.userData.cells = cells; t.userData.rects = rects; t.userData.cols = cols;
    return t;
  };

  /* weave: plain over-under weave (acoustic mesh, fabric, the fibreglass that ghosts through solder mask).
   * Threads have a round cross-section and undulate over/under at each crossing; the gaps become AO (and
   * alpha for see-through meshes). o.threads per tile, o.gap = open fraction of each cell. */
  TX.weave = function (o) {
    o = o || {};
    var T = T3(o), S = def(o.size, 512), n = def(o.threads, 32), c = S / n, gap = def(o.gap, 0.2), hw = 0.5 - gap / 2;
    var hgt = new Float32Array(S * S), open = new Float32Array(S * S), r = rng(def(o.seed, 99));
    var fib = standardize(blur(white(S, S, r), S, S, 0.6));
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var u = (x + 0.5) / c, v = (y + 0.5) / c, ix = Math.floor(u), iy = Math.floor(v), fu = u - ix, fv = v - iy;
      var sgn = ((ix + iy) & 1) ? -1 : 1;
      var pw = 1 - Math.pow((fv - 0.5) / hw, 2), pv = 1 - Math.pow((fu - 0.5) / hw, 2);
      var hWarp = pw > 0 ? Math.sqrt(pw) * 0.5 + 0.28 * sgn * Math.cos(Math.PI * (fu - 0.5)) : -9;
      var hWeft = pv > 0 ? Math.sqrt(pv) * 0.5 - 0.28 * sgn * Math.cos(Math.PI * (fv - 0.5)) : -9;
      var hh = Math.max(hWarp, hWeft), k = y * S + x;
      if (hh < -1) { hgt[k] = -0.6; open[k] = 1; } else { hgt[k] = hh + 0.03 * fib[k]; open[k] = 0; }
    }
    var hs = blur(hgt, S, S, 0.7);
    var tex = dataTex(T, heightToNormal(hs, S, S, def(o.strength, 3.0)), S, S, o, 'rk.weave.normal');
    var orm = dataTex(T, packRGBA(S, S,
      function (i) { return open[i] ? 0.12 : 0.5 + 0.5 * clamp(hs[i] + 0.3, 0, 1); },
      function (i) { return 1; }, function (i) { return 1; }), S, S, o, 'rk.weave.orm');
    var alpha = dataTex(T, packRGBA(S, S, function (i) { return 1 - open[i]; }, function (i) { return 1 - blur1(open, S, i); }, function (i) { return 1 - open[i]; }), S, S, o, 'rk.weave.alpha');
    tex.rk = { ormMap: orm, alphaMap: alpha, threads: n };
    return tex;
  };
  function blur1(f, S, i) {                            // 3x3 average for AA'd alpha edges
    var x = i % S, y = (i - x) / S, s = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) s += f[((y + dy + S) % S) * S + (x + dx + S) % S];
    return s / 9;
  }

  /* knurl: 'diamond' (crossed V grooves -> pyramids, e.g. a crown grip) or 'straight' (parallel ridges along v,
   * e.g. Digital-Crown / dial edge). o.pitch = ridges per tile. Height is a V profile with slightly rounded
   * crests (real knurls are rolled, not cut) so the specular breaks into a fine glittering lattice. */
  TX.knurl = function (o) {
    o = o || {};
    var T = T3(o), S = def(o.size, 512), n = def(o.pitch, 24), diamond = def(o.pattern, 'diamond') === 'diamond';
    var hgt = new Float32Array(S * S);
    function ridge(t) { var f = t - Math.floor(t); var v = 1 - Math.abs(2 * f - 1); return Math.pow(v, 0.8); }
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var u = (x + 0.5) / S * n, v = (y + 0.5) / S * n;
      hgt[y * S + x] = diamond ? Math.min(ridge(u + v), ridge(u - v)) : ridge(u);
    }
    var hs = blur(hgt, S, S, 0.6);
    var tex = dataTex(T, heightToNormal(hs, S, S, def(o.strength, S / n * 0.9)), S, S, o, 'rk.knurl.normal');
    tex.rk = { ormMap: dataTex(T, packRGBA(S, S, function (i) { return 0.55 + 0.45 * hs[i]; }, function () { return 1; }, function () { return 1; }), S, S, o, 'rk.knurl.orm') };
    return tex;
  };

  /* microScratch: sparse hairline scratches + handling haze as a ROUGHNESS FACTOR map (G). Base value o.base
   * (default 0.5) so the material's roughness is divided by it (see .rk.mean); scratches are rougher lines.
   * Use very sparingly on hero products (apple.com renders are pristine): it earns its keep only inside a
   * moving highlight on glossy black / clearcoats, where perfectly uniform gloss reads as CG. */
  TX.microScratch = function (o) {
    o = o || {};
    var T = T3(o), S = def(o.size, 1024), r = rng(def(o.seed, 7)), base = def(o.base, 0.5), cnt = def(o.count, 260);
    var c = canvasEl(S, S), x = c.getContext('2d'), g = Math.round(base * 255);
    x.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; x.fillRect(0, 0, S, S);
    x.lineCap = 'round';
    for (var i = 0; i < cnt; i++) {
      var x0 = r() * S, y0 = r() * S, a = (r() < 0.6 ? 0.35 : r() * Math.PI) + (r() - 0.5) * 0.5;
      var len = S * (0.02 + 0.2 * r() * r()), bend = (r() - 0.5) * len * 0.15;
      var x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len, mx = (x0 + x1) / 2 - Math.sin(a) * bend, my = (y0 + y1) / 2 + Math.cos(a) * bend;
      x.lineWidth = 0.5 + r() * 0.9;
      x.strokeStyle = 'rgba(255,255,255,' + (0.1 + 0.3 * r()).toFixed(3) + ')';
      for (var oy = -S; oy <= S; oy += S) for (var ox = -S; ox <= S; ox += S) {
        if (Math.max(x0, x1) + ox < -4 || Math.min(x0, x1) + ox > S + 4 || Math.max(y0, y1) + oy < -4 || Math.min(y0, y1) + oy > S + 4) continue;
        x.beginPath(); x.moveTo(x0 + ox, y0 + oy); x.quadraticCurveTo(mx + ox, my + oy, x1 + ox, y1 + oy); x.stroke();
      }
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.NoColorSpace; t.anisotropy = aniso(o);
    t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.name = 'rk.microScratch';
    t.rk = { mean: base };
    return t;
  };

  /* ---------------------------------------------------------------- material helpers */
  var cache = {};
  function cached(key, fn) { return cache[key] || (cache[key] = fn()); }
  // per-material clone of a shared texture: shares the GPU upload (same Source) but owns its repeat
  function rep(tex, repeat, dflt) {
    var t = tex.clone(), rr = def(repeat, dflt);
    if (Array.isArray(rr)) t.repeat.set(rr[0], rr[1]); else t.repeat.set(rr, rr);
    t.wrapS = t.wrapT = tex.wrapS;
    return t;
  }
  function color(T, v) { return v && v.isColor ? v.clone() : new T.Color(v); }
  function phys(T, p, name, o) {
    if (o && o.envMapIntensity !== undefined) p.envMapIntensity = o.envMapIntensity;
    var m = new T.MeshPhysicalMaterial(p);
    m.name = 'rk.' + name; m.userData.rk = name;
    m.rk = { uniforms: {}, hooks: [] };
    return m;
  }
  // chain onBeforeCompile hooks (keycap legends + sss, or a caller's own hook added later via RenderKit.materials.extend)
  function extend(m, key, fn) {
    m.rk = m.rk || { uniforms: {}, hooks: [] };
    m.rk.hooks.push({ key: key, fn: fn });
    m.onBeforeCompile = function (sh, r) { for (var i = 0; i < m.rk.hooks.length; i++) m.rk.hooks[i].fn(sh, r); };
    m.customProgramCacheKey = function () { return 'rk:' + m.rk.hooks.map(function (h) { return h.key; }).join('+'); };
    m.needsUpdate = true;
    return m;
  }
  MT.extend = extend;

  /* Fake subsurface for IBL-lit white plastic / silicone (the studio has no punctual lights, so classic
   * wrap-lighting has nothing to act on). Two terms injected after lights_fragment_maps:
   *   wrap:     where a pixel's diffuse irradiance is BELOW the average of front (N) and back (-N) irradiance
   *             it is lifted toward it (light that entered elsewhere re-emerges): the terminator softens and the
   *             shadow side of a white case stays a luminous pale grey instead of going dead grey. Lit faces
   *             are never dimmed (the first version mixed both ways and greyed the lit front by ~10%).
   *   transmit: at grazing view (thin silhouette walls) back irradiance leaks through, tinted by sssColor —
   *             the soft glowing rim of an ear tip or the lip of a white case.
   * Costs one extra PMREM irradiance fetch; measured free on M5. Real `transmission` costs a full extra scene
   * pass (three renders a transmission buffer) and looked glassy, so it is only an opt-in on silicone. */
  var SSS_GLSL = [
    '#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )',
    '{',
    '  vec3 rkBack = getIBLIrradiance( -geometryNormal );',
    '  vec3 rkAvg = 0.5 * ( iblIrradiance + rkBack );',
    // lift ONLY where the pixel is darker than the local average (shadow side / terminator); a plain mix
    // toward the average also DIMMED the lit faces (lab: AirPods front 205 vs 228 without sss) = greyer white
    '  iblIrradiance += rkWrap * max( rkAvg - iblIrradiance, vec3( 0.0 ) ) * rkSSSColor;',
    '  float rkRim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.0 );',
    '  totalEmissiveRadiance += rkTransmit * rkRim * rkBack * rkSSSColor * diffuseColor.rgb * RECIPROCAL_PI;',
    '}',
    '#endif'].join('\n');
  function addSSS(T, m, o) {
    var U = { rkWrap: { value: def(o.wrap, 0.35) }, rkTransmit: { value: def(o.transmit, 0.2) }, rkSSSColor: { value: color(T, def(o.sssColor, '#fff6ee')) } };
    Object.assign(m.rk.uniforms, U);
    return extend(m, 'sss', function (sh) {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float rkWrap;\nuniform float rkTransmit;\nuniform vec3 rkSSSColor;')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + SSS_GLSL);
    });
  }

  function bbTex(T) { return cached('beadBlast', function () { return TX.beadBlast({ THREE: T }); }); }

  /* ---------------------------------------------------------------- MATERIALS */

  /* Anodised aluminium finishes. Metal (metalness 1) so the colour IS the F0 tint of the reflection.
   *   silver: raw Al F0 is ~0.91 linear; the anodic oxide + blast scatter pull the photographed tone down to a
   *     bright cool grey (#cfd1d4 ~ 0.62 linear). Roughness ~0.34 gives the soft, WIDE strip highlight Apple's
   *     silver shows (a narrow one reads as chrome, a wider one as grey plastic).
   *   space-black: dyed oxide absorbs most light; #333438 (~0.034 linear F0) with a faint cool bias. On its own
   *     that makes strip reflections too dim to read, so a clearcoat (0.5, rough 0.22) stands in for the
   *     sealed/anti-fingerprint top layer: its ~4% white dielectric reflection lays NEUTRAL soft strip shapes over
   *     the dark metal, the grey sheen space-black photographs with (0.35/0.3 left the strips invisible on a
   *     sphere; the coat also dims the base a little, hence the F0 nudge from #2c2d31).
   * Grain: beadBlast normal at normalScale 0.12-0.18 (only resolves in close-ups) + +-4% fine roughness variation. */
  var FINISH = {
    'silver':      { color: '#cfd1d4', roughness: 0.34, coat: 0.0, coatRough: 0.3, grain: 0.07 },
    'space-black': { color: '#333438', roughness: 0.4, coat: 0.5, coatRough: 0.22, grain: 0.05 },
    'space-grey':  { color: '#86888c', roughness: 0.37, coat: 0.1, coatRough: 0.3, grain: 0.06 },
    'midnight':    { color: '#2e3642', roughness: 0.38, coat: 0.3, coatRough: 0.3, grain: 0.05 },
    'starlight':   { color: '#dcd4c6', roughness: 0.34, coat: 0.0, coatRough: 0.3, grain: 0.07 }
  };
  function finishOf(f) {
    if (typeof f === 'string' && FINISH[f]) return FINISH[f];
    return { color: f, roughness: 0.38, coat: 0.15, coatRough: 0.3, grain: 0.06 };
  }
  MT.FINISH = FINISH;
  MT.anodizedAluminum = function (o) {
    o = o || {};
    var T = T3(o), F = finishOf(def(o.finish, 'silver'));
    var p = { color: color(T, F.color), metalness: 1, roughness: def(o.roughness, F.roughness) };
    if (F.coat > 0) { p.clearcoat = F.coat; p.clearcoatRoughness = F.coatRough; }
    if (def(o.blasted, true)) {
      var bb = bbTex(T), g = def(o.grain, F.grain);
      p.normalMap = rep(bb, o.repeat, 8); p.normalScale = new T.Vector2(g, g);
      p.roughnessMap = rep(bb.rk.roughnessMap, o.repeat, 8);
      p.roughness = p.roughness / bb.rk.roughnessMean;               // map mean 0.78 -> effective = target
    }
    return phys(T, p, 'anodizedAluminum', o);
  };

  /* Diamond-cut chamfer: the CNC diamond tool leaves a near-mirror facet with fine circumferential tool marks.
   * Roughness 0.08 (a true mirror at 0.02 flickers on/off as the edge turns; 0.08 keeps a continuous thin
   * bright line along a long chamfer). Slight anisotropy (0.35) along uv-u stretches the line along the edge.
   * Silver: bare aluminium, brighter than the anodised body (#eef0f2). Space-black: the cut is re-anodised
   * dark, so it is a dark mirror (#54565b) whose line comes from a full clearcoat (0.8, rough 0.04): the edge
   * still flashes white against the body, which is what defines the silhouette in Apple's dark renders. */
  MT.diamondCutEdge = function (o) {
    o = o || {};
    var T = T3(o), f = def(o.finish, 'silver'), dark = f === 'space-black' || f === 'midnight';
    var p = { color: color(T, dark ? (f === 'midnight' ? '#3c4552' : '#54565b') : (FINISH[f] ? '#eef0f2' : f)), metalness: 1,
      roughness: def(o.roughness, 0.08), anisotropy: def(o.anisotropy, 0.35), anisotropyRotation: def(o.anisotropyRotation, 0) };
    if (dark) { p.clearcoat = 0.8; p.clearcoatRoughness = 0.04; }
    return phys(T, p, 'diamondCutEdge', o);
  };

  /* Glossy polycarbonate (AirPods white). Albedo #f4f4f2 (0.905 linear: a real bright white polymer; the old
   * grey look came from albedo ~0.75 + low exposure). The base layer is kept semi-rough (0.32, specular 0.5)
   * so it contributes the soft body sheen; the crisp strip reflections come from a clearcoat (1.0, rough
   * 0.045) — two lobes is what makes photographed white plastic look deep rather than enamel-flat.
   * Subsurface: wrap 0.35 / transmit 0.2, warm-neutral sssColor #fff6ee (polycarbonate scatters slightly warm).
   * ior 1.585 = polycarbonate. */
  MT.glossyPolycarbonate = function (o) {
    o = o || {};
    var T = T3(o);
    var m = phys(T, { color: color(T, def(o.color, '#f4f4f2')), metalness: 0, roughness: def(o.roughness, 0.32), ior: 1.585,
      specularIntensity: 0.5, clearcoat: def(o.clearcoat, 1), clearcoatRoughness: def(o.clearcoatRoughness, 0.045),
      sheen: def(o.sheen, 0), sheenRoughness: 0.6, sheenColor: color(T, '#ffffff') }, 'glossyPolycarbonate', o);
    return def(o.sss, true) ? addSSS(T, m, { wrap: def(o.wrap, 0.35), transmit: def(o.transmit, 0.2), sssColor: def(o.sssColor, '#fff6ee') }) : m;
  };

  /* Soft-touch plastic: elastomeric paint — high roughness (0.72), low specular (0.45) and a grey sheen lobe
   * (0.5 @ 0.55) that gives the velvety grazing brightening real soft-touch has (without sheen it reads as
   * cheap matte ABS). Very fine grain at normalScale 0.08. */
  MT.softTouchPlastic = function (o) {
    o = o || {};
    var T = T3(o), c = color(T, def(o.color, '#2a2a2d'));
    var sh = c.clone().lerp(new T.Color(1, 1, 1), 0.18);
    var bb = bbTex(T);
    return phys(T, { color: c, metalness: 0, roughness: def(o.roughness, 0.72), specularIntensity: 0.45,
      sheen: def(o.sheen, 0.5), sheenRoughness: 0.55, sheenColor: sh,
      normalMap: rep(bb, o.repeat, 10), normalScale: new T.Vector2(0.08, 0.08) }, 'softTouchPlastic', o);
  };

  /* Glass cover (thin reflective layer over a screen / lens). Physically the cover is a 4% (ior 1.52) Fresnel
   * reflector that barely dims what is under it. With normal alpha blending three scales the reflection by
   * opacity, so the layer would vanish; instead it is ADDITIVE: black diffuse, only the specular term is
   * added on top of the screen, in linear HDR before tone mapping — exactly a reflection. Roughness 0.02.
   * `tint` colours the reflection (AR coatings go slightly blue-violet/green at grazing). transparent + no depth
   * write: keep it out of AO/normal prepasses (GTAO would otherwise darken the screen under it). */
  MT.glassCover = function (o) {
    o = o || {};
    var T = T3(o);
    return phys(T, { color: 0x000000, metalness: 0, roughness: def(o.roughness, 0.02), ior: 1.52, specularIntensity: 1,
      specularColor: color(T, def(o.tint, '#f2f5ff')), transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, 'glassCover', o);
  };

  /* Glossy black glass (display bezel, black glass surrounds): near-black dielectric (#050506), ior 1.52,
   * roughness 0.03 — a black mirror at 4%, so every softbox and strip reads as a crisp shape and the bezel
   * reads as glass rather than matte paint. */
  MT.glossyBlackGlass = function (o) {
    o = o || {};
    var T = T3(o);
    return phys(T, { color: color(T, def(o.color, '#050506')), metalness: 0, roughness: def(o.roughness, 0.03), ior: 1.52,
      specularIntensity: 1 }, 'glossyBlackGlass', o);
  };

  /* Keycap: matte black soft-touch-ish PBT/ABS (#101012, roughness 0.6, specular 0.5, sheen 0.35) with crisp
   * laser-etched legends from a legendAtlas. Legend mask (atlas G) is applied only on the key top
   * (object-space normal.y > ~0.7): albedo -> legendColor (#c9c9cd, unlit etched window), emissive ->
   * backlightColor * backlight (0..1, uniform, animate it). Per-instance legend: pass instanced:true and give
   * the geometry an InstancedBufferAttribute 'aLegend' (vec4 u0,v0,u1,v1 = atlas.userData.rects[i]);
   * single mesh: legendRect [u0,v0,u1,v1]. flipV (default false) mirrors v if a custom key mesh's top-face v runs the other way.
   * Uniforms: material.rk.uniforms.{uBacklight,uBacklightColor,uLegendColor,uLegendRect}. */
  MT.keycap = function (o) {
    o = o || {};
    var T = T3(o), bb = bbTex(T);
    var m = phys(T, { color: color(T, def(o.color, '#101012')), metalness: 0, roughness: def(o.roughness, 0.6), specularIntensity: 0.5,
      sheen: 0.35, sheenRoughness: 0.6, sheenColor: color(T, '#3a3a3f'),
      normalMap: rep(bb, o.repeat, 3), normalScale: new T.Vector2(0.06, 0.06) }, 'keycap', o);
    var tex = o.legendTex || null, inst = !!o.instanced;
    var U = {
      uLegend: { value: tex }, uLegendRect: { value: new T.Vector4().fromArray(def(o.legendRect, [0, 0, 1, 1])) },
      uLegendFlip: { value: def(o.flipV, false) ? 1 : 0 }, uLegendColor: { value: color(T, def(o.legendColor, '#c9c9cd')) },
      uBacklight: { value: def(o.backlight, 0) }, uBacklightColor: { value: color(T, def(o.backlightColor, '#ffffff')).multiplyScalar(def(o.backlightIntensity, 1.25)) }
    };
    Object.assign(m.rk.uniforms, U);
    if (!tex) return m;
    if (inst) m.defines = Object.assign(m.defines || {}, { RK_LEGEND_INSTANCED: '' });
    return extend(m, 'keycap' + (inst ? 'I' : ''), function (sh) {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', ['#include <common>',
          '#ifdef RK_LEGEND_INSTANCED', 'attribute vec4 aLegend;', '#endif',
          'uniform vec4 uLegendRect;', 'uniform float uLegendFlip;', 'varying vec2 vLegUv;', 'varying float vLegTop;'].join('\n'))
        .replace('#include <uv_vertex>', ['#include <uv_vertex>',
          'vec2 rkLuv = vec2( uv.x, mix( uv.y, 1.0 - uv.y, uLegendFlip ) );',
          '#ifdef RK_LEGEND_INSTANCED', 'vLegUv = mix( aLegend.xy, aLegend.zw, rkLuv );',
          '#else', 'vLegUv = mix( uLegendRect.xy, uLegendRect.zw, rkLuv );', '#endif',
          'vLegTop = smoothstep( 0.62, 0.9, normal.y );'].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', ['#include <common>', 'uniform sampler2D uLegend;', 'uniform vec3 uLegendColor;',
          'uniform float uBacklight;', 'uniform vec3 uBacklightColor;', 'varying vec2 vLegUv;', 'varying float vLegTop;'].join('\n'))
        .replace('#include <map_fragment>', ['#include <map_fragment>',
          'float rkLeg = texture2D( uLegend, vLegUv ).g * vLegTop;',
          'diffuseColor.rgb = mix( diffuseColor.rgb, uLegendColor, rkLeg * ( 1.0 - 0.55 * uBacklight ) );'].join('\n'))
        .replace('#include <emissivemap_fragment>', ['#include <emissivemap_fragment>',
          'totalEmissiveRadiance += uBacklightColor * uBacklight * rkLeg;'].join('\n'));
    });
  };

  /* Rubber (feet, gaskets): near-black (#0d0d0e), rough 0.82, low specular 0.4, broad sheen (0.6) — rubber's
   * dusty grazing sheen is its signature; without it rubber reads as black plastic. */
  MT.rubber = function (o) {
    o = o || {};
    var T = T3(o);
    return phys(T, { color: color(T, def(o.color, '#151517')), metalness: 0, roughness: def(o.roughness, 0.76), specularIntensity: 0.5,
      sheen: 0.6, sheenRoughness: 0.7, sheenColor: color(T, '#2a2a2d') }, 'rubber', o);
  };

  /* Silicone (AirPods ear tip): milky light grey (#e7e8e5), satin (rough 0.48), ior 1.41, velvety sheen, and a
   * STRONG fake subsurface (wrap 0.6, transmit 0.55): thin silicone glows at the rim and never has a hard
   * terminator. opts.transmission:true switches to real transmission (0.35, thickness 0.6) — more physical,
   * but costs a whole extra scene pass whenever it is on screen; see notes. */
  MT.silicone = function (o) {
    o = o || {};
    var T = T3(o);
    var p = { color: color(T, def(o.tint, '#e7e8e5')), metalness: 0, roughness: def(o.roughness, 0.48), ior: 1.41, specularIntensity: 0.7,
      sheen: 0.45, sheenRoughness: 0.45, sheenColor: color(T, '#ffffff') };
    if (o.transmission) { p.transmission = 0.35; p.thickness = 0.6; p.attenuationColor = color(T, '#f2efe8'); p.attenuationDistance = 0.8; }
    var m = phys(T, p, 'silicone', o);
    return addSSS(T, m, { wrap: def(o.wrap, 0.6), transmit: def(o.transmit, 0.55), sssColor: def(o.sssColor, '#fbf8f2') });
  };

  /* Perforated grille.
   *   mode 'solid' (default): the grille IS the surface — anodised metal with a perforation ORM map (holes: AO
   *     0.04 kills diffuse AND env specular; metalness 0) plus the countersink normal, so each hole has a lit
   *     and a shadowed lip. Pitch in texels via o.pitch; hole density via o.repeat.
   *   mode 'overlay': black transparent holes to lay over an existing aluminium mesh (current MacBook grille strip).
   *   mode 'mesh': fine dark woven acoustic mesh (AirPods stems / speaker cloth) — weave normal + AO, near-black. */
  MT.meshGrille = function (o) {
    o = o || {};
    var T = T3(o), mode = def(o.mode, 'solid');
    if (mode === 'mesh') {
      var wv = cached('weave', function () { return TX.weave({ THREE: T }); });
      return phys(T, { color: color(T, def(o.color, '#202023')), metalness: 0, roughness: 0.62, specularIntensity: 0.6,
        sheen: 0.4, sheenRoughness: 0.5, sheenColor: color(T, '#4a4a50'),
        normalMap: rep(wv, o.repeat, 6), normalScale: new T.Vector2(1, 1), aoMap: rep(wv.rk.ormMap, o.repeat, 6), aoMapIntensity: 1 }, 'meshGrille.mesh', o);
    }
    var pf = cached('perf' + def(o.pitch, 32), function () { return TX.perforation({ THREE: T, pitch: def(o.pitch, 32) }); });
    if (mode === 'overlay') {
      return phys(T, { color: 0x000000, metalness: 0, roughness: 1, specularIntensity: 0, transparent: true, depthWrite: false,
        alphaMap: rep(pf.rk.alphaMap, o.repeat, 4), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 'meshGrille.overlay', o);
    }
    var F = finishOf(def(o.color, 'silver'));
    var orm = rep(pf.rk.ormMap, o.repeat, 4);
    var p = { color: color(T, F.color), metalness: 1, roughness: F.roughness, aoMap: orm, aoMapIntensity: 1, roughnessMap: orm, metalnessMap: orm,
      map: rep(pf.rk.colorMap, o.repeat, 4), normalMap: rep(pf.rk.normalMap, o.repeat, 4), normalScale: new T.Vector2(1, 1) };
    // the holes cut the seal coat too: on a dark finish the (white) coat reflection IS the surface tone, and
    // map / aoMap never touch it, so without this the grille read as a flat lighter patch
    p.clearcoatMap = rep(pf.rk.colorMap, o.repeat, 4);
    if (F.coat > 0) { p.clearcoat = F.coat; p.clearcoatRoughness = F.coatRough; }
    return phys(T, p, 'meshGrille', o);
  };

  /* Gold contact pads (ENIG): gold's measured F0 (1.0, 0.766, 0.336 linear) pulled slightly toward neutral
   * (0.97, 0.78, 0.42) because immersion gold is thin and a little pale in photos; roughness 0.24 (plated,
   * satin) with bead grain at 0.2 so pads sparkle subtly instead of mirroring. */
  MT.goldPad = function (o) {
    o = o || {};
    var T = T3(o), bb = bbTex(T);
    return phys(T, { color: new T.Color().setRGB(0.95, 0.72, 0.36, T.LinearSRGBColorSpace), metalness: 1, roughness: def(o.roughness, 0.26),
      normalMap: rep(bb, o.repeat, 4), normalScale: new T.Vector2(0.2, 0.2) }, 'goldPad', o);
  };

  /* Solder mask (Apple logic boards: very dark green-black): dark tinted base (#0c1a14) under a glossy polymer
   * coat (clearcoat 0.85, rough 0.2) — the coat's soft highlight over a near-black green is the look. A faint
   * fibreglass weave (normalScale 0.05) ghosts through, as it does in macro shots of real boards. */
  MT.pcbSolderMask = function (o) {
    o = o || {};
    var T = T3(o), wv = cached('weave', function () { return TX.weave({ THREE: T }); });
    return phys(T, { color: color(T, def(o.color, '#0c1a14')), metalness: 0, roughness: 0.5, specularIntensity: 0.5,
      clearcoat: 0.85, clearcoatRoughness: def(o.coatRoughness, 0.2),
      clearcoatNormalMap: rep(wv, o.repeat, 12), clearcoatNormalScale: new T.Vector2(0.05, 0.05) }, 'pcbSolderMask', o);
  };

  /* Silicon die: polished silicon reflects ~35% nearly neutral (slightly blue) -> metal with F0 (0.34, 0.36,
   * 0.40) linear, roughness 0.1. The SiO2/SiN passivation film gives the thin-film colour: iridescence
   * (default 0.35) with ior 1.46 over a thickness range 180..520 nm driven by a low-frequency noise map so the
   * hue drifts across the die (a uniform film gives one flat colour, which reads as a coloured plastic). */
  MT.siliconDie = function (o) {
    o = o || {};
    var T = T3(o);
    var thick = cached('dieThick', function () {
      var S = 256, f = standardize(valueNoise(S, S, 4, rng(3))), v = function (i) { return 0.5 + 0.22 * f[i]; };
      return dataTex(T, packRGBA(S, S, v, v, v), S, S, {}, 'rk.die.thickness');
    });
    return phys(T, { color: new T.Color().setRGB(0.34, 0.36, 0.40, T.LinearSRGBColorSpace), metalness: 1, roughness: def(o.roughness, 0.1),
      iridescence: def(o.iridescence, 0.18), iridescenceIOR: 1.46, iridescenceThicknessRange: [300, 430],
      iridescenceThicknessMap: thick }, 'siliconDie', o);
  };

  /* Emissive screen: black glossy glass whose emission is the screen image. The base layer itself is the cover
   * glass (dielectric, ior 1.52, roughness 0.035), so a single draw gives image + crisp studio reflection; no
   * separate glassCover mesh needed. specularIntensity 0.4 = AR-coated cover (~1.6% vs 4% bare glass): at 1.0
   * the paper studio's bright dome washed the image to pastel in the lab; 0.4 keeps strips visible, image rich.
   * emissiveIntensity 1.0 keeps UI whites at display white through Neutral
   * tone mapping; raise to ~1.4 if the pipeline's bloom should kiss the brightest UI. map -> sRGB. */
  MT.emissiveScreen = function (o) {
    o = o || {};
    var T = T3(o), map = o.map || null;
    if (map && (!map.colorSpace || map.colorSpace === T.NoColorSpace)) { map.colorSpace = T.SRGBColorSpace; map.needsUpdate = true; }
    if (map) map.anisotropy = Math.max(map.anisotropy || 1, 8);
    return phys(T, { color: 0x000000, metalness: 0, roughness: def(o.roughness, 0.035), ior: 1.52, specularIntensity: def(o.glass, true) ? def(o.reflectance, 0.4) : 0,
      emissive: 0xffffff, emissiveMap: map, emissiveIntensity: def(o.intensity, 1.0) }, 'emissiveScreen', o);
  };

  /* Extra: trackpad glass (MacBook Force Touch trackpad). Etched glass colour-matched to the enclosure: a
   * dielectric (not metal) base in the finish colour, semi-rough (0.45), under a frosted glass top (clearcoat
   * 1.0, rough 0.2). Against the blasted metal it reads as a slightly softer, slightly glossier panel. */
  MT.trackpadGlass = function (o) {
    o = o || {};
    var T = T3(o), dark = def(o.finish, 'silver') === 'space-black', bb = bbTex(T);
    return phys(T, { color: color(T, dark ? '#303135' : '#c9cbce'), metalness: 0.7, roughness: 0.42,
      clearcoat: 1, clearcoatRoughness: 0.2, normalMap: rep(bb, o.repeat, 6), normalScale: new T.Vector2(0.05, 0.05) }, 'trackpadGlass', o);
  };

  /* Extra: LED / status light — unlit emissive colour above 1.0 so a bloom threshold catches it. */
  MT.led = function (o) {
    o = o || {};
    var T = T3(o), m = new T.MeshBasicMaterial({ color: color(T, def(o.color, '#ffffff')).multiplyScalar(def(o.intensity, 4)) });
    m.name = 'rk.led'; m.userData.rk = 'led';
    return m;
  };

  MT.list = ['anodizedAluminum', 'diamondCutEdge', 'glossyPolycarbonate', 'softTouchPlastic', 'glassCover', 'glossyBlackGlass', 'keycap',
    'rubber', 'silicone', 'meshGrille', 'goldPad', 'pcbSolderMask', 'siliconDie', 'emissiveScreen', 'trackpadGlass', 'led'];
  MT.disposeCache = function () { Object.keys(cache).forEach(function (k) { var t = cache[k]; if (t && t.dispose) t.dispose(); if (t && t.rk) Object.keys(t.rk).forEach(function (j) { if (t.rk[j] && t.rk[j].isTexture) t.rk[j].dispose(); }); delete cache[k]; }); };
})(typeof window !== 'undefined' ? window : this);
