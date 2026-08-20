#!/usr/bin/env python3
"""Bake the rat stills and loops in `public/rat/` from the black-rat model.

Run this BY HAND, on a machine with Blender, when the rat needs to change. It
is not part of `npm run build` and must never become part of it — same rule, and
the same reason, as `basemap.py` next door: `web/scripts/` is excluded by
`.dockerignore`, the Docker UI stage has no Blender and no egress, and the
images are committed rather than generated.

    Source art:  assets/black-rat/  (gitignored — see the note in .gitignore)
    Output:      web/public/rat/rat-{clear,watch,warning,emergency}.webp
                 ~8KB each, ~37KB the set — the stills
                 web/public/rat/rat-{level}-loop.webp
                 animated, one cycle each — the loops

BOTH SETS SHIP, AND THE STILL IS NOT A FALLBACK FOR THE LOOP
------------------------------------------------------------
The panel stacks all four stills and holds one loop over the active one. So the
stills still do the job they always did — an escalation never shows an empty box
while an image fetches — and they are additionally what a reader with
`prefers-reduced-motion` sees, via a `<picture>` source, which means that reader
downloads no loop at all. Deleting a still to save bytes breaks both.

The model is licensed to be rendered, not redistributed, which is the other
reason the 44MB of FBX and 4K maps stays out of the repo.

WHY FRAMES AND NOT A RENDERER IN THE PAGE
-----------------------------------------
An in-page animation runtime was tried once and removed. Rendering offline keeps
the motion and gives back everything that cost: no third-party origin, no WebGL
context, no StrictMode hazard, no runtime dependency, and a page that still
draws when the venue's wifi does not. The escalation ends up baked into pixels,
which is a stronger guarantee than one enforced in a component someone can edit.

⚠️ If a future change wants this rat to react to something, BAKE THE REACTION.
Do not put a renderer on the page.

THE RAMP IS INVARIANT 14
------------------------
The rat's character diminishes as severity rises. That is not decoration; it is
the same property `agent._TEMPLATES` enforces in the copy, enforced a second
time in the image. Three mechanics carry it, and they are all in `RAMP` below:

  * the key light dies and the rim takes over, so the body stops being a mass
    and becomes a contour — literally "the character diminishes"
  * azimuth rotates past profile, so the eye and its catchlight are lost.
    Cuteness lives in the three-quarter view; at -96 deg there isn't one
  * `fill` shrinks 0.78 -> 0.32, so the rat occupies less of the same box

`clear` is the frame to be careful with. It must read *indifferent*, not
friendly: turned away, not looking up, cool rim rather than golden. `clear`
means "no instrument has reported water", and the rat must never upgrade that
to "safe" (the never-safe rule). A warm key on a rodent at three-quarter front is the
storybook-mouse failure, and it would say something the instruments did not.

USAGE
-----
Install Blender 4.2 LTS first. Not the apt build (Cycles compiled CPU-only, no
CUDA) and not 5.x (slotted actions changed in 4.4, and `import_scene.fbx` may
be gone in the C++ importer rewrite):

    sudo snap install blender --classic --channel=4.2lts/stable
    sudo snap refresh --hold blender

No sudo? The official portable tarball needs no install and works identically:

    mkdir -p ~/.local/opt && cd ~/.local/opt
    curl -LO https://download.blender.org/release/Blender4.2/blender-4.2.9-linux-x64.tar.xz
    tar xf blender-4.2.9-linux-x64.tar.xz
    ln -sfn ~/.local/opt/blender-4.2.9-linux-x64/blender ~/.local/bin/blender

Then, from the repo root. `--factory-startup` is not optional: without it the
bake depends on whatever is in someone's userpref.blend.

    B="blender -b --factory-startup --python web/scripts/rat-bake.py --"

    $B prep      # import the FBX once, cache it as a .blend. Takes minutes.
    $B probe     # what is actually in there: actions, materials, textures
    $B sheet     # 13 actions x 6 frames -> tiles, to choose poses from
    python3 web/scripts/rat-bake.py tile      # composite them (needs Pillow)
    #  ... look at the sheet, edit web/scripts/rat-poses.json ...
    $B bake      # render the four stills at 640px
    python3 web/scripts/rat-bake.py webp      # -> rat-{level}.webp
    $B loop      # render one cycle per level, 84 frames total
    python3 web/scripts/rat-bake.py loopwebp  # -> rat-{level}-loop.webp

`prep` is slow (27,612 f-curves through a pure-Python importer) and everything
else loads its .blend in about two seconds. That cache is what makes the
look-at-sheet / edit-poses / re-bake loop usable, so do not skip it.

`loop` is the long one now — 84 renders against `bake`'s four, about six minutes
with OptiX on an RTX 3090 Ti — so run `bake` and look at the stills first. The
poses, lighting and framing are shared, so a still you are happy with is a loop
you will be happy with, and finding out otherwise after four frames is cheaper
than after eighty-four.

⚠️ The loops come out at **760KB against the stills' 37KB**. That is measured,
not a surprise to be fixed by turning `WEBP_QUALITY` down — see
`web/src/components/CLAUDE.md` for why quality and inter-frame compression both
fail to help here, and why frame count is the only lever that works.

`tile`, `webp` and `loopwebp` run under SYSTEM python, not Blender's. Blender
bundles its own interpreter and cannot import the system Pillow, so those three
passes live on the other side of the `import bpy` guard at the bottom of this
file.
"""

