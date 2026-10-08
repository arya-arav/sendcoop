import { createServer, type Server } from "node:net";

// An SMTP server that accepts every message and keeps none: the load test
// (D80) sends a million emails to it, which Mailpit would have to store.

export type SmtpSink = { messages: () => number; close: () => Promise<void> };

export async function startSmtpSink(port: number): Promise<SmtpSink> {
  let count = 0;
  const server: Server = createServer((socket) => {
    socket.setEncoding("latin1");
    let buffer = "";
    let inData = false;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink ESMTP");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) {
            // Keep only enough to spot the end marker across chunks.
            if (buffer.length > 8) buffer = buffer.slice(-8);
            return;
          }
          buffer = buffer.slice(end + 5);
          inData = false;
          count++;
          reply("250 2.0.0 queued");
          continue;
        }
        const newline = buffer.indexOf("\r\n");
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO") {
          socket.write("250-sink\r\n250-PIPELINING\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
        } else if (verb === "HELO") reply("250 sink");
        else if (verb === "DATA") {
          inData = true;
          reply("354 go ahead");
        } else if (verb === "QUIT") {
          reply("221 bye");
          socket.end();
          return;
        } else reply("250 ok"); // MAIL, RCPT, RSET, NOOP
      }
    });
    socket.on("error", () => socket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    messages: () => count,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
