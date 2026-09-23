# SPEC-FAST: "Lift the Lid" (MacBook Pro 14-inch with M5 concept site)

## 1. Brief and facts

- **Spine.** One camera move. The page opens on a closed photoreal lid in a black studio, the lid opens, and the camera dives through the screen. From there it drops into the M5 package, which splits into layers, and on into a single Neural Accelerator. It comes back out at normal scale, and at the end the lid closes over the credits.
- **Centrepiece.** `#chip`, an exploded WebGL package followed by a 2D die floorplan zoom that runs from ×1 to ×24.
- **Between set pieces.** Editorial kinetic type: a word-by-word statement, a horizontal numeral rail, and a zoom through the counter of "100%".
- **Rules.** Everything is rendered in code: no photographs, no video, no Apple logo, no Apple artwork. US English on the page.
- **Footer (verbatim):** "Concept site. Not affiliated with Apple Inc."

**Source keys**

| Key | URL |
|---|---|
| M | apple.com/newsroom/2025/10/apple-unveils-new-14-inch-macbook-pro-powered-by-the-m5-chip/ |
| C | apple.com/newsroom/2025/10/apple-unleashes-m5-the-next-big-leap-in-ai-performance-for-apple-silicon/ |
| P | apple.com/newsroom/2026/03/apple-introduces-macbook-pro-with-all-new-m5-pro-and-m5-max/ |
| S | apple.com/macbook-pro/specs/ |
| T | support.apple.com/en-us/125405 |

**Allowed numbers.** These are the only numbers the page may show.

| On page | Verified wording | Src |
|---|---|---|
| 14-inch / 14.2-inch Liquid Retina XDR | "14.2-inch (diagonal) Liquid Retina XDR display" | S |
| 3024 × 1964, 254 ppi | "3024-by-1964 … 254 pixels per inch" | S |
| 1000 nits sustained, 1600 nits peak | "1000 nits sustained full-screen, 1600 nits peak (HDR content only)" | S |
| 1,000,000:1 | "1,000,000:1 contrast ratio" | S |
| up to 120Hz | "adaptive refresh rates up to 120Hz" | T |
| nano-texture option | "Configurable with: Nano-texture display" | S |
| 3-nanometer, third generation | "third-generation 3-nanometer technology" | C |
| 10-core CPU: 4 super, 6 efficiency | "10-core CPU with 4 super cores and 6 efficiency cores" | S, T |
| 10-core GPU, a Neural Accelerator in each | "a dedicated Neural Accelerator in each core" | C |
| over 4x peak GPU compute vs M4 | "over 4x peak GPU compute compared to M4" | C |
| up to 45 percent (ray tracing) | "third-generation ray-tracing engine … up to a 45 percent graphics uplift in apps using ray tracing" | C |
| 16-core Neural Engine | "16-core Neural Engine" | C |
| 153GB/s, nearly 30 percent over M4 | "153GB/s … nearly 30 percent increase over M4" | C |
| 16 / 24 / 32GB | max "32GB" | C, S |
| up to 3.5x AI, up to 1.6x graphics | "than the previous generation" | M |
| vs M1: 6x AI, 6.8x GPU with ray tracing, 2x CPU | all "up to" | M |
| vs Intel: 86x AI, 30x GPU with ray tracing, 5.5x CPU | all "up to" | M |
| up to 24 h video, up to 16 h web, 72.4Wh | specs | S |
| up to 50 percent in 30 minutes, 96W or higher | M | M |
| 1TB standard, from $1,699 (U.S.) | "standard with 1TB … starting at $1,699 (U.S.)" | P |
| up to 4TB; SSD "faster than the previous generation" (no multiplier) | M | M, S |
| 3 Thunderbolt 4, HDMI, SDXC, MagSafe 3, 3.5 mm jack; up to two external displays | specs, M | S, M |
| 12MP Center Stage with Desk View | S | S |
| six speakers, force-cancelling woofers, Spatial Audio, Dolby Atmos, three-mic array | S | S |
| Wi-Fi 6E, Bluetooth 5.3 | S | S |
| 31.26 × 22.12 × 1.55 cm, 1.55 kg | S | S |
| Space Black, Silver | S | S |
| 100 percent recycled aluminum in the enclosure; 45 percent recycled content by weight | M | M |

**Footnotes (verbatim)**
- Performance: "Testing conducted by Apple in September 2025 using preproduction 14-inch MacBook Pro systems with Apple M5. Figures as published by Apple, October 2025."
- Battery: "Battery life varies by use and configuration."

**Banned from the page:**
- multithreaded percentages (the sources conflict)
- "2x SSD"
- "world's fastest core"
- any M4 bandwidth number, HDMI 8K, 40Gb/s
- anything about M6

**Decorative numbers, not claims:** preloader 000–100, battery clock hours, the ×zoom readout, "Core 7 of 10", the section index.

## 2. Tokens (`css/tokens.css`, complete)

```css
:root{
  /* COLOUR: anodized Space Black/Silver as lit in studio; display white reserved for emitted light; silicon darks for #chip. */
  --void:#060607;          /* page black, lifted off #000 so #display's true black reads deeper */
  --black:#000;            /* #display only (LEDs off) */
  --space-black:#2C2B2E; --space-shade:#161517; --space-edge:#48474B;
  --silver:#DCDDDF; --silver-shade:#A6A8AB;
  --paper:#F2F1EE;         /* Silver in daylight; never pure white */
  --graphite:#1C1C1E;      /* #rail */
  --die:#0B0D10; --die-line:#1E232A;
  --copper:#B8743F; --teal:#2F6F6A;   /* canvas-only die sheen, alpha <= .18, never UI */
  --display:#FFFFFF;       /* emitted light only */
  --text-dark:#F5F5F7; --muted-dark:#A1A1A6;   /* on dark */
  --text-light:#1D1D1F; --muted-light:#6E6E73; /* on paper (AA) */
  --hair-dark:rgb(236 238 242 / .16); --hair-light:rgb(29 29 31 / .18);
  /* ACCENT: wafer amber = MagSafe LED. Only 6 uses: NA MAC wave, #proof M5 bars, active chip stop,
     nav progress hairline, focus ring, battery level <10%. No gradients with it. No indigo/violet anywhere. */
  --accent:#F2A33A; --accent-glow:rgb(242 163 58 / .35);
  --focus:0 0 0 2px var(--void),0 0 0 4px var(--accent);

  /* TYPE: the visitor's own SF, so no font requests and no FOUT. Two tiers: major-third 1.25 text (from 17px), golden 1.618 display. */
  --font-display:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;
  --font-text:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;
  --font-mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --step--2:clamp(.6875rem,.67rem + .08vw,.75rem);   /* 11–12 mono labels, uppercase */
  --step--1:clamp(.8125rem,.79rem + .1vw,.875rem);   /* 13–14 captions */
  --step-0:clamp(1rem,.97rem + .15vw,1.0625rem);     /* 16–17 body */
  --step-1:clamp(1.25rem,1.2rem + .2vw,1.328rem);    /* 20–21 sub */
  --step-2:clamp(1.5rem,1.4rem + .45vw,1.66rem);     /* 24–26.5 lead */
  --step-3:clamp(1.875rem,1.7rem + .8vw,2.075rem);   /* 30–33 #brief statement */
  --display-1:clamp(2.5rem,1.6rem + 4vw,5rem);       /* 40–80 section H2 */
  --display-2:clamp(3.5rem,1.8rem + 7vw,6.75rem);    /* 56–108 hero H1 */
  --display-3:clamp(4.5rem,1rem + 11vw,10.9rem);     /* 72–175 finish name */
  --display-4:clamp(6rem,16vw,17.7rem);              /* 96–283 rail numerals */
  --lh-display:.95; --lh-tight:1.1; --lh-body:1.47;
  --track-display:-.025em; --track-mega:-.045em; --track-mono:.08em;
  --w-display:600; --w-mega:700; --w-body:400;

  /* SPACE: 4px base; dense sections 48–72, airy 112+. */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px;
  --space-6:32px; --space-7:48px; --space-8:72px; --space-9:112px; --space-10:168px;
  --gutter:clamp(16px,4vw,64px);
  --pad-airy:clamp(112px,18vh,200px); --pad-dense:clamp(48px,8vh,72px);
  --measure:34ch; --measure-wide:60ch; --nav-h:48px;

  /* RADII: only where the product has one. 0 for film frames/charts, 12 = display corner, pill = toggles/swatches/CTA. */
  --r-0:0; --r-tag:3px; --r-control:8px; --r-screen:12px; --r-pill:999px;

  /* MOTION: expo-out reveals, power3.inOut for state/camera, hovers never snap. */
  --ease-reveal:cubic-bezier(.16,1,.3,1);   /* gsap 'expo.out' */
  --ease-state:cubic-bezier(.65,0,.35,1);   /* gsap 'power3.inOut' */
  --ease-hover:cubic-bezier(.25,.9,.3,1);
  --dur-press:120ms; --dur-hover:280ms; --dur-state:480ms; --dur-sweep:700ms; --dur-reveal:900ms; --dur-flight:1200ms;

  /* Z: fixed WebGL stage under all content; overlays above. */
  --z-stage:0; --z-section:1; --z-section-ui:5; --z-grain:50; --z-nav:100; --z-cursor:200; --z-preloader:300; --z-skip:400;
}
```

