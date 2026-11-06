import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * اختبارات الوحدة النقية للعبة (tests/unit/game) بلا قاعدة بيانات: الإعداد الرئيسي vitest.config.mts
 * ينشئ قاعدة الاختبار في globalSetup، وهذه الاختبارات لا تحتاجها.
 *   npm run test:game
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      "server-only": r("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/game/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
