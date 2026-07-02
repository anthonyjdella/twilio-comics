import { COMIC_STYLES } from "./constants";
import { buildComicPrompt } from "./prompt";
import { generateComicImage } from "./image-generation";
import { uploadBufferToS3 } from "./s3-upload";
import {
  createStory,
  createPage,
  updateStory,
  updatePage,
  deleteStory,
} from "./db-actions";
import { freeTierRateLimit } from "./rate-limit";
import { isContentPolicyViolation } from "./utils";
import Together from "together-ai";

const TEXT_MODEL = "Qwen/Qwen3.5-9B";

export class ComicServiceError extends Error {
  type: "content_policy" | "credit_limit" | "api_error";
  status?: number;
  constructor(
    type: "content_policy" | "credit_limit" | "api_error",
    message: string,
    status?: number,
  ) {
    super(message);
    this.type = type;
    this.status = status;
  }
}

export interface CreateComicArgs {
  userId: string;
  prompt: string;
  style?: string;
  characterImageUrls?: string[];
  source: "web" | "sms" | "voice";
  generateTitle?: boolean;
  usesOwnApiKey?: boolean;
}

export interface CreateComicResult {
  story: { id: string; slug: string; title: string; description?: string };
  page: { id: string; pageNumber: number };
  imageUrl: string;
}

async function generateTitleAndDescription(
  prompt: string,
  style: string,
): Promise<{ title: string; description?: string }> {
  try {
    const styleName = COMIC_STYLES.find((s) => s.id === style)?.name || style;
    const client = new Together({ apiKey: process.env.TOGETHER_API_KEY });
    const titlePrompt = `Based on this comic book prompt, generate a compelling title and description for the comic book.

Prompt: "${prompt}"
Style: ${styleName}

Generate:
1. A catchy, engaging title (maximum 60 characters)
2. A brief description (2-3 sentences, maximum 200 characters)

Format your response as JSON:
{
  "title": "Title here",
  "description": "Description here"
}

Only return the JSON, no other text.`;

    const textResponse = await client.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a creative assistant that generates compelling comic book titles and descriptions. Always respond with valid JSON only.",
        },
        { role: "user", content: titlePrompt },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const content = textResponse.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("No response from text generation");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const fallbackTitle =
      prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;
    const rawTitle = parsed.title?.trim() || fallbackTitle;
    const rawDescription = parsed.description?.trim();

    const title =
      rawTitle.length > 60 ? rawTitle.substring(0, 57) + "..." : rawTitle;
    const description =
      rawDescription && rawDescription.length > 200
        ? rawDescription.substring(0, 197) + "..."
        : rawDescription;

    return { title, description: description || undefined };
  } catch (error) {
    console.error("Error generating title and description:", error);
    return {
      title: prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt,
      description: undefined,
    };
  }
}

export async function createComicStory({
  userId,
  prompt,
  style = "noir",
  characterImageUrls = [],
  source,
  generateTitle = true,
  usesOwnApiKey = false,
}: CreateComicArgs): Promise<CreateComicResult> {
  const fallbackTitle =
    prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;

  const story = await createStory({
    title: fallbackTitle,
    description: undefined,
    userId,
    style,
    source,
    usesOwnApiKey,
  });

  const page = await createPage({
    storyId: story.id,
    pageNumber: 1,
    prompt,
    characterImageUrls,
  });

  const fullPrompt = buildComicPrompt({
    prompt,
    style,
    characterImages: characterImageUrls,
  });

  // Kick off title generation in parallel (non-fatal)
  const titlePromise = generateTitle
    ? generateTitleAndDescription(prompt, style)
    : Promise.resolve({
        title: fallbackTitle,
        description: undefined as string | undefined,
      });

  let imageBuffer: Buffer;
  try {
    imageBuffer = await generateComicImage({
      apiKey: process.env.OPENAI_API_KEY!,
      prompt: fullPrompt,
      referenceImageUrls: characterImageUrls,
    });
  } catch (error) {
    try {
      await deleteStory(story.id);
    } catch (cleanupError) {
      console.error(
        "Error cleaning up story on generation failure:",
        cleanupError,
      );
    }
    const message =
      error instanceof Error ? error.message : "Unknown error";
    if (error instanceof Error && isContentPolicyViolation(message)) {
      throw new ComicServiceError("content_policy", message);
    }
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    if (status === 402 || status === 429) {
      throw new ComicServiceError("credit_limit", message, status);
    }
    throw new ComicServiceError("api_error", message, status);
  }

  const s3Key = `${story.id}/page-${page.pageNumber}-${Date.now()}.png`;
  const imageUrl = await uploadBufferToS3(imageBuffer, s3Key, "image/png");

  const { title, description } = await titlePromise;
  try {
    await updateStory(story.id, { title, description });
  } catch (dbError) {
    console.error("Error updating story title/description:", dbError);
  }

  await updatePage(page.id, imageUrl);

  try {
    await freeTierRateLimit.limit(userId);
  } catch (rateLimitError) {
    console.error(
      "Error applying rate limit after successful generation:",
      rateLimitError,
    );
  }

  return {
    story: { id: story.id, slug: story.slug, title, description },
    page: { id: page.id, pageNumber: page.pageNumber },
    imageUrl,
  };
}