**Scrub values:**
- Camera timelines: `scrub:1`
- Chip, display and battery: `scrub:.8`
- Type and rail: `scrub:.6`

**Lenis:** `{lerp:.09, wheelMultiplier:.9, autoRaf:false}`

## 3. Architecture

Files, with an owner for each:

| File | Owner | Contents |
|---|---|---|
| `index.html` | E5 | Markup |
| `css/tokens.css` | E5 | Tokens (§2) |
| `css/base.css` | E5 | Reset, type, `.eyebrow`/`.mono`/`.caption`/`.seg`/`.toggle`/`.btn`/`.swatch`, plus preloader, nav, cursor, grain, stage and footer |
| `css/sections.css` | E5 | Every section, one banner comment per section |
| `assets/favicon.svg`, `assets/og.svg` | E5 | Icons |
| `js/core.js` | E1 | App core |
| `js/macbook.js` | E2 | Laptop scene |
| `js/chip.js` | E3 | Chip scene |
| `js/sections.js` | E4 | Brief, proof, display, rail, battery, material |

JS never writes CSS text. It only sets the classes, attributes and CSS variables listed in §5.

**`<head>`, in this order:**
```html
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MacBook Pro with M5 · Concept</title>
<meta name="description" content="A concept site for the 14-inch MacBook Pro with M5, rendered entirely in code.">
<meta name="theme-color" content="#060607">
<meta property="og:title" content="Lift the lid on M5"><meta property="og:image" content="assets/og.svg">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lenis@1.3.4/dist/lenis.css">
<link rel="stylesheet" href="css/tokens.css"><link rel="stylesheet" href="css/base.css"><link rel="stylesheet" href="css/sections.css">
<script>document.documentElement.className='js';</script>
<script type="importmap">{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<script type="module" async>
  import * as THREE from 'three';
  import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
  import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
  import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
  import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
  window.THREE = THREE;
  window.THREE_ADDONS = { RoomEnvironment, RoundedBoxGeometry, RectAreaLightUniformsLib, mergeGeometries };
  window.dispatchEvent(new Event('three:ready'));
</script>
```
The shim is `async` so that a 1.2MB module never blocks the deferred scripts.

**End of `<body>`, in this order:**
```html
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/lenis@1.3.4/dist/lenis.min.js"></script>
<script defer src="js/core.js"></script>
<script defer src="js/macbook.js"></script>
<script defer src="js/chip.js"></script>
<script defer src="js/sections.js"></script>
```

**Boot sequence (core.js):**
1. At the top level, core.js defines `window.APP` synchronously, so later scripts can call `APP.register` at their own top level.
2. On `DOMContentLoaded`:
   1. Set `history.scrollRestoration='manual'` and scroll to the top.
   2. `gsap.registerPlugin(ScrollTrigger, SplitText)`.
   3. `ScrollTrigger.config({ignoreMobileResize:true})`.
   4. Create Lenis unless reduced motion is on, then `lenis.stop()`.
   5. Wire Lenis to GSAP: `lenis.on('scroll',ScrollTrigger.update)`, `gsap.ticker.add(t=>lenis.raf(t*1000))`, `gsap.ticker.lagSmoothing(0)`.
   6. Wait for `document.fonts.ready`.
   7. Run the registered inits sorted by `order`. The orders match DOM order. Each init runs in a `try/catch` and logs its own errors.
   8. `ScrollTrigger.refresh()`.
   9. Emit `app:ready` and start the preloader.

**Init rules:**
- An init creates all of its ScrollTriggers synchronously.
- It may target only its own section, or a section earlier in the DOM.
- Pins use `end: APP.pinEnd(k)` and `invalidateOnRefresh:true`.
- Timelines tween plain state objects (`MacScene.state`, `ChipScene.state`), never THREE objects. The THREE code arrives later through `APP.whenThree()` and only reads that state each frame. So scroll works before, or entirely without, WebGL.

## 4. Sections

The copy is final and appears verbatim in §5. Timeline ranges are fractions of each section's own ScrollTrigger progress.

| # | id | Owner | Order | Surface | Pin (desktop / ≤768) | Scrub |
|---|---|---|---|---|---|---|
| 01 | hero | macbook.js | 10 | transparent over stage (void) | 4.0 / 2.6 | 1 |
| 02 | brief | sections.js | 20 | void | none | .6 (words) |
| 03 | chip | chip.js | 30 | die | 7.0 / 4.2 | .8 |
| 04 | proof | sections.js | 40 | paper | none | none |
| 05 | display | sections.js | 50 | black | 2.0 / 1.2 | .8 |
| 06 | rail | sections.js | 60 | graphite | horizontal (track − vw) / none, stacked | .6 |
| 07 | battery | sections.js | 70 | sky canvas | 1.5 / .9 | .8 |
| 08 | material | sections.js | 80 | transparent | 2.0 / 1.2 | 1 |
| 09 | finish | macbook.js | 90 | transparent; stage bg follows finish | 1.5 / .9 | 1 |
| 10 | finale | macbook.js | 100 | transparent | 1.5 / .9 | 1 |

`APP.pinEnd(k)` returns `() => '+=' + innerHeight*k*(isMobile?0.6:1)`. The ≤768 column already includes that factor.

**Global reduced-motion rules** (`APP.reducedMotion`, which also adds `html.is-reduced`):
- No Lenis and no pins.
- Each pinned section shows its "RM still", described below.
- Reveals become 200ms opacity fades.
- Scrubbed counters show their final values.

### 01 #hero: product-film opening
**Technique:**
- The fixed WebGL stage sits behind the section.
- The H1 carries a CSS `mask-image` highlight, centred at `--sweep`.
- Letterbox bars slide in and out.

| p | MacScene.state | DOM |
|---|---|---|
| .00–.20 | `sweepX` −50→50, `envRot` −.9→.9; cam = pose A; lid 0 | `.hero__title --sweep` 0%→100%; letterbox `scaleY` 0→1 (48px) |
| .20–.30 | lid 0→10 (`power2.in`, the magnetic release) | title y 0→−8vh and opacity→0; eyebrow y→−14vh (1.3x); sub opacity→0 |
| .30–.55 | lid 10→108 (linear); cam A→B | peek button and cue opacity→0 |
| .55–.75 | `screenOn` 0→1 (`power2.out`); `exposure` .7→1; cam B→C | — |
| .75–.97 | `dive` 0→1 (`power2.in`): camera S+m·45 → S+m·0.6, fov 35→20 | letterbox `scaleY`→0 |
| .94–1.00 | `opacity` 1→0 (stage) | — |

**Interaction:**
- Moving the pointer lerps `tiltX` and `rotY` by up to ±6° and `envRotPointer` by up to ±.35 rad, with λ .06.
- Holding the pointer anywhere in #hero, or on `[data-mac-peek]`, tweens `peek` 0→12 over 480ms (`power3.out`). Release returns it to 0. Peek applies only while `lid`<20.
- Keyboard: holding Space or Enter on the focused peek button does the same; ignore key repeat.
- The hero copy reveals on `preloader:done` with `APP.splitReveal(title,{type:'lines'})`.

**RM still:** lid at 108°, pose B, screen on, no dive.

**≤768:** poses use the fit-distance formula in §7; the peek button stays.

### 02 #brief: kinetic statement
**Technique:**
- `.brief__lead` reveals as masked lines.
- `.brief__statement` uses `SplitText` with `{type:'words', tag:'span'}`. Word opacity goes .12→1, staggered, scrubbed from `top 75%` to `bottom 55%`. This is the only per-word reveal on the site.

