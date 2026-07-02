import { type NextRequest } from "next/server";
import {
  validateTwilioSignature,
  parseInboundSms,
  downloadTwilioMedia,
} from "@/lib/twilio";
import { advanceConversation, type Collected, type ConversationState } from "@/lib/conversation";
import { publishGenerationJob } from "@/lib/qstash";
import { getOrCreateConversation, updateConversation } from "@/lib/db-actions";
import { uploadBufferToS3 } from "@/lib/s3-upload";
import { freeTierRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((v, k) => {
    params[k] = v;
  });

  // Signature validation MUST happen before any DB work
  const url = `${process.env.PUBLIC_BASE_URL}/api/twilio/sms`;
  const signature = request.headers.get("x-twilio-signature");
  if (!validateTwilioSignature({ signature, url, params })) {
    return new Response("Invalid signature", { status: 403 });
  }

  const inbound = parseInboundSms(params);
  if (!inbound.from) {
    return twiml("Sorry, something went wrong. Please try again.");
  }

  try {
    const convo = await getOrCreateConversation(inbound.from);
    const collected = (convo.collected || {}) as Collected;

    // Download + re-upload any attached images as character references
    const newImageUrls: string[] = [];
    for (let i = 0; i < inbound.mediaUrls.length; i++) {
      const ct = inbound.mediaContentTypes[i] || "";
      if (!ct.startsWith("image/")) continue;
      try {
        const { buffer, contentType } = await downloadTwilioMedia(inbound.mediaUrls[i]);
        const ext = contentType.includes("png") ? "png" : "jpg";
        const s3Url = await uploadBufferToS3(
          buffer,
          `chars/${inbound.from.replace(/[^0-9]/g, "")}/${Date.now()}-${i}.${ext}`,
          contentType,
        );
        newImageUrls.push(s3Url);
      } catch (mediaErr) {
        console.error("Failed to ingest inbound media:", mediaErr);
        // Non-fatal: continue processing other media items
      }
    }

    const advance = advanceConversation(
      { state: convo.state as ConversationState, collected },
      { body: inbound.body, hasImage: newImageUrls.length > 0 },
    );

    // Merge new character images into collected, capped at 2 (matches web UI)
    const mergedCollected: Collected = { ...advance.collected };
    if (newImageUrls.length > 0) {
      mergedCollected.characterImageUrls = [
        ...(advance.collected.characterImageUrls || []),
        ...newImageUrls,
      ].slice(0, 2);
    }

    await updateConversation(inbound.from, {
      state: advance.nextState,
      collected: mergedCollected as Record<string, unknown>,
    });

    if (advance.action === "enqueue_generation" && mergedCollected.prompt) {
      // Image generation is server-funded, so gate free-tier usage BEFORE
      // spending budget. Peek at remaining credits (the worker's
      // freeTierRateLimit.limit() does the single consume on success).
      const { remaining } = await freeTierRateLimit.getRemaining(inbound.from);
      if (remaining <= 0) {
        // Roll back to awaiting_prompt so the user can retry after the window
        // resets, instead of being stuck in the "generating" state.
        await updateConversation(inbound.from, {
          state: "awaiting_prompt",
          collected: mergedCollected as Record<string, unknown>,
        });
        return twiml(
          "You've reached the free limit of 3 comics this week. Please try again in a few days!",
        );
      }

      await publishGenerationJob({
        phoneNumber: inbound.from,
        prompt: mergedCollected.prompt,
        style: mergedCollected.style || "noir",
        characterImageUrls: mergedCollected.characterImageUrls,
      });
    }

    return twiml(advance.reply);
  } catch (err) {
    console.error("Error in Twilio SMS webhook:", err);
    return twiml("Sorry, something went wrong on our end. Text 'new' to start over.");
  }
}
