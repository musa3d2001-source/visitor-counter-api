import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * إعداد Vitest:
 * - tests/unit: اختبارات وحدات سريعة بلا قاعدة بيانات
 * - tests/integration: اختبارات تكامل على PostgreSQL حقيقي (edu_test) + محاكي MyFatoorah
 * الملفات تعمل بالتسلسل لأن اختبارات التكامل تشترك في قاعدة البيانات نفسها.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      "server-only": r("./tests/stubs/server-only.ts"),
      "next/headers": r("./tests/stubs/next-headers.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["./tests/setup-env.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
