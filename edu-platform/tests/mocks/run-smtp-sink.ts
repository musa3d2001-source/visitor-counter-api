/**
 * يشغّل خادم SMTP المحلي لاختبارات E2E، مع واجهة HTTP صغيرة يقرأ منها الاختبار ما وصل.
 * الاستخدام: npx tsx tests/mocks/run-smtp-sink.ts --port 4026 --http 4027
 */
import { createServer } from "node:http";
import { startSmtpSink } from "./smtp-sink";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
}

const sink = await startSmtpSink(Number(arg("port", "4026")));

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/__sink/health") return void res.end(JSON.stringify({ ok: true }));
  if (url.pathname === "/__sink/messages") {
    const to = url.searchParams.get("to")?.toLowerCase();
    return void res.end(JSON.stringify(to ? sink.messages.filter((m) => m.to.some((r) => r.toLowerCase() === to)) : sink.messages));
  }
  res.statusCode = 404;
  res.end("{}");
}).listen(Number(arg("http", "4027")), "127.0.0.1");
