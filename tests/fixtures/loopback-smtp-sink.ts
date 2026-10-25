import { createServer, type Socket } from "node:net";

/** Minimal synthetic-only SMTP sink. Never records AUTH commands or opens outbound connections. */
export async function createLoopbackSmtpSink() {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    let buffer = "", body = "", dataMode = false;
    socket.setEncoding("utf8"); socket.write("220 synthetic.example.test ESMTP\r\n");
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (dataMode) {
          if (line === ".") { messages.push(body); body = ""; dataMode = false; socket.write("250 accepted synthetic message\r\n"); }
          else body += `${line}\r\n`;
        } else if (/^EHLO /i.test(line)) socket.write("250-synthetic.example.test\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH PLAIN /i.test(line)) socket.write("235 synthetic auth accepted\r\n");
        else if (/^MAIL FROM:/i.test(line)) socket.write("250 sender accepted\r\n");
        else if (/^RCPT TO:<[^<>\s]+@example\.test>$/i.test(line)) socket.write("250 synthetic recipient accepted\r\n");
        else if (line === "DATA") { dataMode = true; socket.write("354 finish with dot\r\n"); }
        else if (line === "QUIT") socket.end("221 goodbye\r\n");
        else socket.write("550 synthetic-only sink rejected command\r\n");
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing synthetic SMTP listener");
  return { port: address.port, messages, async close() {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}
