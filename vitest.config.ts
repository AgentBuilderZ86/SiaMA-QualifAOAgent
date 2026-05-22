import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    // Les tests normalize et intelligence font de la computation pure (pas de LLM réel).
    // Timeout global augmenté pour les couvrir sans les exclure du CI.
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
