/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
