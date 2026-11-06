/** المدخلات (عميل): دوال نقية تحوّل السحب والمفاتيح إلى خطوات التصويب الصحيحة وأوامر اللعبة */
export { clampAim, clampInt, dragToAim, isDrag, nudgeAim, sameAim, DRAG_POWER_SPAN, DRAG_SLOP_PX, DRAG_YAW_SPAN, type AimSteps, type Viewport } from "./aim";
export { keyToCommand, targetHandlesKey, type KeyCommand, type KeyLike } from "./keyboard";
