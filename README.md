# Cardputer UI Designer

Complete Node-based web app for designing small UIs for the M5Stack Cardputer-Adv display.

The app is calibrated for the official Cardputer-Adv display size, 240 x 135 px in landscape, with an optional 135 x 240 px portrait preset for experiments. It is intentionally dependency-free for the designer itself: no Vite, no React, no build tool downloads.

## Features

- 240 x 135 px Cardputer-Adv canvas.
- Optional portrait preset.
- Project model with multiple screens.
- Flow transitions between screens.
- Add, move, resize, duplicate and delete elements, including multi-selection for batch edits.
- Screen panel with add, duplicate, rename, delete and start-screen controls.
- Layers panel with visibility, locking and front/back/up/down controls.
- Inspector for position, size, colors, text, progress values, icon type, sparkline points and navigation events.
- TTF upload with browser preview and bitmap-font firmware export variants.
- Grid, smart alignment guides, snap and zoom controls.
- Undo/redo history.
- Central command palette and shortcut dialog for discoverable editor actions.
- Context menu and toolbar actions share the same command registry where possible.
- Local browser autosave through IndexedDB, with localStorage fallback.
- Import/export project JSON.
- Export/import LVGL-style XML text bundles with `cu:` metadata for round-trip data.
- Export PNG from the SVG canvas.
- Export generated M5GFX/M5Cardputer multi-file firmware bundle.
- Build and upload the currently open UI to Cardputer Adv from the local designer.
- PlatformIO/ESP-IDF generated-UI runtime for Cardputer Adv.
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

The tests use the built-in Node test runner and cover project creation, migration, flow, storage, editor action dispatch, history behavior, snapping, multi-selection helpers and code generation.

## Cardputer Adv Hardware Upload

This repo includes a PlatformIO/ESP-IDF firmware project in `firmware/cardputer_adv_ui_test`. The local dev server can compile and upload the UI currently open in the designer, and the CLI can do the same from a project JSON file.

From the web app, run the local server:

```bash
npm run dev
```

Then use `Build Board` or `Upload Board` in the top toolbar. These buttons call the local `/api/firmware` endpoint, generate the same firmware sources as the preview/export path, run PlatformIO, and auto-detect the Cardputer Adv USB serial port.

List serial ports:

```bash
npm run firmware:ports
```

Build the default generated UI firmware:

```bash
npm run firmware:build
```

Upload the last generated UI firmware to the connected Cardputer Adv:

```bash
npm run firmware:upload
```

Without a project path, the CLI reuses `firmware/cardputer_adv_ui_test/generated-project.cardputer-ui.json` when it exists. This is the same project file written by the web designer build/upload flow. If that file is not present, the CLI falls back to the built-in demo project.

Compile and upload in one CLI command:

```bash
npm run firmware:flash -- path/to/project.cardputer-ui.json
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

The uploader auto-detects ESP32-S3 USB Serial/JTAG devices with `VID:PID=303A:1001`. The runtime logs `cardputer_ui_runtime: UI alive screen=0` when it has booted.

### Framebuffer Debug Dump

The firmware can dump the full RGB565 framebuffer over the same USB serial port used by the monitor. Open the monitor, then type one of these commands and press Enter:

```text
fb
fb logical
widgets
ui
```

`fb` returns the framebuffer in `native_panel` order: the exact 135 x 240 RGB565 stream order sent to the ST7789 panel after the Cardputer-Adv rotation transform. `fb logical` returns the designer/runtime framebuffer in normal 240 x 135 landscape coordinates.

`widgets` switches the device to the built-in widget gallery. The gallery exercises the complete firmware UI widget set: Text, Button, Panel, Rect, Line, Progress in horizontal and 90-degree vertical orientation, Gauge, LED, Icon, Sparkline, and Image. Use `ui` to switch back to the UI generated from the web designer.

The dump is delimited so tools can capture it reliably:

```text
CARDPUTER_FRAMEBUFFER_BEGIN
format=RGB565_HEX_BE
order=native_panel
logical_width=240
logical_height=135
native_width=135
native_height=240
dump_width=135
dump_height=240
bytes=64800
checksum_fnv1a=0x...
data:
...
CARDPUTER_FRAMEBUFFER_END
```

Each pixel is one four-character RGB565 hex word in big-endian/readable order, so `F800` is red, `07E0` is green, and `001F` is blue. A complete dump is `64800` bytes of pixel data encoded as hex text.

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

The firmware export is a multi-file vanilla ESP-IDF bundle. It emits:

- `cardputer_ui.h/.cpp`
- `cardputer_ui_assets.h/.cpp`
- `cardputer_ui_fonts.h/.cpp`
- `esp-idf/CMakeLists.txt`
- `platformio/main.cpp.example`

The generated API is:

```cpp
void cardputer_ui_init(CardputerDisplay* display);
void cardputer_ui_draw(CardputerScreenId screen);
CardputerScreenId cardputer_ui_handle_event(CardputerScreenId current, CardputerUiEvent event);
CardputerScreenId cardputer_ui_handle_element_event(CardputerScreenId current, const char* elementId, CardputerUiEvent event);
```

The bundled PlatformIO runtime calls `cardputer_ui_init(&display)`, draws `CARDPUTER_UI_START_SCREEN`, and runs separate FreeRTOS tasks for keyboard input and display/screen transitions.

For low-level display debugging, `CardputerDisplay::dumpFramebuffer(stdout, CardputerFramebufferDumpOrder::NativePanel)` writes the exact panel-order framebuffer described above. Use `CardputerFramebufferDumpOrder::Logical` when you want the unrotated 240 x 135 designer coordinate space.

Uploaded TTF fonts are previewed in the browser and exported as bitmap subsets. By default, variants use the `0x20-0x7F` glyph range plus any extra symbols configured in the font panel.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs:

```bash
npm run check
```

and publishes `dist/`.

In GitHub, enable Pages from GitHub Actions.

Visit this link: [https://arfipod.github.io/cardputer-ui-designer/](https://arfipod.github.io/cardputer-ui-designer/)
