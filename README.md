# Cardputer UI Designer

Complete Node-based web app for designing small UIs for the M5Stack Cardputer-Adv display.

The app is calibrated for the official Cardputer-Adv display size, 240 x 135 px in landscape, with an optional 135 x 240 px portrait preset for experiments. It is intentionally dependency-free for the designer itself: no Vite, no React, no build tool downloads.

## Features

- 240 x 135 px Cardputer-Adv canvas.
- Optional portrait preset.
- Project model with multiple screens.
- Flow transitions between screens.
- Add, move, resize, duplicate and delete elements.
- Screen panel with add, duplicate, rename, delete and start-screen controls.
- Layers panel with front/back/up/down controls.
- Inspector for position, size, colors, text, progress values, icon type, sparkline points and navigation events.
- TTF upload with browser preview and bitmap-font firmware export variants.
- Grid, snap and zoom controls.
- Undo/redo history.
- Local browser autosave through IndexedDB, with localStorage fallback.
- Import/export project JSON.
- Export/import LVGL-style XML text bundles with `cu:` metadata for round-trip data.
- Export PNG from the SVG canvas.
- Export generated M5GFX/M5Cardputer multi-file firmware bundle.
- PlatformIO/ESP-IDF hardware smoke-test harness for Cardputer Adv.
- GitHub Pages workflow included.

## Requirements

- Node.js 20 or newer.
- PlatformIO CLI for hardware firmware build/upload commands.
- A Cardputer Adv connected over USB for `firmware:upload` and `firmware:monitor`.

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

The tests use the built-in Node test runner and cover project creation, migration, flow, storage and code generation.

## Cardputer Adv Hardware Test

This repo includes a PlatformIO/ESP-IDF smoke-test firmware in `firmware/cardputer_adv_ui_test`. It is based on the same `esp32-s3-devkitc-1` + ESP-IDF setup used by the `pocket_synth` Cardputer Adv example project.

List serial ports:

```bash
npm run firmware:ports
```

Build the default generated UI firmware:

```bash
npm run firmware:build
```

Upload the default generated UI firmware to the connected Cardputer Adv:

```bash
npm run firmware:upload
```

Build or upload a UI exported from the designer:

```bash
npm run firmware:build -- path/to/project.cardputer-ui.json
npm run firmware:upload -- path/to/project.cardputer-ui.json
```

Override the detected serial port when needed:

```bash
$env:CARDPUTER_PORT="COM5"
npm run firmware:upload -- path/to/project.cardputer-ui.json
```

Open the serial monitor:

```bash
npm run firmware:monitor
```

The uploader auto-detects ESP32-S3 USB Serial/JTAG devices with `VID:PID=303A:1001`. The smoke firmware logs `cardputer_ui_smoke: UI alive on screen=0` when it has booted.

## Repository Structure

```text
.
|-- index.html
|-- package.json
|-- public/
|   `-- cardputer-icon.svg
|-- scripts/
|   |-- build.mjs
|   |-- cardputer-firmware.mjs
|   `-- dev-server.mjs
|-- src/
|   |-- core/
|   |   |-- assets.js
|   |   |-- document.js
|   |   |-- geometry.js
|   |   |-- project.js
|   |   `-- storage.js
|   |-- exporters/
|   |   |-- cpp.js
|   |   |-- firmware.js
|   |   |-- fonts.js
|   |   |-- lvgl.js
|   |   |-- project.js
|   |   `-- xml.js
|   |-- main.js
|   `-- styles/
|       `-- app.css
|-- firmware/
|   `-- cardputer_adv_ui_test/
|       |-- platformio.ini
|       |-- sdkconfig.defaults
|       `-- src/
|           |-- CMakeLists.txt
|           |-- cardputer_adv_display.h
|           |-- generated/
|           `-- main.cpp
`-- test/
    `-- project.test.js
```

## Project Format

The editable format is a version 3 JSON project. It contains shared project metadata, the Cardputer device preset, grid settings, screens, reusable assets, styles and a flow table.

Older version 2 JSON documents are migrated automatically into a one-screen project. The canonical project export is self-contained: uploaded TTF files are stored as base64 assets.

The XML export is intended for interoperability with LVGL-style tooling. It writes a text bundle containing `project.xml`, `globals.xml`, one XML file per screen and font placeholders. Cardputer-specific data is kept in the `cu:` namespace so it can be imported back into the designer.

## Firmware Export Notes

The M5GFX export is now a multi-file firmware bundle. It emits:

- `cardputer_ui.h/.cpp`
- `cardputer_ui_assets.h/.cpp`
- `cardputer_ui_fonts.h/.cpp`
- `esp-idf/CMakeLists.txt`
- `platformio/main.cpp.example`

The generated API is:

```cpp
void cardputer_ui_init(lgfx::LGFX_Device* display);
void cardputer_ui_draw(CardputerScreenId screen);
CardputerScreenId cardputer_ui_handle_event(CardputerScreenId current, CardputerUiEvent event);
CardputerScreenId cardputer_ui_handle_element_event(CardputerScreenId current, const char* elementId, CardputerUiEvent event);
```

Recommended next firmware step:

1. Export the generated M5GFX bundle.
2. Split the sections into the matching files in your ESP-IDF or PlatformIO project.
3. Call `cardputer_ui_init(&display)` after display setup.
4. Track the current `CardputerScreenId` in your app loop.
5. Map keyboard/buttons to `CardputerUiEvent` and redraw after transitions.

Uploaded TTF fonts are previewed in the browser and exported as bitmap subsets. By default, variants use the `0x20-0x7F` glyph range plus any extra symbols configured in the font panel.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs:

```bash
npm run check
```

and publishes `dist/`.

In GitHub, enable Pages from GitHub Actions.

Visit this link: [https://arfipod.github.io/cardputer-ui-designer/](https://arfipod.github.io/cardputer-ui-designer/)
