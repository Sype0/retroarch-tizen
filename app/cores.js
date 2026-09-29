/*
 * Cores shipped by retroarch-tizen. Keep in sync with tools/cores.txt (the CI
 * only fetches the cores listed there). "ext" drives the ROM browser filter.
 */
var RA_CORES = [
   { id: "fceumm",            name: "NES / Famicom",              emu: "FCEUmm",            ext: ["nes", "fds", "unf", "unif"] },
   { id: "nestopia",          name: "NES / Famicom",              emu: "Nestopia",          ext: ["nes", "fds", "unf", "unif"] },
   { id: "snes9x2005",        name: "SNES / Super Famicom",       emu: "Snes9x 2005 (hızlı)", ext: ["smc", "sfc", "swc", "fig"] },
   { id: "snes9x2010",        name: "SNES / Super Famicom",       emu: "Snes9x 2010",       ext: ["smc", "sfc", "swc", "fig", "bs"] },
   { id: "snes9x",            name: "SNES / Super Famicom",       emu: "Snes9x",            ext: ["smc", "sfc", "swc", "fig", "bs", "st"] },
   { id: "gambatte",          name: "Game Boy / Color",           emu: "Gambatte",          ext: ["gb", "gbc", "dmg"] },
   { id: "mgba",              name: "Game Boy Advance",           emu: "mGBA",              ext: ["gba", "gb", "gbc"] },
   { id: "vba_next",          name: "Game Boy Advance",           emu: "VBA Next",          ext: ["gba"] },
   { id: "genesis_plus_gx",   name: "Sega MD / MS / GG / CD",     emu: "Genesis Plus GX",   ext: ["md", "gen", "smd", "bin", "sms", "gg", "sg", "68k", "chd", "cue", "m3u"] },
   { id: "picodrive",         name: "Sega MD / 32X / CD",         emu: "PicoDrive",         ext: ["md", "gen", "smd", "bin", "32x", "sms", "gg", "cue", "chd"] },
   { id: "gearsystem",        name: "Sega MS / GG / SG-1000",     emu: "Gearsystem",        ext: ["sms", "gg", "sg", "bin", "rom"] },
   { id: "parallel_n64",      name: "Nintendo 64 (deneysel)",     emu: "ParaLLEl N64 · çok yavaş olabilir", ext: ["n64", "v64", "z64", "u1", "ndd"], legacy: true },
   { id: "pcsx_rearmed",      name: "PlayStation",                emu: "PCSX ReARMed",      ext: ["bin", "cue", "img", "mdf", "pbp", "chd", "iso", "m3u", "exe"] },
   { id: "mednafen_pce_fast", name: "PC Engine / TurboGrafx",     emu: "Beetle PCE Fast",   ext: ["pce", "cue", "ccd", "chd", "toc", "m3u"] },
   { id: "fbalpha2012_cps1",  name: "Arcade (CPS-1)",             emu: "FB Alpha 2012",     ext: ["zip"] },
   { id: "fbalpha2012_cps2",  name: "Arcade (CPS-2)",             emu: "FB Alpha 2012",     ext: ["zip"] },
   { id: "fbalpha2012_neogeo",name: "Arcade (Neo Geo)",           emu: "FB Alpha 2012",     ext: ["zip"] },
   { id: "mame2003_plus",     name: "Arcade",                     emu: "MAME 2003-Plus",    ext: ["zip"] },
   { id: "fbneo",             name: "Arcade",                     emu: "FinalBurn Neo",     ext: ["zip", "7z"] },
   { id: "stella2014",        name: "Atari 2600",                 emu: "Stella 2014",       ext: ["a26", "bin"] },
   { id: "handy",             name: "Atari Lynx",                 emu: "Handy",             ext: ["lnx", "o"] },
   { id: "mednafen_ngp",      name: "Neo Geo Pocket / Color",     emu: "Beetle NeoPop",     ext: ["ngp", "ngc", "ngpc", "npc"] },
   { id: "mednafen_wswan",    name: "WonderSwan / Color",         emu: "Beetle WonderSwan", ext: ["ws", "wsc", "pc2"] },
   { id: "mednafen_vb",       name: "Virtual Boy",                emu: "Beetle VB",         ext: ["vb", "vboy", "bin"] },
   { id: "prboom",            name: "Doom",                       emu: "PrBoom",            ext: ["wad", "iwad", "pwad", "lmp"] }
];
