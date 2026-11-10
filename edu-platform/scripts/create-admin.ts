/**
 * إنشاء أول حساب مدير بأمان (أو ترقية حساب موجود):
 *   npm run admin:create -- --email admin@example.com --name "اسم المدير"
 * كلمة المرور: تُقرأ من المتغير ADMIN_PASSWORD إن وُجد، وإلا تُولَّد كلمة قوية وتُطبع مرة واحدة فقط.
 * لا توجد أي صفحة عامة لإنشاء مدير — هذا السكربت هو الطريق الوحيد (يتطلب وصولًا لقاعدة البيانات).
 * وهو أيضًا طريق مدير نسي كلمة مروره: لا يترك خلفه جلسة ولا رابطًا ولا مهلة من الحالة السابقة.
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { loadEnvFile, scriptDbOptions } from "./_env";
import { hashPassword, loginFailurePrefix } from "../src/server/auth/password-core";
import { passwordPolicyError } from "../src/lib/password-policy";

loadEnvFile();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim() || "مدير المنصة";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('الاستخدام: npm run admin:create -- --email admin@example.com --name "اسم المدير"');
    process.exit(1);
  }
  const provided = process.env.ADMIN_PASSWORD;
  const problem = provided ? passwordPolicyError("admin", provided, email) : null;
  if (problem) {
    console.error(`ADMIN_PASSWORD مرفوضة: ${problem}`);
    process.exit(1);
  }
  const password = provided ?? randomBytes(15).toString("base64url");
  const sql = postgres(process.env.DATABASE_URL!, scriptDbOptions());
  try {
    const hash = await hashPassword(password);
    const user = await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string; created: boolean }[]>`
        insert into users (email, password_hash, full_name, role, email_verified_at)
        values (${email}, ${hash}, ${name}, 'admin', now())
        on conflict (email) do update set role = 'admin', password_hash = excluded.password_hash, is_active = true, must_change_password = false, temp_password_expires_at = null
        returning id, (xmax = 0) as created
      `;
      await tx`delete from sessions where user_id = ${row.id}`;
      await tx`update password_reset_tokens set used_at = now() where user_id = ${row.id} and used_at is null`;
      await tx`update email_verification_tokens set used_at = now() where user_id = ${row.id} and used_at is null`;
      await tx`delete from rate_limits where starts_with(key, ${loginFailurePrefix(email)})`;
      await tx`
        insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
        values (null, 'admin.create_via_cli', 'user', ${row.id}, ${tx.json({ email, created: row.created })})
      `;
      return row;
    });
    console.log(user.created ? "✔ تم إنشاء حساب المدير" : "✔ تمت ترقية الحساب إلى مدير وتحديث كلمة المرور");
    console.log(`البريد: ${email}`);
    if (!provided) console.log(`كلمة المرور (احفظها الآن، لن تُعرض مرة أخرى): ${password}`);
    console.log("الخطوة التالية الآن: سجّل الدخول وفعّل التحقق بخطوتين. قبله لا تعمل الاستردادات والتسويات وتصدير البيانات وباقي الأوامر الحساسة، وكل من يعرف كلمة المرور يستطيع تسجيل جواله.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
