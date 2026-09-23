# Lift the Lid: MacBook Pro 14-inch with M5 (concept site)

A one-page, scroll-driven concept site for the 14-inch MacBook Pro with M5. Everything on the page is rendered in code: a photoreal WebGL laptop, an exploded WebGL chip package that hands off to a 2D die floorplan, and canvas scenes for the display, battery and enclosure chapters. There are no photographs, no video and no Apple artwork.

Concept site. Not affiliated with Apple Inc.

## Open it

No build step and no install.

- **Double-click `index.html`.** All local scripts are classic scripts, so the page also runs from `file://`.
- **Or serve the folder** (recommended, since some browsers restrict `file://`):

  ```sh
  cd MacBook-M5-Website
  python3 -m http.server 8000
  # then open http://localhost:8000/
  ```

You need a network connection the first time, because the libraries load from jsDelivr. If three.js cannot load, the page still scrolls and animates, and a static SVG laptop replaces the 3D stage. With JavaScript off, the page reads as a plain document.

## Structure

```
index.html          Markup, copy, <head> meta, CDN tags, importmap and the three.js shim
css/tokens.css      Design tokens (colour, type scale, space, radii, motion, z-index)
css/base.css        Reset, type, shared components (.seg .toggle .btn .swatch),
                    preloader, nav, cursor, grain, WebGL stage, footer, focus, reduced motion
css/sections.css    One block per section, in page order, with the 768 / 1280 / 1920 behaviour
js/core.js          window.APP: boot, Lenis + ScrollTrigger wiring, preloader, nav, cursor, event bus
js/macbook.js       window.MacScene: the laptop (hero, finish picker, finale)
js/chip.js          window.ChipScene: the exploded package and the die floorplan zoom
js/sections.js      Brief, proof bars, display zones, spec rail, battery day, enclosure knockout
assets/favicon.svg  Die-grid favicon
assets/og.svg       1200 x 630 social card
SPEC.md             The build contract: copy, tokens, DOM hooks and module APIs
```

The sections, in order: `#hero`, `#brief`, `#chip`, `#proof`, `#display`, `#rail`, `#battery`, `#material`, `#finish`, `#finale`.

### How the pieces fit

- A fixed WebGL stage (`.mac-stage`) sits under every section. The transparent sections (hero, enclosure, finish, finale) let it show through.
- Each module registers an init with `APP.register(name, init, { order })`. Core runs the inits in DOM order after fonts are ready, so every ScrollTrigger and pin is created synchronously and in page order.
- Timelines tween plain state objects (`MacScene.state`, `ChipScene.state`). The render loops only read that state, so scrolling works before WebGL arrives, or without it.
- Before JavaScript runs, an inline script puts `.js` on `<html>`. Hidden starting states are gated behind that class, so the content stays readable if scripts fail.
- Reduced motion (`prefers-reduced-motion`) turns off Lenis and every pin, and each pinned chapter shows a still frame instead.

## Facts and copy

Every number on the page comes from Apple's published specifications and Newsroom releases (October 2025 and March 2026). Each multiplier keeps its "up to" and its comparison baseline. The chip model, die floorplan, dimming-zone grid and particle rates are illustrations, not measurements, and the page labels them that way.

## Credits

- [GSAP 3.13](https://gsap.com/) with ScrollTrigger and SplitText, by GreenSock
- [Lenis 1.3](https://github.com/darkroomengineering/lenis) smooth scroll, by darkroom.engineering
- [three.js r170](https://threejs.org/) with RoomEnvironment, RoundedBoxGeometry, RectAreaLightUniformsLib and BufferGeometryUtils
- All libraries are served by [jsDelivr](https://www.jsdelivr.com/).
- Type is the visitor's system font (SF Pro on Apple devices), so the page makes no web-font requests.

MacBook Pro, Apple M5, Liquid Retina XDR, ProMotion and MagSafe are trademarks of Apple Inc. This project is an independent design study.
