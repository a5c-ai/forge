import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { URL } from "node:url";
import { jcsStringify } from "@a5c-ai/sdk";
import { runGitCapture } from "../git/exec.js";

export type WebhooksConfig = {
  schema: string;
  endpoints: { id: string; url: string; events: string[]; enabled?: boolean }[];
};

const rateState = new Map<string, { tokens: number; lastMs: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256Hex(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function getGitPath(repoRoot: string, rel: string): Promise<string> {
  const out = (await runGitCapture(["rev-parse", "--git-path", rel], repoRoot)).trim();
  return path.isAbsolute(out) ? out : path.join(repoRoot, out);
}

async function getDeadletterPath(repoRoot: string): Promise<string> {
  const override = process.env.A5C_WEBHOOK_DEADLETTER_PATH;
  if (override) return override;
  return await getGitPath(repoRoot, "a5c-webhooks.deadletter.ndjson");
}

async function getQueuePath(repoRoot: string): Promise<string> {
  const override = process.env.A5C_WEBHOOK_QUEUE_PATH;
  if (override) return override;
  return await getGitPath(repoRoot, "a5c-webhooks.queue.ndjson");
}

async function deadLetter(repoRoot: string, entry: any): Promise<void> {
  try {
    const p = await getDeadletterPath(repoRoot);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch {}
}

async function takeRateToken(endpointId: string): Promise<void> {
  const rate = Number(process.env.A5C_WEBHOOK_RATE_PER_SEC ?? "10");
  if (!Number.isFinite(rate) || rate <= 0) return;
  const now = Date.now();
  const st = rateState.get(endpointId) ?? { tokens: rate, lastMs: now };
  const elapsed = Math.max(0, now - st.lastMs);
  const refill = (elapsed / 1000) * rate;
  st.tokens = Math.min(rate, st.tokens + refill);
  st.lastMs = now;
  if (st.tokens < 1) {
    const waitMs = Math.ceil(((1 - st.tokens) / rate) * 1000);
    rateState.set(endpointId, st);
    await sleep(Math.min(1000, Math.max(1, waitMs)));
    return takeRateToken(endpointId);
  }
  st.tokens -= 1;
  rateState.set(endpointId, st);
}

export async function loadWebhooksConfig(repoRoot: string): Promise<WebhooksConfig | undefined> {
  const p = path.join(repoRoot, ".collab", "webhooks.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== "a5cforge/v1" || !Array.isArray(parsed.endpoints)) return;
    const endpoints = parsed.endpoints
      .filter((e: any) => e && typeof e.id === "string" && typeof e.url === "string" && Array.isArray(e.events))
      .map((e: any) => ({ id: e.id, url: e.url, events: e.events.map((x: any) => String(x)), enabled: e.enabled !== false }));
    return { schema: "a5cforge/v1", endpoints };
  } catch {
    return;
  }
}

function matchEventSelector(selector: string, eventType: string): boolean {
  if (selector === "*" || selector === "*.*") return true;
  if (selector.endsWith(".*")) {
    const p = selector.slice(0, -2);
    return eventType === p || eventType.startsWith(p + ".");
  }
  return selector === eventType;
}

function parseIpv4(s: string): number[] | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return;
  const parts = m.slice(1).map((x) => Number(x));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return;
  return parts;
}

function ipv4ToInt(p: number[]): number {
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function parseCidrV4(s: string): { base: number; mask: number } | undefined {
  const m = /^(.+)\/(\d{1,2})$/.exec(s);
  if (!m) return;
  const ip = parseIpv4(m[1]);
  const bits = Number(m[2]);
  if (!ip || !Number.isInteger(bits) || bits < 0 || bits > 32) return;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const base = ipv4ToInt(ip) & mask;
  return { base, mask };
}

function isAllowedWebhookUrl(url: URL): boolean {
  const allowHosts = (process.env.A5C_WEBHOOK_ALLOW_HOSTS ?? "127.0.0.1,localhost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowCidrs = (process.env.A5C_WEBHOOK_ALLOW_CIDRS ?? "127.0.0.0/8")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseCidrV4)
    .filter(Boolean) as { base: number; mask: number }[];

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (allowHosts.includes(url.hostname)) return true;
  const ip = parseIpv4(url.hostname);
  if (!ip) return false;
  const x = ipv4ToInt(ip);
  return allowCidrs.some((c) => (x & c.mask) === c.base);
}

function signEnvelope(envelope: any): { signed: string; signatureHeader?: string } {
  const keyId = process.env.A5C_WEBHOOK_KEY_ID;
  const privatePem = process.env.A5C_WEBHOOK_PRIVATE_KEY_PEM;
  const canonicalBytes = Buffer.from(jcsStringify(envelope), "utf8");
  const hashHex = sha256Hex(canonicalBytes);
  const signed = `sha256:${hashHex}`;
  if (!keyId || !privatePem) return { signed };
  const sig = crypto.sign(null, Buffer.from(hashHex, "hex"), privatePem);
  return { signed, signatureHeader: `ed25519;${keyId};${sig.toString("base64")}` };
}

async function enqueue(repoRoot: string, entry: any) {
  try {
    const p = await getQueuePath(repoRoot);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, JSON.stringify(entry) + "\n", "utf8");
  } catch {}
}

async function drainQueue(repoRoot: string, send: (entry: any) => Promise<boolean>) {
  const p = await getQueuePath(repoRoot);
  let raw = "";
  try {
    raw = await fs.readFile(p, "utf8");
  } catch {
    return;
  }
  const now = Date.now();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const keep: any[] = [];
  for (const l of lines) {
    let e: any;
    try {
      e = JSON.parse(l);
    } catch {
      continue;
    }
    if ((e.nextAt ?? 0) > now) {
      keep.push(e);
      continue;
    }
    const ok = await send(e);
    if (!ok) keep.push(e);
  }
  await fs.writeFile(p, keep.map((x) => JSON.stringify(x)).join("\n") + (keep.length ? "\n" : ""), "utf8");
}

async function deliverOnce(repoRoot: string, endpointId: string, url: string, envelope: any, headers: Record<string, string>): Promise<void> {
  await takeRateToken(endpointId);
  const u = new URL(url);
  if (!isAllowedWebhookUrl(u)) throw new Error("blocked by allowlist");
  const body = JSON.stringify(envelope, null, 2) + "\n";
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

async function deliverWithRetries(repoRoot: string, endpointId: string, url: string, envelope: any, headers: Record<string, string>): Promise<void> {
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await deliverOnce(repoRoot, endpointId, url, envelope, headers);
      return;
    } catch (e: any) {
      lastErr = e;
      await sleep(50 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

async function enqueueFailed(repoRoot: string, endpointId: string, url: string, envelope: any, headers: Record<string, string>, error: any) {
  const attempts = 3;
  const nextAt = Date.now() + 1000;
  await enqueue(repoRoot, { endpointId, url, envelope, headers, attempts, nextAt });
  await deadLetter(repoRoot, { endpointId, url, envelopeId: envelope.id, type: envelope.type, error: String(error?.message ?? error), queued: true });
}

export async function emitEnvelope(repoRoot: string, cfg: WebhooksConfig | undefined, envelope: any) {
  if (!cfg?.endpoints?.length) return;
  const { signed, signatureHeader } = signEnvelope(envelope);
  const headers: Record<string, string> = { "a5c-signed": signed };
  if (signatureHeader) headers["a5c-signature"] = signatureHeader;

  // Drain queued deliveries opportunistically.
  await drainQueue(repoRoot, async (entry) => {
    try {
      await deliverWithRetries(repoRoot, entry.endpointId, entry.url, entry.envelope, entry.headers ?? {});
      return true;
    } catch (e: any) {
      const attempts = Number(entry.attempts ?? 0) + 1;
      entry.attempts = attempts;
      entry.nextAt = Date.now() + Math.min(60_000, 1000 * Math.pow(2, Math.min(6, attempts)));
      if (attempts >= 10) {
        await deadLetter(repoRoot, { endpointId: entry.endpointId, url: entry.url, envelopeId: entry.envelope?.id, type: entry.envelope?.type, error: String(e?.message ?? e), dropped: true });
        return true; // drop
      }
      return false;
    }
  });

  for (const ep of cfg.endpoints) {
    if (ep.enabled === false) continue;
    if (!ep.events.some((sel) => matchEventSelector(sel, envelope.type))) continue;
    try {
      await deliverWithRetries(repoRoot, ep.id, ep.url, envelope, headers);
    } catch (e: any) {
      await enqueueFailed(repoRoot, ep.id, ep.url, envelope, headers, e);
    }
  }
}


