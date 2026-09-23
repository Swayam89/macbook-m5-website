/* =============================================================================
   js/core.js (E1): the app core for "Lift the Lid".
   Defines window.APP synchronously (SPEC §6), then on DOMContentLoaded:
   plugins, Lenis wired to the GSAP ticker, fonts, module inits in order,
   the core ScrollTriggers (nav progress, per-section chapter index), refresh,
   app:ready and the preloader. Also owns the nav, cursor, magnetic buttons,
   anchor scrolling and the debounced resize event.
   Classic script: no import/export, works from file:// too.
   Add ?debug to the URL for boot logging (?debug=markers adds ST markers).
   ========================================================================== */
(function (win, doc) {
  'use strict';

  var root = doc.documentElement;
  var gsap = win.gsap || null;
  var ST = win.ScrollTrigger || null;
  var Split = win.SplitText || null;

  /* ---------------------------------------------------------------- env */
  function mq(q) { try { return win.matchMedia(q).matches; } catch (e) { return false; } }
  var search = win.location ? win.location.search : '';
  var DEBUG = /[?&]debug\b/.test(search);
  var MARKERS = /[?&]debug=markers\b/.test(search);
  var RM = mq('(prefers-reduced-motion: reduce)');
  var MOBILE = mq('(max-width: 768px)');
  var TOUCH = mq('(hover: none) and (pointer: coarse)') ||
    (('ontouchstart' in win) && (navigator.maxTouchPoints || 0) > 0 && !mq('(pointer: fine)'));
  var FINE = mq('(pointer: fine)') && !TOUCH;
  var T0 = now();

  function now() { return (win.performance && win.performance.now) ? win.performance.now() : Date.now(); }
  function log() {
    if (!DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('%c[APP +' + Math.round(now() - T0) + 'ms]', 'color:#F2A33A');
    console.log.apply(console, a);
  }
  function qs(s, r) { return (r || doc).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function pad(n, l) { n = String(Math.max(0, Math.round(n))); while (n.length < (l || 2)) n = '0' + n; return n; }

  /* --------------------------------------------------------------- util */
  var util = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    // mapRange(value, inMin, inMax, outMin, outMax): clamped to the out range.
    mapRange: function (v, a, b, c, d) {
      if (b === a) return v >= b ? d : c;
      var t = (v - a) / (b - a);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return c + (d - c) * t;
    },
    // Frame-rate independent smoothing. dt in seconds (values > 1 are read as ms).
    damp: function (a, b, lambda, dt) {
      if (dt > 1) dt /= 1000;
      return a + (b - a) * (1 - Math.exp(-lambda * dt));
    },
    // Geometric interpolation, for zoom scales (1 -> 24 reads evenly).
    logLerp: function (a, b, t) {
      if (a <= 0 || b <= 0) return a + (b - a) * t;
      return a * Math.pow(b / a, t);
    }
  };

  /* ---------------------------------------------------------------- bus */
  var handlers = {};
  var fired = {};
  var bus = {
    on: function (evt, fn) {
      if (typeof fn !== 'function') return function () {};
      (handlers[evt] = handlers[evt] || []).push(fn);
      return function () { bus.off(evt, fn); };
    },
    off: function (evt, fn) {
      var list = handlers[evt];
      if (!list) return;
      if (!fn) { handlers[evt] = []; return; }
      handlers[evt] = list.filter(function (f) { return f !== fn && f._once !== fn; });
    },
    once: function (evt, fn) {
      var w = function (p) { bus.off(evt, w); fn(p); };
      w._once = fn;
      return bus.on(evt, w);
    },
    emit: function (evt, payload) {
      if (payload === undefined) payload = {};
      fired[evt] = true;
      if (DEBUG && evt !== 'preloader:progress') log('emit', evt, payload);
      var list = handlers[evt];
      if (!list || !list.length) return;
      list.slice().forEach(function (fn) {
        try { fn(payload); }
        catch (e) { console.info('[APP] A listener for "' + evt + '" threw; other listeners still ran.', e); }
      });
    },
    // true once an event has been emitted at least once (for late subscribers).
    fired: function (evt) { return !!fired[evt]; }
  };

  /* ---------------------------------------------------------- whenThree */
  // Resolves {THREE, ADDONS} on 'three:ready' (or at once if already set).
  // If three never arrives (blocked CDN, no module support) it resolves null
  // after THREE_TIMEOUT, so modules can show their fallbacks.
  var THREE_TIMEOUT = 15000;
  var threePromise = new Promise(function (resolve) {
    var settled = false;
    function done() {
      if (settled || !win.THREE) return;
      settled = true;
      resolve({ THREE: win.THREE, ADDONS: win.THREE_ADDONS || {} });
    }
    function fail(reason) {
      if (settled) return;
      settled = true;
      APP.threeFailed = true;
      log('three unavailable:', reason);
      resolve(null);
    }
    if (win.THREE) { done(); return; }
    win.addEventListener('three:ready', done);
    // A failed module graph fires 'error' on its <script type="module">.
    win.addEventListener('error', function (e) {
      var t = e && e.target;
      if (t && t.tagName === 'SCRIPT' && t.type === 'module' && !win.THREE) fail('module script error');
    }, true);
    // The shim's own failure usually happens before this script runs, so ask
    // the module loader directly: import('three') shares the shim's module
    // map (no second download) and rejects at once if three cannot load.
    try {
      import('three').then(null, function () { if (!win.THREE) fail('import failed'); });
    } catch (e) { /* no dynamic import: rely on the timeout */ }
    setTimeout(function () { if (win.THREE) done(); else fail('timeout'); }, THREE_TIMEOUT);
  });

  /* ---------------------------------------------------------------- APP */
  var APP = (win.APP && typeof win.APP === 'object') ? win.APP : {};
  win.APP = APP;

  APP.version = '1.0.0';
  APP.debug = DEBUG;
  APP.gsap = gsap;
  APP.ScrollTrigger = ST;
  APP.SplitText = Split;
  APP.lenis = null;
  APP.reducedMotion = RM;
  APP.isMobile = MOBILE;
  APP.isTouch = TOUCH;
  APP.ready = false;   // true after app:ready
  APP.loaded = false;  // true after preloader:done
  APP.threeFailed = false;
  APP.bus = bus;
  APP.util = util;
  APP.whenThree = function () { return threePromise; };

  APP.pinEnd = function (k) {
    return function () { return '+=' + Math.round(win.innerHeight * k * (APP.isMobile ? 0.6 : 1)); };
  };

  /* ----------------------------------------------------------- registry */
  var registry = [];
  var seq = 0;
  var booted = false;

  APP.modules = registry;
  APP.register = function (name, init, opts) {
    if (typeof init !== 'function') return null;
    var order = (opts && typeof opts.order === 'number') ? opts.order : 1000 + seq;
    var m = { name: String(name || 'module-' + seq), init: init, order: order, seq: seq++, status: 'pending', ms: 0, error: null };
    registry.push(m);
    if (booted) { runInit(m); refreshSoon(); }
    return m;
  };

  function runInit(m) {
    var t = now();
    try {
      m.init(APP);
      m.status = 'ok';
    } catch (e) {
      m.status = 'failed';
      m.error = e;
      console.info('[APP] Module "' + m.name + '" failed to initialise. The rest of the page carries on without it.', e);
    }
    m.ms = now() - t;
    log('init', m.name, '(order ' + m.order + ')', m.status, m.ms.toFixed(1) + 'ms');
  }

  var refreshTimer = 0;
  function refreshSoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (ST) ST.refresh(); }, 60);
  }

  /* ---------------------------------------------------------- html state */
  if (RM) root.classList.add('is-reduced');
  if (TOUCH) root.classList.add('is-touch');
  if (gsap && gsap.config) gsap.config({ nullTargetWarn: false });

  /* ------------------------------------------------------------ scrollTo */
  function scrollY() {
    return APP.lenis ? APP.lenis.scroll : (win.pageYOffset || root.scrollTop || 0);
  }
  function maxScroll() {
    return APP.lenis && APP.lenis.limit ? APP.lenis.limit : Math.max(0, root.scrollHeight - win.innerHeight);
  }
  function toElement(target) {
    if (!target) return null;
    if (typeof target === 'string') {
      if (target === '#' || target === '#top') return null;
      try { return qs(target); } catch (e) { return null; }
    }
    return target.nodeType === 1 ? target : null;
  }
  // Scroll position of a section, pin-aware: a pinned element's rect lies
  // while it is fixed, so prefer its ScrollTrigger start or its pin-spacer.
  function resolveY(target) {
    if (typeof target === 'number') return target;
    if (target === '#' || target === '#top' || target === 'top') return 0;
    if (target === 'bottom') return maxScroll();
    var el = toElement(target);
    if (!el) return null;
    if (ST) {
      var all = ST.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].pin === el) return all[i].start;
      }
    }
    var box = (el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('pin-spacer')) ? el.parentNode : el;
    return box.getBoundingClientRect().top + scrollY();
  }
  function easeState(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  APP.scrollTo = function (target, opts) {
    opts = opts || {};
    var y = resolveY(target);
    if (y == null || isNaN(y)) return;
    y = util.clamp(y + (opts.offset || 0), 0, maxScroll());
    var duration = opts.duration != null ? opts.duration : 1.2;
    var immediate = !!opts.immediate || RM;
    if (APP.lenis) {
      APP.lenis.scrollTo(y, {
        duration: duration,
        immediate: immediate,
        force: !!opts.force,
        lock: !!opts.lock,
        easing: opts.easing || easeState,
        onComplete: opts.onComplete
      });
    } else {
      win.scrollTo(0, y);
      if (ST) ST.update();
      if (opts.onComplete) setTimeout(function () { opts.onComplete(); }, 0);
    }
  };

  /* --------------------------------------------------------- splitReveal */
  // → {split, tl}. Masked line/word/char reveal. With autoSplit (lines) the
  // SplitText instance re-splits on resize and `tl` is swapped in place.
  // Pass trigger:false for an event-driven reveal that plays at once.
  APP.splitReveal = function (el, o) {
    var res = { split: null, tl: null };
    if (typeof el === 'string') el = qs(el);
    if (!el || !gsap) return res;
    o = Object.assign({
      type: 'lines', mask: true, scrub: false, start: 'top 80%', end: 'bottom 60%',
      stagger: 0.08, duration: 0.9, from: { yPercent: 110 }, trigger: el, ease: 'expo.out', delay: 0
    }, o || {});
    var trig = (o.trigger === false || o.trigger === null) ? null : (o.trigger || el);

    function stVars() {
      if (!trig || !ST) return undefined;
      var v = { trigger: trig, start: o.start, end: o.end };
      if (o.scrub) v.scrub = o.scrub;
      else v.toggleActions = o.toggleActions || 'play none none none';
      if (o.pinnedContainer) v.pinnedContainer = o.pinnedContainer;
      return v;
    }
    function timeline() {
      var tl = gsap.timeline({ scrollTrigger: stVars(), paused: !!o.paused });
      if (!o.scrub && o.delay) tl.delay(o.delay);
      return tl;
    }

    if (RM) {
      res.tl = timeline().fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'none' });
      return res;
    }

    var type = String(o.type || 'lines');
    var unit = /chars/.test(type) ? 'chars' : /words/.test(type) ? 'words' : 'lines';
    var splitType = unit === 'chars' ? (/lines/.test(type) ? 'lines,words,chars' : 'words,chars')
      : unit === 'words' ? (/lines/.test(type) ? 'lines,words' : 'words') : 'lines';
    var mask = o.mask ? (o.mask === true ? unit : o.mask) : undefined;
    var from = Object.assign({}, o.from);
    if (!mask && from.opacity == null && from.autoAlpha == null) from.autoAlpha = 0;

    function build(targets) {
      var tl = timeline();
      tl.from(targets, Object.assign({
        duration: o.duration,
        ease: o.scrub ? 'none' : o.ease,
        stagger: o.stagger
      }, from));
      res.tl = tl;
      return tl;
    }

    if (Split) {
      try {
        var cfg = {
          type: splitType,
          autoSplit: /lines/.test(splitType),
          onSplit: function (self) { return build(self[unit]); }
        };
        if (mask) cfg.mask = mask;
        res.split = Split.create(el, cfg);
        if (res.tl) return res;
      } catch (e) {
        log('splitReveal: SplitText failed, falling back', e);
        try { res.split && res.split.revert(); } catch (e2) { /* noop */ }
        res.split = null;
      }
    }
    // Fallback without SplitText: one masked-feel rise of the whole block.
    res.tl = timeline().from(el, { autoAlpha: 0, yPercent: 18, duration: o.duration, ease: o.scrub ? 'none' : o.ease });
    return res;
  };

  /* ------------------------------------------------------------ preloader */
  var gate = { open: false, waiters: [] };
  function openGate(why) {
    if (gate.open) return;
    gate.open = true;
    log('preloader gate open:', why);
    gate.waiters.splice(0).forEach(function (fn) { fn(); });
  }
  function whenGate(fn) { if (gate.open) fn(); else gate.waiters.push(fn); }
  bus.on('mac:firstframe', function () { openGate('mac:firstframe'); });
  bus.on('webgl:unsupported', function (p) { if (!p || p.module !== 'chip') openGate('webgl:unsupported'); });

  function runPreloader() {
    var el = qs('[data-preloader]');
    var count = el && qs('[data-preloader-count]', el);
    var slate = el && qs('.preloader__slate', el);
    var barTop = el && qs('.preloader__bar--top', el);
    var barBot = el && qs('.preloader__bar--bottom', el);
    var finished = false;

    // No laptop module at all (missing or failed): nothing to wait for.
    var mac = registry.filter(function (m) { return /^mac/.test(m.name); });
    if (!mac.length || mac.every(function (m) { return m.status === 'failed'; }) || !win.MacScene) openGate('no mac module');
    setTimeout(function () { openGate('timeout 5s'); }, 5000);

    function done() {
      if (finished) return;
      finished = true;
      if (APP.lenis) APP.lenis.start();
      root.classList.add('is-loaded');
      APP.loaded = true;
      bus.emit('preloader:done', {});
      navIntro();
    }

    if (!el || !gsap) { whenGate(done); return; }

    if (RM) {
      if (count) count.textContent = '';
      whenGate(function () {
        gsap.to(el, { autoAlpha: 0, duration: 0.4, ease: 'none', onComplete: function () { el.setAttribute('hidden', ''); } });
        done();
      });
      return;
    }

    var state = { v: 0 };
    var shown = -1;
    function render() {
      var v = Math.round(state.v);
      if (v === shown) return;
      shown = v;
      if (count) count.textContent = pad(v, 3);
      bus.emit('preloader:progress', { p: v / 100 });
    }
    render();

    gsap.to(state, {
      v: 90, duration: 1.4, ease: 'power1.out', onUpdate: render,
      onComplete: function () { whenGate(exit); }
    });

    function exit() {
      var tl = gsap.timeline({
        onComplete: function () {
          gsap.set(el, { autoAlpha: 0 });
          el.setAttribute('hidden', '');
        }
      });
      tl.to(state, { v: 100, duration: 0.3, ease: 'power2.out', onUpdate: render })
        .to(slate, { autoAlpha: 0, y: -10, duration: 0.45, ease: 'power2.in' }, '+=0.12')
        .to(barTop, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '<0.1')
        .to(barBot, { yPercent: 100, duration: 0.9, ease: 'expo.inOut' }, '<')
        // Hand over as the bars start to part (expo.inOut has barely moved
        // yet), so the hero copy rises into the opening instead of after it.
        .add(done, '<0.15');
    }
  }

  /* ------------------------------------------------------------------ nav */
  var nav, navIndex, navLinks = [], sections = [], currentSection = -1;
  var navHidden = false, navDirAccum = 0, navLastY = 0, navReady = false, idxTl = null;
  var navHold = 0; // while a nav-link flight runs, the bar stays put

  function navIntro() {
    if (!nav || RM || !gsap) { navReady = true; return; }
    var items = navItems();
    gsap.to(items, {
      y: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.25,
      clearProps: 'transform,opacity,visibility',
      onComplete: function () { navReady = true; }
    });
  }
  function navItems() {
    return [qs('.nav__mark', nav)].concat(qsa('.nav__links a', nav), [navIndex, qs('.nav__cta', nav)]).filter(Boolean);
  }

  // Only keyboard focus pins the bar open: a mouse click leaves focus on the
  // link, and that must not stop the bar from tucking away afterwards.
  function navKeyboardFocus() {
    var a = doc.activeElement;
    if (!a || !nav.contains(a)) return false;
    try { return a.matches(':focus-visible'); } catch (e) { return true; }
  }
  function setNavHidden(h) {
    if (!nav || h === navHidden) return;
    navHidden = h;
    nav.classList.toggle('is-hidden', h);
  }
  function navOnScroll(y, dir) {
    if (!nav) return;
    if (navHold) { navLastY = y; navDirAccum = 0; return; }
    if (y < 120 || navKeyboardFocus()) { navDirAccum = 0; navLastY = y; setNavHidden(false); return; }
    var dy = y - navLastY;
    navLastY = y;
    if (!dir) dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    if (!dir) return;
    // Require a few px of travel in one direction so a trackpad's tail does not flicker the bar.
    if ((dir > 0) !== (navDirAccum > 0)) navDirAccum = 0;
    navDirAccum += Math.abs(dy) * dir;
    if (navDirAccum > 8) setNavHidden(true);
    else if (navDirAccum < -8) setNavHidden(false);
  }

  function finishName() {
    var f = qs('#finish');
    var t = f && f.getAttribute('data-theme');
    if (t) return t;
    return (win.MacScene && win.MacScene.finish) || 'space-black';
  }
  function applyNavTheme() {
    if (!nav) return;
    var sec = sections[currentSection];
    if (!sec) return;
    var theme = sec.getAttribute('data-nav-theme') || 'dark';
    if (sec.id === 'finish' && finishName() === 'silver') theme = 'light';
    nav.classList.toggle('nav--light', theme === 'light');
  }

  function setIndexText(text) {
    if (!navIndex || navIndex.textContent === text) return;
    if (RM || !navReady || !gsap) { navIndex.textContent = text; return; }
    if (idxTl) idxTl.kill();
    idxTl = gsap.timeline()
      .to(navIndex, { y: -6, autoAlpha: 0, duration: 0.16, ease: 'power2.in' })
      .add(function () { navIndex.textContent = text; })
      .fromTo(navIndex, { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'expo.out', clearProps: 'transform,opacity,visibility' });
  }

  function setSection(i) {
    if (i === currentSection || !sections[i]) return;
    currentSection = i;
    var sec = sections[i];
    var num = sec.getAttribute('data-section') || pad(i + 1);
    var title = sec.getAttribute('data-title') || '';
    setIndexText(num + ' / ' + pad(sections.length) + ' · ' + title);
    applyNavTheme();
    // Chapter links: the last chapter at or above the current section is current.
    var active = null;
    navLinks.forEach(function (l) { if (l.index > -1 && l.index <= i) active = l; });
    navLinks.forEach(function (l) {
      if (l === active) l.el.setAttribute('aria-current', 'true');
      else l.el.removeAttribute('aria-current');
    });
    bus.emit('section:enter', { id: sec.id, index: i, title: title });
  }

  function initNav() {
    nav = qs('[data-nav]');
    navIndex = nav && qs('[data-nav-index]', nav);
    sections = qsa('main section[id][data-section]');
    navLinks = nav ? qsa('[data-nav-link]', nav).map(function (a) {
      var id = a.getAttribute('data-nav-link');
      var idx = -1;
      sections.forEach(function (s, k) { if (s.id === id) idx = k; });
      return { el: a, id: id, index: idx };
    }) : [];
    if (nav) {
      nav.addEventListener('focusin', function () { if (navKeyboardFocus()) setNavHidden(false); });
      if (!RM && gsap) gsap.set(navItems(), { y: -10, autoAlpha: 0 });
    }
    bus.on('finish:change', applyNavTheme);
  }

  // Core ScrollTriggers, created after every module init (SPEC §6), so pin
  // spacers already exist and positions account for them.
  function createCoreTriggers() {
    if (!ST) return;
    var bar = qs('[data-nav-progress]');
    var setBar = bar ? gsap.quickSetter(bar, 'scaleX') : null;
    var secST = sections.map(function (sec, i) {
      var box = (sec.parentNode && sec.parentNode.classList && sec.parentNode.classList.contains('pin-spacer')) ? sec.parentNode : sec;
      return ST.create({
        id: 'core:section:' + sec.id, trigger: box, start: 'top center', end: 'bottom center',
        onToggle: function (self) { if (self.isActive) setSection(i); }
      });
    });
    // Belt and braces: an immediate jump can land exactly on a boundary or
    // skip a short section, so the progress trigger also resolves the chapter
    // as the last section whose start is behind the viewport centre line.
    function syncSection(y) {
      var k = 0;
      for (var i = 0; i < secST.length; i++) if (secST[i].start <= y) k = i;
      setSection(k);
    }
    ST.create({
      id: 'core:progress', start: 0, end: 'max',
      onUpdate: function (self) {
        var y = self.scroll();
        if (setBar) setBar(self.progress);
        if (!APP.lenis) navOnScroll(y, self.direction);
        syncSection(y);
        cursorOnScroll();
      },
      onRefresh: function (self) { if (secST.length) syncSection(self.scroll()); }
    });
  }

  /* ------------------------------------------------------ anchor scrolling */
  function flightDuration(dist) {
    return util.clamp(1.2 + (dist / Math.max(1, win.innerHeight)) * 0.05, 1.2, 2.6);
  }
  function initAnchors() {
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a || a.classList.contains('skip')) return;
      var href = a.getAttribute('href');
      if (!href || href.length < 2) return;
      var target = toElement(href);
      if (!target) return;
      e.preventDefault();
      var y = resolveY(target);
      var keyboard = e.detail === 0;
      var dur = flightDuration(Math.abs((y || 0) - scrollY()));
      var fromNav = !!(nav && nav.contains(a));
      function release() { clearTimeout(navHold); navHold = 0; }
      if (fromNav && APP.lenis && !RM) {
        release();
        setNavHidden(false);
        navHold = setTimeout(release, dur * 1000 + 300); // wheel can cancel the flight; never stay locked
      }
      APP.scrollTo(target, {
        duration: dur,
        onComplete: function () {
          release();
          if (!keyboard) return;
          // Keyboard users continue from the chapter's heading, as a native
          // in-page jump would; a ring round a whole pinned section would not help.
          var f = qs('h1, h2', target) || target;
          if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
          try { f.focus({ preventScroll: true, focusVisible: false }); } catch (err) { /* noop */ }
        }
      });
    });
  }

  /* --------------------------------------------------------------- cursor */
  var cursorOnScroll = function () {};
  function initCursor() {
    var el = qs('[data-cursor-el]');
    if (!el || !gsap || RM || !FINE) return;
    var label = qs('[data-cursor-label]', el);
    root.classList.add('has-cursor');
    gsap.set(el, { x: win.innerWidth / 2, y: win.innerHeight / 2, autoAlpha: 0 });
    var xTo = gsap.quickTo(el, 'x', { duration: 0.15, ease: 'power3' });
    var yTo = gsap.quickTo(el, 'y', { duration: 0.15, ease: 'power3' });
    var visible = false, mode = '', current = null;

    function show(v) {
      if (v === visible) return;
      visible = v;
      gsap.to(el, { autoAlpha: v ? 1 : 0, duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
    }
    function setMode(m, text) {
      if (m === mode && (!text || (label && label.textContent === text))) return;
      mode = m;
      el.classList.toggle('is-label', m === 'label');
      el.classList.toggle('is-hover', m === 'hover');
      if (m === 'label' && label) label.textContent = text;
    }
    var HOVERABLE = 'a[href],button,[role="button"],[role="radio"],label,select,summary,[data-stop],[tabindex]:not([tabindex="-1"])';
    var hero = qs('#hero');
    var lastTarget = null;
    // The closed lid can be peeked by holding anywhere in #hero (SPEC §4.01),
    // so the bare hero surface carries the HOLD label until the lid lifts.
    function heroPeekable() {
      var st = win.MacScene && win.MacScene.state;
      return !!(st && typeof st.lid === 'number' && st.lid < 20 && !root.classList.contains('no-webgl'));
    }
    function resolve(t) {
      lastTarget = t;
      if (!t || !t.closest) { setMode(''); return; }
      var c = t.closest('[data-cursor]');
      if (c) {
        // A button or link already says what it does; a 64px label on top of
        // its own text reads as a smudge, so it gets the 36px hover ring.
        if (c.matches('a,button')) setMode('hover');
        else setMode('label', String(c.getAttribute('data-cursor') || '').toUpperCase());
        return;
      }
      if (t.closest('input,textarea')) { setMode(''); show(false); current = 'input'; return; }
      if (t.closest(HOVERABLE)) { setMode('hover'); return; }
      if (hero && hero.contains(t) && heroPeekable()) { setMode('label', 'HOLD'); return; }
      setMode('');
    }
    cursorOnScroll = function () {
      if (lastTarget && hero && hero.contains(lastTarget)) resolve(lastTarget);
    };

    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      xTo(e.clientX);
      yTo(e.clientY);
      if (current !== 'input') show(true);
    }, { passive: true });
    doc.addEventListener('pointerover', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      current = null;
      resolve(e.target);
    }, { passive: true });
    doc.addEventListener('pointerdown', function () { el.classList.add('is-down'); }, { passive: true });
    win.addEventListener('pointerup', function () { el.classList.remove('is-down'); }, { passive: true });
    doc.addEventListener('mouseout', function (e) { if (!e.relatedTarget) show(false); });
    win.addEventListener('blur', function () { show(false); el.classList.remove('is-down'); });
  }

  /* ------------------------------------------------------------- magnetic */
  function initMagnetic() {
    if (!gsap || RM || !FINE) return;
    qsa('.btn, .nav__cta, [data-magnetic]').forEach(function (b) {
      var strength = parseFloat(b.getAttribute('data-magnetic')) || 0.3;
      b.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var r = b.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        gsap.to(b, {
          x: util.clamp(dx * strength, -14, 14), y: util.clamp(dy * strength * 1.2, -10, 10),
          duration: 0.5, ease: 'power3.out', overwrite: 'auto'
        });
      });
      b.addEventListener('pointerleave', function () {
        gsap.to(b, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
      });
    });
  }

  /* --------------------------------------------------------------- resize */
  function initResize() {
    var lastW = win.innerWidth, lastH = win.innerHeight, t = 0;
    win.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var w = win.innerWidth, h = win.innerHeight;
        // Touch browsers resize on every URL-bar show/hide; only a width
        // change or a large height change is a real layout change there.
        var real = w !== lastW || (TOUCH ? Math.abs(h - lastH) > lastH * 0.25 : h !== lastH);
        if (!real) return;
        lastW = w; lastH = h;
        bus.emit('resize', { w: w, h: h, isMobile: mq('(max-width: 768px)') });
        if (ST) ST.refresh();
      }, 150);
    });
  }

  /* ----------------------------------------------------------------- boot */
  function fontsReady() {
    var ready = (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : Promise.resolve();
    return Promise.race([ready, new Promise(function (r) { setTimeout(r, 1500); })]);
  }

  var started = false;
  function boot() {
    if (started) return;
    started = true;
    log('boot', { reducedMotion: RM, isMobile: MOBILE, isTouch: TOUCH, fine: FINE });

    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* noop */ }
    win.scrollTo(0, 0);

    gsap = win.gsap || null;
    ST = win.ScrollTrigger || null;
    Split = win.SplitText || null;
    APP.gsap = gsap; APP.ScrollTrigger = ST; APP.SplitText = Split;

    if (!gsap) {
      // Without GSAP nothing can animate: show the document as it is.
      console.info('[APP] GSAP did not load; the page is shown without motion.');
      booted = true;
      registry.slice().sort(byOrder).forEach(runInit);
      root.classList.add('is-loaded');
      var pl = qs('[data-preloader]');
      if (pl) pl.setAttribute('hidden', '');
      APP.ready = APP.loaded = true;
      bus.emit('app:ready', {});
      bus.emit('preloader:done', {});
      return;
    }

    gsap.config({ nullTargetWarn: false });
    var plugins = [ST, Split].filter(Boolean);
    if (plugins.length) gsap.registerPlugin.apply(gsap, plugins);
    if (ST) {
      // Core owns the resize refresh (debounced, after the 'resize' event), so
      // canvases resize before ScrollTrigger measures.
      ST.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });
      if (MARKERS) ST.defaults({ markers: true });
    }

    if (!RM && win.Lenis) {
      try {
        var lenis = new win.Lenis({ lerp: 0.09, wheelMultiplier: 0.9, autoRaf: false });
        APP.lenis = lenis;
        lenis.stop();
        if (ST) lenis.on('scroll', ST.update);
        lenis.on('scroll', function (l) { navOnScroll(l.scroll, l.direction); });
        gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      } catch (e) {
        APP.lenis = null;
        console.info('[APP] Lenis could not start; using native scrolling.', e);
      }
    }
    gsap.ticker.lagSmoothing(0);

    initNav();
    initCursor();
    initMagnetic();
    initAnchors();
    initResize();

    fontsReady().then(start, start);
  }

  function byOrder(a, b) { return (a.order - b.order) || (a.seq - b.seq); }

  function start() {
    if (booted) return;
    booted = true;
    var t = now();
    registry.slice().sort(byOrder).forEach(runInit);
    createCoreTriggers();
    if (ST) ST.refresh();
    if (currentSection < 0 && sections.length) setSection(0);
    log('inits + refresh', (now() - t).toFixed(1) + 'ms');
    if (DEBUG && ST) {
      console.table(ST.getAll().map(function (s) {
        var tr = s.trigger;
        return { id: s.vars.id || '', trigger: tr ? (tr.id ? '#' + tr.id : String(tr.className).slice(0, 32)) : '', start: Math.round(s.start), end: Math.round(s.end), pin: !!s.pin };
      }));
      console.table(registry.map(function (m) { return { name: m.name, order: m.order, status: m.status, ms: +m.ms.toFixed(1) }; }));
    }
    APP.ready = true;
    bus.emit('app:ready', {});
    runPreloader();
  }

  if (doc.readyState === 'complete') setTimeout(boot, 0);
  else {
    doc.addEventListener('DOMContentLoaded', boot);
    win.addEventListener('load', boot);
  }
})(window, document);
