import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword } from "@/server/auth/password-core";
import { LOGIN_BUSY_MESSAGE } from "@/lib/busy";

/** ما يراه الطالب حين تُرفض محاولته لأن المنصة مشغولة: ليست «كلمة مرور خاطئة»، والزر ينتظر المدة */
const state = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useActionState: () => [state.current, () => undefined, false] }));

const login = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/server/auth/service", () => ({ loginWithPassword: async () => login.result, completeForcedPasswordChange: vi.fn(), registerStudent: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/server/http", () => ({ clientIp: async () => "192.0.2.1", userAgent: async () => "vitest" }));
vi.mock("@/server/auth/device-cookie", () => ({ readLoginDeviceCookie: async () => undefined, setLoginDeviceCookie: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ clearSessionCookie: vi.fn(), getCurrentSession: vi.fn(), invalidateSession: vi.fn(), setSessionCookie: vi.fn() }));
vi.mock("@/server/auth/challenge-cookie", () => ({ setLoginChallengeCookie: vi.fn() }));
vi.mock("@/server/auth/email-verification", () => ({ sendExistingAccountNotice: vi.fn(), sendRegistrationVerification: vi.fn() }));
vi.mock("@/server/platform/mailer", () => ({ mailIsReal: () => false, redactSecrets: (s: string) => s }));

const { LoginForm } = await import("@/app/(site)/(auth)/login/login-form");
const { SubmitButton } = await import("@/components/ui/submit-button");
const { loginAction } = await import("@/app/(site)/(auth)/actions");

const form = (email: string, password: string) => {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
};

const render = () => renderToStaticMarkup(createElement(LoginForm, { next: "/library" }));

beforeEach(() => {
  state.current = null;
  login.result = null;
});

describe("the login form when the platform is busy", () => {
  it("shows a calm notice, carries the wait and holds the button", () => {
    state.current = { error: LOGIN_BUSY_MESSAGE, retryAfter: 5, values: { email: "a@b.co" } };
    const html = render();
    expect(html).toContain('data-testid="login-busy"');
    expect(html).toContain('data-retry-after="5"');
    expect(html).toContain("لم تُحتسب هذه المحاولة عليك");
    expect(html).toContain("٥ ثوانٍ");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).not.toContain('role="alert"');
  });

  it("a wrong password stays an error and does not hold the button", () => {
    state.current = { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", values: { email: "a@b.co" } };
    const html = render();
    expect(html).not.toContain("login-busy");
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
});

describe("the submit button", () => {
  it("stays disabled while pending even if the caller passes disabled={false}", () => {
    const html = renderToStaticMarkup(createElement(SubmitButton, { pending: true, disabled: false }, "x"));
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});

describe("loginAction", () => {
  it("passes the wait through for a shed attempt", async () => {
    login.result = { ok: false, error: LOGIN_BUSY_MESSAGE, retryAfter: 5, busy: true };
    await expect(loginAction(null, form("student@farqad.test", "x-password-1"))).resolves.toEqual({ error: LOGIN_BUSY_MESSAGE, values: { email: "student@farqad.test" }, retryAfter: 5 });
  });

  it("a lockout keeps its own text and never holds the button as a busy notice", async () => {
    login.result = { ok: false, error: "تم إيقاف تسجيل الدخول مؤقتًا", retryAfter: 900 };
    await expect(loginAction(null, form("student@farqad.test", "x-password-1"))).resolves.toEqual({ error: "تم إيقاف تسجيل الدخول مؤقتًا", values: { email: "student@farqad.test" } });
  });

  it("never returns the password", async () => {
    login.result = { ok: false, error: LOGIN_BUSY_MESSAGE, retryAfter: 5, busy: true };
    expect(JSON.stringify(await loginAction(null, form("student@farqad.test", "x-password-1")))).not.toContain("x-password-1");
  });
});

describe("the timing burn for an unknown email", () => {
  it("uses a constant hash with the same cost and shape as a real one", async () => {
    const real = (await hashPassword("anything")).split("$");
    const dummy = DUMMY_PASSWORD_HASH.split("$");
    expect(dummy.slice(0, 4)).toEqual(real.slice(0, 4));
    expect(Buffer.from(dummy[4], "base64")).toHaveLength(Buffer.from(real[4], "base64").length);
    expect(Buffer.from(dummy[5], "base64")).toHaveLength(Buffer.from(real[5], "base64").length);
  });
});
