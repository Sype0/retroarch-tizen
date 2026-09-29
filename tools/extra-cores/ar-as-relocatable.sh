#!/bin/sh
# Stands in for "ar rcs <out> <objects...>" in a core's Makefile: links the
# objects into one relocatable object and archives only that.
#  - A regular archive drops members that only provide -fcommon globals
#    (archive lookup ignores common symbols), and plain ar keys members by
#    basename, so the core's many main.o / libretro.o would collide.
#  - With a single member, RetroArch's first reference pulls in the whole
#    core; clashes with RetroArch are handled by build-core.sh renaming.
#  - Adds a sem_timedwait stub (not in Emscripten's libc without pthreads).
set -e
shift                   # "rcs"
out=$1; shift
emcc -O2 -c "$(dirname "$0")/sem_timedwait_stub.c" -o /tmp/sem_timedwait_stub.o
emcc -r -o /tmp/core-relocatable.o "$@" /tmp/sem_timedwait_stub.o
rm -f "$out"
emar rcs "$out" /tmp/core-relocatable.o
