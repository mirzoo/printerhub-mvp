import { createServer } from "node:http";
import { createCopySession } from "./api.js";
import { config } from "./config.js";

export function startLoopbackServer() {
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin ?? "";
    const allowed = origin === config.kioskOrigin;
    response.setHeader("Access-Control-Allow-Origin", allowed ? origin : "null");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") { response.writeHead(allowed ? 204 : 403).end(); return; }
    if (!allowed || request.method !== "POST" || request.url !== "/copy-session") { response.writeHead(404).end(); return; }
    try {
      const session = await createCopySession();
      response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify(session));
    } catch {
      response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ message: "Копирование временно недоступно" }));
    }
  });
  server.listen(config.kioskLoopbackPort, "127.0.0.1", () => console.log(`Kiosk bridge: 127.0.0.1:${config.kioskLoopbackPort}`));
  return server;
}
