# Design assets

The README header's sources are too large for this repository and live
outside it, on Shawn's Mac:

```
~/projects/freemail/readme-header
```

- `screens/`: the captured screens, from the iPhone 17 Pro simulator in dark
  mode, signed in to an isolated backend's seeded mail
  ([simulator-sign-in.md](simulator-sign-in.md)), so nothing in them is real.
- `add_island.py`: paints the Dynamic Island, which screenshots leave out,
  onto each screen and writes `textures/`.
- `build_scene.py`: SYNQ's App Store scene (`~/projects/SYNQ/3d/3.0/v6`)
  with Freemail's screens and a graphite backdrop. It builds every phone from
  Apple's iPhone 17 Pro numbers, centers each of the five panels, and renders.
- `freemail_readme_header.blend`: the scene, with the images packed in. F12
  renders the panorama.
- `panorama.png`: the render, 6600×2868.

To change it, capture new screens into `screens/` (dark mode, 9:41, full
battery and bars: `xcrun simctl status_bar <udid> override --time 9:41
--batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3`),
then from that folder:

```sh
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python add_island.py
$B -b --factory-startup --python build_scene.py -- "$PWD/panorama.png" 100 128 save
sips -s format jpeg -s formatOptions 85 --resampleWidth 2200 panorama.png \
  --out <repo>/docs/images/readme-header.jpg
```

`build_scene.py` takes the output file, the resolution percentage, and the
sample count; `save` also writes the `.blend`. Render at 25% with about 48
samples to check the framing first.
