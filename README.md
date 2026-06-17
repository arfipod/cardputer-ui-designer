# Cardputer UI Designer

Complete Node-based web app for designing small UIs for the M5Stack Cardputer-Adv display.

The app is calibrated for the official Cardputer-Adv display size, 240 x 135 px in landscape, with an optional 135 x 240 px portrait preset for experiments. It is intentionally dependency-free: no Vite, no React, no build tool downloads. Node is used for the local development server, static build copy, preview server and automated tests.

## Features

- 240 x 135 px Cardputer-Adv canvas.
- Optional portrait preset.
- Add, move, resize, duplicate and delete elements.
- Layers panel with front/back/up/down controls.
- Inspector for position, size, colors, text, progress values, icon type and sparkline points.
- Grid, snap and zoom controls.
- Undo/redo history.
- Local browser autosave.
- Import/export project JSON.
- Export PNG from the SVG canvas.
- Export generated M5GFX/M5Cardputer C++ drawing code.
- Export generated LVGL C skeleton.
- GitHub Pages workflow included.

## Requirements

- Node.js 20 or newer.
- No package installation is required.

## Run Locally

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

This creates a static `dist/` folder.

## Preview Build

```bash
npm run preview
```

Then open:

```text
http://localhost:4173
```

## Test

```bash
npm test
```

The tests use the built-in Node test runner and cover document creation, geometry, device presets and code generation.

## Repository Structure

```text
.
├── index.html
├── package.json
├── public/
│   └── cardputer-icon.svg
├── scripts/
│   ├── build.mjs
│   └── dev-server.mjs
├── src/
│   ├── core/
│   │   ├── document.js
│   │   ├── geometry.js
│   │   └── storage.js
│   ├── exporters/
│   │   ├── cpp.js
│   │   ├── lvgl.js
│   │   └── project.js
│   ├── main.js
│   └── styles/
│       └── app.css
└── test/
    └── document.test.js
```

## Firmware Export Notes

The M5GFX export is a practical starting point, not a final firmware abstraction. It emits direct calls such as `fillRoundRect`, `drawString`, `drawLine`, `drawCircle` and `color565`.

Recommended next firmware step:

1. Export the generated C++.
2. Put `drawGeneratedUi()` in a UI module of your Cardputer firmware.
3. Replace image placeholders with real bitmap assets.
4. Replace text-size heuristics with project fonts if needed.
5. Add input/event handling separately.

The LVGL export is a skeleton. It creates labels, buttons, bars and arcs where possible, and leaves custom object styling for the firmware project.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs:

```bash
npm run check
```

and publishes `dist/`.

In GitHub, enable Pages from GitHub Actions.

Visit this link [https://arfipod.github.io/cardputer-ui-designer/](https://arfipod.github.io/cardputer-ui-designer/)
