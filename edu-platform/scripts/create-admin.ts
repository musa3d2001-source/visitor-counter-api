/**
 * إنشاء أول حساب مدير بأمان (أو ترقية حساب موجود):
 *   npm run admin:create -- --email admin@example.com --name "اسم المدير"
 * كلمة المرور: تُقرأ من المتغير ADMIN_PASSWORD إن وُجد، وإلا تُولَّد كلمة قوية وتُطبع مرة واحدة فقط.
 * لا توجد أي صفحة عامة لإنشاء مدير — هذا السكربت هو الطريق الوحيد (يتطلب وصولًا لقاعدة البيانات).
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { loadEnvFile } from "./_env";
import { hashPassword } from "../src/server/auth/password-core";

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
  if (provided && provided.length < 12) {
    console.error("ADMIN_PASSWORD يجب أن تكون 12 حرفًا على الأقل");
    process.exit(1);
  }
  const password = provided ?? randomBytes(15).toString("base64url");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const hash = await hashPassword(password);
    const [user] = await sql<{ id: string; created: boolean }[]>`
      insert into users (email, password_hash, full_name, role, email_verified_at)
      values (${email}, ${hash}, ${name}, 'admin', now())
      on conflict (email) do update set role = 'admin', password_hash = excluded.password_hash, is_active = true
      returning id, (xmax = 0) as created
    `;
    await sql`delete from sessions where user_id = ${user.id}`;
    await sql`
      insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
      values (null, 'admin.create_via_cli', 'user', ${user.id}, ${sql.json({ email, created: user.created })})
    `;
    console.log(user.created ? "✔ تم إنشاء حساب المدير" : "✔ تمت ترقية الحساب إلى مدير وتحديث كلمة المرور");
    console.log(`البريد: ${email}`);
    if (!provided) console.log(`كلمة المرور (احفظها الآن، لن تُعرض مرة أخرى): ${password}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
