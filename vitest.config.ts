import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    globals: false,
    server: {
      deps: {
        inline: [/@veap\//],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/index.ts"],
    },
  },
});