**Interaction:**
- Hovering or focusing a `.gloss` button shows its `[data-gloss-note]`. The other notes get `hidden`, and the note fades in over 280ms.
- Keyboard: the gloss buttons are in the Tab order, and Esc hides the note.

**RM / ≤768:** words start fully visible; the notes sit below the statement.

### 03 #chip: the centrepiece (see §8)
**Layers, back to front:**
1. `[data-chip-canvas]` (WebGL)
2. `[data-die-canvas]` (2D)
3. `[data-chip-leaders]` (SVG)
4. `[data-chip-labels]`
5. the copy steps
6. the HUD

| p | WebGL (ChipScene.state) | 2D die | DOM |
|---|---|---|---|
| .00–.10 | `rot` 0→1 (pose P0 top-down → P1 3/4) | hidden | step 0 |
| .10–.30 | `explode` 0→1 | — | step 1; each label and leader draws once its layer is more than 50% separated (a 600ms triggered tween, reversed on scroll back) |
| .30–.42 | `stream` 0→1 | — | step 2; rate control |
| .42–.50 | `explode` 1→0; cam P1→P2; `glOpacity` 1→0 over .47–.50 | `dieOpacity` 0→1 over .47–.50 | labels out |
| .50–.62 | — | `view` 0→1 (full → CPU) | step 3; load control |
| .62–.82 | — | `view` 1→2→3→4 (GPU → core 7 → NA); `wave` 0→1 over .76–.82 | step 4; gpu control; HUD label steps "GPU · 10 cores" → "Core 7 of 10" → "Neural Accelerator" |
| .82–.90 | — | `view` 4→5 (NE) | step 5; NE input |
| .90–1.00 | — | `view` 5→6 (full) | step 6 stats |

Each copy step fades in and out over 0.02 of progress. Active steps get the `is-active` class.

**Interaction:**
- Hovering a die block shows `[data-chip-tip]`.
- Clicking a block calls `ChipScene.goTo(stop)`, which does `APP.scrollTo(st.start + stopP*(st.end - st.start), {duration:1.2})`.
- HUD stop buttons do the same.
- Keyboard: ←/→ move to the previous or next stop while focus is inside #chip. The stop buttons are Tab-able.
- The four controls (`[data-chip-control]`) are visible only while their step is active.

**RM still:** the 2D die at ×1 with all labels, and `[data-chip-stepper]` shown. Prev/Next steps through the stops with 200ms crossfades.

**≤768:**
- Labels collapse into the bottom caption bar and tips appear as a bottom sheet.
- Hover becomes tap.

### 04 #proof: bars drawn to scale
**Technique:**
- Each row has a hairline baseline (1x) and an accent bar whose width is `value / max(set)`.
- When a row crosses `top 70%`, the baseline draws first (400ms), then the bar grows while its numeral counts up. Both use one tween: 900ms, `expo.out`, tabular figures.
- The heading is a `splitReveal` with lines.

**Data (sections.js):**
```js
const PROOF = {
  gen:   [['AI performance',3.5],['Graphics',1.6]],
  m1:    [['AI performance',6],['GPU performance with ray tracing',6.8],['CPU performance',2]],
  intel: [['AI performance',86],['GPU performance with ray tracing',30],['CPU performance',5.5]]
};
```
**Interaction:**
- The `[data-proof-base]` segmented control re-tweens the bars and numerals over 900ms.
- A third row that has no data gets `.is-hidden`, which collapses its height over 480ms.
- `[data-proof-fn]` toggles the footnote (`aria-expanded`), animating its height over 280ms.

**RM / ≤768:** final values. On ≤768 the label goes above the track.

### 05 #display: XDR zones
**Technique:**
- A 2D canvas draws a night scene: gradient #000→#0B0C0E, a horizon silhouette, and a movable light (a radial filament).
- An illustrative 32×18 zone grid sits on top. Each zone's target is `1/(1+k·d²)` from the light. Values update as `max(target, v·exp(-dt/90ms))`, and zones are drawn as 2px-gap squares.

| p | Canvas | DOM |
|---|---|---|
| .00–.30 | zoom s 8→1 (log). While s>3, RGB subpixel stripes fill each pixel cell; they fade out as s→3 | title `clip-path` inset(0 100% 0 0)→inset(0) |
| .30–.60 | frame `--frame-w` 100vw→72vw, `--frame-r` 0→12px; zones opacity 0→1 | readout counts to 3024 / 1964 / 254 |
| .60–1.00 | the light drifts on an arc unless the visitor has dragged it | controls `.is-visible` over .60–.70 |

**Interaction:**
- Drag the light on the canvas.
- Keyboard: arrow keys move the light 4% of the frame when the canvas is focused.
- `[data-display-zones]` toggles the zones.
- The `[data-display-glass]` segmented control switches the reflection band. Glossy is a sharp white band at 25% opacity. Nano-texture is the same band with `ctx.filter='blur(24px)'` at 12%.
- The band slides with the pointer's x.

**RM still:** frame at 72vw with zones on. **≤768:** the frame goes to 92vw and the drag becomes touch drag.

### 06 #rail: kinetic numerals
**Technique:**
- `x: -(track.scrollWidth - innerWidth)`, with `end: '+='` the same distance.
- Per-panel triggers use `containerAnimation`.
- Parallax: `.rail__ghost` moves `xPercent` 30→−30 (reads as 0.5x), numerals move at 1x, and `.rail__cap` moves `x` 8vw→−8vw (1.15x).
- Odometer: `[data-odo]` is built into digit columns of 0–9, with separate spans for "." and units. When a panel's centre crosses the viewport centre, its digits roll from the previous panel's value: 900ms, a 30ms stagger right to left, `expo.out`.

**Interaction:**
- Pointer drag on the viewport calls `APP.scrollTo(lenis.scroll - dx, {immediate:true})`.
- Keyboard: when `[data-rail-viewport]` is focused, ←/→ scroll by one panel.

**RM / ≤768:** no pin, panels stacked vertically, odometers roll when the panel enters (RM shows final values).

### 07 #battery: one charge
**Technique:**
- A sky canvas holds hourly gradient keys:
  - 06: #F2F1EE / #E9B98A
  - 12: #F2F1EE / #DCDDDF
  - 18: #E9B98A / #48474B
  - 00: #161517 / #060607
- A sun disc (display white glow) follows an arc.
- The outlined SVG "24" is clip-filled by a Space Black level with a wave edge.
- 24 hour ticks sit in `[data-battery-hours]`.

| p | Behaviour |
|---|---|
| 0→1 | Clock 06:00→06:00 (+24h). Level = video ? 1−p : max(0, 1−p·24/16). Below 0.1 the level gets `.is-low` (accent). `.is-night` is set for hours 19–05, which flips text to light over 480ms. |

**Interaction:**
- `[data-battery-mode]` crossfades the digits 24↔16 over 480ms. The empty mark glides to hour 24 or 16.
- Hovering the numeral springs the wave amplitude 18→0.
- Dragging on the sky sets the hour with `APP.scrollTo(st.start + p·len, {immediate:true})`.
- Keyboard: ←/→ on the focused sky canvas moves ±1h.

**RM still:** 12:00, video mode. **≤768:** the numeral is 40vh and the ticks drop to every 3h.

### 08 #material: through the zero
**Technique:**
- `[data-knockout-canvas]`, full-bleed at DPR ≤2, is redrawn each scrub frame:
  1. `fillRect(--void)`
  2. `destination-out` `fillText('100%')`, SF Pro weight 800, 70vh tall, centred
  3. The whole thing scales around origin O.
- O is the centre of the second "0", computed as `left + measureText('10').width + measureText('0').width/2` at glyph mid-height.
- The fixed mac stage shows through the letters. macbook.js poses it; see §6.

| p | Plate | Copy |
|---|---|---|
| .00–.15 | s=1 | visible |
| .15–.85 | s = 60^((p−.15)/.7) | opacity→0 over .15–.30 |
| .85–1.00 | canvas opacity→0, then `hidden` | — |

**Interaction:** none. This is a breath.

**RM:** no plate; the copy sits over the void. **≤768:** text 44vw tall, s up to 40.

### 09 #finish: pick a finish
| p | MacScene.state |
|---|---|
| .00–.60 | cam M→F; `rotY` π→.35; lid 0→105; `screenOn` 0→.6 |
| .60–1.00 | hold; the visitor controls it |