import json
import math
import os
import sys

# The two passes that need Pillow run outside Blender; everything else needs
# bpy. Importing this file under either interpreter has to work.
try:
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Matrix, Vector

    INSIDE_BLENDER = True
except ImportError:
    INSIDE_BLENDER = False


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "assets", "black-rat")
ZIP = os.path.join(ART, "source", "blackrat.zip")
TEXTURES = os.path.join(ART, "textures")
# `frames/` is gitignored at any depth, so scratch output here costs nothing.
WORK = os.path.join(ART, "frames")
BLEND = os.path.join(WORK, "rat.blend")
SHEET_DIR = os.path.join(WORK, "sheet")
POSES = os.path.join(ROOT, "web", "scripts", "rat-poses.json")
PUBLIC = os.path.join(ROOT, "web", "public", "rat")

LEVELS = ("clear", "watch", "warning", "emergency")

# Render at 2x the delivered size: 320px is the delivery, and the downsample
# buys visibly better whiskers and ear edges than rendering 320 directly.
RENDER_PX = 640
DELIVER_PX = 320
WEBP_QUALITY = 88

# The escalation ramp. See the invariant-14 note in the module docstring —
# every column here is doing editorial work, not just lighting.
#
#   fill  fraction of the frame the subject's longest on-screen axis fills
#   key   front-ish soft light, in watts. Dies to nothing by emergency
#   rim   the load-bearing light: behind and above, draws the animal as an edge
#   rim_b far-side fill, so the silhouette closes
#   eye   small light at the head for the catchlight. THE CUTENESS DIAL
#   az    azimuth in degrees, measured off a turntable rather than guessed:
#           0    face-on, every whisker visible. Never use it, this is the
#                storybook-mouse angle and it is the one thing to avoid
#          -60   profile, the eye and snout still reading. Alert
#          -80   profile, head mostly away
#          -95   side, slightly behind
#         -140   pure back view, no face at all
#   el    elevation in degrees. Rising = looking down on it
#
# clear and watch are the pair to keep apart, and the separation is the camera,
# not the pose: two sitting idles seen from similar angles read as the same
# picture no matter which frame you pick. Back-turned at -140 against profile
# at -60 also says the right thing — the rat notices before you do.
#
# One consequence worth stating: `watch` LOOKS brighter than `clear`, because
# at -60 more of its lit side faces the camera. The monotonic property is in
# these numbers, not in apparent brightness — `key` only ever falls and `rim`
# only ever rises. Check the columns, not the renders, when changing this.
#
# `fill` RISES with severity, which is the opposite of what it looks like it
# should do, for two reasons. First, it measures the longest on-screen axis,
# and a galloping rat is nose-to-tail about twice the length of a sitting one —
# so equal `fill` renders the running frames at half the body mass, and an
# earlier ramp that also shrank the number produced a 33px speck at emergency.
# Second, once corrected for that, growing is simply the better image: the
# animal closes on you as the water does. The diminishment of *character* is
# carried entirely by the light and the pose, which is where it belongs —
# attention-getting and characterful are not the same axis.
RAMP = {
    "clear":     {"fill": 0.70, "key": 18, "rim": 60,  "rim_b": 24, "eye": 0,
                  "az": -140, "el": 14, "ambient": 0.055},
    "watch":     {"fill": 0.76, "key": 11, "rim": 115, "rim_b": 20, "eye": 15,
                  "az": -60,  "el": 10, "ambient": 0.044},
    "warning":   {"fill": 0.86, "key": 4,  "rim": 175, "rim_b": 14, "eye": 0,
                  "az": -95,  "el": 20, "ambient": 0.034},
    "emergency": {"fill": 0.94, "key": 0,  "rim": 235, "rim_b": 10, "eye": 0,
                  "az": -90,  "el": 23, "ambient": 0.027},
}

# The loop ramp. `bake` renders one frame per level; `loop` renders `n` of them
# and `loopwebp` encodes each set as one animated WebP.
#
# TEMPO IS THE THIRD MECHANIC OF INVARIANT 14, and the only one the stills could
# not carry. Character does not just live in how the rat is lit and how much of
# the box it fills — it lives in how it moves. A settled idle breathing at 12fps
# is an animal that has not decided to leave yet; a gallop at 30 is one that
# already has. `fps` therefore only ever rises and `sec` only ever falls, on the
# same terms as `key` only falling and `rim` only rising above. Check the
# columns, not the renders.
#
# `n` falls with severity as well, and that is deliberate rather than a budget
# compromise: a long loop reads as a performance and a short one as a tic. The
# EMERGENCY rat gets sixteen frames of gallop with no face, which is the least
# character available while still being motion.
#
# The ACTION comes from rat-poses.json, same as the stills — so a loop is always
# the cycle its own still was cut from, and the two can never drift apart. Only
# the tempo lives here, in code, for the same reason the lighting does.
LOOP = {
    "clear":     {"n": 24, "fps": 12},
    "watch":     {"n": 24, "fps": 14},
    "warning":   {"n": 20, "fps": 20},
    "emergency": {"n": 16, "fps": 30},
}

