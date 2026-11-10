export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope = "app", level: "debug" | "info" | "warn" | "error" = "info"): Logger {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  const emit = (lv: keyof typeof order, msg: string, meta?: Record<string, unknown>) => {
    if (order[lv] < order[level]) return;
    const line = `${new Date().toISOString()} ${lv.toUpperCase().padEnd(5)} [${scope}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
    (lv === "error" || lv === "warn" ? console.error : console.log)(line);
  };
  return {
    debug: (m, x) => emit("debug", m, x),
    info: (m, x) => emit("info", m, x),
    warn: (m, x) => emit("warn", m, x),
    error: (m, x) => emit("error", m, x),
    child: (s) => createLogger(`${scope}:${s}`, level),
  };
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};
