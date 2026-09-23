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
  function phonePose(p) { var c = camCopy(p); if (isMobile()) { c.x -= c.tx; c.tx = 0; c.oy = 0.085; } return c; }
  // oy: screen-space lift (fraction of the frame height) applied as a view offset, so a phone layout can
  // seat the laptop between its top and bottom copy without changing the perspective
  function camCopy(p) { return { x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz, fov: p.fov, fit: p.fit || 20.5, oy: p.oy || 0 }; }

  /* ---------------------------------------------------------------------------
   * 1. PUBLIC STATE + API (exists synchronously)
   * ------------------------------------------------------------------------- */
  var state = {
    lid: 0, peek: 0, rotY: 0, tiltX: 0, dragY: 0, dragX: 0, envRot: -0.9, envRotPointer: 0, sweepX: -50,
    screenOn: 0, exposure: 0.7, dive: 0, opacity: 1, finishMix: 0, visible: true,
    cam: camCopy(POSES.A)
  };
  // one proxy per section; only the active one is composed into `state`
  var PX = {
    hero: { lid: 0, rotY: 0, envRot: -0.9, sweepX: -50, screenOn: 0, exposure: 0.7, dive: 0, opacity: 1, sweepI: 1, cam: camCopy(POSES.A) },
    // envK scales the studio reflections: top-down, the overhead softbox otherwise flattens the lid to a
    // uniform grey, so #material runs darker and lets the sweep bar do the modelling
    material: { lid: 0, rotY: Math.PI - 0.4, envRot: -0.5, sweepX: -50, screenOn: 0, exposure: 1, dive: 0, opacity: 1, sweepI: 0.9, envK: 0.42, cam: camCopy(POSES.M) },
    finish: { lid: 0, rotY: Math.PI, envRot: 0.35, sweepX: 50, screenOn: 0, exposure: 1, dive: 0, opacity: 1, sweepI: 0.9, envK: 0.42, cam: camCopy(POSES.M) },
    finale: { lid: 105, rotY: 0.35, envRot: 0.35, sweepX: 0, screenOn: 0.6, exposure: 1, dive: 0, opacity: 1, sweepI: 0, cam: phonePose(POSES.F) }
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
    getState: function () { return state; }
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
    // bead-blast roughness: tileable value noise + fine grain, centred on `base`
    function noiseTex(size, amp, base) {
      var c = canvas(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), grid = 64, g = [], i;
      for (i = 0; i < grid * grid; i++) g.push(Math.random());
      function vn(px, py, sc) {
        var gx = px / size * sc, gy = py / size * sc, x0 = Math.floor(gx), y0 = Math.floor(gy);
        var fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        function Gv(a, b) { return g[((b % sc + sc) % sc) * grid + ((a % sc + sc) % sc)]; }
        return Gv(x0, y0) * (1 - fx) * (1 - fy) + Gv(x0 + 1, y0) * fx * (1 - fy) + Gv(x0, y0 + 1) * (1 - fx) * fy + Gv(x0 + 1, y0 + 1) * fx * fy;
      }
      for (var py = 0; py < size; py++) for (var px = 0; px < size; px++) {
        var v = vn(px, py, 32) * 0.3 + vn(px, py, 64) * 0.3 + 0.2 + (Math.random() - 0.5) * 0.7;
        var o = clamp((base + (v - 0.5) * amp) * 255, 0, 255), k = (py * size + px) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = o; img.data[k + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
      return t;
    }
    // speaker perforations: staggered dot grid (alpha)
    function grilleTex() {
      var c = canvas(128, 2048), x = c.getContext('2d'), cols = 8, pitch = 128 / cols, rows = Math.floor(2048 / pitch);
      x.fillStyle = '#fff';
      for (var r = 0; r < rows; r++) for (var k = 0; k < cols; k++) {
        var cx = k * pitch + pitch / 2 + (r % 2 ? pitch / 4 : -pitch / 4), cy = r * pitch + pitch / 2;
        x.beginPath(); x.arc(cx, cy, pitch * 0.26, 0, Math.PI * 2); x.fill();
      }
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
      return t;
    }
    function textTex(text, w, h, font, color) {
      var c = canvas(w, h), x = c.getContext('2d');
      x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, w / 2, h / 2 + 2);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return t;
    }

    /* ---------- materials ---------- */
    var rough = noiseTex(512, 0.08, 0.8);    // effective roughness = material.roughness * ~0.8 (+-.04)
    rough.repeat.set(0.3, 0.3);
    var bump = noiseTex(256, 0.5, 0.5);
    bump.repeat.set(1.6, 1.6);
    var RMc = 1 / 0.8;                        // compensates the roughness map mean
    var M = {};
    M.shell = new THREE.MeshPhysicalMaterial({ color: 0x2b2a2d, metalness: 0.9, roughness: 0.44 * RMc, roughnessMap: rough,
      bumpMap: bump, bumpScale: 0.0004, clearcoat: 0.1, clearcoatRoughness: 0.4 });
    M.side = new THREE.MeshPhysicalMaterial({ color: 0x2b2a2d, metalness: 0.9, roughness: 0.36 * RMc, roughnessMap: rough,
      clearcoat: 0.1, clearcoatRoughness: 0.4 });
    M.edge = new THREE.MeshPhysicalMaterial({ color: 0x2b2a2d, metalness: 0.92, roughness: 0.22, clearcoat: 0.15, clearcoatRoughness: 0.25, envMapIntensity: 1.4 });
    M.trackpad = new THREE.MeshPhysicalMaterial({ color: 0x2b2a2d, metalness: 0.85, roughness: 0.4, clearcoat: 0.12, clearcoatRoughness: 0.3 });
    M.well = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.1, roughness: 0.8 });
    M.gap = new THREE.MeshStandardMaterial({ color: 0x020202, metalness: 0, roughness: 1 });
    M.key = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, metalness: 0, roughness: 0.58, clearcoat: 0.15, clearcoatRoughness: 0.55, specularIntensity: 0.55 });
    M.hinge = new THREE.MeshPhysicalMaterial({ color: 0x0e0e0f, metalness: 0.6, roughness: 0.38, clearcoat: 0.3 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.92 });
    M.port = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.85,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.grille = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, alphaMap: grilleTex(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0x050505, metalness: 0, roughness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.05, envMapIntensity: 0.55 });
    M.screen = new THREE.MeshPhysicalMaterial({ color: 0x050505, metalness: 0, roughness: 0.05, clearcoat: 0, clearcoatRoughness: 0.05,
      emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 0.4,
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
          '    float sx = f.x * 3.0;',
          '    vec3 stripe = vec3( 1.0 - smoothstep( 0.8, 1.0, sx ), smoothstep( 1.0, 1.2, sx ) * ( 1.0 - smoothstep( 1.8, 2.0, sx ) ), smoothstep( 2.0, 2.2, sx ) * ( 1.0 - smoothstep( 2.8, 3.0, sx ) ) );',
          '    float gap = smoothstep( 0.02, 0.14, f.y ) * ( 1.0 - smoothstep( 0.86, 0.98, f.y ) );',
          '    vec3 sub = cellC * stripe * 2.6 * gap + cellC * 0.06;',
          '    emissiveColor.rgb = mix( emissiveColor.rgb, sub, uPixel );',
          '   }',
          '  }',
          '  totalEmissiveRadiance *= emissiveColor.rgb;',
          '#endif'
        ].join('\n'));
    };
    M.screen.customProgramCacheKey = function () { return 'mbp14-screen'; };
    M.chin = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.5,
      map: textTex('MacBook Pro', 1024, 96, '500 58px -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', '#b4b4ba'),
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    M.lens = new THREE.MeshPhysicalMaterial({ color: 0x06080d, metalness: 0.3, roughness: 0.08, clearcoat: 1 });

    var model = new THREE.Group(); model.name = 'MacBookPro14';
    var base = new THREE.Group(); model.add(base);
    var buckets = {};
    function add(key, geo) { (buckets[key] = buckets[key] || []).push(geo); }

    /* ---------- base shell ---------- */
    var B0 = DIM.feet, T = DIM.baseTop, rt = 0.05, rb = 0.3;
    var edgeProf = arc([], rt, T - rt, rt, Math.PI / 2, 0, 5);          // top chamfer (polished edge)
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
    add('shell', capUp(top, T, 24));
    add('shell', capDown(rrShape(DIM.W - 2 * rb, DIM.D - 2 * rb, DIM.R - rb, 0, 0, false), B0, 20));

    // keyboard well: polished lip + dark wall + floor
    var wOut = flipOutline(rrOutline(wellW, wellD, wellR, 10, 0, kbCZ));
    add('edge', sweep(wOut, arc([], wrc, T - wrc, wrc, Math.PI / 2, 0, 4)));
    add('well', sweep(wOut, [{ d: 0, y: T - wrc, nx: 1, ny: 0 }, { d: 0, y: T - wellDepth, nx: 1, ny: 0 }]));
    add('well', capUp(rrShape(wellW, wellD, wellR, 0, kbCZ, true), T - wellDepth, 10));

    // Force Touch trackpad: hairline gap + slightly inset slab
    var tOut = flipOutline(rrOutline(tpW + 2 * tpGap, tpD + 2 * tpGap, tpR + tpGap, 12, 0, tpCZ));
    add('gap', sweep(tOut, [{ d: 0, y: T, nx: 1, ny: 0 }, { d: 0, y: T - 0.1, nx: 1, ny: 0 }]));
    var tpT = T - 0.02, tpr = 0.03;
    var tpProf = arc([], tpr, tpT - tpr, tpr, Math.PI / 2, 0, 4);
    tpProf.push({ d: 0, y: T - 0.1, nx: 1, ny: 0 });
    add('trackpad', sweep(rrOutline(tpW, tpD, tpR, 12, 0, tpCZ), tpProf));
    add('trackpad', capUp(rrShape(tpW - 2 * tpr, tpD - 2 * tpr, tpR - tpr, 0, tpCZ, true), tpT, 12));

    // speaker grilles either side of the well
    var grW = 1.02, grD = kbD - 0.6, grX = wellW / 2 + (DIM.W / 2 - wellW / 2) * 0.5 + 0.02;
    [-1, 1].forEach(function (s) {
      add('grille', tf(new THREE.PlaneGeometry(grW, grD), function (g) { g.rotateX(-Math.PI / 2); g.translate(s * grX, T + 0.0006, kbCZ + 0.15); }));
    });

    // rubber feet
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      add('rubber', tf(new THREE.CylinderGeometry(0.9, 0.9, DIM.feet + 0.02, 40), function (g) {
        g.translate(q[0] * (DIM.W / 2 - 2.4), (DIM.feet + 0.02) / 2 - 0.001, q[1] * (DIM.D / 2 - 2.2));
      }));
    });

    // ports (geometry only), on the flat side wall band
    var portY = B0 + rb + (T - rt - B0 - rb) * 0.5;
    function port(side, z, w, h) {
      var r = Math.min(h / 2, w / 2) * 0.98;
      add('port', tf(new THREE.ShapeGeometry(rrShape(w, h, r, 0, 0, false), 10), function (g) {
        g.rotateY(side * Math.PI / 2); g.translate(side * (DIM.W / 2 + 0.0015), portY, z);
      }));
    }
    var zb = -DIM.D / 2;
    port(-1, zb + 2.7, 1.6, 0.3);    // MagSafe 3
    port(-1, zb + 5.0, 0.9, 0.3);    // Thunderbolt 4
    port(-1, zb + 6.6, 0.9, 0.3);    // Thunderbolt 4
    port(-1, zb + 15.6, 0.36, 0.36); // 3.5 mm jack
    port(1, zb + 3.3, 1.5, 0.4);     // HDMI
    port(1, zb + 5.5, 0.9, 0.3);     // Thunderbolt 4
    port(1, zb + 13.3, 2.45, 0.16);  // SDXC

    // hinge barrel (r .32, length 24)
    add('hinge', tf(new THREE.CapsuleGeometry(0.32, 23.36, 6, 28), function (g) { g.rotateZ(Math.PI / 2); g.translate(0, DIM.pivotY - 0.04, DIM.pivotZ); }));

    var baseMats = { shell: M.shell, side: M.side, edge: M.edge, well: M.well, gap: M.gap, trackpad: M.trackpad, grille: M.grille, rubber: M.rubber, port: M.port, hinge: M.hinge };
    Object.keys(buckets).forEach(function (k) {
      var mesh = new THREE.Mesh(merge(buckets[k]), baseMats[k]);
      if (k === 'grille') mesh.renderOrder = 2;
      base.add(mesh);
    });
    buckets = {};

    // keycaps: one InstancedMesh; widths applied 9-slice style in the vertex shader
    var kW0 = UX - gapX, kD0 = UZ - gapZ, kr = 0.17, kT = 0.12, kEdge = 0.04;
    var kProf = arc([], kEdge, kT - kEdge, kEdge, Math.PI / 2, 0, 4);
    kProf.push({ d: 0, y: 0, nx: 1, ny: 0 });
    var keyGeo = merge([sweep(rrOutline(kW0, kD0, kr, 5), kProf), capUp(rrShape(kW0 - 2 * kEdge, kD0 - 2 * kEdge, kr - kEdge, 0, 0, true), kT, 5)]);
    var keys = [];
    rows.forEach(function (row, ri) {
      var x = -kbW / 2, zc = kbZ0 + ri * UZ + UZ / 2, half = UZ / 2 - gapZ * 0.75;
      row.forEach(function (k) {
        var w;
        if (k === 'L' || k === 'R') { keys.push({ x: x + UX / 2, z: zc + UZ / 4 - gapZ * 0.12, w: kW0, d: half }); x += UX; return; }
        if (k === 'UD') {
          keys.push({ x: x + UX / 2, z: zc - UZ / 4 + gapZ * 0.12, w: kW0, d: half });
          keys.push({ x: x + UX / 2, z: zc + UZ / 4 - gapZ * 0.12, w: kW0, d: half });
          x += UX; return;
        }
        w = k * UX - gapX;
        keys.push({ x: x + k * UX / 2, z: zc, w: w, d: kD0 });
        x += k * UX;
      });
    });
    // legends (US layout), one atlas cell per key at the key's own aspect ratio
    var LEG = [
      ['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', ''],
      [['~', '`'], ['!', '1'], ['@', '2'], ['#', '3'], ['$', '4'], ['%', '5'], ['^', '6'], ['&', '7'], ['*', '8'], ['(', '9'], [')', '0'], ['_', '–'], ['+', '='], 'delete>'],
      ['tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', ['{', '['], ['}', ']'], ['|', '\\']],
      ['caps lock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', [':', ';'], ['"', "'"], 'return>'],
      ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ['<', ','], ['>', '.'], ['?', '/'], 'shift>'],
      ['fn', ['⌃', 'control'], ['⌥', 'option'], ['⌘', 'command'], '', ['⌘', 'command>'], ['⌥', 'option>'], '◀', '▲', '▼', '▶']
    ];
    var legends = [];
    LEG.forEach(function (row) { row.forEach(function (l) { legends.push(l); }); });
    var ATW = 2048, ATH = 1024, CH_PX = 104, atlas = canvas(ATW, ATH), ax = atlas.getContext('2d');
    var FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
    ax.fillStyle = '#fff'; ax.textBaseline = 'middle';
    var cx0 = 0, cy0 = 0, cells = [];
    keys.forEach(function (k, i) {
      var cw = Math.round(CH_PX * k.w / k.d);
      if (cx0 + cw > ATW) { cx0 = 0; cy0 += CH_PX + 4; }
      var c = { x: cx0, y: cy0, w: cw, h: CH_PX };
      cells.push(c); cx0 += cw + 4;
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
      } else if (L.length === 1) {
        txt(L, /[▲▶▼◀]/.test(L) ? h * 0.3 : h * 0.26, c.x + c.w / 2, c.y + h / 2, 'center');
      } else if (/^F\d/.test(L)) {
        txt(L, h * 0.15, c.x + c.w / 2, c.y + h * 0.74, 'center');
        ax.beginPath(); ax.arc(c.x + c.w / 2, c.y + h * 0.36, h * 0.075, 0, Math.PI * 2);
        ax.lineWidth = h * 0.025; ax.strokeStyle = '#fff'; ax.stroke();
      } else if (L) {
        var r2 = /\>$/.test(L), w2 = L.replace('>', '');
        txt(w2, h * 0.15, r2 ? c.x + c.w - pad : c.x + pad, c.y + h - pad - h * 0.05, r2 ? 'right' : 'left');
      }
    });
    var legendTex = new THREE.CanvasTexture(atlas);
    legendTex.colorSpace = THREE.NoColorSpace; legendTex.anisotropy = 8;
    var kMesh = new THREE.InstancedMesh(keyGeo, M.key, keys.length);
    var ext = new Float32Array(keys.length * 2), leg = new Float32Array(keys.length * 4), mtx = new THREE.Matrix4();
    keys.forEach(function (k, i) {
      mtx.makeTranslation(k.x, T - wellDepth + 0.075, k.z);
      kMesh.setMatrixAt(i, mtx);
      ext[i * 2] = (k.w - kW0) / 2; ext[i * 2 + 1] = (k.d - kD0) / 2;
      var c = cells[i];
      leg[i * 4] = c.x / ATW; leg[i * 4 + 1] = 1 - (c.y + c.h) / ATH; leg[i * 4 + 2] = (c.x + c.w) / ATW; leg[i * 4 + 3] = 1 - c.y / ATH;
    });
    keyGeo.setAttribute('aKeyExt', new THREE.InstancedBufferAttribute(ext, 2));
    keyGeo.setAttribute('aLegend', new THREE.InstancedBufferAttribute(leg, 4));
    var legendU = { value: legendTex };
    M.key.onBeforeCompile = function (sh) {
      sh.uniforms.uLegend = legendU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aKeyExt;\nattribute vec4 aLegend;\nvarying vec2 vLegUv;\nvarying float vTop;')
        .replace('#include <begin_vertex>', [
          'vec3 transformed = vec3(position);',
          'transformed.x += sign(position.x) * aKeyExt.x;',
          'transformed.z += sign(position.z) * aKeyExt.y;',
          'vec2 hw = vec2(' + (kW0 / 2).toFixed(4) + ' + aKeyExt.x, ' + (kD0 / 2).toFixed(4) + ' + aKeyExt.y);',
          'vec2 luv = vec2((transformed.x + hw.x) / (2.0 * hw.x), 1.0 - (transformed.z + hw.y) / (2.0 * hw.y));',
          'vLegUv = mix(aLegend.xy, aLegend.zw, luv);',
          'vTop = smoothstep(0.97, 0.995, normal.y);'
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uLegend;\nvarying vec2 vLegUv;\nvarying float vTop;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat legA = texture2D(uLegend, vLegUv).a * vTop;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42), legA * 0.9);');
    };
    M.key.customProgramCacheKey = function () { return 'mbp14-key'; };
    kMesh.frustumCulled = false;
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
    add('side', sweep(lidOut, lidSide));
    add('shell', capUp(rrShape(DIM.W - 2 * lro, DIM.D - 2 * lro, DIM.R - lro, 0, lidCZ, true), y0 + LT, 24));
    add('side', capDown(rrShape(DIM.W - 2 * lri, DIM.D - 2 * lri, DIM.R - lri, 0, lidCZ, false), y0, 20));
    // black glass bezel 30.6 x 21.5 with a thin lip
    var gy = y0 - 0.012, gR = DIM.R - (DIM.W - DIM.glassW) / 2;
    add('glass', capDown(rrShape(DIM.glassW, DIM.glassD, gR, 0, lidCZ, false), gy, 24));
    add('glass', sweep(rrOutline(DIM.glassW, DIM.glassD, gR, 12, 0, lidCZ), [{ d: 0, y: gy, nx: 1, ny: 0 }, { d: 0, y: y0 + 0.001, nx: 1, ny: 0 }]));
    var lidMats = { edge: M.edge, side: M.side, shell: M.shell, glass: M.glass };
    var lid = new THREE.Group(); pivot.add(lid);
    Object.keys(buckets).forEach(function (k) { lid.add(new THREE.Mesh(merge(buckets[k]), lidMats[k])); });
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
    lid.add(screen);
    // camera lens in the notch (notch itself is black glass, painted in the texture)
    var lens = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), M.lens);
    lens.scale.set(1, 0.25, 1);
    lens.position.set(0, gy - 0.004, sTop - 0.4);
    lid.add(lens);
    // chin wordmark
    var chin = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.375), M.chin);
    chin.rotation.set(Math.PI / 2, 0, 0);
    chin.position.set(0, gy - 0.002, (sBot + (lidCZ - DIM.glassD / 2)) / 2);
    lid.add(chin);

    return {
      model: model, base: base, pivot: pivot, lid: lid, screen: screen, keys: kMesh, M: M,
      local: { screenY: gy - 0.0015 }
    };
  }

  /* ---------------------------------------------------------------------------
   * 4. STUDIO ENVIRONMENT (procedural softboxes -> PMREM once)
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

  function boot(THREE, ADDONS) {
    if (R || failed) return;
    if (!canvasEl) return;
    if (!hasWebGL()) { showFallback('no webgl'); return; }
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { showFallback('renderer'); return; }
    if (!renderer.getContext()) { showFallback('context'); return; }
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = state.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    var dpr = Math.min(W.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
    renderer.setPixelRatio(dpr);

    var scene = new THREE.Scene(), envTex = null;
    try { envTex = buildStudioEnv(THREE, renderer); }
    catch (e) {
      if (ADDONS && ADDONS.RoomEnvironment) {
        var pm = new THREE.PMREMGenerator(renderer);
        envTex = pm.fromScene(new ADDONS.RoomEnvironment(), 0.04).texture; pm.dispose();
      }
    }
    var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);

    var mac = buildMacBook(THREE);
    var screenTex = paintScreen(THREE);
    mac.M.screen.emissiveMap = screenTex;
    // explicit envMap per material so each material's envMapIntensity is honoured (scene.environment
    // overrides it); rotation is synced per frame through envMapRotation
    var envMats = [];
    var envGain = { shell: 1.7, side: 1.7, edge: 2.4, trackpad: 1.6, key: 1.1, hinge: 1.4 };
    ENV_GAIN_BLACK = envGain;
    Object.keys(mac.M).forEach(function (k) {
      var m = mac.M[k];
      if (m && m.isMeshStandardMaterial && envTex) {
        m.envMap = envTex; envMats.push(m);
        if (envGain[k]) m.envMapIntensity = envGain[k];
      }
    });

    // rig: yaw (drag + pointer + section) -> float/tilt -> model; shadows live on the yaw rig
    var rig = new THREE.Group(), floatG = new THREE.Group();
    rig.add(floatG); floatG.add(mac.model); scene.add(rig);

    function groundPlane(tex, w, d, y, z) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, y, z || 0); m.renderOrder = -1;
      rig.add(m);
      return m;
    }
    // 512 canvas, silhouette spans 384/512 = .75 of the plane
    var shSoft = groundPlane(shadowCanvas(THREE, 18, 0.55), DIM.W / 0.75 * 1.08, DIM.D / 0.75 * 1.1, 0.002);
    var shHard = groundPlane(shadowCanvas(THREE, 4, 0.5), DIM.W / 0.75 * 0.99, DIM.D / 0.75 * 0.99, 0.003);
    var shHinge = groundPlane(shadowCanvas(THREE, 16, 1, true), 34, 34, 0.004, DIM.pivotZ - 1.2);
    shHinge.material.opacity = 0;

    // lights: RectAreaLights only (sweep + screen spill)
    var sweepL = null, spill = null;
    if (ADDONS && ADDONS.RectAreaLightUniformsLib && THREE.RectAreaLight) {
      try {
        ADDONS.RectAreaLightUniformsLib.init();
        // sweep bar: 4 x 60 softbox travelling in x. It hangs behind and above the lid (35 cm up the
        // reflection path) so that from the low hero angle its mirror image streaks across the lid.
        sweepL = new THREE.RectAreaLight(0xffffff, 12, 5, 60);
        scene.add(sweepL);
        spill = new THREE.RectAreaLight(0xfff1e2, 0, DIM.scrW, DIM.scrH);
        spill.rotation.x = -Math.PI / 2;                           // local -z -> lid -y (screen normal)
        spill.position.set(0, mac.local.screenY - 0.05, DIM.scrC);
        mac.lid.add(spill);
      } catch (e) { sweepL = spill = null; }
    }

    R = {
      THREE: THREE, renderer: renderer, scene: scene, camera: camera, mac: mac, rig: rig, floatG: floatG,
      shSoft: shSoft, shHard: shHard, shHinge: shHinge, sweep: sweepL, spill: spill, dpr: dpr, envMats: envMats, envRotY: NaN,
      frames: [], lastW: 0, lastH: 0, firstFrame: false, bornAt: performance.now(),
      cSB: new THREE.Color(0x2b2a2d), cSV: new THREE.Color(0xd9dadc), tmp: new THREE.Color(),
      vA: new THREE.Vector3(), vB: new THREE.Vector3(), vC: new THREE.Vector3()
    };
    resize();
    applyFinishMaterials(state.finishMix);

    function first() {
      if (!R || R.firstFrame) return;
      compose(0);
      renderFrame();
      R.firstFrame = true;
      MacScene.ready = true;
      emitWhenReady('mac:firstframe', {});
    }
    try {
      var p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : null;
      if (p && p.then) p.then(first, first); else first();
    } catch (e) { first(); }
  }

  function resize() {
    if (!R) return;
    var w = (canvasEl && canvasEl.clientWidth) || W.innerWidth, h = (canvasEl && canvasEl.clientHeight) || W.innerHeight;
    if (w === R.lastW && h === R.lastH) return;
    R.lastW = w; R.lastH = h;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / Math.max(1, h);
    R.camera.updateProjectionMatrix();
    markDirty();
  }

  var ENV_GAIN_BLACK = null, ENV_GAIN_SILVER = { shell: 1.05, side: 1.1, edge: 1.3, trackpad: 1.0 };
  function applyFinishMaterials(mix) {
    if (!R) return;
    var M = R.mac.M, c = R.tmp.copy(R.cSB).lerp(R.cSV, mix), k = 1 / 0.8, ek = R.envK == null ? 1 : R.envK;
    if (ENV_GAIN_BLACK) Object.keys(ENV_GAIN_SILVER).forEach(function (n) { M[n].envMapIntensity = lerp(ENV_GAIN_BLACK[n], ENV_GAIN_SILVER[n], mix) * (n === 'edge' ? Math.sqrt(ek) : ek); });
    M.shell.color.copy(c); M.side.color.copy(c); M.edge.color.copy(c); M.trackpad.color.copy(c);
    M.shell.metalness = M.side.metalness = lerp(0.9, 1, mix); M.edge.metalness = lerp(0.92, 1, mix);
    M.shell.roughness = lerp(0.44, 0.34, mix) * k;
    M.side.roughness = lerp(0.36, 0.3, mix) * k;
    M.edge.roughness = lerp(0.22, 0.16, mix);
    M.shell.clearcoat = M.side.clearcoat = lerp(0.1, 0.02, mix);
    M.trackpad.metalness = lerp(0.85, 0.95, mix); M.trackpad.roughness = lerp(0.4, 0.3, mix);
  }

  /* ---------------------------------------------------------------------------
   * 8. COMPOSE (every tick): active proxy + interaction -> state; DOM stage
   * ------------------------------------------------------------------------- */
  var lastStageOpacity = -1, lastHidden = null, lastBg = '';
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
    state.dive = P.dive;
    state.opacity = P.opacity * IX.fade;
    var c = state.cam, pc = P.cam;
    c.x = pc.x; c.y = pc.y; c.z = pc.z; c.tx = pc.tx; c.ty = pc.ty; c.tz = pc.tz; c.fov = pc.fov; c.fit = pc.fit; c.oy = pc.oy || 0;

    // DOM: stage opacity / visibility / bg
    if (stageEl) {
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
      var bg = 'rgb(' + Math.round(lerp(VOID[0], PAPER[0], m)) + ' ' + Math.round(lerp(VOID[1], PAPER[1], m)) + ' ' + Math.round(lerp(VOID[2], PAPER[2], m)) + ')';
      if (bg !== lastBg) { stageEl.style.setProperty('--stage-bg', bg); lastBg = bg; }
    }
  }

  /* ---------------------------------------------------------------------------
   * 9. RENDER (reads state only)
   * ------------------------------------------------------------------------- */
  function renderFrame() {
    if (!R) return;
    var cam = R.camera, s = state, mac = R.mac, vA = R.vA, vB = R.vB, vC = R.vC;
    resize();

    // lid: section angle + peek (only while nearly closed)
    var peekAmt = s.peek * clamp((20 - s.lid) / 10, 0, 1);
    var lidDeg = s.lid + peekAmt;
    var th = lidDeg * DEG;
    mac.pivot.rotation.x = -th;

    // laptop rotation = rotY + dragY + pointer tilt; subtle idle float
    var t = tNow / 1000;
    var floatAmt = isRM() ? 0 : (1 - smooth(0, 0.2, s.dive)) * (region === 'material' ? 0.3 : 1) * IX.idle;
    R.rig.rotation.y = s.rotY + s.dragY + IX.ptYaw;
    R.floatG.rotation.x = s.tiltX * 0.6 + s.dragX + Math.sin(t * 0.7) * 0.0035 * floatAmt;
    R.floatG.rotation.z = Math.sin(t * 0.53 + 1.3) * 0.003 * floatAmt;
    var lift = (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.22 * floatAmt;
    R.floatG.position.y = lift;
    R.shHard.material.opacity = 1 - lift * 2.2;
    R.shSoft.material.opacity = 1 - lift * 0.8;
    R.shHinge.material.opacity = 0.4 * smooth(0, 90, lidDeg);
    R.shHinge.scale.set(1, 0.6 + 0.4 * smooth(0, 108, lidDeg), 1);

    // camera (mobile fit) and the dive
    var aspect = cam.aspect, fov = s.cam.fov;
    vA.set(s.cam.x, s.cam.y, s.cam.z); vB.set(s.cam.tx, s.cam.ty, s.cam.tz);
    var fitK = (s.cam.fit || FIT) / (Math.tan(fov * DEG / 2) * aspect);
    vC.copy(vA).sub(vB);
    var dist = vC.length();
    if (dist < fitK && dist > 1e-6) { vC.multiplyScalar(fitK / dist); vA.copy(vB).add(vC); }
    if (s.dive > 0) {
      // S + m * logLerp(d0, .6, dive), fov 35 -> 20
      var Sx = screenCentre(th), m = screenNormal(th);
      var d0 = Math.max(45, POSES.C.fit / (Math.tan(35 * DEG / 2) * aspect));
      var dd = d0 * Math.pow(0.6 / d0, s.dive);
      fov = lerp(35, 20, s.dive);
      vB.set(Sx.x, Sx.y, Sx.z);
      vA.set(Sx.x + m.x * dd, Sx.y + m.y * dd, Sx.z + m.z * dd);
    }
    cam.position.copy(vA);
    cam.lookAt(vB);
    var near = s.dive > 0.4 ? 0.02 : 0.1;
    var oy = Math.round((s.dive > 0 ? 0 : (s.cam.oy || 0)) * 1000) / 1000;
    if (oy !== R.viewOy || (oy && R.viewOyH !== R.lastH)) {
      R.viewOy = oy; R.viewOyH = R.lastH;
      if (oy) cam.setViewOffset(R.lastW, R.lastH, 0, oy * R.lastH, R.lastW, R.lastH); else cam.clearViewOffset();
    }
    if (Math.abs(cam.fov - fov) > 1e-4 || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }

    // environment + lights
    var er = s.envRot + s.envRotPointer;
    if (er !== R.envRotY) { R.envRotY = er; for (var i = 0; i < R.envMats.length; i++) R.envMats[i].envMapRotation.y = er; }
    R.renderer.toneMappingExposure = s.exposure;
    var P = PX[region];
    var envK = P.envK == null ? 1 : Math.round(P.envK * 200) / 200;
    if (envK !== R.envK) { R.envK = envK; applyFinishMaterials(s.finishMix); }
    if (R.sweep) {
      var topSweep = region === 'material' || region === 'finish';
      if (topSweep) {
        // top-down pose: the spec placement, 35 above the lid, facing straight down
        R.sweep.position.set(s.sweepX * 0.5, DIM.baseTop + DIM.lidT + 35, 0);
        R.sweep.rotation.set(-Math.PI / 2, 0, 0);
      } else {
        // grazing hero pose: hung behind and above the lid so its mirror image streaks across it;
        // sweepX -50..50 maps so the streak crosses the lid edge to edge over the same range
        R.sweep.position.set(s.sweepX * 0.56, 12, -36);
        R.sweep.lookAt(s.sweepX * 0.17, 1.5, 0);
      }
      R.sweep.intensity = (topSweep ? 30 : 12) * P.sweepI;
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
    mac.M.screen.envMapIntensity = 0.32 * (1 - 0.8 * s.screenOn * open);
    if (R.spill) { R.spill.intensity = (s.screenOn * 2.5 * open + leak * 4) * (1 - 0.75 * s.finishMix); }

    R.renderer.render(R.scene, cam);
  }

  var lastT = 0;
  function tick() {
    var now = performance.now();
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
    lastT = now; tNow = now;
    compose(dt);
    if (!R || !R.firstFrame) return;
    if (!state.visible || state.opacity <= 0.001) return;
    // the idle float keeps frames coming while someone is here; after 15s without input it eases
    // out and the loop falls back to render-on-dirty
    if (!IX.lastActive) IX.lastActive = now;
    var idleT = now - IX.lastActive > 15000 ? 0 : 1;
    if (IX.idle !== idleT) { IX.idle = clamp(IX.idle + (idleT ? 1 : -1) * dt / 1.6, 0, 1); dirty = true; }
    var animating = !isRM() && IX.idle > 0;
    if (!(dirty || animating)) return;
    dirty = false;
    renderFrame();
    // adaptive DPR: a 40-frame average over 18ms steps 2 -> 1.5 -> 1.25 -> 1. One-off hitches (GC,
    // another module's first paint) are trimmed, and two slow windows in a row are required.
    if (animating && now - R.bornAt > 3000 && !DOC.hidden) {
      R.frames.push(dt * 1000);
      if (R.frames.length >= 40) {
        var fr = R.frames.slice().sort(function (a, b) { return a - b; }).slice(0, 36);
        var avg = fr.reduce(function (a, b) { return a + b; }, 0) / fr.length;
        R.frames.length = 0;
        R.slow = avg > 18 ? (R.slow || 0) + 1 : 0;
        if (R.slow >= 2 && R.dpr > 1) {
          R.slow = 0;
          R.dpr = R.dpr > 1.5 ? 1.5 : R.dpr > 1.25 ? 1.25 : 1;
          R.renderer.setPixelRatio(R.dpr); R.lastW = 0; resize();
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
      state.dragX = clamp(state.dragX + dy * 0.004, -15 * DEG, 15 * DEG);
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
      } else if (k === 'ArrowUp' || k === 'ArrowDown') {
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
   * 11. INITS (registered with core; every ScrollTrigger created synchronously)
   * ------------------------------------------------------------------------- */
  function camTo(tl, P, p, pos, dur, ease) {
    tl.to(P.cam, { x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz, fov: p.fov, fit: p.fit || FIT, oy: p.oy || 0, duration: dur, ease: ease || 'sine.inOut' }, pos);
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
    bindFinishUI();

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
      PF.cam = phonePose(POSES.F); PF.rotY = 0.35; PF.lid = 105; PF.screenOn = 0.6; PF.envK = 1; PF.sweepI = 0;
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
      tf.to(PF, { lid: 105, duration: 0.4, ease: 'power2.inOut' }, 0.2);
      tf.to(PF, { screenOn: 0.6, duration: 0.25, ease: 'power2.out' }, 0.38);
      tf.to(PF, { envK: 1, duration: 0.45, ease: 'sine.inOut' }, 0);
      tf.to(PF, { sweepX: 95, sweepI: 0, duration: 0.35, ease: 'power1.in' }, 0);
      tf.to(PF, { envRot: 0.55, duration: 0.6, ease: 'sine.inOut' }, 0);
      tf.to({}, { duration: 0.4 }, 0.6);   // hold: the visitor drives it
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
      P.lid = 0; P.screenOn = 0; P.cam = camCopy(isMobile() ? POSES.E : POSES.Ed); P.rotY = 0.35;
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
    if (isMobile()) camTo(tl, P, POSES.E, 0, 0.6, 'power2.inOut');
    else {
      // desktop: the closing lid rides up and left into the free quarter above the credits heading,
      // clear of the spec roll on the right (the pan is re-measured per aspect on refresh)
      var Ed = POSES.Ed, pan = function () { return 8.6 * (W.innerWidth / Math.max(1, W.innerHeight)); };
      tl.to(P.cam, { x: pan, y: Ed.y, z: Ed.z, tx: pan, ty: Ed.ty, tz: Ed.tz, fov: Ed.fov, duration: 0.5, ease: 'power2.inOut' }, 0);
    }
    tl.to(P, { rotY: 0, duration: 0.6, ease: 'power2.inOut' }, 0);
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
    on('resize', function () { if (R) { R.lastW = 0; resize(); } markDirty(); });
    W.addEventListener('resize', function () { if (R) resize(); markDirty(); });
  }
  if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', onReadyDom);
  else onReadyDom();
})();
