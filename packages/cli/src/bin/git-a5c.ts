#!/usr/bin/env node
import { runCli } from "../run.js";

runCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    // Keep output minimal and deterministic.
    process.stderr.write(String(e?.message ?? e) + "\n");
    process.exitCode = 1;
  });


