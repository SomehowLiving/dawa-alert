import path from "node:path";
import { defineConfig } from "vitest/config";

// Talks to the Tiramisu testnet; needs a funded PRIVATE_KEY (see .env.example).
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.live.ts"], testTimeout: 120_000, hookTimeout: 120_000 },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
