/** يُشغَّل في عملية Node جديدة من ammo.test.ts: يطبع بصمات سيناريوهات القذائف JSON على stdout */
import { runHeadless } from "../../../src/game/core/headless";
import { loadRapierNode } from "../../../src/game/physics/rapier-node";
import { AMMO_LEVEL, SCENARIOS } from "./ammo-scenarios";

async function main() {
  const R = await loadRapierNode();
  const out: Record<string, string[]> = {};
  for (const [name, shots] of Object.entries(SCENARIOS)) out[name] = runHeadless(R, AMMO_LEVEL, shots).hashes;
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
