import type http from "node:http";

export function sendJson(res: http.ServerResponse, status: number, obj: any) {
  const body = JSON.stringify(obj, null, 2) + "\n";
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

export async function readRaw(req: http.IncomingMessage, maxBytes = 256_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const b = Buffer.from(c as any);
    total += b.length;
    if (total > maxBytes) throw new Error("Request body too large");
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}


