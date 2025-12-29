export const DEFAULT_MASK = "REDACTED";

// Common sensitive key substrings to match case-insensitively
export const DEFAULT_SENSITIVE_KEYS = [
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "api_key",
  "apikey",
  "client_secret",
  "access_token",
  "refresh_token",
  "private_key",
  "ssh_key",
  "db_password",
  "db_pass",
  "jwt",
  "bearer",
  "credential",
  "authorization",
  "auth",
  "session",
  "cookie",
  "webhook_secret",
];

// Regexes for common secret patterns
export const DEFAULT_PATTERNS: RegExp[] = [
  // GitHub PAT: ghp_, gho_, ghu_, ghs_, ghe_
  /gh[pouse]_[A-Za-z0-9]{36,}/g,
  // JWT (base64url.header.base64url.payload.base64url.signature)
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Bearer tokens in headers or strings
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  // AWS Access Key ID (AKIA or ASIA) and Secret Access Key
  /AKIA[0-9A-Z]{16}/g,
  /ASIA[0-9A-Z]{16}/g,
  /(?:aws)?_?secret(?:_access)?_key\s*[:=]\s*['\"][A-Za-z0-9\/+]{30,}['\"]/gi,
  // Stripe secret keys
  /sk_live_[A-Za-z0-9]{16,}/g,
  /sk_test_[A-Za-z0-9]{16,}/g,
  // Slack tokens
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  // URL basic auth: https://user:pass@host
  /https?:\/\/[A-Za-z0-9._%-]+:[^@\s]+@/g,
];

export type RedactOptions = {
  mask?: string;
  sensitiveKeys?: string[];
  patterns?: RegExp[];
};

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return !!val && typeof val === "object" && !Array.isArray(val);
}

export function redactString(input: string, opts: RedactOptions = {}): string {
  if (typeof input !== "string") return input as unknown as string;
  const mask = opts.mask ?? DEFAULT_MASK;
  const patterns = opts.patterns ?? DEFAULT_PATTERNS;
  let out = input;
  for (const re of patterns) {
    try {
      out = out.replace(re, mask);
    } catch {
      // ignore
    }
  }
  return out;
}

export function redactObject<T = unknown>(obj: T, opts: RedactOptions = {}): T {
  const mask = opts.mask ?? DEFAULT_MASK;
  const sensitiveKeys = (opts.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS).map(
    (k) => k.toLowerCase(),
  );
  const patterns = opts.patterns ?? DEFAULT_PATTERNS;
  const seen = new WeakSet<object>();

  function walk(value: unknown): unknown {
    if (typeof value === "string")
      return redactString(value, { mask, patterns });
    if (Array.isArray(value)) return value.map(walk);
    if (isPlainObject(value)) {
      if (seen.has(value)) return value;
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const lower = k.toLowerCase();
        const isSensitive = sensitiveKeys.some((sk) => lower.includes(sk));
        if (isSensitive) out[k] = mask;
        else if (typeof v === "string")
          out[k] = redactString(v, { mask, patterns });
        else out[k] = walk(v);
      }
      return out;
    }
    return value;
  }

  return walk(obj) as T;
}

export function redactEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: RedactOptions = {},
) {
  const clone = { ...env };
  return redactObject(clone, opts);
}

export function buildRedactor(opts: RedactOptions = {}) {
  return {
    mask: opts.mask ?? DEFAULT_MASK,
    redactString: (s: string) => redactString(s, opts),
    redactObject: <T = unknown>(o: T) => redactObject<T>(o, opts),
    redactEnv: (e?: NodeJS.ProcessEnv) => redactEnv(e, opts),
  };
}

