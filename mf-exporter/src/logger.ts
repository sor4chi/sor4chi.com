type LogLevel = "debug" | "info" | "warn" | "error";

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error") process.stderr.write(`${entry}\n`);
  else process.stdout.write(`${entry}\n`);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};

export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}
