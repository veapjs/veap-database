export interface DatabaseLogger {
  debug(channel: string, message: string, ...args: any[]): void;
  info(channel: string, message: string, ...args: any[]): void;
  warn(channel: string, message: string, ...args: any[]): void;
  error(channel: string, message: string, ...args: any[]): void;
}

let activeLogger: DatabaseLogger = {
  debug: (_channel, _message, ..._args) => {},
  info: (channel, message, ..._args) => console.info(`[${channel}] ${message}`),
  warn: (channel, message, ..._args) => console.warn(`[${channel}] ${message}`),
  error: (channel, message, ..._args) =>
    console.error(`[${channel}] ${message}`),
};

export function setDatabaseLogger(logger: DatabaseLogger): void {
  activeLogger = logger;
}

export function debug(channel: string, message: string, ...args: any[]): void {
  activeLogger.debug(channel, message, ...args);
}

export function info(channel: string, message: string, ...args: any[]): void {
  activeLogger.info(channel, message, ...args);
}

export function warn(channel: string, message: string, ...args: any[]): void {
  activeLogger.warn(channel, message, ...args);
}

export function error(channel: string, message: string, ...args: any[]): void {
  activeLogger.error(channel, message, ...args);
}
