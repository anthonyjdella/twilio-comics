import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ publishJSON: vi.fn() }));
vi.mock("@upstash/qstash", () => ({
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  Client: vi.fn(function () { return { publishJSON: h.publishJSON }; }),
}));
vi.mock("@upstash/qstash/nextjs", () => ({ verifySignatureAppRouter: (fn: any) => fn }));

beforeEach(() => {
  process.env.QSTASH_TOKEN = "qtok";
  process.env.PUBLIC_BASE_URL = "https://app.example.com";
  h.publishJSON.mockReset();
  h.publishJSON.mockResolvedValue({ messageId: "m1" });
});

describe("publishGenerationJob", () => {
  it("publishes to the worker URL with the job body and a dedup id", async () => {
    const { publishGenerationJob } = await import("@/lib/qstash");
    await publishGenerationJob({ phoneNumber: "+15551112222", prompt: "hero", style: "noir" });
    expect(h.publishJSON).toHaveBeenCalledOnce();
    const arg = h.publishJSON.mock.calls[0][0];
    expect(arg.url).toBe("https://app.example.com/api/twilio/generate-worker");
    expect(arg.body).toMatchObject({ phoneNumber: "+15551112222", prompt: "hero", style: "noir" });
    expect(typeof arg.deduplicationId).toBe("string");
    expect(arg.deduplicationId.length).toBeGreaterThan(0);
  });
});
