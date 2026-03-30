import { describe, expect, it } from "vitest";
import { createLogger } from "@/utils/logger.js";

describe("Logger", () => {
  it("should create logger with specified level", () => {
    const logger = createLogger({ level: "info" });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
  });

  it("should create logger with debug level", () => {
    const logger = createLogger({ level: "debug" });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("debug");
  });

  it("should create logger with error level", () => {
    const logger = createLogger({ level: "error" });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("error");
  });

  it("should create logger with warn level", () => {
    const logger = createLogger({ level: "warn" });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("warn");
  });

  it("should have standard logging methods", () => {
    const logger = createLogger({ level: "debug" });
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should not throw when logging at various levels", () => {
    const logger = createLogger({ level: "debug" });

    expect(() => logger.error("Test error message")).not.toThrow();
    expect(() => logger.warn("Test warn message")).not.toThrow();
    expect(() => logger.info("Test info message")).not.toThrow();
    expect(() => logger.debug("Test debug message")).not.toThrow();
  });

  it("should accept verbose option", () => {
    const logger = createLogger({ level: "info", verbose: true });
    expect(logger).toBeDefined();
  });

  it("should handle messages with metadata", () => {
    const logger = createLogger({ level: "info" });
    expect(() =>
      logger.info("Test message", { userId: "123", action: "test" })
    ).not.toThrow();
  });
});
