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
- `build_scene.py`: SYNQ's iPhone 17 Pro model
  (`~/projects/SYNQ/3d/3.0/v6`), three phones, and a thin laptop built to a
  13-inch MacBook Air's proportions (30.41 × 21.5 × 1.13 cm, a 13.6-inch
  display, full keyboard, trackpad, and hinge), on a graphite backdrop.
- `freemail_readme_header.blend`: the scene, with the images packed in. F12
  renders it.
- `panorama.png`: the render, 5520×2400.
- `v1/`: the first header, five phones and no laptop.

To change it, from that folder, with an isolated backend and only the web
app running (`pnpm -F @freemail/web dev`):

```sh
# phone screens: dark mode, a full battery and bars, the clock matching the mail
xcrun simctl status_bar <udid> override --time 12:24 \
  --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python add_island.py
(cd web-capture && node capture.mjs https://<worktree>.www.freemail.local web.png && node frame.mjs)
$B -b --factory-startup --python build_scene.py -- "$PWD/panorama.png" 100 160 save
sips -s format jpeg -s formatOptions 85 --resampleWidth 2200 panorama.png \
  --out <repo>/docs/images/readme-header.jpg
```

`build_scene.py` takes the output file, the resolution percentage, and the
sample count; `save` also writes the `.blend`. Render at 25% with about 32
samples to check the framing first.
