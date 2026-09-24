# Lift the Lid: MacBook Pro 14-inch with M5 (concept site)

A one-page, scroll-driven concept site for the 14-inch MacBook Pro with M5. Everything on the page is rendered from code: the hero film and the finish turntables are path-traced in Blender (Cycles) from a procedural Python scene and scrubbed frame by frame, and the rest is real time in the browser: a photoreal WebGL laptop, an exploded WebGL chip package that hands off to a 2D die floorplan, and canvas scenes for the display, battery and enclosure chapters. There are no photographs, no video files and no Apple artwork.

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
js/sequence.js      APP.sequence: scrubs pre-rendered image sequences on a 2D canvas (progressive loading)
js/render-kit.js    window.RenderKit: HDR lightformer studio, post pipeline, contact shadow
js/materials.js     RenderKit.materials: the tuned material library
js/macbook.js       window.MacScene: the laptop (hero, finish picker, finale)
js/chip.js          window.ChipScene: the exploded package and the die floorplan zoom
js/sections.js      Brief, proof bars, display zones, spec rail, battery day, enclosure knockout
assets/seq/         Blender/Cycles frames (WebP) + one manifest.js per shot: hero (150 frames, 2560, 1920 and 960,
                    plus camera.js), hero_portrait (120 frames, 1080 x 2340 and 720 x 1560, plus camera.js),
                    turntable_space_black and turntable_silver (72 frames each, 1600 and 800)
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

### The Blender frames

- **Hero film** (`#hero`). The hero pin was re-rendered in Cycles, frame for frame on the same camera path. A 2D canvas shows the frame that matches the scroll, so the headline, the film bars and the light sweep on the title run exactly as before. The film's last frame is the moment the display fills the screen: there it dissolves into the real-time dive, which sits in the same pose, so the handoff is invisible. While the film covers the stage, the WebGL laptop stops rendering. Hold to peek plays the film's own lid-lift frames.
  - Two films, picked by window shape: `hero` (16:9, 2560/1920/960) from 1.25:1 up, and `hero_portrait` (1080 x 2340, rendered with the stage's phone framing) below 1:1. Between the two, the real-time hero plays. The 2560 frames load once the canvas is wider than 1920 device pixels.
  - The landscape film is denser at the end (frames 1-89 are timeline frames 1-89, then 90, 90.5 ... 120), so each end frame zooms only ~1.9%. `camera.js` gives each film frame its timeline frame (`src`) and relative zoom (`k`). The page looks the frame up from `src` and scales the canvas by k(target) / k(drawn) about the look-at point, so the film never lags the continuous 3D camera by a fraction of a frame.
  - While a hero film is on, the 3D stage frames itself for the film's aspect ratio and then crops the way the film's cover fit does (it narrows its vertical field of view on windows wider than the film). Film and 3D therefore line up at any window shape: checked at 1920 x 960, 1920 x 800, 2560 x 1080, 1440 x 900, 1024 x 768, 768 x 1024 and 390 x 844.
- **Finish turntables** (`#finish`). Two 72-frame, 360-degree turntables (5 degrees a frame), one per finish, placed over the real-time laptop by projecting both cameras. Drag or use the arrow keys to turn it. The swatches dissolve between the two films together with the stage colour. Closing the lid hands back to the real-time laptop, which animates it, and the film returns when the lid opens. Each turntable is flattened over the colour it is always shown on (Space Black on black, Silver on paper), which makes the frames about a third of the size of a transparent film.
- **Weight.** A desktop visit loads one hero film size up front: 1920 (4.1 MB) or, on 2x laptop screens, 2560 (5.8 MB). Phones load the 720 x 1560 portrait film (1.8 MB). The turntables load only as `#finish` approaches: Space Black in full (1.7 MB at 1600, 0.7 MB at 800), and Silver as its poster and every 8th frame (about 0.2 MB) until its swatch is hovered, focused or picked (then 1.9 MB at 1600). Reduced motion loads just the one still it shows. Frames are plain `<img>` draws on a 2D canvas, so they work from `file://` as well.
- **Fallbacks.** Without WebGL the film plays the whole hero, including a 2D push into the display, and the turntables still turn. The lid toggle is disabled there, because closing the lid needs the real-time model. Under reduced motion the hero shows one Cycles still (lid open, display on) and the finish shows the turntable at rest.
- **Re-rendering.** The scene is `scripts/blender/examples/macbook_pro_14.py` in the swaysalyedweb skill. Render with `scripts/blender/render_shot.py` (Blender 5.2, Cycles on Metal), then encode with `scripts/encode_sequence.sh <frames> assets/seq <shot> 2560,1920,960 85` (`hero_portrait`: `1080,720`). Every set is dithered by 2 levels before WebP. The scene also writes each hero's `camera.js` (`export_hero_camera`); re-export it whenever the frames change, because the page reads `src` and `k` from it. The turntables use the Neutral view transform for both finishes, are flattened first (Space Black over #060607, Silver over #F2F1EE) and are encoded at `1600,800` with `POSTER=11`.

## Facts and copy

Every number on the page comes from Apple's published specifications and Newsroom releases (October 2025 and March 2026). Each multiplier keeps its "up to" and its comparison baseline. The chip model, die floorplan, dimming-zone grid and particle rates are illustrations, not measurements, and the page labels them that way.

## Credits

- [GSAP 3.13](https://gsap.com/) with ScrollTrigger and SplitText, by GreenSock
- [Lenis 1.3](https://github.com/darkroomengineering/lenis) smooth scroll, by darkroom.engineering
- [three.js r170](https://threejs.org/) with RoomEnvironment, RoundedBoxGeometry, RectAreaLightUniformsLib and BufferGeometryUtils
- Hero film and finish turntables rendered in [Blender](https://www.blender.org/) 5.2 with Cycles (Metal GPU, OpenImageDenoise), from a procedural Python scene, and encoded to WebP with OpenImageIO and libwebp
- All libraries are served by [jsDelivr](https://www.jsdelivr.com/).
- Type is the visitor's system font (SF Pro on Apple devices), so the page makes no web-font requests.

MacBook Pro, Apple M5, Liquid Retina XDR, ProMotion and MagSafe are trademarks of Apple Inc. This project is an independent design study.