# Cool, never golden. A warm rim on a rodent reads as storybook; this one has
# to read as a streetlight catching something that is already leaving.
RIM_COLOR = (0.78, 0.86, 1.00)
KEY_COLOR = (1.00, 0.97, 0.93)
# World background. Invisible to camera under film_transparent, but it still
# lights the subject — which is the point. Tinting it toward the page keeps the
# cut-out from reading as pasted on.
AMBIENT_COLOR = (0.055, 0.085, 0.130, 1.0)

# Starting guesses, replaced by rat-poses.json once you have looked at a sheet.
# Actions resolve by suffix (see `find_action`), and frames are 1-based.
DEFAULT_POSES = {
    "clear":     {"action": "idle_A2", "frame": 40},
    "watch":     {"action": "idle_A1", "frame": 12},
    "warning":   {"action": "walk_A3", "frame": 20},
    "emergency": {"action": "run_A2",  "frame": 14},
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def argv_after_ddash():
    """Blender passes its own flags too; ours are whatever follows `--`."""
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1:]
    return sys.argv[1:]


# ---------------------------------------------------------------------------
# scene construction
# ---------------------------------------------------------------------------


def stage_fbx():
    """Extract the FBX beside the textures so image search can find them.

    Every texture path in this FBX is a Windows absolute path — including
    `RelativeFilename`, which is a broken export. Nothing resolves on Linux
    without help, and Blender's importer fails *silently*, handing you
    zero-size placeholder images and an untextured render. Extracting flat
    next to the maps gives `use_image_search` a chance; `relink_textures`
    below is what actually guarantees it.
    """
    import tempfile
    import zipfile

    tmp = tempfile.mkdtemp(prefix="ratbake-")
    with zipfile.ZipFile(ZIP) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".fbx"))
        z.extract(name, tmp)
    fbx = os.path.join(tmp, name)
    beside = os.path.dirname(fbx)
    # Symlink the already-extracted maps rather than unpacking 23MB again.
    for f in os.listdir(TEXTURES):
        if f.lower().endswith(".png"):
            dst = os.path.join(beside, f)
            if not os.path.exists(dst):
                os.symlink(os.path.join(TEXTURES, f), dst)
    return fbx


def import_fbx(path):
    if hasattr(bpy.ops.import_scene, "fbx"):
        bpy.ops.import_scene.fbx(
            filepath=path,
            use_anim=True,
            use_image_search=True,
            ignore_leaf_bones=True,
            # We only ever play back the rig's own actions, so re-rolling bones
            # can only introduce drift.
            automatic_bone_orientation=False,
            global_scale=1.0,
        )
    elif hasattr(bpy.ops.wm, "fbx_import"):
        # Blender 5.x replaced the Python importer with a C++ one.
        bpy.ops.wm.fbx_import(filepath=path)
    else:
        sys.exit("no FBX importer in this Blender build")


def the_armature():
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if len(arms) != 1:
        sys.exit(f"expected 1 armature, found {len(arms)}: {[a.name for a in arms]}")
    return arms[0]


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def relink_textures():
    """Point every image at assets/black-rat/textures/ and prove it loaded.

    `img.size[0] == 0` is the only reliable test that a texture actually
    resolved — Blender's placeholders report zero rather than raising. Without
    this assert an untextured render looks like a lighting problem and costs
    you an hour.
    """
    for img in bpy.data.images:
        if img.source != "FILE":
            continue
        base = os.path.basename(img.filepath_raw.replace("\\", "/"))
        cand = os.path.join(TEXTURES, base)
        if os.path.exists(cand):
            img.filepath = cand
            img.reload()
        if img.size[0] == 0:
            sys.exit(f"unresolved texture {img.name!r} -> {img.filepath!r}")
        img.colorspace_settings.name = "sRGB" if "color" in base.lower() else "Non-Color"


def socket(node, *names):
    """Blender 4.0 renamed `Specular` to `Specular IOR Level`, among others.

    Looking sockets up by any of their historical names is the difference
    between a version bump giving you a clear error and giving you four
    silently wrong renders.
    """
    for n in names:
        if n in node.inputs:
            return node.inputs[n]
    return None


