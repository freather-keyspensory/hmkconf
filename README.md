# hmkconf - Web Configurator for libhmk Keyboards

For more information about libhmk, see the [libhmk repository](https://github.com/peppapighs/libhmk).

## Keyspensory workspace 0.1

[Try the public beta](https://config.keyspensory.store/beta/unified/) in desktop Chrome or Edge. Connect your keyboard and choose **Connect a keyboard** to grant browser access. ZMK Studio boards can use USB serial or supported Web Bluetooth. VIA and HMK boards use USB HID. Completed edits on connected hardware can change the keyboard.

The beta runs on GitHub Pages. To reproduce the static build, run `npm ci`, `npm run check`, then `CONFIG_BASE_PATH=/beta VITE_FIRMWARE_BUILDS=disabled npm run build`. Serve the contents of `build` under `/beta/`. Native macOS Bluetooth discovery and the firmware compilation worker run locally.

Run `npm run dev` and open `/hmkconf/unified/` on the local server. The original HMK configurator stays at `/hmkconf/`; the earlier interaction prototypes, including firmware planning, stay at `/hmkconf/unified/lab/?demo=true`. The lab is not a list of supported hardware features.

The workspace opens a single detected keyboard and shows a chooser when several are available. Use **Change keyboard** to switch. Choose new USB devices once in the browser. The Mac local server also discovers connected Bluetooth keyboards that expose ZMK Studio using CoreBluetooth and the Swift command-line tools. On the public beta, choose **Bluetooth · ZMK Studio** to open the browser picker. If your keyboard is missing, enter its exact name from Bluetooth settings and choose **Find this keyboard**. The browser cannot list the computer’s Bluetooth connections. The workspace lists a Bluetooth keyboard once it opens a Studio session and drops it when the session disconnects.

### Local firmware builds

Open **Studio modules** in the workspace or a ZMK session. The builder reads a public GitHub config with `config/west.yml` and a root `build.yaml`. Choose a board/shield target and modules, then download its compiled image. A split keyboard can have separate targets for each half. The build uses the selected repository revision and its keymap. Device-specific devicetree declarations and module settings can be supplied under **Additional module and build settings**.

The local macOS worker uses Python 3.9+ with PyYAML, a Python environment with west and the Zephyr/ZMK Python build dependencies, CMake, Ninja, and an Arm GNU embedded toolchain. Set `ZMK_BUILD_VENV` to the Python environment and `ZMK_ARM_TOOLCHAIN` to the compiler installation directory. Run `npm run firmware:serve` alongside `npm run dev` or `npm run preview`. Vite forwards firmware requests to the worker on loopback port 4187. Static hosting needs a separately hosted worker to offer downloads.

Builds run in temporary working directories. The compilation phase runs offline. Completed images and logs are kept under `~/Library/Caches/keyspensory-firmware`, or in `ZMK_BUILD_STORAGE` when set.

| Interface | Editable in 0.1 | Save contract |
| --- | --- | --- |
| VIA | Native keycodes, definition menus, and supported lighting | Lighting appears under Keyboard tools only when declared; unrelated custom controls stay separate. Brightness, speed and color stream to the device during input, then the final setting is read back and saved on commit. Effects apply on selection. |
| ZMK Studio | Native behavior bindings and physical layouts | Commit automatically, check pending changes, and read the result back. Typing a parameter waits for a short pause. Do not silently commit changes found on arrival. |
| HMK | Native profile, remap, actuation, advanced key, gamepad and calibration tools | Serialize edits on the active board. Read key assignments back; other settings report command acceptance, not independent flash verification. Capturing a calibration threshold is an explicit device action. |

Under **Keyboard tools → Layout**, VIA reads options and presets from the matched JSON definition and the active choices from the keyboard. ZMK lists the physical layouts reported by Studio. Both save selections to the keyboard automatically and read them back. HMK reads layout options from firmware metadata and remembers each keyboard’s choices in this browser. A board with one fixed layout shows its geometry directly.

Samples are in-memory devices, never a fallback destination for hardware writes. The tester defaults to a full-size keyboard driven by browser key events. Test matrix switches to the connected board’s raw switch positions on compatible VIA firmware; the VIA sample includes a simulated switch pulse. VIA, Studio and HMK share the physical-key canvas, numbered layer buttons and basic key picker. HMK carries a selected key from Keymap to Key feel.

**Studio modules** reads the connected keyboard’s custom subsystem list and matches it against the [Keyspensory editor catalog](https://github.com/freather-keyspensory/zmk-module-catalog). Use the repository settings gear on the same page to add a public GitHub repository or HTTPS catalog JSON. Authors can publish several editors in one catalog. ZMK repositories with GitHub Pages can also match by their firmware-advertised editor URL. The browser remembers repositories and the last successful catalog. The host OS readout runs inside Keyspensory. Opening a standalone editor releases the keyboard connection so the editor can connect directly. Firmware installation runs through the board’s ZMK build.

**Hardware acceptance before release:** Connect → edit → disconnect → power-cycle → reconnect and read back on a representative VIA, Studio, and HMK board. Also test locked Studio, interrupted saves, and module discovery on firmware with and without the custom protocol. Browser samples validate UI and protocol flows, not physical persistence. The original configurators remain available for features not yet integrated.

## Prerequisites

- [Node.js](https://nodejs.org/en/)
- [bun](https://bun.sh)

## Getting Started

1. Install the dependencies:

```bash
bun install
```

2. Start the development server:

```bash
bun dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result.
