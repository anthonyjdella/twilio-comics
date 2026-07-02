import { verifySignatureAppRouter } from "@/lib/qstash";
import { createComicStory, ComicServiceError } from "@/lib/comic-service";
import { sendComicMms } from "@/lib/twilio";
import { updateConversation, resetConversation } from "@/lib/db-actions";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handler(request: Request) {
  const job = (await request.json()) as {
    phoneNumber: string;
    prompt: string;
    style?: string;
    characterImageUrls?: string[];
  };

  if (!job?.phoneNumber || !job?.prompt) {
    return Response.json({ error: "Invalid job payload" }, { status: 400 });
  }

  try {
    const result = await createComicStory({
      userId: job.phoneNumber,
      prompt: job.prompt,
      style: job.style || "noir",
      characterImageUrls: job.characterImageUrls || [],
      source: "sms",
      generateTitle: true,
    });

    const link = `${process.env.PUBLIC_BASE_URL}/story/${result.story.slug}`;
    await sendComicMms({
      to: job.phoneNumber,
      body: `Your comic "${result.story.title}" is ready! View it and add more pages: ${link}`,
      mediaUrl: result.imageUrl,
    });

    await updateConversation(job.phoneNumber, {
      state: "done",
      activeStoryId: result.story.id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    let message =
      "Sorry, we couldn't create your comic this time. Text 'new' to try again.";
    if (error instanceof ComicServiceError) {
      if (error.type === "content_policy") {
        message =
          "That prompt tripped our content filter. Text 'new' and try a different idea!";
      } else if (error.type === "credit_limit") {
        message =
          "Our comic studio is over capacity right now. Please try again a bit later!";
      }
    } else {
      console.error("Unexpected worker error:", error);
    }

    try {
      await sendComicMms({ to: job.phoneNumber, body: message });
    } catch (smsErr) {
      console.error("Failed to send failure SMS:", smsErr);
    }
    await resetConversation(job.phoneNumber);
    // Return 200: we've already notified the user; no value in a QStash retry.
    return Response.json({ ok: false, handled: true });
  }
}

export const POST = verifySignatureAppRouter(handler);
