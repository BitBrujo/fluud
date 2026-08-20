# CLAUDE.md — the generators

Three scripts and two compositions that produce **committed build input**. None
of them runs in the build, none of them may, and the reason is the same for all
of them.

```
basemap.py        -> src/lib/geo/nyc.ts     ~1,400 coords, five boroughs, 27KB
cso.py            -> src/lib/geo/cso.ts     427 combined sewer outfalls
rat-bake.py       -> public/rat/*.webp      the DORMANT alert rat. Blender 4.2 LTS
rat-poses.json    hand-edited pose selection, read by rat-bake.py
motion/           -> public/motion/*        ⚠️ HyperFrames compositions. HTML in,
                                            MP4 out. See below
```

⚠️ **`motion/` is the newest and it is not a Python script** — two HTML
compositions rendered by `npx hyperframes`, which is the same rule wearing a
different toolchain. `notify-walkthrough/` (1920×1080) and
`notify-walkthrough-tall/` (1080×1350) are two cuts of one 27s piece and feed
`public/motion/`. **`motion/README.md` is the recipe**, including the three
`curl` lines that fetch the fonts and GSAP, which are pinned by URL and
deliberately not committed.

⚠️ **The renderer drives a headless Chrome and fetches, so it can never be a
build step** — the same constraint as every row above it, arriving through
puppeteer rather than through an HTTP client. What ships is 2.7MB across four
files in `public/motion/`.

⚠️ **These two are NOT decoration, unlike everything else in this directory.**
Since 2026-08-16 that panel is the WHOLE of the landing page's notifications
section — the label, the title, the body, the three-step `<ol>` and the
illustrated `EmailCard` were all deleted on the owner's instruction. **A rule
drawn wrong in these files is a rule wrong on a page**, and no compiler, test or
check script can see inside an MP4. The five that bind them are tabulated in
`motion/README.md`.

⚠️ **The two cuts are two files and nothing checks that they agree.** Changing a
string, a colour or a beat in one means doing it in the other and re-rendering
both. Same for `57`, which is a literal in each composition and a third time in
`notify-walkthrough.tsx`'s `sr-only` block — the same class of unenforceable
duplication as variant *i* in `en` matching variant *i* in `es`.

❌ ⚠️ **`rat-graffiti.py` was here and is DELETED** (2026-08-14), with the six
`rat-graffiti-{1..6}.webp` it produced and every surface that mounted them. It
needed a local ComfyUI on :8188 and it is in the archived pre-public history.
Its hard-won lessons — the key-out background is **neutral, not bright** (corners
measured 216–221 with a channel spread of 1–6, so a "255 minus tolerance" test
matched almost none of it), and border flood fill alone leaves the tail's
enclosed patches as white blobs — are in that history too, and they are
ComfyUI-and-Pillow lessons rather than rules this repo still holds.

`scripts/nta.py` at the repo root is the fourth of these in spirit — same rule,
same reason, different tree. See `scripts/CLAUDE.md`.

⚠️ **`.design-sync/` was the FIFTH, and it inverted one half of the rule.** Its
16 woff2 and 56 preview files are build input produced by hand, exactly like
`nyc.ts`. What differs is the direction: nothing in this repo consumes them.
They are input to a **claude.ai/design** project, and `.dockerignore` excludes
the tree for weight rather than for egress.

⚠️ **It is UNTRACKED as of 2026-08-20 and a clone does not have it**, so it is
the one entry in this file whose output you cannot go and look at. That does not
change the rule it was here to illustrate — hand-run, never in the build. See
`web/CLAUDE.md`.

## ⚠️ The one rule: by hand, never in the build

**The Docker UI stage has no network egress**, and `.dockerignore` excludes this
directory outright. A build step that fetched anything here would work on a
laptop and fail in the image — or worse, succeed by pulling something different.

That is the same constraint that keeps `next/font/google` out of the app and the
basemap out of a tile CDN. The map still draws when the venue's wifi does not,
which is the whole argument this project makes about itself.

**So the output is committed and the generator is run by a person.** If you
change one, run it, look at the result, and commit the artefact in the same
commit as the script.

```bash
cd web && python3 scripts/basemap.py > src/lib/geo/nyc.ts
cd web && python3 scripts/cso.py     > src/lib/geo/cso.ts
```

## ⚠️ One rat script is left, and its output is mounted by nothing

The root `CLAUDE.md` has the full accounting. What matters here:

⚠️ **`rat-bake.py`'s eight WebPs are committed and rendered by NOTHING.**
`rat-figure.tsx` went with the on-page warning and the whole of that system is
kept unwired-but-whole, so putting the warning back is a re-wire rather than a
rebuild. This script stays on exactly those terms — **it is dormant, not
current**, and running it changes nothing a reader can see.

