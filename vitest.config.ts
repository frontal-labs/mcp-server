import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.js"],
    exclude: ["node_modules", "dist", "**/*.d.ts"],
    setupFiles: ["tests/setup/index.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "tests/**",
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.config.*",
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@tests": resolve(__dirname, "tests"),
      "@utils": resolve(__dirname, "tests/utils"),
      "@mocks": resolve(__dirname, "tests/mocks"),
      "@load": resolve(__dirname, "tests/load"),
      "@fixtures": resolve(__dirname, "tests/fixtures"),
    },
  },
});
