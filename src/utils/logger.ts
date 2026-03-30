import winston from "winston";

export interface LoggerConfig {
  level: "error" | "warn" | "info" | "debug";
  verbose?: boolean;
}

export function createLogger(config: LoggerConfig): winston.Logger {
  const formats = [
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      const logMessage = message as string;
      let log = `${timestamp} [${level}]: ${logMessage}`;
      if (stack && config.verbose) {
        log += `\n${stack}`;
      }
      return log;
    }),
  ];

  return winston.createLogger({
    level: config.level,
    format: winston.format.combine(...formats),
    transports: [new winston.transports.Console()],
  });
}
