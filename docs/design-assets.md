# Design assets

The README header's sources are too large for this repository and live
outside it, on Shawn's Mac:

```
~/projects/freemail/readme-header
```

Everything in it comes from an isolated backend's seeded mail
([simulator-sign-in.md](simulator-sign-in.md)), so nothing in it is real.

- `screens/`: the phone screens, from the iPhone 17 Pro simulator in dark
  mode: the inbox, Settings, and the Clean view of a sign-in code.
- `add_island.py`: paints the Dynamic Island, which screenshots leave out,
  onto each screen and writes `textures/`.
- `web-capture/`: `capture.mjs` signs the website in as the isolated
  backend's test owner (its dev sign-in route) and screenshots it in dark
  mode at 1470×891 points, 2x. `frame.mjs` puts that inside a macOS menu bar
  and window (`frame.html`) and writes `textures/laptop-web.png` at the
  laptop's 2940×1912.
- `build_scene.py`: a thin laptop built to a 13-inch MacBook Air's
  proportions (30.41 × 21.5 × 1.13 cm, a 13.6-inch display behind even 5 mm
  bezels, full keyboard, trackpad, hinge, and feet), turned left on the
  right of the frame, and three of SYNQ's iPhone 17 Pros
  (`~/projects/SYNQ/3d/3.0/v6`) on aluminum stands on the left: the code in
  front, Settings and the inbox behind it, turned in. Each phone is aimed at
  the camera first, then turned, so it faces the viewer. They sit on a dark
  table before a far wall that the depth of field softens, under a soft
  studio key and edge strips, rendered in Cycles with AgX and a light bloom.
  The lens and shift are fitted so the laptop's screen lands where the
  layout says.
- `mockups.py`: every layout tried, by name. `FREEMAIL_MOCKUP=F2b` is the
  header; the others are the rounds of mockups (`mockups/`).
- `post.py`: the finish after the render: a soft vignette, a gentle S-curve,
  and fine grain.
- `freemail_readme_header.blend`: the scene, with the images packed in. F12
  renders it before `post.py`.
- `render.png`, `final.png`: the render at 5200×2600, and after `post.py`.
- `v1/`, `v2/`: the earlier headers (five phones; then three floating phones
  and a laptop).

To change it, from that folder, with an isolated backend and only the web
app running (`pnpm -F @freemail/web dev`):

```sh
# phone screens: dark mode, a full battery and bars, the clock matching the mail
xcrun simctl status_bar <udid> override --time 12:24 \
  --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python add_island.py
(cd web-capture && node capture.mjs https://<worktree>.www.freemail.local web.png && node frame.mjs)
FREEMAIL_MOCKUP=F2b $B -b --factory-startup --python build_scene.py -- "$PWD/render.png" 100 256 save
$B -b --factory-startup --python post.py -- "$PWD/render.png" "$PWD/final.png"
sips -s format jpeg -s formatOptions 88 --resampleWidth 2200 final.png \
  --out <repo>/docs/images/readme-header.jpg
# GitHub's social preview (Settings → General → Social preview), 1280×640
sips -s format jpeg -s formatOptions 90 --resampleWidth 1280 final.png \
  --out <repo>/docs/images/social-preview.jpg
```

`build_scene.py` takes the output file, the resolution percentage, and the
sample count; `save` also writes the `.blend`. Render at 25% with about 48
samples to check the framing first. The scene is in centimeters, so the
script scales the f-stop by the unit scale; otherwise Blender sizes the
aperture as if in meters and nothing ever falls out of focus.