def rebuild_material(mat):
    """Throw away the imported node graph and build a correct one.

    The FBX carries two bugs that make the importer's materials unusable:

      1. `alpha_texture` is wired to the NORMAL MAP through `TransparencyFactor`.
         Blender routes that into Principled `Alpha`, so the fur imports
         randomly semi-transparent — which under `film_transparent` punches
         holes in the matte. This is the one that breaks the whole exercise.
      2. `blackrat_metal.png` is not a metalness map. Its median is 0.51, so
         feeding it to `Metallic` gives you a half-chrome rat whose rim goes
         colour-shifted. It is a spec-gloss-era reflection map, mislabelled.

    Rebuilding from three known maps fixes both, plus every colour-space
    question, in about forty lines. `spec`, `metal`, `subsur` and `anisotropy`
    are all deliberately unused — the last two are referenced by nothing in the
    FBX at all.
    """
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (620, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (280, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def tex(fname, colorspace, y):
        img = bpy.data.images.load(os.path.join(TEXTURES, fname), check_existing=True)
        img.colorspace_settings.name = colorspace
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.location = (-460, y)
        n.interpolation = "Smart"
        return n

    nt.links.new(
        tex("blackrat_color.png", "sRGB", 240).outputs["Color"],
        socket(bsdf, "Base Color"),
    )

    if mat.name.endswith("eyes"):
        # Wet, so the eye light has something to catch.
        socket(bsdf, "Roughness").default_value = 0.10
    else:
        # Roughness earns its place on the rim, not the body: a constant value
        # gives a uniform, plastic-looking edge. 0.45 is the flat substitute if
        # this map ever has to go.
        nt.links.new(
            tex("blackrat_rough.png", "Non-Color", -40).outputs["Color"],
            socket(bsdf, "Roughness"),
        )

    # The normal map contributes almost nothing to the diffuse surface at this
    # scale, and everything to the rim: grazing light amplifies normal detail,
    # and that break-up along the back and haunch is what makes the edge read
    # as an animal rather than a vector shape.
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.location = (-140, -330)
    nt.links.new(
        tex("blackrat_normal.png", "Non-Color", -330).outputs["Color"],
        nm.inputs["Color"],
    )
    nt.links.new(nm.outputs["Normal"], socket(bsdf, "Normal"))

    socket(bsdf, "Metallic").default_value = 0.0  # NOT the metal map: see above
    spec = socket(bsdf, "Specular IOR Level", "Specular")
    if spec:
        spec.default_value = 0.5
    alpha = socket(bsdf, "Alpha")
    if alpha:
        alpha.default_value = 1.0  # never linked: the FBX's alpha is a normal map
    try:
        mat.blend_method = "OPAQUE"
    except (AttributeError, TypeError):
        pass  # removed in 5.x


def cmd_prep():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    log(f"importing {ZIP} (27k f-curves, this takes minutes) ...")
    import_fbx(stage_fbx())
    relink_textures()
    for mat in bpy.data.materials:
        rebuild_material(mat)
    os.makedirs(WORK, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    log(f"wrote {BLEND}")


def load_blend():
    if not os.path.exists(BLEND):
        sys.exit(f"{BLEND} missing — run `prep` first")
    bpy.ops.wm.open_mainfile(filepath=BLEND)


# ---------------------------------------------------------------------------
# geometry, pose, camera
# ---------------------------------------------------------------------------


def world_points(stride=4):
    """Sampled world-space verts of the DEFORMED mesh.

    `obj.bound_box` is the undeformed local box and is badly wrong for a
    running pose — the classic auto-framing bug. Evaluating through the
    depsgraph is the only way to frame what will actually be rendered.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in meshes():
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        # Index, don't slice: `bpy_prop_collection` rejects a slice *step*, and
        # complains about the indices rather than the step while doing it.
        vs = me.vertices
        pts.extend([mw @ vs[i].co for i in range(0, len(vs), stride)])
        ev.to_mesh_clear()
    return pts


def find_action(name):
    """Resolve an action by exact name, else by suffix.

    The importer names actions `<object>|<stack>`, and this FBX's stacks are
    already called `Mammals|idle_A2` — so they land as `Mammals|Mammals|idle_A2`.
    Matching on the suffix means rat-poses.json can just say `idle_A2` and stay
    readable, and survives a different importer prefixing differently.
    """
    act = bpy.data.actions.get(name)
    if act:
        return act
    hits = [a for a in bpy.data.actions if a.name.endswith(name)]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        sys.exit(f"{name!r} is ambiguous: {sorted(a.name for a in hits)}")
    return None


def set_pose(arm, action_name, frame):
    scene = bpy.context.scene
    if action_name in (None, "REST"):
        if arm.animation_data:
            arm.animation_data.action = None
        arm.data.pose_position = "REST"
        scene.frame_set(0)
    else:
        act = find_action(action_name)
        if act is None:
            sys.exit(
                f"no action {action_name!r}; have "
                f"{sorted(a.name for a in bpy.data.actions)}"
            )
        # Without this the actions evaluate into nothing and you render the
        # rest pose four times.
        arm.data.pose_position = "POSE"
        ad = arm.animation_data or arm.animation_data_create()
        ad.action = act
        # Blender >= 4.4 slotted actions. No-op on 4.2, correct on 5.x.
        if hasattr(ad, "action_slot") and getattr(act, "slots", None):
            if ad.action_slot is None:
                ad.action_slot = act.slots[0]
        # frame_set(), never `frame_current = n`: only the former forces a
        # depsgraph re-evaluation, and headless there is no redraw to cover
        # for it. Set it wrong and you render the previous pose.
        scene.frame_set(int(frame), subframe=float(frame) % 1.0)
    bpy.context.view_layer.update()


def make_camera(lens=85.0):
    for ob in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(ob, do_unlink=True)
    cd = bpy.data.cameras.new("bake_cam")
    # A long lens is near-orthographic: it flatters the silhouette and avoids
    # the wide-angle "cute nose" that would fight the whole ramp.
    cd.lens = lens
    cd.sensor_fit = "AUTO"
    cam = bpy.data.objects.new("bake_cam", cd)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def place(cam, target, az_deg, el_deg, dist):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = Vector(
        (
            math.cos(el) * math.sin(az),
            -math.cos(el) * math.cos(az),
            math.sin(el),
        )
    )  # target -> camera
    cam.matrix_world = Matrix.Translation(target + d * dist) @ (
        d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    )
    bpy.context.view_layer.update()


def _ndc(scene, cam, pts):
    return [world_to_camera_view(scene, cam, p) for p in pts]


def _shift_gain(scene, cam, pts):
    """Measure d(ndc)/d(shift) instead of trusting a sign convention.

    `Camera.view_frame` includes the lens shift, so positive `shift_x` moves
    the frame right and the content left. That is worth measuring rather than
    remembering: get the sign backwards and the framing loop diverges instead
    of converging, and the failure looks like a bad camera rather than a bad
    constant.
    """
    def centre():
        cs = _ndc(scene, cam, pts)
        return (
            sum(c.x for c in cs) / len(cs),
            sum(c.y for c in cs) / len(cs),
        )

    x0, y0 = centre()
    cam.data.shift_x += 0.01
    cam.data.shift_y += 0.01
    x1, y1 = centre()
    cam.data.shift_x -= 0.01
    cam.data.shift_y -= 0.01
    gx, gy = (x1 - x0) / 0.01, (y1 - y0) / 0.01
    return (gx if abs(gx) > 1e-6 else -1.0, gy if abs(gy) > 1e-6 else -1.0)


def frame_subject(cam, az, el, fill, stride=4, pts=None):
    """Solve distance and lens shift so the subject fills `fill` of the frame.

    Solved in NDC rather than by fitting a bounding sphere: the rat is roughly
    0.44 x 0.10 x 0.10 m, and a sphere fit on something that elongated wastes
    most of a square frame. `world_to_camera_view` already accounts for sensor
    fit, aspect and shift, so this converges exactly in a handful of passes.

    `pts` overrides the point cloud to solve against, and exists for `cmd_loop`:
    a cycle has to be framed against the union of every frame in it, solved once
    and then held. Framing each frame on its own pose is the obvious thing and
    it is wrong — it re-solves distance and shift per frame, so the camera
    breathes in and out around a walk cycle and the rat appears to bob on a
    boom. Default `None` keeps the still path solving against the live pose.
    """
    scene = bpy.context.scene
    if pts is None:
        pts = world_points(stride)
    lo = Vector((min(p[i] for p in pts) for i in range(3)))
    hi = Vector((max(p[i] for p in pts) for i in range(3)))
    target = (lo + hi) / 2.0

    cam.data.shift_x = cam.data.shift_y = 0.0
    dist = (hi - lo).length * 2.0
    place(cam, target, az, el, dist)
    gx, gy = _shift_gain(scene, cam, pts)

    for _ in range(16):
        place(cam, target, az, el, dist)
        cs = _ndc(scene, cam, pts)
        if any(c.z <= 0.0 for c in cs):  # subject behind the camera
            dist *= 1.6
            continue
        x0, x1 = min(c.x for c in cs), max(c.x for c in cs)
        y0, y1 = min(c.y for c in cs), max(c.y for c in cs)
        cam.data.shift_x += (0.5 - (x0 + x1) / 2.0) / gx
        cam.data.shift_y += (0.5 - (y0 + y1) / 2.0) / gy
        span = max(x1 - x0, y1 - y0)
        if abs(span - fill) < 0.003:
            break
        dist *= span / fill

    return target, (hi - lo).length / 2.0


# ---------------------------------------------------------------------------
# lighting
# ---------------------------------------------------------------------------


def clear_lights():
    for ob in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(ob, do_unlink=True)


def add_area(name, energy, color, size, loc, aim_at):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.color, ld.size, ld.shape = energy, color, size, "DISK"
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    d = Vector(loc) - aim_at
    ob.matrix_world = Matrix.Translation(loc) @ (
        d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    )
    return ob


def build_rig(cam, target, radius, spec):
    """Camera-relative, so the rig follows the shot instead of the world.

    Why a rim light and not a key: #0b0f14 is ~0.005 linear, the card is
    ~0.010, and the rat's albedo is ~0.043. Lighting a near-black animal
    brightly enough to separate from that ground stops it being a black rat.
    Drawing it as a CONTOUR instead is the only approach that also survives
    down to 96px, where the contour is all the information there is.
    """
    clear_lights()
    R = cam.matrix_world.to_3x3()
    right, up, back = R.col[0], R.col[1], R.col[2]
    r5 = radius * 5

    if spec["key"]:
        add_area(
            "key", spec["key"], KEY_COLOR, radius * 2.6,
            target + (back * 1.4 - right * 1.1 + up * 0.9).normalized() * r5,
            target,
        )
    add_area(
        "rim", spec["rim"], RIM_COLOR, radius * 0.9,
        target + (-back * 1.0 + right * 1.5 + up * 1.0).normalized() * r5,
        target,
    )
    if spec["rim_b"]:
        add_area(
            "rim_b", spec["rim_b"], (0.62, 0.72, 0.95), radius * 0.7,
            target + (-back * 1.0 - right * 1.4 + up * 0.5).normalized() * r5,
            target,
        )
    if spec["eye"]:
        add_area(
            "eye", spec["eye"], (1.0, 1.0, 1.0), radius * 0.15,
            target + (back * 1.0 + up * 0.35).normalized() * (radius * 3.5),
            target,
        )

    world = bpy.data.worlds.new("bake_world")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = AMBIENT_COLOR
    bg.inputs[1].default_value = spec["ambient"]


# ---------------------------------------------------------------------------
# render
# ---------------------------------------------------------------------------


def setup_render(size, samples):
    scene = bpy.context.scene
    # Cycles, not EEVEE. The usual advice is inverted here: EEVEE wants a live
    # OpenGL context, and this box is a tty with no DISPLAY and no xvfb.
    # Cycles needs no window system at all, and gives better grazing-angle
    # falloff on the rim — which is the entire legibility strategy.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPTIX"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.cycles.max_bounces = 8

    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    (prefs.refresh_devices if hasattr(prefs, "refresh_devices") else prefs.get_devices)()
    enabled = 0
    for d in prefs.devices:
        d.use = d.type in {"OPTIX", "CUDA"}
        enabled += d.use
    if not enabled:
        log("!! no OptiX/CUDA device — falling back to CPU")
        scene.cycles.device = "CPU"

    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.filter_size = 1.4
    scene.render.film_transparent = True  # the alpha channel

    # Standard, NOT AgX (the 4.x default) and not Filmic. The subject is a
    # 0.043-albedo animal lit almost entirely by a saturated rim — precisely
    # the two things AgX destroys: it crushes the shadow side to
    # undifferentiated black and desaturates the cool rim that carries the
    # editorial signal. Filmic's black lift makes the matte edge read as a grey
    # box on #0b0f14. Standard is a straight sRGB transfer, which is what you
    # want when compositing onto a known hex. If it comes out too contrasty,
    # nudge `exposure` — do not switch transform.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    return scene


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------


def cmd_probe():
    load_blend()
    arm = the_armature()
    print(f"\nblender      {bpy.app.version_string}")
    print(f"armature     {arm.name!r}  bones={len(arm.data.bones)}")
    print(f"scene fps    {bpy.context.scene.render.fps}")

    ms = meshes()
    print(f"\nmeshes ({len(ms)})")
    for m in ms:
        slots = [s.material.name if s.material else None for s in m.material_slots]
        print(
            f"  {m.name:22s} verts={len(m.data.vertices):7d} "
            f"polys={len(m.data.polygons):7d} {slots}"
        )

    print(f"\nactions ({len(bpy.data.actions)})")
    for a in sorted(bpy.data.actions, key=lambda a: a.name):
        s, e = a.frame_range
        print(
            f"  {a.name:30s} {s:6.0f}..{e:6.0f}  "
            f"({int(e - s) + 1:4d}f, {(e - s) / 30.0:5.2f}s)  curves={len(a.fcurves)}"
        )

    print(f"\nmaterials ({len(bpy.data.materials)})")
    bad = False
    for m in bpy.data.materials:
        print(f"  {m.name}")
        if not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                ok = "OK " if n.image.size[0] else "MISSING"
                print(
                    f"      {os.path.basename(n.image.filepath):24s} "
                    f"[{n.image.colorspace_settings.name:10s}] {ok}"
                )
                bad = bad or not n.image.size[0]
            if n.type == "BSDF_PRINCIPLED" and n.inputs["Alpha"].is_linked:
                # The import bug this script exists to work around. If this
                # ever prints, the matte is garbage and the bake is void.
                print("      !! ALPHA IS LINKED — the matte will be full of holes")
                bad = True

    set_pose(arm, "REST", 0)
    pts = world_points(4)
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    print(
        f"\nrest bbox    size="
        f"{tuple(round(h - l, 3) for l, h in zip(lo, hi))} m"
    )
    if bad:
        sys.exit("\nprobe FAILED — fix the above before baking")
    print("\nprobe OK")


def cmd_sheet():
    """Render every action at six frames, to choose the four poses from.

    One fixed camera for all tiles, deliberately: a contact sheet is for
    comparing poses, and a per-tile auto-frame would rescale each one and make
    them incomparable.
    """
    load_blend()
    arm = the_armature()
    scene = setup_render(160, 48)
    cam = make_camera(lens=70)
    os.makedirs(SHEET_DIR, exist_ok=True)

    set_pose(arm, "REST", 0)
    target, radius = frame_subject(cam, az=-55, el=15, fill=0.80, stride=8)
    build_rig(cam, target, radius, {**RAMP["watch"], "fill": 0.80})

    acts = sorted(bpy.data.actions, key=lambda a: a.name)
    cols = 6
    for a in acts:
        s, e = a.frame_range
        for i in range(cols):
            f = s + (e - s) * i / max(1, cols - 1)
            set_pose(arm, a.name, f)
            safe = a.name.replace("|", "_").replace("/", "_")
            render_to(os.path.join(SHEET_DIR, f"{safe}__{i}__f{int(f)}"))
        log(f"  {a.name}")
    log(f"\n{len(acts) * cols} tiles in {SHEET_DIR}")
    log("now: python3 web/scripts/rat-bake.py tile")


def load_poses():
    if os.path.exists(POSES):
        with open(POSES) as fh:
            spec = json.load(fh)
    else:
        log(f"{POSES} missing — using the starting guesses")
        spec = DEFAULT_POSES
    missing = [lv for lv in LEVELS if lv not in spec]
    if missing:
        sys.exit(f"rat-poses.json is missing levels: {missing}")
    return spec


def cmd_bake():
    load_blend()
    arm = the_armature()
    poses = load_poses()
    setup_render(RENDER_PX, 256)
    cam = make_camera(lens=85)
    os.makedirs(WORK, exist_ok=True)

    for level in LEVELS:
        spec, pose = RAMP[level], poses[level]
        set_pose(arm, pose["action"], pose["frame"])
        target, radius = frame_subject(cam, spec["az"], spec["el"], spec["fill"])
        build_rig(cam, target, radius, spec)
        render_to(os.path.join(WORK, f"rat-{level}"))
        log(f"  {level:10s} {pose['action']} @ {pose['frame']}")
    log(f"\nrendered to {WORK}")
    log("now: python3 web/scripts/rat-bake.py webp")


def loop_frames(act, n):
    """The `n` frame numbers of one cycle of `act`, sampled evenly.

    The last frame of a cyclic action repeats its first, so the range is sampled
    half-open — `s + (e - s) * i / n` for i in 0..n-1. Including both ends
    renders the same pose twice and the loop visibly hitches once per cycle.
    """
    s, e = act.frame_range
    return [s + (e - s) * i / float(n) for i in range(n)]


def cmd_loop():
    """Render `LOOP[level]["n"]` frames per level, for the animated WebPs.

    Everything about the look is shared with `cmd_bake` on purpose — same RAMP,
    same lens, same render settings, same action out of rat-poses.json. The only
    differences are that this renders a cycle instead of one frame, and that the
    camera is solved once against the union of the whole cycle (see
    `frame_subject`'s `pts` argument for why that matters).
    """
    load_blend()
    arm = the_armature()
    poses = load_poses()
    setup_render(RENDER_PX, 256)
    cam = make_camera(lens=85)

    for level in LEVELS:
        spec, pose, cyc = RAMP[level], poses[level], LOOP[level]
        act = find_action(pose["action"])
        if act is None:
            sys.exit(f"no action {pose['action']!r} for {level}")
        frames = loop_frames(act, cyc["n"])

        # Pass one: walk the cycle collecting deformed geometry, so the camera
        # can be framed against every pose it will have to hold. Cheap next to
        # rendering — no samples are taken here.
        pts = []
        for f in frames:
            set_pose(arm, pose["action"], f)
            pts.extend(world_points())

        target, radius = frame_subject(cam, spec["az"], spec["el"], spec["fill"], pts=pts)
        build_rig(cam, target, radius, spec)

        out = os.path.join(WORK, f"loop-{level}")
        os.makedirs(out, exist_ok=True)
        for i, f in enumerate(frames):
            set_pose(arm, pose["action"], f)
            render_to(os.path.join(out, f"{i:03d}"))
        log(f"  {level:10s} {pose['action']}  {cyc['n']} frames @ {cyc['fps']}fps")

    log(f"\nrendered to {WORK}/loop-*")
    log("now: python3 web/scripts/rat-bake.py loopwebp")


# ---------------------------------------------------------------------------
# the three passes that need Pillow, and therefore system python
# ---------------------------------------------------------------------------


def cmd_tile():
    from PIL import Image, ImageDraw

    names = sorted(f for f in os.listdir(SHEET_DIR) if f.endswith(".png"))
    if not names:
        sys.exit(f"no tiles in {SHEET_DIR} — run `sheet` first")
    rows = {}
    for n in names:
        # rsplit, because one of the actions is literally called `_Static Pose`
        # and a forward split on the `__` separator eats its name.
        action = n.rsplit("__", 2)[0]
        rows.setdefault(action, []).append(n)

    tile, pad, label = 160, 4, 18
    cols = max(len(v) for v in rows.values())
    sheet = Image.new(
        "RGB",
        (cols * (tile + pad) + pad, len(rows) * (tile + pad + label) + pad),
        (18, 24, 33),  # the card colour, so poses are judged against the page
    )
    draw = ImageDraw.Draw(sheet)
    for r, (action, files) in enumerate(sorted(rows.items())):
        y = pad + r * (tile + pad + label)
        draw.text((pad, y), action, fill=(232, 238, 245))
        for c, f in enumerate(sorted(files)):
            im = Image.open(os.path.join(SHEET_DIR, f)).convert("RGBA")
            sheet.paste(im, (pad + c * (tile + pad), y + label), im)
            draw.text(
                (pad + c * (tile + pad) + 3, y + label + tile - 12),
                f.split("__")[-1].replace(".png", ""),
                fill=(125, 139, 156),
            )
    out = os.path.join(WORK, "contact.png")
    sheet.save(out)
    log(f"wrote {out}  ({len(rows)} actions x {cols} frames)")


def deliver(src):
    """One render -> one delivery-sized RGBA image, alpha-correct.

    ⚠️ **Premultiply before resizing.** Blender writes STRAIGHT alpha with black
    RGB in fully-transparent pixels; a naive Lanczos downsample bleeds that
    black into the semi-transparent edge and haloes the silhouette against the
    card. Premultiply -> resize -> unpremultiply is the fix, and it is why this
    is a shared function rather than two similar loops: the still path and the
    loop path must not be able to disagree about it.
    """
    import numpy as np
    from PIL import Image

    im = np.asarray(Image.open(src).convert("RGBA"), dtype=np.float64)
    a = im[..., 3:4] / 255.0
    pre = np.concatenate([im[..., :3] * a, im[..., 3:4]], axis=-1)
    small = np.asarray(
        Image.fromarray(pre.astype(np.uint8), "RGBA").resize(
            (DELIVER_PX, DELIVER_PX), Image.LANCZOS
        ),
        dtype=np.float64,
    )
    a2 = small[..., 3:4] / 255.0
    rgb = np.divide(small[..., :3], a2, out=np.zeros_like(small[..., :3]), where=a2 > 0)
    out_arr = np.concatenate([np.clip(rgb, 0, 255), small[..., 3:4]], axis=-1)
    return Image.fromarray(out_arr.astype(np.uint8), "RGBA")


def cmd_webp():
    os.makedirs(PUBLIC, exist_ok=True)
    total = 0
    for level in LEVELS:
        src = os.path.join(WORK, f"rat-{level}.png")
        if not os.path.exists(src):
            sys.exit(f"{src} missing — run `bake` first")
        dst = os.path.join(PUBLIC, f"rat-{level}.webp")
        deliver(src).save(dst, "WEBP", quality=WEBP_QUALITY, method=6)
        n = os.path.getsize(dst)
        total += n
        log(f"  rat-{level}.webp  {n / 1024:6.1f} KB")
    log(f"\n{total / 1024:.1f} KB total -> {PUBLIC}")


def cmd_loopwebp():
    """Encode each rendered cycle as one animated WebP.

    Pillow rather than `img2webp`, having checked: on these frames the two agree
    to the byte on alpha (max difference 0 across the set) and land within 6
    bytes of each other on size, so shelling out would buy a dependency and
    nothing else.

    `loop=0` is infinite. `duration` is per-frame milliseconds derived from the
    tempo ramp, so the pacing that carries the shrinking-character rule is encoded into the file
    rather than left to a CSS animation someone can retime.
    """
    os.makedirs(PUBLIC, exist_ok=True)
    total = 0
    for level in LEVELS:
        d = os.path.join(WORK, f"loop-{level}")
        srcs = sorted(f for f in os.listdir(d)) if os.path.isdir(d) else []
        srcs = [os.path.join(d, f) for f in srcs if f.endswith(".png")]
        if not srcs:
            sys.exit(f"{d} has no frames — run `loop` first")

        want = LOOP[level]["n"]
        if len(srcs) != want:
            sys.exit(f"{d} has {len(srcs)} frames, expected {want} — re-run `loop`")

        frames = [deliver(s) for s in srcs]
        dst = os.path.join(PUBLIC, f"rat-{level}-loop.webp")
        frames[0].save(
            dst,
            "WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=int(round(1000.0 / LOOP[level]["fps"])),
            loop=0,
            quality=WEBP_QUALITY,
            method=6,
        )
        n = os.path.getsize(dst)
        total += n
        log(
            f"  rat-{level}-loop.webp  {n / 1024:6.1f} KB  "
            f"{len(frames)} frames @ {LOOP[level]['fps']}fps"
        )
    log(f"\n{total / 1024:.1f} KB total -> {PUBLIC}")
    log("the stills stay: the panel shows one under every loop. Commit both sets.")


COMMANDS = {
    "prep": cmd_prep,
    "probe": cmd_probe,
    "sheet": cmd_sheet,
    "bake": cmd_bake,
    "loop": cmd_loop,
    "tile": cmd_tile,
    "webp": cmd_webp,
    "loopwebp": cmd_loopwebp,
}
NEEDS_BLENDER = {"prep", "probe", "sheet", "bake", "loop"}


def main():
    args = argv_after_ddash()
    cmd = args[0] if args else ""
    if cmd not in COMMANDS:
        sys.exit(f"usage: {' | '.join(COMMANDS)}  (see the docstring)")
    if cmd in NEEDS_BLENDER and not INSIDE_BLENDER:
        sys.exit(
            f"`{cmd}` must run inside Blender:\n"
            f"  blender -b --factory-startup --python web/scripts/rat-bake.py -- {cmd}"
        )
    if cmd not in NEEDS_BLENDER and INSIDE_BLENDER:
        sys.exit(f"`{cmd}` needs system python and its Pillow, not Blender's")
    COMMANDS[cmd]()


if __name__ == "__main__":
    main()
