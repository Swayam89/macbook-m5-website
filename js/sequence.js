/* =============================================================================
   sequence.js · swaysalyedweb pre-rendered film player (APP.sequence) and
   embedded-asset helpers (APP.loadEmbeddedGLB, APP.assetBuffer, APP.assetURL).

   WHY: Blender/Cycles frames are path-traced (real global illumination, soft
   area shadows, glossy inter-reflection, depth of field, motion blur). A browser
   cannot render that live at 60 fps, but it can SCRUB it: the scroll picks
   frame round(p·(N-1)) of a pre-rendered film and a 2D canvas draws it. That is
   how "Blender-level" imagery gets into a static, no-build page.

   Classic script (no import/export), so it runs from file:// and from a server.
   <img> and 2D-canvas drawImage of local images both work on file:// (the canvas
   is "tainted", which only forbids reading pixels back; it still displays).
   Load order, all `defer`:
     gsap → ScrollTrigger → lenis → core.js → sequence.js
       → assets/seq/<shot>/manifest.js (one per shot, from scripts/encode_sequence.sh)
       → product.js … sections.js (the modules that call APP.sequence)

   -----------------------------------------------------------------------------
   APP.sequence(target, manifest, opts) → seq
     target    a <canvas>, a container element, or a selector. A container gets
               a <canvas class="seq__canvas" aria-hidden="true"> appended; an
               <img data-seq-poster> inside it is reused as the poster (it paints
               before any JS runs and is the no-JS / reduced-motion still).
     manifest  window.SEQ['<shot>'] or just '<shot>'.
     opts      fit         'cover' (default) | 'contain'
               focal       [x, y] (0..1 of the frame) kept in view by cover.
                           Default manifest.focal || [.5, .5]
               priority    'keyframes-first' (default: poster, then every 16th
                           frame, 8th, 4th, 2nd, all) | 'linear'
               preload     'auto' (default) | 'none' = only frames that are asked
                           for (the default under reduced motion) | 'keyframes' = the
                           poster and the keyframe pass (every 16th frame) only, until
                           seq.preload('auto') (e.g. a second finish: load it in full
                           when its swatch is hovered or focused)
               onDraw      fn(idx, seq): runs after every paint with the frame index
                           actually drawn (it can differ from the float asked for:
                           whole frames only, or the nearest loaded one). Use it to
                           correct for the fraction (see blender.md §10.2, zoom).
               lazy        true (default): frames start loading when the box is
                           within ~2 screens; false: now. The poster always loads now.
               decode      'window' (default): a frame is decoded (img.decode(), off the
                           main thread) when the playhead comes within `warm` frames,
                           so draws never decode on the main thread | 'all': decode
                           every frame as it loads (more memory up front).
               warm        frames decoded ahead of the playhead (default 10, phone 6).
                           Decoded frames live in the browser's image cache (w·h·4
                           bytes each, purgeable), not in JS; a film costs at most
                           frames × w × h × 4 (encode_sequence.sh prints it per size).
               size        force one size key ('1920', '960', '608x1080').
               sharpness   .8 (default): a size may be upscaled up to 1/.8 before
                           a bigger one is picked.
               maxPixels   cap on w·h of the picked size. Default 1.2 MP on phones
                           (viewport's short side ≤ 500px), none on tablets/desktop:
                           a 390px phone gets the 608x1080 crop size when the film has
                           one (sharp), else the 960 size (soft under full-bleed cover).
               blend       false (default) | true: cross-fade neighbours at
                           fractional frames (opaque films only).
               background  CSS colour for the 'contain' bars of an opaque film.
               concurrency parallel frame requests (default 6).
               base        prefix for the manifest's relative URLs (default '').
               crossOrigin 'anonymous' when frames live on a CORS CDN.
               onReady     fn(seq): poster painted + keyframe pass loaded.
   seq = {
     progress(p)    0..1 → frame p·(N-1). Call it from a scrubbed TIMELINE's
                    onUpdate (never create a ScrollTrigger in here).
     draw(f)        frame as a float, 0..N-1.
     ready          Promise → seq when the poster is up and the keyframe pass is
                    in (scrubbable end to end). Never rejects.
     complete       Promise → seq when every frame of the chosen size is in.
     loaded()       0..1 share of the chosen size's frames loaded.
     preload(mode)  'auto': finish loading a film created with preload 'keyframes'.
     point(u, v)    frame UV (v down) → {x, y} CSS px inside the box (after fit).
     anchor(name)   manifest.anchors[name] at the playhead → {x, y, visible}:
                    labels that track a point of the rendered product.
     visible(b)     override visibility (a canvas on the fixed stage, where an
                    IntersectionObserver cannot judge).
     stats()        QA numbers: size, frames, loadedFrames, drawn, exact, decoded,
                    decodedMB, inexactDraws, canvas, box, dpr, firstDrawMs …
                    (decoded/decodedMB count img.decode() calls so far, an upper
                    bound: the browser evicts decoded frames. Measured in Chrome,
                    a full scrub of a 120-frame 1920 film peaked at ~355 MB over
                    the page's baseline, 608x1080 on a phone at ~100 MB.)
     dispose()
     canvas, box, manifest, frames, failed
   }
   Draw rule: the exact frame if it is in; otherwise the NEAREST loaded frame
   (poster included), and the exact frame is fetched next. So the canvas is never
   blank once the poster is in, and a scrub lands exactly once frames arrive.
   Rendering runs on the shared gsap ticker (APP.loop) only while the box is on
   screen and something changed. Resizes redraw synchronously (no blank frame).

   CSS the box needs (base.css carries it):
     .seq{position:relative;overflow:hidden}
     .seq__canvas,.seq [data-seq-poster]{position:absolute;inset:0;width:100%;height:100%;display:block}
     .seq [data-seq-poster]{object-fit:cover}          (contain films: contain)
   The canvas bitmap is never larger than the chosen frames (CSS scales it up),
   so a 1920 film on a 2880px-wide DPR 2 screen costs a 1:1 blit per frame.

   SECTION TEMPLATE (sections.js style; the timeline scrubs a plain object):
     APP.register('film', function (A) {
       var sec = document.getElementById('film');
       var seq = A.sequence(sec.querySelector('.seq'), 'hero', { fit: 'cover' });
       if (A.reducedMotion || !A.gsap) { seq.progress(0.62); return; }     // designed still
       var S = { p: 0 };
       var tl = A.gsap.timeline({ defaults: { ease: 'none' },
         onUpdate: function () { seq.progress(S.p); },
         scrollTrigger: { trigger: sec, start: 'top top', end: A.pinEnd(3), pin: true,
                          scrub: 1, invalidateOnRefresh: true } });
       tl.to(S, { p: 1, duration: 1 }, 0);
     }, { order: 20 });

   -----------------------------------------------------------------------------
   EMBEDDED ASSETS (file:// cannot fetch() local files or use local images as
   WebGL textures, so binaries ship base64 inside a classic .js written by
   scripts/embed_asset.py):
     window.GLB[name]   = '<base64>'                  (.glb)
     window.ASSET[name] = 'data:<mime>;base64,<…>'    (anything else)
   APP.loadEmbeddedGLB(name, opts) → Promise<gltf>   three's GLTFLoader.parse on
       the decoded bytes. Uses THREE_ADDONS.GLTFLoader when the shim exports it,
       else import('three/addons/loaders/GLTFLoader.js') through the importmap.
       opts: setup(loader) to attach DRACO/KTX2/meshopt decoders; free: true
       drops the base64 string once parsed. Rejects when three is unavailable.
   APP.assetBuffer(name) → ArrayBuffer    APP.assetURL(name) → data: URI
   ========================================================================== */
