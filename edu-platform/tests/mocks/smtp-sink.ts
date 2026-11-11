import { createServer, type Socket } from "node:net";

/**
 * خادم SMTP محلي للاختبارات: يتحدث البروتوكول الحقيقي (RFC 5321) ويفك ترميز الرسالة (RFC 2045 و 2047)
 * كما يصنعها nodemailer، فالاختبار يمر بمسار الإرسال الفعلي كله ولا يستبدل المكتبة.
 * لا يخزن شيئًا خارج الذاكرة ولا يرسل إلى الخارج.
 */
export type SinkMessage = { from: string; to: string[]; subject: string; text: string };

export type SmtpSink = {
  port: number;
  messages: SinkMessage[];
  /** المستلمون التالون يُرفضون برد 550 يقتبس عنوانهم، كما يفعل خادم بريد حقيقي */
  rejectNext(count?: number): void;
  /** هذا العنوان وحده يُرفض حتى clear، لاختبار فشل رسالة واحدة بين عدة رسائل */
  rejectAddress(address: string): void;
  clear(): void;
  close(): Promise<void>;
};

function decodeQuotedPrintable(value: string): string {
  const unfolded = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    if (unfolded[i] === "=" && /^[0-9A-F]{2}$/i.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(unfolded[i]!, "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeHeader(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, enc: string, data: string) =>
      enc.toUpperCase() === "B" ? Buffer.from(data, "base64").toString("utf8") : decodeQuotedPrintable(data.replace(/_/g, " ")),
    );
}

function parseMessage(raw: string, envelope: { from: string; to: string[] }): SinkMessage {
  const split = raw.indexOf("\r\n\r\n");
  const headerBlock = (split >= 0 ? raw.slice(0, split) : raw).replace(/\r\n[ \t]+/g, " ");
  const body = split >= 0 ? raw.slice(split + 4) : "";
  const headers = new Map(
    headerBlock.split("\r\n").map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()] as const;
    }),
  );
  const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();
  const text = encoding === "base64" ? Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8") : encoding === "quoted-printable" ? decodeQuotedPrintable(body) : body;
  return { from: decodeHeader(headers.get("from") ?? envelope.from), to: envelope.to, subject: decodeHeader(headers.get("subject") ?? ""), text };
}

export async function startSmtpSink(port = 0): Promise<SmtpSink> {
  const messages: SinkMessage[] = [];
  const sockets = new Set<Socket>();
  let reject = 0;
  const rejectedAddresses = new Set<string>();

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let dataLines: string[] = [];
    let envelope = { from: "", to: [] as string[] };
    const reply = (line: string) => socket.write(`${line}\r\n`);
    const address = (line: string) => /<([^>]*)>/.exec(line)?.[1] ?? "";

    reply("220 sink.test ESMTP");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (let at = buffer.indexOf("\r\n"); at >= 0; at = buffer.indexOf("\r\n")) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(parseMessage(dataLines.join("\r\n"), envelope));
            dataLines = [];
            envelope = { from: "", to: [] };
            reply("250 2.0.0 queued");
          } else {
            dataLines.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }
        const verb = line.split(" ")[0]!.toUpperCase();
        if (verb === "EHLO") socket.write("250-sink.test\r\n250 8BITMIME\r\n");
        else if (verb === "HELO") reply("250 sink.test");
        else if (verb === "MAIL") {
          envelope = { from: address(line), to: [] };
          reply("250 2.1.0 ok");
        } else if (verb === "RCPT") {
          // كما يرد Postfix: الرفض يقتبس العنوان نفسه، فيصل إلى نص الخطأ عند المرسل
          if (rejectedAddresses.has(address(line))) {
            reply(`550 5.1.1 <${address(line)}>: Recipient address rejected: User unknown`);
          } else if (reject > 0) {
            reject -= 1;
            reply(`550 5.1.1 <${address(line)}>: Recipient address rejected: User unknown`);
          } else {
            envelope.to.push(address(line));
            reply("250 2.1.5 ok");
          }
        } else if (verb === "DATA") {
          inData = true;
          reply("354 end with <CRLF>.<CRLF>");
        } else if (verb === "RSET") {
          envelope = { from: "", to: [] };
          reply("250 2.0.0 ok");
        } else if (verb === "NOOP") reply("250 2.0.0 ok");
        else if (verb === "QUIT") {
          reply("221 2.0.0 bye");
          socket.end();
        } else reply("502 5.5.2 not implemented");
      }
    });
  });

  await new Promise<void>((resolve, onError) => {
    server.once("error", onError);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    port: (server.address() as { port: number }).port,
    messages,
    rejectNext: (count = 1) => {
      reject = count;
    },
    rejectAddress: (address: string) => {
      rejectedAddresses.add(address);
    },
    clear: () => {
      messages.length = 0;
      reject = 0;
      rejectedAddresses.clear();
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
