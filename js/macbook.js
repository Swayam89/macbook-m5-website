/* =============================================================================
 * macbook.js  (E2)  Photoreal procedural MacBook Pro 14-inch (M5) + its sections
 * -----------------------------------------------------------------------------
 * Owns: the fixed WebGL stage ([data-mac-stage]), #hero (pin, lid-open, dive),
 * the #material state trigger, #finish (pin, finish picker, drag, lid toggle)
 * and #finale (pin, lid down). Contract: SPEC.md sections 4, 6 and 7.
 *
 * Timelines scrub plain proxy objects (one per section, so late-settling scrubs
 * can never fight each other); the gsap.ticker composes the active proxy with
 * pointer / drag / peek / finish state into window.MacScene.state, and the
 * THREE renderer (attached later via APP.whenThree) only reads that state.
 * Units: 1 = 1 cm. Origin = base centre at table level, +z towards the viewer.
 * ========================================================================== */
(function () {
  'use strict';

  var W = window, DOC = document;
  var DEG = Math.PI / 180;

  /* ---------------------------------------------------------------------------
   * 0. GEOMETRY CONSTANTS + POSES (spec section 7)
   * ------------------------------------------------------------------------- */
  var DIM = {
    W: 31.26, D: 22.12, R: 1.0,        // footprint, plan corner radius
    feet: 0.06, baseTop: 0.95,         // base = feet + 0.89 shell
    lidT: 0.57, lidGap: 0.03,          // lid 0.57 + 0.03 gasket gap = 0.60
    pivotY: 0.95, pivotZ: -10.66,      // hinge pivot
    scrW: 30.05, scrH: 19.52,          // active area (3024:1964)
    scrC: 11.2,                        // screen centre distance from pivot along the lid
    glassW: 30.6, glassD: 21.5
  };
  var LID_OPEN = 108;

  function screenCentre(theta) {       // S = pivot + d * 11.2
    return { x: 0, y: DIM.pivotY + Math.sin(theta) * DIM.scrC, z: DIM.pivotZ + Math.cos(theta) * DIM.scrC };
  }
  function screenNormal(theta) {       // m = (0, -cos, sin)
    return { x: 0, y: -Math.cos(theta), z: Math.sin(theta) };
  }
  var S108 = screenCentre(LID_OPEN * DEG), M108 = screenNormal(LID_OPEN * DEG);
  // fit: the half-width (cm) a narrow (phone/tablet) frame must hold around the target (see renderFrame)
  function pose(x, y, z, tx, ty, tz, fov, fit) { return { x: x, y: y, z: z, tx: tx, ty: ty, tz: tz, fov: fov, fit: fit || 20.5 }; }
  var POSES = {
    A: pose(0, 7, 60, 0, 0.8, 0, 35, 19.5),
    B: pose(36, 26, 50, 0, 8, -4, 35, 23),
    C: pose(S108.x + M108.x * 45, S108.y + M108.y * 45, S108.z + M108.z * 45, S108.x, S108.y, S108.z, 35, 17.6),
    D: pose(S108.x + M108.x * 0.6, S108.y + M108.y * 0.6, S108.z + M108.z * 0.6, S108.x, S108.y, S108.z, 20),
    M: pose(0, 70, 0.01, 0, 0, 0, 30, 19),
    // integration: pulled back and nudged left so the open lid clears the top edge and the finish name
    F: pose(2.6, 23, 71, 2.6, 6.6, -1.5, 30, 22.5),
    E: pose(0, 40, 70, 0, 0, 0, 30),
    // integration: desktop finale framing. The closing lid rides in the upper third, clear of the
    // bottom-left credits heading; the spec pose E stays the phone framing (stacked credits).
    Ed: pose(0, 43, 76, 0, -8.5, 5, 30)
  };
  // Phone fit (spec: 17.2 = half the footprint) is per pose: the corners nearest the lens project wider
  // than the target plane, and a 3/4 view is wider still, so each pose holds what keeps ~88% width.
  var FIT = 20.5;
  // phones/tablets: no sideways composition offset (desktop F is nudged left for the finish name)
  function phonePose(p) { var c = camCopy(p); if (isMobile()) { c.x -= c.tx; c.tx = 0; c.ox = 0; c.oy = 0.085; } return c; }
  // oy: screen-space lift (fraction of the frame height) applied as a view offset, so a phone layout can
  // seat the laptop between its top and bottom copy without changing the perspective
  function camCopy(p) { return { x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz, fov: p.fov, fit: p.fit || 20.5, ox: p.ox || 0, oy: p.oy || 0 }; }

  /* ---------------------------------------------------------------------------
   * 1. PUBLIC STATE + API (exists synchronously)
   * ------------------------------------------------------------------------- */
  var state = {
    lid: 0, peek: 0, rotY: 0, tiltX: 0, dragY: 0, dragX: 0, envRot: -0.9, envRotPointer: 0, sweepX: -50,
    screenOn: 0, exposure: 1, dive: 0, opacity: 1, finishMix: 0, visible: true,
    cam: camCopy(POSES.A)
  };
  // one proxy per section; only the active one is composed into `state`
  var PX = {
    // film / filmA: the Blender hero film's frame (0-based) and opacity (see section 10b)
    hero: { lid: 0, rotY: 0, envRot: -0.9, sweepX: -50, screenOn: 0, exposure: 1, dive: 0, opacity: 1, sweepI: 1, film: 0, filmA: 1, cam: camCopy(POSES.A) },
    // envK scales the studio reflections: top-down, the overhead softbox otherwise flattens the lid to a
    // uniform grey, so #material runs darker and lets the sweep bar do the modelling
    material: { lid: 0, rotY: Math.PI - 0.4, envRot: -0.5, sweepX: -50, screenOn: 0, exposure: 1, dive: 0, opacity: 1, sweepI: 0.9, envK: 0.42, cam: camCopy(POSES.M) },
    // yaw: art-directed turn of the camera-locked studio for this section. At the 3/4 finish view the deck
    // would otherwise mirror only the dark flank of the rear softbox and its right half drops into the void
    finish: { lid: 0, rotY: Math.PI, envRot: 0.35, sweepX: 50, screenOn: 0, exposure: 1, dive: 0, opacity: 1, sweepI: 0.9, envK: 0.42, yaw: 0, film: 0, cam: camCopy(POSES.M) },
    finale: { lid: 105, rotY: 0.35, envRot: 0.35, sweepX: 0, screenOn: 0.6, exposure: 1, dive: 0, opacity: 1, sweepI: 0, yaw: -0.26, cam: phonePose(POSES.F) }
  };
  // interaction-owned values
  var IX = {
    ptYaw: 0, ptYawT: 0, ptTiltT: 0, envPT: 0,  // pointer (targets + current)
    lidUser: 1,                                // finish lid toggle factor (deg/105)
    envFlick: 0,                               // finish change highlight sweep
    bgMix: 0,                                  // 0 void -> 1 paper (stage bg in the late sections)
    vDrag: 0, dragging: false,
    fade: 1,                                   // reduced-motion still crossfade
    idle: 1, lastActive: 0                     // idle float fades out after 15s without input
  };
  var region = 'hero';
  var dirty = true;
  var ST = { hero: null, v1: null, v2: null, material: null, finish: null, finale: null };

  function markDirty() { dirty = true; }

  var MacScene = W.MacScene = {
    state: state,
    poses: POSES,
    ready: false,
    finish: 'space-black',
    setFinish: function (name, opts) { setFinish(name, opts || {}, 'ui'); },
    setLid: function (deg, opts) { setLid(deg, opts || {}); },
    markDirty: markDirty,
    getState: function () { return state; },
    // QA / look-dev: section proxies + studio layouts; rebake() re-renders both studios after an edit
    debug: {
      get px() { return PX; }, get studio() { return STUDIO; },
      rebake: function () {
        if (!R || !R.studios.length) return false;
        R.studios[0].preset(STUDIO.dark); R.studios[1].preset(STUDIO.paper);
        R.studios.forEach(function (st) { if (st.release) st.release(); });
        // a re-bake after release() hands out new PMREM textures: re-point every material
        R.envMats.forEach(function (m) { m.envMap = R.studios[0].envMap; });
        R.envU.forEach(function (u) { u.rkEnvB.value = R.studios[1].envMap; });
        if (R.pipe) R.pipe.invalidate();
        markDirty(); return true;
      }
    },
    // QA: the Blender films (hero film + finish turntables), see section 10b
    films: function () {
      function one(o) { return o && o.seq ? { on: o.a, drawn: o.drawn, seq: o.seq.stats() } : null; }
      return { region: region, heroKey: HF.key, hero: one(HF), black: one(TF.b), silver: one(TF.s), covered: covered, box: TF.box };
    },
    // QA / debugging: renderer + pipeline state (dpr must stay 2 on desktop, brief T12)
    stats: function () {
      if (!R) return null;
      return { dpr: R.dpr, quality: R.quality, pipe: R.pipe ? R.pipe.stats() : null, envMix: R.envMix, box: USE_BOX, boot: BOOT };
    }
  };

  /* ---------------------------------------------------------------------------
   * 2. SMALL HELPERS
   * ------------------------------------------------------------------------- */
  function $(sel, root) { return (root || DOC).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || DOC).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function app() { return W.APP || null; }
  function G() { var A = app(); return (A && A.gsap) || W.gsap; }
  function emit(evt, payload) { var A = app(); if (A && A.bus && A.bus.emit) { try { A.bus.emit(evt, payload || {}); } catch (e) { /* noop */ } } }
  function on(evt, fn) { var A = app(); if (A && A.bus && A.bus.on) A.bus.on(evt, fn); }
  function isRM() { var A = app(); return !!(A && A.reducedMotion); }
  function isMobile() { var A = app(); return A ? !!A.isMobile : W.innerWidth <= 768; }
  function pinEnd(k) {
    var A = app();
    if (A && A.pinEnd) return A.pinEnd(k);
    return function () { return '+=' + W.innerHeight * k * (isMobile() ? 0.6 : 1); };
  }

  var appReady = false, pendingEmits = [];
  function emitWhenReady(evt, payload) { if (appReady) emit(evt, payload); else pendingEmits.push([evt, payload]); }
  on('app:ready', function () {
    appReady = true;
    pendingEmits.splice(0).forEach(function (e) { emit(e[0], e[1]); });
  });

  /* ---------------------------------------------------------------------------
   * 3. MODEL BUILDER
   * ------------------------------------------------------------------------- */
  function buildMacBook(THREE) {
    var V3 = THREE.Vector3;

    // closed rounded-rect outline in XZ (points + outward normals)
    function rrOutline(w, d, r, seg, cx, cz) {
      cx = cx || 0; cz = cz || 0;
      var hw = w / 2, hd = d / 2, pts = [], nrm = [];
      var corners = [[hw - r, hd - r, 0], [hw - r, -hd + r, -Math.PI / 2], [-hw + r, -hd + r, -Math.PI], [-hw + r, hd - r, -Math.PI * 1.5]];
      for (var c = 0; c < 4; c++) {
        var k = corners[c];
        for (var i = 0; i <= seg; i++) {
          var a = k[2] + Math.PI / 2 - (i / seg) * (Math.PI / 2);
          var nx = Math.cos(a), nz = Math.sin(a);
          pts.push([cx + k[0] + nx * r, cz + k[1] + nz * r]); nrm.push([nx, nz]);
        }
      }
      return { pts: pts, nrm: nrm };
    }
    function flipOutline(o) { return { pts: o.pts, nrm: o.nrm.map(function (q) { return [-q[0], -q[1]]; }) }; }
    // arc-based rounded rect Shape in (x, y2d) where y2d = f*z
    function rrShape(w, d, r, cx, cz, flipZ, Ctor) {
      Ctor = Ctor || THREE.Shape;
      var s = new Ctor(), hw = w / 2, hd = d / 2, f = flipZ ? -1 : 1;
      cx = cx || 0; var cy = f * (cz || 0);
      s.moveTo(cx - hw + r, cy - hd);
      s.lineTo(cx + hw - r, cy - hd); s.absarc(cx + hw - r, cy - hd + r, r, -Math.PI / 2, 0, false);
      s.lineTo(cx + hw, cy + hd - r); s.absarc(cx + hw - r, cy + hd - r, r, 0, Math.PI / 2, false);
      s.lineTo(cx - hw + r, cy + hd); s.absarc(cx - hw + r, cy + hd - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(cx - hw, cy - hd + r); s.absarc(cx - hw + r, cy - hd + r, r, Math.PI, Math.PI * 1.5, false);
      return s;
    }
    // profile points on a quarter circle centred (d=cx, y=cy)
    function arc(list, cx, cy, r, a0, a1, seg) {
      for (var i = 0; i <= seg; i++) {
        var a = a0 + (a1 - a0) * (i / seg), ox = Math.cos(a), oy = Math.sin(a);
        list.push({ d: cx - ox * r, y: cy + oy * r, nx: ox, ny: oy });
      }
      return list;
    }
    // sweep a profile along an outline, analytic normals (perfectly smooth bevels)
    function sweep(outline, profile) {
      var n = outline.pts.length, m = profile.length, pos = [], nor = [], uv = [], idx = [], perim = [0], plen = [0], i, j;
      for (i = 1; i <= n; i++) { var a = outline.pts[i - 1], b = outline.pts[i % n]; perim.push(perim[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
      for (j = 1; j < m; j++) plen.push(plen[j - 1] + Math.hypot(profile[j].d - profile[j - 1].d, profile[j].y - profile[j - 1].y));
      for (i = 0; i <= n; i++) {
        var p = outline.pts[i % n], q = outline.nrm[i % n];
        for (j = 0; j < m; j++) {
          var pr = profile[j];
          pos.push(p[0] - q[0] * pr.d, pr.y, p[1] - q[1] * pr.d);
          nor.push(q[0] * pr.nx, pr.ny, q[1] * pr.nx);
          uv.push(perim[i], plen[j]);
        }
      }
      for (i = 0; i < n; i++) for (j = 0; j < m - 1; j++) {
        var A = i * m + j, B = (i + 1) * m + j, C = (i + 1) * m + j + 1, D = i * m + j + 1;
        idx.push(A, B, D, B, C, D);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      fixWinding(g);
      return g;
    }
    function fixWinding(g) {
      var p = g.attributes.position, nr = g.attributes.normal, ix = g.index.array;
      var a = new V3(), b = new V3(), c = new V3(), n = new V3(), vote = 0, t;
      for (t = 0; t < Math.min(ix.length, 6000); t += 3) {
        a.fromBufferAttribute(p, ix[t]); b.fromBufferAttribute(p, ix[t + 1]); c.fromBufferAttribute(p, ix[t + 2]);
        b.sub(a); c.sub(a); b.cross(c);
        if (b.lengthSq() < 1e-14) continue;
        n.fromBufferAttribute(nr, ix[t]); vote += b.dot(n) > 0 ? 1 : -1;
      }
      if (vote < 0) for (t = 0; t < ix.length; t += 3) { var s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
    }
    function capUp(shape, y, seg) { var g = new THREE.ShapeGeometry(shape, seg || 20); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }
    function capDown(shape, y, seg) { var g = new THREE.ShapeGeometry(shape, seg || 20); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; }
    function merge(list) {
      var pos = [], nor = [], uv = [], idx = [], off = 0;
      list.forEach(function (g) {
        var p = g.attributes.position, nr = g.attributes.normal, u = g.attributes.uv, i;
        for (i = 0; i < p.count; i++) {
          pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nr.getX(i), nr.getY(i), nr.getZ(i));
          uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
        }
        if (g.index) for (i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
        else for (i = 0; i < p.count; i++) idx.push(i + off);
        off += p.count;
        g.dispose();
      });
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      out.setIndex(idx);
      return out;
    }
    function tf(g, fn) { fn(g); return g; }

    /* ---------- procedural textures ---------- */
    function canvas(w, h) { var c = DOC.createElement('canvas'); c.width = w; c.height = h; return c; }
    function textTex(text, w, h, font, color, spacing) {
      var c = canvas(w, h), x = c.getContext('2d');
      x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (spacing) { try { x.letterSpacing = spacing; } catch (e) { /* older canvas */ } }
      x.fillText(text, w / 2, h / 2 + 2);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }
    // 1 x n data ramp (row i = v (i + .5) / n), used as an aoMap along a sweep profile (uv.y = profile cm)
    function rampTex(n, fn) {
      var d = new Uint8Array(n * 4);
      for (var i = 0; i < n; i++) { var v = Math.round(clamp(fn((i + 0.5) / n), 0, 1) * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
      var t = new THREE.DataTexture(d, 1, n);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
      return t;
    }
    // chain a shader hook onto a material without losing an existing one (library materials carry theirs)
    function hook(m, key, fn) {
      var prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); fn(sh, r); };
      m.customProgramCacheKey = function () { return prevKey.call(this) + '|' + key; };
      m.needsUpdate = true;
    }

    /* ---------- materials: RenderKit library (js/materials.js) with LOOKDEV-BRIEF 5.2 values ----------
     * Finish-dependent values (colour, roughness, clearcoat) are written by applyFinishMaterials(); what is
     * set here is the Space Black start. envMapIntensity stays 1: the energy lives in the studio. */
    var RKM = (W.RenderKit && W.RenderKit.materials) || null;
    function phys(p) { var m = new THREE.MeshPhysicalMaterial(p); m.userData.rm = 1; return m; }
    function alu() {
      // bead-blasted anodised aluminium: grain normal + +-4% roughness map; the map's mean (.78) is kept in
      // userData.rm so applyFinishMaterials sets the EFFECTIVE roughness
      if (RKM) { var m = RKM.anodizedAluminum({ THREE: THREE, finish: 'space-black', repeat: 0.45, grain: 0.05 }); m.userData.rm = 0.78; return m; }
      return phys({ color: 0x2f2e31, metalness: 1, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.28 });
    }
    var M = {};
    M.shell = alu();                 // lid top + base underside
    M.deck = alu();                  // base top: carries the baked deck AO (brief 5.4)
    M.side = alu();                  // base side wall: seam/foot AO ramp, port openings
    M.lidSide = alu();               // lid side wall: seam AO ramp
    M.trackpad = alu();
    // diamond-cut chamfers: much smoother than the body so every edge prints one thin bright line;
    // anisotropy along the sweep (uv.u runs along the edge) stretches that line along the edge
    M.edge = phys({ color: 0x3a393d, metalness: 1, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06, anisotropy: 0.35 });
    M.well = new THREE.MeshStandardMaterial({ color: 0x060607, metalness: 0, roughness: 0.7 });
    M.gap = new THREE.MeshStandardMaterial({ color: 0x010101, metalness: 0, roughness: 1 });
    // keycaps: matte black with a faint grazing sheen (edge band, dish, base AO and legends in the shader)
    // (sheen .05 / spec .25: at .15 / .4 the keys read light grey, 84-90 luma, on the Space Black finish)
    // (roughness .62 spreads the overhead lights' lobe: at .5 the keys still read 70+ luma grey)
    M.key = phys({ color: 0x0d0d0e, metalness: 0, roughness: 0.62, specularIntensity: 0.25,
      sheen: 0.05, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x6d6d73) });
    M.hinge = phys({ color: 0x232225, metalness: 0.9, roughness: 0.28, clearcoat: 0.2, clearcoatRoughness: 0.25 });
    M.dark = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.6 });
    M.rubber = RKM ? RKM.rubber({ THREE: THREE }) : new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.8 });
    M.port = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0, roughness: 0.6 });
    M.portIn = phys({ color: 0x161618, metalness: 0.1, roughness: 0.4, specularIntensity: 0.6 });
    M.gold = RKM ? RKM.goldPad({ THREE: THREE, repeat: 1 }) : phys({ color: 0xe6c27a, metalness: 1, roughness: 0.25 });
    // speaker grille: an OPAQUE perforated patch (ORM holes + countersink normal), never an alpha plane
    // (that was the moire); ~0.075 cm hole pitch over the 1.02 x 10.3 cm field
    M.grille = RKM ? RKM.meshGrille({ THREE: THREE, mode: 'solid', color: 'space-black', pitch: 32, repeat: [0.85, 8.6] })
      : new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.8 });
    M.grille.userData.rm = 1;
    M.grille.polygonOffset = true; M.grille.polygonOffsetFactor = -2; M.grille.polygonOffsetUnits = -2;
    // glossy black glass bezel: a black mirror, so the studio strips read as crisp shapes on it
    M.glass = RKM ? RKM.glossyBlackGlass({ THREE: THREE, color: '#020203' }) : phys({ color: 0x020203, roughness: 0.03, ior: 1.52 });
    M.glass.specularIntensity = 0.7;
    // the screen IS the cover glass: AR-coated (specular .35 = ~1.4%) over the emissive image, one draw.
    // Off, the active area is a hair lighter than the bezel (#040506 vs #020203), as on the real panel.
    M.screen = phys({ color: 0x040506, metalness: 0, roughness: 0.03, ior: 1.52, specularIntensity: 0.35,
      emissive: 0xffffff, emissiveIntensity: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    // pixel reveal: once a texel covers many screen pixels (the end of the dive) the panel resolves
    // into R/G/B sub-pixel stripes with dark cell gaps, i.e. you are now inside the display
    var pixelU = { value: 0 }, nearU = { value: 0 };
    M.screen.userData.uPixel = pixelU;
    M.screen.userData.uNear = nearU;
    M.screen.onBeforeCompile = function (sh) {
      sh.uniforms.uPixel = pixelU;
      sh.uniforms.uNear = nearU;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPixel;\nuniform float uNear;')
        .replace('#include <emissivemap_fragment>', [
          '#ifdef USE_EMISSIVEMAP',
          '  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );',
          '  if ( uNear > 0.001 ) {',
          // integration: magnified texels resolve into crisp square pixels before the sub-pixel stripes
          // appear, instead of a bilinear blur of the sentence
          '    vec2 tsz = vec2( textureSize( emissiveMap, 0 ) );',
          '    vec2 puv = vEmissiveMapUv * tsz;',
          '    vec2 f = fract( puv );',
          '    vec3 cellC = texture2D( emissiveMap, ( floor( puv ) + 0.5 ) / tsz ).rgb;',
          '    emissiveColor.rgb = mix( emissiveColor.rgb, cellC, uNear );',
          '   if ( uPixel > 0.001 ) {',
          // macro view of the panel: each pixel is three rounded emitter bars (R, G, B) in a black matrix.
          // A bar emits ONLY its own primary (no grey floor), brightest along its axis, with a faint
          // same-colour halo spilling into the matrix; the peak stays low enough that the Neutral tone
          // map keeps the primaries saturated (the old 2.6x boost + grey floor read as pastel fabric)
          '    float sx = f.x * 3.0, si = floor( sx ), sf = fract( sx );',
          '    vec2 q = vec2( ( sf - 0.5 ) / 0.34, ( f.y - 0.5 ) / 0.41 );',
          '    float r4 = pow( pow( abs( q.x ), 4.0 ) + pow( abs( q.y ), 4.0 ), 0.25 );',
          '    float aa = fwidth( r4 ) + 1e-3;',
          '    float bar = 1.0 - smoothstep( 1.0 - aa, 1.0 + aa, r4 );',
          '    float core = 0.72 + 0.28 * ( 1.0 - q.x * q.x );',
          '    float halo = exp( -3.0 * max( r4 - 1.0, 0.0 ) ) * 0.14 * ( 1.0 - bar );',
          '    vec3 prim = si < 0.5 ? vec3( 1.0, 0.03, 0.02 ) : si < 1.5 ? vec3( 0.03, 1.0, 0.06 ) : vec3( 0.03, 0.07, 1.0 );',
          '    float ch = si < 0.5 ? cellC.r : si < 1.5 ? cellC.g : cellC.b;',
          '    vec3 sub = prim * ch * ( bar * core + halo ) * 1.8;',
          '    emissiveColor.rgb = mix( emissiveColor.rgb, sub, uPixel );',
          '   }',
          '  }',
          '  totalEmissiveRadiance *= emissiveColor.rgb;',
          '#endif'
        ].join('\n'));
    };
    M.screen.customProgramCacheKey = function () { return 'mbp14-screen'; };
    // chin wordmark: printed on the glass, so it is a glossy decal the bezel reflection runs over
    var chinTex = textTex('MacBook Pro', 2048, 192, '500 112px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', '#8e8e93', '0.02em');
    M.chin = phys({ color: 0xffffff, map: chinTex, emissive: 0xffffff, emissiveMap: chinTex, emissiveIntensity: 0.18,
      metalness: 0, roughness: 0.03, specularIntensity: 0.7, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    M.lens = phys({ color: 0x05060a, metalness: 0, roughness: 0.04, ior: 1.6, clearcoat: 1, clearcoatRoughness: 0.03 });
    // coated lens barrel: rough enough to integrate the studio (a mirror ring vanished into the void) plus a
    // faint violet-black self tone so the camera still reads as a dot in the notch
    M.lensRing = phys({ color: 0x55526a, metalness: 0.7, roughness: 0.25, emissive: 0x0b0b10 });

    var model = new THREE.Group(); model.name = 'MacBookPro14';
    var base = new THREE.Group(); model.add(base);
    var buckets = {};
    function add(key, geo) { (buckets[key] = buckets[key] || []).push(geo); }

    // 3-part chamfer profile (brief 5.3.1): fillet rf -> 45 deg flat -> fillet rf, spanning R x R. The flat
    // facet mirrors one light as a CRISP line; the fillets give it soft ends instead of a hard crease.
    function chamfer(R, yTop, rf, seg) {
      seg = seg || 3;
      var s2 = Math.SQRT1_2, L = (R - rf) / s2, out = [], i, a;
      var c1 = [0, -rf], p1 = [rf * s2, -rf + rf * s2];
      var p2 = [p1[0] + L * s2, p1[1] - L * s2], c2 = [p2[0] - rf * s2, p2[1] - rf * s2];
      for (i = 0; i <= seg; i++) { a = Math.PI / 2 - (i / seg) * Math.PI / 4; out.push({ d: R - (c1[0] + rf * Math.cos(a)), y: yTop + c1[1] + rf * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }); }
      for (i = 0; i <= seg; i++) { a = Math.PI / 4 - (i / seg) * Math.PI / 4; out.push({ d: R - (c2[0] + rf * Math.cos(a)), y: yTop + c2[1] + rf * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }); }
      out[out.length - 1].d = 0;
      return out;
    }

    /* ---------- base shell ---------- */
    var B0 = DIM.feet, T = DIM.baseTop, rt = 0.05, rb = 0.3;
    var edgeProf = chamfer(rt, T, 0.015);                                 // top chamfer (diamond cut)
    var sideProf = [{ d: 0, y: T - rt, nx: 1, ny: 0 }, { d: 0, y: B0 + rb, nx: 1, ny: 0 }];
    arc(sideProf, rb, B0 + rb, rb, 0, -Math.PI / 2, 10);                  // rounded underside edge
    var outline = rrOutline(DIM.W, DIM.D, DIM.R, 20);
    add('edge', sweep(outline, edgeProf));
    add('side', sweep(outline, sideProf));

    // keyboard layout (US): full-height function row, 78 keys
    var UX = 1.9, UZ = 1.82, gapX = 0.2, gapZ = 0.22;
    var rows = [
      [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
      [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75],
      [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
      [1, 1, 1, 1.25, 5, 1.25, 1, 'L', 'UD', 'R']
    ];
    var kbW = 14.5 * UX, kbD = 6 * UZ;
    var wellW = 27.9, wellD = kbD + 0.3, wellR = 0.32, wellDepth = 0.07, wrc = 0.03;
    var wellZ0 = -10.12, kbCZ = wellZ0 + wellD / 2, kbZ0 = kbCZ - kbD / 2;
    var tpW = 15.0, tpD = 8.4, tpR = 0.6, tpGap = 0.03;
    var tpCZ = DIM.D / 2 - 1.0 - tpD / 2;

    // top deck with the well + trackpad openings
    var top = rrShape(DIM.W - 2 * rt, DIM.D - 2 * rt, DIM.R - rt, 0, 0, true);
    top.holes.push(rrShape(wellW + 2 * wrc, wellD + 2 * wrc, wellR + wrc, 0, kbCZ, true, THREE.Path));
    top.holes.push(rrShape(tpW + 2 * tpGap, tpD + 2 * tpGap, tpR + tpGap, 0, tpCZ, true, THREE.Path));
    add('deck', capUp(top, T, 24));
    add('shell', capDown(rrShape(DIM.W - 2 * rb, DIM.D - 2 * rb, DIM.R - rb, 0, 0, false), B0, 20));

    // keyboard well: chamfered polished lip + dark wall + floor
    var wOut = flipOutline(rrOutline(wellW, wellD, wellR, 10, 0, kbCZ));
    add('edge', sweep(wOut, chamfer(wrc, T, 0.01, 2)));
    add('well', sweep(wOut, [{ d: 0, y: T - wrc, nx: 1, ny: 0 }, { d: 0, y: T - wellDepth, nx: 1, ny: 0 }]));
    add('wellFloor', capUp(rrShape(wellW, wellD, wellR, 0, kbCZ, true), T - wellDepth, 10));

    // Force Touch trackpad: hairline gap + slightly inset slab with a chamfered lip
    var tOut = flipOutline(rrOutline(tpW + 2 * tpGap, tpD + 2 * tpGap, tpR + tpGap, 12, 0, tpCZ));
    add('gap', sweep(tOut, [{ d: 0, y: T, nx: 1, ny: 0 }, { d: 0, y: T - 0.1, nx: 1, ny: 0 }]));
    var tpT = T - 0.02, tpr = 0.03;
    var tpProf = chamfer(tpr, tpT, 0.01, 2);
    tpProf.push({ d: 0, y: T - 0.1, nx: 1, ny: 0 });
    add('trackpad', sweep(rrOutline(tpW, tpD, tpR, 12, 0, tpCZ), tpProf));
    add('trackpad', capUp(rrShape(tpW - 2 * tpr, tpD - 2 * tpr, tpR - tpr, 0, tpCZ, true), tpT, 12));

    // speaker grilles either side of the well (opaque perforated patches)
    var grW = 1.02, grD = kbD - 0.6, grX = wellW / 2 + (DIM.W / 2 - wellW / 2) * 0.5 + 0.02;
    [-1, 1].forEach(function (s) {
      add('grille', tf(new THREE.PlaneGeometry(grW, grD), function (g) { g.rotateX(-Math.PI / 2); g.translate(s * grX, T + 0.0006, kbCZ + 0.15); }));
    });

    // rubber feet: low domes (sphere caps, 0.06 high, r .9)
    var footH = DIM.feet + 0.004, footR = (0.81 + footH * footH) / (2 * footH), footA = Math.asin(0.9 / footR);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      add('rubber', tf(new THREE.SphereGeometry(footR, 48, 3, 0, Math.PI * 2, Math.PI - footA, footA), function (g) {
        g.translate(q[0] * (DIM.W / 2 - 2.4), footR - 0.002, q[1] * (DIM.D / 2 - 2.2));
      }));
    });

    // ports: real recesses (0.35 deep) with a polished mouth chamfer; the side wall is cut open over each
    // mouth in its shader (analytic rounded-rect discard, hidden under the chamfer ring)
    var portY = B0 + rb + (T - rt - B0 - rb) * 0.5, PORTS = [], prc = 0.02, pDepth = 0.35;
    function port(side, z, w, h, kind) {
      var r = Math.min(h / 2, w / 2) * 0.98;
      PORTS.push({ s: side, z: z, w: w, h: h, r: r });
      var parts = [];
      // local frame: tube axis +y (out of the wall), outline x = height, z = width
      var mouth = flipOutline(rrOutline(h, w, r, 8));
      var lip = chamfer(prc, 0, 0.008, 2);
      lip[0].d = prc * 1.04;
      parts.push(['edge', sweep(mouth, lip)]);
      parts.push(['port', sweep(mouth, [{ d: 0, y: -prc, nx: 1, ny: 0 }, { d: 0, y: -pDepth, nx: 1, ny: 0 }])]);
      parts.push(['port', capUp(rrShape(h, w, r, 0, 0, true), -pDepth, 8)]);
      if (kind === 'usbc' || kind === 'hdmi') {
        parts.push(['portIn', tf(new THREE.BoxGeometry(0.07, 0.24, w - 0.26), function (g) { g.translate(0, -pDepth + 0.12, 0); })]);
      } else if (kind === 'magsafe') {
        parts.push(['gold', tf(new THREE.BoxGeometry(0.09, 0.02, w - 0.5), function (g) { g.translate(0, -pDepth + 0.011, 0); })]);
      } else if (kind === 'jack') {
        parts.push(['portIn', tf(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), function (g) { g.translate(0, -pDepth + 0.011, 0); })]);
      }
      parts.forEach(function (pp) {
        var g = pp[1];
        g.rotateZ(side > 0 ? -Math.PI / 2 : Math.PI / 2);
        g.translate(side * (DIM.W / 2 + 0.0008), portY, z);
        add(pp[0], g);
      });
    }
    var zb = -DIM.D / 2;
    port(-1, zb + 2.7, 1.6, 0.3, 'magsafe');  // MagSafe 3
    port(-1, zb + 5.0, 0.9, 0.3, 'usbc');     // Thunderbolt 4
    port(-1, zb + 6.6, 0.9, 0.3, 'usbc');     // Thunderbolt 4
    port(-1, zb + 15.6, 0.36, 0.36, 'jack');  // 3.5 mm jack
    port(1, zb + 3.3, 1.5, 0.4, 'hdmi');      // HDMI
    port(1, zb + 5.5, 0.9, 0.3, 'usbc');      // Thunderbolt 4
    port(1, zb + 13.3, 2.45, 0.16, 'sd');     // SDXC

    // hinge barrel (r .32, length 24) in the body finish, with two dark rings 1 cm in from each end
    var hingeY = DIM.pivotY - 0.04;
    add('hinge', tf(new THREE.CapsuleGeometry(0.32, 23.36, 6, 28), function (g) { g.rotateZ(Math.PI / 2); g.translate(0, hingeY, DIM.pivotZ); }));
    [-1, 1].forEach(function (s) {
      add('dark', tf(new THREE.CylinderGeometry(0.323, 0.323, 0.02, 40, 1, true), function (g) { g.rotateZ(Math.PI / 2); g.translate(s * (11.68 - 1.0), hingeY, DIM.pivotZ); }));
    });

    var baseMats = { deck: M.deck, shell: M.shell, side: M.side, edge: M.edge, well: M.well, wellFloor: null, gap: M.gap, trackpad: M.trackpad,
      grille: M.grille, rubber: M.rubber, port: M.port, portIn: M.portIn, gold: M.gold, hinge: M.hinge, dark: M.dark };
    // the well floor gets its own baked AO (keys' footprints + wall falloff), so its own material
    M.wellFloor = M.well.clone(); baseMats.wellFloor = M.wellFloor;
    Object.keys(buckets).forEach(function (k) {
      var mesh = new THREE.Mesh(merge(buckets[k]), baseMats[k]);
      mesh.name = 'base-' + k;
      base.add(mesh);
    });
    buckets = {};

    /* ---------- baked AO (brief 5.4): costs nothing per frame, reads while moving ---------- */
    // deck: canvas in deck space (capUp UVs are world cm: u = x, v = -z)
    (function () {
      var CW = 2048, CH = Math.round(CW * DIM.D / DIM.W), s = CW / DIM.W, c = canvas(CW, CH), x = c.getContext('2d');
      function X(v) { return (v + DIM.W / 2) * s; } function Z(v) { return (v + DIM.D / 2) * s; }
      function rr(cx, cz, w, d, r) { x.beginPath(); x.roundRect(X(cx - w / 2), Z(cz - d / 2), w * s, d * s, r * s); }
      x.fillStyle = '#fff'; x.fillRect(0, 0, CW, CH);
      // soft 0.25 cm occlusion ring around the well (the keys stand proud of the deck)
      x.filter = 'blur(' + (0.12 * s).toFixed(1) + 'px)'; x.fillStyle = 'rgba(0,0,0,0.42)';
      rr(0, kbCZ, wellW + 0.16, wellD + 0.16, wellR + 0.08); x.fill();
      // 0.4 cm ring around the trackpad gap
      x.filter = 'blur(' + (0.16 * s).toFixed(1) + 'px)'; x.fillStyle = 'rgba(0,0,0,0.3)';
      rr(0, tpCZ, tpW + 0.1, tpD + 0.1, tpR + 0.05); x.fill();
      // 1.2 cm hinge band along the back edge (under the open display)
      x.filter = 'none';
      var g = x.createLinearGradient(0, Z(-DIM.D / 2), 0, Z(-DIM.D / 2 + 1.2));
      g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, CW, Z(-DIM.D / 2 + 1.2));
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
      t.repeat.set(1 / DIM.W, 1 / DIM.D); t.offset.set(0.5, 0.5);
      M.deck.aoMap = t; M.deck.aoMapIntensity = 1;
    })();
    // well floor: black under each key footprint, the floor between keys at .3, darker along the walls
    var keys = [];
    rows.forEach(function (row, ri) {
      var x = -kbW / 2, zc = kbZ0 + ri * UZ + UZ / 2, half = UZ / 2 - gapZ * 0.75;
      row.forEach(function (k) {
        var w;
        if (k === 'L' || k === 'R') { keys.push({ x: x + UX / 2, z: zc + UZ / 4 - gapZ * 0.12, w: UX - gapX, d: half }); x += UX; return; }
        if (k === 'UD') {
          keys.push({ x: x + UX / 2, z: zc - UZ / 4 + gapZ * 0.12, w: UX - gapX, d: half });
          keys.push({ x: x + UX / 2, z: zc + UZ / 4 - gapZ * 0.12, w: UX - gapX, d: half });
          x += UX; return;
        }
        w = k * UX - gapX;
        keys.push({ x: x + k * UX / 2, z: zc, w: w, d: UZ - gapZ });
        x += k * UX;
      });
    });
    (function () {
      var CW = 2048, CH = Math.round(CW * wellD / wellW), s = CW / wellW, c = canvas(CW, CH), x = c.getContext('2d');
      function X(v) { return (v + wellW / 2) * s; } function Z(v) { return (v - wellZ0) * s; }
      x.fillStyle = 'rgb(77,77,77)'; x.fillRect(0, 0, CW, CH);
      x.filter = 'blur(' + (0.1 * s).toFixed(1) + 'px)';
      x.strokeStyle = '#000'; x.lineWidth = 0.35 * s;
      x.beginPath(); x.roundRect(0, 0, CW, CH, wellR * s); x.stroke();
      x.filter = 'blur(' + (0.07 * s).toFixed(1) + 'px)'; x.fillStyle = '#000';
      keys.forEach(function (k) { x.beginPath(); x.roundRect(X(k.x - k.w / 2 - 0.03), Z(k.z - k.d / 2 - 0.03), (k.w + 0.06) * s, (k.d + 0.06) * s, 0.2 * s); x.fill(); });
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
      t.repeat.set(1 / wellW, 1 / wellD); t.offset.set(0.5, (kbCZ + wellD / 2) / wellD);
      M.wellFloor.aoMap = t; M.wellFloor.aoMapIntensity = 1;
    })();
    // side walls: seam falloff (0.25 cm under the top chamfer) + the rounded underside toward the feet
    var sideL = (T - rt - B0 - rb) + rb * Math.PI / 2;
    var sideAO = rampTex(128, function (v) { var cm = v * sideL; return 1 - 0.32 * Math.exp(-cm / 0.09) - 0.3 * smooth(sideL * 0.55, sideL, cm); });
    sideAO.repeat.set(0, 1 / sideL); sideAO.offset.set(0.5, 0);
    M.side.aoMap = sideAO; M.side.aoMapIntensity = 1;
    // cut the side wall open over each port mouth (object space; the chamfer ring covers the cut edge)
    hook(M.side, 'ports', function (sh) {
      var lines = PORTS.map(function (p) {
        return 'if (vPortP.x * ' + p.s.toFixed(1) + ' > 0.0) { vec2 q = abs(vec2(vPortP.z - ' + p.z.toFixed(4) + ', vPortP.y - ' + portY.toFixed(4) + ')) - vec2(' +
          (p.w / 2 + prc).toFixed(4) + ', ' + (p.h / 2 + prc).toFixed(4) + ') + ' + (p.r + prc).toFixed(4) + '; if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ' + (p.r + prc).toFixed(4) + ' < 0.0) discard; }';
      });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPortP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPortP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPortP;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (abs(vPortP.x) > ' + (DIM.W / 2 - 0.05).toFixed(3) + ') {\n' + lines.join('\n') + '\n}');
    });

    // keycaps: one InstancedMesh; widths applied 9-slice style in the vertex shader
    var kW0 = UX - gapX, kD0 = UZ - gapZ, kr = 0.17, kT = 0.12, kEdge = 0.05;
    var kProf = arc([], kEdge, kT - kEdge, kEdge, Math.PI / 2, 0, 4);
    kProf.push({ d: 0, y: 0, nx: 1, ny: 0 });
    var keyGeo = merge([sweep(rrOutline(kW0, kD0, kr, 5), kProf), capUp(rrShape(kW0 - 2 * kEdge, kD0 - 2 * kEdge, kr - kEdge, 0, 0, true), kT, 5)]);
    // legends (US layout), one atlas cell per key at the key's own aspect ratio
    var LEG = [
      ['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'touchid'],
      [['~', '`'], ['!', '1'], ['@', '2'], ['#', '3'], ['$', '4'], ['%', '5'], ['^', '6'], ['&', '7'], ['*', '8'], ['(', '9'], [')', '0'], ['_', '–'], ['+', '='], 'delete>'],
      ['tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', ['{', '['], ['}', ']'], ['|', '\\']],
      ['caps lock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', [':', ';'], ['"', "'"], 'return>'],
      ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ['<', ','], ['>', '.'], ['?', '/'], 'shift>'],
      ['fn', ['⌃', 'control'], ['⌥', 'option'], ['⌘', 'command'], '', ['⌘', 'command>'], ['⌥', 'option>'], '◀', '▲', '▼', '▶']
    ];
    var legends = [];
    LEG.forEach(function (row) { row.forEach(function (l) { legends.push(l); }); });
    // 4096 x 2048 atlas, 160 px cells: >= 2x the texels a legend covers at DPR 2 (brief 4.4 / 5.3.3)
    var ATW = 4096, ATH = 2048, CH_PX = 160, atlas = canvas(ATW, ATH), ax = atlas.getContext('2d');
    var FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
    ax.fillStyle = '#fff'; ax.strokeStyle = '#fff'; ax.textBaseline = 'middle'; ax.lineCap = 'round'; ax.lineJoin = 'round';
    // F-row glyphs as simple strokes (brightness, mission control, spotlight, dictation, focus, media, volume)
    function glyph(n, cx, cy, s) {
      var i, a;
      ax.lineWidth = s * 0.11;
      function sun(r, r0, r1) {
        ax.beginPath(); ax.arc(cx, cy, r, 0, Math.PI * 2); ax.stroke();
        for (i = 0; i < 8; i++) { a = i * Math.PI / 4; ax.beginPath(); ax.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ax.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ax.stroke(); }
      }
      function tri(x0, dir, w, h) { ax.beginPath(); ax.moveTo(x0, cy - h); ax.lineTo(x0 + dir * w, cy); ax.lineTo(x0, cy + h); ax.closePath(); ax.fill(); }
      function speaker(waves) {
        var x0 = cx - s * 0.62;
        ax.beginPath(); ax.moveTo(x0, cy - s * 0.18); ax.lineTo(x0 + s * 0.2, cy - s * 0.18); ax.lineTo(x0 + s * 0.48, cy - s * 0.44);
        ax.lineTo(x0 + s * 0.48, cy + s * 0.44); ax.lineTo(x0 + s * 0.2, cy + s * 0.18); ax.lineTo(x0, cy + s * 0.18); ax.closePath(); ax.fill();
        for (i = 1; i <= waves; i++) { ax.beginPath(); ax.arc(x0 + s * 0.46, cy, s * (0.2 + i * 0.2), -Math.PI / 4, Math.PI / 4); ax.stroke(); }
      }
      switch (n) {
        case 1: sun(s * 0.2, s * 0.36, s * 0.48); break;
        case 2: sun(s * 0.26, s * 0.42, s * 0.62); break;
        case 3: for (i = 0; i < 9; i++) { ax.beginPath(); ax.roundRect(cx - s * 0.5 + (i % 3) * s * 0.36, cy - s * 0.4 + Math.floor(i / 3) * s * 0.3, s * 0.28, s * 0.22, s * 0.04); ax.fill(); } break;
        case 4: ax.beginPath(); ax.arc(cx - s * 0.08, cy - s * 0.08, s * 0.3, 0, Math.PI * 2); ax.stroke();
          ax.beginPath(); ax.moveTo(cx + s * 0.14, cy + s * 0.14); ax.lineTo(cx + s * 0.44, cy + s * 0.44); ax.stroke(); break;
        case 5: ax.beginPath(); ax.roundRect(cx - s * 0.13, cy - s * 0.5, s * 0.26, s * 0.58, s * 0.13); ax.fill();
          ax.beginPath(); ax.arc(cx, cy - s * 0.05, s * 0.3, 0.1, Math.PI - 0.1); ax.stroke();
          ax.beginPath(); ax.moveTo(cx, cy + s * 0.25); ax.lineTo(cx, cy + s * 0.45); ax.stroke(); break;
        case 6: ax.beginPath(); ax.arc(cx, cy, s * 0.4, 0, Math.PI * 2); ax.fill();
          ax.save(); ax.globalCompositeOperation = 'destination-out'; ax.beginPath(); ax.arc(cx + s * 0.2, cy - s * 0.14, s * 0.36, 0, Math.PI * 2); ax.fill(); ax.restore(); break;
        case 7: tri(cx, -1, s * 0.42, s * 0.28); tri(cx + s * 0.42, -1, s * 0.42, s * 0.28); break;
        case 8: tri(cx - s * 0.5, 1, s * 0.46, s * 0.3); ax.fillRect(cx + s * 0.12, cy - s * 0.3, s * 0.12, s * 0.6); ax.fillRect(cx + s * 0.34, cy - s * 0.3, s * 0.12, s * 0.6); break;
        case 9: tri(cx - s * 0.42, 1, s * 0.42, s * 0.28); tri(cx, 1, s * 0.42, s * 0.28); break;
        case 10: speaker(0); break;
        case 11: speaker(1); break;
        case 12: speaker(3); break;
      }
    }
    var cx0 = 0, cy0 = 0, cells = [];
    keys.forEach(function (k, i) {
      var cw = Math.round(CH_PX * k.w / k.d);
      if (cx0 + cw > ATW) { cx0 = 0; cy0 += CH_PX + 6; }
      var c = { x: cx0, y: cy0, w: cw, h: CH_PX };
      cells.push(c); cx0 += cw + 6;
      var L = legends[i] || '', h = c.h, pad = h * 0.16;
      function txt(t, px, x, y, align, weight) {
        ax.font = (weight || 400) + ' ' + Math.round(px) + 'px ' + FONT;
        ax.textAlign = align; ax.fillText(t, x, y);
      }
      if (Array.isArray(L)) {
        var right = /\>$/.test(L[1]), word = L[1].replace('>', '');
        if (word.length > 2) {                       // modifier: symbol top, word bottom
          txt(L[0], h * 0.2, right ? c.x + pad : c.x + c.w - pad, c.y + pad + h * 0.08, right ? 'left' : 'right');
          txt(word, h * 0.15, right ? c.x + c.w - pad : c.x + pad, c.y + h - pad - h * 0.05, right ? 'right' : 'left');
        } else {                                     // stacked symbol pair
          txt(L[0], h * 0.2, c.x + c.w / 2, c.y + h * 0.33, 'center');
          txt(L[1], h * 0.2, c.x + c.w / 2, c.y + h * 0.66, 'center');
        }
      } else if (L === 'touchid') {
        // Touch ID: a flat cap framed by a thin polished ring just inside its edge
        ax.globalAlpha = 0.3; ax.lineWidth = h * 0.022;
        ax.beginPath(); ax.roundRect(c.x + h * 0.06, c.y + h * 0.06, c.w - h * 0.12, h * 0.88, h * 0.1); ax.stroke();
        ax.globalAlpha = 1;
      } else if (L.length === 1) {
        txt(L, /[▲▶▼◀]/.test(L) ? h * 0.3 : h * 0.26, c.x + c.w / 2, c.y + h / 2, 'center');
      } else if (/^F\d/.test(L)) {
        glyph(parseInt(L.slice(1), 10), c.x + c.w / 2, c.y + h * 0.37, h * 0.3);
        txt(L, h * 0.14, c.x + c.w / 2, c.y + h * 0.78, 'center');
      } else if (L) {
        var r2 = /\>$/.test(L), w2 = L.replace('>', '');
        txt(w2, h * 0.15, r2 ? c.x + c.w - pad : c.x + pad, c.y + h - pad - h * 0.05, r2 ? 'right' : 'left');
      }
    });
    var legendTex = new THREE.CanvasTexture(atlas);
    legendTex.colorSpace = THREE.NoColorSpace; legendTex.anisotropy = 16; legendTex.minFilter = THREE.LinearMipmapLinearFilter;
    // keys: ONE merged mesh with the real key widths baked in (the old 9-slice vertex trick was invisible
    // to GTAO's normal/depth pass and to the contact-shadow depth pass, which use override materials)
    var kp = keyGeo.attributes.position, kn = keyGeo.attributes.normal, kix = keyGeo.index.array, nV = kp.count, nK = keys.length;
    var kPos = new Float32Array(nV * nK * 3), kNor = new Float32Array(nV * nK * 3), kLeg = new Float32Array(nV * nK * 4);
    var kLuv = new Float32Array(nV * nK * 2), kKY = new Float32Array(nV * nK), kIdx = new Uint32Array(kix.length * nK);
    var keyY = T - wellDepth + 0.075;
    keys.forEach(function (k, i) {
      var ex = (k.w - kW0) / 2, ez = (k.d - kD0) / 2, hx = kW0 / 2 + ex, hz = kD0 / 2 + ez, c = cells[i], o = i * nV, v;
      var L0 = c.x / ATW, L1 = 1 - (c.y + c.h) / ATH, L2 = (c.x + c.w) / ATW, L3 = 1 - c.y / ATH;
      for (v = 0; v < nV; v++) {
        var px = kp.getX(v), py = kp.getY(v), pz = kp.getZ(v);
        var x = px + Math.sign(px) * ex, z = pz + Math.sign(pz) * ez, q = o + v;
        kPos[q * 3] = k.x + x; kPos[q * 3 + 1] = keyY + py; kPos[q * 3 + 2] = k.z + z;
        kNor[q * 3] = kn.getX(v); kNor[q * 3 + 1] = kn.getY(v); kNor[q * 3 + 2] = kn.getZ(v);
        kLeg[q * 4] = L0; kLeg[q * 4 + 1] = L1; kLeg[q * 4 + 2] = L2; kLeg[q * 4 + 3] = L3;
        kLuv[q * 2] = (x + hx) / (2 * hx); kLuv[q * 2 + 1] = 1 - (z + hz) / (2 * hz);
        kKY[q] = py / kT;
      }
      for (v = 0; v < kix.length; v++) kIdx[i * kix.length + v] = kix[v] + o;
    });
    var keysGeo = new THREE.BufferGeometry();
    keysGeo.setAttribute('position', new THREE.BufferAttribute(kPos, 3));
    keysGeo.setAttribute('normal', new THREE.BufferAttribute(kNor, 3));
    keysGeo.setAttribute('aLegend', new THREE.BufferAttribute(kLeg, 4));
    keysGeo.setAttribute('aLuv', new THREE.BufferAttribute(kLuv, 2));
    keysGeo.setAttribute('aKeyY', new THREE.BufferAttribute(kKY, 1));
    keysGeo.setIndex(new THREE.BufferAttribute(kIdx, 1));
    keysGeo.computeBoundingSphere();
    keyGeo.dispose();
    var kMesh = new THREE.Mesh(keysGeo, M.key);
    var legendU = { value: legendTex }, backlightU = { value: 0 };
    M.key.userData.uBacklight = backlightU;
    M.key.onBeforeCompile = function (sh) {
      sh.uniforms.uLegend = legendU;
      sh.uniforms.uBacklight = backlightU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aLegend;\nattribute vec2 aLuv;\nattribute float aKeyY;\nvarying vec2 vLegUv;\nvarying vec2 vKeyUv;\nvarying float vTop;\nvarying float vKeyY;\nvarying vec3 vDishX;\nvarying vec3 vDishZ;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'vLegUv = mix(aLegend.xy, aLegend.zw, aLuv);',
          'vKeyUv = aLuv;',
          'vTop = smoothstep(0.97, 0.995, normal.y);',
          'vKeyY = aKeyY;',
          // view-space object axes for the fragment dish
          'vDishX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));',
          'vDishZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));'
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uLegend;\nuniform float uBacklight;\nvarying vec2 vLegUv;\nvarying vec2 vKeyUv;\nvarying float vTop;\nvarying float vKeyY;\nvarying vec3 vDishX;\nvarying vec3 vDishZ;')
        // laser-etched legend: the paint window reads light grey (#9a9a9e) on the matte cap
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat legA = texture2D(uLegend, vLegUv).a * vTop;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32), legA * 0.9 * (1.0 - 0.5 * uBacklight));')
        // polished edge band: the cap edge is smoother than the top, so it catches the front strip
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(0.55, 1.0, vTop);')
        // shallow concave dish: the top-face normal tilts toward the key centre
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (vDishX * (0.5 - vKeyUv.x) * 2.0 + vDishZ * (vKeyUv.y - 0.5) * 2.0) * 0.045 * vTop);')
        // backlight through the legend windows (peek / screen-on moments only)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uBacklight * legA * vec3(1.0, 0.98, 0.95) * 0.35;')
        // base AO: the cap side darkens toward the well floor (the gap between keys is a deep slot)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nfloat kAO = mix(0.3, 1.0, smoothstep(0.0, 0.8, vKeyY));\nreflectedLight.indirectDiffuse *= kAO;\nreflectedLight.indirectSpecular *= mix(0.45, 1.0, kAO);\nreflectedLight.directDiffuse *= kAO;\nreflectedLight.directSpecular *= kAO;');
    };
    M.key.customProgramCacheKey = function () { return 'mbp14-key3'; };
    kMesh.name = 'keys';
    base.add(kMesh);

    /* ---------- lid (pivot group rotates about x: rotation.x = -theta) ---------- */
    var pivot = new THREE.Group();
    pivot.position.set(0, DIM.pivotY, DIM.pivotZ);
    model.add(pivot);
    var y0 = DIM.lidGap, LT = DIM.lidT, lro = 0.2, lri = 0.05;
    var lz0 = -DIM.D / 2 - DIM.pivotZ;            // -0.4 (back edge, local)
    var lidCZ = lz0 + DIM.D / 2;                   // 10.66
    var lidOut = rrOutline(DIM.W, DIM.D, DIM.R, 20, 0, lidCZ);
    var lidEdge = arc([], lro, y0 + LT - lro, lro, Math.PI / 2, 0, 10);
    var lidSide = [{ d: 0, y: y0 + LT - lro, nx: 1, ny: 0 }, { d: 0, y: y0 + lri, nx: 1, ny: 0 }];
    arc(lidSide, lri, y0 + lri, lri, 0, -Math.PI / 2, 4);
    add('edge', sweep(lidOut, lidEdge));
    add('lidSide', sweep(lidOut, lidSide));
    add('shell', capUp(rrShape(DIM.W - 2 * lro, DIM.D - 2 * lro, DIM.R - lro, 0, lidCZ, true), y0 + LT, 24));
    add('shell', capDown(rrShape(DIM.W - 2 * lri, DIM.D - 2 * lri, DIM.R - lri, 0, lidCZ, false), y0, 20));
    // lid side: seam AO toward the gap (the end of the profile)
    var lidL = (LT - lro - lri) + lri * Math.PI / 2;
    var lidAO = rampTex(64, function (v) { var cm = (1 - v) * lidL; return 1 - 0.3 * Math.exp(-cm / 0.07); });
    lidAO.repeat.set(0, 1 / lidL); lidAO.offset.set(0.5, 0);
    M.lidSide.aoMap = lidAO; M.lidSide.aoMapIntensity = 1;
    // black gasket in the 0.03 lid gap, 0.02 in from the rim: the seam reads as a real gap, not a grey line
    add('gasket', sweep(rrOutline(DIM.W - 0.04, DIM.D - 0.04, DIM.R - 0.02, 20, 0, lidCZ), [{ d: 0, y: y0, nx: 1, ny: 0 }, { d: 0, y: 0.004, nx: 1, ny: 0 }]));
    // black glass bezel 30.6 x 21.5 with a thin lip
    var gy = y0 - 0.012, gR = DIM.R - (DIM.W - DIM.glassW) / 2;
    add('glass', capDown(rrShape(DIM.glassW, DIM.glassD, gR, 0, lidCZ, false), gy, 24));
    add('glass', sweep(rrOutline(DIM.glassW, DIM.glassD, gR, 12, 0, lidCZ), [{ d: 0, y: gy, nx: 1, ny: 0 }, { d: 0, y: y0 + 0.001, nx: 1, ny: 0 }]));
    var lidMats = { edge: M.edge, lidSide: M.lidSide, shell: M.shell, glass: M.glass, gasket: M.dark };
    var lid = new THREE.Group(); pivot.add(lid);
    Object.keys(buckets).forEach(function (k) { var mm = new THREE.Mesh(merge(buckets[k]), lidMats[k]); mm.name = 'lid-' + k; lid.add(mm); });
    buckets = {};

    // display: active area centred 11.2 from the pivot, rounded top corners
    var sw = DIM.scrW, sh = DIM.scrH, sTop = DIM.scrC + sh / 2, sBot = DIM.scrC - sh / 2, sr = 0.55;
    var scr = new THREE.Shape();
    scr.moveTo(-sw / 2, sBot); scr.lineTo(sw / 2, sBot); scr.lineTo(sw / 2, sTop - sr);
    scr.absarc(sw / 2 - sr, sTop - sr, sr, 0, Math.PI / 2, false);
    scr.lineTo(-sw / 2 + sr, sTop);
    scr.absarc(-sw / 2 + sr, sTop - sr, sr, Math.PI / 2, Math.PI, false);
    scr.lineTo(-sw / 2, sBot);
    var scrGeo = new THREE.ShapeGeometry(scr, 12), sp = scrGeo.attributes.position, su = scrGeo.attributes.uv;
    for (var i = 0; i < sp.count; i++) su.setXY(i, (sp.getX(i) + sw / 2) / sw, (sp.getY(i) - sBot) / sh);
    scrGeo.rotateX(Math.PI / 2); scrGeo.translate(0, gy - 0.0015, 0);
    var screen = new THREE.Mesh(scrGeo, M.screen);
    screen.name = 'screen';
    lid.add(screen);
    // notch as black-glass geometry (2.6 x 0.8, 0.14 corner radii), glossier than the AR-coated panel
    var nw = 2.6, nh = 0.8, nr = 0.14, notch = new THREE.Shape();
    notch.moveTo(-nw / 2, sTop + 0.05); notch.lineTo(-nw / 2, sTop - nh + nr);
    notch.absarc(-nw / 2 + nr, sTop - nh + nr, nr, Math.PI, Math.PI * 1.5, false);
    notch.lineTo(nw / 2 - nr, sTop - nh);
    notch.absarc(nw / 2 - nr, sTop - nh + nr, nr, Math.PI * 1.5, Math.PI * 2, false);
    notch.lineTo(nw / 2, sTop + 0.05); notch.lineTo(-nw / 2, sTop + 0.05);
    var notchMesh = new THREE.Mesh(tf(new THREE.ShapeGeometry(notch, 8), function (g) { g.rotateX(Math.PI / 2); g.translate(0, gy - 0.0025, 0); }), M.glass);
    lid.add(notchMesh);
    // camera: deep blue-black lens with a violet-grey coated ring, ambient-light sensor to its left
    var lensZ = sTop - 0.4;
    var lens = new THREE.Mesh(tf(new THREE.CircleGeometry(0.09, 32), function (g) {
      g.rotateX(Math.PI / 2); g.translate(0, gy - 0.004, lensZ);
      // a domed front element: normals tilt out to ~35 deg at the rim, so the lens prints a small curved
      // highlight from the front strip instead of mirroring the void as a flat black disc
      var P = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3();
      for (var i = 0; i < P.count; i++) { v.set(P.getX(i) * 7.8, -1, (P.getZ(i) - lensZ) * 7.8).normalize(); N.setXYZ(i, v.x, v.y, v.z); }
    }), M.lens);
    lid.add(lens);
    var lensRing = new THREE.Mesh(tf(new THREE.RingGeometry(0.09, 0.105, 40), function (g) { g.rotateX(Math.PI / 2); g.translate(0, gy - 0.0035, lensZ); }), M.lensRing);
    lid.add(lensRing);
    var als = new THREE.Mesh(tf(new THREE.CircleGeometry(0.02, 16), function (g) { g.rotateX(Math.PI / 2); g.translate(-0.35, gy - 0.0035, lensZ); }), M.lens);
    lid.add(als);
    // chin wordmark
    var chin = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.3375), M.chin);
    chin.rotation.set(Math.PI / 2, 0, 0);
    chin.position.set(0, gy - 0.002, (sBot + (lidCZ - DIM.glassD / 2)) / 2);
    lid.add(chin);

    /* ---------- lid specular occlusion (base-top materials) ----------
     * The studio is an environment map: it has no idea the lid is there. With the lid nearly closed (the
     * peek, the first degrees of the opening) the deck, keys and trackpad would mirror the rear softbox
     * straight through the lid and read as bright Silver. Each fragment traces its reflection ray against the
     * lid's underside plane (hinge line + lid direction, base space) and, where it hits the lid, keeps only a
     * black-glass sliver of the environment. Faded out as the lid opens past ~40 deg, where the art-directed
     * studio gradient on the deck is kept (uLidOcc.x = sin, .y = cos, .z = strength). */
    var lidOccU = { uViewToBase: { value: new THREE.Matrix4() }, uLidOcc: { value: new THREE.Vector4(0, 1, 0, 0) } };
    var LIDOCC_GLSL = [
      '#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )',
      'if ( uLidOcc.z > 0.001 ) {',
      '  vec3 loP = ( uViewToBase * vec4( - vViewPosition, 1.0 ) ).xyz;',
      '  vec3 loR = normalize( ( uViewToBase * vec4( reflect( - geometryViewDir, normal ), 0.0 ) ).xyz );',
      '  vec3 loL = vec3( 0.0, uLidOcc.x, uLidOcc.y ), loN = vec3( 0.0, uLidOcc.y, - uLidOcc.x );',
      '  vec3 loH = vec3( 0.0, ' + DIM.pivotY.toFixed(3) + ', ' + DIM.pivotZ.toFixed(3) + ' );',
      '  float loD = dot( loR, loN );',
      '  float loT = dot( loH - loP, loN ) / ( abs( loD ) < 1e-4 ? 1e-4 : loD );',
      '  vec3 loQ = loP + loR * loT;',
      '  float loS = dot( loQ - loH, loL );',
      // soft edges: the lid's front edge and sides, widened for rough surfaces (a blurred reflection)
      '  float loW = 0.6 + 4.0 * roughnessFactor;',
      '  float loOcc = step( 0.0, loT ) * smoothstep( 21.7 + loW, 21.7 - loW, loS ) * smoothstep( -1.0, 0.0, loS )',
      '    * smoothstep( 15.6 + loW, 15.6 - loW, abs( loQ.x ) ) * uLidOcc.z;',
      '  float loK = 1.0 - 0.94 * loOcc;',
      '  radiance *= loK;',
      '  #ifdef USE_CLEARCOAT',
      '  clearcoatRadiance *= loK;',
      '  #endif',
      '  iblIrradiance *= 1.0 - 0.6 * loOcc;',
      '}',
      '#endif'].join('\n');
    [M.deck, M.trackpad, M.key, M.well, M.wellFloor, M.grille, M.hinge].forEach(function (m) {
      hook(m, 'lidocc', function (sh) {
        sh.uniforms.uViewToBase = lidOccU.uViewToBase; sh.uniforms.uLidOcc = lidOccU.uLidOcc;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform mat4 uViewToBase;\nuniform vec4 uLidOcc;')
          .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + LIDOCC_GLSL);
      });
    });

    return {
      lidOcc: lidOccU,
      model: model, base: base, pivot: pivot, lid: lid, screen: screen, keys: kMesh, M: M,
      local: { screenY: gy - 0.0015 }
    };
  }

  /* ---------------------------------------------------------------------------
   * 4. STUDIO: lightformer layouts for RenderKit.createStudio (LOOKDEV-BRIEF 4.1)
   * The env is CAMERA-LOCKED (renderFrame sets yaw = camera azimuth + 10 deg), so az 0 = behind the lens
   * and az 180 = behind the product, whatever the pose. 'fall' panels are graded softboxes: radiance
   * I (1-u^2)^fu (1-v^2)^fv, x [bottom, top] gv. A flat face mirrors their FALLOFF, which is the long
   * gradient real product photography shows; flat uniform boxes (the old studio) mirror as a room.
   * ------------------------------------------------------------------------- */
  function lf(n, w, h, az, el, I, fu, fv, gv) { return { n: n, s: 'fall', w: w, h: h, az: az, el: el, d: 30, I: I, fall: [fu, fv], gv: gv || [1, 1] }; }
  var STUDIO = {
    // black void: hero, #material, Space Black finish, finale. No warm kicker (it read as a stain).
    dark: {
      dome: { zenith: 0.029, horizon: 0.018, nadir: 0.012, zExp: 1.0, nExp: 0.4, hot: 0 },
      exposure: 1, background: '#060607', floor: [0.012, 0.012, 0.012],
      panels: [
        lf('keyTop', 34, 22, 0, 78, 5.0, 1.2, 1.2),            // chamfer lines on up-facing edges, top-down sheen
        lf('rearSky', 44, 10, 225, 9, 2.0, 1.6, 0, [1, 0.08]), // closed-lid sweep: the lid mirrors its falloff
        lf('rearHigh', 44, 22, 205, 30, 2.6, 1.8, 1.0),         // deck / trackpad gradient at 3/4 views
        // (width falloff .6: a hard-edged strip printed an 80 px dash with a hard end on the bezel side wall)
        lf('stripL', 1.8, 30, -100, 14, 9.0, 0.6, 0.7),        // long vertical glint on side walls + bezel edge
        lf('stripR', 1.8, 30, 112, 14, 7.0, 0.6, 0.7),
        lf('rimBack', 56, 0.9, 180, 1.5, 10.0, 0.8, 0),        // thin horizon line: silhouette + top-edge line
        // the open deck's mirror direction on the right at 3/4 views: without it the deck's right half fell
        // to 5-10 luma, darker than the page, and the silhouette dissolved (T4 now 52 / 66)
        lf('rearFill', 50, 22, 150, 28, 0.8, 2.4, 1.2),
        lf('frontStrip', 44, 1.4, 0, 24, 4.0, 0.8, 0),         // keycap front edges, front chamfers
        lf('frontLow', 48, 4, 0, 5, 1.8, 1.0, 0),              // front walls: soft horizontal gradient
        // a pale card on the table in front of the laptop: vertical front walls (base, closed lid) look DOWN
        // into it (el -17 after box projection), so they print a soft gradient instead of a black slab
        // (off-axis at -30 deg with a steep width falloff, I 6: centred behind the lens at 2.4, the walls
        // mirrored its flat middle and read as 22-35 luma slabs; now they run ~70 -> 10 across their length)
        lf('frontFloor', 60, 16, -30, -18, 6.0, 2.0, 0.6, [0.3, 1])
      ]
    },
    // paper: Silver on #f2f1ee. Darker room than a white cyc (a bright surround integrates to one flat
    // tone on bead-blasted silver) + narrower keyTop + a black flag so the deck mirrors a light-to-dark edge.
    paper: {
      dome: { zenith: 0.60, horizon: 0.38, nadir: 0.34, zExp: 1.0, nExp: 0.4, hot: 0 },
      exposure: 1, background: '#f2f1ee', floor: [0.34, 0.34, 0.34],
      panels: [
        { n: 'flag', s: 'flag', w: 30, h: 20, az: 160, el: 25, d: 29, I: 0 },
        lf('keyTop', 36, 24, 0, 78, 6.0, 2.0, 2.0),
        lf('rearSky', 52, 12, 180, 10, 3.0, 0.8, 0, [1, 0.3]),
        lf('rearHigh', 36, 16, 205, 40, 2.4, 1.8, 1.0),
        lf('stripL', 2.2, 30, -100, 14, 8.0, 0, 0.7),
        lf('stripR', 2.2, 30, 112, 14, 6.0, 0, 0.7),
        lf('frontStrip', 44, 1.4, 0, 24, 4.0, 0.8, 0),
        lf('frontLow', 48, 6, 0, 5, 1.6, 1.0, 0)
      ]
    }
  };
  var ENV_YAW = 10 * DEG;
  // box-projected reflections (per material): the softboxes sit ~1 m away instead of at infinity, so a
  // flat deck or lid mirrors a gradient that slides as the laptop turns
  var BOX = { center: [0, 20, 0], halfSize: [90, 60, 90], amount: 1 };

  /* fallback studio (RenderKit missing): procedural softboxes -> PMREM once */
  /* 4b. (fallback)
   * ------------------------------------------------------------------------- */
  function buildStudioEnv(THREE, renderer) {
    var sc = new THREE.Scene();
    function panel(w, h, intensity, color, pos, look) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(new THREE.Vector3(look ? look[0] : 0, look ? look[1] : 0, look ? look[2] : 0));
      sc.add(m);
    }
    // graded dome: lifted upper hemisphere, dark floor, so dark anodising always has a gradient to show
    var dome = new THREE.SphereGeometry(40, 32, 16), cols = [], pa = dome.attributes.position;
    for (var i = 0; i < pa.count; i++) {
      var yy = pa.getY(i) / 40, zz = pa.getZ(i) / 40;
      var v = yy > 0 ? 0.07 + 0.26 * Math.pow(yy, 0.8) + 0.06 * Math.max(0, -zz) : 0.035 + 0.05 * (1 + yy);
      // a pale table sweep in front of the laptop: a lid turned to face the lens mirrors it instead of a
      // black void (Silver dragged round in #finish otherwise read as black anodising)
      if (yy <= 0 && zz > 0) v += 0.5 * zz * zz * (1 - 0.45 * Math.abs(yy));
      cols.push(v, v, v * 1.04);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sc.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    panel(22, 14, 2.4, 0xffffff, [0, 17, 0]);                  // overhead softbox
    panel(40, 5, 1.7, 0xffffff, [0, 5, -22], [0, 2, 0]);      // graduated rear "sky"
    panel(40, 6, 1.15, 0xffffff, [0, 11, -19], [0, 2, 0]);
    panel(40, 6, 0.7, 0xf4f6ff, [0, 16, -13], [0, 2, 0]);
    panel(2.4, 18, 4.5, 0xffffff, [-17, 5, 5], [0, 2, 0]);    // side strips (~ +-70 deg)
    panel(2.4, 18, 3.8, 0xffffff, [17, 5, -3], [0, 2, 0]);
    panel(1.6, 14, 3.0, 0xffffff, [-13, 6, -15], [0, 2, 0]);  // rear rim strips: silhouette edges
    panel(1.6, 14, 3.0, 0xffffff, [13, 6, -15], [0, 2, 0]);
    panel(34, 1.4, 4.0, 0xffffff, [0, 12, 17]);               // long front-top strip
    panel(28, 1.0, 1.6, 0xffffff, [0, 2.5, 20]);              // low front strip: lid-edge line
    panel(9, 4, 1.0, 0xffe7cf, [-10, 2, -16], [0, 2, 0]);     // warm rear kicker
    var pm = new THREE.PMREMGenerator(renderer);
    var rt = pm.fromScene(sc, 0.02);
    pm.dispose();
    sc.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt.texture;
  }

  /* ---------------------------------------------------------------------------
   * 5. SCREEN CONTENT: 2048 x 1330 "dusk die" wallpaper + menu bar + sentence
   * ------------------------------------------------------------------------- */
  function paintScreen(THREE) {
    var CW = 2048, CH = 1330;
    var c = DOC.createElement('canvas'); c.width = CW; c.height = CH;
    var x = c.getContext('2d');
    // sky: #0B0D10 -> #2C2B2E -> horizon glow #E9B98A
    var g = x.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#0B0D10'); g.addColorStop(0.46, '#1d1c20'); g.addColorStop(0.7, '#2C2B2E');
    g.addColorStop(0.86, '#8d6f55'); g.addColorStop(0.93, '#E9B98A'); g.addColorStop(1, '#c69a73');
    x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    // horizon bloom
    var hg = x.createRadialGradient(CW * 0.5, CH * 0.95, 0, CW * 0.5, CH * 0.95, CW * 0.6);
    hg.addColorStop(0, 'rgba(242,205,160,0.55)'); hg.addColorStop(0.4, 'rgba(233,185,138,0.18)'); hg.addColorStop(1, 'rgba(233,185,138,0)');
    x.fillStyle = hg; x.fillRect(0, 0, CW, CH);
    // thin-film bands (copper / teal, alpha <= .18)
    function band(y0, amp, freq, ph, th, col, al) {
      var i, u, yy;
      x.beginPath();
      for (i = 0; i <= 64; i++) { u = i / 64; yy = CH * y0 + Math.sin(u * Math.PI * 2 * freq + ph) * CH * amp + Math.sin(u * 7.1 + ph * 2) * CH * amp * 0.25; if (i) x.lineTo(u * CW, yy); else x.moveTo(0, yy); }
      for (i = 64; i >= 0; i--) { u = i / 64; yy = CH * (y0 + th) + Math.sin(u * Math.PI * 2 * freq + ph + 0.6) * CH * amp; x.lineTo(u * CW, yy); }
      x.closePath();
      var lg = x.createLinearGradient(0, CH * (y0 - amp), 0, CH * (y0 + th + amp));
      lg.addColorStop(0, 'rgba(' + col + ',0)'); lg.addColorStop(0.5, 'rgba(' + col + ',' + al + ')'); lg.addColorStop(1, 'rgba(' + col + ',0)');
      x.fillStyle = lg; x.fill();
    }
    x.globalCompositeOperation = 'screen';
    band(0.2, 0.05, 0.8, 0.4, 0.14, '184,116,63', 0.16);
    band(0.3, 0.06, 1.1, 2.2, 0.12, '47,111,106', 0.18);
    band(0.56, 0.05, 0.9, 4.1, 0.1, '184,116,63', 0.12);
    band(0.64, 0.04, 1.3, 1.3, 0.09, '47,111,106', 0.14);
    x.globalCompositeOperation = 'source-over';
    // faint 5 x 2 tile grid (the GPU cores)
    var gw = CW * 0.62, gh = CH * 0.34, gx0 = (CW - gw) / 2, gy0 = CH * 0.33, cw = gw / 5, ch = gh / 2;
    x.strokeStyle = 'rgba(245,245,247,0.05)'; x.lineWidth = 2;
    for (var r = 0; r < 2; r++) for (var k = 0; k < 5; k++) {
      x.beginPath(); x.roundRect(gx0 + k * cw + 8, gy0 + r * ch + 8, cw - 16, ch - 16, 10); x.stroke();
    }
    // dither against banding
    var img = x.getImageData(0, 0, CW, CH), d = img.data;
    for (var p = 0; p < d.length; p += 4) { var n = (Math.random() - 0.5) * 5; d[p] += n; d[p + 1] += n; d[p + 2] += n; }
    x.putImageData(img, 0, 0);
    // generic menu bar (12% white, no logos, no clock); height matches the notch
    var mb = 54;
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, 0, CW, mb);
    x.fillStyle = 'rgba(245,245,247,0.55)';
    var mx = 40, lw = [30, 64, 44, 44, 58, 50, 44];
    lw.forEach(function (w, i) { x.globalAlpha = i === 1 ? 0.8 : 0.5; x.beginPath(); x.roundRect(mx, mb / 2 - 7, w, 14, 4); x.fill(); mx += w + 26; });
    var rx = CW - 40;
    [40, 30, 30, 30].forEach(function (w) { rx -= w; x.globalAlpha = 0.5; x.beginPath(); x.roundRect(rx, mb / 2 - 7, w, 14, 4); x.fill(); rx -= 22; });
    x.globalAlpha = 1;
    // notch (black glass): 2.6 x 0.8 cm of a 30.05 x 19.52 cm panel
    var nw = CW * 2.6 / DIM.scrW, nh = CH * 0.8 / DIM.scrH, nr = 14;
    x.fillStyle = '#000';
    x.beginPath(); x.moveTo(CW / 2 - nw / 2 - nr, 0);
    x.arcTo(CW / 2 - nw / 2, 0, CW / 2 - nw / 2, nr, nr);
    x.lineTo(CW / 2 - nw / 2, nh - nr * 1.4); x.arcTo(CW / 2 - nw / 2, nh, CW / 2 - nw / 2 + nr * 1.4, nh, nr * 1.4);
    x.lineTo(CW / 2 + nw / 2 - nr * 1.4, nh); x.arcTo(CW / 2 + nw / 2, nh, CW / 2 + nw / 2, nh - nr * 1.4, nr * 1.4);
    x.lineTo(CW / 2 + nw / 2, nr); x.arcTo(CW / 2 + nw / 2, 0, CW / 2 + nw / 2 + nr, 0, nr);
    x.closePath(); x.fill();
    // the sentence the dive lands on (#brief opens on it)
    x.fillStyle = '#F5F5F7';
    x.font = '600 96px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
    try { x.letterSpacing = '-2.4px'; } catch (e) { /* older canvas */ }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 24;
    x.fillText('The change is inside the graphics.', CW / 2, CH / 2);
    x.shadowBlur = 0;
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  /* ---------------------------------------------------------------------------
   * 6. CONTACT SHADOW (baked 2D canvases, normal blending over --stage-bg)
   * ------------------------------------------------------------------------- */
  function shadowCanvas(THREE, blurPx, alpha, ellipse) {
    var c = DOC.createElement('canvas'); c.width = c.height = 512;
    var x = c.getContext('2d');
    x.filter = 'blur(' + blurPx + 'px)';
    x.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    x.beginPath();
    if (ellipse) x.ellipse(256, 256, 200, 70, 0, 0, Math.PI * 2);
    else x.roundRect(64, 64, 384, 384, 22);
    x.fill();
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  /* ---------------------------------------------------------------------------
   * 7. THE STAGE (renderer, scene, render loop)
   * ------------------------------------------------------------------------- */
  var R = null;          // { THREE, renderer, scene, camera, mac, ... } once booted
  var stageEl = null, canvasEl = null, fallbackEl = null;
  var failed = false;

  function showFallback(reason) {
    if (failed || R) return;
    failed = true;
    DOC.documentElement.classList.add('no-webgl');
    if (fallbackEl) fallbackEl.hidden = false;
    emitWhenReady('webgl:unsupported', { module: 'mac' });
    if (reason && W.console && console.info) console.info('[macbook] fallback: ' + reason);
  }

  function hasWebGL() {
    try {
      var c = DOC.createElement('canvas');
      return !!(W.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
    } catch (e) { return false; }
  }

  var BOOT = { t0: 0 };
  function bmark(k) { BOOT[k] = Math.round(performance.now() - BOOT.t0); }
  function boot(THREE, ADDONS) {
    if (R || failed) return;
    BOOT.t0 = performance.now(); BOOT.at = Math.round(BOOT.t0);
    if (!canvasEl) return;
    if (!hasWebGL()) { showFallback('no webgl'); return; }
    // RenderKit present: the post pipeline owns anti-aliasing (MSAA x4 HalfFloat scene target + still-frame
    // accumulation), so the default framebuffer only receives fullscreen passes and needs no MSAA
    var RK = W.RenderKit && W.RenderKit.createPipeline && W.RenderKit.createStudio ? W.RenderKit : null;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: !RK, alpha: true, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { showFallback('renderer'); return; }
    if (!renderer.getContext()) { showFallback('context'); return; }
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = state.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    var dpr = Math.min(W.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
    renderer.setPixelRatio(dpr);

    var scene = new THREE.Scene(), envTex = null, envPaper = null, studios = [];
    if (RK) {
      try {
        // two lightformer studios baked once (HalfFloat PMREM 512), crossfaded per material as the stage
        // goes from void to paper, so the Silver switch never pops
        var sDark = RK.createStudio(renderer, { THREE: THREE, preset: STUDIO.dark, size: 512 });
        var sPaper = RK.createStudio(renderer, { THREE: THREE, preset: STUDIO.paper, size: 512 });
        envTex = sDark.envMap; envPaper = sPaper.envMap;
        studios = [sDark, sPaper];
        if (sDark.release) { sDark.release(); sPaper.release(); }
      } catch (e) { envTex = envPaper = null; if (W.console) console.warn('[macbook] studio', e); }
    }
    if (!envTex) {
      try { envTex = buildStudioEnv(THREE, renderer); }
      catch (e) {
        if (ADDONS && ADDONS.RoomEnvironment) {
          var pm = new THREE.PMREMGenerator(renderer);
          envTex = pm.fromScene(new ADDONS.RoomEnvironment(), 0.04).texture; pm.dispose();
        }
      }
    }
    var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
    bmark('studio');
    var mac = buildMacBook(THREE);
    bmark('model');
    var screenTex = paintScreen(THREE);
    bmark('screen');
    mac.M.screen.emissiveMap = screenTex;
    // explicit envMap per material (envMapIntensity stays 1: the energy lives in the studio; envK is the
    // one studio-level dimmer for #material). Rotation is camera-locked, synced per frame.
    var envMats = [], envU = [];
    Object.keys(mac.M).forEach(function (k) {
      var m = mac.M[k];
      if (m && m.isMeshStandardMaterial && envTex && envMats.indexOf(m) < 0) {
        m.envMap = envTex; m.envMapIntensity = 1; envMats.push(m);
        if (RK && RK.patchEnv && envPaper) envU.push(RK.patchEnv(m, { THREE: THREE, blend: true, projection: USE_BOX ? BOX : null }));
      }
    });
    envU.forEach(function (u) { u.rkEnvB.value = envPaper; });

    // rig: yaw (drag + pointer + section) -> float/tilt -> model; shadows live on the yaw rig
    var rig = new THREE.Group(), floatG = new THREE.Group();
    rig.add(floatG); floatG.add(mac.model); scene.add(rig);

    // contact shadow: a depth-from-below render of the laptop, blurred, on the table plane. It only reads on
    // paper (black on the void is invisible; there the product is seated by light falloff, brief 4.3.7)
    var cshadow = null, shSoft = null, shHard = null, shHinge = null;
    if (RK && RK.contactShadow) {
      try {
        cshadow = RK.contactShadow(renderer, scene, mac.model, { THREE: THREE, width: 46, height: 36, resolution: 512, far: 1.6,
          blur: 5, darkness: 0.9, falloff: 1.6, opacity: 0.45, color: 0x1d1c1a });
        cshadow.mesh.position.y = 0.001;
        cshadow.mesh.visible = false;
        rig.add(cshadow.mesh);
      } catch (e) { cshadow = null; }
    }
    if (!cshadow) {
      var groundPlane = function (tex, w, d, y, z) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, depthWrite: false, toneMapped: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(0, y, z || 0); m.renderOrder = -1;
        rig.add(m);
        return m;
      };
      // 512 canvas, silhouette spans 384/512 = .75 of the plane
      shSoft = groundPlane(shadowCanvas(THREE, 18, 0.55), DIM.W / 0.75 * 1.08, DIM.D / 0.75 * 1.1, 0.002);
      shHard = groundPlane(shadowCanvas(THREE, 4, 0.5), DIM.W / 0.75 * 0.99, DIM.D / 0.75 * 0.99, 0.003);
      shHinge = groundPlane(shadowCanvas(THREE, 16, 1, true), 34, 34, 0.004, DIM.pivotZ - 1.2);
      shHinge.material.opacity = 0;
    }

    // lights: RectAreaLights only (sweep + screen spill)
    var sweepL = null, spill = null;
    if (ADDONS && ADDONS.RectAreaLightUniformsLib && THREE.RectAreaLight) {
      try {
        ADDONS.RectAreaLightUniformsLib.init();
        // sweep bar: 4 x 60 softbox travelling in x. It hangs behind and above the lid (35 cm up the
        // reflection path) so that from the low hero angle its mirror image streaks across the lid.
        sweepL = new THREE.RectAreaLight(0xffffff, 12, 5, 60);
        scene.add(sweepL);
        spill = new THREE.RectAreaLight(0xfff6ef, 0, DIM.scrW, DIM.scrH);
        spill.rotation.x = -Math.PI / 2;                           // local -z -> lid -y (screen normal)
        spill.position.set(0, mac.local.screenY - 0.05, DIM.scrC);
        mac.lid.add(spill);
      } catch (e) { sweepL = spill = null; }
    }

    R = {
      THREE: THREE, renderer: renderer, scene: scene, camera: camera, mac: mac, rig: rig, floatG: floatG,
      shSoft: shSoft, shHard: shHard, shHinge: shHinge, cshadow: cshadow, csKey: '', sweep: sweepL, spill: spill, dpr: dpr, dprMax: dpr,
      envMats: envMats, envU: envU, envMix: -1, envRotY: NaN, studios: studios, pipe: null, more: false, quality: 'high',
      frames: [], lastW: 0, lastH: 0, firstFrame: false, bornAt: performance.now(),
      cSB: new THREE.Color(0x2f2e31), cSV: new THREE.Color(0xcfd0d4), cEB: new THREE.Color(0x8a8990), cEV: new THREE.Color(0xdcdde0),
      tmp: new THREE.Color(), tmp2: new THREE.Color(), fwd: new THREE.Vector3(),
      vA: new THREE.Vector3(), vB: new THREE.Vector3(), vC: new THREE.Vector3(), vD: new THREE.Vector3(), vE: new THREE.Vector3()
    };
    W.__MACR = R;
    if (RK) {
      try {
        R.pipe = RK.createPipeline(renderer, scene, camera, {
          THREE: THREE, alpha: true, quality: PIPE_Q,
          // AO is baked into the model (deck, well, keys, seams); GTAO only refines the still frame
          aoMoving: false,
          ao: { radius: 1.2, thickness: 0.8, distanceExponent: 2.0, scale: 1.3, intensity: 0.9 },
          bloom: { strength: 0.15 },
          onQuality: function (q) { R.quality = q; emit('perf:quality', { module: 'mac', quality: q }); }
        });
      } catch (e) { R.pipe = null; if (W.console) console.warn('[macbook] pipeline', e); }
    }
    resize();
    applyFinishMaterials(state.finishMix);
    bmark('pipe');

    function first() {
      if (!R || R.firstFrame) return;
      // pre-compile the contact-shadow depth pass now, not on the first Silver frame (a visible hitch)
      if (R.cshadow) { try { R.scene.updateMatrixWorld(); R.cshadow.update(); } catch (e) { /* noop */ } }
      compose(0);
      renderFrame(true);
      R.firstFrame = true;
      MacScene.ready = true;
      bmark('first');
      // the curtain lifts on the film when there is one (its poster + keyframe pass), 2 s at most
      var sent = false, send = function () { if (sent) return; sent = true; emitWhenReady('mac:firstframe', {}); };
      if (HF.seq && !HF.drawn) { HF.seq.ready.then(function () { setTimeout(send, 0); }); setTimeout(send, 2000); } else send();
    }
    try {
      var p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : null;
      if (p && p.then) p.then(first, first); else first();
    } catch (e) { first(); }
  }
  var USE_BOX = !/[?&]box=0/.test(W.location.search);
  var PIPE_Q = (W.location.search.match(/[?&]q=(high|medium|low)/) || [0, 'auto'])[1];

  function resize() {
    if (!R) return;
    var w = (canvasEl && canvasEl.clientWidth) || W.innerWidth, h = (canvasEl && canvasEl.clientHeight) || W.innerHeight;
    if (w === R.lastW && h === R.lastH) return;
    R.lastW = w; R.lastH = h;
    if (R.pipe) R.pipe.setSize(w, h, R.dpr); else R.renderer.setSize(w, h, false);
    R.camera.aspect = w / Math.max(1, h);
    R.camera.updateProjectionMatrix();
    markDirty();
  }

  /* Finish materials (LOOKDEV-BRIEF 5.2, lab-tested). Space Black = a dark metal under a thin dielectric
   * seal coat (the coat lays neutral strip shapes over it); Silver = bright bead-blasted metal, no coat.
   * Chamfers are much smoother than the body so every edge prints one thin bright line. `rm` = the mean of
   * the bead-blast roughness map, so the values below are EFFECTIVE roughness. */
  var CC_MIN = 1e-3;
  function applyFinishMaterials(mix) {
    if (!R) return;
    var M = R.mac.M, c = R.tmp.copy(R.cSB).lerp(R.cSV, mix), ce = R.tmp2.copy(R.cEB).lerp(R.cEV, mix);
    var ek = R.envK == null ? 1 : R.envK;
    function body(m, r0, r1, cc0, ccr) {
      if (!m) return;
      m.color.copy(c); m.metalness = 1;
      m.roughness = lerp(r0, r1, mix) / (m.userData.rm || 1);
      // never exactly 0: crossing 0 flips USE_CLEARCOAT and recompiles every body material mid-tween
      m.clearcoat = Math.max(CC_MIN, lerp(cc0, 0, mix)); m.clearcoatRoughness = ccr;
      m.envMapIntensity = ek;
    }
    body(M.shell, 0.40, 0.30, 0.30, 0.28);
    body(M.deck, 0.40, 0.30, 0.15, 0.28);              // (coat .15: .30 laid a broad grey sheen over the deck)
    body(M.side, 0.34, 0.26, 0.30, 0.24);
    body(M.lidSide, 0.34, 0.26, 0.30, 0.24);
    body(M.trackpad, 0.32, 0.22, 0.15, 0.12);
    M.trackpad.clearcoat = lerp(0.15, 0.2, mix);       // (.35 read as a lighter pasted-on panel while moving)
    // (grille coat .08: on Space Black the white coat reflection IS the tone, and the grille carries no baked
    // deck AO, so at the deck's coat it read LIGHTER than the deck; the eye expects a darker perforated patch)
    if (M.grille) { body(M.grille, 0.42, 0.34, 0.08, 0.28); }
    M.edge.color.copy(ce); M.edge.metalness = 1;
    M.edge.roughness = lerp(0.14, 0.09, mix);
    M.edge.clearcoat = Math.max(CC_MIN, lerp(1.0, 0.0, mix)); M.edge.clearcoatRoughness = 0.06;
    M.edge.envMapIntensity = Math.sqrt(ek) * 1.15;
    // hinge barrel in the body finish (it was black)
    M.hinge.color.copy(c).multiplyScalar(lerp(0.8, 0.55, mix)); M.hinge.metalness = 0.9; M.hinge.roughness = lerp(0.3, 0.3, mix);
    M.hinge.clearcoat = Math.max(CC_MIN, lerp(0.2, 0, mix));
  }

  /* ---------------------------------------------------------------------------
   * 8. COMPOSE (every tick): active proxy + interaction -> state; DOM stage
   * ------------------------------------------------------------------------- */
  var lastStageOpacity = -1, lastHidden = null, lastBg = '', stageMix = 0, lastCovered = false;
  var VOID = [6, 6, 7], PAPER = [242, 241, 238];
  var tNow = 0;

  function scrollY() {
    var A = app();
    if (A && A.lenis && typeof A.lenis.scroll === 'number' && !isRM()) return A.lenis.scroll;
    return W.pageYOffset || DOC.documentElement.scrollTop || 0;
  }

  function pickRegion(y) {
    var heroEnd = ST.hero ? ST.hero.end : ST.v1 ? ST.v1.end : -1;
    if (heroEnd >= 0 && y <= heroEnd + 2) return 'hero';
    // without pins (reduced motion) the next still takes over once its section reaches mid-screen
    var off = isRM() ? W.innerHeight * 0.5 : 0;
    if (ST.finish && y + off < ST.finish.start) return 'material';
    if (ST.finale && y + off < ST.finale.start) return ST.finish ? 'finish' : 'material';
    if (ST.finale) return 'finale';
    return heroEnd >= 0 ? 'material' : region;
  }

  function compose(dt) {
    var y = scrollY();
    var newRegion = pickRegion(y);
    if (newRegion !== region) {
      region = newRegion; dirty = true;
      // reduced motion: stills swap with a 200ms crossfade
      if (isRM() && G()) { IX.fade = 0; G().to(IX, { fade: 1, duration: 0.2, ease: 'none', overwrite: true, onUpdate: markDirty }); }
    }
    var P = PX[region];

    // visibility (V1 / V2)
    var vis = true;
    if (ST.v1 || ST.v2) {
      var v1 = ST.v1 ? (y >= ST.v1.start - 2 && y <= ST.v1.end + 2) : false;
      var v2 = ST.v2 ? (y >= ST.v2.start - 2 && y <= ST.v2.end + 2) : false;
      vis = v1 || v2;
    }
    if (vis !== state.visible) { state.visible = vis; dirty = true; }

    // pointer lerp (lambda .06 @60fps)
    var k = 1 - Math.pow(1 - 0.06, Math.max(0.25, dt * 60));
    var calm = P.dive > 0 ? 1 - smooth(0, 0.15, P.dive) : 1;
    // the turntable film cannot follow the pointer: in #finish the parallax eases out while the camera moves in
    if (region === 'finish' && TF.enabled) calm = 0;
    var dTilt = IX.ptTiltT * calm - state.tiltX, dYaw = IX.ptYawT * calm - IX.ptYaw, dEnv = IX.envPT * calm - state.envRotPointer;
    if (Math.abs(dTilt) > 1e-4 || Math.abs(dYaw) > 1e-4 || Math.abs(dEnv) > 1e-4) {
      state.tiltX += dTilt * k; IX.ptYaw += dYaw * k; state.envRotPointer += dEnv * k; dirty = true;
    }

    // finish drag inertia
    if (!IX.dragging && Math.abs(IX.vDrag) > 1e-5) {
      state.dragY = clamp(state.dragY + IX.vDrag, -2.79, 2.79);
      IX.vDrag *= Math.pow(0.92, Math.max(0.25, dt * 60));
      if (Math.abs(IX.vDrag) < 1e-5) IX.vDrag = 0;
      dirty = true;
    }

    // compose section proxy
    var late = region === 'finish' || region === 'finale';
    state.lid = late ? P.lid * IX.lidUser : P.lid;
    state.rotY = P.rotY;
    state.envRot = P.envRot + IX.envFlick;
    state.sweepX = P.sweepX;
    state.screenOn = late ? P.screenOn * smooth(0.25, 0.7, IX.lidUser) : P.screenOn;
    state.exposure = P.exposure;
    // Silver hold: the Cycles turntable (Neutral view transform, like this renderer) reads darker than the
    // live Silver laptop (deck ~162 vs ~181 sRGB at the #finish hold). While the film is up, the live laptop
    // takes the film's exposure, so the dissolves (the fade in/out, the lid toggle, the swatch swap) don't flash
    // (eased in while the camera lands, p .3-.6, before the film dissolves in, and out with the film, p .95-1)
    if (TF.enabled && region === 'finish' && state.finishMix > 0) {
      var fpr = ST.finish && typeof ST.finish.progress === 'number' ? ST.finish.progress : 1;
      var fw = isRM() ? P.film : Math.min(smooth(0.3, 0.6, fpr), 1 - smooth(0.95, 1, fpr));
      state.exposure *= 1 - (1 - TT.silverExp) * state.finishMix * fw;
    }
    state.dive = P.dive;
    state.opacity = P.opacity * IX.fade;
    var c = state.cam, pc = P.cam;
    c.x = pc.x; c.y = pc.y; c.z = pc.z; c.tx = pc.tx; c.ty = pc.ty; c.tz = pc.tz; c.fov = pc.fov; c.fit = pc.fit; c.ox = pc.ox || 0; c.oy = pc.oy || 0;

    filmCompose(P);

    // DOM: stage opacity / visibility / bg
    if (stageEl) {
      // a film that fully covers the stage: the WebGL canvas hides (the --stage-bg stays) and stops rendering
      if (covered !== lastCovered) { stageEl.classList.toggle('is-covered', covered); lastCovered = covered; if (!covered) dirty = true; }
      var op = Math.round(state.opacity * 1000) / 1000;
      if (op !== lastStageOpacity) { stageEl.style.opacity = String(op); lastStageOpacity = op; }
      var hide = !state.visible;
      if (hide !== lastHidden) { stageEl.classList.toggle('is-hidden', hide); lastHidden = hide; }
      var m = region === 'hero' ? 0 : IX.bgMix;
      // lights down: a paper (Silver) studio fades back to void while #finale rises in, so the finale's
      // void spotlight never meets paper at a hard edge
      if (m > 0 && ST.finish && ST.finale && (region === 'finish' || region === 'finale')) {
        var fa = ST.finish.end, fb = ST.finale.start;
        m *= fb > fa + 1 ? 1 - smooth(fa, fb, y) : (y >= fb - W.innerHeight * 0.5 ? 0 : 1);
      }
      stageMix = m;
      var bg = 'rgb(' + Math.round(lerp(VOID[0], PAPER[0], m)) + ' ' + Math.round(lerp(VOID[1], PAPER[1], m)) + ' ' + Math.round(lerp(VOID[2], PAPER[2], m)) + ')';
      if (bg !== lastBg) { stageEl.style.setProperty('--stage-bg', bg); lastBg = bg; }
    }
  }

  /* ---------------------------------------------------------------------------
   * 9. RENDER (reads state only)
   * ------------------------------------------------------------------------- */
  function renderFrame(changed) {
    if (!R) return;
    var cam = R.camera, s = state, mac = R.mac, vA = R.vA, vB = R.vB, vC = R.vC;
    resize();

    // lid: section angle + peek (only while nearly closed)
    var peekAmt = s.peek * clamp((20 - s.lid) / 10, 0, 1);
    var lidDeg = s.lid + peekAmt;
    var th = lidDeg * DEG;
    mac.pivot.rotation.x = -th;
    // lid specular occlusion: base-space lid plane + view->base matrix (see buildMacBook)
    var lo = mac.lidOcc.uLidOcc.value, loK = 1 - smooth(25, 55, lidDeg);
    lo.set(Math.sin(th), Math.cos(th), lidDeg > 0.2 ? loK : 0, 0);

    // laptop rotation = rotY + dragY + pointer tilt. The idle float only runs without the pipeline: a model
    // that never stops moving never gets its supersampled, ambient-occluded still frame (brief 0.8)
    var t = tNow / 1000;
    var floatAmt = R.pipe || isRM() ? 0 : (1 - smooth(0, 0.2, s.dive)) * (region === 'material' ? 0.3 : 1) * IX.idle;
    // (HK: the pointer offsets are gone by the time the hero film cross-fades into this frame)
    R.rig.rotation.y = s.rotY + s.dragY + IX.ptYaw * HK;
    R.floatG.rotation.x = s.tiltX * 0.6 * HK + s.dragX + Math.sin(t * 0.7) * 0.0035 * floatAmt;
    R.floatG.rotation.z = Math.sin(t * 0.53 + 1.3) * 0.003 * floatAmt;
    var lift = (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.22 * floatAmt;
    R.floatG.position.y = lift;
    if (R.shHard) {
      R.shHard.material.opacity = 1 - lift * 2.2;
      R.shSoft.material.opacity = 1 - lift * 0.8;
      R.shHinge.material.opacity = 0.4 * smooth(0, 90, lidDeg);
      R.shHinge.scale.set(1, 0.6 + 0.4 * smooth(0, 108, lidDeg), 1);
    }

    // camera (mobile fit) and the dive
    var aspect = cam.aspect, fov = s.cam.fov;
    // while a hero film is on, the stage frames itself for the film's aspect (its fit push-back and dive
    // distance), then crops like the film's cover fit (fov lock below): film and 3D match at any window shape
    var filmAR = region === 'hero' && HF.ok ? HF.ar : 0, fitAR = filmAR || aspect;
    vA.set(s.cam.x, s.cam.y, s.cam.z); vB.set(s.cam.tx, s.cam.ty, s.cam.tz);
    var fitK = (s.cam.fit || FIT) / (Math.tan(fov * DEG / 2) * fitAR);
    vC.copy(vA).sub(vB);
    var dist = vC.length();
    if (dist < fitK && dist > 1e-6) { vC.multiplyScalar(fitK / dist); vA.copy(vB).add(vC); }
    if (s.dive > 0) {
      // S + m * logLerp(d0, .6, dive), fov 35 -> 20
      var Sx = screenCentre(th), m = screenNormal(th);
      var d0 = Math.max(45, POSES.C.fit / (Math.tan(35 * DEG / 2) * fitAR));
      var dd = d0 * Math.pow(0.6 / d0, s.dive);
      fov = lerp(35, 20, s.dive);
      vB.set(Sx.x, Sx.y, Sx.z);
      vA.set(Sx.x + m.x * dd, Sx.y + m.y * dd, Sx.z + m.z * dd);
    }
    cam.position.copy(vA);
    cam.lookAt(vB);
    var near = s.dive > 0.4 ? 0.02 : 0.1;
    var oy = Math.round((s.dive > 0 ? 0 : (s.cam.oy || 0)) * 1000) / 1000;
    // ox: a sideways composition nudge done as a view offset (a shifted lens), never by moving the camera,
    // so the #finish hold keeps the Cycles turntable's exact perspective (placeTurntable is then exact)
    var ox = Math.round((s.dive > 0 ? 0 : (s.cam.ox || 0)) * 10000) / 10000;
    if (oy !== R.viewOy || ox !== R.viewOx || ((oy || ox) && (R.viewOyH !== R.lastH || R.viewOyW !== R.lastW))) {
      R.viewOy = oy; R.viewOx = ox; R.viewOyH = R.lastH; R.viewOyW = R.lastW;
      if (oy || ox) cam.setViewOffset(R.lastW, R.lastH, ox * R.lastH, oy * R.lastH, R.lastW, R.lastH); else cam.clearViewOffset();
    }
    // the hero film is cover-fitted: on a window wider than the film it loses its top and bottom, so the stage
    // takes the same (narrower) vertical field of view there and the dissolve between them lines up
    if (filmAR && aspect > filmAR) fov = 2 * Math.atan(Math.tan(fov * DEG / 2) * filmAR / aspect) / DEG;
    if (Math.abs(cam.fov - fov) > 1e-4 || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }

    // environment: camera-locked studio (the lights travel with the lens, as on a product set), + small
    // offsets: the hero light sweep, the finish-change flick (+-15 deg) and pointer parallax (+-6 deg)
    var er;
    if (R.envU.length) {
      cam.getWorldDirection(R.fwd);
      var P0 = PX[region];
      var heroSweep = region === 'hero' ? (P0.envRot + 0.9) * 0.12 : 0;
      // (the section yaw is art direction for the void studio only: paper Silver keeps its lab-tuned yaw)
      er = Math.atan2(-R.fwd.x, -R.fwd.z) + ENV_YAW + (P0.yaw || 0) * (1 - stageMix) + heroSweep + IX.envFlick * 0.33 + s.envRotPointer * 0.3 * HK;
      er = Math.round(er * 2000) / 2000;
    } else er = s.envRot + s.envRotPointer;
    if (er !== R.envRotY) { R.envRotY = er; for (var i = 0; i < R.envMats.length; i++) R.envMats[i].envMapRotation.y = er; changed = true; }
    // void -> paper studio crossfade follows the stage background
    var em = Math.round(stageMix * 500) / 500;
    if (em !== R.envMix) { R.envMix = em; for (var j = 0; j < R.envU.length; j++) R.envU[j].rkEnvMix.value = em; changed = true; }
    R.renderer.toneMappingExposure = s.exposure;
    var P = PX[region];
    var envK = P.envK == null ? 1 : Math.round(P.envK * 200) / 200;
    if (envK !== R.envK) { R.envK = envK; applyFinishMaterials(s.finishMix); changed = true; }
    if (R.sweep) {
      var topSweep = region === 'material' || region === 'finish';
      if (topSweep) {
        // top-down pose: the spec placement, 35 above the lid, facing straight down
        R.sweep.position.set(s.sweepX * 0.5, DIM.baseTop + DIM.lidT + 35, 0);
        R.sweep.rotation.set(-Math.PI / 2, 0, 0);
      } else if (region === 'finale') {
        // finale: the strip hangs in the closed lid's MIRROR direction (the view ray reflected in the lid
        // plane, 40 out) and is rolled ~35 deg, so the lid carries one long diagonal streak running off its
        // edge line. (At the hero's grazing placement the high finale camera never saw it: a dark slab.)
        var T0 = R.vD.set(0, DIM.baseTop + DIM.lidT, 0), rd = R.vE.copy(T0).sub(cam.position).normalize();
        rd.y = -rd.y;
        R.sweep.position.copy(T0).addScaledVector(rd, 40);
        R.sweep.position.x += s.sweepX * 0.3;
        R.sweep.lookAt(T0);
        R.sweep.rotateZ(0.6);
      } else {
        // grazing hero pose: hung behind and above the lid so its mirror image streaks across it;
        // sweepX -50..50 maps so the streak crosses the lid edge to edge over the same range
        R.sweep.position.set(s.sweepX * 0.56, 12, -36);
        R.sweep.lookAt(s.sweepX * 0.17, 1.5, 0);
      }
      // (a peeking lid shades the deck from this rear light; RectAreaLights cast no shadows, so it dims)
      // (the finale strip is brighter: on the rough Space Black lid only ~4% comes back, as one soft streak)
      R.sweep.intensity = (topSweep ? 30 : region === 'finale' ? 34 : 12) * P.sweepI * (1 - 0.85 * clamp(peekAmt / 12, 0, 1));
      // (never toggle .visible: a change in light count recompiles every material)
    }
    var open = smooth(15, 70, lidDeg);
    // peek: the panel is awake behind the lid, so light leaks out of the gap onto the keys
    var leak = (peekAmt / 12) * (1 - open) * 0.55;
    mac.M.screen.emissiveIntensity = s.screenOn * 1.25 * open + leak;
    // texel-to-pixel magnification drives the sub-pixel reveal (dive only)
    var pu = mac.M.screen.userData.uPixel;
    if (s.dive > 0.3) {
      var dCam = cam.position.distanceTo(vB);
      var pxWorld = 2 * dCam * Math.tan(cam.fov * DEG / 2) / Math.max(1, R.lastH * R.dpr);
      var mag = (DIM.scrW / 2048) / pxWorld;
      pu.value = smooth(9, 20, mag);
      mac.M.screen.userData.uNear.value = smooth(2.2, 4.5, mag);
    } else { pu.value = 0; mac.M.screen.userData.uNear.value = 0; }
    if (R.pipe) {
      var bq = Math.round(pu.value * 20) / 20;
      if (bq !== R.bloomQ) {
        R.bloomQ = bq;
        // bloom fades OUT through the dive: the sub-pixel emitters sit above the threshold, and their glow
        // filled the black matrix (45 luma) and washed the primaries to pastel
        mac.screen.layers.disable(R.pipe.bloomLayer);
        R.pipe.setBloom({ strength: 0.15 * (1 - bq), radius: 0.55 });
      }
    }
    // AR-coated cover glass: the reflection fades as the panel lights (an image outshines its reflection)
    // (and inside the dive the lens is millimetres from the glass, so there is no studio left to mirror: the
    // grey reflection veil desaturated the sub-pixel primaries)
    mac.M.screen.envMapIntensity = (1 - 0.72 * clamp(s.screenOn * open, 0, 1)) * (1 - pu.value);
    // the black bezel glass goes quiet too once the panel is lit: next to a bright image the one strip it
    // mirrors (frontStrip) read as a stray bright dash on the side bezel, not as gloss
    mac.M.glass.envMapIntensity = 1 - 0.85 * clamp(s.screenOn * open * 1.6, 0, 1);
    // backlit legends while the panel is awake (peek leak + screen on)
    var bl = mac.M.key.userData.uBacklight;
    if (bl) bl.value = clamp(leak * 1.6 + s.screenOn * open * 0.5, 0, 1);
    // (the peek leak is the dark top of a waking panel: a soft glow on the keys, not a floodlight)
    // (Space Black .45: at 1.0 the screen's spill alone lifted the deck to a flat mid-grey, 137 luma, and
    // the finish read as grey plastic; Silver keeps its .25)
    if (R.spill) { R.spill.intensity = (s.screenOn * 2.5 * open + leak * 1.3) * lerp(0.45, 0.25, s.finishMix); }

    // contact shadow (paper only); the depth pass re-runs only when the lid or the tilt moved
    if (R.cshadow) {
      var csOn = stageMix > 0.01 && s.dive < 0.5;
      R.cshadow.mesh.visible = csOn;
      if (csOn) {
        R.cshadow.mesh.material.uniforms.opacity.value = 0.6 * stageMix;
        var ck = lidDeg.toFixed(2) + '|' + R.floatG.rotation.x.toFixed(4) + '|' + R.floatG.rotation.z.toFixed(4) + '|' + R.floatG.position.y.toFixed(3);
        if (ck !== R.csKey) { R.csKey = ck; R.scene.updateMatrixWorld(); R.cshadow.update(); }
      }
    }

    if (mac.lidOcc.uLidOcc.value.z > 0) {
      R.scene.updateMatrixWorld(); cam.updateMatrixWorld();
      mac.lidOcc.uViewToBase.value.copy(mac.base.matrixWorld).invert().multiply(cam.matrixWorld);
    }
    if (R.pipe) {
      if (changed) R.pipe.invalidate();
      R.more = R.pipe.render(R.dt || 1 / 60);
    } else {
      R.renderer.render(R.scene, cam);
      R.more = false;
    }
  }

  var lastT = 0;
  function isScrolling() {
    var A = app(), L = A && A.lenis;
    return !!(L && (L.isScrolling || Math.abs(L.velocity || 0) > 0.02));
  }
  function tick() {
    var now = performance.now();
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
    lastT = now; tNow = now;
    compose(dt);
    if (!R || !R.firstFrame) return;
    if (!state.visible || state.opacity <= 0.001 || covered) return;
    R.dt = dt;
    // the idle float (no-pipeline fallback only) keeps frames coming while someone is here; after 15s
    // without input it eases out and the loop falls back to render-on-dirty
    if (!IX.lastActive) IX.lastActive = now;
    var idleT = now - IX.lastActive > 15000 ? 0 : 1;
    if (IX.idle !== idleT) { IX.idle = clamp(IX.idle + (idleT ? 1 : -1) * dt / 1.6, 0, 1); if (!R.pipe) dirty = true; }
    var animating = !R.pipe && !isRM() && IX.idle > 0;
    // scroll / drag = motion: the pipeline stays on its fast path, 150 ms after they stop it starts
    // accumulating the jittered, ambient-occluded still frame, and stops drawing once it has converged
    var moving = dirty || IX.dragging || isScrolling();
    if (R.pipe) R.pipe.setMoving(moving);
    if (!(dirty || animating || R.more)) return;
    var wasDirty = dirty;
    dirty = false;
    renderFrame(wasDirty);
    // adaptive DPR, last resort: the pipeline steps its own quality first (idle AO -> bloom -> MSAA 2);
    // only once it is at 'low' and still slow does DPR step 2 -> 1.75 -> 1.5 (-> 1.25 -> 1 without it).
    // One-off hitches are trimmed, and two slow 40-frame windows in a row are required.
    var measure = R.pipe ? (moving && (R.quality === 'low' || R.dpr < R.dprMax)) : (animating || R.dpr < R.dprMax);
    if (measure && now - R.bornAt > 3000 && !DOC.hidden) {
      R.frames.push(dt * 1000);
      if (R.frames.length >= 40) {
        var fr = R.frames.slice().sort(function (a, b) { return a - b; }).slice(0, 36);
        var avg = fr.reduce(function (a, b) { return a + b; }, 0) / fr.length;
        R.frames.length = 0;
        R.slow = avg > 18 ? (R.slow || 0) + 1 : 0;
        R.good = avg < 17.2 ? (R.good || 0) + 1 : 0;
        var floor = R.pipe ? 1.5 : 1;
        if (R.slow >= 2 && R.dpr > floor) {
          R.slow = 0; R.good = 0;
          R.dpr = R.pipe ? (R.dpr > 1.75 ? 1.75 : 1.5) : (R.dpr > 1.5 ? 1.5 : R.dpr > 1.25 ? 1.25 : 1);
          if (!R.pipe) R.renderer.setPixelRatio(R.dpr);
          R.lastW = 0; resize();
          emit('perf:dpr', { module: 'mac', dpr: R.dpr });
        } else if (R.dpr < R.dprMax && R.good >= (R.upWin || 15)) {
          // recovery (a dip from something else on the GPU must not soften the rest of the visit):
          // after ~600 smooth frames go back up one step; each failed attempt doubles the wait
          R.good = 0; R.upWin = Math.min((R.upWin || 15) * 2, 240);
          R.dpr = Math.min(R.dprMax, R.pipe ? (R.dpr < 1.75 ? 1.75 : 2) : R.dpr + 0.25);
          if (!R.pipe) R.renderer.setPixelRatio(R.dpr);
          R.lastW = 0; resize();
          emit('perf:dpr', { module: 'mac', dpr: R.dpr });
        }
      }
    }
  }

  /* ---------------------------------------------------------------------------
   * 10. INTERACTION: pointer tilt, peek, finish drag / keys, swatches, lid toggle
   * ------------------------------------------------------------------------- */
  function bindPointer() {
    function active() { IX.lastActive = performance.now(); }
    W.addEventListener('scroll', active, { passive: true });
    W.addEventListener('keydown', active);
    W.addEventListener('pointerdown', active);
    W.addEventListener('wheel', active, { passive: true });
    W.addEventListener('touchstart', active, { passive: true });
    W.addEventListener('pointermove', function (e) {
      active();
      if (e.pointerType === 'touch' || isRM()) return;   // no pointer parallax under reduced motion
      var nx = (e.clientX / W.innerWidth) * 2 - 1, ny = (e.clientY / W.innerHeight) * 2 - 1;
      IX.ptYawT = nx * 6 * DEG;
      IX.ptTiltT = ny * 6 * DEG;
      IX.envPT = nx * 0.35;
      markDirty();
    }, { passive: true });
  }

  var peekTween = null, peekHeld = false;
  function peek(onState) {
    var g = G(); if (!g) return;
    if (onState === peekHeld) return;
    peekHeld = onState;
    if (peekTween) peekTween.kill();
    peekTween = g.to(state, { peek: onState ? 12 : 0, duration: 0.48, ease: onState ? 'power3.out' : 'power3.inOut', onUpdate: markDirty });
  }
  function bindPeek(hero) {
    var btn = $('[data-mac-peek]');
    function interactive(t) { return t && t.closest && t.closest('a,button:not([data-mac-peek]),input,select,textarea,label'); }
    hero.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var onBtn = btn && (e.target === btn || btn.contains(e.target));
      if (!onBtn && (e.pointerType !== 'mouse' || interactive(e.target))) return;
      peek(true);
    });
    W.addEventListener('pointerup', function () { peek(false); });
    W.addEventListener('pointercancel', function () { peek(false); });
    W.addEventListener('blur', function () { peek(false); });
    if (btn) {
      btn.addEventListener('keydown', function (e) {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (e.repeat) return;
        peek(true);
      });
      btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); peek(false); } });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
  }

  // finish colours + UI
  var FINISHES = { 'space-black': { mix: 0, bg: 0, label: 'Space Black' }, 'silver': { mix: 1, bg: 1, label: 'Silver' } };
  var nameSplit = null;
  function setFinish(name, opts, source) {
    var f = FINISHES[name]; if (!f) return;
    var g = G(), immediate = !!opts.immediate || !g;
    var changed = name !== MacScene.finish;
    MacScene.finish = name;
    ttWarm(name);
    var sec = $('#finish');
    if (sec) sec.setAttribute('data-theme', name);
    $$('[data-finish]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-finish') === name)); });
    if (immediate) {
      if (g) g.killTweensOf(state, 'finishMix');
      state.finishMix = f.mix; IX.bgMix = f.bg; applyFinishMaterials(f.mix); markDirty();
    } else {
      g.to(state, { finishMix: f.mix, duration: 0.7, ease: 'power3.inOut', overwrite: 'auto', onUpdate: function () { applyFinishMaterials(state.finishMix); markDirty(); } });
      g.to(IX, { bgMix: f.bg, duration: 0.7, ease: 'power3.inOut', overwrite: 'auto', onUpdate: markDirty });
      if (changed) {
        g.killTweensOf(IX, 'envFlick');
        g.timeline({ onUpdate: markDirty })
          .to(IX, { envFlick: 0.8, duration: 0.35, ease: 'power2.out' })
          .to(IX, { envFlick: 0, duration: 0.55, ease: 'power3.inOut' });
      }
    }
    var nameEl = $('[data-finish-name]');
    if (nameEl && (changed || immediate)) {
      if (nameSplit && nameSplit.revert) { try { nameSplit.revert(); } catch (e) { /* noop */ } nameSplit = null; }
      nameEl.textContent = f.label;
      var SplitText = (app() && app().SplitText) || W.SplitText;
      if (!immediate && g && SplitText && !isRM()) {
        try {
          nameSplit = new SplitText(nameEl, { type: 'chars' });
          g.fromTo(nameSplit.chars, { yPercent: 100 }, { yPercent: 0, duration: 0.7, ease: 'expo.out', stagger: 0.03 });
        } catch (e) { /* plain text is fine */ }
      }
    }
    if (changed && !opts.silent) emit('finish:change', { name: name, source: source || 'ui' });
  }

  var lidTween = null;
  function setLid(deg, opts) {
    var g = G(), dur = opts.duration == null ? 0.9 : opts.duration;
    var target = clamp(deg / 105, 0, 1.05);
    if (lidTween) lidTween.kill();
    if (!g || dur <= 0) { IX.lidUser = target; markDirty(); }
    else lidTween = g.to(IX, { lidUser: target, duration: dur, ease: 'power3.inOut', onUpdate: markDirty });
    var btn = $('[data-mac-lid]'), open = deg > 1;
    if (btn) {
      btn.setAttribute('aria-pressed', String(open));
      btn.textContent = open ? 'Close the lid' : 'Open the lid';
    }
    emit('lid:toggle', { open: open });
  }

  function bindFinishUI() {
    var sec = $('#finish'), hit = $('[data-finish-hit]');
    $$('[data-finish]').forEach(function (b) {
      var warm = function () { ttWarm(b.getAttribute('data-finish')); };
      b.addEventListener('pointerenter', warm);
      b.addEventListener('pointerdown', warm);
      b.addEventListener('focus', warm);
      b.addEventListener('click', function () { setFinish(b.getAttribute('data-finish'), {}, 'ui'); });
      b.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
        e.preventDefault();
        var all = $$('[data-finish]'), i = all.indexOf(b), n = all[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + all.length) % all.length];
        n.focus(); setFinish(n.getAttribute('data-finish'), {}, 'key');
      });
    });
    var lidBtn = $('[data-mac-lid]');
    if (lidBtn) lidBtn.addEventListener('click', function () {
      var target = lidTween && lidTween.isActive() ? (lidTween.vars.lidUser > 0.5 ? 0 : 105) : (IX.lidUser > 0.5 ? 0 : 105);
      setLid(target, { duration: 0.9 });
    });
    if (!hit) return;
    var lastX = 0, lastY = 0, lastMove = 0, pid = null;
    hit.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pid = e.pointerId; IX.dragging = true; IX.vDrag = 0;
      lastX = e.clientX; lastY = e.clientY; lastMove = performance.now();
      try { hit.setPointerCapture(pid); } catch (err) { /* noop */ }
      var g = G(); if (g) g.killTweensOf(state, 'dragY,dragX');
      if (sec) sec.classList.add('is-dragging');
    });
    hit.addEventListener('pointermove', function (e) {
      if (!IX.dragging || e.pointerId !== pid) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY, now = performance.now();
      lastX = e.clientX; lastY = e.clientY;
      var dY = dx * 0.01;
      state.dragY = clamp(state.dragY + dY, -2.79, 2.79);
      if (!TF.enabled) state.dragX = clamp(state.dragX + dy * 0.004, -15 * DEG, 15 * DEG);   // (a turntable cannot tilt)
      var fdt = Math.max(1, now - lastMove) / 16.67; lastMove = now;
      IX.vDrag = dY / fdt;
      markDirty();
    });
    function end(e) {
      if (!IX.dragging || (e && e.pointerId !== pid)) return;
      IX.dragging = false; pid = null;
      if (performance.now() - lastMove > 80) IX.vDrag = 0;
      if (sec) sec.classList.remove('is-dragging');
    }
    hit.addEventListener('pointerup', end);
    hit.addEventListener('pointercancel', end);
    hit.addEventListener('lostpointercapture', end);
    var kb = { y: 0, x: 0, ty: null, tx: null };   // key targets accumulate across quick repeats
    hit.addEventListener('keydown', function (e) {
      var gg = G(); if (!gg) return;
      var k = e.key, step = 15 * DEG;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault(); IX.vDrag = 0;
        if (!kb.ty || !kb.ty.isActive()) kb.y = state.dragY;
        kb.y = clamp(kb.y + (k === 'ArrowRight' ? step : -step), -2.79, 2.79);
        kb.ty = gg.to(state, { dragY: kb.y, duration: 0.48, ease: 'power3.out', overwrite: 'auto', onUpdate: markDirty });
      } else if ((k === 'ArrowUp' || k === 'ArrowDown') && !TF.enabled) {
        e.preventDefault();
        if (!kb.tx || !kb.tx.isActive()) kb.x = state.dragX;
        kb.x = clamp(kb.x + (k === 'ArrowDown' ? 5 * DEG : -5 * DEG), -15 * DEG, 15 * DEG);
        kb.tx = gg.to(state, { dragX: kb.x, duration: 0.48, ease: 'power3.out', overwrite: 'auto', onUpdate: markDirty });
      }
    });
  }

  function resetInteraction(dur) {
    var g = G(); if (!g) return;
    IX.vDrag = 0;
    g.to(state, { dragY: 0, dragX: 0, duration: dur, ease: 'power3.inOut', overwrite: 'auto', onUpdate: markDirty });
    if (IX.lidUser !== 1) { if (lidTween) lidTween.kill(); lidTween = g.to(IX, { lidUser: 1, duration: dur, ease: 'power3.inOut', onUpdate: markDirty }); }
    var btn = $('[data-mac-lid]');
    if (btn) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Close the lid'; }
  }

  /* ---------------------------------------------------------------------------
   * 10b. BLENDER / CYCLES FILMS  (js/sequence.js: APP.sequence scrubs pre-rendered frames on a 2D canvas)
   * Hero: assets/seq/hero is this hero pin re-rendered path-traced in Cycles (skill: scripts/blender/examples/
   * macbook_pro_14.py, hero_state). Its frame is 119 p up to p .75. Its push-in frames (89.25 -> 119) sit at
   * dive .12 ((p_f - .75) / .25)^2 while this dive is ((p - .75) / .22)^3 (GSAP power2.in is cubic), so the
   * frame is looked up from the dive itself (filmFrame): the film then shows the stage's exact camera at every
   * p up to FILM_HAND, dive .12, its last frame (the screen fills the frame), and it dissolves into the
   * real-time dive over FILM_XF -> FILM_HAND without a jump. Two films, picked by window shape
   * (heroFilmWanted): 'hero' (16:9, 150 frames, denser at the end) from 1.25:1 up, 'hero_portrait' (1080x2340,
   * the stage's phone framing) below 1:1; in between, the real-time hero. While one is on, the stage frames
   * itself for the film's aspect and narrows its vertical fov like the film's cover crop (renderFrame), so the
   * two line up at any window shape. Each film's camera.js (window.SEQ_CAM) maps film frames to timeline
   * frames (src) and gives the per-frame zoom (k) that filmZoom uses to take out the sub-frame remainder.
   * Finish: two 72-frame turntables (5 deg a frame; frame 11 = rotY .35), flattened over the colour each is
   * always shown on (Space Black on void, Silver on paper; 1/3 the bytes of an alpha film) and placed over the
   * real-time laptop by projecting both cameras (placeTurntable). Drag and the arrow keys pick the frame;
   * closing the lid dissolves back to the real-time laptop, which can animate it. While a film fully covers
   * the stage, the WebGL canvas hides (its --stage-bg stays) and nothing renders.
   * ------------------------------------------------------------------------- */
  var FILM_N = 120, FILM_75 = 119 * 0.75, FILM_DIVE = 0.12, FILM_HAND = 0.75 + 0.22 * Math.cbrt(FILM_DIVE), FILM_XF = 0.82;
  var FILM_PEEK = 119 * 0.3;          // hold to peek: the film's own 10-degree lid frame (camera still at pose A)
  var FILM_RM = 77;                   // reduced-motion still: lid open, display on (f_0078)
  var HF = { el: null, seq: null, key: null, cam: null, n: 120, ok: false, drawn: false, fade: 0, a: -1, vis: null, z: 1, o: '', ar: 16 / 9, idx: -1, f: 0, fi: 0, dive: 0 };
  var TF = { enabled: false, el: null, b: null, s: null, box: null, lastW: 0, lastH: 0 };
  var HK = 1, covered = false;
  // the turntable camera (web cm; Blender (0,-.8,.3) -> (0,0,.085), vfov 27, 1600x1000) and its frame yaw
  var TT = { pos: [0, 30, 80], tgt: [0, 8.5, 0], fov: 27, w: 1600, h: 1000, yaw0: -30, step: 5, n: 72, silverExp: 0.83 };

  function filmFrame(P) {
    if (!(P.dive > 0)) return P.film;
    return (FILM_N - 1) * (0.75 + 0.25 * Math.sqrt(Math.min(1, P.dive / FILM_DIVE)));
  }
  // Timeline frame (0-based, 0..FILM_N-1) -> film index (float). The landscape film is denser at the end
  // (assets/seq/hero/camera.js: film frames 1-89 are timeline frames 1-89, then 90, 90.5 ... 120), so the
  // index is looked up in the film's own `src` list (Blender timeline frame per film frame), never assumed.
  function filmIndex(tf) {
    var C = HF.cam, n = HF.n || FILM_N;
    if (!C || !C.src || C.src.length !== n) return clamp(tf, 0, n - 1);
    var F = tf + 1, src = C.src;                       // src is 1-based Blender frames
    if (F <= src[0]) return 0;
    if (F >= src[n - 1]) return n - 1;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (src[mid] <= F) lo = mid; else hi = mid; }
    return lo + (F - src[lo]) / Math.max(1e-6, src[hi] - src[lo]);
  }
  // Whole frames only: each end frame still zooms ~1.9%, so the frame drawn can be up to ~1% small or large
  // against the stage's continuous camera (the headline doubled in the dissolve). The canvas is scaled by
  // k(target) / k(drawn) about the look-at point c, from the film's exported camera (camera.js: k = relative
  // zoom, c = look-at point in the frame). Only for the exact frame or a neighbour: a far fallback frame
  // (still loading) is shown as it is.
  function kAt(fi) {
    var k = HF.cam && HF.cam.k, i = Math.floor(fi), t = fi - i;
    if (!k) return 1;
    if (i >= k.length - 1) return k[k.length - 1];
    return k[i] + (k[i + 1] - k[i]) * t;
  }
  function filmZoom() {
    var zc = 1, C = HF.cam;
    if (C && C.k && HF.idx >= 0 && !isRM() && Math.abs(HF.fi - HF.idx) <= 2) zc = kAt(HF.fi) / C.k[HF.idx];
    // no WebGL: plus a 2D push into the screen for what the real-time dive would have done
    var zf = failed && !isRM() ? 1 + 0.6 * smooth(0.12, 1, HF.dive) : 1;
    var z = Math.round(zc * zf * 10000) / 10000;
    if (z !== HF.z) { HF.z = z; HF.el.style.setProperty('--film-zoom', String(z)); }
    // the scale pivots on the look-at point (frame UV -> CSS px in the cover-fitted box)
    var c = C && C.c && HF.idx >= 0 ? C.c[HF.idx] : null, o = '';
    if (c && (Math.abs(c[0] - 0.5) > 1e-3 || Math.abs(c[1] - 0.5) > 1e-3) && HF.seq.point) {
      var q = HF.seq.point(c[0], c[1]);
      if (q) o = Math.round(q.x) + 'px ' + Math.round(q.y) + 'px';
    }
    if (o !== HF.o) { HF.o = o; if (o) HF.el.style.setProperty('--film-origin', o); else HF.el.style.removeProperty('--film-origin'); }
  }
  function filmsAvailable() { var A = app(); return !!(A && typeof A.sequence === 'function' && W.SEQ); }
  // Which hero film this window gets: the 16:9 film from 1.25:1 up, the portrait film (rendered from the same
  // timeline at 1080x2340, i.e. with the stage's phone fit) below 1:1, and the real-time hero in between
  // (a 16:9 cover crop there cuts the laptop off, and the portrait film would show a third of its height).
  function heroFilmWanted() {
    if (!filmsAvailable()) return null;
    var ar = W.innerWidth / Math.max(1, W.innerHeight);
    if (ar >= 1.25 && W.SEQ.hero) return 'hero';
    if (ar < 1 && W.SEQ.hero_portrait) return 'hero_portrait';
    return null;
  }

  function heroFilmInit() {
    var key = heroFilmWanted();
    HF.el = HF.el || $('[data-hero-film]');
    if (!HF.el) key = null;
    if (key === HF.key) { HF.ok = !!(key && HF.seq); return; }
    // a rotation / resize across the gates: drop the other film
    if (HF.seq) { HF.seq.dispose(); HF.seq = null; }
    HF.key = key; HF.ok = false; HF.drawn = false; HF.a = -1; HF.vis = null; HF.idx = -1; HF.z = 1; HF.o = '';
    if (HF.el) { HF.el.style.opacity = '0'; HF.el.style.removeProperty('--film-zoom'); HF.el.style.removeProperty('--film-origin'); }
    if (!key) return;
    var man = W.SEQ[key];
    HF.ar = man.width && man.height ? man.width / man.height : 16 / 9;
    HF.n = man.frames || FILM_N;
    HF.cam = (W.SEQ_CAM && W.SEQ_CAM[key]) || null;
    if (HF.cam && (!HF.cam.k || HF.cam.k.length !== HF.n)) HF.cam = null;   // stale export: whole frames, no zoom
    // sharpness 1: the 2560 frames as soon as the canvas is wider than 1920 device px (a 2x laptop screen)
    var seq = app().sequence(HF.el, key, { fit: 'cover', lazy: false, sharpness: key === 'hero' ? 1 : undefined,
      onDraw: function (i) { if (seq !== HF.seq) return; HF.idx = i; if (HF.el) filmZoom(); } });
    if (seq.failed) { HF.key = null; return; }
    HF.seq = seq; HF.ok = true;
    var rmIdx = Math.round(filmIndex(FILM_RM));
    seq.ready.then(function () {
      if (seq !== HF.seq) return;
      function go() {
        if (HF.drawn || seq !== HF.seq) return;
        HF.drawn = true;
        var g = G(), A = app();
        // after the curtain (a slow network): fade in over the real-time laptop instead of popping
        if (g && A && A.loaded && !isRM()) { HF.fade = 0; g.to(HF, { fade: 1, duration: 0.6, ease: 'power2.out', onUpdate: markDirty }); }
        else HF.fade = 1;
        markDirty();
      }
      if (!isRM()) { go(); return; }
      // RM loads only the still it shows: wait for that exact frame, not the poster (frame 1, lid closed)
      var tries = 0;
      (function wait() { var st = seq.stats(); if ((st.exact && st.drawn === rmIdx) || ++tries > 80) go(); else setTimeout(wait, 50); })();
    });
    markDirty();
  }

  function ttInit() {
    TF.el = $('[data-finish-film]');
    if (!TF.el || !filmsAvailable() || !W.SEQ.turntable_space_black || !W.SEQ.turntable_silver) return;
    var A = app();
    function mk(key, name) {
      var box = $('[data-finish-seq="' + key + '"]', TF.el);
      if (!box) return null;
      var o = { box: box, seq: null, drawn: false, a: -1, vis: null };
      // lazy (default): the poster now, the frames once #finish is ~2 screens away
      // a finish not on show loads its poster and keyframes only, and the rest once its swatch is
      // hovered, focused or picked (ttWarm): most visits never see Silver
      var lazyAll = key !== (MacScene.finish || 'space-black') && !isRM();
      o.seq = A.sequence(box, name, { fit: 'contain', preload: lazyAll ? 'keyframes' : undefined });
      if (o.seq.failed) return null;
      o.seq.visible(false); o.vis = false;
      o.seq.ready.then(function () { o.drawn = true; markDirty(); });
      return o;
    }
    TF.b = mk('space-black', 'turntable_space_black');
    TF.s = mk('silver', 'turntable_silver');
    TF.enabled = !!(TF.b && TF.s);
    if (!TF.enabled) return;
    // the hold camera becomes the turntable's own (elevation 15 deg, vfov 27, the same 39.8 cm of height at
    // the laptop as the old F), keeping F's sideways nudge for the finish name: the real-time laptop and the
    // Cycles frames then share one perspective, so every dissolve between them lines up
    // The nudge is a lens shift (ox), not a sideways move: a camera moved 2.6 cm sees the lid and the deck
    // with a little parallax the 2D fit cannot undo (the screen text doubled by ~5 px in the dissolve).
    var F0 = POSES.F, ttD = Math.sqrt(Math.pow(TT.pos[1] - TT.tgt[1], 2) + Math.pow(TT.pos[2] - TT.tgt[2], 2));
    POSES.F = pose(0, TT.pos[1], TT.pos[2], 0, TT.tgt[1], TT.tgt[2], TT.fov, F0.fit);
    POSES.F.ox = F0.tx / (2 * ttD * Math.tan(TT.fov * DEG / 2));
    PX.finale.cam = phonePose(POSES.F);
    TF.lastW = 0; placeTurntable();
  }

  function ttWarm(key) {
    var o = key === 'silver' ? TF.s : key === 'space-black' ? TF.b : null;
    if (o && o.seq && o.seq.preload) o.seq.preload('auto');
  }

  // look-at camera basis (three.js convention) and a projection to 0..1 frame coordinates (y down)
  function camBasis(pos, tgt) {
    var f = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]], l = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    f = [f[0] / l, f[1] / l, f[2] / l];
    var rl = Math.sqrt(f[0] * f[0] + f[2] * f[2]), r = [-f[2] / rl, 0, f[0] / rl];
    return { p: pos, f: f, r: r, u: [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] };
  }
  function proj(B, t, aspect, P) {
    var d = [P[0] - B.p[0], P[1] - B.p[1], P[2] - B.p[2]];
    var z = d[0] * B.f[0] + d[1] * B.f[1] + d[2] * B.f[2];
    var x = (d[0] * B.r[0] + d[1] * B.r[1] + d[2] * B.r[2]) / (z * t * aspect);
    var y = (d[0] * B.u[0] + d[1] * B.u[1] + d[2] * B.u[2]) / (z * t);
    return [(x + 1) / 2, (1 - y) / 2];
  }
  // Fit the turntable frame (scale + offset) over the real-time laptop at the #finish hold: 12 landmarks
  // (base corners, top and bottom, and the lid's top corners at rotY 20 deg, lid 108) projected through both
  // cameras, least squares. Re-run on resize; the result is three custom properties on [data-finish-film].
  function placeTurntable() {
    if (!TF.el) return;
    var w = W.innerWidth, h = W.innerHeight;
    if (!w || !h || (w === TF.lastW && h === TF.lastH)) return;
    TF.lastW = w; TF.lastH = h;
    var c = phonePose(POSES.F), aspect = w / h, t = Math.tan(c.fov * DEG / 2);
    var pos = [c.x, c.y, c.z], tgt = [c.tx, c.ty, c.tz];
    var v = [pos[0] - tgt[0], pos[1] - tgt[1], pos[2] - tgt[2]], dist = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    var fitK = (c.fit || FIT) / (t * aspect);            // renderFrame's phone fit (dolly back)
    if (dist < fitK) pos = [tgt[0] + v[0] * fitK / dist, tgt[1] + v[1] * fitK / dist, tgt[2] + v[2] * fitK / dist];
    var Brt = camBasis(pos, tgt), Btt = camBasis(TT.pos, TT.tgt), tt = Math.tan(TT.fov * DEG / 2);
    var th = LID_OPEN * DEG, ly = DIM.pivotY + Math.sin(th) * 21.5, lz = DIM.pivotZ + Math.cos(th) * 21.5;
    var hx = DIM.W / 2, hz = DIM.D / 2, pts = [];
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) { pts.push([sx * hx, 0, sz * hz], [sx * hx, DIM.baseTop, sz * hz]); });
      pts.push([sx * hx, ly, lz]);
    });
    var a = 20 * DEG, ca = Math.cos(a), sa = Math.sin(a), U = [], V = [], um = [0, 0], vm = [0, 0];
    pts.forEach(function (q) {
      var P = [q[0] * ca + q[2] * sa, q[1], -q[0] * sa + q[2] * ca];
      var u = proj(Btt, tt, TT.w / TT.h, P), r = proj(Brt, t, aspect, P);
      u = [u[0] * TT.w, u[1] * TT.h]; r = [r[0] * w - (c.ox || 0) * h, r[1] * h - (c.oy || 0) * h];
      U.push(u); V.push(r); um[0] += u[0]; um[1] += u[1]; vm[0] += r[0]; vm[1] += r[1];
    });
    var n = pts.length, num = 0, den = 0;
    um = [um[0] / n, um[1] / n]; vm = [vm[0] / n, vm[1] / n];
    for (var i = 0; i < n; i++) {
      var du = [U[i][0] - um[0], U[i][1] - um[1]];
      num += du[0] * (V[i][0] - vm[0]) + du[1] * (V[i][1] - vm[1]); den += du[0] * du[0] + du[1] * du[1];
    }
    var sc = den > 0 ? num / den : 1, x0 = vm[0] - sc * um[0], y0 = vm[1] - sc * um[1];
    TF.box = { x: Math.round(x0), y: Math.round(y0), w: Math.round(sc * TT.w) };
    TF.el.style.setProperty('--tt-x', TF.box.x + 'px');
    TF.el.style.setProperty('--tt-y', TF.box.y + 'px');
    TF.el.style.setProperty('--tt-w', TF.box.w + 'px');
  }

  function setTT(o, a, want) {
    a = Math.round(a * 1000) / 1000;
    if (a !== o.a) { o.a = a; o.box.style.opacity = String(a); }
    var vis = a > 0 || (!o.drawn && want);
    if (vis !== o.vis) { o.vis = vis; o.seq.visible(vis); }
    return vis;
  }

  // runs in compose(), after the section proxy is composed into `state`
  function filmCompose(P) {
    var cov = false;
    HK = 1;
    if (HF.seq) {
      var inHero = region === 'hero' && HF.ok, a = 0;
      if (inHero && HF.drawn) {
        // no WebGL: the film holds through the dive and leaves with the stage (.94-1)
        a = (isRM() ? 1 : failed ? P.opacity : P.filmA) * HF.fade;
      }
      a = Math.round(a * 1000) / 1000;
      if (a !== HF.a) { HF.a = a; HF.el.style.opacity = String(a); }
      var vis = inHero && (a > 0 || !HF.drawn);
      if (vis !== HF.vis) { HF.vis = vis; HF.seq.visible(vis); }
      if (vis) {
        var f = isRM() ? FILM_RM : filmFrame(P);
        if (!isRM() && state.peek > 0 && f < FILM_PEEK) f += (FILM_PEEK - f) * clamp(state.peek / 12, 0, 1);
        var fi = filmIndex(f);
        HF.seq.draw(isRM() ? Math.round(fi) : fi);
        HF.f = f; HF.fi = fi; HF.dive = P.dive;
        filmZoom();   // (and again from onDraw once the sequence has painted a different frame)
      }
      if (inHero && a >= 0.999) cov = true;
      // the stage's pointer parallax is gone before the dissolve, so the two frames match
      if (inHero && HF.drawn && !isRM()) HK = 1 - smooth(0, 0.03, P.dive);
    }
    if (TF.enabled) {
      var inFin = region === 'finish';
      // the lid toggle dissolves to the real-time laptop over the first ~15% of the lid's travel
      // (without WebGL there is nothing to hand the lid to: the film stays and the toggle is disabled)
      var fa = inFin ? PX.finish.film * (failed ? 1 : smooth(0.8, 0.97, IX.lidUser)) : 0, mix = state.finishMix;
      if (failed && !TF.lidOff) {
        TF.lidOff = true;
        var lb = $('[data-mac-lid]');
        if (lb) { lb.disabled = true; lb.setAttribute('title', 'Closing the lid needs WebGL, which is off in this browser'); }
      }
      // Silver lies over Space Black: opaque frames, so the swap is a straight dissolve with the stage colour
      var vb = setTT(TF.b, TF.b.drawn ? fa * (mix < 0.999 ? 1 : 0) : 0, inFin);
      var vs = setTT(TF.s, TF.s.drawn ? fa * mix : 0, inFin);
      if (vb || vs) {
        var idx = Math.round(((PX.finish.rotY + state.dragY) / DEG - TT.yaw0) / TT.step);
        idx = ((idx % TT.n) + TT.n) % TT.n;
        if (vb) TF.b.seq.draw(idx);
        if (vs) TF.s.seq.draw(idx);
      }
      if (inFin && (TF.s.a >= 0.999 || (TF.b.a >= 0.999 && mix <= 0.001))) cov = true;
    }
    covered = cov;
  }

  /* ---------------------------------------------------------------------------
   * 11. INITS (registered with core; every ScrollTrigger created synchronously)
   * ------------------------------------------------------------------------- */
  function camTo(tl, P, p, pos, dur, ease) {
    tl.to(P.cam, { x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz, fov: p.fov, fit: p.fit || FIT, ox: p.ox || 0, oy: p.oy || 0, duration: dur, ease: ease || 'sine.inOut' }, pos);
  }

  function initHero(A) {
    stageEl = $('[data-mac-stage]'); canvasEl = $('[data-mac-canvas]'); fallbackEl = $('[data-mac-fallback]');
    var hero = $('#hero'), g = A.gsap || W.gsap, STc = A.ScrollTrigger || W.ScrollTrigger;
    if (!g || !STc) return;
    g.ticker.add(tick);
    bindPointer();
    if (!hero) return;
    bindPeek(hero);

    var P = PX.hero;
    var title = $('.hero__title', hero), eyebrow = $('.hero__eyebrow', hero), sub = $('.hero__sub', hero);
    var peekBtn = $('[data-mac-peek]', hero), cue = $('.hero__cue', hero), boxes = $$('.hero__letterbox', hero);
    heroFilmInit();

    if (A.reducedMotion) {
      // RM still: lid 108, pose B, screen on, no dive
      P.lid = LID_OPEN; P.screenOn = 1; P.exposure = 1; P.envRot = 0.2; P.sweepI = 0; P.cam = camCopy(POSES.B);
      ST.v1 = STc.create({ trigger: hero, start: 'top top', end: 'bottom top' });
      if (title) title.style.setProperty('--sweep', '50%');
      return;
    }

    // V1: stage visible from the hero top to the pin end (created before the pin so it measures the unpinned hero)
    ST.v1 = STc.create({ trigger: hero, start: 'top top', end: pinEnd(4.0), invalidateOnRefresh: true, onToggle: markDirty });
    var tl = g.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero, start: 'top top', end: pinEnd(4.0), pin: true, scrub: 1,
        invalidateOnRefresh: true, onUpdate: markDirty
      }
    });
    ST.hero = tl.scrollTrigger;

    // .00-.20 light sweep over the closed lid
    tl.to(P, { sweepX: 50, envRot: 0.9, duration: 0.2 }, 0);
    if (title) tl.fromTo(title, { '--sweep': '0%' }, { '--sweep': '100%', duration: 0.2, immediateRender: false }, 0);
    if (boxes.length) tl.fromTo(boxes, { scaleY: 0 }, { scaleY: 1, duration: 0.2, immediateRender: false }, 0);
    // .20-.30 magnetic release; the copy leaves at layered speeds
    tl.to(P, { lid: 10, duration: 0.1, ease: 'power2.in' }, 0.2);
    tl.to(P, { sweepI: 0, duration: 0.3, ease: 'power1.in' }, 0.2);
    if (title) tl.fromTo(title, { y: 0, opacity: 1 }, { y: function () { return -0.08 * W.innerHeight; }, opacity: 0, duration: 0.1, immediateRender: false }, 0.2);
    if (eyebrow) tl.fromTo(eyebrow, { y: 0, opacity: 1 }, { y: function () { return -0.14 * W.innerHeight; }, opacity: 0, duration: 0.1, immediateRender: false }, 0.2);
    if (sub) tl.fromTo(sub, { opacity: 1 }, { opacity: 0, duration: 0.08, immediateRender: false }, 0.2);
    // .30-.55 lid opens, camera A -> B
    tl.to(P, { lid: LID_OPEN, duration: 0.25 }, 0.3);
    camTo(tl, P, POSES.B, 0.3, 0.25, 'sine.inOut');
    var gone = [peekBtn, cue].filter(Boolean);
    if (gone.length) tl.fromTo(gone, { opacity: 1 }, { opacity: 0, duration: 0.25, immediateRender: false }, 0.3);
    // .55-.75 the display wakes, camera B -> C
    tl.to(P, { screenOn: 1, duration: 0.2, ease: 'power2.out' }, 0.55);
    tl.to(P, { exposure: 1, duration: 0.2 }, 0.55);
    camTo(tl, P, POSES.C, 0.55, 0.2, 'sine.inOut');
    tl.to(P, { envRot: 0.25, duration: 0.2, ease: 'sine.inOut' }, 0.55);
    // .75-.97 the dive
    tl.to(P, { dive: 1, duration: 0.22, ease: 'power2.in' }, 0.75);
    if (boxes.length) tl.to(boxes, { scaleY: 0, duration: 0.22 }, 0.75);
    // .94-1.00 the stage fades out
    tl.to(P, { opacity: 0, duration: 0.06 }, 0.94);
    // the Blender film (section 10b): its frame follows the same p, then it dissolves into this dive
    tl.to(P, { film: FILM_75, duration: 0.75 }, 0);
    tl.to(P, { filmA: 0, duration: FILM_HAND - FILM_XF }, FILM_XF);

    // reveal the hero copy after the preloader
    var revealed = false;
    function reveal() {
      if (revealed) return; revealed = true;
      try {
        if (title && A.splitReveal) A.splitReveal(title, { type: 'lines' });
        var rest = [eyebrow, sub, peekBtn, cue].filter(Boolean);
        g.fromTo(rest, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.25, clearProps: 'clipPath' });
      } catch (e) { /* copy stays visible */ }
    }
    on('preloader:done', reveal);
  }

  function initFinish(A) {
    var g = A.gsap || W.gsap, STc = A.ScrollTrigger || W.ScrollTrigger;
    if (!g || !STc) return;
    stageEl = stageEl || $('[data-mac-stage]');
    var material = $('#material'), finish = $('#finish'), finale = $('#finale');
    ttInit();
    bindFinishUI();
    // with the turntable film the hold matches its frames: lid at 108 and the display fully on
    var holdLid = TF.enabled ? LID_OPEN : 105, holdScreen = TF.enabled ? 1 : 0.6;

    // #material is pinned by sections.js (order 80). A trigger whose element is itself a pin gets its
    // endTrigger offsets measured as if inside that pin, so measure from the pin-spacer instead, and
    // resolve the far ends with functions that run after the later pins (refreshPriority -1).
    var mTrig = material && material.parentNode && material.parentNode.classList && material.parentNode.classList.contains('pin-spacer') ? material.parentNode : material;
    function finishStart() { return ST.finish ? ST.finish.start : (finish ? finish.getBoundingClientRect().top + scrollY() : 0); }
    function finaleGone() {
      if (ST.finale) return ST.finale.end + (ST.finale.pin && finale ? finale.offsetHeight : 0);
      return finale ? finale.getBoundingClientRect().bottom + scrollY() : DOC.documentElement.scrollHeight;
    }

    // V2: #material top-bottom -> #finale bottom-top
    if (mTrig) {
      ST.v2 = STc.create({ trigger: mTrig, start: 'top bottom', end: finaleGone, invalidateOnRefresh: true, refreshPriority: -1, onToggle: markDirty });
    }

    // #material state trigger (no pin): lid 0, pose M, rotY pi-.4 -> pi
    var PM = PX.material;
    if (mTrig) {
      if (A.reducedMotion) {
        PM.rotY = Math.PI; PM.sweepX = 8; PM.envRot = 0.35;
        ST.material = STc.create({ trigger: mTrig, start: 'top bottom', end: finishStart, refreshPriority: -1 });
      } else {
        var tm = g.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: mTrig, start: 'top bottom', end: finishStart, scrub: 1, invalidateOnRefresh: true, refreshPriority: -1, onUpdate: markDirty }
        });
        tm.to(PM, { rotY: Math.PI, duration: 1 }, 0);
        tm.fromTo(PM, { sweepX: -50 }, { sweepX: 50, duration: 0.8, ease: 'sine.inOut', immediateRender: false }, 0.1);
        tm.fromTo(PM, { envRot: -0.5 }, { envRot: 0.35, duration: 1, immediateRender: false }, 0);
        // (the sweep bar is handed to #finish, which slides it off the lid as the camera lifts)
        ST.material = tm.scrollTrigger;
      }
    }

    // #finish pin: cam M -> F, rotY pi -> .35, lid 0 -> 105, screen 0 -> .6
    var PF = PX.finish;
    if (!finish) return;
    if (A.reducedMotion) {
      PF.cam = phonePose(POSES.F); PF.rotY = 0.35; PF.lid = holdLid; PF.screenOn = holdScreen; PF.envK = 1; PF.sweepI = 0; PF.yaw = -0.26;
      PF.film = TF.enabled ? 1 : 0;
      ST.finish = STc.create({ trigger: finish, start: 'top top', end: 'bottom top', onLeaveBack: function () { resetInteraction(0.3); } });
    } else {
      var tf = g.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: finish, start: 'top top', end: pinEnd(1.5), pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: markDirty,
          onLeaveBack: function () { resetInteraction(0.6); }
        }
      });
      camTo(tf, PF, phonePose(POSES.F), 0, 0.6, 'power2.inOut');
      tf.to(PF, { rotY: 0.35, duration: 0.6, ease: 'power2.inOut' }, 0);
      // the lid waits until the camera has left the top-down view, so it never swings up into the lens
      tf.to(PF, { lid: holdLid, duration: 0.4, ease: 'power2.inOut' }, 0.2);
      tf.to(PF, { screenOn: holdScreen, duration: 0.25, ease: 'power2.out' }, 0.38);
      tf.to(PF, { envK: 1, duration: 0.45, ease: 'sine.inOut' }, 0);
      tf.to(PF, { sweepX: 95, sweepI: 0, duration: 0.35, ease: 'power1.in' }, 0);
      tf.to(PF, { envRot: 0.55, duration: 0.6, ease: 'sine.inOut' }, 0);
      // the studio turns with the camera move (no pop at the #material hand-off, which starts at yaw 0)
      tf.to(PF, { yaw: -0.26, duration: 0.6, ease: 'sine.inOut' }, 0);
      tf.to({}, { duration: 0.4 }, 0.6);   // hold: the visitor drives it
      if (TF.enabled) {
        // the Cycles turntable takes over once the camera has landed, and hands the real-time laptop back
        // (at #finale's own lid and display values) before the pin releases, since the stage stays fixed
        tf.to(PF, { film: 1, duration: 0.06 }, 0.6);
        tf.to(PF, { film: 0, lid: 105, screenOn: 0.6, duration: 0.05 }, 0.95);
      }
      ST.finish = tf.scrollTrigger;
    }
    setFinish(MacScene.finish, { immediate: true, silent: true });
  }

  function initFinale(A) {
    var g = A.gsap || W.gsap, STc = A.ScrollTrigger || W.ScrollTrigger;
    if (!g || !STc) return;
    var finale = $('#finale'); if (!finale) return;
    var P = PX.finale;
    P.envRot = PX.finish.envRot + (A.reducedMotion ? 0 : 0.2);
    var roll = $('[data-finale-roll]', finale), line = $('[data-finale-line]', finale);
    var copyKids = $$('.finale__copy > *', finale);
    // "Back to the lid" (SPEC 4 #finale): a long eased flight home
    var topBtn = $('[data-scroll-top]', finale);
    if (topBtn) topBtn.addEventListener('click', function () {
      var AA = app() || A;
      if (AA && typeof AA.scrollTo === 'function') AA.scrollTo(0, { duration: 2.2 });
      else W.scrollTo(0, 0);
      var mark = $('.nav__mark');
      if (mark) { try { mark.focus({ preventScroll: true }); } catch (e) { /* noop */ } }
    });
    if (A.reducedMotion) {
      P.lid = 0; P.screenOn = 0; P.sweepI = 0.6; P.cam = camCopy(isMobile() ? POSES.E : POSES.Ed); P.rotY = 0.35;
      if (!isMobile()) P.cam.x = P.cam.tx = 8.6 * (W.innerWidth / Math.max(1, W.innerHeight));
      ST.finale = STc.create({ trigger: finale, start: 'top top', end: 'bottom top' });
      if (line) g.set(line, { scaleX: 1 });
      return;
    }
    var tl = g.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: finale, start: 'top top', end: pinEnd(1.5), pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: markDirty,
        onEnter: function () { var gg = G(); IX.vDrag = 0; if (gg) gg.to(state, { dragY: 0, dragX: 0, duration: 1.2, ease: 'power3.inOut', overwrite: 'auto', onUpdate: markDirty }); }
      }
    });
    // phones/tablets stack the credits over the whole frame, so there the lid closes first and the
    // stage bows out before the copy rises (desktop keeps the lid in its own quarter until .85)
    var stack = isMobile();
    tl.to(P, { lid: 0, duration: stack ? 0.34 : 0.6, ease: 'power2.inOut' }, 0);
    // the panel goes dark first, so the credits never sit on top of a lit screen
    tl.to(P, { screenOn: 0, duration: 0.28, ease: 'power1.in' }, 0);
    // as the lid comes down the finale strip light fades up: one long streak across the closed lid
    tl.fromTo(P, { sweepI: 0 }, { sweepI: 0.6, duration: 0.4, ease: 'sine.inOut', immediateRender: false }, 0.2);
    if (isMobile()) camTo(tl, P, POSES.E, 0, 0.6, 'power2.inOut');
    else {
      // desktop: the closing lid rides up and left into the free quarter above the credits heading,
      // clear of the spec roll on the right (the pan is re-measured per aspect on refresh)
      var Ed = POSES.Ed, pan = function () { return 8.6 * (W.innerWidth / Math.max(1, W.innerHeight)); };
      tl.to(P.cam, { x: pan, y: Ed.y, z: Ed.z, tx: pan, ty: Ed.ty, tz: Ed.tz, fov: Ed.fov, ox: 0, duration: 0.5, ease: 'power2.inOut' }, 0);
    }
    tl.to(P, { rotY: 0, duration: 0.6, ease: 'power2.inOut' }, 0);
    // one soft highlight travels over the closing lid, so it lands as a lit object and not a flat slab
    tl.fromTo(P, { sweepX: -60 }, { sweepX: 45, duration: 0.7, ease: 'sine.inOut', immediateRender: false }, 0.3);
    tl.to(P, { sweepI: 0.6, duration: 0.3, ease: 'sine.out' }, 0.3);
    // the closing copy rises in once the lid is on its way down (layered: heading first, actions last)
    // (opacity, not autoAlpha: the CTA stays in the tab order and the list in the accessibility tree)
    if (copyKids.length) tl.fromTo(copyKids, { opacity: 0, y: function () { return 0.06 * W.innerHeight; } },
      { opacity: 1, y: 0, duration: 0.2, stagger: 0.035, ease: 'power2.out' }, 0.3);
    if (roll) {
      tl.fromTo(roll, { y: function () { return 0.3 * W.innerHeight; } }, { y: function () { return -0.3 * W.innerHeight; }, duration: 0.8 }, 0.2);
      tl.fromTo(roll, { opacity: 0 }, { opacity: 1, duration: 0.14 }, 0.26);
    }
    // keyboard: tabbing into the closing copy before it has risen flies to where it is readable
    finale.addEventListener('focusin', function (e) {
      var st = tl.scrollTrigger, AA = app() || A;
      if (!st || !e.target.closest || !e.target.closest('.finale__copy')) return;
      if (tl.progress() < 0.5 && AA && AA.scrollTo) AA.scrollTo(st.start + 0.62 * (st.end - st.start), { duration: 0.9 });
    });
    if (line) tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, 0.6);
    tl.to(P, { opacity: 0, duration: stack ? 0.14 : 0.15 }, stack ? 0.3 : 0.85);
    ST.finale = tl.scrollTrigger;
  }

  /* ---------------------------------------------------------------------------
   * 12. REGISTRATION + THREE BOOT
   * ------------------------------------------------------------------------- */
  function safe(fn) { return function (A) { try { fn(A || app()); } catch (e) { if (W.console) console.error('[macbook]', e); } }; }
  var A0 = app();
  if (A0 && typeof A0.register === 'function') {
    A0.register('mac-hero', safe(initHero), { order: 10 });
    A0.register('mac-finish', safe(initFinish), { order: 90 });
    A0.register('mac-finale', safe(initFinale), { order: 100 });
  }

  function startThree() {
    var A = app(), got = false;
    function go(res) {
      if (got) return;
      var THREE = (res && res.THREE) || W.THREE, ADDONS = (res && res.ADDONS) || W.THREE_ADDONS || {};
      // whenThree() resolves null once three is known to be unavailable: fall back now, not at the timeout
      if (!THREE) { if (res === null) showFallback('three unavailable'); return; }
      got = true;
      canvasEl = canvasEl || $('[data-mac-canvas]'); stageEl = stageEl || $('[data-mac-stage]'); fallbackEl = fallbackEl || $('[data-mac-fallback]');
      try { boot(THREE, ADDONS); } catch (e) { if (W.console) console.error('[macbook] boot', e); showFallback('boot error'); }
    }
    if (W.THREE) { go({ THREE: W.THREE, ADDONS: W.THREE_ADDONS }); return; }
    if (A && typeof A.whenThree === 'function') {
      try { A.whenThree().then(go, function () { /* timeout below handles it */ }); } catch (e) { /* fall through */ }
    }
    W.addEventListener('three:ready', function () { go({ THREE: W.THREE, ADDONS: W.THREE_ADDONS }); });
    // if three never arrives (CDN blocked), show the SVG and release the preloader gate
    setTimeout(function () { if (!got) showFallback('three unavailable'); }, 6500);
  }

  function onReadyDom() {
    stageEl = $('[data-mac-stage]'); canvasEl = $('[data-mac-canvas]'); fallbackEl = $('[data-mac-fallback]');
    if (!canvasEl) return;
    startThree();
    on('resize', function () { if (R) { R.lastW = 0; resize(); } heroFilmInit(); placeTurntable(); markDirty(); });
    W.addEventListener('resize', function () { if (R) resize(); markDirty(); });
  }
  if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', onReadyDom);
  else onReadyDom();
})();
