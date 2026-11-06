"use client";

import dynamic from "next/dynamic";
import type { DirKey } from "./directions";
import type { MockArt, MockState } from "./game-mock";

/** ‎ssr: false‎ حتى لا تدخل حزمة Rapier ذات ملف ‎.wasm‎ رسم الخادم (انظر spike-client.tsx) */
const GameMock = dynamic(() => import("./game-mock").then((m) => m.GameMock), { ssr: false });

export function MockClient(props: { dir: DirKey; state: MockState; art: MockArt }) {
  return <GameMock {...props} />;
}
