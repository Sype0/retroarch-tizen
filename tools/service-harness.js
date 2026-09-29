// Runs tizenbrew/service.js the way TizenBrew does: in a vm context that
// shares the Node globals plus require (see TizenBrew's serviceLauncher.js).
"use strict";
const vm = require("vm");
const fs = require("fs");

const sandbox = {};
Object.getOwnPropertyNames(global).forEach((p) => { sandbox[p] = global[p]; });
sandbox.require = require;
sandbox.module = { exports: {} };
vm.runInContext(fs.readFileSync(process.argv[2], "utf8"), vm.createContext(sandbox));
console.log("service started");
