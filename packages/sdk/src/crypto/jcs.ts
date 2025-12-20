function escapeString(s: string): string {
  // JSON.stringify gives correct escaping for strings.
  return JSON.stringify(s);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error("JCS cannot serialize non-finite numbers");
  if (Object.is(n, -0)) return "0";
  let s = n.toString(); // may produce e+NN
  s = s.replace(/E/g, "e").replace(/e\+/g, "e");
  return s;
}

export function jcsStringify(value: any): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return escapeString(value);
  if (t === "number") return formatNumber(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t === "undefined" || t === "function" || t === "symbol") return "null";

  if (Array.isArray(value)) {
    const items = value.map((v) => {
      if (v === undefined || typeof v === "function" || typeof v === "symbol") return "null";
      return jcsStringify(v);
    });
    return `[${items.join(",")}]`;
  }

  // object
  const keys = Object.keys(value).sort();
  const pairs: string[] = [];
  for (const k of keys) {
    const v = value[k];
    if (v === undefined || typeof v === "function" || typeof v === "symbol") continue; // like JSON.stringify
    pairs.push(`${escapeString(k)}:${jcsStringify(v)}`);
  }
  return `{${pairs.join(",")}}`;
}