**Interaction:**
- Drag on `[data-finish-hit]`:
  - dx×.01 rad goes to `dragY`, clamped ±2.79 rad (±160°), with inertia (velocity ×.92 per frame).
  - dy goes to `dragX`, clamped ±15°.
  - `.is-dragging` is set while dragging.
- Keyboard: ←/→ tween `dragY` by ±15°; ↑/↓ tween `dragX`.
- Swatch clicks call `MacScene.setFinish()`, which:
  - tweens colour, metalness, roughness and clearcoat over 700ms `power3.inOut`
  - flicks `envRot` +.8 rad and back, so a highlight sweeps across the body
  - tweens `--stage-bg` between --void and --paper
  - sets `#finish[data-theme]`
  - re-reveals `[data-finish-name]` by chars (yPercent 100→0, 30ms stagger)
- `[data-mac-lid]` calls `setLid(0|105, {duration:.9})` and swaps its label and `aria-pressed`.

**RM still:** pose F, no auto-turn; drag still works. **≤768:** the name is 18vw and the controls dock to the bottom.

### 10 #finale: lid down
| p | State / DOM |
|---|---|
| .00–.60 | lid →0 (`power2.inOut`); `screenOn`→0; cam F→E |
| .20–1.00 | `[data-finale-roll]` y 30vh→−30vh (0.5x) |
| .60–.90 | `[data-finale-line]` scaleX 0→1: the screen glow narrowed to a hairline |
| .85–1.00 | stage `opacity`→0 |

**Interaction:**
- `[data-scroll-top]` calls `APP.scrollTo(0, {duration:2.2})`.
- The CTA is an external link.

**RM still:** closed lid. **≤768:** the roll is a static list.

## 5. DOM contract (`index.html` body; copy is FINAL)

