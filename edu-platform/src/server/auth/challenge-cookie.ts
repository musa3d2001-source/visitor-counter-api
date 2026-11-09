import "server-only";
import { cookies } from "next/headers";
import { env } from "../env";

/** كوكي خطوة كلمة المرور المعلقة: httpOnly ولا يُرسل إلا لمسار الدخول */
const LOGIN_CHALLENGE_COOKIE = "login_challenge";
const COOKIE_PATH = "/login";

export async function setLoginChallengeCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(LOGIN_CHALLENGE_COOKIE, token, { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax", path: COOKIE_PATH, expires: expiresAt });
}

export async function readLoginChallengeCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(LOGIN_CHALLENGE_COOKIE)?.value;
}

export async function clearLoginChallengeCookie() {
  const jar = await cookies();
  jar.set(LOGIN_CHALLENGE_COOKIE, "", { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax", path: COOKIE_PATH, maxAge: 0 });
}
