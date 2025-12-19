const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTimeMs(timeMs: number): string {
  // 48 bits -> 10 chars base32
  let t = BigInt(timeMs);
  const chars: string[] = new Array(10);
  for (let i = 9; i >= 0; i--) {
    const mod = Number(t % 32n);
    chars[i] = ENCODING[mod]!;
    t = t / 32n;
  }
  return chars.join("");
}

function encodeRandom80(randomBytes: Uint8Array): string {
  if (randomBytes.length !== 10) throw new Error("ULID random requires 10 bytes (80 bits)");
  // 80 bits -> 16 chars base32 (128 bits total ULID = 26 chars)
  let v = 0n;
  for (const b of randomBytes) v = (v << 8n) | BigInt(b);
  const chars: string[] = new Array(16);
  for (let i = 15; i >= 0; i--) {
    const mod = Number(v % 32n);
    chars[i] = ENCODING[mod]!;
    v = v / 32n;
  }
  return chars.join("");
}

export type UlidGeneratorOpts = {
  nowMs?: () => number;
  randomBytes?: (n: number) => Uint8Array;
};

export class UlidGenerator {
  private lastTimeMs: number | undefined;
  private lastRandom: Uint8Array | undefined;

  constructor(private readonly opts: UlidGeneratorOpts = {}) {}

  generate(): string {
    const now = (this.opts.nowMs ?? Date.now)();
    const rand = this.opts.randomBytes?.(10) ?? crypto.getRandomValues(new Uint8Array(10));

    if (this.lastTimeMs === now && this.lastRandom) {
      // Monotonic increment of the 80-bit random component.
      const inc = new Uint8Array(this.lastRandom);
      for (let i = 9; i >= 0; i--) {
        inc[i] = (inc[i] + 1) & 0xff;
        if (inc[i] !== 0) break;
      }
      this.lastRandom = inc;
    } else {
      this.lastTimeMs = now;
      this.lastRandom = rand;
    }

    return encodeTimeMs(now) + encodeRandom80(this.lastRandom);
  }
}