```html
<a class="skip" href="#main">Skip to content</a>
<div class="preloader" data-preloader aria-hidden="true">
  <i class="preloader__bar preloader__bar--top"></i>
  <div class="preloader__slate"><span class="preloader__title">MacBook Pro · M5</span>
    <span class="preloader__note mono">Rendered in code</span>
    <span class="preloader__count mono" data-preloader-count>000</span></div>
  <i class="preloader__bar preloader__bar--bottom"></i>
</div>
<header class="nav" data-nav>
  <a class="nav__mark" href="#hero">MacBook Pro <b>M5</b></a>
  <nav class="nav__links" aria-label="Chapters">
    <a href="#chip" data-nav-link="chip">Chip</a><a href="#display" data-nav-link="display">Display</a>
    <a href="#battery" data-nav-link="battery">Battery</a><a href="#finish" data-nav-link="finish">Finish</a></nav>
  <span class="nav__index mono" data-nav-index aria-hidden="true">01 / 10 · Lift the lid</span>
  <a class="nav__cta" href="https://www.apple.com/macbook-pro/specs/" target="_blank" rel="noopener">Tech specs ↗</a>
  <i class="nav__progress" data-nav-progress></i>
</header>
<div class="cursor" data-cursor-el aria-hidden="true"><i class="cursor__ring"></i><span class="cursor__label" data-cursor-label></span></div>
<div class="grain" aria-hidden="true"></div>
<div class="mac-stage" data-mac-stage aria-hidden="true">
  <canvas class="mac-stage__canvas" data-mac-canvas></canvas>
  <div class="mac-stage__fallback" data-mac-fallback hidden><!-- E5: inline SVG, open laptop front 3/4, 2 linear gradients, no logo --></div>
</div>

<main id="main">
<section id="hero" class="section hero" data-section="01" data-title="Lift the lid" data-nav-theme="dark" aria-labelledby="hero-title">
  <i class="hero__letterbox hero__letterbox--top" aria-hidden="true"></i>
  <div class="hero__copy">
    <p class="eyebrow hero__eyebrow">MacBook Pro 14-inch · M5</p>
    <h1 id="hero-title" class="hero__title" data-sweep-text>Lift the lid on M5.</h1>
    <p class="hero__sub">Ten GPU cores, each with its own Neural Accelerator. Scroll to open it.</p>
  </div>
  <button class="hero__peek" type="button" data-mac-peek data-cursor="hold">Hold to peek</button>
  <p class="hero__cue mono" aria-hidden="true">Scroll<i class="hero__cue-line"></i></p>
  <i class="hero__letterbox hero__letterbox--bottom" aria-hidden="true"></i>
</section>

<section id="brief" class="section brief" data-section="02" data-title="What changed" data-nav-theme="dark" aria-labelledby="brief-title">
  <p class="eyebrow">What changed</p>
  <h2 id="brief-title" class="brief__lead">The change is inside the graphics.</h2>
  <p class="brief__statement" data-split-words>M5 puts a <button type="button" class="gloss" data-gloss="na">Neural Accelerator</button> in each of its ten GPU cores. They share <button type="button" class="gloss" data-gloss="um">unified memory</button> with the CPU and the <button type="button" class="gloss" data-gloss="ne">Neural Engine</button>, so AI work has more than one place to run.</p>
  <aside class="brief__notes mono" aria-live="polite">
    <p data-gloss-note="na" hidden>Neural Accelerator. Dedicated hardware inside each GPU core. Ten in total on M5.</p>
    <p data-gloss-note="um" hidden>Unified memory. One pool of up to 32GB, read at 153GB/s.</p>
    <p data-gloss-note="ne" hidden>Neural Engine. A separate 16-core block on the same die.</p>
  </aside>
</section>

<section id="chip" class="section chip" data-section="03" data-title="The chip" data-nav-theme="dark" aria-labelledby="chip-title">
  <div class="chip__stage">
    <canvas class="chip__gl" data-chip-canvas aria-hidden="true"></canvas>
    <canvas class="chip__die" data-die-canvas tabindex="-1" role="img" aria-label="Illustrative floorplan of the M5 die showing CPU, GPU, Neural Engine and memory interface."></canvas>
    <svg class="chip__leaders" data-chip-leaders aria-hidden="true"></svg>
    <div class="chip__labels mono" data-chip-labels aria-hidden="true">
      <span class="chip__label" data-chip-label="tim">Thermal interface</span>
      <span class="chip__label" data-chip-label="die">M5 die</span>
      <span class="chip__label" data-chip-label="mem">Unified memory</span>
      <span class="chip__label" data-chip-label="sub">Package substrate</span>
      <span class="chip__label" data-chip-label="bga">Ball grid array</span>
    </div>
    <div class="chip__tip" data-chip-tip role="status" hidden><strong data-chip-tip-title></strong><span data-chip-tip-body></span></div>
  </div>
  <div class="chip__copy">
    <article class="chip__step" data-chip-step="0"><p class="eyebrow">Fig. 1 · M5, exploded</p><h2 id="chip-title">Take the chip apart.</h2><p>Keep scrolling. The package separates layer by layer, then the camera drops into the die.</p></article>
    <article class="chip__step" data-chip-step="1"><p class="eyebrow">Process</p><h2>Third-generation 3-nanometer technology.</h2><p>One die holds every processor on this page. Unified memory sits right beside it.</p></article>
    <article class="chip__step" data-chip-step="2"><p class="eyebrow">Unified memory</p><h2>153GB/s of memory bandwidth.</h2><p>Nearly 30 percent more than M4, shared by the CPU, GPU and Neural Engine. Configure up to 32GB.</p><p class="caption">Particle rate scaled to Apple's "nearly 30 percent." Illustrative.</p></article>
    <article class="chip__step" data-chip-step="3"><p class="eyebrow">CPU</p><h2>Ten cores: 4 super, 6 efficiency.</h2><p>Apple now calls its performance cores super cores. Switch the load to see which cluster picks up the work.</p></article>
    <article class="chip__step" data-chip-step="4"><p class="eyebrow">GPU</p><h2>A Neural Accelerator in every GPU core.</h2><p>Ten cores, ten accelerators. Over 4x the peak GPU compute of M4, plus a third-generation ray-tracing engine with up to a 45 percent graphics uplift in apps that use ray tracing.</p></article>
    <article class="chip__step" data-chip-step="5"><p class="eyebrow">Neural Engine</p><h2>The 16-core Neural Engine is still here.</h2><p>So on-device models have two places to run: the accelerators inside the GPU, and this.</p></article>
    <article class="chip__step" data-chip-step="6"><p class="eyebrow">M5</p><h2>That is the whole chip.</h2>
      <ul class="chip__stats mono"><li>10-core CPU</li><li>10-core GPU</li><li>16-core Neural Engine</li><li>Up to 32GB unified memory</li></ul></article>
  </div>
  <div class="chip__controls">
    <div class="seg" role="group" aria-label="Memory rate" data-chip-control="rate"><button type="button" data-value="m4" aria-pressed="false">M4</button><button type="button" data-value="m5" aria-pressed="true">M5</button></div>
    <div class="seg" role="group" aria-label="CPU load" data-chip-control="load"><button type="button" data-value="light" aria-pressed="true">Light load</button><button type="button" data-value="heavy" aria-pressed="false">Heavy load</button></div>
    <div class="seg" role="group" aria-label="GPU work" data-chip-control="gpu"><button type="button" data-value="graphics" aria-pressed="false">Graphics</button><button type="button" data-value="ai" aria-pressed="true">AI</button></div>
    <label class="chip__type" data-chip-control="ne"><span class="mono">Type to send work to the Neural Engine</span><input type="text" data-chip-ne-input maxlength="40" autocomplete="off" placeholder="Type anything"></label>
  </div>
  <div class="chip__hud mono">
    <span class="chip__hud-label" data-chip-hud-label>Package</span><span class="chip__zoom" data-chip-zoom>×1.0</span>
    <ol class="chip__stops" data-chip-stops>
      <li><button type="button" data-stop="0">Package</button></li><li><button type="button" data-stop="1">CPU</button></li>
      <li><button type="button" data-stop="2">GPU</button></li><li><button type="button" data-stop="3">Core 7</button></li>
      <li><button type="button" data-stop="4">Neural Accelerator</button></li><li><button type="button" data-stop="5">Neural Engine</button></li>
      <li><button type="button" data-stop="6">Whole die</button></li></ol>
    <p class="caption">Illustrative model and floorplan. Not a die photograph.</p>
  </div>
  <div class="chip__stepper" data-chip-stepper hidden><button type="button" data-chip-prev>Previous</button><button type="button" data-chip-next>Next</button></div>
</section>

<section id="proof" class="section proof" data-section="04" data-title="Performance" data-nav-theme="light" aria-labelledby="proof-title">
  <header class="proof__head"><p class="eyebrow">Apple's published figures</p>
    <h2 id="proof-title" class="proof__title">Drawn to scale.</h2>
    <p class="proof__sub">Apple's published multipliers for MacBook Pro 14-inch with M5. Each bar is exactly as long as its number. Pick a baseline.</p>
    <div class="seg" role="group" aria-label="Baseline" data-proof-base>
      <button type="button" data-value="gen" aria-pressed="true">Previous generation</button><button type="button" data-value="m1" aria-pressed="false">M1</button><button type="button" data-value="intel" aria-pressed="false">Intel-based</button></div></header>
  <ol class="proof__rows" data-proof-rows>
    <!-- ×3, index 0..2; sections.js fills label/num from PROOF -->
    <li class="proof__row" data-proof-row="0"><span class="proof__label" data-proof-label>AI performance</span>
      <span class="proof__value">Up to <b data-proof-num>3.5</b>x</span>
      <span class="proof__track"><i class="proof__base"></i><i class="proof__bar" data-proof-bar></i></span>
      <button type="button" class="proof__fn" data-proof-fn aria-expanded="false" aria-label="Test conditions">¹</button>
      <p class="proof__note caption" hidden>Testing conducted by Apple in September 2025 using preproduction 14-inch MacBook Pro systems with Apple M5. Figures as published by Apple, October 2025.</p></li>
  </ol>
  <p class="proof__foot caption">"Previous generation" is MacBook Pro 14-inch with M4. All figures are "up to."</p>
</section>

<section id="display" class="section display" data-section="05" data-title="Display" data-nav-theme="dark" aria-labelledby="display-title">
  <div class="display__frame" data-display-frame>
    <canvas class="display__canvas" data-display-canvas tabindex="0" data-cursor="drag" role="img" aria-label="Illustrative night scene with a movable light. Use the arrow keys to move the light."></canvas></div>
  <div class="display__copy"><p class="eyebrow">Liquid Retina XDR</p>
    <h2 id="display-title" data-display-title>1600 nits, only where the picture asks for it.</h2>
    <p>The 14.2-inch display holds 1000 nits sustained full-screen and reaches 1600 nits peak for HDR content, with a 1,000,000:1 contrast ratio. ProMotion refreshes at up to 120Hz.</p></div>
  <div class="display__controls">
    <button type="button" class="toggle" data-display-zones aria-pressed="true">Show dimming zones</button>
    <div class="seg" role="group" aria-label="Glass" data-display-glass><button type="button" data-value="std" aria-pressed="true">Standard glass</button><button type="button" data-value="nano" aria-pressed="false">Nano-texture</button></div></div>
  <p class="display__readout mono" data-display-readout><span data-count="3024">0</span> × <span data-count="1964">0</span> · <span data-count="254">0</span> ppi</p>
  <p class="caption display__caption">Zone grid is illustrative. Nano-texture is a configurable option.</p>
</section>

<section id="rail" class="section rail" data-section="06" data-title="Around the chip" data-nav-theme="dark" aria-labelledby="rail-title">
  <header class="rail__head"><p class="eyebrow">Around the chip</p><h2 id="rail-title">The machine around M5.</h2>
    <p>Five numbers from the spec sheet. Drag the rail or keep scrolling.</p></header>
  <div class="rail__viewport" data-rail-viewport tabindex="0" data-cursor="drag" aria-label="Specification rail">
    <ol class="rail__track" data-rail-track>
      <li class="rail__panel"><span class="rail__ghost" aria-hidden="true">Storage</span><p class="rail__num"><span data-odo="1">1</span><span class="rail__unit">TB</span></p><p class="rail__label mono">Storage, standard</p><p class="rail__cap">Configurable up to 4TB, with faster SSD performance than the previous generation.</p></li>
      <li class="rail__panel"><span class="rail__ghost" aria-hidden="true">Ports</span><p class="rail__num"><span data-odo="3">3</span><span class="rail__unit">Thunderbolt 4</span></p><p class="rail__label mono">Ports</p><p class="rail__cap">Plus HDMI, an SDXC card slot, MagSafe 3 and a headphone jack. Up to two high-resolution external displays.</p></li>
      <li class="rail__panel"><span class="rail__ghost" aria-hidden="true">Camera</span><p class="rail__num"><span data-odo="12">12</span><span class="rail__unit">MP</span></p><p class="rail__label mono">Center Stage camera</p><p class="rail__cap">With support for Desk View.</p></li>
      <li class="rail__panel"><span class="rail__ghost" aria-hidden="true">Sound</span><p class="rail__num"><span data-odo="6">6</span><span class="rail__unit">speakers</span></p><p class="rail__label mono">Sound system</p><p class="rail__cap">Force-cancelling woofers, with Spatial Audio and Dolby Atmos.</p></li>
      <li class="rail__panel"><span class="rail__ghost" aria-hidden="true">Weight</span><p class="rail__num"><span data-odo="1.55">1.55</span><span class="rail__unit">kg</span></p><p class="rail__label mono">Weight</p><p class="rail__cap">31.26 × 22.12 × 1.55 cm, in Space Black or Silver.</p></li>
    </ol></div>
</section>

<section id="battery" class="section battery" data-section="07" data-title="Battery" data-nav-theme="light" aria-labelledby="battery-title">
  <canvas class="battery__sky" data-battery-sky tabindex="0" data-cursor="drag" aria-label="Time of day. Use the arrow keys to change the hour."></canvas>
  <div class="battery__copy"><p class="eyebrow">Battery</p><h2 id="battery-title">Up to 24 hours on one charge.</h2>
    <p>That is the video-streaming figure. Wireless web runs up to 16 hours. Plug in a 96W or higher USB-C adapter and it charges up to 50 percent in 30 minutes.</p></div>
  <svg class="battery__numeral" data-battery-numeral viewBox="0 0 1000 600" role="img" aria-label="24 hours">
    <defs><clipPath id="battery-clip"><text data-battery-digits x="500" y="520" text-anchor="middle">24</text></clipPath></defs>
    <g clip-path="url(#battery-clip)"><rect data-battery-level x="0" y="0" width="1000" height="600"/><path data-battery-wave/></g>
    <text class="battery__outline" data-battery-outline x="500" y="520" text-anchor="middle">24</text></svg>
  <div class="battery__hours mono" data-battery-hours aria-hidden="true"></div>
  <p class="battery__clock mono" data-battery-clock aria-live="off">06:00</p>
  <div class="seg" role="group" aria-label="Workload" data-battery-mode><button type="button" data-value="video" aria-pressed="true">Video streaming</button><button type="button" data-value="web" aria-pressed="false">Wireless web</button></div>
  <p class="caption">Battery life varies by use and configuration.</p>
</section>

<section id="material" class="section material" data-section="08" data-title="Enclosure" data-nav-theme="dark" aria-labelledby="material-title">
  <canvas class="material__plate" data-knockout-canvas aria-hidden="true"></canvas>
  <div class="material__copy"><p class="eyebrow">Enclosure</p><h2 id="material-title">The enclosure is 100 percent recycled aluminum.</h2>
    <p>Across the whole machine, 45 percent of the content by weight is recycled. Keep scrolling to go through the zero.</p></div>
</section>

<section id="finish" class="section finish" data-section="09" data-title="Finish" data-theme="space-black" data-nav-theme="dark" aria-labelledby="finish-title">
  <p class="finish__name" data-finish-name aria-hidden="true">Space Black</p>
  <div class="finish__copy"><p class="eyebrow">Finish</p><h2 id="finish-title">Space Black or Silver.</h2>
    <p>Two anodized aluminum finishes. Drag to turn it, or use the arrow keys.</p></div>
  <div class="finish__hit" data-finish-hit tabindex="0" data-cursor="drag" role="img" aria-label="MacBook Pro model. Drag or use the arrow keys to rotate."></div>
  <div class="finish__controls">
    <div class="swatches" role="radiogroup" aria-label="Finish">
      <button type="button" class="swatch" role="radio" aria-checked="true" data-finish="space-black"><i class="swatch__chip"></i><span>Space Black</span></button>
      <button type="button" class="swatch" role="radio" aria-checked="false" data-finish="silver"><i class="swatch__chip"></i><span>Silver</span></button></div>
    <button type="button" class="toggle" data-mac-lid aria-pressed="true">Close the lid</button></div>
</section>

<section id="finale" class="section finale" data-section="10" data-title="Lid down" data-nav-theme="dark" aria-labelledby="finale-title">
  <div class="finale__copy"><p class="eyebrow">Lid down</p><h2 id="finale-title">MacBook Pro 14-inch with M5.</h2>
    <p class="finale__price">From $1,699 (U.S.), with 1TB of storage standard.</p>
    <p class="finale__meta mono">Every frame on this page is rendered in code. No photographs, no video.</p>
    <div class="finale__actions"><a class="btn btn--primary" href="https://www.apple.com/shop/buy-mac/macbook-pro/14-inch-m5" target="_blank" rel="noopener" data-cursor="click">See it on apple.com ↗</a>
      <button type="button" class="btn btn--ghost" data-scroll-top>Back to the lid</button></div></div>
  <dl class="finale__roll mono" data-finale-roll>
    <dt>Chip</dt><dd>Apple M5 · 10-core CPU · 10-core GPU · 16-core Neural Engine</dd>
    <dt>Memory</dt><dd>16GB, 24GB or 32GB unified memory · 153GB/s</dd>
    <dt>Storage</dt><dd>1TB standard, up to 4TB</dd>
    <dt>Display</dt><dd>14.2-inch Liquid Retina XDR · 3024 × 1964 at 254 ppi · up to 120Hz</dd>
    <dt>Battery</dt><dd>Up to 24 hours video streaming · up to 16 hours wireless web · 72.4Wh</dd>
    <dt>Ports</dt><dd>Three Thunderbolt 4 · HDMI · SDXC · MagSafe 3 · 3.5 mm headphone jack</dd>
    <dt>Wireless</dt><dd>Wi-Fi 6E · Bluetooth 5.3</dd>
    <dt>Camera and audio</dt><dd>12MP Center Stage with Desk View · six speakers · three-mic array</dd>
    <dt>Size</dt><dd>31.26 × 22.12 × 1.55 cm · 1.55 kg</dd>
    <dt>Finish</dt><dd>Space Black · Silver · 100 percent recycled aluminum enclosure</dd></dl>
  <i class="finale__line" data-finale-line aria-hidden="true"></i>
</section>
</main>

<footer class="footer">
  <ol class="footer__notes caption">
    <li>Testing conducted by Apple in September 2025 using preproduction 14-inch MacBook Pro systems with Apple M5. Figures as published by Apple, October 2025.</li>
    <li>Battery life varies by use and configuration.</li>
    <li>U.S. pricing as published by Apple, March 2026.</li>
    <li>Chip model, floorplan, zone grid and particle rates are illustrations, not measurements.</li>
    <li>Sources: apple.com/macbook-pro/specs and Apple Newsroom.</li></ol>
  <p class="footer__legal">Concept site. Not affiliated with Apple Inc.</p>
  <p class="footer__tm caption">MacBook Pro, Apple M5, Liquid Retina XDR, ProMotion and MagSafe are trademarks of Apple Inc.</p>
</footer>
```

