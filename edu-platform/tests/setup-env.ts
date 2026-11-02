import { TEST_ENV } from "./test-env";

// يُنفذ قبل كل ملف اختبار وقبل استيراد أي وحدة من src
for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
