/* =============================================================================
   sections.js · "Lift the Lid" (MacBook Pro 14-inch with M5, concept site)
   Owns: #brief (20) · #proof (40) · #display (50) · #rail (60) · #battery (70)
         #material (80). Never touches the mac stage.
   Classic script. Every ScrollTrigger is created synchronously inside the
   registered init, in DOM order. Canvases render only when visible && dirty.
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP;
  if (!APP || typeof APP.register !== 'function') return;

  /* ------------------------------------------------------------- helpers */
  var doc = document;
  var TAU = Math.PI * 2;
  var RM = false, MOBILE = false;

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
  function G() { return APP.gsap || window.gsap; }
  function ST() { return APP.ScrollTrigger || window.ScrollTrigger; }
  function prep() { RM = !!APP.reducedMotion; MOBILE = !!APP.isMobile; }
  function pinEnd(k) {
    if (typeof APP.pinEnd === 'function') return APP.pinEnd(k);
    return function () { return '+=' + Math.round(innerHeight * k * (MOBILE ? 0.6 : 1)); };
  }
  function dprCap() { return Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2); }
  function cssVar(name, fallback) {
    var v = getComputedStyle(doc.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  function currentScroll() {
    var l = APP.lenis;
    if (l) return typeof l.targetScroll === 'number' ? l.targetScroll : l.scroll;
    return window.pageYOffset || doc.documentElement.scrollTop || 0;
  }
  function hex(c) {
    c = c.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function mixRGB(a, b, t) {
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
  }
  // Tiny deterministic PRNG so the scenes are identical on every visit.
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Headline reveal through core; a plain rise if core's helper is missing.
  function reveal(el, opts) {
    if (!el) return null;
    if (typeof APP.splitReveal === 'function') return APP.splitReveal(el, opts || {});
    var gsap = G();
    return { tl: gsap.from(el, { autoAlpha: 0, y: 24, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: el, start: (opts && opts.start) || 'top 80%' } }) };
  }

  // One shared ticker for every canvas this file owns.
  var loops = [];
  var tickerOn = false;
  function addLoop(fn) {
    loops.push(fn);
    if (tickerOn) return;
    tickerOn = true;
    G().ticker.add(function (time, deltaMs) {
      var dt = Math.min(deltaMs || 16.7, 64) / 1000;
      for (var i = 0; i < loops.length; i++) loops[i](dt, time);
    });
  }

  function watch(el, cb) {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (entries) { cb(entries[entries.length - 1].isIntersecting); }, { rootMargin: '8% 0px 8% 0px' }).observe(el);
  }

  // Backing store follows the element's CSS size at a capped DPR.
  function surface(canvas, onResize) {
    var s = { c: canvas, ctx: canvas.getContext('2d'), w: 1, h: 1, dpr: 1 };
    s.fit = function () {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 2 || h < 2) return false;
      var d = dprCap();
      var bw = Math.round(w * d), bh = Math.round(h * d);
      var changed = canvas.width !== bw || canvas.height !== bh;
      if (changed) { canvas.width = bw; canvas.height = bh; }
      s.w = w; s.h = h; s.dpr = bw / w;
      return changed;
    };
    s.fit();
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { s.fit(); if (onResize) onResize(); }).observe(canvas);
    } else if (APP.bus) {
      APP.bus.on('resize', function () { s.fit(); if (onResize) onResize(); });
    }
    return s;
  }

  var refreshTimer = 0;
  function refreshSoon(ms) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { var st = ST(); if (st) st.refresh(); }, ms || 300);
  }

  function segButtons(seg) { return seg ? $$('button[data-value]', seg) : []; }
  function bindSeg(seg, onPick) {
    var btns = segButtons(seg);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        onPick(b.getAttribute('data-value'), b);
      });
    });
  }

  /* =======================================================================
     02 #brief · kinetic statement
     Eyebrow wipes on, lead rises line by line from its mask, then the
     statement is read into existence word by word (the only per-word reveal).
     ===================================================================== */
  function initBrief() {
    prep();
    var sec = $('#brief');
    if (!sec) return;
    var gsap = G();
    var eyebrow = $('.eyebrow', sec);
    var lead = $('.brief__lead', sec);
    var statement = $('.brief__statement', sec);

    // #brief overlaps the hero's last screen (css: margin-top:-100svh), so its reveals are keyed to
    // the lead reaching mid-screen: that is the moment the dive ends and the stage fades out.
    // Positions are read from the hero pin itself (created earlier, order 10), so the hand-off lands at
    // the same moment of the dive on every viewport: hero p .975 = dive done, stage almost faded.
    var heroEl = $('#hero');
    function heroST() {
      var all = APP.ScrollTrigger ? APP.ScrollTrigger.getAll() : [];
      for (var i = 0; i < all.length; i++) if (all[i].pin === heroEl) return all[i];
      return null;
    }
    var linked = !RM && !!heroST();
    function heroAt(p) { return function () { var t = heroST(); return t ? Math.round(t.start + p * (t.end - t.start)) : 0; }; }
    var handoff = linked ? heroAt(0.975) : null;
    if (eyebrow && !RM) {
      gsap.fromTo(eyebrow, { clipPath: 'inset(0% 100% 0% 0%)', letterSpacing: '.3em' },
        { clipPath: 'inset(0% 0% 0% 0%)', letterSpacing: '', duration: 1.1, ease: 'expo.out',
          scrollTrigger: { trigger: sec, start: handoff || 'top 78%', toggleActions: 'play none none reverse' } });
    }
    reveal(lead, { type: 'lines', mask: true, start: handoff || 'top 84%', stagger: 0.1, duration: 1.15, from: { yPercent: 115 },
      toggleActions: linked ? 'play none none reverse' : undefined });
    // The statement rises in behind the fading stage instead of sitting dimly over the dive.
    if (statement && linked) {
      gsap.fromTo(statement, { opacity: 0 }, { opacity: 1, ease: 'none',
        scrollTrigger: { trigger: statement, start: handoff, end: function () { return heroAt(1)() + Math.round(innerHeight * 0.18); }, scrub: 0.6 } });
    }

    // Words: .12 → 1 opacity, scrubbed to the reading position.
    if (statement) {
      var words = splitWords(statement);
      if (words.length && !RM && !MOBILE) {
        gsap.fromTo(words, { opacity: 0.12 }, {
          opacity: 1, ease: 'none', stagger: 0.12,
          scrollTrigger: { trigger: statement, start: 'top 75%', end: 'bottom 55%', scrub: 0.6 }
        });
      }
    }

    // Gloss notes: hover or focus shows one; Esc hides it.
    var glosses = $$('.gloss', sec);
    var notes = $$('[data-gloss-note]', sec);
    var active = null;
    function noteFor(key) { for (var i = 0; i < notes.length; i++) if (notes[i].getAttribute('data-gloss-note') === key) return notes[i]; return null; }
    notes.forEach(function (n) { if (!n.id) n.id = 'gloss-note-' + n.getAttribute('data-gloss-note'); });
    function show(key) {
      if (active === key) return;
      var n = noteFor(key);
      if (!n) return;
      notes.forEach(function (m) { m.hidden = m !== n; });
      active = key;
      glosses.forEach(function (b) { b.setAttribute('aria-expanded', String(b.getAttribute('data-gloss') === key)); });
    }
    function hide() {
      if (!active) return;
      active = null;
      notes.forEach(function (m) { m.hidden = true; });
      glosses.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    }
    glosses.forEach(function (b) {
      var key = b.getAttribute('data-gloss');
      var n = noteFor(key);
      b.setAttribute('aria-expanded', 'false');
      if (n) b.setAttribute('aria-controls', n.id);
      b.addEventListener('mouseenter', function () { show(key); });
      b.addEventListener('focus', function () { show(key); });
      b.addEventListener('click', function () { if (active === key && APP.isTouch) hide(); else show(key); });
    });
    doc.addEventListener('keydown', function (e) { if (active && (e.key === 'Escape' || e.key === 'Esc')) hide(); });
  }

  // SplitText words (aria:'none' keeps the gloss buttons accessible), with a
  // text-node walker as the fallback.
  function splitWords(el) {
    var Split = APP.SplitText || window.SplitText;
    if (Split) {
      try {
        var sp = new Split(el, { type: 'words', tag: 'span', wordsClass: 'word', aria: 'none' });
        if (sp.words && sp.words.length) return sp.words;
      } catch (e) { /* fall through */ }
    }
    var out = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var parts = c.textContent.split(/(\s+)/);
          var frag = doc.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(doc.createTextNode(p)); return; }
            var s = doc.createElement('span'); s.className = 'word'; s.textContent = p; frag.appendChild(s); out.push(s);
          });
          c.parentNode.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(el);
    return out;
  }

  /* =======================================================================
     04 #proof · bars drawn to scale
     ===================================================================== */
  var PROOF = {
    gen:   [['AI performance', 3.5], ['Graphics', 1.6]],
    m1:    [['AI performance', 6], ['GPU performance with ray tracing', 6.8], ['CPU performance', 2]],
    intel: [['AI performance', 86], ['GPU performance with ray tracing', 30], ['CPU performance', 5.5]]
  };
  function decimals(n) { var s = String(n), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  function setMax(name) { return Math.max.apply(null, PROOF[name].map(function (d) { return d[1]; })); }

  function initProof() {
    prep();
    var sec = $('#proof');
    if (!sec) return;
    var gsap = G();
    var head = $('.proof__head', sec);
    var title = $('.proof__title', sec);
    var list = $('[data-proof-rows]', sec);
    var seg = $('[data-proof-base]', sec);
    var cur = 'gen';

    reveal(title, { type: 'lines', mask: true, start: 'top 86%', stagger: 0.12, duration: 1.1, from: { yPercent: 105 } });
    var headBits = [$('.eyebrow', head), $('.proof__sub', sec), seg].filter(Boolean);
    if (!RM && headBits.length) {
      // opacity (not autoAlpha): the baseline control must stay in the Tab order before it has revealed
      gsap.from(headBits, { opacity: 0, y: 18, duration: 0.9, ease: 'expo.out', stagger: 0.07, delay: 0.12,
        scrollTrigger: { trigger: head, start: 'top 80%', toggleActions: 'play none none reverse' } });
    }

    var rows = $$('[data-proof-row]', list).map(function (el, i) {
      var r = {
        el: el, i: i,
        label: $('[data-proof-label]', el), value: $('.proof__value', el), num: $('[data-proof-num]', el),
        bar: $('[data-proof-bar]', el), base: $('.proof__base', el),
        fn: $('[data-proof-fn]', el), note: $('.proof__note', el),
        t: { v: 0, w: 0 }, dec: 1, shown: false, tl: null
      };
      r.setBar = r.bar ? gsap.quickSetter(r.bar, 'scaleX') : function () {};
      if (r.note) {
        r.note.id = r.note.id || 'proof-note-' + i;
        if (r.fn) r.fn.setAttribute('aria-controls', r.note.id);
      }
      return r;
    });
    if (!rows.length) return;
    if (list) list.setAttribute('aria-live', 'polite');

    function paint(r) {
      r.setBar(r.t.w);
      if (r.num) r.num.textContent = r.t.v.toFixed(r.dec);
    }
    function data(i) { return PROOF[cur][i]; }

    function applyFinal(r) {
      var d = data(r.i);
      if (!d) return;
      var m = setMax(cur);
      r.dec = decimals(d[1]);
      r.t.v = d[1]; r.t.w = d[1] / m;
      if (r.label) r.label.textContent = d[0];
      gsap.set(r.base, { scaleX: 1 / m });
      paint(r);
      r.shown = true;
    }

    // Baseline hairline draws (400ms), then the bar grows while its numeral counts: one tween.
    function play(r) {
      var d = data(r.i);
      if (!d || r.shown) return;
      var m = setMax(cur);
      r.shown = true;
      r.dec = decimals(d[1]);
      if (r.label) r.label.textContent = d[0];
      if (r.tl) r.tl.kill();
      r.t.v = 0; r.t.w = 0; paint(r);
      r.tl = gsap.timeline()
        .fromTo([r.label, r.value], { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.7, ease: 'expo.out', stagger: 0.06 }, 0)
        .fromTo(r.base, { scaleX: 0 }, { scaleX: 1 / m, duration: 0.4, ease: 'power2.inOut' }, 0.05)
        .to(r.t, { v: d[1], w: d[1] / m, duration: 0.9, ease: 'expo.out', onUpdate: function () { paint(r); } }, 0.4);
    }
    function reset(r) {
      if (!r.shown) return;
      if (r.tl) r.tl.kill();
      r.shown = false;
      r.t.v = 0; r.t.w = 0; paint(r);
      gsap.set(r.base, { scaleX: 0 });
      gsap.set([r.label, r.value], { autoAlpha: 0 });
    }

    if (RM) {
      rows.forEach(applyFinal);
    } else {
      rows.forEach(function (r) {
        gsap.set([r.label, r.value], { autoAlpha: 0 });
        if (r.num) r.num.textContent = '0';
        ST().create({ trigger: r.el, start: 'top 70%', onEnter: function () { play(r); } });
        // Quietly re-arm once the row is fully below the fold again.
        ST().create({ trigger: r.el, start: 'top bottom', onLeaveBack: function () { reset(r); } });
      });
    }

    function swapLabel(r, text) {
      if (!r.label || r.label.textContent === text) return;
      if (!r.shown) { r.label.textContent = text; return; }
      gsap.to(r.label, { autoAlpha: 0, y: -8, duration: 0.16, ease: 'power2.in', overwrite: true, onComplete: function () {
        r.label.textContent = text;
        gsap.fromTo(r.label, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.34, ease: 'expo.out' });
      } });
    }

    function setBase(name) {
      if (!PROOF[name] || name === cur) return;
      cur = name;
      var m = setMax(name);
      if (list) list.setAttribute('aria-busy', 'true');
      var listTop = list ? list.getBoundingClientRect().top : 0;
      rows.forEach(function (r) {
        var d = data(r.i);
        r.el.classList.toggle('is-hidden', !d);
        if (!d) return;
        swapLabel(r, d[0]);
        if (!r.shown) {
          // A row that just un-collapsed inside the viewport plays its own reveal.
          if (!RM && listTop < innerHeight * 0.7) gsap.delayedCall(0.18, function () { play(r); });
          else if (RM) applyFinal(r);
          return;
        }
        if (r.tl) r.tl.kill();
        var from = r.t.v;
        r.dec = Math.max(decimals(d[1]), decimals(from));
        r.tl = gsap.timeline({ onComplete: function () { r.dec = decimals(d[1]); paint(r); } })
          .to(r.base, { scaleX: 1 / m, duration: 0.9, ease: 'power3.inOut' }, 0)
          .to(r.t, { v: d[1], w: d[1] / m, duration: 0.9, ease: 'power3.inOut', onUpdate: function () { paint(r); } }, 0);
        if (RM) r.tl.progress(1);
      });
      gsap.delayedCall(0.95, function () { if (list) list.setAttribute('aria-busy', 'false'); });
      refreshSoon(560);
    }
    bindSeg(seg, setBase);

    // Footnote: height eases open over 280ms, aria-expanded mirrors it.
    rows.forEach(function (r) {
      if (!r.fn || !r.note) return;
      r.fn.addEventListener('click', function () {
        var open = r.fn.getAttribute('aria-expanded') !== 'true';
        r.fn.setAttribute('aria-expanded', String(open));
        gsap.killTweensOf(r.note);
        if (open) {
          r.note.hidden = false;
          gsap.fromTo(r.note, { height: 0, autoAlpha: 0, overflow: 'hidden' },
            { height: 'auto', autoAlpha: 1, duration: RM ? 0 : 0.28, ease: 'power3.out', clearProps: 'height,overflow' });
        } else {
          gsap.to(r.note, { height: 0, autoAlpha: 0, overflow: 'hidden', duration: RM ? 0 : 0.28, ease: 'power3.inOut',
            onComplete: function () { r.note.hidden = true; gsap.set(r.note, { clearProps: 'height,overflow,opacity,visibility' }); } });
        }
        refreshSoon(340);
      });
    });
  }

  /* =======================================================================
     05 #display · Liquid Retina XDR zones
     A 2D night scene with a movable filament, an illustrative 32x18 local-
     dimming grid, RGB subpixels at high zoom, and a glass reflection band.
     ===================================================================== */
  function initDisplay() {
    prep();
    var sec = $('#display');
    if (!sec) return;
    var gsap = G();
    var cvs = $('[data-display-canvas]', sec);
    var title = $('[data-display-title]', sec);
    var copy = $('.display__copy', sec);
    var copyBits = copy ? [$('.eyebrow', copy), $('p:not(.eyebrow)', copy)].filter(Boolean) : [];
    var controls = $('.display__controls', sec);
    var readout = $('[data-display-readout]', sec);
    var zonesBtn = $('[data-display-zones]', sec);
    var glassSeg = $('[data-display-glass]', sec);
    var counts = $$('[data-count]', sec).map(function (el) { return { el: el, n: +el.getAttribute('data-count') || 0 }; });
    if (!cvs || !cvs.getContext) return;

    var FW = MOBILE ? 0.92 : 0.72;
    var S = { z: 0, fw: 0, zones: 0, drift: 0, count: 0, zonesOn: 1, glass: 0, band: 0 };
    var LZ = { x: 0.63, y: 0.34 };                       // resting light = zoom focus
    var light = { x: LZ.x, y: LZ.y, tx: LZ.x, ty: LZ.y };
    var user = false, dragging = false;
    var band = { x: 0.9, tx: 0.9 };
    var visible = false, dirty = true, ctlOn = false;
    var ZX = 32, ZY = 18;
    var zv = new Float32Array(ZX * ZY), zStar = new Float32Array(ZX * ZY);

    var R0 = rng(5);
    var stars = [];
    for (var i = 0; i < 110; i++) {
      var sy = Math.pow(R0(), 1.35) * 0.66;
      stars.push({ x: R0(), y: sy, r: 0.45 + R0() * 0.9, a: 0.25 + R0() * 0.6 });
    }
    // 32x18 zones on a landscape frame; a portrait (phone) frame turns the grid 18x32.
    function setGrid(portrait) {
      var zx = portrait ? 18 : 32, zy = portrait ? 32 : 18;
      if (zx === ZX) return;
      ZX = zx; ZY = zy;
      zv.fill(0); zStar.fill(0);
      stars.forEach(function (s) {
        var zi = Math.min(ZX - 1, Math.floor(s.x * ZX)) + Math.min(ZY - 1, Math.floor(s.y * ZY)) * ZX;
        zStar[zi] = Math.max(zStar[zi], 0.04 + s.a * 0.08);
      });
    }
    ZX = 0; setGrid(false);
    function ridge(seed, base, amp) {
      var r = rng(seed), pts = [], n = 28;
      for (var k = 0; k <= n; k++) {
        var x = k / n;
        var y = base - amp * (0.55 * Math.sin(x * 5.1 + seed) + 0.3 * Math.sin(x * 11.3 + seed * 2) + 0.15 * (r() - 0.5));
        pts.push([x, y]);
      }
      return pts;
    }
    var FAR = ridge(3, 0.8, 0.045), NEAR = ridge(9, 0.9, 0.05);

    var surf = surface(cvs, function () { dirty = true; });
    var ctx = surf.ctx;
    var low = doc.createElement('canvas'), lctx = low.getContext('2d');
    var pix = null, pctx = null, pattern = null, TILE = 30;

    function makePattern(c) {
      var t = doc.createElement('canvas');
      t.width = t.height = TILE;
      var k = t.getContext('2d');
      k.fillStyle = '#000'; k.fillRect(0, 0, TILE, TILE);
      var cols = ['#ff0000', '#00ff00', '#0000ff'];
      for (var j = 0; j < 3; j++) {
        k.fillStyle = cols[j];
        var x = 1.5 + j * 9.4, w = 7.6, y = 2, h = 26, rr = 2.2;
        k.beginPath();
        k.moveTo(x + rr, y); k.lineTo(x + w - rr, y); k.quadraticCurveTo(x + w, y, x + w, y + rr);
        k.lineTo(x + w, y + h - rr); k.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        k.lineTo(x + rr, y + h); k.quadraticCurveTo(x, y + h, x, y + h - rr);
        k.lineTo(x, y + rr); k.quadraticCurveTo(x, y, x + rr, y); k.fill();
      }
      return c.createPattern(t, 'repeat');
    }

    // Frame window (mirrors the CSS clip in sections.css) in canvas CSS px.
    function frameRect() {
      var W = surf.w, H = surf.h;
      var fw = W * lerp(1, FW, S.fw);
      var fd = W - fw;
      var fh = Math.max(fw * 0.6495, H - fd * 3);
      var fy = Math.max(0, (H - fh) * 0.5);
      return { x: fd / 2, y: fy, w: fw, h: Math.min(fh, H - fy * 2) };
    }
    function scale() { return Math.exp(Math.log(8) * (1 - S.z)); }
    // Screen position of the zoom focus drifts from centre to its resting spot.
    function focusScreen() { return { x: lerp(0.5, LZ.x, S.z), y: lerp(0.5, LZ.y, S.z) }; }
    function applyView(c, R, s) {
      var f = focusScreen();
      c.translate(R.x + f.x * R.w, R.y + f.y * R.h);
      c.scale(s, s);
      c.translate(-LZ.x * R.w, -LZ.y * R.h);
    }

    function ridgePath(c, pts, w, h) {
      c.beginPath();
      c.moveTo(0, h);
      for (var k = 0; k < pts.length; k++) c.lineTo(pts[k][0] * w, pts[k][1] * h);
      c.lineTo(w, h);
      c.closePath();
    }
    function ridgeLine(c, pts, w, h) {
      c.beginPath();
      for (var k = 0; k < pts.length; k++) { var x = pts[k][0] * w, y = pts[k][1] * h; if (k) c.lineTo(x, y); else c.moveTo(x, y); }
    }

    // The scene, in frame-local CSS px (0..w, 0..h). Shared by the smooth
    // render and the low-res "panel pixel" buffer.
    function drawScene(c, w, h) {
      var m = Math.min(w, h);
      var lx = light.x * w, ly = light.y * h;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      var sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#000000'); sky.addColorStop(0.62, '#040405'); sky.addColorStop(1, '#0B0C0E');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);

      c.fillStyle = '#fff';
      for (var k = 0; k < stars.length; k++) {
        var s = stars[k];
        c.globalAlpha = s.a;
        c.beginPath(); c.arc(s.x * w, s.y * h, s.r, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;

      ridgePath(c, FAR, w, h); c.fillStyle = '#060708'; c.fill();
      ridgePath(c, NEAR, w, h); c.fillStyle = '#010102'; c.fill();

      // Rim light where the filament grazes the near ridge.
      var rim = c.createRadialGradient(lx, ly, 0, lx, ly, m * 0.55);
      rim.addColorStop(0, 'rgba(255,236,214,.55)'); rim.addColorStop(1, 'rgba(255,236,214,0)');
      ridgeLine(c, NEAR, w, h); c.strokeStyle = rim; c.lineWidth = Math.max(0.8, m * 0.0014); c.stroke();

      c.globalCompositeOperation = 'lighter';
      var R1 = m * 0.62;
      var g1 = c.createRadialGradient(lx, ly, 0, lx, ly, R1);
      g1.addColorStop(0, 'rgba(255,226,196,.22)'); g1.addColorStop(0.22, 'rgba(255,214,176,.07)'); g1.addColorStop(1, 'rgba(255,214,176,0)');
      c.fillStyle = g1; c.fillRect(lx - R1, ly - R1, R1 * 2, R1 * 2);
      var R2 = m * 0.075;
      var g2 = c.createRadialGradient(lx, ly, 0, lx, ly, R2);
      g2.addColorStop(0, 'rgba(255,250,244,.95)'); g2.addColorStop(0.3, 'rgba(255,236,214,.35)'); g2.addColorStop(1, 'rgba(255,230,205,0)');
      c.fillStyle = g2; c.fillRect(lx - R2, ly - R2, R2 * 2, R2 * 2);

      // Lead wires, then the coiled filament.
      var len = m * 0.052, amp = m * 0.0068, turns = 7;
      var wires = c.createLinearGradient(0, ly, 0, ly + m * 0.1);
      wires.addColorStop(0, 'rgba(255,232,210,.3)'); wires.addColorStop(1, 'rgba(255,232,210,0)');
      c.strokeStyle = wires;
      c.lineWidth = Math.max(0.6, m * 0.0009);
      c.beginPath();
      c.moveTo(lx - len / 2, ly); c.lineTo(lx - len * 0.7, ly + m * 0.1);
      c.moveTo(lx + len / 2, ly); c.lineTo(lx + len * 0.7, ly + m * 0.1);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(0.9, m * 0.0021);
      c.beginPath();
      var steps = turns * 14;
      for (var q = 0; q <= steps; q++) {
        var t = q / steps, a = t * turns * TAU;
        var x = lx - len / 2 + len * t + amp * 0.7 * Math.cos(a), y = ly + amp * Math.sin(a);
        if (q) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
    }

    function updateZones(dt) {
      var k = 0.42, settling = false;
      var decay = Math.exp(-dt / 0.09);
      for (var j = 0; j < ZY; j++) {
        for (var i = 0; i < ZX; i++) {
          var idx = i + j * ZX;
          var dx = ((i + 0.5) / ZX - light.x) * ZX, dy = ((j + 0.5) / ZY - light.y) * ZY;
          var t = 1 / (1 + k * (dx * dx + dy * dy));
          t = t < 0.035 ? 0 : (t - 0.035) / 0.965;
          if (zStar[idx] > t) t = zStar[idx];
          var v = zv[idx] * decay;
          if (t > v) v = t;
          if (v < 0.002) v = 0;
          if (Math.abs(v - t) > 0.004) settling = true;
          zv[idx] = v;
        }
      }
      return settling;
    }

    function drawZones(R) {
      var A = S.zones * S.zonesOn;
      if (A < 0.004) return;
      var cw = R.w / ZX, ch = R.h / ZY, gap = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,' + (0.022 * A).toFixed(4) + ')';
      ctx.beginPath();
      for (var j = 0; j < ZY; j++) for (var i = 0; i < ZX; i++) ctx.rect(R.x + i * cw + gap, R.y + j * ch + gap, cw - gap * 2, ch - gap * 2);
      ctx.fill();
      for (var jj = 0; jj < ZY; jj++) {
        for (var ii = 0; ii < ZX; ii++) {
          var v = zv[ii + jj * ZX];
          if (v < 0.004) continue;
          ctx.fillStyle = 'rgba(255,238,220,' + (Math.min(1, v * 1.15) * 0.62 * A).toFixed(4) + ')';
          ctx.fillRect(R.x + ii * cw + gap, R.y + jj * ch + gap, cw - gap * 2, ch - gap * 2);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    var bandC = null;
    function bandSprite() {
      if (bandC) return bandC;
      bandC = doc.createElement('canvas'); bandC.width = 160; bandC.height = 640;
      var x = bandC.getContext('2d');
      var gg = x.createLinearGradient(0, 0, 160, 0);
      // across (pane widths from the old hard bands, x1.3 for the shoulders): pane A, mullion, pane B
      [[0, 0], [0.05, 0.08], [0.1, 0.42], [0.16, 0.86], [0.24, 1], [0.44, 0.97], [0.52, 0.78], [0.58, 0.3], [0.62, 0.07],
       [0.66, 0.05], [0.7, 0.28], [0.75, 0.72], [0.82, 0.8], [0.88, 0.5], [0.94, 0.12], [1, 0]].forEach(function (p) {
        gg.addColorStop(p[0], 'rgba(255,255,255,' + p[1] + ')');
      });
      x.fillStyle = gg; x.fillRect(0, 0, 160, 640);
      x.globalCompositeOperation = 'destination-in';
      var gv = x.createLinearGradient(0, 0, 0, 640);
      [[0, 0], [0.12, 0.12], [0.3, 0.7], [0.44, 1], [0.58, 0.92], [0.76, 0.42], [0.9, 0.1], [1, 0]].forEach(function (p) {
        gv.addColorStop(p[0], 'rgba(0,0,0,' + p[1] + ')');
      });
      x.fillStyle = gv; x.fillRect(0, 0, 160, 640);
      return bandC;
    }

    function drawBand(R) {
      if (S.band < 0.004) return;
      var bx = R.x + band.x * R.w, cy = R.y + R.h / 2;
      var L = Math.hypot(R.w, R.h);
      var bw = R.w * 0.042;
      ctx.save();
      ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
      ctx.translate(bx, cy);
      ctx.rotate(-0.36);
      var gA = 0.3 * S.band * (1 - S.glass);
      if (gA > 0.003) {
        // a softbox window mirrored in glossy glass: two panes with soft (gaussian) shoulders and a mullion,
        // brightest a little above the middle and fading out along its length, added with 'lighter' so it
        // brightens the zones it crosses instead of laying a flat grey film over them
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, gA);
        ctx.drawImage(bandSprite(), -bw * 0.65, -L * 0.62, bw * 1.3, L * 1.24);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // Nano-texture: the same band diffused (a gaussian-profile gradient ~ blur(24px)) at 12%.
      var nA = 0.12 * S.band * S.glass;
      if (nA > 0.003) {
        var spread = bw + 96;
        var ng = ctx.createLinearGradient(-spread / 2, 0, spread / 2, 0);
        var prof = [[0, 0], [0.12, 0.08], [0.25, 0.4], [0.38, 0.86], [0.5, 1], [0.62, 0.86], [0.75, 0.4], [0.88, 0.08], [1, 0]];
        prof.forEach(function (p) { ng.addColorStop(p[0], 'rgba(255,255,255,' + (nA * p[1]).toFixed(4) + ')'); });
        ctx.fillStyle = ng;
        ctx.fillRect(-spread / 2, -L, spread, L * 2);
      }
      ctx.restore();
    }

    function render() {
      var W = surf.w, H = surf.h, d = surf.dpr;
      var R = frameRect();
      setGrid(R.h > R.w * 1.1);
      var s = scale();
      var mix = sstep(3, 5, s);                         // subpixel layer weight
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
      if (mix < 1) {
        ctx.save(); applyView(ctx, R, s); drawScene(ctx, R.w, R.h); ctx.restore();
      }
      if (mix > 0) {
        // Panel pixels: the scene at 1/3 resolution, magnified without smoothing,
        // multiplied by an R/G/B stripe mask aligned to each cell.
        var bw = Math.max(8, Math.round(R.w / 3)), bh = Math.max(8, Math.round(R.h / 3));
        if (low.width !== bw || low.height !== bh) { low.width = bw; low.height = bh; }
        lctx.setTransform(bw / R.w, 0, 0, bh / R.h, 0, 0);
        drawScene(lctx, R.w, R.h);
        if (!pix) { pix = doc.createElement('canvas'); pctx = pix.getContext('2d'); pattern = makePattern(pctx); }
        if (pix.width !== cvs.width || pix.height !== cvs.height) { pix.width = cvs.width; pix.height = cvs.height; }
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.globalCompositeOperation = 'source-over';
        pctx.clearRect(0, 0, pix.width, pix.height);
        pctx.setTransform(d, 0, 0, d, 0, 0);
        pctx.save();
        pctx.beginPath(); pctx.rect(R.x, R.y, R.w, R.h); pctx.clip();
        applyView(pctx, R, s);
        pctx.imageSmoothingEnabled = false;
        pctx.drawImage(low, 0, 0, R.w, R.h);
        pctx.globalCompositeOperation = 'multiply';
        if (pattern.setTransform && window.DOMMatrix) pattern.setTransform(new DOMMatrix([(R.w / bw) / TILE, 0, 0, (R.h / bh) / TILE, 0, 0]));
        pctx.fillStyle = pattern;
        pctx.fillRect(0, 0, R.w, R.h);
        pctx.restore();
        pctx.globalCompositeOperation = 'source-over';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = mix;
        ctx.drawImage(pix, 0, 0);
        ctx.globalAlpha = 1;
        ctx.setTransform(d, 0, 0, d, 0, 0);
      }
      ctx.restore();

      drawZones(R);
      drawBand(R);
    }

    function arc(t) {
      var p0 = LZ, p1 = { x: 0.96, y: 0.16 }, p2 = { x: 0.8, y: 0.56 }, u = 1 - t;
      return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
    }
    function writeCounts() {
      for (var k = 0; k < counts.length; k++) counts[k].el.textContent = String(Math.round(counts[k].n * S.count));
    }
    function setControls(on) {
      if (on === ctlOn) return;
      ctlOn = on;
      if (controls) controls.classList.toggle('is-visible', on);
      gsap.to(S, { band: on ? 1 : 0, duration: 0.48, ease: 'power3.inOut', overwrite: 'auto', onUpdate: function () { dirty = true; } });
    }

    if (RM) {
      S.z = 1; S.fw = 1; S.zones = 1; S.count = 1; S.band = 1; ctlOn = true;
      sec.style.setProperty('--frame-w', (FW * 100) + 'vw');
      sec.style.setProperty('--frame-r', '12px');
      if (controls) controls.classList.add('is-visible');
      writeCounts();
    } else {
      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: sec, pin: true, start: 'top top', end: pinEnd(2), scrub: 0.8, invalidateOnRefresh: true,
          onLeaveBack: function () { user = false; }
        },
        onUpdate: function () { dirty = true; setControls(tl.progress() >= 0.6); }
      });
      tl.to(S, { z: 1, duration: 0.3, ease: 'power2.inOut' }, 0)
        .fromTo(title, { clipPath: 'inset(-10% 100% -10% 0%)' }, { clipPath: 'inset(-10% 0% -10% 0%)', duration: 0.26, ease: 'power2.out' }, 0.04)
        .fromTo(copyBits, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.14, stagger: 0.05, ease: 'power2.out' }, 0.14)
        .fromTo(sec, { '--frame-w': '100vw', '--frame-r': '0px' }, { '--frame-w': (FW * 100) + 'vw', '--frame-r': '12px', duration: 0.3, ease: 'power2.inOut' }, 0.3)
        .to(S, { fw: 1, duration: 0.3, ease: 'power2.inOut' }, 0.3)
        .to(S, { zones: 1, duration: 0.24, ease: 'power1.inOut' }, 0.34)
        .fromTo(readout, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.05, ease: 'power2.out' }, 0.28)
        .to(S, { count: 1, duration: 0.3, ease: 'power2.out', onUpdate: writeCounts }, 0.3)
        .to(S, { drift: 1, duration: 0.4, ease: 'sine.inOut' }, 0.6);
      writeCounts();
    }

    // Pointer: drag the light; the reflection band follows the pointer's x.
    function toScene(e) {
      var r = cvs.getBoundingClientRect(), R = frameRect(), s = scale(), f = focusScreen();
      var sx = (e.clientX - r.left - R.x) / R.w, sy = (e.clientY - r.top - R.y) / R.h;
      return { x: LZ.x + (sx - f.x) / s, y: LZ.y + (sy - f.y) / s, bx: sx };
    }
    function moveLight(p) {
      user = true;
      light.tx = clamp(p.x, 0.03, 0.97);
      light.ty = clamp(p.y, 0.05, 0.95);
      dirty = true;
    }
    cvs.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true;
      try { cvs.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      moveLight(toScene(e));
    });
    cvs.addEventListener('pointermove', function (e) {
      var p = toScene(e);
      band.tx = clamp(p.bx, -0.1, 1.1);
      if (dragging) moveLight(p);
      dirty = true;
    });
    function endDrag(e) { dragging = false; try { cvs.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ } }
    cvs.addEventListener('pointerup', endDrag);
    cvs.addEventListener('pointercancel', endDrag);
    cvs.addEventListener('keydown', function (e) {
      var k = e.key, dx = 0, dy = 0;
      if (k === 'ArrowLeft') dx = -0.04; else if (k === 'ArrowRight') dx = 0.04;
      else if (k === 'ArrowUp') dy = -0.04; else if (k === 'ArrowDown') dy = 0.04;
      else return;
      e.preventDefault();
      moveLight({ x: light.tx + dx, y: light.ty + dy });
      band.tx = clamp(light.tx, 0, 1);
    });

    if (zonesBtn) {
      zonesBtn.addEventListener('click', function () {
        var on = zonesBtn.getAttribute('aria-pressed') !== 'true';
        zonesBtn.setAttribute('aria-pressed', String(on));
        gsap.to(S, { zonesOn: on ? 1 : 0, duration: RM ? 0.2 : 0.28, ease: 'power3.out', overwrite: 'auto', onUpdate: function () { dirty = true; } });
      });
    }
    bindSeg(glassSeg, function (v) {
      gsap.to(S, { glass: v === 'nano' ? 1 : 0, duration: RM ? 0.2 : 0.48, ease: 'power3.inOut', overwrite: 'auto', onUpdate: function () { dirty = true; } });
    });

    watch(sec, function (v) { visible = v; dirty = true; });
    addLoop(function (dt) {
      if (!visible) return;
      if (!user) { var a = arc(S.drift); light.tx = a.x; light.ty = a.y; }
      var moving = false;
      if (Math.abs(light.x - light.tx) + Math.abs(light.y - light.ty) > 1e-4) {
        light.x = damp(light.x, light.tx, user ? 16 : 30, dt);
        light.y = damp(light.y, light.ty, user ? 16 : 30, dt);
        moving = true;
      } else { light.x = light.tx; light.y = light.ty; }
      if (Math.abs(band.x - band.tx) > 1e-4) { band.x = damp(band.x, band.tx, 7, dt); moving = S.band > 0.004 || moving; }
      var settling = updateZones(dt) && S.zones * S.zonesOn > 0.004;
      if (dirty || moving || settling) { dirty = false; render(); }
    });
  }

  /* =======================================================================
     06 #rail · kinetic numerals, horizontal pin
     ===================================================================== */
  function initRail() {
    prep();
    var sec = $('#rail');
    if (!sec) return;
    var gsap = G();
    var vp = $('[data-rail-viewport]', sec);
    var track = $('[data-rail-track]', sec);
    var panels = track ? $$('.rail__panel', track) : [];
    var head = $('.rail__head', sec);

    var stacked = RM || MOBILE || !vp || !track;
    function dist() { return Math.max(0, track.scrollWidth - innerWidth); }
    // The pin is created first so it is this section's primary trigger.
    var tween = null, railST = null;
    if (!stacked) {
      tween = gsap.to(track, {
        x: function () { return -dist(); }, ease: 'none',
        scrollTrigger: {
          trigger: sec, pin: true, start: 'top top', end: function () { return '+=' + dist(); },
          scrub: 0.6, invalidateOnRefresh: true
        }
      });
      railST = tween.scrollTrigger;
    }

    reveal($('h2', head), { type: 'lines', mask: true, start: 'top 82%', stagger: 0.1, duration: 1.2, from: { yPercent: 100, rotate: 2.5, transformOrigin: '0% 100%' } });
    var headBits = [$('.eyebrow', head), $('p:not(.eyebrow)', head)].filter(Boolean);
    if (!RM && headBits.length) {
      gsap.from(headBits, { autoAlpha: 0, x: -16, duration: 0.8, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { trigger: sec, start: 'top 75%', toggleActions: 'play none none reverse' } });
    }

    // Odometers: each panel rolls from the previous panel's value.
    var odos = panels.map(function (p, i) {
      var el = $('[data-odo]', p);
      if (!el) return null;
      var prevEl = i > 0 ? $('[data-odo]', panels[i - 1]) : null;
      var prev = prevEl ? prevEl.getAttribute('data-odo') : '0';
      return buildOdo(el, el.getAttribute('data-odo'), prev);
    });
    function roll(i, toTarget, instant) {
      var o = odos[i];
      if (!o) return;
      var idx = toTarget ? o.to : o.from;
      // until a panel rolls, its digits still read the previous panel's value: keep them ghosted
      if (panels[i]) panels[i].classList.toggle('is-rolled', !!toTarget);
      o.strips.forEach(function (s, c) {
        gsap.to(s, { yPercent: -idx[c] * (100 / 11), duration: instant ? 0 : 0.9, ease: 'expo.out', delay: instant ? 0 : (o.strips.length - 1 - c) * 0.03, overwrite: true });
      });
    }

    if (stacked) {
      panels.forEach(function (p, i) {
        if (RM) { roll(i, true, true); return; }
        ST().create({ trigger: p, start: 'top 92%', onEnter: function () { roll(i, true); }, onLeaveBack: function () { roll(i, false); } });
        var bits = [$('.rail__label', p), $('.rail__cap', p)].filter(Boolean);
        gsap.from(bits, { autoAlpha: 0, y: 16, duration: 0.8, ease: 'expo.out', stagger: 0.06,
          scrollTrigger: { trigger: p, start: 'top 78%', toggleActions: 'play none none reverse' } });
      });
      bindRailKeys(null);
      return;
    }

    panels.forEach(function (p, i) {
      var ghost = $('.rail__ghost', p), cap = $('.rail__cap', p), label = $('.rail__label', p);
      // Ghost word ~0.5x, caption ~1.15x. The first panel is on screen when the
      // pin starts, so it begins at rest and only parallaxes on its way out.
      var first = i === 0;
      var range = { trigger: p, containerAnimation: tween, start: first ? 'left left' : 'left right', end: 'right left', scrub: true, invalidateOnRefresh: true };
      if (ghost) {
        gsap.fromTo(ghost, { xPercent: first ? 0 : 30 }, { xPercent: -30, ease: 'none', scrollTrigger: Object.assign({}, range) });
      }
      if (cap) {
        gsap.fromTo(cap, { x: function () { return first ? 0 : innerWidth * 0.08; } }, { x: function () { return -innerWidth * 0.08; }, ease: 'none',
          scrollTrigger: Object.assign({}, range) });
      }
      if (label) {
        gsap.fromTo(label, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
          scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left 85%', end: 'left 45%', scrub: true } });
      }
      if (i === 0) {
        // The first panel is already left of centre when the pin starts: roll it as the rail arrives.
        ST().create({ trigger: sec, start: 'top 45%', onEnter: function () { roll(0, true); }, onLeaveBack: function () { roll(0, false); } });
      } else {
        // Rolls as the panel slides in, so an unrolled (previous) value is never read as a claim.
        ST().create({ trigger: p, containerAnimation: tween, start: 'left 78%',
          onEnter: function () { roll(i, true); }, onLeaveBack: function () { roll(i, false); } });
      }
    });

    // Drag the rail: pointer x maps 1:1 onto the pin's scroll distance.
    var drag = null;
    vp.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.button !== 0 || !APP.lenis) return;
      if (!railST.isActive) return;
      drag = { last: e.clientX, t: performance.now(), v: 0 };
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      e.preventDefault();
    });
    vp.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.last, now = performance.now(), dtm = Math.max(1, now - drag.t);
      drag.last = e.clientX; drag.t = now;
      drag.v = lerp(drag.v, dx / dtm, 0.35);
      APP.scrollTo(clamp(currentScroll() - dx, railST.start, railST.end), { immediate: true });
    });
    function release(e) {
      if (!drag) return;
      var v = drag.v;
      drag = null;
      try { vp.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (Math.abs(v) > 0.05) APP.scrollTo(clamp(currentScroll() - v * 320, railST.start, railST.end), { duration: 0.9 });
    }
    vp.addEventListener('pointerup', release);
    vp.addEventListener('pointercancel', release);
    vp.addEventListener('dragstart', function (e) { e.preventDefault(); });
    bindRailKeys(railST);

    function bindRailKeys(st) {
      if (!vp) return;
      vp.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var dir = e.key === 'ArrowRight' ? 1 : -1;
        var mid = innerWidth / 2, best = 0, bestD = Infinity;
        panels.forEach(function (p, i) {
          var r = p.getBoundingClientRect();
          var d = st ? Math.abs(r.left + r.width / 2 - mid) : Math.abs(r.top + r.height / 2 - innerHeight / 2);
          if (d < bestD) { bestD = d; best = i; }
        });
        var next = clamp(best + dir, 0, panels.length - 1);
        if (!st) { APP.scrollTo(panels[next], { duration: 0.9, offset: -innerHeight * 0.15 }); return; }
        var rr = panels[next].getBoundingClientRect();
        var x0 = rr.left - (gsap.getProperty(track, 'x') || 0);        // untransformed left
        var target = clamp(x0 + rr.width / 2 - mid, 0, dist());
        APP.scrollTo(st.start + target, { duration: 0.9 });
      });
    }
  }

  // Digit columns (blank + 0..9) plus a static "." span. Returns strip nodes
  // and the strip indices for the previous and the target value.
  function buildOdo(el, value, prev) {
    var target = String(value);
    var tParts = target.split('.'), tInt = tParts[0], tDec = tParts[1] || '';
    var pParts = String(prev == null ? '0' : prev).split('.'), pInt = pParts[0], pDec = pParts[1] || '';
    while (pInt.length < tInt.length) pInt = ' ' + pInt;
    if (pInt.length > tInt.length) pInt = pInt.slice(-tInt.length);
    while (pDec.length < tDec.length) pDec += '0';
    pDec = pDec.slice(0, tDec.length);

    el.textContent = '';
    var wrap = doc.createDocumentFragment();
    var strips = [], from = [], to = [];
    function col(tc, pc) {
      var c = doc.createElement('span'); c.className = 'odo__col';
      var s = doc.createElement('span'); s.className = 'odo__strip';
      var items = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      items.forEach(function (d) { var it = doc.createElement('span'); it.textContent = d; s.appendChild(it); });
      c.appendChild(s);
      wrap.appendChild(c);
      strips.push(s);
      to.push(tc === ' ' ? 0 : +tc + 1);
      from.push(pc === ' ' ? 0 : +pc + 1);
    }
    for (var i = 0; i < tInt.length; i++) col(tInt[i], pInt[i]);
    if (tDec) {
      var dot = doc.createElement('span'); dot.className = 'odo__dot'; dot.textContent = '.';
      wrap.appendChild(dot);
      for (var j = 0; j < tDec.length; j++) col(tDec[j], pDec[j]);
    }
    el.appendChild(wrap);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', target);
    strips.forEach(function (s, k) { G().set(s, { yPercent: -from[k] * (100 / 11) }); });
    return { strips: strips, from: from, to: to };
  }

  /* =======================================================================
     07 #battery · one charge, 06:00 → 06:00
     ===================================================================== */
  var SKY = [
    [6, '#F2F1EE', '#E9B98A'],
    [12, '#F2F1EE', '#DCDDDF'],
    [18, '#E9B98A', '#48474B'],
    [24, '#161517', '#060607'],
    [30, '#F2F1EE', '#E9B98A']
  ].map(function (k) { return [k[0], hex(k[1]), hex(k[2])]; });

  function initBattery() {
    prep();
    var sec = $('#battery');
    if (!sec) return;
    var gsap = G();
    var sky = $('[data-battery-sky]', sec);
    var svg = $('[data-battery-numeral]', sec);
    var digits = $('[data-battery-digits]', sec);
    var outline = $('[data-battery-outline]', sec);
    var level = $('[data-battery-level]', sec);
    var wave = $('[data-battery-wave]', sec);
    var hours = $('[data-battery-hours]', sec);
    var clock = $('[data-battery-clock]', sec);
    var seg = $('[data-battery-mode]', sec);
    var copy = $('.battery__copy', sec);
    var B = { p: RM ? 0.25 : 0, web: 0, fill: RM ? 1 : 0, slosh: 0, phase: 0, emptyAt: 24 };
    var mode = 'video', visible = false, skyDirty = true, st = null;
    var lastHour = -1, lastLow = null, lastNight = null;

    // Pin first, so it is this section's primary trigger.
    if (!RM) {
      var tw = gsap.fromTo(B, { p: 0 }, {
        p: 1, ease: 'none', onUpdate: function () { skyDirty = true; },
        scrollTrigger: { trigger: sec, pin: true, start: 'top top', end: pinEnd(1.5), scrub: 0.8, invalidateOnRefresh: true }
      });
      st = tw.scrollTrigger;
    }

    // Headline reveals scrubbed to the approach, finishing before the pin.
    reveal($('h2', copy), { type: 'lines', mask: true, scrub: true, start: 'top 92%', end: 'top 30%', from: { yPercent: 110 }, trigger: sec });
    var softBits = [$('.eyebrow', copy), $('p:not(.eyebrow)', copy), clock, seg].filter(Boolean);
    if (!RM && softBits.length) {
      gsap.from(softBits, { opacity: 0, y: 14, ease: 'none', stagger: 0.1,
        scrollTrigger: { trigger: sec, start: 'top 70%', end: 'top 20%', scrub: 0.6 } });
    }

    // Hour ruler: ticks at i/24 (the last child has no width), labels every 3h (6h majors).
    var ticks = [], emptyMark = null, emptyInner = null;
    if (hours) {
      hours.textContent = '';
      var step = MOBILE ? 3 : 1;
      for (var h = 0; h <= 24; h += step) {
        var t = doc.createElement('span');
        var hh = (6 + h) % 24;
        t.setAttribute('data-h', String(h));
        if (h % 6 === 0) t.className = 'is-major';
        if (h % 3 === 0) t.textContent = (hh < 10 ? '0' : '') + hh;
        if (h === 24) t.style.flex = '0 0 0px';
        hours.appendChild(t);
        ticks.push(t);
      }
      emptyMark = doc.createElement('span');
      emptyMark.setAttribute('data-empty', '');
      emptyMark.className = 'is-major';
      emptyMark.style.position = 'absolute';
      emptyMark.style.top = '0';
      emptyMark.style.width = '0';
      emptyMark.style.flex = 'none';
      emptyInner = doc.createElement('b');
      emptyInner.textContent = 'Empty';
      emptyInner.style.display = 'inline-block';
      emptyInner.style.fontWeight = '600';
      emptyInner.style.transform = 'translate(-50%, -44px)';
      emptyMark.appendChild(emptyInner);
      hours.appendChild(emptyMark);
    }
    function placeEmpty() {
      if (!emptyMark) return;
      var f = B.emptyAt / 24;
      emptyMark.style.left = (f * 100).toFixed(3) + '%';
      emptyInner.style.transform = 'translate(' + (f > 0.97 ? -100 : -50) + '%, -44px)';
    }
    placeEmpty();

    // Level geometry (SVG user units).
    var BASE = 520, FS = 640, TOP = BASE - FS * 0.72;
    function measureDigits() {
      var fs = parseFloat(outline && (outline.getAttribute('font-size') || getComputedStyle(outline).fontSize));
      if (fs > 0) FS = fs;
      var y = parseFloat(outline && outline.getAttribute('y'));
      if (y > 0) BASE = y;
      TOP = BASE - FS * 0.725;
    }
    measureDigits();

    // Charge left by the clock (drives .is-low); the drawn level also carries the entrance charge-up.
    function chargeNow() {
      var video = 1 - B.p, web = Math.max(0, 1 - B.p * 24 / 16);
      return clamp(lerp(video, web, B.web), 0, 1);
    }
    function levelNow() { return chargeNow() * B.fill; }
    function setLow(low) {
      if (low === lastLow) return;
      lastLow = low;
      level.classList.toggle('is-low', low);
      wave.classList.toggle('is-low', low);
    }
    function drawLevel() {
      if (!level || !wave) return;
      var L = levelNow();
      setLow(chargeNow() < 0.1);
      if (L < 0.002) {
        // Empty: park everything below the glyphs' overshoot so no sliver remains.
        level.setAttribute('y', '600'); level.setAttribute('height', '0'); wave.setAttribute('d', '');
        return;
      }
      var bottom = BASE + FS * 0.02;
      var y = bottom - L * (bottom - TOP);
      var amp = (7 + B.slosh) * sstep(0, 0.05, L) * (1 - sstep(0.985, 1, L));
      level.setAttribute('y', (y + Math.abs(amp) + 1).toFixed(2));
      level.setAttribute('height', Math.max(0, 600 - y - Math.abs(amp) - 1).toFixed(2));
      var d = 'M0,' + (y + Math.abs(amp) + 2).toFixed(1);
      for (var k = 0; k <= 40; k++) {
        var x = k * 25;
        var yy = y + amp * Math.sin(x / 1000 * TAU * 2.4 + B.phase) + amp * 0.35 * Math.sin(x / 1000 * TAU * 5.3 - B.phase * 1.7);
        d += ' L' + x + ',' + yy.toFixed(2);
      }
      d += ' L1000,' + (y + Math.abs(amp) + 2).toFixed(1) + ' Z';
      wave.setAttribute('d', d);
    }

    function hourNow() { return 6 + 24 * B.p; }
    function updateDom() {
      var h = hourNow();
      var h24 = ((h % 24) + 24) % 24;
      var hh = Math.floor(h24), mm = Math.floor((h24 - hh) * 60 + 1e-6);
      var txt = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
      if (clock && clock.textContent !== txt) clock.textContent = txt;
      // Light text whenever the sky behind the copy is dark (lands at ~19:00 to ~05:00).
      var night = skyColors(clamp(h, 6, 30))[2] < 0.45;
      if (night !== lastNight) { lastNight = night; sec.classList.toggle('is-night', night); }
      var tick = Math.round((h - 6) / (MOBILE ? 3 : 1));
      if (tick !== lastHour) {
        lastHour = tick;
        ticks.forEach(function (t, i) { t.classList.toggle('is-now', i === tick); });
      }
    }

    // Sky canvas: interpolated gradient keys, the sun on its arc, stars at night.
    var skyS = sky ? surface(sky, function () { skyDirty = true; measureHorizon(); }) : null;
    // Ruler geometry is cached here (resize / visibility), never read per frame.
    var horizon = 0.8, rulerL = -1, rulerW = -1;
    function measureHorizon() {
      if (!hours || !sky) return;
      var sr = sky.getBoundingClientRect(), hr = hours.getBoundingClientRect();
      if (sr.height > 0) horizon = clamp((hr.top - sr.top) / sr.height, 0.5, 0.95);
      rulerL = hr.left - sr.left; rulerW = hr.width;
      skyDirty = true;
    }
    var starR = rng(11), skyStars = [];
    for (var sI = 0; sI < 70; sI++) skyStars.push({ x: starR(), y: starR() * 0.62, r: 0.4 + starR() * 0.8, a: 0.3 + starR() * 0.6 });
    function skyColors(h) {
      for (var k = 0; k < SKY.length - 1; k++) {
        var a = SKY[k], b = SKY[k + 1];
        if (h >= a[0] && h <= b[0]) {
          var u = (h - a[0]) / (b[0] - a[0]);
          // Dusk falls fast after 18:00 and dawn arrives late, so the night reads as night.
          var t = a[0] === 18 ? 1 - Math.pow(1 - u, 5) : a[0] === 24 ? Math.pow(u, 5) : sstep(0, 1, u);
          var top = [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t)];
          // The horizon darkens late in the afternoon so the ruler stays legible longer.
          var tb = a[0] === 12 ? Math.pow(t, 1.8) : t;
          return [mixRGB(a[1], b[1], t), mixRGB(a[2], b[2], tb), lum(top)];
        }
      }
      return [mixRGB(SKY[0][1], SKY[0][1], 0), mixRGB(SKY[0][2], SKY[0][2], 0), 0.9];
    }
    function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
    function drawSky() {
      if (!skyS) return;
      var c = skyS.ctx, W = skyS.w, H = skyS.h, d = skyS.dpr;
      var h = clamp(hourNow(), 6, 30);
      var cols = skyColors(h);
      var hy = H * horizon;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.globalCompositeOperation = 'source-over';
      var g = c.createLinearGradient(0, 0, 0, hy);
      g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, hy + 1);
      c.fillStyle = cols[1]; c.fillRect(0, hy, W, H - hy);

      var night = clamp((0.42 - cols[2]) / 0.3, 0, 1);
      if (night > 0.01) {
        c.fillStyle = '#fff';
        skyStars.forEach(function (s) { c.globalAlpha = s.a * night; c.beginPath(); c.arc(s.x * W, s.y * hy, s.r, 0, TAU); c.fill(); });
        c.globalAlpha = 1;
      }

      // Sun path: x follows the hour ruler, elevation is a half-sine from 06:00 to 18:00.
      var padL = rulerW > 0 ? rulerL : W * 0.05;
      var rW = rulerW > 0 ? rulerW : W * 0.9;
      var arcH = Math.min(hy * 0.62, W * 0.34);
      var ink = night > 0.5 ? '236,238,242' : '29,29,31';
      c.save();
      c.setLineDash([1.5, 7]);
      c.strokeStyle = 'rgba(' + ink + ',.16)';
      c.lineWidth = 1;
      c.beginPath();
      for (var k = 0; k <= 48; k++) {
        var t = k / 48, x = padL + rW * (t * 12 / 24), y = hy - Math.sin(t * Math.PI) * arcH;
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
      c.restore();

      var u = (h - 6) / 12;
      if (u > -0.05 && u < 1.05) {
        var sx = padL + rW * ((h - 6) / 24);
        var sy = hy - Math.sin(clamp(u, 0, 1) * Math.PI) * arcH + (u < 0 ? -u : u > 1 ? u - 1 : 0) * arcH * 0.6;
        var R = clamp(W * 0.022, 14, 30);
        c.save();
        c.beginPath(); c.rect(0, 0, W, hy); c.clip();
        c.globalCompositeOperation = 'lighter';
        var glow = c.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 7);
        glow.addColorStop(0, 'rgba(255,255,255,.55)'); glow.addColorStop(0.3, 'rgba(255,250,242,.14)'); glow.addColorStop(1, 'rgba(255,250,242,0)');
        c.fillStyle = glow; c.fillRect(sx - R * 7, sy - R * 7, R * 14, R * 14);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#ffffff';
        c.shadowColor = 'rgba(255,244,230,.9)';
        c.shadowBlur = R * 0.9;
        c.beginPath(); c.arc(sx, sy, R, 0, TAU); c.fill();
        c.restore();
      }
      skyDirty = false;
    }

    function markSky() { skyDirty = true; }

    if (!RM) {
      // Charge up as the section arrives, then the day drains it.
      ST().create({
        trigger: sec, start: 'top 65%',
        onEnter: function () { gsap.to(B, { fill: 1, duration: 1.6, ease: 'expo.inOut', overwrite: 'auto' }); },
        onLeaveBack: function () { gsap.to(B, { fill: 0, duration: 0.5, ease: 'power2.inOut', overwrite: 'auto' }); }
      });
      if (outline) {
        gsap.fromTo(outline, { strokeDasharray: '4200 4200', strokeDashoffset: 4200 }, {
          strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut',
          onComplete: function () { gsap.set(outline, { clearProps: 'strokeDasharray,strokeDashoffset' }); },
          scrollTrigger: { trigger: sec, start: 'top 70%', toggleActions: 'play none none reverse' }
        });
      }
    }

    function setHourP(p) {
      p = clamp(p, 0, 1);
      if (st) APP.scrollTo(st.start + p * (st.end - st.start), { immediate: true });
      else { B.p = p; markSky(); }
    }
    if (sky) {
      var dragging = false;
      function fromEvent(e) {
        var r = hours ? hours.getBoundingClientRect() : sky.getBoundingClientRect();
        return (e.clientX - r.left) / r.width;
      }
      sky.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (st && !st.isActive) return;
        dragging = true;
        try { sky.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        setHourP(fromEvent(e));
      });
      sky.addEventListener('pointermove', function (e) { if (dragging) setHourP(fromEvent(e)); });
      var stop = function (e) { dragging = false; try { sky.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ } };
      sky.addEventListener('pointerup', stop);
      sky.addEventListener('pointercancel', stop);
      sky.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        var hNow = Math.round(B.p * 24);
        var next = clamp(hNow + (e.key === 'ArrowRight' ? 1 : -1), 0, 24) / 24;
        if (st) APP.scrollTo(st.start + next * (st.end - st.start), { duration: 0.6 });
        else { gsap.to(B, { p: next, duration: RM ? 0 : 0.4, ease: 'power3.out', onUpdate: markSky }); }
      });
    }

    bindSeg(seg, function (v) {
      if (v === mode) return;
      mode = v;
      var n = v === 'web' ? '16' : '24';
      gsap.timeline()
        .to(svg, { autoAlpha: 0, yPercent: -3, duration: RM ? 0.1 : 0.2, ease: 'power2.in' })
        .add(function () {
          if (digits) digits.textContent = n;
          if (outline) outline.textContent = n;
          if (svg) svg.setAttribute('aria-label', n + ' hours');
        })
        .fromTo(svg, { autoAlpha: 0, yPercent: 3 }, { autoAlpha: 1, yPercent: 0, duration: RM ? 0.1 : 0.28, ease: 'power3.out' });
      gsap.to(B, { web: v === 'web' ? 1 : 0, emptyAt: v === 'web' ? 16 : 24, duration: RM ? 0.2 : 0.48, ease: 'power3.inOut', overwrite: 'auto', onUpdate: placeEmpty });
    });

    // Hovering the numeral sloshes the level: the wave amplitude springs 18 → 0.
    // The numeral ignores pointer events (the sky beneath is draggable), so hit-test its box.
    var overNum = false;
    if (svg && !RM) {
      sec.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = (outline || svg).getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (inside && !overNum) gsap.fromTo(B, { slosh: 18 }, { slosh: 0, duration: 1.8, ease: 'elastic.out(1, 0.28)', overwrite: 'auto' });
        overNum = inside;
      });
      sec.addEventListener('pointerleave', function () { overNum = false; });
    }

    watch(sec, function (v) { visible = v; if (v) { measureHorizon(); skyDirty = true; } });
    addLoop(function (dt) {
      if (!visible) return;
      if (!RM) B.phase += dt * 1.6;
      drawLevel();
      updateDom();
      if (skyDirty) drawSky();
    });
    updateDom();
    drawLevel();
  }

  /* =======================================================================
     08 #material · through the zero
     ===================================================================== */
  function initMaterial() {
    prep();
    var sec = $('#material');
    if (!sec) return;
    var gsap = G();
    var cvs = $('[data-knockout-canvas]', sec);
    var copy = $('.material__copy', sec);
    var h2 = copy && $('h2', copy);
    var bits = copy ? [$('.eyebrow', copy), $('p:not(.eyebrow)', copy)].filter(Boolean) : [];

    function copyReveal() {
      reveal(h2, { type: 'lines', mask: true, start: 'top 72%', stagger: 0.09, duration: 1.2, from: { yPercent: 110 }, trigger: sec });
      if (!RM && bits.length) {
        gsap.from(bits, { autoAlpha: 0, y: 12, duration: 0.9, ease: 'expo.out', stagger: 0.1, delay: 0.2,
          scrollTrigger: { trigger: sec, start: 'top 72%', toggleActions: 'play none none reverse' } });
      }
    }
    if (RM || !cvs || !cvs.getContext) { if (cvs && RM) cvs.hidden = true; copyReveal(); return; }

    var M = { p: 0 };
    var SMAX = MOBILE ? 40 : 60;
    var dirty = true, visible = false;
    var geo = { font: '', left: 0, base: 0, ox: 0, oy: 0, ls: 0, fs: 0 };
    var VOID = cssVar('--void', '#060607');
    var FAMILY = cssVar('--font-display', '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif');
    var surf = surface(cvs, function () { layout(); });
    var ctx = surf.ctx;

    function setFont(fs) {
      geo.fs = fs;
      geo.ls = -0.035 * fs;
      geo.font = '800 ' + fs.toFixed(2) + 'px ' + FAMILY;
      ctx.font = geo.font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = geo.ls.toFixed(2) + 'px'; else geo.ls = 0;
    }
    function layout() {
      var W = surf.w, H = surf.h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      setFont(100);
      var m0 = ctx.measureText('0');
      var capRatio = (m0.actualBoundingBoxAscent || 72) / 100;
      var fs = (MOBILE ? W * 0.44 : H * 0.7) / capRatio;
      setFont(fs);
      var total = ctx.measureText('100%').width - geo.ls;
      var maxW = W * (MOBILE ? 0.92 : 0.84);
      if (total > maxW) { setFont(fs * maxW / total); total = ctx.measureText('100%').width - geo.ls; }
      var asc = ctx.measureText('0').actualBoundingBoxAscent || geo.fs * capRatio;
      geo.left = (W - total) / 2;
      geo.base = H * (MOBILE ? 0.42 : 0.41) + asc / 2;
      var x0 = geo.left + ctx.measureText('10').width;
      geo.ox = x0 + (ctx.measureText('0').width - geo.ls) / 2;
      geo.oy = geo.base - asc / 2;
      counter = null;
      try { counter = measureCounter(x0, asc); } catch (e) { counter = null; }
      if (counter) { geo.ox = counter.cx; geo.oy = counter.cy; }
      dirty = true;
    }

    // Traces the counter (the hole) of the second "0" from a 2x offscreen
    // render, so it can open into a window: the camera flies through the zero.
    function measureCounter(x0, asc) {
      var k = 2, pad = 6;
      var adv = ctx.measureText('0').width - geo.ls;
      var cw = Math.ceil((adv + pad * 2) * k), chh = Math.ceil((asc + pad * 2) * k);
      var oc = doc.createElement('canvas');
      oc.width = cw; oc.height = chh;
      var o = oc.getContext('2d', { willReadFrequently: true });
      o.font = '800 ' + (geo.fs * k).toFixed(2) + 'px ' + FAMILY;
      o.textBaseline = 'alphabetic';
      o.fillStyle = '#fff';
      var baseY = chh - pad * k;
      o.fillText('0', pad * k, baseY);
      var data = o.getImageData(0, 0, cw, chh).data;
      function a(x, y) { return data[(y * cw + x) * 4 + 3]; }
      var mid = Math.round((pad + adv / 2) * k);
      var L = [], R = [];
      for (var y = 0; y < chh; y++) {
        if (a(mid, y) >= 128) continue;
        var xl = mid; while (xl > 0 && a(xl, y) < 128) xl--;
        var xr = mid; while (xr < cw - 1 && a(xr, y) < 128) xr++;
        if (xl <= 0 || xr >= cw - 1) continue;
        var fl = xl + clamp((a(xl, y) - 128) / Math.max(1, a(xl, y) - a(xl + 1, y)), 0, 1);
        var fr = xr - clamp((a(xr, y) - 128) / Math.max(1, a(xr, y) - a(xr - 1, y)), 0, 1);
        L.push([fl - 1.5, y + 0.5]); R.push([fr + 1.5, y + 0.5]);
      }
      if (L.length < 8) return null;
      L[0][1] -= 1.5; R[0][1] -= 1.5; L[L.length - 1][1] += 1.5; R[R.length - 1][1] += 1.5;
      function X(v) { return x0 + v / k - pad; }
      function Y(v) { return geo.base + (v - baseY) / k; }
      var path = new Path2D();
      path.moveTo(X(L[0][0]), Y(L[0][1]));
      for (var i = 1; i < L.length; i++) path.lineTo(X(L[i][0]), Y(L[i][1]));
      for (var j = R.length - 1; j >= 0; j--) path.lineTo(X(R[j][0]), Y(R[j][1]));
      path.closePath();
      var m = Math.floor(L.length / 2);
      return { path: path, cx: X((L[m][0] + R[m][0]) / 2), cy: Y((L[0][1] + L[L.length - 1][1]) / 2) };
    }
    var counter = null;
    layout();

    function draw() {
      var W = surf.w, H = surf.h, d = surf.dpr, p = M.p;
      var s = p <= 0.15 ? 1 : Math.pow(SMAX, Math.min(1, (p - 0.15) / 0.7));
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = VOID;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(geo.ox, geo.oy);
      ctx.scale(s, s);
      ctx.translate(-geo.ox, -geo.oy);
      ctx.font = geo.font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = geo.ls.toFixed(2) + 'px';
      ctx.textBaseline = 'alphabetic';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fillText('100%', geo.left, geo.base);
      // The zero's hole opens as the camera approaches it.
      var open = counter ? sstep(1.12, 2.8, s) : 0;
      if (open > 0) { ctx.globalAlpha = open; ctx.fill(counter.path); ctx.globalAlpha = 1; }
      // A hairline on the cut edge keeps the glyphs crisp against a dark stage.
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(236,238,242,' + (0.16 * (1 - sstep(1, 3.2, s))).toFixed(3) + ')';
      ctx.lineWidth = 1 / s;
      if (s < 3.2) ctx.strokeText('100%', geo.left, geo.base);
    }

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: sec, pin: true, start: 'top top', end: pinEnd(2), scrub: 1, invalidateOnRefresh: true },
      onUpdate: function () { dirty = true; }
    });
    tl.to(M, { p: 1, duration: 1 }, 0)
      .to(copy, { autoAlpha: 0, scale: 1.06, yPercent: -8, transformOrigin: '0% 100%', duration: 0.15, ease: 'power1.in' }, 0.15)
      .to(cvs, { autoAlpha: 0, duration: 0.15, ease: 'power1.in' }, 0.85);
    copyReveal();

    watch(sec, function (v) { visible = v; dirty = true; });
    addLoop(function () {
      if (!visible || !dirty) return;
      dirty = false;
      draw();
    });
  }

  /* ------------------------------------------------------------ register */
  APP.register('brief', initBrief, { order: 20 });
  APP.register('proof', initProof, { order: 40 });
  APP.register('display', initDisplay, { order: 50 });
  APP.register('rail', initRail, { order: 60 });
  APP.register('battery', initBattery, { order: 70 });
  APP.register('material', initMaterial, { order: 80 });
})();
