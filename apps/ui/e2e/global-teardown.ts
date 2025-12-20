import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { STATE_PATH } from "./_state";
import { spawn } from "node:child_process";

export default async function globalTeardown() {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    const st = JSON.parse(raw) as any;

    const pids: number[] = [];
    const repoDirs: string[] = [];
    if (st?.local?.nextPid) pids.push(st.local.nextPid);
    if (st?.remote?.nextPid) pids.push(st.remote.nextPid);
    if (st?.remote?.serverPid) pids.push(st.remote.serverPid);
    if (st?.local?.repoDir) repoDirs.push(st.local.repoDir);
    if (st?.remote?.repoDir) repoDirs.push(st.remote.repoDir);

    for (const pid of pids) {
      try {
        if (process.platform === "win32") {
          await new Promise<void>((resolve) => {
            const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
            child.on("close", () => resolve());
            child.on("error", () => resolve());
          });
        } else {
          process.kill(pid);
        }
      } catch {}
    }

    for (const dir of repoDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {}
    }
  } catch {}
  try {
    await fs.rm(path.dirname(STATE_PATH), { recursive: true, force: true });
  } catch {}
}


