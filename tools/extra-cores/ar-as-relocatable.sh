#!/bin/sh
# Stands in for "ar rcs <out> <objects...>" in a core's Makefile: links the
# objects into one relocatable object and archives only that. A regular
# archive would drop members that only provide -fcommon globals (e.g.
# mupen64plus' g_dev) because archive lookup ignores common symbols, and
# plain ar also keys members by basename. With a single member, RetroArch's
# first reference (retro_init, ...) pulls in the whole core.
set -e
shift                   # "rcs"
out=$1; shift
emcc -O2 -c "$(dirname "$0")/sem_timedwait_stub.c" -o /tmp/sem_timedwait_stub.o
emcc -r -o /tmp/core-relocatable.o "$@" /tmp/sem_timedwait_stub.o
rm -f "$out"
emar rcs "$out" /tmp/core-relocatable.o
