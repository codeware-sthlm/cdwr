export type LogFields = Readonly<Record<string, unknown>>;

export type Logger = {
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
};

type Level = keyof Logger;

const write = (level: Level, msg: string, fields: LogFields = {}) => {
  const line = JSON.stringify({ level, time: Date.now(), msg, ...fields });
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
};

/** One JSON line per call: info and warn to stdout, error to stderr */
export const createLogger = (): Logger => ({
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields)
});

/** The fields of an error line: its message and stack, nothing else */
export const errorFields = (error: unknown): LogFields =>
  error instanceof Error
    ? { error: error.message, stack: error.stack }
    : { error: String(error) };
