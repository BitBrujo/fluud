# `motion/` — the landing page's video, and how to re-render it

Two HyperFrames compositions, two cuts of one 27s piece, feeding
`web/public/motion/` and mounted by
`src/components/landing/notify-walkthrough.tsx`.

⚠️ **That panel is the WHOLE of the notifications section on `/`.** The label,
the title, the body paragraph, the three-step `<ol>` and the illustrated
`EmailCard` were deleted on the owner's instruction, 2026-08-16. **A reader
meets these two files and nothing else there**, so what they draw is not
decoration — it is the section, and it is the only place several of that
section's sentences exist.

```
notify-walkthrough/       1920×1080 → public/motion/notify-walkthrough.mp4        1.3MB
notify-walkthrough-tall/  1080×1350 → public/motion/notify-walkthrough-tall.mp4   1.4MB
```

Each also produces a `-poster.webp` (~20KB). The component picks the cut once,
at hydration, on `(min-width: 640px)`.

⚠️ **The tall cut is not the wide one letterboxed and the second file is not a
nicety.** Measured at 390: the wide cut renders **340px across**, which puts
1920px of drawn interface into a 340px box — the address field's text lands near
4px and the whole panel is a smear. The tall cut **drops the borough column**,
shows **three** instrument rows instead of five, and roughly doubles every type
size against its frame.

⚠️ **They are two files and nothing checks that they agree.** Changing a string,
a colour or a beat in one means doing it in the other and re-rendering both.

## What they draw, and the rules that bind it

Each cut walks the three steps: an address typed into the lookup and a candidate
picked · the nearest instruments with monitor rings filling · the level chips and
the quiet-hours selects · then the WARNING email arriving.

**The drawn interface is not a screenshot.** No compiler, test or check script
can reach inside an MP4, so every rule it borrows from the real components is
written at the point it is drawn, in the composition's own CSS comments. The
five that would be easiest to break on a re-render:

| rule | where it lands |
|---|---|
| ⚠️ **No depth in the instrument list.** Rows carry a name and a distance. | A depth column would put five more unlabelled illustrated readings on `/` — see `landing-sections.tsx` |
| ⚠️ **A distance takes `--muted-foreground` at every distance, forever.** | Reddening with distance is a severity ramp built out of coverage; greening as it shrinks is reassurance beside a depth |
| ⚠️ **Monitor rings and level chips are `--wl-select`.** | Both are facts about the *reader*. `warning up` wearing a selection colour rather than amber is the point — a trigger chip is a preference, not a severity |
| ⚠️ **The quiet-hours sentence is verbatim from `watch-parts.tsx`.** | Quiet hours **suppress** and never delay; an emergency always sends. A drawn face that softened either would sell a silence this system refuses to sell |
| ⚠️ **The typed address must be one that RESOLVES.** | It is `address-lookup.tsx`'s own placeholder. That field shipped once with an address GeoSearch returns nothing for |

⚠️ **`57` is a literal in both compositions and appears a third time in
`notify-walkthrough.tsx`'s `sr-only` block.** Nothing can check the three agree —
two of them are pixels. It was `EXAMPLE_WARNING_MM` in `landing-sections.tsx`
until that card was deleted.

⚠️ **The count from 0 to 57 at the end was kept on the owner's instruction.** It
is a fixed tween over a constant, but a reader cannot see that, and a rising
number beside `WARNING` on a page with no timestamp and no plausibility flag is
the closest this site comes to animating a depth. **Allowed there and nowhere
else.**

## Regenerating

⚠️ **By hand, never in the build.** The renderer drives a headless Chrome and
fetches; `web/scripts/` is in `.dockerignore` and the Docker UI stage has
neither. Same rule as `basemap.py` and `rat-bake.py`, arriving through puppeteer
instead of through an HTTP client.

The two vendored inputs — the Outfit and Fira Code latin subsets, and GSAP — are
fetched rather than committed, and both are pinned by URL.

```bash
cd web/scripts/motion/notify-walkthrough       # or notify-walkthrough-tall
mkdir -p assets/fonts assets/vendor

curl -sL -o assets/vendor/gsap.min.js \
  https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js
curl -sL -o assets/fonts/outfit-latin.woff2 \
  https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2
curl -sL -o assets/fonts/firacode-latin.woff2 \
  https://fonts.gstatic.com/s/firacode/v27/uU9NCBsR6Z2vfE9aq3bh3dSD.woff2

npx hyperframes check .            # lint · runtime · layout · motion · contrast
npx hyperframes snapshot . --at 5.5,11.5,19.5,26   # look at them
npx hyperframes render . -o ./renders/out.mp4
```

Then into `public/`, wide cut shown:

```bash
ffmpeg -i renders/out.mp4 -c copy -movflags +faststart \
  ../../../public/motion/notify-walkthrough.mp4 -y
ffmpeg -sseof -0.1 -i renders/out.mp4 -frames:v 1 -c:v libwebp -quality 88 \
  ../../../public/motion/notify-walkthrough-poster.webp -y
```

⚠️ **`+faststart` is not cosmetic.** Without the moov atom in front a browser
cannot start the video until the whole file has arrived.

⚠️ **The poster is the LAST frame and must stay the last frame.** It is what a
reader sees when autoplay is blocked, when the file never arrives, before the
section is scrolled to, and under `prefers-reduced-motion` — which is the
`rat-figure.tsx` rule at another component: the frame a reduced-motion reader
sees is the only frame they see, so it has to be a complete one. The **first**
frame is an empty panel, and a poster of it would read as something that failed
to load. `-sseof -0.1` is what makes it the last one.

## The palette is baked, and one colour is safe by construction

Every value is the **Estuary** literal, read off `globals.css` and hard-coded.
**A palette change is a re-render.** The exception is `--wl-warning`: it is
declared in `:root` and verified byte-identical across all three palettes,
because a palette that could retint a level name would be a theme with an
opinion about how deep the water is.

⚠️ **`#time` / `#envTime` is `#6b7a8b`, not the app's `muted-foreground/70`.**
The shipped value measures 3.76:1 against the card and fails AA; HyperFrames'
contrast pass refuses to render it.

## Fonts

Outfit and Fira Code are the app's own `--font-sans` and `--font-mono`, under
the **SIL Open Font License**, fetched from Google Fonts as latin subsets — the
same grant `.design-sync/fonts/` ships under. ⚠️ **The Adobe display face is not
in this set and may not be**: that kit is licensed to be linked and never
re-hosted, and nothing carrying a factual claim is set in it anyway.

⚠️ **Neither face is self-hosted by the app**, so the rest of `/` renders in a
system fallback while these videos render in Outfit. Known, and invisible now
that no text sits beside the panel.
