import type { CommandArgs } from "./types.js";
import { verify } from "@a5cforge/sdk";

export function handleVerify(args: CommandArgs): number | undefined {
  if (args.positionals[0] !== "verify") return;
  const v = verify(args.snap);
  if (args.flags.json) {
    args.io.writeLine(args.io.out, JSON.stringify(v, null, 2));
  } else {
    const counts = v.reduce<Record<string, number>>((acc, x: any) => {
      acc[x.status] = (acc[x.status] ?? 0) + 1;
      return acc;
    }, {});
    args.io.writeLine(args.io.out, `events: ${v.length}`);
    for (const k of Object.keys(counts).sort()) args.io.writeLine(args.io.out, `${k}: ${counts[k]}`);
  }
  return 0;
}