(function (win, doc) {
  'use strict';

  var APP = win.APP || (win.APP = {});
  var STRIDES = [16, 8, 4, 2, 1];      // keyframes-first passes
  var uid = 0;

  function now() { return (win.performance && performance.now) ? performance.now() : Date.now(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mq(q) { try { return win.matchMedia(q).matches; } catch (e) { return false; } }
  function info(msg, e) { try { console.info('[sequence] ' + msg, e || ''); } catch (x) { /* no console */ } }
  function isMobile() { return typeof APP.isMobile === 'boolean' ? APP.isMobile : mq('(max-width: 768px)'); }
  function reduced() { return typeof APP.reducedMotion === 'boolean' ? APP.reducedMotion : mq('(prefers-reduced-motion: reduce)'); }
  function dprCap() {
    if (APP.util && typeof APP.util.dprCap === 'function') return APP.util.dprCap();
    return Math.min(win.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
  }
  function fmt(pattern, n) {
    return pattern.replace(/%(0?)(\d*)d/, function (_, z, w) {
      var s = String(n); w = +w || 0;
      while (s.length < w) s = (z ? '0' : ' ') + s;
      return s;
    });
  }
  // Only an explicit Save-Data or a 2g-class link steps a size down. effectiveType '3g' is an RTT estimate that
  // desktop Chrome reports on ordinary Wi-Fi (seen: rtt 350ms, '3g' on a Mac serving localhost), so it is ignored.
  function saveData() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  }

  /* ------------------------------------------------------------- manifest */
  function normalize(man) {
    if (!man || !(man.frames > 0) || !man.sizes || !man.sizes.length || !man.pattern) return null;
    var sizes = man.sizes.map(function (s) {
      var c = s.crop && s.crop.length === 4 ? s.crop.slice() : [0, 0, 1, 1];
      var key = s.key || (c[0] || c[1] || c[2] !== 1 || c[3] !== 1 ? s.w + 'x' + s.h : String(s.w));
      return { key: key, w: s.w, h: s.h, dir: s.dir, crop: c, bytes: s.bytes || 0,
               effW: s.w / (c[2] - c[0]), effH: s.h / (c[3] - c[1]), full: c[0] === 0 && c[1] === 0 && c[2] === 1 && c[3] === 1 };
    });
    var full = sizes.filter(function (s) { return s.full; }).sort(function (a, b) { return b.w - a.w; })[0] || sizes[0];
    return {
      name: man.name || '', frames: man.frames | 0, start: man.start == null ? 1 : man.start | 0,
      fps: man.fps || 30, W: man.width || full.w, H: man.height || full.h, sizes: sizes,
      pattern: man.pattern, alpha: !!man.alpha, poster: man.poster || null,
      posterIdx: clamp((man.posterFrame || 1) - 1, 0, (man.frames | 0) - 1),
      focal: man.focal || null, anchors: man.anchors || null, raw: man
    };
  }

  /* --------------------------------------------------------- APP.sequence */
  APP.sequence = function (target, manifest, opts) {
    opts = opts || {};
    var id = ++uid;
    var el = typeof target === 'string' ? doc.querySelector(target) : target;
    var man = normalize(typeof manifest === 'string' ? (win.SEQ || {})[manifest] : manifest);

    var readyRes, completeRes;
    var handle = {
      ready: new Promise(function (r) { readyRes = r; }),
      complete: new Promise(function (r) { completeRes = r; }),
      failed: false
    };
    function noop() {}
    if (!el || !man) {
      info(!el ? 'no target element for APP.sequence' : 'manifest missing or invalid (' +
        (typeof manifest === 'string' ? 'window.SEQ["' + manifest + '"]' : 'object') + '). Load its manifest.js before this module.');
      handle.failed = true;
      handle.progress = handle.draw = handle.visible = noop;
      handle.loaded = function () { return 0; };
      handle.point = handle.anchor = function () { return { x: 0, y: 0, visible: false }; };
      handle.stats = function () { return { failed: true }; };
      handle.dispose = noop;
      readyRes(handle); completeRes(handle);
      return handle;
    }

    /* ---------------------------------------------------------- elements */
    var created = false, canvas, box;
    if (el.tagName === 'CANVAS') {
      canvas = el; box = el;
      // A canvas sized only by its width/height attributes would grow every time its bitmap is resized
      // (the box is measured from the canvas itself). Freeze its current CSS size in that case.
      var w0 = canvas.clientWidth, h0 = canvas.clientHeight, ow = canvas.width;
      canvas.width = ow + 7;
      if (canvas.clientWidth !== w0) {
        canvas.style.width = w0 + 'px'; canvas.style.height = h0 + 'px';
        info('the canvas has no CSS size; froze it at ' + w0 + 'px. Size it with CSS (or pass its container).');
      }
      canvas.width = ow;
    }
    else {
      box = el;
      canvas = el.querySelector('canvas.seq__canvas');
      if (!canvas) {
        canvas = doc.createElement('canvas');
        canvas.className = 'seq__canvas';
        canvas.setAttribute('aria-hidden', 'true');
        el.appendChild(canvas);
        created = true;
      }
    }
    var posterEl = opts.posterEl || (box !== canvas ? box.querySelector('img[data-seq-poster]') : null);
    // An opaque 2D canvas is black until its first draw, and it sits over the <img> poster: keep it
    // hidden until then, so the poster (or the page behind) shows instead of a black flash.
    var visWas = canvas.style.visibility;
    canvas.style.visibility = 'hidden';
    var N = man.frames;
    var fit = opts.fit === 'contain' ? 'contain' : 'cover';
    var focal = opts.focal || man.focal || [0.5, 0.5];
    var base = opts.base || '';
    var opaque = !man.alpha && (fit === 'cover' || !!opts.background);
    var ctx = canvas.getContext('2d', { alpha: !opaque });
    if (!ctx) {
      info('2D canvas unavailable');
      handle.failed = true;
    }
    var SHARP = opts.sharpness || 0.8;
    var CONC = opts.concurrency || 6;
    var preload = opts.preload || (reduced() ? 'none' : 'auto');
    // Frames are plain <img>s. 'window' (default): each frame is decoded (img.decode(), off the main thread)
    // when the playhead comes within WARM frames of it, so a draw never decodes on the main thread and
    // nothing is decoded for parts of the film nobody reached. 'all': decode every frame as it loads.
    // Decoded pixels live in the browser's image cache (w·h·4 bytes a frame, purgeable), not in JS.
    // ImageBitmaps are deliberately NOT used: creating and releasing them while drawing crashed the Chrome
    // 153 renderer (Metal) within 5 s in a minimal repro; plain <img> draws ran 60 fps with no crash.
    var decodeAll = opts.decode === 'all';
    var WARM = opts.warm || (isMobile() ? 6 : 10);

    /* ------------------------------------------------------------- state */
    var tiers = man.sizes.map(function (s) {
      return { key: s.key, w: s.w, h: s.h, dir: s.dir, crop: s.crop, effW: s.effW, full: s.full, bytes: s.bytes,
               frames: null, loaded: 0, failed: 0, decoded: 0, inflight: 0, order: null, qi: 0, demand: [], started: false };
    });
    var poster = { img: null, ok: false, w: 0, h: 0, crop: [0, 0, 1, 1], idx: man.posterIdx };
    var tier = null;                 // chosen size
    var L = null;                    // layout
    var target = 0, lastTarget = 0, dir = 1;
    var dirty = true, isVisible = true, override = null, near = opts.lazy === false, disposed = false;
    var drawnKey = '', drawnIdx = -1, drawnExact = false, drawnSrc = null;
    var warmInflight = 0, warmDirty = true;
    var st = { t0: now(), firstDraw: -1, posterAt: -1, readyAt: -1, completeAt: -1, draws: 0, drawMs: 0, maxDrawMs: 0,
               switches: 0, inexact: 0 };
    var readyDone = false, completeDone = false, readyNeed = 0;
    var smoothQ = '';

    function url(t, i) { return base + t.dir + fmt(man.pattern, i + man.start); }

    /* ------------------------------------------------------------ layout */
    function visRect(bw, bh) {
      var A = man.W / man.H, bA = bw / bh, vw = 1, vh = 1;
      if (fit === 'cover') { if (bA > A) vh = A / bA; else vw = bA / A; }
      var cx = clamp(focal[0], vw / 2, 1 - vw / 2), cy = clamp(focal[1], vh / 2, 1 - vh / 2);
      return { x0: cx - vw / 2, y0: cy - vh / 2, x1: cx + vw / 2, y1: cy + vh / 2, w: vw, h: vh };
    }
    function inside(c, V) { var e = 1e-4; return V.x0 >= c[0] - e && V.y0 >= c[1] - e && V.x1 <= c[2] + e && V.y1 <= c[3] + e; }
    function pixels(t) { return t.w * t.h; }

    function choose(Lx) {
      if (opts.size) {
        var f = tiers.filter(function (t) { return t.key === String(opts.size); })[0];
        if (f) return f;
      }
      var usable = tiers.filter(function (t) { return inside(t.crop, Lx.V); });
      if (!usable.length) usable = tiers.filter(function (t) { return t.full; });
      if (!usable.length) usable = tiers.slice();
      // Phones: a full-bleed 16:9 film under 'cover' asks for ~2250px of width at DPR 1.5, i.e. the 1920 size
      // (2 MP, 8 MB decoded per frame, 2x the bytes). Cap the pixels per frame instead; a WxH crop size
      // (608x1080) is picked when it exists, because it is both small and sharp.
      var maxPx = opts.maxPixels || (Math.min(win.innerWidth, win.innerHeight) <= 500 ? 1.2e6 : Infinity);
      var fits = usable.filter(function (t) { return pixels(t) <= maxPx; });
      if (fits.length) usable = fits;
      var enough = usable.filter(function (t) { return t.effW >= Lx.needW * SHARP; })
        .sort(function (a, b) { return pixels(a) - pixels(b); });
      var byRes = usable.slice().sort(function (a, b) { return (b.effW - a.effW) || (pixels(a) - pixels(b)); });
      var pick = enough.length ? enough[0] : byRes[0];
      if (saveData()) {                                   // one step down on Save-Data / slow links
        var k = byRes.indexOf(pick);
        if (k > -1 && k + 1 < byRes.length) pick = byRes[k + 1];
      }
      return pick;
    }

    function measure() {
      var bw = box.clientWidth, bh = box.clientHeight;
      if (!bw || !bh) { var r = box.getBoundingClientRect(); bw = r.width; bh = r.height; }
      return [bw, bh];
    }

    function layout(force) {
      var m = measure(), bw = m[0], bh = m[1];
      if (!bw || !bh) return false;
      var dpr = dprCap(), A = man.W / man.H;
      var needW = (fit === 'cover' ? Math.max(bw, bh * A) : Math.min(bw, bh * A)) * dpr;
      var Lx = { bw: bw, bh: bh, dpr: dpr, needW: needW, V: visRect(bw, bh) };
      var pick = choose(Lx);
      // Keep a size that is already chosen unless the new one is sharper, or the old one cannot show this view.
      if (tier && pick !== tier) {
        var keep = inside(tier.crop, Lx.V) && tier.effW >= pick.effW;
        if (keep && !opts.size) pick = tier;
      }
      var s = Math.min(1, pick.effW / needW);
      var cw = Math.max(1, Math.round(bw * dpr * s)), ch = Math.max(1, Math.round(bh * dpr * s));
      Lx.cw = cw; Lx.ch = ch;
      // contain: letterboxed destination inside the canvas
      if (fit === 'contain') {
        var dW = Math.min(cw, ch * A), dH = dW / A;
        Lx.dest = [(cw - dW) / 2, (ch - dH) / 2, dW, dH];
      } else Lx.dest = [0, 0, cw, ch];
      var changedSize = !L || L.cw !== cw || L.ch !== ch;
      L = Lx;
      if (pick !== tier) switchTier(pick);
      if (changedSize) {
        canvas.width = cw; canvas.height = ch;        // clears: redraw now, same task, no blank frame
        smoothQ = '';
        drawnKey = '';
      }
      if (changedSize || force) render(true);
      return true;
    }

    /* ----------------------------------------------------------- loading */
    function buildOrder(first) {
      var order = [], seen = new Uint8Array(N);
      function add(i) { if (i >= 0 && i < N && !seen[i]) { seen[i] = 1; order.push(i); } }
      add(first); add(0); add(N - 1);
      if (opts.priority === 'linear') { for (var i = 0; i < N; i++) add(i); readyNeed = order.length; }
      else {
        for (var k = 0; k < STRIDES.length; k++) {
          for (var j = 0; j < N; j += STRIDES[k]) add(j);
          if (k === 0) readyNeed = order.length;          // the keyframe pass
        }
      }
      return order;
    }

    function switchTier(t) {
      var old = tier;
      tier = t;
      if (old) st.switches++;
      if (!t.frames) {
        t.frames = new Array(N);
        for (var i = 0; i < N; i++) t.frames[i] = { s: 0, img: null, d: 0 };   // s: 0 new 1 loading 2 in 3 failed; d: 0/1 decoding/2 decoded
      }
      if (old && old !== t) {
        old.demand.length = 0; old.qi = old.order ? old.order.length : 0;   // stop feeding the old size
      }
      warmDirty = true;
      if (near && preload !== 'none') {
        if (t.started) { t.qi = 0; pump(t); }            // back to a size used before: resume its queue
        else start(t);
      }
      dirty = true;
    }

    function start(t) {
      if (t.started || disposed) return;
      t.started = true;
      t.order = buildOrder(clamp(Math.round(target), 0, N - 1));
      t.qi = 0;
      pump(t);
    }

    function nextIndex(t) {
      while (t.demand.length) { var d = t.demand.pop(); if (t.frames[d].s === 0) return d; }
      if (preload === 'none' || !t.order) return -1;
      if (preload === 'keyframes' && t.qi >= readyNeed) return -1;
      while (t.qi < t.order.length) { var i = t.order[t.qi++]; if (t.frames[i].s === 0) return i; }
      return -1;
    }

    function pump(t) {
      if (disposed || t !== tier) return;
      while (t.inflight < CONC) {
        var i = nextIndex(t);
        if (i < 0) break;
        loadOne(t, i);
      }
    }

    function want(i) {
      if (!tier || !tier.frames || tier.frames[i].s !== 0) return;
      var d = tier.demand, k = d.indexOf(i);
      if (k > -1) d.splice(k, 1);
      d.push(i);
      if (d.length > 8) d.shift();
      pump(tier);
    }

    function loadOne(t, i) {
      var f = t.frames[i];
      f.s = 1; t.inflight++;
      var img = new Image();
      img.decoding = 'async';
      if (opts.crossOrigin) img.crossOrigin = opts.crossOrigin;
      f.img = img;
      var settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        t.inflight--;
        if (disposed) return;
        if (ok) { f.s = 2; t.loaded++; if (decodeAll) { f.d = 2; t.decoded++; } }
        else { f.s = 3; f.img = null; t.failed++; if (t.failed === 1) info('frame failed to load: ' + url(t, i)); }
        if (t === tier) {
          if (ok) {
            var tgt = Math.round(target);
            if (drawnIdx < 0 || Math.abs(i - tgt) < Math.abs(drawnIdx - tgt) || (i === tgt && !drawnExact)) dirty = true;
            warmDirty = true;
            if (!ticking) flushSoon();
          }
          checkProgress();
          pump(t);
        }
      }
      if (decodeAll && img.decode) {
        img.src = url(t, i);
        // decode() settles after the load (or its failure); it can also reject for an image that
        // loaded fine (e.g. under decoder pressure), so a real natural size counts as success.
        img.decode().then(function () { done(true); }, function () { done(!!(img.complete && img.naturalWidth)); });
      } else {
        img.onload = function () { done(true); };
        img.onerror = function () { done(false); };
        img.src = url(t, i);
      }
    }

    function checkProgress() {
      if (!tier) return;
      var n = tier.loaded + tier.failed;
      if (!readyDone && (preload === 'none' ? (drawnIdx > -1) : n >= readyNeed) && (drawnIdx > -1 || poster.ok)) {
        readyDone = true; st.readyAt = now() - st.t0;
        box.setAttribute('data-seq', 'ready');
        readyRes(handle);
        if (typeof opts.onReady === 'function') { try { opts.onReady(handle); } catch (e) { info('onReady threw', e); } }
      }
      if (!completeDone && n >= N) {
        completeDone = true; st.completeAt = now() - st.t0;
        box.setAttribute('data-seq', 'complete');
        completeRes(handle);
      }
    }

    /* ------------------------------------------------------------ poster */
    function loadPoster() {
      var img = posterEl;
      if (!img) {
        if (!man.poster) return;
        img = new Image();
        img.decoding = 'async';
        if (opts.crossOrigin) img.crossOrigin = opts.crossOrigin;
        img.src = base + man.poster;
      }
      var p = img.decode ? img.decode() : new Promise(function (res, rej) {
        if (img.complete && img.naturalWidth) res(); else { img.onload = res; img.onerror = rej; }
      });
      p.then(null, function () {
        if (!(img.complete && img.naturalWidth)) throw new Error('poster');
      }).then(function () {
        if (disposed || !img.naturalWidth) return;
        poster.img = img; poster.ok = true; poster.w = img.naturalWidth; poster.h = img.naturalHeight;
        st.posterAt = now() - st.t0;
        if (drawnIdx < 0 || drawnSrc === null) { dirty = true; render(true); }
        checkProgress();
      }, function () { info('poster failed to load'); });
    }

    /* -------------------------------------------------------- decode warm */
    // Decode the frames just ahead of the playhead (WARM of them in the scroll direction, a third of that
    // behind), nearest first, at most 4 at a time. img.decode() runs on a decoder thread; the decoded image
    // then stays in the browser's cache, so drawImage is a plain blit.
    function pumpWarm() {
      if (decodeAll || !tier || !tier.frames || !isOn()) return;
      warmDirty = false;
      var c = clamp(Math.round(target), 0, N - 1), ahead = WARM, behind = Math.max(2, Math.round(WARM / 3));
      for (var d = 0; d <= ahead && warmInflight < 4; d++) {
        warmOne(tier, c + d * dir);
        if (d && d <= behind && warmInflight < 4) warmOne(tier, c - d * dir);
      }
    }
    function warmOne(t, i) {
      if (i < 0 || i >= N) return;
      var f = t.frames[i];
      if (f.s !== 2 || f.d || !f.img || !f.img.decode) return;
      f.d = 1; warmInflight++;
      var img = f.img;
      img.decode().then(function () { return true; }, function () { return false; }).then(function (ok) {
        warmInflight--;
        if (disposed || f.img !== img) return;
        f.d = ok ? 2 : 0;
        if (ok) t.decoded++;
        if (ok && t === tier && i === Math.round(target) && !drawnExact) dirty = true;
        warmDirty = true;
        if (!ticking) flushSoon();
      });
    }

    /* ------------------------------------------------------------ render */
    function nearestLoaded(t, i) {
      if (!t || !t.frames) return -1;
      for (var d = 0; d < N; d++) {
        var a = i - d, b = i + d;
        if (a >= 0 && t.frames[a].s === 2) return a;
        if (b < N && t.frames[b].s === 2) return b;
        if (a < 0 && b >= N) break;
      }
      return -1;
    }
    function srcOf(t, i) {
      var f = t.frames[i];
      return { img: f.img, w: t.w, h: t.h, crop: t.crop, idx: i, tier: t, key: t.key + ':' + i };
    }
    function pick(i) {
      var f = tier && tier.frames ? tier.frames[i] : null;
      if (f && f.s === 2) {
        if (f.d === 2 || decodeAll) return srcOf(tier, i);
        // Loaded but not decoded yet: drawing it now would decode on the main thread. A decoded neighbour
        // (±2 frames) draws instead, and the exact frame redraws when its decode lands (about a frame later).
        for (var d = 1; d <= 2; d++) {
          var a = i - d * dir, b = i + d * dir;
          if (a >= 0 && a < N && tier.frames[a].d === 2) return srcOf(tier, a);
          if (b >= 0 && b < N && tier.frames[b].d === 2) return srcOf(tier, b);
        }
        return srcOf(tier, i);
      }
      // exact frame from another size that can show this view (after a resize)
      for (var k = 0; k < tiers.length; k++) {
        var o = tiers[k];
        if (o !== tier && o.frames && o.frames[i].s === 2 && inside(o.crop, L.V)) return srcOf(o, i);
      }
      var j = nearestLoaded(tier, i), dj = j < 0 ? 1e9 : Math.abs(j - i);
      var dp = poster.ok ? Math.abs(poster.idx - i) : 1e9;
      if (j > -1 && dj <= dp) return srcOf(tier, j);
      if (poster.ok) return { img: poster.img, w: poster.w, h: poster.h, crop: poster.crop, idx: poster.idx, tier: null, key: 'poster' };
      for (k = 0; k < tiers.length; k++) {
        var q = tiers[k];
        if (q === tier || !inside(q.crop, L.V)) continue;
        var m = nearestLoaded(q, i);
        if (m > -1) return srcOf(q, m);
      }
      return null;
    }
    function sourceRect(s) {
      var c = s.crop, V = L.V, cw = c[2] - c[0], ch = c[3] - c[1];
      var sx = (V.x0 - c[0]) / cw * s.w, sy = (V.y0 - c[1]) / ch * s.h;
      var sw = V.w / cw * s.w, sh = V.h / ch * s.h;
      sx = clamp(sx, 0, s.w); sy = clamp(sy, 0, s.h);
      return [sx, sy, Math.min(sw, s.w - sx), Math.min(sh, s.h - sy)];
    }
    function blit(s, alpha) {
      var r = sourceRect(s), d = L.dest;
      var q = r[2] > d[2] * 1.05 ? 'high' : 'medium';
      if (q !== smoothQ) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = q; smoothQ = q; }
      if (alpha < 1) ctx.globalAlpha = alpha;
      ctx.drawImage(s.img, r[0], r[1], r[2], r[3], d[0], d[1], d[2], d[3]);
      if (alpha < 1) ctx.globalAlpha = 1;
    }

    function render(force) {
      if (disposed || !ctx || !L) return;
      var t0 = now();
      var fl = clamp(target, 0, N - 1), i = Math.round(fl);
      var s = pick(i);
      if (!s) return;
      var fr = fl - Math.floor(fl), s2 = null, blendKey = '';
      if (opts.blend && opaque && fr > 0.02 && fr < 0.98 && s.idx === Math.floor(fl) + (fr >= 0.5 ? 1 : 0)) {
        var other = fr >= 0.5 ? Math.floor(fl) : Math.ceil(fl);
        if (tier && tier.frames[other].s === 2) { s2 = srcOf(tier, other); blendKey = '|' + other + ':' + Math.round(fr * 24); }
      }
      var key = s.key + blendKey;
      if (!force && key === drawnKey) { if (s.idx !== i) want(i); return; }
      if (!opaque) ctx.clearRect(0, 0, L.cw, L.ch);
      else if (fit === 'contain') { ctx.fillStyle = opts.background || '#000'; ctx.fillRect(0, 0, L.cw, L.ch); }
      try {
        if (s2) {
          // draw the nearer frame, then the other at its share of the distance
          blit(s, 1);
          blit(s2, fr >= 0.5 ? 1 - fr : fr);
        } else blit(s, 1);
      } catch (e) { info('drawImage failed', e); return; }
      drawnKey = key; drawnIdx = s.idx; drawnSrc = s; drawnExact = s.idx === i && !!s.tier;
      if (typeof opts.onDraw === 'function') { try { opts.onDraw(s.idx, handle); } catch (e) { info('onDraw threw', e); } }
      if (!drawnExact) { want(i); st.inexact++; }
      var ms = now() - t0;
      st.draws++; st.drawMs += ms; if (ms > st.maxDrawMs) st.maxDrawMs = ms;
      if (st.firstDraw < 0) {
        st.firstDraw = now() - st.t0;
        canvas.style.visibility = visWas;
        box.classList.add('is-seq-drawn');
        // The canvas now carries the picture. visibility, not [hidden]: the poster's own CSS sets display:block,
        // which beats [hidden], and a transparent (alpha) film would show the poster through its clear pixels.
        if (posterEl) posterEl.style.visibility = 'hidden';
        checkProgress();
      }
    }

    /* ------------------------------------------------------ ticker/visibility */
    function isOn() { return override === null ? isVisible : override; }
    var ticking = false, stopLoop = null, flushQueued = false;
    function tick() {
      if (disposed || !isOn()) return;
      if (target !== lastTarget) { dir = target > lastTarget ? 1 : -1; lastTarget = target; warmDirty = true; }
      if (warmDirty) pumpWarm();
      if (dirty) { dirty = false; render(false); }
    }
    // Without a ticker (no GSAP), and for events that land between ticks, run the same work in a microtask.
    function flushSoon() {
      if (flushQueued || disposed) return;
      flushQueued = true;
      Promise.resolve().then(function () { flushQueued = false; if (!ticking) tick(); });
    }
    if (typeof APP.loop === 'function' && win.gsap) { stopLoop = APP.loop(tick); ticking = true; }

    function setTarget(f) {
      if (typeof f !== 'number' || f !== f) return;
      f = clamp(f, 0, N - 1);
      if (f === target) return;
      target = f;
      dirty = true;
      if (!ticking) tick();
    }

    var unwatch = [], ro = null;
    function watchers() {
      var W = APP.util && APP.util.watch;
      function io(elm, cb, margin) {
        if (W) return W(elm, cb, margin);
        if (!('IntersectionObserver' in win)) { cb(true); return function () {}; }
        var o = new IntersectionObserver(function (en) { cb(en[en.length - 1].isIntersecting); }, { rootMargin: margin });
        o.observe(elm);
        return function () { o.disconnect(); };
      }
      unwatch.push(io(box, function (v) {
        isVisible = v;
        if (v) { dirty = true; warmDirty = true; if (!ticking) tick(); }
      }, '15% 0px 15% 0px'));
      if (!near) {
        unwatch.push(io(box, function (v) {
          if (!v || near) return;
          near = true;
          if (tier && preload !== 'none') start(tier);
        }, '200% 0px 200% 0px'));
      }
      if ('ResizeObserver' in win) {
        ro = new ResizeObserver(function () { if (!disposed) layout(false); });
        ro.observe(box);
      } else {
        var onR = function () { layout(false); };
        win.addEventListener('resize', onR);
        unwatch.push(function () { win.removeEventListener('resize', onR); });
      }
    }

    /* ------------------------------------------------------------ public */
    handle.canvas = canvas;
    handle.box = box;
    handle.manifest = man.raw;
    handle.frames = N;
    handle.progress = function (p) { setTarget(clamp(+p || 0, 0, 1) * (N - 1)); };
    handle.draw = function (f) { setTarget(+f); };
    handle.loaded = function () { return tier ? tier.loaded / N : 0; };
    // upgrade a 'keyframes' (or 'none') film to a full load, keyframes first
    handle.preload = function (mode) {
      if (disposed || !mode || mode === preload) return;
      preload = mode;
      if (!tier || !near || preload === 'none') return;
      if (tier.started) pump(tier); else start(tier);
    };
    handle.visible = function (v) { override = v == null ? null : !!v; if (isOn()) { dirty = true; warmDirty = true; if (!ticking) tick(); } };
    handle.point = function (u, v) {
      if (!L) return { x: 0, y: 0, visible: false };
      var V = L.V, d = L.dest, sx = L.bw / L.cw, sy = L.bh / L.ch;
      var x = (d[0] + (u - V.x0) / V.w * d[2]) * sx, y = (d[1] + (v - V.y0) / V.h * d[3]) * sy;
      return { x: x, y: y, visible: u >= V.x0 && u <= V.x1 && v >= V.y0 && v <= V.y1 };
    };
    handle.anchor = function (name) {
      var a = man.anchors && man.anchors[name];
      if (!a || !a.length) return { x: 0, y: 0, visible: false };
      var f = clamp(target, 0, a.length - 1), i0 = Math.floor(f), i1 = Math.min(a.length - 1, i0 + 1), k = f - i0;
      var p0 = a[i0], p1 = a[i1];
      var r = handle.point(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k);
      if (p0.length > 2 && !(p0[2] && p1[2])) r.visible = false;   // [u, v, inFrontOfCamera]
      return r;
    };
    handle.stats = function () {
      var t = tier;
      return {
        name: man.name, size: t ? t.key : null, frames: N, loadedFrames: t ? t.loaded : 0, failedFrames: t ? t.failed : 0,
        sizes: tiers.map(function (x) { return x.key + ':' + x.loaded; }).join(' '),
        target: +target.toFixed(3), drawn: drawnIdx, exact: drawnExact, poster: poster.ok,
        decoded: t ? t.decoded : 0, decodedMB: t ? +(t.decoded * t.w * t.h * 4 / 1048576).toFixed(1) : 0, decode: decodeAll ? 'all' : 'window',
        canvas: L ? [L.cw, L.ch] : null, box: L ? [Math.round(L.bw), Math.round(L.bh)] : null,
        dpr: L ? L.dpr : null, visible: isOn(), fit: fit,
        firstDrawMs: Math.round(st.firstDraw), posterMs: Math.round(st.posterAt), readyMs: Math.round(st.readyAt),
        completeMs: Math.round(st.completeAt), draws: st.draws, avgDrawMs: st.draws ? +(st.drawMs / st.draws).toFixed(3) : 0,
        maxDrawMs: +st.maxDrawMs.toFixed(2), switches: st.switches, inexactDraws: st.inexact
      };
    };
    handle.dispose = function () {
      if (disposed) return;
      disposed = true;
      if (stopLoop) stopLoop();
      unwatch.forEach(function (f) { f(); });
      if (ro) ro.disconnect();
      tiers.forEach(function (t) {
        if (!t.frames) return;
        t.frames.forEach(function (f) {
          if (f.s === 1 && f.img) f.img.removeAttribute('src');
          f.img = null;
        });
        t.frames = null;
      });
      if (created && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (posterEl) posterEl.style.visibility = '';
      canvas.style.visibility = visWas;
      box.classList.remove('is-seq-drawn');
      box.removeAttribute('data-seq');
    };
    handle.id = id;

    /* -------------------------------------------------------------- boot */
    box.setAttribute('data-seq', 'loading');
    if (ctx) {
      loadPoster();
      watchers();
      if (!layout(true)) {
        // Box has no size yet (display:none or not laid out): pick the full-frame size that fits the viewport.
        L = { bw: win.innerWidth, bh: win.innerHeight, dpr: dprCap(), V: visRect(win.innerWidth, win.innerHeight),
              needW: Math.max(win.innerWidth, win.innerHeight * man.W / man.H) * dprCap(), cw: 1, ch: 1, dest: [0, 0, 1, 1] };
        switchTier(choose(L));
        L = null;
      }
    }
    return handle;
  };

  /* ------------------------------------------------------ embedded assets */
  function rawOf(name) {
    var g = win.GLB && win.GLB[name], a = win.ASSET && win.ASSET[name];
    return typeof g === 'string' ? g : typeof a === 'string' ? a : null;
  }
  function b64ToBuffer(s) {
    var k = s.indexOf('base64,');
    if (s.slice(0, 5) === 'data:' && k > -1) s = s.slice(k + 7);
    if (typeof Uint8Array.fromBase64 === 'function') {          // native, no binary string (Chrome 140+, Safari 18.2+)
      try { return Uint8Array.fromBase64(s).buffer; } catch (e) { /* fall through */ }
    }
    var bin = win.atob(s), n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  APP.assetBuffer = function (name) {
    var s = rawOf(name);
    if (!s) throw new Error('No embedded asset "' + name + '". Load its .js (scripts/embed_asset.py) before this module.');
    return b64ToBuffer(s);
  };
  APP.assetURL = function (name) {
    var s = rawOf(name);
    if (!s) return null;
    return s.slice(0, 5) === 'data:' ? s : 'data:model/gltf-binary;base64,' + s;
  };

  var gltfLoaderP = null;
  function getGLTFLoader(res) {
    var add = (res && res.ADDONS) || win.THREE_ADDONS || {};
    if (add.GLTFLoader) return Promise.resolve(add.GLTFLoader);
    if (!gltfLoaderP) {
      // Classic scripts may call import(); the bare specifier resolves through the page's importmap
      // ("three/addons/" → jsDelivr), which sends CORS headers, so this works from file:// too.
      gltfLoaderP = import('three/addons/loaders/GLTFLoader.js').then(function (m) { return m.GLTFLoader; });
    }
    return gltfLoaderP;
  }

  APP.loadEmbeddedGLB = function (name, opts) {
    opts = opts || {};
    var when = typeof APP.whenThree === 'function' ? APP.whenThree()
      : Promise.resolve(win.THREE ? { THREE: win.THREE, ADDONS: win.THREE_ADDONS || {} } : null);
    return when.then(function (res) {
      if (!res) throw new Error('three.js is unavailable, so "' + name + '" cannot be parsed');
      var buf = APP.assetBuffer(name);
      return getGLTFLoader(res).then(function (GLTFLoader) {
        var loader = new GLTFLoader();
        if (typeof opts.setup === 'function') opts.setup(loader, res.THREE);
        return new Promise(function (resolve, reject) {
          loader.parse(buf, opts.path || '', function (gltf) {
            if (opts.free) { if (win.GLB) delete win.GLB[name]; if (win.ASSET) delete win.ASSET[name]; }
            resolve(gltf);
          }, function (err) { reject(err instanceof Error ? err : new Error(String(err && err.message || err))); });
        });
      });
    });
  };
})(window, document);
