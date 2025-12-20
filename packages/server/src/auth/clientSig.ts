import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import type http from "node:http";
import { jcsStringify } from "@a5cforge/sdk";

function sha256Hex(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function requireClientSigEnabled(): boolean {
  const v = process.env.A5C_REQUIRE_CLIENT_SIGNATURE;
  return v === "1" || v === "true" || v === "yes";
}

function parseClientSignatureHeader(h: string | undefined): { clientId: string; signature: Buffer } | undefined {
  if (!h) return;
  const m = /^ed25519;([^;]+);(.+)$/.exec(h.trim());
  if (!m) return;
  const clientId = m[1];
  const signature = Buffer.from(m[2], "base64");
  return { clientId, signature };
}

async function loadClientPublicKeyPem(repoRoot: string, clientId: string): Promise<string | undefined> {
  const p = path.join(repoRoot, ".collab", "keys", "clients", `${clientId}.pub`);
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return;
  }
}

export async function resolveActorFromClientSig(
  repoRoot: string,
  req: http.IncomingMessage,
  bodyObj: any
): Promise<{ actor: string; clientId?: string }> {
  const client = String(req.headers["a5c-client"] ?? "");
  const sigHdr = String(req.headers["a5c-client-signature"] ?? "");
  const parsed = parseClientSignatureHeader(sigHdr);

  if (!client && !parsed) {
    if (requireClientSigEnabled()) throw new Error("missing client signature");
    const actor = String(bodyObj?.actor ?? process.env.A5C_ACTOR ?? "server");
    return { actor };
  }

  const clientId = client || parsed?.clientId || "";
  if (!clientId) throw new Error("missing A5C-Client");
  if (!parsed) throw new Error("missing A5C-Client-Signature");
  if (parsed.clientId !== clientId) throw new Error("client signature header mismatch");

  const pub = await loadClientPublicKeyPem(repoRoot, clientId);
  if (!pub) throw new Error(`unknown clientId (missing .collab/keys/clients/${clientId}.pub)`);

  const canonical = Buffer.from(jcsStringify(bodyObj), "utf8");
  const hashHex = sha256Hex(canonical);
  const ok = crypto.verify(null, Buffer.from(hashHex, "hex"), pub, parsed.signature);
  if (!ok) throw new Error("invalid client signature");
  return { actor: clientId, clientId };
}


