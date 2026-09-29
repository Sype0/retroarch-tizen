#!/bin/bash
# Builds RetroArch's web player with a core that the libretro buildbot does
# not ship for Emscripten.
#
#   build-core.sh <core source dir> <core name> [extra make args for the core]
#
# Run from a directory containing a RetroArch checkout in ./ra, with emsdk
# active. Output: ra/<core>_libretro.{js,wasm}
#
# A core carries its own copy of libretro-common, which clashes with
# RetroArch's when both are linked into one wasm. Cores rename a few symbols
# by hand for this; here every global the core defines that RetroArch also
# defines (except the libretro API itself) is renamed with -D.
set -euo pipefail

CORE_DIR=$1; CORE=$2; shift 2
HERE=$(cd "$(dirname "$0")" && pwd)
NM="$(dirname "$(which emcc)")/../bin/llvm-nm"
[ -x "$NM" ] || NM="$EMSDK/upstream/bin/llvm-nm"
JOBS=$(nproc)

API='^retro_(api_version|init|deinit|set_environment|set_video_refresh|set_audio_sample|set_audio_sample_batch|set_input_poll|set_input_state|get_system_info|get_system_av_info|set_controller_port_device|reset|run|serialize_size|serialize|unserialize|cheat_reset|cheat_set|load_game|load_game_special|unload_game|get_region|get_memory_data|get_memory_size)$'

build_core() {
   (cd "$CORE_DIR" && make clean >/dev/null 2>&1 || true)
   # -fno-common: wasm objects have no common symbols, so -fcommon
   # tentative definitions (e.g. mupen64plus' g_dev) end up undefined.
   # Cores tend to hardcode -fcommon; DYNAFLAGS comes after it and is unused
   # without a dynarec (overridable with CORE_NO_COMMON_VAR).
   (cd "$CORE_DIR" && emmake make platform=emscripten STATIC_LINKING=1 \
      "${CORE_NO_COMMON_VAR:-DYNAFLAGS}=-fno-common" \
      AR="$HERE/ar-as-relocatable.sh" -j"$JOBS" "$@")
}

defined_syms() {
   "$NM" --defined-only --extern-only --format=just-symbols "$@" 2>/dev/null | sort -u
}

echo "== RetroArch objects"
# the link fails without a core; only the objects are wanted here
(cd ra && emmake make -f Makefile.emscripten LIBRETRO="$CORE" -j"$JOBS" all >/dev/null 2>&1 || true)
find ra/obj-emscripten -name '*.o' > /tmp/ra-objs.txt
echo "$(wc -l < /tmp/ra-objs.txt) objects"
xargs "$NM" --defined-only --extern-only --format=just-symbols < /tmp/ra-objs.txt 2>/dev/null | sort -u > /tmp/ra-syms.txt

echo "== core (first pass)"
export CFLAGS="" CXXFLAGS=""
build_core "$@"
ARCHIVE=$(readlink -f "$(ls "$CORE_DIR"/*_emscripten.bc)")
mkdir -p /tmp/core-x && (cd /tmp/core-x && rm -f ./*.o && emar x "$ARCHIVE")
defined_syms /tmp/core-x/*.o > /tmp/core-syms.txt

comm -12 /tmp/ra-syms.txt /tmp/core-syms.txt | grep -Ev "$API" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' > /tmp/clashes.txt || true
echo "$(wc -l < /tmp/clashes.txt) clashing symbols:"
head -50 /tmp/clashes.txt

if [ -s /tmp/clashes.txt ]; then
   echo "== core (renamed)"
   RENAMES=$(sed 's/.*/-D&=glupen_&/' /tmp/clashes.txt | tr '\n' ' ')
   export CFLAGS="$RENAMES" CXXFLAGS="$RENAMES"
   build_core "$@"
fi

echo "== link"
cp "$ARCHIVE" ra/libretro_emscripten.bc
# the renames are for the core only; RetroArch's Makefile appends to CFLAGS
unset CFLAGS CXXFLAGS
(cd ra && emmake make -f Makefile.emscripten LIBRETRO="$CORE" -j"$JOBS" all)
ls -la ra/"$CORE"_libretro.*
