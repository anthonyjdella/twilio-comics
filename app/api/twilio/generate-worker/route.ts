import { verifySignatureAppRouter } from "@/lib/qstash-nextjs";
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

    const link = `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/story/${result.story.slug}`;
    await sendComicMms({
      to: job.phoneNumber,
      body: `Your comic "${result.story.title}" is ready! View it and add more pages: ${link}`,
      mediaUrl: result.imageUrl,
    });

    // Bookkeeping is non-fatal: the comic is already generated and delivered.
    // A DB blip here must NOT escalate to a 500, which would make QStash retry
    // and regenerate (and re-charge) a second comic.
    try {
      await updateConversation(job.phoneNumber, {
        state: "done",
        activeStoryId: result.story.id,
      });
    } catch (bookkeepingErr) {
      console.error("Failed to mark conversation done:", bookkeepingErr);
    }
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
    // Non-fatal: a reset failure must not escalate to a 500 → QStash retry →
    // duplicate (re-charged) generation. We've already notified the user.
    try {
      await resetConversation(job.phoneNumber);
    } catch (resetErr) {
      console.error("Failed to reset conversation after failure:", resetErr);
    }
    // Return 200: we've already notified the user; no value in a QStash retry.
    return Response.json({ ok: false, handled: true });
  }
}

export const POST = verifySignatureAppRouter(handler);
