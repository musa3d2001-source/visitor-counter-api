/** ما تشترك فيه الواجهة والخادم في التحقق بخطوتين (بلا أي سر) */

export const TWO_FACTOR_SETUP_PATH = "/two-factor/setup";
export const TWO_FACTOR_LOGIN_PATH = "/login/two-factor";

/** اسم حقل الرمز في نماذج الإدارة */
export const STEP_UP_FIELD = "twoFactorCode";

/** حقل رمز التحقق في نوافذ التأكيد التي تخرج مالًا */
export const STEP_UP_CONFIRM_FIELD = {
  name: STEP_UP_FIELD,
  label: "رمز التحقق أو رمز استرداد (إلزامي)",
  placeholder: "123456",
  ltr: true,
  required: true,
  autoComplete: "one-time-code",
  maxLength: 32,
  testId: "step-up-code",
};
