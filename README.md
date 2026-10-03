# RetroArch for Tizen

**English** · [Türkçe](README.tr.md)

RetroArch for Samsung Tizen smart TVs. It adds a TV-specific layer on top of the
[libretro web player](https://web.libretro.com/) (RetroArch compiled to WebAssembly):

- Launcher you drive with the TV remote (pick a system → pick a ROM → play)
- Remote keys mapped to RetroArch controls, USB/Bluetooth gamepad support
- **Send games from your phone via QR code** (TizenBrew): scan the QR code on the TV, pick a ROM, it starts on the TV
- Load ROMs from a **USB drive** (.wgt only) or a **network folder** (HTTP)
- Lightweight RGUI menu and defaults tuned for TVs
- Saves and settings persist on the TV (IndexedDB)

## Installation

### A) TizenBrew module (easiest)

In TizenBrew's module manager, add:

```
gh/Sype0/retroarch-tizen
```

### B) .wgt app (needed for USB support)

In TizenBrew Installer, choose **install from a GitHub repository** and enter `Sype0/retroarch-tizen`,
or install `RetroArch.wgt` from the [Releases](https://github.com/Sype0/retroarch-tizen/releases) page
from a USB drive. On Tizen 7+ TVs the installer re-signs the package with your own certificate.

The app shell runs on the TV; the emulator cores (wasm) are downloaded from
<https://sype0.github.io/retroarch-tizen/> when you start them, so the TV needs internet access.

## Loading ROMs

**From your phone (QR, easiest):** when running as a TizenBrew module, a QR code appears in the top
right of the home screen. Scan it with your phone → pick the ROM on the page that opens (select the
.cue and .bin together for CD games) → *Play on TV*. The system is picked from the file
extension. Sending a new game while one is running switches the TV to it.
The ROM never leaves your network: it goes straight from the phone to a small service running on the
TV ([`tizenbrew/service.js`](tizenbrew/service.js), port 8085). Phone and TV must be on the same Wi-Fi.
Not available in the .wgt version, because a .wgt app cannot run a server on the TV.

**Network folder:** on the computer or phone that has your ROMs (Termux works too):

```sh
python3 tools/rom-server.py /path/to/roms
```

Enter the address it prints (e.g. `http://192.168.1.20:8000/`) on the TV under
*Load ROM from network folder*. The address is remembered.

**USB:** copy the ROMs to a USB drive, plug it into the TV, choose *Load ROM from USB drive*.

## Remote control (in game)

| Key | Action |
| --- | --- |
| Arrow keys | D-Pad |
| OK | A (confirm in menus) |
| Back | B (back in menus) |
| Red / 0 | RetroArch menu |
| Green / Yellow | Start / Select |
| Blue / 2 | X / Y |
| 1 / 3 | L / R |
| CH+ / CH− | Save / load state |
| Play/Pause | Pause |

To leave a game, choose **Quit RetroArch** in the menu.

## Systems

NES, SNES, Game Boy / Color / Advance, Sega Master System / Game Gear / Mega Drive / CD / 32X,
PlayStation, PC Engine, Arcade (FBA 2012 CPS-1/2/Neo Geo, MAME 2003-Plus, FinalBurn Neo),
Atari 2600 / Lynx, Neo Geo Pocket, WonderSwan, Virtual Boy, Doom. Full list: [`tools/cores.txt`](tools/cores.txt).

**Nintendo 64 (experimental):** libretro doesn't build N64 for the web, so this repo builds
Mupen64Plus-Next from source ([`extra-cores.yml`](.github/workflows/extra-cores.yml)). WebAssembly has
no dynarec, so the emulator runs as an interpreter; on a TV CPU most 3D games (Ocarina of Time
included) run below full speed. To see the frame rate: RetroArch menu → *Settings → On-Screen Display →
Notification → Display Framerate*.

## Compatibility

The libretro web build needs Chromium 85+: **Tizen 6.5 or newer (2022 and later models)**.
On older TVs the launcher opens but the cores fail (the error is shown at the bottom of the screen).
PlayStation and large arcade games may be slow depending on the TV's CPU. ROMs are loaded into memory,
so very large CD images (hundreds of MB) can cause problems.

## How it works / building

`.github/workflows/build.yml`:

1. Downloads the cores listed in `tools/cores.txt` from web.libretro.com and turns their ES modules
   into classic scripts (so they also load from `file://` inside the .wgt).
2. Trims RetroArch's 133 MB asset bundle down to what is needed (core info, autoconfig, RGUI, shaders).
3. Adds the cores built from source in the `extra-cores` prerelease (N64).
4. Publishes `app/` + cores + bundle to GitHub Pages.
5. Builds a signed `RetroArch.wgt` with [tizen.js](https://github.com/reisxd/tizen.js); a `v*` tag creates a Release.
6. Runs headless Chromium smoke tests ([`tools/smoke-test.mjs`](tools/smoke-test.mjs)): booting a core,
   loading a ROM from a network folder, TizenBrew-style cross-origin assets, N64, and phone → TV transfer.

`extra-cores.yml` builds cores that the libretro buildbot doesn't ship for the web, together with
RetroArch master, using Emscripten ([`tools/extra-cores/build-core.sh`](tools/extra-cores/build-core.sh)):
symbols in the core's copy of libretro-common that clash with RetroArch are renamed automatically, and
libco gets an Emscripten fiber backend ([`libco_emscripten_fiber.c`](tools/extra-cores/libco_emscripten_fiber.c),
linked with Asyncify).

Signing uses the repo secrets `TIZEN_AUTHOR_P12` (base64 PKCS#12) and `TIZEN_AUTHOR_PASSWORD`; without
them each build signs with a throwaway certificate.

To try it locally, serve the `app/` folder with any web server; the `?base=https://sype0.github.io/retroarch-tizen/`
parameter loads the cores from GitHub Pages, and `?fps=1` shows RetroArch's frame counter.

## License

GPLv3. RetroArch and the libretro cores are under their own licenses
([RetroArch](https://github.com/libretro/RetroArch), [libretro](https://www.libretro.com/)).
This project is not affiliated with the libretro team. No ROMs are included; only use games you own.
