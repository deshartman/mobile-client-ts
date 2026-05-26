import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/lib/services/**/*.ts", "src/app/api/**/*.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
