import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  generateComicImage: vi.fn(),
  uploadBufferToS3: vi.fn(),
  createStory: vi.fn(),
  createPage: vi.fn(),
  updateStory: vi.fn(),
  updatePage: vi.fn(),
  deleteStory: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/image-generation", () => ({ generateComicImage: h.generateComicImage }));
vi.mock("@/lib/s3-upload", () => ({ uploadBufferToS3: h.uploadBufferToS3 }));
vi.mock("@/lib/db-actions", () => ({
  createStory: h.createStory,
  createPage: h.createPage,
  updateStory: h.updateStory,
  updatePage: h.updatePage,
  deleteStory: h.deleteStory,
}));
vi.mock("@/lib/rate-limit", () => ({ freeTierRateLimit: { limit: h.limit } }));

import { createComicStory, ComicServiceError } from "@/lib/comic-service";

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  process.env.OPENAI_API_KEY = "test-openai-key";
  h.createStory.mockResolvedValue({ id: "s1", slug: "hero-abcd", title: "temp", description: null });
  h.createPage.mockResolvedValue({ id: "p1", pageNumber: 1 });
  h.generateComicImage.mockResolvedValue(Buffer.from("png"));
  h.uploadBufferToS3.mockResolvedValue("https://bucket.s3.amazonaws.com/comics/s1/page-1.png");
  h.updateStory.mockResolvedValue(undefined);
  h.updatePage.mockResolvedValue(undefined);
  h.limit.mockResolvedValue({ success: true });
});

describe("createComicStory", () => {
  it("creates a story + page, generates and uploads image, applies rate limit, returns urls", async () => {
    const res = await createComicStory({
      userId: "+15551234567",
      prompt: "batman on a rooftop",
      source: "sms",
      generateTitle: false,
    });
    expect(h.createStory).toHaveBeenCalledOnce();
    expect(h.createStory.mock.calls[0][0]).toMatchObject({ userId: "+15551234567", source: "sms" });
    expect(h.generateComicImage).toHaveBeenCalledOnce();
    expect(h.uploadBufferToS3).toHaveBeenCalledOnce();
    expect(h.updatePage).toHaveBeenCalledWith("p1", res.imageUrl);
    expect(h.limit).toHaveBeenCalledWith("+15551234567");
    expect(res.imageUrl).toContain("page-1.png");
    expect(res.story.slug).toBe("hero-abcd");
  });

  it("passes character image urls to generation as references", async () => {
    await createComicStory({
      userId: "u1", prompt: "x", source: "web", generateTitle: false,
      characterImageUrls: ["https://s3/a.png"],
    });
    expect(h.generateComicImage.mock.calls[0][0].referenceImageUrls).toEqual(["https://s3/a.png"]);
  });

  it("uses a provided OpenAI key and skips server-funded rate limiting", async () => {
    await createComicStory({
      userId: "u1",
      prompt: "x",
      source: "web",
      generateTitle: false,
      apiKey: "user-openai-key",
    });

    expect(h.generateComicImage.mock.calls[0][0].apiKey).toBe("user-openai-key");
    expect(h.limit).not.toHaveBeenCalled();
  });

  it("deletes the story and throws content_policy on a policy violation", async () => {
    h.generateComicImage.mockRejectedValue(new Error("Your request was rejected as a result of our safety system"));
    await expect(
      createComicStory({ userId: "u1", prompt: "x", source: "web", generateTitle: false }),
    ).rejects.toMatchObject({ type: "content_policy" });
    expect(h.deleteStory).toHaveBeenCalledWith("s1");
  });

  it("maps a 402 to credit_limit and cleans up", async () => {
    const err: any = new Error("insufficient_quota"); err.status = 402;
    h.generateComicImage.mockRejectedValue(err);
    await expect(
      createComicStory({ userId: "u1", prompt: "x", source: "web", generateTitle: false }),
    ).rejects.toMatchObject({ type: "credit_limit" });
    expect(h.deleteStory).toHaveBeenCalledWith("s1");
  });
});
