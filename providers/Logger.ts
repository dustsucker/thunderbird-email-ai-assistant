type LoggerContext = Record<string, unknown>;

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private static instances: Map<string, Logger> = new Map();
  private currentLogLevel: LogLevel = LogLevel.INFO;
  private readonly providerPrefix: string;

  private constructor(provider: string = 'PROVIDER') {
    this.providerPrefix = provider;
  }

  static getInstance(provider?: string): Logger {
    const key = provider || 'PROVIDER';
    if (!Logger.instances.has(key)) {
      Logger.instances.set(key, new Logger(provider));
    }
    return Logger.instances.get(key)!;
  }

  setLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  private formatMessage(message: string, context?: LoggerContext): string {
    if (!context || Object.keys(context).length === 0) {
      return `[${this.providerPrefix}] ${message}`;
    }
    return `[${this.providerPrefix}] ${message} (${JSON.stringify(context)})`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLogLevel;
  }

  debug(message: string, context?: LoggerContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(message, context));
    }
  }

  info(message: string, context?: LoggerContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(message, context));
    }
  }

  warn(message: string, context?: LoggerContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(message, context));
    }
  }

  error(message: string, context?: LoggerContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(message, context));
    }
  }

  maskApiKey(apiKey?: string): string {
    if (!apiKey || typeof apiKey !== 'string') {
      return 'not set';
    }
    if (apiKey.length <= 10) {
      return '***';
    }
    return `${apiKey.slice(0, 7)}...${apiKey.slice(-3)}`;
  }
}

export { Logger };
export default Logger.getInstance();
