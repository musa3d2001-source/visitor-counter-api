import { createServer, type Socket } from "node:net";

/**
 * pooler مزيف للاختبارات: يتحدث بروتوكول PostgreSQL على الشبكة (الإصدار 3) بقدر ما يحتاجه postgres.js،
 * ليرد كما يرد Supavisor حين يكون ممتلئًا. لا يصل إلى أي خادم حقيقي ولا يخزن شيئًا.
 *
 * - refuse: يرفض بدء الاتصال برسالة خطأ FATAL، كما يفعل Supavisor حين يبلغ حد العملاء (EMAXCONN).
 *   Supavisor يرسل الحقول S و C و M فقط (lib/supavisor/error.ex)، فلا نرسل V.
 * - hold-begin: يقبل الاتصال ويجيب كل أمر بخطأ عادي، إلا BEGIN فيمسكه حتى releaseBegin()،
 *   كما يمسك Supavisor بوضع transaction أول رسالة حتى يتوفر اتصال خادم.
 * - fail-begin: يرد على BEGIN برسالة FATAL ثم يغلق الاتصال، كما يفعل عند انتهاء pool_checkout_timeout.
 */
export type FakePoolerMode = { kind: "refuse"; code: string; message: string } | { kind: "hold-begin" } | { kind: "fail-begin"; code: string; message: string };

export type FakePooler = {
  port: number;
  url: string;
  /** نصوص الأوامر البسيطة (Query) التي وصلت، بالترتيب */
  queries: string[];
  /** عدد رسائل البروتوكول الموسع (Parse) التي وصلت: أوامر بقيم */
  parsed: string[];
  /** يجيب كل BEGIN ممسوك بنجاح، فتبدأ المعاملة متأخرة */
  releaseBegin(): void;
  close(): Promise<void>;
};

function message(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.write(type, 0, "latin1");
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

const int32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const cstr = (s: string) => Buffer.from(`${s}\0`, "utf8");

function errorResponse(severity: "FATAL" | "ERROR", code: string, text: string): Buffer {
  return message("E", Buffer.concat([Buffer.from("S"), cstr(severity), Buffer.from("C"), cstr(code), Buffer.from("M"), cstr(text), Buffer.from([0])]));
}

const ready = (status: "I" | "T" | "E") => message("Z", Buffer.from(status, "latin1"));
const commandComplete = (tag: string) => message("C", cstr(tag));

export async function startFakePooler(mode: FakePoolerMode): Promise<FakePooler> {
  const queries: string[] = [];
  const parsed: string[] = [];
  const sockets = new Set<Socket>();
  const heldBegins: Socket[] = [];

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    let started = false;

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (!started) {
          if (buffer.length < 8) return;
          const length = buffer.readInt32BE(0);
          if (buffer.length < length) return;
          const code = buffer.readInt32BE(4);
          buffer = buffer.subarray(length);
          // SSLRequest: لا TLS هنا
          if (code === 80877103) {
            socket.write("N");
            continue;
          }
          // CancelRequest: لا شيء يُلغى، والاتصال يُغلق كما يفعل الخادم
          if (code === 80877102) {
            socket.end();
            return;
          }
          started = true;
          if (mode.kind === "refuse") {
            socket.end(errorResponse("FATAL", mode.code, mode.message));
            return;
          }
          // AuthenticationOk، ثم مفتاح الإلغاء، ثم جاهز
          socket.write(Buffer.concat([message("R", int32(0)), message("S", Buffer.concat([cstr("server_version"), cstr("17.0")])), message("K", Buffer.concat([int32(4242), int32(99)])), ready("I")]));
          continue;
        }
        if (buffer.length < 5) return;
        const type = String.fromCharCode(buffer[0]!);
        const length = buffer.readInt32BE(1);
        if (buffer.length < length + 1) return;
        const body = buffer.subarray(5, length + 1);
        buffer = buffer.subarray(length + 1);
        if (type === "X") {
          socket.end();
          return;
        }
        if (type === "P") {
          // اسم الأمر المحضر ثم نصه
          const nameEnd = body.indexOf(0);
          const textEnd = body.indexOf(0, nameEnd + 1);
          parsed.push(body.subarray(nameEnd + 1, textEnd).toString("utf8"));
          continue;
        }
        if (type === "S") {
          socket.write(Buffer.concat([errorResponse("ERROR", "0A000", "not supported by the fake pooler"), ready("I")]));
          continue;
        }
        if (type !== "Q") continue;
        const text = body.subarray(0, body.length - 1).toString("utf8").trim();
        queries.push(text);
        if (/^begin\b/i.test(text)) {
          if (mode.kind === "hold-begin") heldBegins.push(socket);
          else if (mode.kind === "fail-begin") socket.end(errorResponse("FATAL", mode.code, mode.message));
          continue;
        }
        if (/^rollback\b/i.test(text)) {
          socket.write(Buffer.concat([commandComplete("ROLLBACK"), ready("I")]));
          continue;
        }
        // أوامر postgres.js الداخلية (قراءة الأنواع): خطأ عادي يكفيه ليكمل
        socket.write(Buffer.concat([errorResponse("ERROR", "42P01", "relation does not exist in the fake pooler"), ready("I")]));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;

  return {
    port,
    url: `postgres://fake_user:fake_password@127.0.0.1:${port}/postgres`,
    queries,
    parsed,
    releaseBegin() {
      for (const socket of heldBegins.splice(0)) socket.write(Buffer.concat([commandComplete("BEGIN"), ready("T")]));
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
