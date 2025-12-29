import https from "node:https";

export async function fetchGithubFileContents(opts: {
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
  token?: string;
}): Promise<string> {
  const encodedPath = opts.filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `https://api.github.com/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(opts.ref)}`;

  const headers: Record<string, string> = {
    "User-Agent": "a5cforge",
    Accept: "application/vnd.github+json"
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const { statusCode, body } = await httpsGet(url, headers);
  if (statusCode !== 200) {
    throw new Error(
      `GitHub fetch failed (${statusCode}) for ${opts.owner}/${opts.repo}@${opts.ref}:${opts.filePath}: ${body.slice(0, 200)}`
    );
  }

  const json = JSON.parse(body);
  if (Array.isArray(json)) throw new Error("Path is a directory, not a file");
  const encoding = json.encoding || "base64";
  return Buffer.from(json.content || "", encoding).toString("utf8");
}

export async function listGithubFilesRecursive(opts: {
  owner: string;
  repo: string;
  ref?: string;
  dir: string;
  token?: string;
}): Promise<string[]> {
  const token = opts.token;
  const results: string[] = [];

  async function walk(p: string): Promise<void> {
    const encodedPath = String(p || "")
      .split("/")
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const url = `https://api.github.com/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(opts.ref || "")}`;
    const headers: Record<string, string> = {
      "User-Agent": "a5cforge",
      Accept: "application/vnd.github+json"
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const { statusCode, body } = await httpsGet(url, headers);
    if (statusCode !== 200) return;
    const data = JSON.parse(body);
    if (Array.isArray(data)) {
      for (const entry of data) {
        const type = entry.type;
        const ep = entry.path || "";
        if (type === "dir") await walk(ep);
        else if (type === "file") results.push(ep);
      }
    } else {
      results.push(data.path || p);
    }
  }

  try {
    await walk(opts.dir);
  } catch {
    // ignore
  }
  return results;
}

async function httpsGet(url: string, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

