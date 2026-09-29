#!/bin/sh
# Stands in for "ar rcs <out> <objects...>" in a core's Makefile:
#  - "P" keys members by full path; plain ar keys them by basename, so the
#    core's many main.o / libretro.o files would overwrite each other.
#  - adds a sem_timedwait stub (not in Emscripten's libc without pthreads).
set -e
shift                   # "rcs"
out=$1; shift
emcc -O2 -c "$(dirname "$0")/sem_timedwait_stub.c" -o /tmp/sem_timedwait_stub.o
rm -f "$out"
emar rcsP "$out" "$@" /tmp/sem_timedwait_stub.o
