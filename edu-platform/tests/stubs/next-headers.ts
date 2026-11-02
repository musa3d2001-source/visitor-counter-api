// الاختبارات لا يجب أن تعتمد على سياق طلب Next.js — أي استخدام لهذه الدوال خطأ في الاختبار
function fail(name: string): never {
  throw new Error(`next/headers.${name}() is not available in tests — call request-independent functions instead`);
}
export async function cookies(): Promise<never> {
  fail("cookies");
}
export async function headers(): Promise<never> {
  fail("headers");
}
export async function draftMode(): Promise<never> {
  fail("draftMode");
}
