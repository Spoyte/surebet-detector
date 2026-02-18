/**
 * Logger type declarations
 */

declare interface Logger {
  error(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  debug(message: string, meta?: Record<string, any>): void;
  trace(message: string, meta?: Record<string, any>): void;
  child(meta: Record<string, any>): Logger;
}

declare const logger: Logger;
export default logger;
