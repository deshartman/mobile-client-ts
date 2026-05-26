import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "node",
      environment: "node",
      include: [
        "src/lib/**/*.test.ts",
        "src/app/api/**/*.test.ts",
        "../../packages/*/src/**/*.test.ts",
      ],
      setupFiles: ["./vitest.setup.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "jsdom",
      environment: "jsdom",
      include: [
        "src/components/**/*.test.tsx",
        "src/app/**/*.test.tsx",
        "src/hooks/**/*.test.tsx",
      ],
      setupFiles: ["./vitest.setup.ts"],
    },
  },
]);
