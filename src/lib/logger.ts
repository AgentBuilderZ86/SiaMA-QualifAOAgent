type Level = "info" | "warn" | "error";

interface LogEntry {
  level: Level;
  ctx: string;
  msg: string;
  ts: string;
  data?: unknown;
}

const IS_PROD = process.env.NODE_ENV === "production";

function emit(level: Level, ctx: string, msg: string, data?: unknown) {
  const entry: LogEntry = { level, ctx, msg, ts: new Date().toISOString() };
  if (data !== undefined) entry.data = data;

  // JSON structuré en production (Netlify / serverless capte stdout/stderr)
  const line = IS_PROD ? JSON.stringify(entry) : `[${level.toUpperCase()}] ${ctx} — ${msg}`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (ctx: string, msg: string, data?: unknown) => emit("info", ctx, msg, data),
  warn: (ctx: string, msg: string, data?: unknown) => emit("warn", ctx, msg, data),
  error: (ctx: string, msg: string, data?: unknown) => emit("error", ctx, msg, data),
};
