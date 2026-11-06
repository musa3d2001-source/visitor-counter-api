/**
 * صوت اللعبة: مؤثرات WebAudio إجرائية مع كتم، بلا موسيقى افتراضيًا (GAME_DESIGN.md §1).
 * عميل فقط في التشغيل، لكنه آمن للاستيراد في Node: السياق لا يُنشأ إلا عند أول unlock() أو play().
 */
export {
  IMPACT_BURST,
  IMPACT_RATE,
  IMPACT_SFX,
  SFX_MAX_SECONDS,
  SFX_NAMES,
  audioSupported,
  breakSfx,
  clamp01,
  clampPan,
  createSfx,
  createThrottle,
  fillNoise,
  hitSfx,
  intensityGain,
  isImpactSfx,
  layerEnd,
  nextVary,
  recipeEnd,
  sfxRecipe,
} from "./sfx";
export type { NoiseLayer, Sfx, SfxLayer, SfxName, SfxOptions, SfxPlayOptions, ToneLayer } from "./sfx";
