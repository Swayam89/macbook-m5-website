/* =============================================================================
 * render-kit.js: studio lighting, post pipeline and contact shadows for three r170.
 *
 * Classic script (no import/export) so a site keeps working from file://.
 * Attaches window.RenderKit.{ createStudio, createPipeline, contactShadow }.
 * THREE and THREE_ADDONS are read lazily, at call time, never at script-eval time:
 * they arrive later through the importmap shim's 'three:ready' event.
 *
 * Addons used (optional, looked up on window.THREE_ADDONS):
 *   GTAOPass  -> ambient occlusion (off without it)
 *   SMAAPass  -> edge AA on the moving path (off without it)
 * Everything else (bloom, accumulation, grade/tone map, blur) is inline so the
 * chain order and render-target formats are under our control.
 *
 * Units: the kit is tuned for 1 unit = 1 cm (the MacBook / AirPods sites).
 * See pipeline-notes.md for parameter rationale, per-pass costs and gotchas.
 * ========================================================================== */
(function (W) {
  'use strict';

  var RK = W.RenderKit = W.RenderKit || {};
  RK.version = '1.0.0';

  function getTHREE(t) {
    var T = t || W.THREE;
    if (!T) throw new Error('RenderKit: THREE is not loaded yet (wait for the three:ready event)');
    return T;
  }
  function addons() { return W.THREE_ADDONS || {}; }
  function now() { return (W.performance && W.performance.now) ? W.performance.now() : Date.now(); }

  /* ---------------------------------------------------------------------------
   * Fullscreen helpers: one oversized triangle, no matrices, no depth.
   * ------------------------------------------------------------------------- */
  var FS_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  function makeQuad(THREE) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    var mesh = new THREE.Mesh(g);
    mesh.frustumCulled = false;
    var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      draw: function (renderer, material, target) {
        mesh.material = material;
        renderer.setRenderTarget(target || null);
        renderer.render(mesh, cam);
      },
      dispose: function () { g.dispose(); }
    };
  }

  function fsMat(THREE, frag, uniforms, extra) {
    var o = { uniforms: uniforms, vertexShader: FS_VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false };
    if (extra) for (var k in extra) o[k] = extra[k];
    return new THREE.ShaderMaterial(o);
  }

  function rt(THREE, w, h, o) {
    o = o || {};
    var t = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
      type: o.type || THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: o.filter || THREE.LinearFilter,
      magFilter: o.filter || THREE.LinearFilter,
      depthBuffer: !!o.depth,
      stencilBuffer: false,
      generateMipmaps: false,
      samples: o.samples || 0
    });
    t.texture.colorSpace = THREE.NoColorSpace; // scene-linear data, never decoded
    return t;
  }

  /* ===========================================================================
   * 1. STUDIO: procedural HDR lightformer environment -> PMREM
   * ======================================================================== */

  // Lightformer panel: emissive, values > 1, soft edges so the cube map never aliases and
  // strip reflections on chrome have a crisp-but-not-jagged edge (a real softbox diffuser edge).
  var LF_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  var LF_FRAG = [
    'uniform vec3 color; uniform vec2 soft; uniform vec2 grad; uniform float shape; uniform float inner;',
    'uniform vec2 fall; uniform vec2 gv;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 p = vUv * 2.0 - 1.0; float m;',
    // graded softbox ("fall"): I (1-u^2)^fu (1-v^2)^fv x lerp(bottom, top). A flat face mirrors this
    // FALLOFF as one long gradient (product photography), not a hard-edged box (a room). The edge is
    // anti-aliased over ~1.5 cube texels so a mirror-smooth bezel never shows a stair-stepped strip.
    '  if (shape > 2.5) {',
    '    vec2 q = max(1.0 - p * p, vec2(1e-5));',
    '    m = pow(q.x, fall.x) * pow(q.y, fall.y) * mix(gv.x, gv.y, vUv.y);',
    '    vec2 aa = max(fwidth(p) * 1.5, vec2(1e-4));',
    '    m *= smoothstep(0.0, aa.x, 1.0 - abs(p.x)) * smoothstep(0.0, aa.y, 1.0 - abs(p.y));',
    '    gl_FragColor = vec4(color * m, 1.0); return;',
    '  }',
    '  if (shape < 0.5) { vec2 q = 1.0 - abs(p); m = smoothstep(0.0, soft.x, q.x) * smoothstep(0.0, soft.y, q.y); }',
    '  else { float r = length(p); m = 1.0 - smoothstep(1.0 - soft.x, 1.0, r);',
    '         if (shape > 1.5) m *= smoothstep(inner - soft.x, inner, r); }',
    // centre-hot diffuser (grad.x) and a lengthwise fall-off (grad.y, brighter at uv.y = 1)
    '  m *= 1.0 - grad.x * min(dot(p, p), 1.0) * 0.6;',
    '  m *= 1.0 - grad.y * (1.0 - vUv.y);',
    '  gl_FragColor = vec4(color * m, 1.0);',
    '}'].join('\n');

  // Graded dome: zenith / horizon / nadir radiance. It is the "room": what glossy surfaces
  // reflect between the lights, and what sets how grey or luminous a white object reads.
  var DOME_VERT = 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  var DOME_FRAG = [
    'uniform vec3 zenith; uniform vec3 horizon; uniform vec3 nadir; uniform float zExp; uniform float nExp;',
    'uniform vec3 hotDir; uniform vec3 hot; uniform float hotExp;',
    'varying vec3 vDir;',
    'void main() {',
    '  vec3 d = normalize(vDir); float y = d.y;',
    '  vec3 c = y > 0.0 ? mix(horizon, zenith, pow(y, zExp)) : mix(horizon, nadir, pow(-y, nExp));',
    '  c += hot * pow(max(dot(d, normalize(hotDir)), 0.0), hotExp);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n');

  // Layouts. Product at the origin, camera on +z, +y up. Panels sit ~10-14 units out; only
  // their direction and angular size matter (the cube camera is at the origin).
  //   s: 'rect' | 'disc' | 'ring' | 'flag' (flag = opaque dark card, a negative fill)
  //   w,h size, p position, look target (default origin), I intensity (linear, >1 = HDR)
  //   soft [x,y] edge width in half-extent units, grad [centre-hot, lengthwise]
  var STRIP_SOFT = [0.45, 0.08], BAR_SOFT = [0.05, 0.45];
  var PRESETS = {
    // White tabletop studio. The surround is deliberately mid-grey (not white): a bright surround
    // flattens metal into grey plastic, because every direction reflects the same value. Luminous
    // whites come from BIG sources (top softbox + front sweep) and exposure, while the darker room
    // gives glossy edges and chamfers something to contrast against.
    paper: {
      dome: { zenith: 0.42, horizon: 0.24, nadir: 0.42, zExp: 0.8, nExp: 0.5, hot: 0.0 },
      exposure: 1.0, background: '#f5f5f7', floor: [0.9, 0.9, 0.895],
      panels: [
        { s: 'rect', w: 16, h: 11, p: [0, 12, 1], I: 3.6, soft: [0.2, 0.2], grad: [0.55, 0] },      // overhead softbox
        { s: 'rect', w: 2.0, h: 13, p: [-10, 3.5, 4], I: 8.0, soft: STRIP_SOFT, grad: [0, 0.4] },  // key strip, camera left
        { s: 'rect', w: 1.6, h: 13, p: [10, 3.0, 1], I: 4.5, soft: STRIP_SOFT, grad: [0, 0.4] },   // fill strip, right
        { s: 'rect', w: 18, h: 5, p: [0, 2.9, -11], I: 2.2, soft: [0.25, 0.5], grad: [0, 0.85] },  // back sweep: gradient on lids/decks/glass
        { s: 'rect', w: 20, h: 1.0, p: [0, 6.2, -10], I: 7.0, soft: BAR_SOFT, grad: [0, 0] },      // rim bar: thin far-edge line
        { s: 'rect', w: 22, h: 7, p: [0, 5, 12], I: 3.0, soft: [0.3, 0.3], grad: [0, 0.7] },       // front sweep: luminous front faces
        { s: 'rect', w: 18, h: 0.8, p: [0, 1.2, 11.5], I: 3.0, soft: BAR_SOFT, grad: [0, 0] },     // low front bar: front chamfers
        { s: 'flag', w: 4, h: 14, p: [-10, 3, -6], I: 0.02 },                                        // negative fill: dark edge bands
        { s: 'flag', w: 4, h: 14, p: [10, 3, -6], I: 0.02 }
      ]
    },
    // Black-void studio for dark anodising, chips, glass: strips only, faint dome, ring kicker.
    dark: {
      dome: { zenith: 0.03, horizon: 0.01, nadir: 0.008, zExp: 0.7, nExp: 0.6, hot: 0.0 },
      exposure: 1.0, background: '#000000', floor: [0.012, 0.012, 0.013],
      panels: [
        // (soft .42: at .2 a glossy cover / screen glass mirrored the overhead box as one hard uniform band)
        { s: 'rect', w: 16, h: 11, p: [0, 12, 1], I: 2.6, soft: [0.42, 0.42], grad: [0.6, 0] },
        { s: 'rect', w: 2.0, h: 13, p: [-10, 3.5, 4], I: 7.5, soft: STRIP_SOFT, grad: [0, 0.5] },
        { s: 'rect', w: 1.6, h: 13, p: [10, 3.0, 1], I: 3.5, soft: STRIP_SOFT, grad: [0, 0.5] },
        { s: 'rect', w: 18, h: 5, p: [0, 2.9, -11], I: 0.5, soft: [0.25, 0.5], grad: [0, 0.9] },
        { s: 'rect', w: 20, h: 1.0, p: [0, 6.2, -10], I: 6.5, soft: BAR_SOFT, grad: [0, 0] },
        { s: 'rect', w: 22, h: 7, p: [0, 5, 12], I: 0.45, soft: [0.3, 0.3], grad: [0, 0.8] },
        { s: 'rect', w: 18, h: 0.7, p: [0, 1.2, 11.5], I: 1.8, soft: BAR_SOFT, grad: [0, 0] },
        { s: 'rect', w: 22, h: 3.2, p: [0, -2.2, 11], I: 0.22, soft: [0.3, 0.5], grad: [0, 0.8] },    // faint table bounce: side faces keep a gradient
        { s: 'ring', w: 7, h: 7, p: [0, 8, 11], I: 1.0, soft: [0.12, 0.12], inner: 0.72 },
        { s: 'rect', w: 24, h: 24, p: [0, -9, 0], I: 0.05, soft: [0.5, 0.5], grad: [0.6, 0] }
      ]
    }
  };
  function tinted(base, tint, extra) {
    var o = JSON.parse(JSON.stringify(base));
    o.tint = tint;
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  PRESETS.warm = tinted(PRESETS.paper, [1.0, 0.94, 0.86], { background: '#f6f1ea', floor: [0.94, 0.9, 0.85] });
  PRESETS.cool = tinted(PRESETS.paper, [0.9, 0.95, 1.0], { background: '#eef2f7', floor: [0.86, 0.9, 0.95] });
  RK.studioPresets = PRESETS;

  function buildLightformerScene(THREE, def) {
    var sc = new THREE.Scene();
    var tint = def.tint || [1, 1, 1];
    var d = def.dome;
    function col(v) { return new THREE.Vector3(v * tint[0], v * tint[1], v * tint[2]); }
    var dome = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: col(d.zenith) }, horizon: { value: col(d.horizon) }, nadir: { value: col(d.nadir) },
        zExp: { value: d.zExp }, nExp: { value: d.nExp },
        hotDir: { value: new THREE.Vector3(0, 1, 0.3) }, hot: { value: col(d.hot || 0) }, hotExp: { value: 6 }
      },
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false
    }));
    dome.renderOrder = 0;
    sc.add(dome);
    def.panels.forEach(function (P) {
      var flag = P.s === 'flag';
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: col(P.I) },
          soft: { value: new THREE.Vector2((P.soft || [0.2, 0.2])[0], (P.soft || [0.2, 0.2])[1]) },
          grad: { value: new THREE.Vector2((P.grad || [0, 0])[0], (P.grad || [0, 0])[1]) },
          shape: { value: P.s === 'disc' ? 1 : P.s === 'ring' ? 2 : P.s === 'fall' ? 3 : 0 },
          inner: { value: P.inner || 0.7 },
          fall: { value: new THREE.Vector2((P.fall || [1, 1])[0], (P.fall || [1, 1])[1]) },
          gv: { value: new THREE.Vector2((P.gv || [1, 1])[0], (P.gv || [1, 1])[1]) }
        },
        vertexShader: LF_VERT, fragmentShader: flag ? 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }' : LF_FRAG,
        side: THREE.DoubleSide,
        // light panels ADD onto the dome (soft edges never punch dark halos); flags REPLACE it
        blending: flag ? THREE.NoBlending : THREE.AdditiveBlending,
        transparent: !flag, depthWrite: false, depthTest: false
      });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h), mat);
      if (P.p) m.position.set(P.p[0], P.p[1], P.p[2]);
      else {
        // spherical placement (LOOKDEV-BRIEF 4.1): az from +z (camera side) toward +x, el = elevation, d = distance
        var az = (P.az || 0) * Math.PI / 180, el = (P.el || 0) * Math.PI / 180, dd = P.d || 30;
        m.position.set(dd * Math.sin(az) * Math.cos(el), dd * Math.sin(el), dd * Math.cos(az) * Math.cos(el));
        // near-vertical panels keep a stable 'up' (lookAt degenerates at el = +-90)
        if (Math.abs(P.el || 0) > 60) m.up.set(-Math.sin(az), 0, -Math.cos(az));
      }
      var L = P.look || [0, 0, 0];
      m.lookAt(L[0], L[1], L[2]);
      m.renderOrder = flag ? 1 : 2;
      sc.add(m);
    });
    return sc;
  }

  /* Box-projected (parallax-corrected) reflections. A PMREM is lit from infinitely far away, so
   * every point of a flat face reflects the same direction and the face renders as one flat tone
   * (the "grey plastic" look). Projecting the reflection ray onto a finite studio box makes the
   * softboxes sit at a real distance: flat lids and decks pick up long gradients, and the strips
   * slide across the product as it turns. Global ShaderChunk patch (all Standard/Physical
   * materials); must run before the first material compiles (three caches programs by key, not
   * by chunk text). p = { center:[x,y,z], halfSize:[x,y,z], amount: 0..1 } or null to remove. */
  RK.setBoxProjection = function (THREE, p) {
    THREE = getTHREE(THREE);
    var SC = THREE.ShaderChunk;
    if (!RK._envChunk) RK._envChunk = SC.envmap_physical_pars_fragment;
    if (!p) { SC.envmap_physical_pars_fragment = RK._envChunk; RK.boxProjection = null; return; }
    var f = function (v) { return Number(v).toFixed(4); };
    var v3 = function (a) { return 'vec3(' + f(a[0]) + ', ' + f(a[1]) + ', ' + f(a[2]) + ')'; };
    var c = p.center || [0, 0, 0], h = p.halfSize || [100, 100, 100], amt = p.amount != null ? p.amount : 1;
    var min = [c[0] - h[0], c[1] - h[1], c[2] - h[2]], max = [c[0] + h[0], c[1] + h[1], c[2] + h[2]];
    var needle = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );';
    var code = needle + [
      '',
      '\t\t\t{ // RenderKit box projection',
      '\t\t\t\tvec3 rkP = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;',
      '\t\t\t\tvec3 rkR = reflectVec + vec3( 1e-6 );',
      '\t\t\t\tvec3 rkF = max( ( ' + v3(max) + ' - rkP ) / rkR, ( ' + v3(min) + ' - rkP ) / rkR );',
      '\t\t\t\tfloat rkD = max( min( min( rkF.x, rkF.y ), rkF.z ), 0.0 );',
      '\t\t\t\treflectVec = normalize( mix( reflectVec, rkP + reflectVec * rkD - ' + v3(c) + ', ' + f(amt) + ' ) );',
      '\t\t\t}'].join('\n');
    if (RK._envChunk.indexOf(needle) < 0) return false;
    SC.envmap_physical_pars_fragment = RK._envChunk.replace(needle, code);
    RK.boxProjection = { center: c, halfSize: h, amount: amt };
    return true;
  };

  /* Per-material environment patch (no global ShaderChunk change, so other scenes on the page keep the
   * stock chunk):
   *   projection {center, halfSize, amount}: box-projected specular (see setBoxProjection) for this material
   *   blend: true -> a second PMREM (uniform rkEnvB, same size as envMap) crossfaded by rkEnvMix 0..1, so a
   *     page can move from one studio to another (void -> paper) with no pop and no re-bake. A uniform
   *     branch skips the second fetch whenever the mix is exactly 0 or 1.
   * Chains any existing onBeforeCompile / customProgramCacheKey. Returns the uniforms { rkEnvB, rkEnvMix }. */
  RK.patchEnv = function (m, o) {
    o = o || {};
    var THREE = getTHREE(o.THREE);
    var U = { rkEnvB: { value: o.envB || null }, rkEnvMix: { value: o.mix || 0 } };
    var src = RK._envChunk || THREE.ShaderChunk.envmap_physical_pars_fragment;
    var f = function (v) { return Number(v).toFixed(4); };
    var v3 = function (a) { return 'vec3(' + f(a[0]) + ', ' + f(a[1]) + ', ' + f(a[2]) + ')'; };
    var chunk = src, key = 'rkEnv';
    if (o.blend) {
      chunk = chunk.split('textureCubeUV( envMap, ').join('rkEnvSample( ');
      chunk = chunk.replace('#ifdef USE_ENVMAP', [
        '#ifdef USE_ENVMAP',
        '#ifdef ENVMAP_TYPE_CUBE_UV',
        'uniform sampler2D rkEnvB; uniform float rkEnvMix;',
        'vec4 rkEnvSample( vec3 dir, float r ) {',
        '  if ( rkEnvMix <= 0.0 ) return textureCubeUV( envMap, dir, r );',
        '  if ( rkEnvMix >= 1.0 ) return textureCubeUV( rkEnvB, dir, r );',
        '  return mix( textureCubeUV( envMap, dir, r ), textureCubeUV( rkEnvB, dir, r ), rkEnvMix );',
        '}',
        '#endif'].join('\n'));
      key += '+blend';
    }
    var p = o.projection;
    if (p) {
      var c = p.center || [0, 0, 0], h = p.halfSize || [100, 100, 100], amt = p.amount != null ? p.amount : 1;
      var mn = [c[0] - h[0], c[1] - h[1], c[2] - h[2]], mx = [c[0] + h[0], c[1] + h[1], c[2] + h[2]];
      var needle = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );';
      if (chunk.indexOf(needle) >= 0 && chunk.indexOf('RenderKit box projection') < 0) {
        chunk = chunk.replace(needle, needle + [
          '',
          '{ // RenderKit box projection (per material)',
          '  vec3 rkP = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;',
          '  vec3 rkR = reflectVec + vec3( 1e-6 );',
          '  vec3 rkF = max( ( ' + v3(mx) + ' - rkP ) / rkR, ( ' + v3(mn) + ' - rkP ) / rkR );',
          '  float rkD = max( min( min( rkF.x, rkF.y ), rkF.z ), 0.0 );',
          '  reflectVec = normalize( mix( reflectVec, rkP + reflectVec * rkD - ' + v3(c) + ', ' + f(amt) + ' ) );',
          '}'].join('\n'));
      }
      key += '+box' + [c, h, [amt]].join(',');
    }
    var prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.uniforms.rkEnvB = U.rkEnvB; sh.uniforms.rkEnvMix = U.rkEnvMix;
      sh.fragmentShader = sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', chunk);
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|' + key; };
    m.needsUpdate = true;
    m.userData.rkEnv = U;
    return U;
  };

  RK.createStudio = function (renderer, opts) {
    opts = opts || {};
    var THREE = getTHREE(opts.THREE);
    var size = opts.size || 512;          // cube face size: 512 keeps 50+ px across a strip
    var pmrem = null, cubeRT = null, cubeCam = null, fresh = false;
    function tools() {
      if (pmrem) return;
      fresh = true;
      pmrem = new THREE.PMREMGenerator(renderer);
      cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
      cubeCam = new THREE.CubeCamera(0.05, 500, cubeRT);
    }
    var envRT = null, tracked = [], rotY = opts.rotation || 0;
    var api = { envMap: null, info: null, name: null, presets: PRESETS };
    if (opts.projection !== undefined) RK.setBoxProjection(THREE, opts.projection);

    function applyRotation() {
      if (opts.scene) {
        if (opts.scene.environmentRotation) opts.scene.environmentRotation.set(0, rotY, 0);
        if (opts.scene.backgroundRotation) opts.scene.backgroundRotation.set(0, rotY, 0);
      }
      tracked.forEach(function (m) { if (m.envMapRotation) m.envMapRotation.set(0, rotY, 0); });
    }
    function apply() {
      if (opts.scene && opts.applyToScene !== false) opts.scene.environment = api.envMap;
      tracked.forEach(function (m) { m.envMap = api.envMap; m.needsUpdate = m.needsUpdate || false; });
      applyRotation();
    }
    function bake(name) {
      var def = typeof name === 'object' ? name : (PRESETS[name] || PRESETS.paper);
      var sc = buildLightformerScene(THREE, def);
      tools();
      var prevTM = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      cubeCam.update(renderer, sc);
      renderer.toneMapping = prevTM;
      // reusing envRT keeps the texture identity, so materials that hold it need no rebinding. That needs the
      // generator that made it (its ping-pong target): after release() a re-bake makes a NEW envMap (the old
      // one is freed), and callers holding the texture must re-read api.envMap (tracked materials are updated)
      if (envRT && !fresh) envRT = pmrem.fromCubemap(cubeRT.texture, envRT);
      else { var old = envRT; envRT = pmrem.fromCubemap(cubeRT.texture); if (old) old.dispose(); }
      fresh = false;
      sc.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      api.envMap = envRT.texture;
      api.name = typeof name === 'string' ? name : 'custom';
      api.info = { name: api.name, exposure: def.exposure, background: def.background, floor: def.floor };
      apply();
      return api.info;
    }

    api.preset = function (name) { return bake(name); };
    api.setRotation = function (y) { rotY = y; applyRotation(); };
    api.getRotation = function () { return rotY; };
    api.track = function (mat) { if (tracked.indexOf(mat) < 0) tracked.push(mat); mat.envMap = api.envMap; applyRotation(); return mat; };
    /** free the bake tools (cube target + PMREM ping-pong, ~8 MB) once no more presets will be baked;
     *  envMap stays valid, and a later preset() simply re-creates them */
    api.release = function () { if (!pmrem) return; cubeRT.dispose(); pmrem.dispose(); pmrem = cubeRT = cubeCam = null; };
    api.dispose = function () { if (envRT) envRT.dispose(); api.release(); tracked.length = 0; };
    bake(opts.preset || 'paper');
    return api;
  };

  /* ===========================================================================
   * 2. PIPELINE
   *    moving : scene(MSAA x4, HalfFloat) -> GTAO(half res) -> bloom(layer) -> grade -> SMAA -> screen
   *    idle   : jittered scene + AO accumulated (running mean, 32 samples) -> grade -> screen
   * ======================================================================== */

  var QUALITY = {
    // aoScale is relative to the drawing buffer (DPR 2 => 0.5 is a CSS-pixel AO buffer).
    // aoSamples 8 = 3 slices x 3 steps; the idle path rotates the AO noise every accumulation
    // frame, so a converged still integrates 32 x 8 samples and needs far less denoise blur.
    // SMAA is off by default: at DPR 2 with MSAA x4 it removes almost nothing visible and costs
    // ~2.4 ms at 2880x1800 on the M5 (measured); still frames are supersampled by accumulation.
    // Turn it on with opts.tune = { smaa: true } (or for msaa: 0 setups).
    high:   { level: 0, msaa: 4, ao: true, aoScale: 0.5,  aoSamples: 8, pdSamples: 8, pdRings: 2, bloom: true,  smaa: false, taa: 32 },
    medium: { level: 1, msaa: 4, ao: true, aoScale: 0.4,  aoSamples: 6, pdSamples: 6, pdRings: 2, bloom: true,  smaa: false, taa: 24 },
    low:    { level: 2, msaa: 2, ao: true, aoScale: 0.35, aoSamples: 6, pdSamples: 6, pdRings: 2, bloom: false, smaa: false, taa: 16 }
  };
  var LEVELS = ['high', 'medium', 'low'];
  RK.qualityLevels = QUALITY;

  // Joint-bilateral AO upsample: the AO buffer is half resolution, the frame is full. Plain
  // bilinear smears floor AO onto the object's silhouette (stair-stepped dark rims at contacts);
  // weighting the 4 nearest AO texels by how well their depth matches this pixel's full-res depth
  // keeps AO edges exactly on the geometric edge. Relative-depth Gaussian (1%) keeps smooth
  // bilinear interpolation on continuous surfaces.
  var AO_UP_GLSL = [
    'uniform sampler2D tDepthFull; uniform sampler2D tDepthAO; uniform vec2 aoTexel; uniform vec2 camNF; uniform float bilateral;',
    'float rkLinZ(float d) {',
    '#if PERSPECTIVE_CAM == 1',
    '  return camNF.x * camNF.y / max(camNF.y - d * (camNF.y - camNF.x), 1e-6);',
    '#else',
    '  return camNF.x + d * (camNF.y - camNF.x);',
    '#endif',
    '}',
    'float aoSample(sampler2D tAOx, vec2 uv) {',
    '  if (bilateral < 0.5) return texture2D(tAOx, uv).r;',
    '  float zf = rkLinZ(texture2D(tDepthFull, uv).r);',
    '  vec2 p = uv / aoTexel - 0.5; vec2 f = fract(p); vec2 b = (floor(p) + 0.5) * aoTexel;',
    '  float acc = 0.0, ws = 0.0;',
    '  for (int i = 0; i < 4; i++) {',
    '    vec2 o = vec2(float(i % 2), float(i / 2));',
    '    vec2 suv = b + o * aoTexel;',
    '    float zi = rkLinZ(texture2D(tDepthAO, suv).r);',
    '    float r = abs(zf - zi) / max(zf, 1e-4) / 0.01;',
    '    float w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y) / (1.0 + r * r) + 1e-6;',
    '    acc += texture2D(tAOx, suv).r * w; ws += w;',
    '  }',
    '  return acc / ws;',
    '}'].join('\n');

  var ACCUM_FRAG = [
    'uniform sampler2D tNew; uniform sampler2D tHist; uniform sampler2D tAO; uniform float aoIntensity; uniform float w;',
    'uniform float aoAlpha;',
    'varying vec2 vUv;',
    AO_UP_GLSL,
    'void main() {',
    '  vec4 c = texture2D(tNew, vUv);',
    '  if (aoIntensity > 0.0) {',
    '    float occ = mix(1.0, aoSample(tAO, vUv), aoIntensity);',
    '    c.rgb *= occ;',
    // transparent canvas: occlusion on see-through pixels (shadow plane) becomes black coverage
    '    c.a += (1.0 - c.a) * (1.0 - occ) * aoAlpha;',
    '  }',
    '  gl_FragColor = w >= 1.0 ? c : mix(texture2D(tHist, vUv), c, w);',
    '}'].join('\n');

  var GRADE_FRAG = [
    '#include <common>',
    '#include <tonemapping_pars_fragment>',
    // colorspace_pars_fragment (sRGBTransferOETF) is already in three's ShaderMaterial prefix
    'uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tBloom;',
    'uniform float aoIntensity; uniform float bloomStrength; uniform float contrast; uniform float saturation;',
    'uniform float ditherAmt; uniform float alphaMode; uniform float blackLift; uniform float aoAlpha;',
    'varying vec2 vUv;',
    AO_UP_GLSL,
    'float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }',
    'vec3 tmap(vec3 c) {',
    '#if TM_MODE == 1',
    '  return NeutralToneMapping(c);',
    '#elif TM_MODE == 2',
    '  return AgXToneMapping(c);',
    '#elif TM_MODE == 3',
    '  return ACESFilmicToneMapping(c);',
    '#else',
    '  return saturate(c * toneMappingExposure);',
    '#endif',
    '}',
    'void main() {',
    '  vec4 s = texture2D(tScene, vUv);',
    '  float occ = aoIntensity > 0.0 ? mix(1.0, aoSample(tAO, vUv), aoIntensity) : 1.0;',
    '  vec3 P = s.rgb * occ;',
    '  s.a += (1.0 - s.a) * (1.0 - occ) * aoAlpha;',
    '  vec3 B = texture2D(tBloom, vUv).rgb * bloomStrength;',
    '  P += B;',
    // premultiplied in, premultiplied out: un-premultiply, tone map + encode, re-premultiply.
    // Bloom over a transparent pixel raises alpha so the glow stays valid premultiplied colour.
    '  float A = 1.0;',
    '  if (alphaMode > 0.5) A = clamp(max(s.a, max(B.r, max(B.g, B.b))), 0.0, 1.0);',
    '  vec3 U = A > 1e-4 ? P / A : vec3(0.0);',
    '  vec3 T = tmap(U);',
    '  float l = dot(T, vec3(0.2126, 0.7152, 0.0722));',
    '  T = max(mix(vec3(l), T, saturation), 0.0);',
    '  T = sRGBTransferOETF(vec4(T, 1.0)).rgb;',
    // gentle S around mid grey in display space; toe kept by blackLift (0 = none)
    '  T = clamp(T + (T - 0.5) * (contrast - 1.0) * (1.0 - abs(T - 0.5) * 2.0 * 0.5), 0.0, 1.0);',
    '  T = T * (1.0 - blackLift) + blackLift;',
    // +-0.5 LSB ordered noise: kills 8-bit banding on large soft gradients (backdrops, glass)
    '  float dn = (ign(gl_FragCoord.xy) - 0.5) * ditherAmt / 255.0;',
    '  if (alphaMode > 0.5 && A > 0.0 && A < 1.0) {',
    // a smooth LOW alpha (a backdrop halo, a soft shadow over the page) quantises to 1/255 alpha steps and
    // bands as rings however clean the colour is: the alpha and the premultiplied colour get the SAME noise,
    // so the composite over the page is P + (1 - A) bg + dn (1 - bg), i.e. dithered, never stepped
    '    float Ad = clamp(A + dn, 0.0, 1.0);',
    '    gl_FragColor = vec4(clamp(T * A + (Ad - A), 0.0, Ad), Ad);',
    '  } else {',
    '    T += dn;',
    '    gl_FragColor = alphaMode > 0.5 ? vec4(T * A, A) : vec4(T, 1.0);',
    '  }',
    '}'].join('\n');

  // Call of Duty style 13-tap downsample (Karis-weighted on the first level to kill fireflies)
  var DOWN_FRAG = [
    'uniform sampler2D tSrc; uniform vec2 texel; uniform float karis;',
    'varying vec2 vUv;',
    'vec3 S(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * texel).rgb; }',
    'float kw(vec3 c) { return karis > 0.5 ? 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))) : 1.0; }',
    'void main() {',
    '  vec3 a = S(-2.0, 2.0), b = S(0.0, 2.0), c = S(2.0, 2.0), d = S(-2.0, 0.0), e = S(0.0, 0.0), f = S(2.0, 0.0);',
    '  vec3 g = S(-2.0, -2.0), h = S(0.0, -2.0), i = S(2.0, -2.0), j = S(-1.0, 1.0), k = S(1.0, 1.0), l = S(-1.0, -1.0), m = S(1.0, -1.0);',
    '  vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25, g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;',
    '  float w0 = kw(g0) * 0.5, w1 = kw(g1) * 0.125, w2 = kw(g2) * 0.125, w3 = kw(g3) * 0.125, w4 = kw(g4) * 0.125;',
    '  vec3 r = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);',
    '  gl_FragColor = vec4(r, 1.0);',
    '}'].join('\n');

  // Prefilter: selective (layer) source + optional soft-knee threshold of the scene itself
  var PRE_FRAG = [
    'uniform sampler2D tLayer; uniform sampler2D tScene; uniform vec2 texel; uniform vec2 sceneTexel;',
    'uniform float useScene; uniform float threshold; uniform float knee; uniform float sceneStrength;',
    'varying vec2 vUv;',
    'vec3 L(float x, float y) { return texture2D(tLayer, vUv + vec2(x, y) * texel).rgb; }',
    'vec3 Q(float x, float y) { return texture2D(tScene, vUv + vec2(x, y) * sceneTexel).rgb; }',
    'void main() {',
    '  vec3 c = (L(-1.0, -1.0) + L(1.0, -1.0) + L(-1.0, 1.0) + L(1.0, 1.0)) * 0.25;',
    '  if (useScene > 0.5) {',
    '    vec3 s = (Q(-1.5, -1.5) + Q(1.5, -1.5) + Q(-1.5, 1.5) + Q(1.5, 1.5)) * 0.25;',
    '    float br = max(s.r, max(s.g, s.b));',
    '    float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee); rq = rq * rq / (4.0 * knee + 1e-4);',
    '    s *= max(rq, br - threshold) / max(br, 1e-4);',
    '    c += sceneStrength * s / (1.0 + max(s.r, max(s.g, s.b)) * 0.25);',
    '  }',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n');

  var UP_FRAG = [
    'uniform sampler2D tSrc; uniform vec2 texel; uniform float weight;',
    'varying vec2 vUv;',
    'vec3 S(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * texel).rgb; }',
    'void main() {',
    '  vec3 r = S(-1.0, 1.0) + S(1.0, 1.0) + S(-1.0, -1.0) + S(1.0, -1.0);',
    '  r += (S(0.0, 1.0) + S(-1.0, 0.0) + S(1.0, 0.0) + S(0.0, -1.0)) * 2.0 + S(0.0, 0.0) * 4.0;',
    '  gl_FragColor = vec4(r / 16.0 * weight, 1.0);',
    '}'].join('\n');

  // R2 sequence: low-discrepancy sub-pixel offsets, warped into a TENT of radius JIT_R pixels (a 1.5 px
  // wide weighted reconstruction filter). A +-0.5 px box gives every edge a one-pixel ramp but its hard
  // cut-off leaves near-horizontal edges stepped (AA score 0.99); the tent's soft tails blend the steps
  // into the neighbours (score > 1.2) and cost no sharpness at DPR 2. Index 0 = no jitter so the first
  // still frame is pixel-identical to the last moving one (no edge wobble at the hand-off).
  var JIT_R = 0.75;
  function tent(u) { return u < 0.5 ? JIT_R * (Math.sqrt(2 * u) - 1) : JIT_R * (1 - Math.sqrt(2 * (1 - u))); }
  function jitterAt(i) {
    if (i === 0) return [0, 0];
    var g = 1.32471795724474602596, a1 = 1 / g, a2 = 1 / (g * g);
    return [tent((0.5 + a1 * i) % 1), tent((0.5 + a2 * i) % 1)];
  }

  RK.createPipeline = function (renderer, scene, camera, opts) {
    opts = opts || {};
    var THREE = getTHREE(opts.THREE);
    var A = addons();
    var gl = renderer.getContext();
    var ctxAttr = gl.getContextAttributes ? gl.getContextAttributes() : { alpha: false };
    var quad = makeQuad(THREE);
    var white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
    var black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    black.needsUpdate = true;

    var cfg = {
      ao: Object.assign({
        // world units (cm). 2 cm reaches the floor contact under a 7 cm sphere / a laptop edge;
        // distanceExponent 2 puts most steps within the first few mm so key gaps and seams stay
        // crisp; thickness 1.2 cm stops a foreground object (lid) darkening what is far behind it
        // (the halo you get at 2.5); scale is a power curve that deepens creases without greying
        // open faces.
        radius: 2.0, distanceExponent: 2.0, thickness: 1.2, distanceFallOff: 0.5, scale: 1.4,
        intensity: 1.0,
        // Poisson denoise: depth/normal-aware so the blur never crosses a silhouette
        lumaPhi: 10, depthPhi: 2.5, normalPhi: 3.5, pdRadius: 5, pdRadiusExponent: 1.6, pdRadiusIdle: 0.5, idleJitter: 1.0, bilateral: true,
        // transparent canvas only: how much AO on see-through pixels (e.g. the contact-shadow plane)
        // darkens the CSS background behind the canvas (0 = AO only on opaque surfaces)
        alphaOcclusion: 0.8
      }, opts.ao || {}),
      bloom: Object.assign({
        strength: 0.55, radius: 1.0, layer: 11, occlusion: true,
        threshold: null,   // null = selective only (emissive screens / LEDs on the layer)
        knee: 0.6, sceneStrength: 0.35,  // threshold mode only: weight of scene highlights vs layer glow
        auto: true, autoScreens: false   // auto-enrol RenderKit led materials (and emissiveScreen if autoScreens)
      }, opts.bloom || {}),
      grade: Object.assign({ contrast: 1.0, saturation: 1.0, blackLift: 0.0, dither: 1.0 }, opts.grade || {}),
      idleDelay: opts.idleDelay != null ? opts.idleDelay : 150,
      alpha: opts.alpha != null ? !!opts.alpha : !!(ctxAttr && ctxAttr.alpha && renderer.getClearAlpha() < 1),
      toneMapping: opts.toneMapping // undefined => follow renderer.toneMapping every frame
    };
    if (opts.aoEnabled === false) cfg.aoOff = true;
    if (opts.bloomEnabled === false) cfg.bloomOff = true;
    if (opts.taa === false) cfg.taaOff = true;

    var forced = opts.quality && opts.quality !== 'auto' ? opts.quality : null;
    var level = forced ? QUALITY[forced].level : 0;
    // opts.tune overrides fields of every quality level (e.g. { smaa: false, aoSamples: 8 })
    var baseTune = opts.tune || {};
    function levelCfg(l) { return Object.assign({}, QUALITY[LEVELS[l]], opts.tune || {}); }
    var Q = levelCfg(level);

    var size = { w: 1, h: 1, dpr: 1, W: 1, H: 1 };
    var T = {}; // render targets

    /* ---- materials ---- */
    var accumMat = fsMat(THREE, ACCUM_FRAG, { tDepthFull: { value: null }, tDepthAO: { value: null }, aoTexel: { value: new THREE.Vector2(1, 1) }, camNF: { value: new THREE.Vector2(0.1, 100) }, bilateral: { value: 0 },
      tNew: { value: null }, tHist: { value: null }, tAO: { value: white }, aoIntensity: { value: 0 }, w: { value: 1 }, aoAlpha: { value: 0 } },
      { defines: { PERSPECTIVE_CAM: camera.isPerspectiveCamera ? 1 : 0 } });
    var gradeMat = fsMat(THREE, GRADE_FRAG, { tDepthFull: { value: null }, tDepthAO: { value: null }, aoTexel: { value: new THREE.Vector2(1, 1) }, camNF: { value: new THREE.Vector2(0.1, 100) }, bilateral: { value: 0 },
      tScene: { value: null }, tAO: { value: white }, tBloom: { value: black },
      aoIntensity: { value: 0 }, bloomStrength: { value: 0 }, contrast: { value: 1 }, saturation: { value: 1 },
      ditherAmt: { value: 1 }, alphaMode: { value: 0 }, blackLift: { value: 0 }, toneMappingExposure: { value: 1 }, aoAlpha: { value: 0 }
    }, { defines: { TM_MODE: 1, PERSPECTIVE_CAM: camera.isPerspectiveCamera ? 1 : 0 } });
    var downMat = fsMat(THREE, DOWN_FRAG, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, karis: { value: 0 } });
    var preMat = fsMat(THREE, PRE_FRAG, {
      tLayer: { value: black }, tScene: { value: null }, texel: { value: new THREE.Vector2() }, sceneTexel: { value: new THREE.Vector2() },
      useScene: { value: 0 }, threshold: { value: 1 }, knee: { value: 0.5 }, sceneStrength: { value: 0.35 } });
    var upMat = fsMat(THREE, UP_FRAG, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } }, {
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true });
    var debugMat = fsMat(THREE, 'uniform sampler2D tSrc; varying vec2 vUv; void main() { float a = texture2D(tSrc, vUv).r; gl_FragColor = vec4(vec3(pow(a, 1.0 / 2.2)), 1.0); }', { tSrc: { value: null } });
    var occluderMat = new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });

    /* ---- passes from addons ---- */
    var gtao = null, smaa = null;
    function makeGTAO() {
      if (!A.GTAOPass || gtao) return;
      gtao = new A.GTAOPass(scene, camera, 64, 64);
      gtao.output = A.GTAOPass.OUTPUT.Off;       // we only want pdRenderTarget; blend happens in our passes
      applyAOParams();
    }
    function applyAOParams() {
      if (!gtao) return;
      var a = cfg.ao;
      gtao.updateGtaoMaterial({ radius: a.radius, distanceExponent: a.distanceExponent, thickness: a.thickness,
        distanceFallOff: a.distanceFallOff, scale: a.scale, samples: Q.aoSamples, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: a.lumaPhi, depthPhi: a.depthPhi, normalPhi: a.normalPhi, radius: a.pdRadius,
        radiusExponent: a.pdRadiusExponent, rings: Q.pdRings, samples: Q.pdSamples });
    }
    // 32 rotated copies of GTAO's 5x5 magic-square noise (golden-angle rotation + step jitter in w)
    var aoNoise = [], aoNoiseBase = null;
    function aoNoiseFor(i) {
      if (!gtao) return null;
      if (!aoNoiseBase) aoNoiseBase = gtao.gtaoMaterial.uniforms.tNoise.value;
      if (i === 0) return aoNoiseBase;
      var k = i % 32;
      if (!aoNoise[k]) {
        var src = aoNoiseBase.image.data, n = aoNoiseBase.image.width, d = new Uint8Array(src.length);
        for (var p = 0; p < n * n; p++) {
          var x = src[p * 4] / 255 * 2 - 1, y = src[p * 4 + 1] / 255 * 2 - 1, a = Math.atan2(y, x) + k * 2.39996323;
          d[p * 4] = Math.round((Math.cos(a) * 0.5 + 0.5) * 255); d[p * 4 + 1] = Math.round((Math.sin(a) * 0.5 + 0.5) * 255);
          d[p * 4 + 2] = 127; d[p * 4 + 3] = Math.round(((0.5 + k * 0.618034 + p * 0.1) % 1) * 255);
        }
        var t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
        aoNoise[k] = t;
      }
      return aoNoise[k];
    }
    function setAONoise(i) {
      if (!gtao) return;
      gtao.gtaoMaterial.uniforms.tNoise.value = aoNoiseFor(i);
      // temporal integration replaces most of the spatial denoise when still: sharper contact AO
      gtao.pdMaterial.uniforms.radius.value = cfg.ao.pdRadius * (i === 0 ? 1 : cfg.ao.pdRadiusIdle);
    }
    function makeSMAA() {
      if (!A.SMAAPass || smaa) return;
      smaa = new A.SMAAPass(size.W, size.H);
      smaa.renderToScreen = true;
      smaa.clear = true;
    }

    /* ---- targets ---- */
    function disposeTargets() {
      if (T.scene && T.scene.depthTexture) T.scene.depthTexture.dispose();
      for (var k in T) { if (T[k] && T[k].dispose) T[k].dispose(); }
      T = {};
    }
    function allocate() {
      disposeTargets();
      var W2 = size.W, H2 = size.H;
      T.scene = rt(THREE, W2, H2, { depth: true, samples: Q.msaa });
      // resolved depth for the bilateral AO upsample (blit from the MSAA depth buffer)
      T.scene.depthTexture = new THREE.DepthTexture(W2, H2);
      T.scene.depthTexture.type = THREE.UnsignedIntType;
      if (Q.smaa) T.ping = rt(THREE, W2, H2);   // only SMAA needs an LDR intermediate
      T.accA = rt(THREE, W2, H2, { filter: THREE.NearestFilter });
      T.accB = rt(THREE, W2, H2, { filter: THREE.NearestFilter });
      var bw = Math.max(2, Math.round(W2 / 2)), bh = Math.max(2, Math.round(H2 / 2));
      T.bloomSrc = rt(THREE, bw, bh, { depth: true });
      T.mips = [];
      var mw = bw, mh = bh;
      for (var i = 0; i < 5; i++) {
        mw = Math.max(2, Math.round(mw / 2)); mh = Math.max(2, Math.round(mh / 2));
        T.mips.push(rt(THREE, mw, mh));
      }
      T.mips.dispose = function () { T.mips.forEach(function (m) { m.dispose(); }); };
      if (gtao) gtao.setSize(Math.max(8, Math.round(W2 * Q.aoScale)), Math.max(8, Math.round(H2 * Q.aoScale)));
      if (smaa) smaa.setSize(W2, H2);
      resetAccum();
    }

    /* ---- state ---- */
    var st = {
      moving: false, movingUntil: 0, lastChange: 0, sig: NaN, dirty: true, postDirty: true,
      n: 0, target: 0, accSrc: null, accDst: null, bloomValid: false,
      lastT: 0, emaMs: 16.7, baseMs: 1000, slow: 0, fast: 0, good: 0, upFrames: opts.upFrames || 600, frames: 0, hasBloomObjects: false,
      lastExposure: -1, lastTM: -1, lastPath: '', presented: false
    };
    var projSave = new THREE.Matrix4(), projInvSave = new THREE.Matrix4();
    var clearCol = new THREE.Color();

    function resetAccum() { st.n = 0; st.bloomValid = false; st.presented = false; }
    function taaTarget() { return cfg.taaOff ? 1 : (opts.taaSamples || Q.taa); }

    function signature() {
      var s = 0, e = camera.matrixWorld.elements, p = camera.projectionMatrix.elements, i;
      for (i = 0; i < 16; i++) s += e[i] * (i + 1.618) + p[i] * (i + 3.14159);
      var k = 0, bloomObjs = 0, bl = cfg.bloom.layer;
      scene.traverseVisible(function (o) {
        var m = o.matrixWorld.elements; k++;
        s += (m[0] + m[1] * 0.7 + m[5] * 1.3 + m[8] * 1.1 + m[10] * 1.7 + m[12] * 2.1 + m[13] * 2.9 + m[14] * 3.7) * (1 + (k % 97) * 0.0131);
        if (o.isInstancedMesh) s += o.instanceMatrix.version * 7.77 + o.count;
        if (o.isMesh) {
          // auto-enrol glow sources: userData.bloom === true, or RenderKit.materials led / emissiveScreen
          var mu = o.material && !Array.isArray(o.material) ? o.material.userData : null;
          if (cfg.bloom.auto !== false && mu && (mu.bloom === true || mu.rk === 'led' || (cfg.bloom.autoScreens && mu.rk === 'emissiveScreen'))) o.layers.enable(bl);
          if (o.layers.mask & (1 << bl)) bloomObjs++;
        }
      });
      st.hasBloomObjects = bloomObjs > 0;
      return s + k * 1000.123;
    }

    function tmMode() {
      var tm = cfg.toneMapping != null ? cfg.toneMapping : renderer.toneMapping;
      if (tm === THREE.NeutralToneMapping) return 1;
      if (tm === THREE.AgXToneMapping) return 2;
      if (tm === THREE.ACESFilmicToneMapping) return 3;
      return 0;
    }

    /* ---- GPU timing (opt-in EXT_disjoint_timer_query_webgl2; see note below) ---- */
    var timerExt = null;
    // Off by default: on ANGLE/Metal (Chrome, macOS) TIME_ELAPSED queries return inflated,
    // inconsistent values and each query forces a command-buffer split. Use for relative checks only.
    try { timerExt = opts.gpuTimers === true ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; } catch (e) { timerExt = null; }
    var timing = { pending: [], ema: {}, active: null };
    function tBegin(label) {
      if (!timerExt || timing.active) return;
      var q = gl.createQuery(); gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q); timing.active = { label: label, q: q };
    }
    function tEnd() {
      var a = timing.active; if (!a) return; timing.active = null;
      gl.endQuery(timerExt.TIME_ELAPSED_EXT); timing.pending.push(a);
    }
    function record(label, ms) { var e = timing.ema[label]; timing.ema[label] = e == null ? ms : e * 0.9 + ms * 0.1; }
    function tPoll() {
      if (!timerExt || !timing.pending.length) return;
      var disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
      for (var i = timing.pending.length - 1; i >= 0; i--) {
        var p = timing.pending[i];
        if (gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) {
          if (!disjoint) record(p.label, gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(p.q); timing.pending.splice(i, 1);
        }
      }
      while (timing.pending.length > 64) gl.deleteQuery(timing.pending.shift().q);
    }

    /* ---- passes ---- */
    function renderScene(target) {
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    }

    function renderAO() {
      if (!gtao || cfg.aoOff || !Q.ao) return false;
      var sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      gtao.render(renderer, null, null);
      renderer.shadowMap.autoUpdate = sm;
      return true;
    }

    var hidden = [];
    function renderBloom(sceneTex) {
      var b = cfg.bloom;
      var useScene = b.threshold != null;
      if (cfg.bloomOff || !Q.bloom || !(b.strength > 0.0005) || (!st.hasBloomObjects && !useScene)) return false;
      var sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      var bg = scene.background, ov = scene.overrideMaterial, mask = camera.layers.mask;
      renderer.setRenderTarget(T.bloomSrc);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      if (st.hasBloomObjects) {
        scene.background = null;
        if (b.occlusion) {
          // opaque depth-only-ish prepass so glowing surfaces are hidden where something covers
          // them; transparent meshes (glass covers, shadow planes) are skipped so they never block
          hidden.length = 0;
          scene.traverseVisible(function (o) {
            if (o.isMesh && o.material && (Array.isArray(o.material) ? o.material[0].transparent : o.material.transparent)) { hidden.push(o); }
          });
          for (var i = 0; i < hidden.length; i++) hidden[i].visible = false;
          scene.overrideMaterial = occluderMat;
          renderer.render(scene, camera);
          scene.overrideMaterial = ov;
          for (i = 0; i < hidden.length; i++) hidden[i].visible = true;
        }
        camera.layers.set(b.layer);
        renderer.render(scene, camera);
        camera.layers.mask = mask;
        scene.background = bg;
      }
      renderer.shadowMap.autoUpdate = sm;
      // prefilter -> mip 0
      preMat.uniforms.tLayer.value = T.bloomSrc.texture;
      preMat.uniforms.texel.value.set(1 / T.bloomSrc.width, 1 / T.bloomSrc.height);
      preMat.uniforms.tScene.value = sceneTex;
      preMat.uniforms.sceneTexel.value.set(1 / size.W, 1 / size.H);
      preMat.uniforms.useScene.value = useScene ? 1 : 0;
      preMat.uniforms.threshold.value = useScene ? b.threshold : 1e9;
      preMat.uniforms.knee.value = b.knee;
      preMat.uniforms.sceneStrength.value = b.sceneStrength;
      quad.draw(renderer, preMat, T.mips[0]);
      var i2;
      for (i2 = 0; i2 < T.mips.length - 1; i2++) {
        downMat.uniforms.tSrc.value = T.mips[i2].texture;
        downMat.uniforms.texel.value.set(1 / T.mips[i2].width, 1 / T.mips[i2].height);
        downMat.uniforms.karis.value = i2 === 0 ? 1 : 0;
        quad.draw(renderer, downMat, T.mips[i2 + 1]);
      }
      for (i2 = T.mips.length - 1; i2 > 0; i2--) {
        upMat.uniforms.tSrc.value = T.mips[i2].texture;
        upMat.uniforms.texel.value.set(b.radius / T.mips[i2].width, b.radius / T.mips[i2].height);
        upMat.uniforms.weight.value = 1.0;
        quad.draw(renderer, upMat, T.mips[i2 - 1]);
      }
      return true;
    }

    function bindAOUp(u, aoOn) {
      var bil = !!(aoOn && T.scene.depthTexture && gtao && Q.aoScale < 0.999 && cfg.ao.bilateral);
      u.bilateral.value = bil ? 1 : 0;
      if (!bil) return;
      u.tDepthFull.value = T.scene.depthTexture;
      u.tDepthAO.value = gtao.depthTexture;
      u.aoTexel.value.set(1 / gtao.width, 1 / gtao.height);
      u.camNF.value.set(camera.near, camera.far);
    }
    function grade(srcTex, aoOn, bloomOn, target) {
      var u = gradeMat.uniforms, mode = tmMode();
      if (gradeMat.defines.TM_MODE !== mode) { gradeMat.defines.TM_MODE = mode; gradeMat.needsUpdate = true; }
      u.tScene.value = srcTex;
      u.tAO.value = aoOn ? gtao.pdRenderTarget.texture : white;
      u.aoIntensity.value = aoOn ? cfg.ao.intensity : 0;
      bindAOUp(u, aoOn);
      u.aoAlpha.value = cfg.alpha ? cfg.ao.alphaOcclusion : 0;
      u.tBloom.value = bloomOn ? T.mips[0].texture : black;
      u.bloomStrength.value = bloomOn ? cfg.bloom.strength : 0;
      u.contrast.value = cfg.grade.contrast; u.saturation.value = cfg.grade.saturation;
      u.blackLift.value = cfg.grade.blackLift; u.ditherAmt.value = cfg.grade.dither;
      u.alphaMode.value = cfg.alpha ? 1 : 0;
      u.toneMappingExposure.value = renderer.toneMappingExposure;
      quad.draw(renderer, gradeMat, target);
      st.lastExposure = renderer.toneMappingExposure; st.lastTM = mode;
    }

    function applyJitter(j) {
      projSave.copy(camera.projectionMatrix); projInvSave.copy(camera.projectionMatrixInverse);
      if (j[0] === 0 && j[1] === 0) return;
      var e = camera.projectionMatrix.elements, dx = 2 * j[0] / size.W, dy = 2 * j[1] / size.H;
      if (camera.isPerspectiveCamera) { e[8] -= dx; e[9] -= dy; } else { e[12] += dx; e[13] += dy; }
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    function restoreJitter() { camera.projectionMatrix.copy(projSave); camera.projectionMatrixInverse.copy(projInvSave); }

    // The resolved depth texture only feeds the bilateral AO upsample. Blitting a x4 multisampled depth
    // buffer costs ~1-2.5 ms at 2880x1800 on the M5 (measured), so it is skipped whenever no AO is drawn.
    function aoDrawn(moving) {
      return !!(gtao && Q.ao && !cfg.aoOff && !(moving && opts.aoMoving === false));
    }
    function fastPath() {
      setAONoise(0);
      T.scene.resolveDepthBuffer = aoDrawn(true);
      tBegin('scene'); renderScene(T.scene); tEnd();
      // opts.aoMoving === false: AO only refines the still frame (sites that bake their contact AO; GTAO
      // at DPR 2 is the one pass that can cost the moving frame its 60 fps)
      tBegin('ao'); var aoOn = opts.aoMoving === false ? false : renderAO(); tEnd();
      tBegin('bloom'); var bloomOn = renderBloom(T.scene.texture); tEnd();
      var useSMAA = !!(smaa && Q.smaa && T.ping && opts.smaa !== false);
      tBegin('grade'); grade(T.scene.texture, aoOn, bloomOn, useSMAA ? T.ping : null); tEnd();
      if (useSMAA) {
        renderer.setClearColor(0x000000, 0);
        tBegin('smaa'); smaa.render(renderer, null, T.ping); tEnd();
      }
      st.lastPath = useSMAA ? 'moving+smaa' : 'moving';
    }

    function accumulateStep() {
      var j = jitterAt(st.n);
      T.scene.resolveDepthBuffer = aoDrawn(false);
      applyJitter(j);
      setAONoise(st.n);
      tBegin('scene'); renderScene(T.scene); tEnd();
      restoreJitter();
      // the AO buffer is coarser than the frame (aoScale), so it gets its own, wider jitter
      // (idleJitter AO texels). Averaged over the accumulation this box-filters the half-res AO
      // grid, so contact creases (case on the floor, key gaps) resolve without stair steps.
      var aj = 2 * cfg.ao.idleJitter / Math.max(0.25, Q.aoScale) * (0.5 / JIT_R);   // (same AO footprint as before the tent)
      applyJitter([j[0] * aj, j[1] * aj]);
      tBegin('ao'); var aoOn = renderAO(); tEnd();
      restoreJitter();
      if (!st.bloomValid) { tBegin('bloom'); st.bloomOn = renderBloom(T.scene.texture); tEnd(); st.bloomValid = true; }
      var src = st.n === 0 ? T.accB : st.accSrc, dst = src === T.accA ? T.accB : T.accA;
      accumMat.uniforms.tNew.value = T.scene.texture;
      accumMat.uniforms.tHist.value = src.texture;
      accumMat.uniforms.tAO.value = aoOn ? gtao.pdRenderTarget.texture : white;
      // without moving AO the still frame fades its AO in over the first samples (no visible pop at the
      // hand-off); the converged mean is renormalised so the final strength is still cfg.ao.intensity
      var ramp = 1;
      if (opts.aoMoving === false) {
        var R8 = 8, tgt = taaTarget(), norm = tgt > R8 ? tgt / ((R8 + 1) / 2 + (tgt - R8)) : 1;
        ramp = Math.min(1, (st.n + 1) / R8) * norm;
      }
      accumMat.uniforms.aoIntensity.value = aoOn ? Math.min(1, cfg.ao.intensity * ramp) : 0;
      bindAOUp(accumMat.uniforms, aoOn);
      accumMat.uniforms.aoAlpha.value = cfg.alpha ? cfg.ao.alphaOcclusion : 0;
      accumMat.uniforms.w.value = 1 / (st.n + 1);
      tBegin('accum'); quad.draw(renderer, accumMat, dst); tEnd();
      st.accSrc = dst;
      st.n++;
      present();
    }

    function present() {
      tBegin('grade'); grade(st.accSrc.texture, false, st.bloomOn, null); tEnd();
      st.presented = true;
      st.lastPath = 'accumulate ' + st.n + '/' + taaTarget();
    }

    // fields that change what a MOVING frame costs; a step that changes none of them is skipped (it would
    // only re-allocate targets, i.e. a hitch, for no gain: e.g. AO size when opts.aoMoving === false)
    function movingKey(l) {
      var c = levelCfg(l);
      return [c.msaa, c.bloom, c.smaa, opts.aoMoving === false ? 0 : [c.ao, c.aoScale, c.aoSamples, c.pdSamples]].join('|');
    }
    function stepQuality(dir) {
      var nl = Math.max(0, Math.min(2, level + dir));
      while (dir > 0 && nl < 2 && movingKey(nl) === movingKey(level)) nl++;
      while (dir < 0 && nl > 0 && movingKey(nl) === movingKey(nl - 1)) nl--;
      if (nl === level) return;
      setQualityLevel(nl);
      if (opts.onQuality) opts.onQuality(LEVELS[level]);
    }
    function setQualityLevel(l) {
      var prevMsaa = Q.msaa, prevScale = Q.aoScale;
      level = l; Q = levelCfg(l);
      applyAOParams();
      if (Q.smaa) makeSMAA();
      if (prevMsaa !== Q.msaa || prevScale !== Q.aoScale || (Q.smaa && !T.ping)) allocate(); else resetAccum();
      st.dirty = true;
    }

    /* ---- public ---- */
    var api = {
      bloomLayer: cfg.bloom.layer,
      config: cfg,
      /**
       * Render one frame. Returns true while the pipeline wants more frames (moving, or the idle
       * accumulation has not converged yet); false once the still frame is final and on screen.
       * A render-on-demand caller keeps its loop alive while this returns true.
       */
      render: function (dt) {
        var t = now();
        if (st.lastT) {
          var gap = t - st.lastT;
          if (gap < 100) {
            st.emaMs = st.emaMs * 0.9 + gap * 0.1;
            st.frames++;
            if (st.frames > 20) st.baseMs = Math.min(st.baseMs, st.emaMs);
          }
        }
        st.lastT = t;
        tPoll();

        // auto-resize if someone resized the renderer behind our back
        var db = renderer.getDrawingBufferSize(api._v2 || (api._v2 = new THREE.Vector2()));
        if (db.x !== size.W || db.y !== size.H) {
          var pr = renderer.getPixelRatio();
          size.dpr = pr; size.w = db.x / pr; size.h = db.y / pr; size.W = db.x; size.H = db.y;
          allocate();
        }

        if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
        if (camera.parent === null) camera.updateMatrixWorld();
        var sig = signature();
        if (sig !== st.sig || st.dirty) {
          st.sig = sig; st.dirty = false; st.lastChange = t; resetAccum();
        }
        var moving = st.moving || t < st.movingUntil || (t - st.lastChange) < cfg.idleDelay;

        var ac = renderer.autoClear, cc = renderer.getClearColor(clearCol).getHex(), ca = renderer.getClearAlpha();
        var infoReset = renderer.info.autoReset;
        renderer.info.autoReset = false; renderer.info.reset();
        renderer.autoClear = false;
        var want = true;
        try {
          if (api.debugView === 'ao' && gtao) {
            T.scene.resolveDepthBuffer = true;
            renderScene(T.scene); renderAO();
            debugMat.uniforms.tSrc.value = gtao.pdRenderTarget.texture;
            quad.draw(renderer, debugMat, null);
            st.lastPath = 'debug:ao'; want = false;
          } else if (moving) {
            resetAccum();
            fastPath();
            // adaptive: step down when frames are consistently slower than the display allows
            if (!forced) {
              var limit = Math.max(st.baseMs + 2.5, 17.5);
              if (st.emaMs > limit) st.slow++; else st.slow = Math.max(0, st.slow - 1);
              if (st.slow > 45) { st.slow = 0; st.good = 0; stepQuality(+1); }
              // recovery: a dip caused by something else on the GPU (another tab, a heavy section) must not
              // cost the rest of the visit its quality. After upFrames smooth moving frames, try one level
              // up; each failed attempt doubles the wait (10 s, 20 s, 40 s ...), so it cannot ping-pong.
              else if (level > 0) {
                if (st.emaMs <= Math.max(st.baseMs + 1.0, 17.0)) st.good++; else st.good = 0;
                if (st.good > st.upFrames) { st.good = 0; st.upFrames = Math.min(st.upFrames * 2, 9600); stepQuality(-1); }
              }
            }
          } else {
            var target = taaTarget();
            if (st.n < target) { accumulateStep(); want = st.n < target; }
            else if (!st.presented || st.lastExposure !== renderer.toneMappingExposure || st.lastTM !== tmMode()) { present(); want = false; }
            else want = false;
          }
        } finally {
          renderer.setClearColor(cc, ca);
          renderer.autoClear = ac;
          renderer.info.autoReset = infoReset;
          renderer.setRenderTarget(null);
        }
        var sum = 0; ['scene', 'ao', 'bloom', 'grade', 'smaa', 'accum'].forEach(function (k) { if (timing.ema[k]) sum += timing.ema[k]; });
        timing.ema.total = sum || null;
        return want || moving;
      },
      setSize: function (w, h, dpr) {
        dpr = dpr || renderer.getPixelRatio();
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, opts.updateStyle === true);
        var db = renderer.getDrawingBufferSize(new THREE.Vector2());
        size.w = w; size.h = h; size.dpr = dpr; size.W = db.x; size.H = db.y;
        allocate();
        st.dirty = true;
      },
      /** true while the camera/scene is being driven; false starts the idle countdown (idleDelay ms) */
      setMoving: function (b) {
        if (b) { st.moving = true; }
        else if (st.moving) { st.moving = false; st.movingUntil = now() + cfg.idleDelay; }
      },
      /** call after any change the transform signature cannot see (material, texture, uniform) */
      invalidate: function () { st.dirty = true; },
      setQuality: function (q) {
        if (q === 'auto') { forced = null; return; }
        if (!QUALITY[q]) return;
        forced = q; setQualityLevel(QUALITY[q].level);
      },
      /** override quality-level fields live, e.g. { msaa: 2, aoSamples: 6, smaa: true, taa: 16 } */
      setTune: function (o) { opts.tune = Object.assign({}, opts.tune || {}, o || {}); setQualityLevel(level); },
      resetTune: function () { opts.tune = baseTune; setQualityLevel(level); },
      /** switch whole stages: { ao, bloom, taa } (true/false) */
      setEnabled: function (o) {
        o = o || {};
        if (o.ao != null) cfg.aoOff = !o.ao;
        if (o.bloom != null) cfg.bloomOff = !o.bloom;
        if (o.taa != null) cfg.taaOff = !o.taa;
        st.dirty = true;
      },
      setIdleDelay: function (ms) { cfg.idleDelay = ms; },
      setAO: function (o) { Object.assign(cfg.ao, o || {}); applyAOParams(); st.dirty = true; },
      setBloom: function (o) { Object.assign(cfg.bloom, o || {}); api.bloomLayer = cfg.bloom.layer; st.dirty = true; },
      setGrade: function (o) { Object.assign(cfg.grade, o || {}); st.presented = false; },
      isConverged: function () { return !st.moving && st.n >= taaTarget(); },
      stats: function () {
        var gpu = {}; for (var k in timing.ema) if (timing.ema[k] != null) gpu[k] = Math.round(timing.ema[k] * 100) / 100;
        return {
          quality: LEVELS[level], forced: forced, path: st.lastPath, samples: st.n, target: taaTarget(),
          converged: api.isConverged(), frameMs: Math.round(st.emaMs * 100) / 100, baseMs: Math.round(st.baseMs * 100) / 100,
          size: [size.W, size.H], dpr: size.dpr, ao: !!(gtao && Q.ao && !cfg.aoOff), aoSize: gtao ? [gtao.width, gtao.height] : null,
          smaa: !!(smaa && Q.smaa), bloom: !!(Q.bloom && !cfg.bloomOff), bloomObjects: st.hasBloomObjects,
          alpha: cfg.alpha, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          timer: timerExt ? 'gpu-query (approx.)' : 'none', gpuMs: gpu
        };
      },
      /** debug: show an intermediate buffer instead of the final image ('ao' | null) */
      debugView: null,
      /** debug / QA: the live render targets */
      targets: function () { return T; },
      dispose: function () {
        disposeTargets();
        if (gtao) gtao.dispose(); if (smaa) smaa.dispose();
        [accumMat, gradeMat, downMat, preMat, upMat, occluderMat, debugMat].forEach(function (m) { m.dispose(); });
        white.dispose(); black.dispose(); quad.dispose();
        aoNoise.forEach(function (t) { if (t) t.dispose(); });
      }
    };

    makeGTAO();
    if (Q.smaa) makeSMAA();
    var db0 = renderer.getDrawingBufferSize(new THREE.Vector2());
    size.dpr = renderer.getPixelRatio(); size.W = db0.x; size.H = db0.y; size.w = db0.x / size.dpr; size.h = db0.y / size.dpr;
    allocate();
    return api;
  };

  /* ===========================================================================
   * 3. CONTACT SHADOW (drei-style): ortho depth-from-below -> 2x separable blur -> floor plane
   * ======================================================================== */
  var BLUR_FRAG = [
    'uniform sampler2D tSrc; uniform vec2 dir;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 s = texture2D(tSrc, vUv) * 0.2270270270;',
    '  s += (texture2D(tSrc, vUv + dir * 1.3846153846) + texture2D(tSrc, vUv - dir * 1.3846153846)) * 0.3162162162;',
    '  s += (texture2D(tSrc, vUv + dir * 3.2307692308) + texture2D(tSrc, vUv - dir * 3.2307692308)) * 0.0702702703;',
    '  gl_FragColor = s;',
    '}'].join('\n');
  var SHADOW_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  var SHADOW_FRAG = [
    'uniform sampler2D tShadow; uniform vec3 color; uniform float opacity;',
    'varying vec2 vUv;',
    'void main() {',
    // soft edge fade so the plane never shows a border
    '  vec2 e = smoothstep(0.0, 0.08, vUv) * smoothstep(0.0, 0.08, 1.0 - vUv);',
    '  gl_FragColor = vec4(color, texture2D(tShadow, vUv).a * opacity * e.x * e.y);',
    '}'].join('\n');

  RK.contactShadow = function (renderer, scene, target, opts) {
    opts = opts || {};
    var THREE = getTHREE(opts.THREE);
    var LAYER = opts.layer != null ? opts.layer : 29;
    var w = opts.width || 40, h = opts.height || 40, res = opts.resolution || 1024, far = opts.far || 8;
    var cfg = {
      blur: opts.blur != null ? opts.blur : 2.5,        // texels of the first blur iteration
      darkness: opts.darkness != null ? opts.darkness : 0.85,
      falloff: opts.falloff != null ? opts.falloff : 2.2,  // >1 = tighter, denser contact core
      opacity: opts.opacity != null ? opts.opacity : 1
    };
    var rtA = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false });
    var rtB = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });

    var geo = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
    var uv = geo.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // shadow image v runs toward +z
    var col = new THREE.Color(opts.color != null ? opts.color : 0x000000);
    var mat = new THREE.ShaderMaterial({
      uniforms: { tShadow: { value: rtA.texture }, color: { value: new THREE.Vector3(col.r, col.g, col.b) }, opacity: { value: cfg.opacity } },
      vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = opts.renderOrder != null ? opts.renderOrder : -1;
    mesh.userData.noContactShadow = true;
    mesh.name = 'RenderKit.contactShadow';

    var cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.0, far);
    cam.rotation.x = Math.PI / 2; // look up (+y); image up = world +z
    cam.layers.set(LAYER);
    mesh.add(cam);

    var depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    depthMat.userData.u = { darkness: { value: cfg.darkness }, falloff: { value: cfg.falloff } };
    depthMat.onBeforeCompile = function (shader) {
      shader.uniforms.darkness = depthMat.userData.u.darkness;
      shader.uniforms.falloff = depthMat.userData.u.falloff;
      shader.fragmentShader = 'uniform float darkness;\nuniform float falloff;\n' + shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), pow( saturate( 1.0 - fragCoordZ ), falloff ) * darkness );');
    };
    var quad = makeQuad(THREE);
    var blurMat = fsMat(THREE, BLUR_FRAG, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    var clearCol = new THREE.Color();

    function blur(amount) {
      blurMat.uniforms.tSrc.value = rtA.texture; blurMat.uniforms.dir.value.set(amount / res, 0);
      quad.draw(renderer, blurMat, rtB);
      blurMat.uniforms.tSrc.value = rtB.texture; blurMat.uniforms.dir.value.set(0, amount / res);
      quad.draw(renderer, blurMat, rtA);
    }

    function update() {
      target.traverse(function (o) {
        if (o === mesh) return;
        var skip = o.userData && o.userData.noContactShadow;
        if (!skip && o.isMesh && o.material && !Array.isArray(o.material) && o.material.depthWrite === false) skip = true;
        if (skip) o.layers.disable(LAYER); else o.layers.enable(LAYER);
      });
      mesh.layers.disable(LAYER);
      depthMat.userData.u.darkness.value = cfg.darkness;
      depthMat.userData.u.falloff.value = cfg.falloff;
      mat.uniforms.opacity.value = cfg.opacity;
      var bg = scene.background, ov = scene.overrideMaterial, vis = mesh.visible;
      var prevT = renderer.getRenderTarget(), ac = renderer.autoClear;
      renderer.getClearColor(clearCol); var ca = renderer.getClearAlpha();
      var sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      mesh.visible = false; scene.background = null; scene.overrideMaterial = depthMat;
      renderer.autoClear = false;
      if (mesh.parent) mesh.updateMatrixWorld(true);
      renderer.setRenderTarget(rtA); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
      renderer.render(scene, cam);
      scene.overrideMaterial = ov; scene.background = bg; mesh.visible = vis;
      blur(cfg.blur);
      blur(cfg.blur * 0.4);
      renderer.shadowMap.autoUpdate = sm;
      renderer.setClearColor(clearCol, ca); renderer.autoClear = ac; renderer.setRenderTarget(prevT);
    }

    return {
      mesh: mesh, camera: cam, config: cfg, texture: rtA.texture,
      update: update,
      set: function (o) { Object.assign(cfg, o || {}); },
      dispose: function () {
        rtA.dispose(); rtB.dispose(); geo.dispose(); mat.dispose(); depthMat.dispose(); blurMat.dispose(); quad.dispose();
        if (mesh.parent) mesh.parent.remove(mesh);
      }
    };
  };
})(window);
