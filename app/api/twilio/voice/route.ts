import { type NextRequest } from "next/server";
import { validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((v, k) => {
    params[k] = v;
  });

  const url = `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/api/twilio/voice`;
  const signature = request.headers.get("x-twilio-signature");
  if (!validateTwilioSignature({ signature, url, params })) {
    return new Response("Invalid signature", { status: 403 });
  }

  // Fail loudly if the WS server URL is unconfigured: returning TwiML with an
  // empty url="" would answer the call and then silently drop it (no log, no
  // error) — a 503 makes the misconfiguration diagnosable.
  if (!process.env.CONVERSATION_RELAY_WS_URL) {
    console.error("CONVERSATION_RELAY_WS_URL is not set; cannot start voice session");
    return new Response("Voice service unavailable", { status: 503 });
  }

  const wsUrl = escapeXmlAttr(process.env.CONVERSATION_RELAY_WS_URL);
  const greeting = escapeXmlAttr(
    "Welcome to Make Comics! I'll help you create a comic over the phone. What's your name?",
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><ConversationRelay url="${wsUrl}" welcomeGreeting="${greeting}" ttsProvider="Google" transcriptionProvider="Deepgram" language="en-US" interruptible="any"/></Connect></Response>`;

  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