**Class and attribute states** (set by JS, styled by E5):

| Where | States |
|---|---|
| `html` | `.js` `.is-loaded` `.is-reduced` `.is-touch` `.has-cursor` `.no-webgl` |
| `.mac-stage` | `.is-hidden`; inline `--stage-bg` and `opacity` |
| `.nav` | `.is-hidden` `.nav--light` |
| `.cursor` | `.is-label` |
| `.chip__step` and `[data-chip-control]` | `.is-active` |
| `[data-stop]` | `[aria-current="step"]` (accent) |
| `.chip__label` | `.is-visible` |
| `.proof__row` | `.is-hidden` |
| `.display__controls` | `.is-visible`; `#display` also takes `--frame-w` and `--frame-r` |
| `#battery` | `.is-night`; `[data-battery-level]` `.is-low` |
| `#finish` | `[data-theme]` `.is-dragging` |
| Segmented controls | `.seg [aria-pressed="true"]` |

Every interactive control gets the `:focus-visible` style `box-shadow:var(--focus)`.

## 6. API contract

```js
// core.js
window.APP = {
  gsap, ScrollTrigger, SplitText,
  lenis,                       // Lenis instance, or null when reducedMotion
  reducedMotion, isMobile, isTouch,   // booleans read once at load (isMobile = max-width:768px)
  register(name, init, { order }),    // call at the script's top level; init(APP) runs synchronously
  pinEnd(k),                   // () => '+=' + innerHeight*k*(isMobile?.6:1)
  whenThree(),                 // Promise<{THREE, ADDONS}>, resolves at once if window.THREE is already set
  splitReveal(el, { type:'lines', mask:true, scrub:false, start:'top 80%', end:'bottom 60%',
                    stagger:.08, duration:.9, from:{yPercent:110}, trigger:el }),  // → {split, tl}; RM: 200ms fade
  scrollTo(target, { duration:1.2, offset:0, immediate:false }),  // lenis.scrollTo, or window.scrollTo under RM
  bus: { on(evt, fn), off(evt, fn), emit(evt, payload) },
  util: { clamp, lerp, mapRange, damp(a,b,lambda,dt), logLerp(a,b,t) }
};
```

**Bus events:**

| Event | Payload | Emitted by | Consumed by |
|---|---|---|---|
| `app:ready` | `{}` | core | all |
| `preloader:progress` | `{p}` | core | — |
| `preloader:done` | `{}` | core | macbook (hero reveal), all |
| `mac:firstframe` | `{}` | macbook | core (preloader gate) |
| `chip:firstframe` | `{}` | chip | — |
| `webgl:unsupported` | `{module:'mac'\|'chip'}` | macbook, chip | core (gate) |
| `finish:change` | `{name:'space-black'\|'silver', source:'ui'\|'key'}` | macbook | core (nav theme) |
| `lid:toggle` | `{open}` | macbook | — |
| `section:enter` | `{id, index, title}` | core | — |
| `chip:stop` | `{index, key}` | chip | — |
| `resize` | `{w, h, isMobile}` (150ms debounce) | core | canvases |
| `perf:dpr` | `{module, dpr}` | macbook, chip | — |

**Global objects:**
```js
// macbook.js: exists synchronously; THREE is attached later
window.MacScene = {
  state: { lid:0, peek:0, rotY:0, tiltX:0, dragY:0, dragX:0, envRot:-.9, envRotPointer:0, sweepX:-50,
           screenOn:0, exposure:.7, dive:0, opacity:1, finishMix:0, visible:true,
           cam:{ x:0, y:7, z:60, tx:0, ty:.8, tz:0, fov:35 } },
  poses: { A, B, C, M, F, E },   // §7
  ready:false, finish:'space-black',
  setFinish(name, { immediate:false }), setLid(deg, { duration:.9 }), markDirty()
};
// chip.js
window.ChipScene = { state:{ rot:0, explode:0, stream:0, rate:1, glOpacity:1, dieOpacity:0, view:0, wave:0,
                             load:'light', gpu:'ai', nePulse:0 },
                     stops:[/* §8 */], stopP:[0,.56,.66,.73,.79,.86,.95], goTo(i), ready:false };
```

