import "server-only";
import { cookies } from "next/headers";
import { env } from "../env";
import { DEVICE_PROOF_DAYS } from "./device-proof";

/** كوكي إثبات الجهاز: httpOnly ولا يُرسل إلا لمسار الدخول. انظر device-proof.ts */
const LOGIN_DEVICE_COOKIE = "login_device";

export async function setLoginDeviceCookie(proof: string) {
  const jar = await cookies();
  jar.set(LOGIN_DEVICE_COOKIE, proof, { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax", path: "/login", maxAge: DEVICE_PROOF_DAYS * 86400 });
}

export async function readLoginDeviceCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(LOGIN_DEVICE_COOKIE)?.value;
}
