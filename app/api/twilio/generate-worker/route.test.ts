import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock handles so they are available inside vi.mock factory closures
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  createComicStory: vi.fn(),
  sendComicMms: vi.fn(),
  updateConversation: vi.fn(),
  resetConversation: vi.fn(),
}));

// verifySignatureAppRouter becomes an identity pass-through so we can call
// the handler directly without a real QStash signature.
vi.mock("@/lib/qstash-nextjs", () => ({
  verifySignatureAppRouter: (fn: (req: Request) => Promise<Response>) => fn,
}));

vi.mock("@/lib/comic-service", () => ({
  createComicStory: h.createComicStory,
  ComicServiceError: class ComicServiceError extends Error {
    type: string;
    constructor(type: string, message: string) {
      super(message);
      this.type = type;
    }
  },
}));

vi.mock("@/lib/twilio", () => ({
  sendComicMms: h.sendComicMms,
}));

vi.mock("@/lib/db-actions", () => ({
  updateConversation: h.updateConversation,
  resetConversation: h.resetConversation,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/twilio/generate-worker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/twilio/generate-worker", () => {
  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = "https://app.example.com";
    h.createComicStory.mockReset();
    h.sendComicMms.mockReset();
    h.updateConversation.mockReset();
    h.resetConversation.mockReset();
    h.sendComicMms.mockResolvedValue(undefined);
    h.updateConversation.mockResolvedValue(undefined);
    h.resetConversation.mockResolvedValue(undefined);
  });

  it("success: createComicStory resolves → sendComicMms with mediaUrl and link, updateConversation done, returns ok:true", async () => {
    h.createComicStory.mockResolvedValue({
      story: { id: "story-1", slug: "my-comic", title: "My Comic" },
      page: { id: "page-1", pageNumber: 1 },
      imageUrl: "https://s3.example.com/my-comic.png",
    });

    const { POST } = await import("@/app/api/twilio/generate-worker/route");
    const res = await POST(makeRequest({ phoneNumber: "+15551112222", prompt: "a hero" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });

    expect(h.sendComicMms).toHaveBeenCalledOnce();
    const mmsCall = h.sendComicMms.mock.calls[0][0];
    expect(mmsCall.to).toBe("+15551112222");
    expect(mmsCall.mediaUrl).toBe("https://s3.example.com/my-comic.png");
    expect(mmsCall.body).toContain("https://app.example.com/story/my-comic");

    expect(h.updateConversation).toHaveBeenCalledWith("+15551112222", expect.objectContaining({ state: "done" }));
  });

  it("ComicServiceError content_policy → sendComicMms with error message (no mediaUrl), resetConversation, returns 200 ok:false", async () => {
    const { ComicServiceError } = await import("@/lib/comic-service");
    h.createComicStory.mockRejectedValue(new ComicServiceError("content_policy", "blocked"));

    const { POST } = await import("@/app/api/twilio/generate-worker/route");
    const res = await POST(makeRequest({ phoneNumber: "+15551112222", prompt: "bad content" }));
    const json = await res.json();

    // Must be 200 — QStash must NOT retry a handled content-policy failure
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: false, handled: true });

    expect(h.sendComicMms).toHaveBeenCalledOnce();
    const mmsCall = h.sendComicMms.mock.calls[0][0];
    expect(mmsCall.to).toBe("+15551112222");
    expect(mmsCall.mediaUrl).toBeUndefined();
    expect(typeof mmsCall.body).toBe("string");
    expect(mmsCall.body.length).toBeGreaterThan(0);

    expect(h.resetConversation).toHaveBeenCalledWith("+15551112222");
  });

  it("missing phoneNumber in body → 400", async () => {
    const { POST } = await import("@/app/api/twilio/generate-worker/route");
    const res = await POST(makeRequest({ prompt: "no phone" }));
    expect(res.status).toBe(400);
  });

  it("missing prompt in body → 400", async () => {
    const { POST } = await import("@/app/api/twilio/generate-worker/route");
    const res = await POST(makeRequest({ phoneNumber: "+15551112222" }));
    expect(res.status).toBe(400);
  });
});