**ScrollTrigger ownership:**

| Module | ScrollTriggers it creates |
|---|---|
| core | the nav progress trigger (whole page); one `section:enter` trigger per section (`top center`/`bottom center`, which sets `data-nav-index` and the nav theme); nav hide/show from Lenis direction. All are created after the inits. |
| macbook | the #hero pin; stage visibility V1 (`#hero`, top top → pin end) and V2 (`#material` `top bottom` → `#finale` `bottom top`), both setting `state.visible` and `.is-hidden`; the #material state trigger (no pin, created in the `mac-finish` init at order 90: lid 0, pose M, `rotY` π−.4→π); the #finish pin; the #finale pin |
| chip | the #chip pin and master timeline |
| sections | the #brief words; #proof rows; the #display pin; the #rail pin plus containerAnimation children; the #battery pin; the #material pin |

macbook.js registers three inits: `mac-hero` (order 10), `mac-finish` (90) and `mac-finale` (100).

macbook.js also owns the finish picker UI, the lid toggle, peek and every stage pointer handler. sections.js never touches the stage.

**Rendering:**
- Each module runs its own `gsap.ticker` callback and renders only when `visible && dirty`.
- Every timeline `onUpdate`, pointer lerp and tween calls `markDirty()`.
- The pointer lerp keeps marking dirty until the delta is under 1e-4.

## 7. Photoreal MacBook (macbook.js)

**Units** are 1 = 1 cm. The origin is the base centre at table level, and +z points at the viewer.
- The footprint is 31.26 × 22.12 and the closed height is 1.55: base 0.95, lid 0.60.
- The hinge pivot is at (0, .95, −10.66).
- The lid direction is d = (0, sinθ, cosθ), where θ is the lid angle.
- The screen normal is m = (0, −cosθ, sinθ).
- The screen centre is S = pivot + d·11.2. At 108° that is ≈ (0, 11.60, −14.12).

**Geometry:**
- **Base and lid:** `ExtrudeGeometry` of a rounded-rect `Shape` with plan radius 1.0, 24 curve segments, `bevelSize`/`bevelThickness` .12 and 5 bevel segments. Use a material array of [shell, edge]. Group 1, the sides and bevel, gets the edge material, whose lower roughness catches strip highlights.
- **Keyboard well:** 27.9 × 11.8, recessed .05, colour #0A0A0B, roughness .8.
- **Keys:** 78 keys in one `InstancedMesh` of `RoundedBoxGeometry(1,.12,1,2,.12)`, scaled per instance. Pitch u = 1.9 and gap .2. Rows (widths in u):
  - F-row: esc 1.5, 12×1, Touch ID 1; half depth
  - Row 2: 13×1, delete 1.5
  - Row 3: tab 1.5, 13×1
  - Row 4: caps 1.8, 11×1, return 1.8
  - Row 5: shift 2.35, 10×1, shift 2.35
  - Row 6: fn, ctrl, opt 1, cmd 1.25, space 5, cmd 1.25, opt 1, ←, ↑ and ↓ as two half-height keys, →
- Optional key legends (P2): a 2048² canvas atlas plus a per-instance UV offset via `onBeforeCompile`.
- **Trackpad:** 15.0 × 9.6, r .6, inset .02, 1.3 from the front edge; shell material with roughness −.08.
- **Speakers:** two 2.2 × 11.8 strips beside the well, using a canvas dot-grid map for colour darkening plus roughness.
- **Hinge:** cylinder r .32, length 24, #0E0E0F.
- **Feet:** four, r .9 × .06.
- **Ports (geometry only):**
  - x = −15.63: MagSafe 3, TB4 ×2, 3.5 mm jack
  - x = +15.63: SDXC, HDMI, TB4
  - All are #030303 insets with roughness .85.
- **Lid inside:**
  - black glass bezel 30.6 × 21.5
  - active screen 30.05 × 19.52 (3024:1964)
  - notch 2.6 × .8 at top centre
  - camera lens (a tiny clearcoat sphere)
  - no logo outside
- **Budget:** ≤80k triangles and ≤25 draw calls. Merge static parts per material with `mergeGeometries`.

**Materials (MeshPhysicalMaterial):**

| Part | Space Black | Silver |
|---|---|---|
| Shell | #2B2A2D, metalness .9, roughness .44, clearcoat .1 / .4 | #D9DADC, metalness 1, roughness .34 |
| Edge | same, roughness .22 | same, roughness .16 |

- **Both finishes:** a bead-blast `roughnessMap` (512² canvas blue noise, ±.04, repeat 6). Isotropic, no anisotropy.
- **Keycaps:** #0B0B0C, metalness 0, roughness .58, clearcoat .15.
- **Glass:** #050505, roughness .04, clearcoat 1, `emissive` #FFF, `emissiveMap` = screen texture, `emissiveIntensity` = `screenOn`·1.25.

**Screen `CanvasTexture`:** 2048×1330, sRGB, redrawn only when its content changes.
- An original procedural "dusk die" wallpaper:
  - a vertical #0B0D10 → #2C2B2E → horizon glow #E9B98A gradient
  - thin-film bands in copper and teal at ≤.18 alpha
  - a faint 5×2 tile grid echoing the GPU cores
  - dither noise against banding
- A 28px generic menu bar at 12% white, with no logos and no clock.
- Centred on it: "The change is inside the graphics." in SF Pro Display weight 600, 96px. The dive lands on this line, and #brief opens on the same sentence.

**Environment:**
- A custom studio scene, run through PMREM once with `fromScene(studio, .02)`:
  - a BackSide box in #050505
  - an overhead softbox at intensity 6
  - two vertical strips at ±70° (3)
  - a warm rear kicker #FFDCB8 (1.5)
  - a floor bounce (.4)
- Fallback: `RoomEnvironment`.
- `scene.environmentRotation.y = envRot + envRotPointer`.

**Lights:**
- `RectAreaLightUniformsLib.init()`.
- The sweep light is a `RectAreaLight` 60×4, intensity 18, 35 above the lid, facing down, with x = `sweepX`. Its intensity drops to 0 after the hero.
- The screen-spill light is a `RectAreaLight` 30×19.5 at the screen, facing along m, colour #FFF1E2, intensity `screenOn`·2.5.
- No other lights and no shadow maps.

**Contact shadow:**
- Two 512² 2D canvases:
  - a rounded-rect silhouette with `filter:blur(18px)`, at .55
  - the same with `blur(4px)`, at .5
- Plus a hinge AO ellipse whose opacity follows the lid (0→.4 at 90°).
- These are `CanvasTexture`s on a ground plane with `transparent:true` and normal blending, so they composite over the CSS `--stage-bg`.

**Renderer:**
- `{antialias:true, alpha:true, powerPreference:'high-performance'}`, clear alpha 0.
- `NeutralToneMapping`, `toneMappingExposure = exposure`, `outputColorSpace = SRGB`.
- DPR starts at `min(dpr, isMobile ? 1.5 : 2)`. If the average frame time over 40 frames exceeds 18ms, step down to 1.5, then 1.25, then 1 and emit `perf:dpr`.
- Run `compileAsync` before the first frame, then emit `mac:firstframe`.
- If WebGL fails, show `[data-mac-fallback]`, add `html.no-webgl`, emit `webgl:unsupported`, and let the timelines keep driving the DOM.
- No EffectComposer. The glow is the spill light plus exposure.

**Poses** (`pos → target`, fov):

| Pose | Position | Target | FOV | Notes |
|---|---|---|---|---|
| A | (0, 7, 60) | (0, .8, 0) | 35 | |
| B | (36, 26, 50) | (0, 8, −4) | 35 | |
| C | S + m·45 ≈ (0, 25.5, 28.7) | S | 35 | |
| Dive end | S + m·.6 | S | 20 | |
| M | (0, 70, .01) | (0, 0, 0) | 30 | |
| F | (0, 22, 62) | (0, 6, 0) | 30 | |
| E | (0, 40, 70) | (0, 0, 0) | 30 | |

