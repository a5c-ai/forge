function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// RFC 7396 JSON Merge Patch.
export function applyJsonMergePatch<T>(target: T, patch: unknown): T {
  if (!isPlainObject(patch)) return patch as T;
  const base = (isPlainObject(target) ? { ...(target as any) } : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete base[k];
      continue;
    }
    const cur = base[k];
    if (isPlainObject(v) && isPlainObject(cur)) {
      base[k] = applyJsonMergePatch(cur, v);
    } else {
      base[k] = v;
    }
  }
  return base as T;
}

