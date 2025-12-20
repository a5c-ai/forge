import type { CommandArgs } from "./types.js";
import { listIssues, listPRs } from "@a5cforge/sdk";

export function handleStatus(args: CommandArgs): number | undefined {
  if (args.positionals[0] !== "status") return;
  const issues = listIssues(args.snap).length;
  const prs = listPRs(args.snap).length;
  if (args.flags.json) {
    args.io.writeLine(args.io.out, JSON.stringify({ treeish: args.treeish, issues, prs }, null, 2));
  } else {
    args.io.writeLine(args.io.out, `treeish: ${args.treeish}`);
    args.io.writeLine(args.io.out, `issues: ${issues}`);
    args.io.writeLine(args.io.out, `prs: ${prs}`);
  }
  return 0;
}