**Laptop rotation** is `rotY + dragY + pointer tilt`.

**Mobile fit:** the distance from target becomes `max(d, 17.2 / (tan(fov/2)·aspect))` for every pose except the dive.

## 8. Chip (chip.js)

**Exploded stack** (units arbitrary; y offset at `explode`=1):

| Layer | Size | Material | Y offset |
|---|---|---|---|
| Thermal interface | 5.4×.02×4.7 | #9AA0A6, opacity .35 | +3.2 |
| M5 die | 5.2×.12×4.5 at x −1.6 | MeshPhysical #16191E, metalness .3, roughness .25, iridescence 1, IOR 1.6, thickness 300–520nm, clearcoat .6, `map` = die canvas (package mode) | +2.2 |
| Unified memory ×2 | 2.4×.25×1.9 at x 3.4, z ±1.2 | black epoxy #111, roughness .7 | +1.2, and x +.8 outward |
| Substrate | 12×.35×9 | #0F1A14, roughness .6, gold pad canvas #C9A45C | 0 |
| Ball grid array | 28×20 `InstancedMesh` spheres r .12 | #BFC3C7, metalness 1, roughness .35 | −1.4 |

- Layers stagger by .02 of progress.
- On reassembly each layer lands with `back.out(1.4)`, and a 1px display-white line flashes for 150ms on each contact plane.
- The memory stream is `Points` ×600 travelling along two `CubicBezierCurve3` paths from memory to the die edge. Colour #F5F5F7, size .06, additive, speed × `rate` (M4 = 1/1.3).
- Environment: `RoomEnvironment` PMREM, `NeutralToneMapping`.
- Cameras (fov 30):
  - P0 top-down: (0, 26, .01) → 0
  - P1: (14, 12, 16) → (0, 1, 0)
  - P2: (−1.6, 9, .01) → die. The die fills 110% of the viewport here.
- Budget: <40k triangles, DPR ≤2 (1.5 on mobile), render only while the pin is active.
- Leaders are SVG paths from `Vector3.project` anchors to label boxes, with labels in alternating columns.

**Die floorplan** (2D, 1000×860; the same draw function produces the WebGL `map`). Blocks are x, y, w, h:

| Block | Rect | Children | Tooltip (title / body) |
|---|---|---|---|
| Super cores | 40, 40, 280, 250 | 2×2 cores | 4 super cores / Part of a 10-core CPU. |
| Efficiency cores | 40, 310, 280, 170 | 3×2 | 6 efficiency cores / Part of a 10-core CPU. |
| GPU | 350, 40, 610, 440 | 5×2 cores of 122×220; core i at col i%5, row ⌊i/5⌋; shader ALUs in the top 62% (8×4 grid); Neural Accelerator in the bottom 38% (32×32 MAC grid) | 10-core GPU / A Neural Accelerator in each core. Core: "GPU core n of 10". NA: "Neural Accelerator / One per GPU core." |
| Neural Engine | 40, 510, 380, 310 | 4×4 | 16-core Neural Engine / A separate block for machine learning. |
| Media engines | 440, 510, 200, 150 | — | Media engines / Position illustrative. |
| System cache | 440, 680, 200, 140 | — | System level cache / Position illustrative. |
| Memory interface | 660, 510, 300, 140 | 8 PHY lanes | Memory interface / 153GB/s to up to 32GB of unified memory. |
| Display and I/O | 660, 670, 300, 150 | — | Display and I/O / Drives up to two external displays. |

**Drawing:**
- Fill `--die`; strokes 1px in `--die-line`.
- Block names in SF Mono 11px, shown when the block is wider than 120 CSS px on screen. That is also the level-of-detail rule: children draw only above 120px. The MAC grid appears only when s>12.
- Scale 1 fits the die at 90% of the viewport (min of width, or height × 1000/860).

**Stops.** The view centre lerps linearly between stops; `s` interpolates with `logLerp`.

| # | Key | Centre | s |
|---|---|---|---|
| 0 | full | (500, 430) | 1 |
| 1 | cpu | (180, 260) | 2.6 |
| 2 | gpu | (655, 260) | 1.6 |
| 3 | core7 | (533, 370) | 6 |
| 4 | na | (533, 438) | 24 |
| 5 | ne | (230, 665) | 2.6 |
| 6 | full | (500, 430) | 1 |

`[data-chip-zoom]` shows `×s.toFixed(1)`.

**Effects:**
- **MAC wave:** cell (i, j) brightness is `smoothstep(0, .15, wave·1.3 − (i+j)/62)·(gpu==='ai')`, filled with `--accent`. The wave runs continuously while stop 4 is active.
- **Graphics mode:** lights the ALUs at 40% `--text-dark`.
- **Load:** light pulses only the efficiency cores; heavy pulses all 10. Pulses are `--text-dark`, never accent.
- **NE input:** each keystroke sends a pulse from the memory interface into the 16 NE cores, rippling in row order over 40ms steps.

**Hotspot clicks:**

| Block clicked | Goes to stop |
|---|---|
| CPU, either cluster | 1 |
| GPU | 2 |
| GPU core | 3 |
| Neural Accelerator | 4 |
| Neural Engine | 5 |
| Others | none; the tooltip pins until Esc or a click outside |

## 9. Preloader, nav, cursor, footer

**Preloader (core.js):**
- The counter runs 000→090 over 1.4s (`power1.out`), then holds.
- It completes once `mac:firstframe` or `webgl:unsupported` has fired, or at the 5s timeout. The last 090→100 takes 300ms.
- Then the bars move yPercent ∓100 over 900ms (`expo.inOut`) and the slate fades out.
- `lenis.start()`, `html.is-loaded`, emit `preloader:done`.
- Under RM there is no count and it fades after the gate.

**Nav:**
- 48px fixed, transparent, with `backdrop-filter: blur(12px) saturate(1.4)` over `rgb(6 6 7 / .55)`. `.nav--light` switches to paper at .7.
- It hides on scroll down and shows on scroll up (Lenis direction).
- `[data-nav-progress]` is a 1px accent `scaleX` bar.
- The chapter links hide at ≤768.
- Links call `APP.scrollTo('#id')`.

**Cursor (core.js):**
- Only when `(pointer:fine)` and not RM; then set `html.has-cursor`, which applies `cursor:none` except on inputs.
- A 14px ring follows via `gsap.quickTo` (.15).
- Over `[data-cursor]` the ring grows to 64px with the label DRAG, HOLD or CLICK in 11px mono; over buttons and links it grows to 36px.

**Grain:** a fixed CSS SVG-noise overlay at 3% plus a radial vignette at 20%, with `pointer-events:none`.

**Footer:** `--void` background with a hairline top border, which the `.finale__line` hands off to. Notes in 12px mono, then the legal line.

**Assets:**
- `favicon.svg`: a #060607 rounded square with a 3×3 die grid in #F2F1EE, where one cell is `--accent`.
- `og.svg`: 1200×630 void background, "Lift the lid on M5." in SF Pro, and the die grid. No Apple logo.

## 10. Acceptance checklist

- [ ] Every number on the page appears in the §1 table. Every multiplier carries "up to" (or "over" for 4x) and says what it is compared against. Both footnotes are present.
- [ ] Copy matches §5 exactly. None of the banned words appears: seamless, robust, cutting-edge, revolutionary, game-changing, innovative, next-level. No emoji, no Apple logo, and the footer legal line is present.
- [ ] Scripts load in the §3 order, and there are no console errors when the network blocks jsDelivr's three (the timelines still run and the fallback SVG appears).
- [ ] There are at most two WebGL contexts, the renderers stay idle off-screen, and the site holds 60fps on an M-series Mac at DPR 2 (DevTools performance, hero and chip).
- [ ] The hero dive ends on the "The change is inside the graphics." frame, and #brief opens on the same sentence with no visible jump.
- [ ] #chip passes through all 7 stops. The die canvas stays sharp at ×24, and the HUD label and zoom readout match the stop.
- [ ] Stop buttons, arrow keys, the chip and proof controls, the display and battery canvases, the rail, the finish rotation and the swatches all work from the keyboard, with a visible accent focus ring.
- [ ] Under `prefers-reduced-motion`: no Lenis, no pins, the RM stills from §4 show, and the chip stepper works.
- [ ] At 390px and 768px there is no horizontal scroll, the rail stacks, pins are 0.6×, and the laptop fills about 88% of the width.
- [ ] The accent appears only in its 6 listed uses. There are no indigo or violet gradients, and display white is used only for emitted light.
