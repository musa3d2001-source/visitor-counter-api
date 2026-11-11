/**
 * مشغّل الترحيلات: يطبّق ملفات db/migrations/*.sql بالترتيب مرة واحدة فقط
 * ويسجلها في جدول schema_migrations. الاستخدام: npm run db:migrate
 *
 * يعمل على قاعدة حية والموقع يخدم (الترحيل قبل نشر الكود، F26). لذلك كل ملف في معاملة واحدة بحدين محليين (SET LOCAL):
 * - lock_timeout قصير: أمر ALTER ينتظر قفلًا تحمله طلبات الموقع يوقف خلفه كل طلب جديد على الجدول نفسه،
 *   فلا ينتظر أكثر من ثوانٍ قليلة. يتراجع الملف كله ويُعاد بعد لحظة، حتى MIGRATION_ATTEMPTS مرات.
 * - statement_timeout: أمر واحد لا يتجاوز دقيقتين. بعدها يتراجع الملف كله.
 * الملف إما مطبق كله ومسجل، أو لم يتغير منه شيء. والإعادة آمنة: ما سُجل لا يُعاد.
 * اتصل بـ Session pooler أو Direct connection (المنفذ 5432)، لا بـ Transaction pooler (6543).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { loadEnvFile } from "./_env";

loadEnvFile();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL غير مضبوط");
  process.exit(1);
}

/** أطول انتظار لقفل جدول قبل أن يتراجع الملف ويُعاد. طلب الموقع الواقف خلفه ينتظر هذا على الأكثر */
export const MIGRATION_LOCK_TIMEOUT_MS = 3_000;
/** أطول أمر واحد داخل ملف ترحيل */
export const MIGRATION_STATEMENT_TIMEOUT_MS = 120_000;
/** محاولات الملف الواحد حين يكون جدوله مشغولًا، وبينها مهلة */
export const MIGRATION_ATTEMPTS = 5;
export const MIGRATION_RETRY_PAUSE_MS = 5_000;

export type MigrateOptions = { dir?: string; lockTimeoutMs?: number; statementTimeoutMs?: number; attempts?: number; pauseMs?: number };

/** لم يُطبق ملف: الرسالة للمطور أو المالك، والخطأ الأصلي في cause */
export class MigrationStopped extends Error {
  constructor(
    readonly file: string,
    message: string,
    options: { cause: unknown },
  ) {
    super(message, options);
    this.name = "MigrationStopped";
  }
}

const codeOf = (err: unknown) => (typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined);
const seconds = (ms: number) => String(Math.round(ms / 100) / 10);

export async function migrate(databaseUrl: string, log = true, opts: MigrateOptions = {}) {
  const lockMs = opts.lockTimeoutMs ?? MIGRATION_LOCK_TIMEOUT_MS;
  const statementMs = opts.statementTimeoutMs ?? MIGRATION_STATEMENT_TIMEOUT_MS;
  const attempts = opts.attempts ?? MIGRATION_ATTEMPTS;
  const pauseMs = opts.pauseMs ?? MIGRATION_RETRY_PAUSE_MS;
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  /** معاملة بحدي الانتظار، أولها SET LOCAL فلا يبقى أثرهما بعدها */
  const limited = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('lock_timeout', ${String(lockMs)}, true), set_config('statement_timeout', ${String(statementMs)}, true)`;
      return fn(tx);
    }) as Promise<T>;
  /** ملف أو خطوة تمهيد: تُعاد حين يكون جدولها مشغولًا، ويتوقف كل شيء بإرشاد واضح عند غير ذلك */
  const apply = async (name: string, fn: (tx: postgres.TransactionSql) => Promise<unknown>) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await limited(fn);
        return;
      } catch (err) {
        const code = codeOf(err);
        if (code === "55P03" && attempt < attempts) {
          if (log) console.log(`… ${name}: جدول يحتاجه مشغول بطلبات الموقع، لم يتغير شيء. محاولة ${attempt + 1} من ${attempts} بعد ${seconds(pauseMs)} ث`);
          await new Promise((resolve) => setTimeout(resolve, pauseMs));
          continue;
        }
        if (code === "55P03") {
          throw new MigrationStopped(
            name,
            `✖ لم يُطبق ${name}: جدول يحتاجه بقي مشغولًا بطلبات الموقع (انتظار القفل ${seconds(lockMs)} ث، ${attempts} محاولات). ` +
              "لم يتغير شيء من هذا الملف، وما قبله مطبق ومسجل. أعد تشغيل npm run db:migrate في وقت أهدأ، والملفات المطبقة لا تُعاد.",
            { cause: err },
          );
        }
        if (code === "57014") {
          throw new MigrationStopped(
            name,
            `✖ لم يُطبق ${name}: أمر فيه تجاوز ${seconds(statementMs)} ث فأُلغي. لم يتغير شيء من هذا الملف، وما قبله مطبق ومسجل. ` +
              "أعد التشغيل في وقت أهدأ، وإن تكرر فراجع الملف مع المطور.",
            { cause: err },
          );
        }
        throw err;
      }
    }
  };
  try {
    await apply("schema_migrations", async (tx) => {
      await tx`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
      await tx`alter table schema_migrations enable row level security`;
    });
    const dir = opts.dir ?? join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) continue;
      const content = readFileSync(join(dir, f), "utf8");
      await apply(f, async (tx) => {
        await tx.unsafe(content);
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      if (log) console.log(`✔ applied ${f}`);
    }
    if (log) console.log("الترحيلات مكتملة");
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  migrate(url).catch((err) => {
    // رسالة الإرشاد وحدها: الخطأ الأصلي قد يحمل نص الأمر أو عنوان الخادم
    console.error(err instanceof MigrationStopped ? err.message : err);
    process.exit(1);
  });
}
