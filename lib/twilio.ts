import twilio from "twilio";

function client() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

export interface InboundSms {
  from: string;
  to: string;
  body: string;
  mediaUrls: string[];
  mediaContentTypes: string[];
}

export function parseInboundSms(params: Record<string, string>): InboundSms {
  const numMedia = parseInt(params.NumMedia || "0", 10) || 0;
  const mediaUrls: string[] = [];
  const mediaContentTypes: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) {
      mediaUrls.push(url);
      mediaContentTypes.push(params[`MediaContentType${i}`] || "application/octet-stream");
    }
  }
  return {
    from: params.From || "",
    to: params.To || "",
    body: (params.Body || "").trim(),
    mediaUrls,
    mediaContentTypes,
  };
}

export function validateTwilioSignature({
  signature,
  url,
  params,
}: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!signature) return false;
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, signature, url, params);
}

export async function sendComicMms({
  to,
  body,
  mediaUrl,
}: {
  to: string;
  body: string;
  mediaUrl?: string;
}): Promise<void> {
  const params: { to: string; from: string; body: string; mediaUrl?: string[] } = {
    to,
    from: process.env.TWILIO_PHONE_NUMBER!,
    body,
  };
  if (mediaUrl) params.mediaUrl = [mediaUrl];
  await client().messages.create(params);
}

export async function sendSms({ to, body }: { to: string; body: string }): Promise<void> {
  await sendComicMms({ to, body });
}

export async function downloadTwilioMedia(
  mediaUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const authHeader =
    "Basic " +
    Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
  if (!res.ok) {
    throw new Error(`Failed to download Twilio media ${mediaUrl}: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}
