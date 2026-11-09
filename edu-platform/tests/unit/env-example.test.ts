import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_KEYS, env, resetEnvCache } from "@/server/env";

/**
 * .env.example هو ما ينسخه المطور إلى .env.local أو إلى Vercel، فيجب أن يطابق ما يقرؤه الخادم اسمًا باسم:
 * متغير جديد في env.ts بلا سطر هنا يُنسى عند النشر، وسطر هنا لا يقرؤه أحد يضلل من يضبطه.
 * والنسخ كما هو يجب أن يبدأ الخادم (بعد ملء الإلزاميين فقط)، دون قيمة سر حقيقية في الملف.
 */
const EXAMPLE = readFileSync(resolve(__dirname, "../../.env.example"), "utf8");
const LINES = EXAMPLE.split(/\r?\n/);
const VAR_LINE = /^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/;

const declared = LINES.flatMap((line) => {
  const m = VAR_LINE.exec(line);
  return m ? [{ name: m[2], active: !m[1], value: m[3] }] : [];
});
const active = parseEnv(LINES.filter((line) => VAR_LINE.exec(line) && !line.startsWith("#")).join("\n"));

/** القيم السرية: فارغة أو معلّقة فقط، مهما كان شكل المثال */
const SECRETS = ["APP_SECRET", "DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MYFATOORAH_API_KEY", "MYFATOORAH_WEBHOOK_SECRET", "CRON_SECRET", "SMTP_PASSWORD", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_READONLY_API_KEY"];

const saved = new Map<string, string | undefined>();
const TOUCHED = [...ENV_KEYS, "NODE_ENV"];

beforeEach(() => {
  for (const name of TOUCHED) saved.set(name, process.env[name]);
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetEnvCache();
});

describe(".env.example", () => {
  it("lists exactly the variables the server reads, each once", () => {
    const names = declared.map((d) => d.name);
    expect(names.filter((name, i) => names.indexOf(name) !== i), "duplicated").toEqual([]);
    expect([...names].sort()).toEqual([...ENV_KEYS].sort());
  });

  it("explains every variable with a comment right above it or above its block", () => {
    const isExplanation = (line: string) => line.startsWith("#") && !VAR_LINE.test(line) && !/^#\s*[-=]{3,}/.test(line) && line.replace(/^#\s*/, "").trim() !== "";
    for (const { name } of declared) {
      let at = LINES.findIndex((line) => VAR_LINE.exec(line)?.[2] === name) - 1;
      // متغيرات متلاصقة بلا سطر فارغ بينها تشترك في التعليق الذي فوقها
      while (at >= 0 && VAR_LINE.test(LINES[at])) at--;
      expect(at >= 0 && isExplanation(LINES[at]), `${name} has no comment right above it`).toBe(true);
    }
  });

  it("holds no secret value", () => {
    for (const name of SECRETS) {
      const line = declared.find((d) => d.name === name);
      expect(line, name).toBeDefined();
      expect(line!.value, `${name} must be empty in the example`).toBe("");
    }
    expect(EXAMPLE).not.toMatch(/NEXT_PUBLIC_[A-Z]/);
  });

  it("boots the server as copied, once the two required values are filled", () => {
    for (const name of TOUCHED) delete process.env[name];
    Object.assign(process.env, active, {
      NODE_ENV: "development",
      DATABASE_URL: "postgres://user:password@localhost:5432/example",
      APP_SECRET: "example-app-secret-0123456789-abcdefghij",
    });
    resetEnvCache();
    const e = env();
    expect(e.APP_URL).toBe("http://localhost:3000");
    expect(e.PAYMENTS_MODE).toBe("disabled");
    expect(e.MAIL_DRIVER).toBe("log");
    expect(e.VIDEO_PROVIDER).toBe("file");
    expect(e.ALLOW_FILE_VIDEO).toBe(false);
    expect(e.MYFATOORAH_LIVE_CONFIRMED).toBe(false);
  });

  it("keeps optional values commented, because an empty one can stop the server", () => {
    for (const { name, value } of declared.filter((d) => d.active && d.value === "")) {
      expect(["APP_SECRET", "DATABASE_URL"], `${name} is active and empty`).toContain(name);
    }
  });
});
