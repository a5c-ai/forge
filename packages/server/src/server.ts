import http from "node:http";
import { URL } from "node:url";
import { sendJson } from "./http/io.js";
import { requireAuth } from "./http/auth.js";
import { handleV1Read } from "./routes/v1/readRoutes.js";
import { handleV1Write } from "./routes/v1/writeRoutes.js";
import { handleV1GithubWebhook } from "./routes/v1/githubWebhookRoute.js";
import { handleV1GitRefUpdated } from "./routes/v1/gitRoutes.js";
import { createLogger } from "@a5cforge/sdk";

export type ServerConfig = {
  repoRoot: string;
  token?: string;
};

function readEnvConfig(): ServerConfig {
  const repoRoot = process.env.A5C_SERVER_REPO ?? process.env.A5C_REPO;
  if (!repoRoot) throw new Error("Missing A5C_SERVER_REPO (or A5C_REPO)");
  const token = process.env.A5C_SERVER_TOKEN ?? process.env.A5C_REMOTE_TOKEN;
  return { repoRoot, token };
}

function parseInboxRefs(u: URL): string[] | undefined {
  const inbox = u.searchParams.get("inbox");
  if (inbox) {
    const refs = inbox
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return refs.length ? refs : undefined;
  }
  const many = u.searchParams.getAll("inboxRef").map((s) => s.trim()).filter(Boolean);
  return many.length ? many : undefined;
}

export function createA5cServer(overrides?: Partial<ServerConfig>) {
  const cfg = { ...readEnvConfig(), ...(overrides ?? {}) };
  const log = createLogger({ base: { component: "server" } });

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const started = Date.now();
    const rid = `${started.toString(36)}-${Math.random().toString(16).slice(2)}`;
    const reqLog = log.child({ rid, method: req.method, path: u.pathname });
    try {
      if (!requireAuth(req, cfg.token)) {
        reqLog.warn("unauthorized");
        return sendJson(res, 401, { error: "unauthorized" });
      }

      const treeish = u.searchParams.get("treeish") ?? "HEAD";
      const inboxRefs = parseInboxRefs(u);
      if (await handleV1Read({ req, res, repoRoot: cfg.repoRoot, treeish, inboxRefs, pathname: u.pathname })) return;
      if (await handleV1Write({ req, res, repoRoot: cfg.repoRoot, pathname: u.pathname, searchParams: u.searchParams })) return;
      if (await handleV1GithubWebhook({ req, res, repoRoot: cfg.repoRoot, pathname: u.pathname })) return;
      if (await handleV1GitRefUpdated({ req, res, repoRoot: cfg.repoRoot, pathname: u.pathname })) return;

      reqLog.info("not_found", { ms: Date.now() - started });
      return sendJson(res, 404, { error: "not found" });
    } catch (e: any) {
      reqLog.error("error", { ms: Date.now() - started, error: String(e?.message ?? e) });
      return sendJson(res, 400, { error: String(e?.message ?? e) });
    } finally {
      reqLog.debug("done", { ms: Date.now() - started, status: res.statusCode });
    }
  });

  return {
    server,
    listen(port: number) {
      return new Promise<number>((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, () => {
          const addr = server.address();
          const actual = typeof addr === "object" && addr ? addr.port : port;
          resolve(actual);
        });
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  };
}


