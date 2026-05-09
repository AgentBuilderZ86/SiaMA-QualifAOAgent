import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/src/lib/aoSources/normalize.test.ts",
      "**/src/lib/qualification/intelligence.test.ts"
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
