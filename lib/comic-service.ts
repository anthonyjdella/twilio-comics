import { buildComicPrompt } from "./prompt";
import { generateComicImage } from "./image-generation";
import { uploadBufferToS3 } from "./s3-upload";
import { generateTitleAndDescription } from "./title-generation";
import {
  createStory,
  createPage,
  updateStory,
  updatePage,
  deleteStory,
} from "./db-actions";
import { freeTierRateLimit } from "./rate-limit";
import { isContentPolicyViolation } from "./utils";

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
  apiKey?: string;
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

export async function createComicStory({
  userId,
  prompt,
  apiKey,
  style = "noir",
  characterImageUrls = [],
  source,
  generateTitle = true,
  usesOwnApiKey = !!apiKey,
}: CreateComicArgs): Promise<CreateComicResult> {
  const openAIApiKey = apiKey || process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new ComicServiceError(
      "api_error",
      "OPENAI_API_KEY environment variable is not set",
      500,
    );
  }

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
    ? generateTitleAndDescription({ apiKey: openAIApiKey, prompt, style })
    : Promise.resolve({
        title: fallbackTitle,
        description: undefined as string | undefined,
      });

  let imageBuffer: Buffer;
  try {
    imageBuffer = await generateComicImage({
      apiKey: openAIApiKey,
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

  if (!apiKey) {
    try {
      await freeTierRateLimit.limit(userId);
    } catch (rateLimitError) {
      console.error(
        "Error applying rate limit after successful generation:",
        rateLimitError,
      );
    }
  }

  return {
    story: { id: story.id, slug: story.slug, title, description },
    page: { id: page.id, pageNumber: page.pageNumber },
    imageUrl,
  };
}
