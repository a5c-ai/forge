export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export type LogEvent = {
  time: string;
  level: Exclude<LogLevel, "silent">;
  msg: string;
  [k: string]: unknown;
};

export type Logger = {
  child(fields: Record<string, unknown>): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
};

export function parseLogLevel(s: string | undefined): LogLevel {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error" || v === "silent") return v as LogLevel;
  return "info";
}

export function createLogger(opts?: { level?: LogLevel; base?: Record<string, unknown>; json?: boolean }): Logger {
  const level: LogLevel = opts?.level ?? parseLogLevel(process.env.A5C_LOG_LEVEL);
  const base: Record<string, unknown> = { ...(opts?.base ?? {}) };
  const json = opts?.json ?? (String(process.env.A5C_LOG_FORMAT ?? "").toLowerCase() === "json");

  function shouldLog(lvl: Exclude<LogLevel, "silent">): boolean {
    if (level === "silent") return false;
    return ORDER[lvl] >= ORDER[level];
  }

  function emit(lvl: Exclude<LogLevel, "silent">, msg: string, fields?: Record<string, unknown>) {
    if (!shouldLog(lvl)) return;
    const ev: LogEvent = { time: new Date().toISOString(), level: lvl, msg, ...base, ...(fields ?? {}) };
    if (json) {
      const line = JSON.stringify(ev);
      if (lvl === "error") console.error(line);
      else console.log(line);
      return;
    }
    const parts: string[] = [];
    parts.push(ev.time);
    parts.push(lvl.toUpperCase());
    if (ev.component) parts.push(`[${String(ev.component)}]`);
    parts.push(msg);
    const { time: _time, level: _level, msg: _msg, ...rest } = ev;
    const tail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    const line = parts.join(" ") + tail;
    if (lvl === "error") console.error(line);
    else console.log(line);
  }

  function child(fields: Record<string, unknown>): Logger {
    return createLogger({ level, base: { ...base, ...fields }, json });
  }

  return {
    child,
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields)
  };
}


