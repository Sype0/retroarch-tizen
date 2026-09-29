#!/bin/sh
# Stands in for "ar rcs <out> <objects...>" in a core's Makefile: links the
# objects into one relocatable object instead of an archive. An archive would
# drop members that only provide -fcommon globals (e.g. mupen64plus' g_dev)
# because archive lookup ignores common symbols, and plain ar also keys
# members by basename. RetroArch's Makefile.emscripten links the result as
# libretro_emscripten.a; wasm-ld goes by content, not extension.
set -e
shift                   # "rcs"
out=$1; shift
emcc -O2 -c "$(dirname "$0")/sem_timedwait_stub.c" -o /tmp/sem_timedwait_stub.o
emcc -r -o /tmp/core-relocatable.o "$@" /tmp/sem_timedwait_stub.o
mv /tmp/core-relocatable.o "$out"
