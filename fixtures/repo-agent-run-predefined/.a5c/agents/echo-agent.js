process.stdin.resume();
process.stdin.setEncoding("utf8");

const fs = require("node:fs");

const promptPath = process.env.A5C_ECHO_PROMPT_PATH;
const outPath = process.env.A5C_ECHO_OUTPUT_PATH;
const prompt = promptPath ? fs.readFileSync(promptPath, "utf8") : "";
fs.writeFileSync(outPath, `MODEL=${process.env.A5C_MODEL || ""}\n${prompt}`, "utf8");
process.exit(0);