⚠️ **The graffiti rats were the live half and they are deleted**, so there is no
longer a pair to confuse. The separation rule is retired with them: it said do
not wire a decorative rat to severity and do not recolour the alert rat into
graffiti, because the two looked nothing alike on purpose. **If any rat ever
returns, that rule returns with it** — a reader must never mistake a decoration
about rats for a warning about water.

### `rat-bake.py`

```bash
B="blender -b --factory-startup --python web/scripts/rat-bake.py --"
$B prep && $B probe && $B sheet      # import once (slow), inspect, contact sheet
python3 web/scripts/rat-bake.py tile # composite (Blender has no Pillow)
#   ... choose poses, edit rat-poses.json ...
$B bake && python3 web/scripts/rat-bake.py webp        # 4 stills
$B loop && python3 web/scripts/rat-bake.py loopwebp    # 4 loops, 84 renders
```

⚠️ **Bake the stills first and look at them.** `loop` shares the poses, lighting
and framing with `bake`, so a still you are happy with is a loop you will be
happy with — and finding out otherwise costs four renders instead of eighty-four.
~6 minutes for the 84 with OptiX on an RTX 3090 Ti; `setup_render` falls back to
CPU and says so **loudly**, so read that line before assuming a slow bake failed.

⚠️ **`RAMP` and `LOOP` were the shrinking-character rule in numbers**, and they
are the last place that rule still exists. The copy half was removed from
`agent._TEMPLATES` on 2026-08-14: the warning text is plain at every level now,
in both languages, and `check_escalation.py` asserts a *variation* ordering
rather than a character one.

These tables were the pixel half — `key` only falls, `rim` only rises, `fps`
only rises, cycle length only falls — and they are unchanged, because the whole
alert-rat layer is frozen rather than edited. ⚠️ **If the warning is ever
re-wired with this rat in it, that is the moment to decide whether a shrinking
character belongs beside plain copy.** Do not treat these constants as a live
rule in the meantime.

The pacing lives in the **WebP's own frame durations**, never in a CSS animation
— deliberate, so "make it feel calmer at EMERGENCY" is a re-render rather than a
one-line stylesheet change by someone who has not read this.

⚠️ **`loop` solves the camera ONCE**, against the union of every frame in the
cycle. Framing per frame is the obvious implementation and it makes the rat
appear to bob on a boom. See `frame_subject`'s `pts` argument.

⚠️ **`deliver()` premultiplies alpha before resizing**, and both paths share it.
Blender writes straight alpha with black RGB in transparent pixels; a naive
Lanczos downsample bleeds that black into the edge and haloes the silhouette
against the card.

**Provenance**: `assets/black-rat/` is gitignored — 52MB of rigged FBX and 4K
maps **licensed to be rendered, not redistributed**, plus a 63MB `.blend` once
you run `prep`. Only the eight WebPs are committed. Never commit the source art
and never make the bake part of the build.

Three of the shipped maps are wrong or unused and the script rebuilds materials
rather than trusting the import — `alpha_texture` is wired to the *normal map*
through `TransparencyFactor` (which punches holes in the fur) and
`blackrat_metal.png` has a median of 0.51 (a half-chrome rat). `probe` fails
loudly if anything ever reaches Principled `Alpha`.

## Verifying an animated WebP

⚠️ **You cannot check loop playback in headless Chrome.** It does not advance
animated-image frames, so `drawImage` twice and diff returns **zero difference
forever** on a perfectly good file. It reads exactly like a broken animation.

Verify the **file**, which is what a bake can actually get wrong:

```python
from PIL import Image; import numpy as np
im = Image.open("web/public/rat/rat-emergency-loop.webp")
print(im.n_frames, im.info["duration"])        # 16, 33 -> 16 frames @ 30fps
im.seek(0); a = np.asarray(im.convert("RGBA")).astype(int)
im.seek(1); b = np.asarray(im.convert("RGBA")).astype(int)
print(np.abs(b - a).sum())                     # large -> frames really differ
```

That catches wrong frame count, wrong duration, and a cycle sampled so it renders
the same pose repeatedly. **Playback in a real browser is the one thing you have
to check with your eyes.**

## Two economies that do not work — do not retry them

Measured on the loops, not estimated:

- **Quality is not the lever.** `WEBP_QUALITY` 88 → 58 saves only ~28% and bands
  the gradients. The rat is a dark rim-lit subject that is almost entirely soft
  falloff, which is exactly the content low-quality WebP ruins.
- **Inter-frame compression does not engage.** Pillow's `minimize_size` and
  `allow_mixed` save under a thousand bytes across all four. The subject is
  composited on transparency, so the alpha silhouette edge changes every frame
  and there is almost no inter-frame redundancy. An animated WebP of a moving
  cut-out is close to a pile of independent stills.

**The lever that works is frame count** (or `DELIVER_PX`, at the cost of
sharpness on hidpi). Halving `clear` and `watch` to 12 frames roughly halves the
two worst entries, and the tempo ramp stays valid because it only requires `fps`
to rise and cycle length to fall — not any particular count.
