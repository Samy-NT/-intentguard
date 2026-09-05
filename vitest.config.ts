import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Keep a single fork on Windows/OneDrive to avoid intermittent worker
    // spawn failures while preserving the process isolation required by
    // tests that temporarily change cwd.
    pool: "forks",
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
