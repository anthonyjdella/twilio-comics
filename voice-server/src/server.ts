import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import twilioSdk from "twilio";
import { Client } from "@upstash/qstash";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { dispatch, type Session } from "./handler.ts";

const PORT = parseInt(process.env.PORT || "8080", 10);
const PUBLIC_WSS = process.env.CONVERSATION_RELAY_WS_URL || "";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
const ratelimit = new Ratelimit({
  redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
  limiter: Ratelimit.fixedWindow(3, "7 d"),
  prefix: "ratelimit:free-comics",
});

const deps = {
  publish: async (job: { phoneNumber: string; prompt: string; style?: string }) => {
    const hash = createHash("sha256")
      .update(`${job.phoneNumber}:${job.prompt}:${job.style ?? ""}:`)
      .digest("hex")
      .slice(0, 16);
    await qstash.publishJSON({
      url: `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/api/twilio/generate-worker`,
      body: { ...job, source: "voice" },
      deduplicationId: `${job.phoneNumber}-${hash}`,
      retries: 2,
    });
  },
  getRemaining: (id: string) => ratelimit.getRemaining(id),
};

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const sig = req.headers["x-twilio-signature"] as string | undefined;
  const ok = !!sig && twilioSdk.validateRequest(process.env.TWILIO_AUTH_TOKEN!, sig, PUBLIC_WSS, {});
  if (!ok) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  let session: Session = { step: "awaiting_name" };
  // An unhandled 'error' event on a ws socket crashes the whole process
  // (which would drop every other live call). Log and let the socket close.
  ws.on("error", (err) => {
    console.error("websocket error:", err);
  });
  ws.on("message", async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      const result = await dispatch(session, msg, deps);
      session = result.session;
      for (const out of result.out) ws.send(JSON.stringify(out));
    } catch (err) {
      console.error("dispatch error:", err);
    }
  });
});

server.listen(PORT, () => console.log(`voice-server listening on ${PORT}`));
