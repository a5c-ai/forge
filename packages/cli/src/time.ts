export function parseSinceToEpochMs(since: string, nowMs: number): number {
  // Accept:
  // - ISO timestamp
  // - durations like 2h, 15m, 30s, 7d
  const iso = Date.parse(since);
  if (Number.isFinite(iso)) return iso;

  const m = /^(\d+)(s|m|h|d)$/.exec(since.trim());
  if (!m) throw new Error(`Invalid --since: ${since}`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return nowMs - n * mult;
}


