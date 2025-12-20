import type { ParsedArgs } from "../args.js";

export type CommandIO = {
  out: (s: string) => void;
  err: (s: string) => void;
  writeLine: (write: (s: string) => void, s?: string) => void;
};

export type CommandArgs = {
  repoRoot: string;
  treeish: string;
  flags: ParsedArgs["flags"];
  positionals: string[];
  repo: any;
  snap: any;
  nowMs: () => number;
  io: CommandIO;
};


