// [تجربة المرحلة 0] تحميل حزمتي Rapier في Node للسكربتات (خارج Next).
// standard يتطلب: node --import tsx --import ./scripts/game-spike/node-hooks/register.mjs --experimental-wasm-modules
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { RapierModule } from "../../src/app/admin/game/spike/_engine/physics-adapter";
import type { RapierPackage } from "../../src/app/admin/game/spike/_engine/load-rapier";

const req = createRequire(join(process.cwd(), "package.json"));

export async function loadRapierNode(pkg: RapierPackage): Promise<RapierModule> {
  if (pkg === "compat") {
    const p = req.resolve("@dimforge/rapier2d-deterministic-compat");
    const mod = await import(pathToFileURL(p.replace(/rapier\.cjs$/, "rapier.mjs")).href);
    await mod.init();
    return mod as RapierModule;
  }
  const dir = req.resolve("@dimforge/rapier2d-deterministic/package.json").replace(/package\.json$/, "");
  const mod = await import(pathToFileURL(dir + "rapier.js").href);
  return mod as RapierModule;
}
