import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  create: vi.fn(),
}));

vi.mock("twilio", () => {
  const twilio: any = vi.fn(() => ({ messages: { create: h.create } }));
  twilio.validateRequest = h.validateRequest;
  return { default: twilio };
});

beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "tok";
  process.env.TWILIO_PHONE_NUMBER = "+15550000000";
  h.validateRequest.mockReset();
  h.create.mockReset();
  h.create.mockResolvedValue({ sid: "SM1" });
});

describe("parseInboundSms", () => {
  it("parses from/body and indexed media", async () => {
    const { parseInboundSms } = await import("@/lib/twilio");
    const r = parseInboundSms({
      From: "+15551112222", To: "+15550000000", Body: "hi",
      NumMedia: "2", MediaUrl0: "https://u/0", MediaContentType0: "image/jpeg",
      MediaUrl1: "https://u/1", MediaContentType1: "image/png",
    });
    expect(r.from).toBe("+15551112222");
    expect(r.body).toBe("hi");
    expect(r.mediaUrls).toEqual(["https://u/0", "https://u/1"]);
    expect(r.mediaContentTypes).toEqual(["image/jpeg", "image/png"]);
  });

  it("handles zero media", async () => {
    const { parseInboundSms } = await import("@/lib/twilio");
    const r = parseInboundSms({ From: "+1", To: "+2", Body: "x", NumMedia: "0" });
    expect(r.mediaUrls).toEqual([]);
  });
});

describe("validateTwilioSignature", () => {
  it("delegates to twilio.validateRequest with auth token, url, params", async () => {
    h.validateRequest.mockReturnValue(true);
    const { validateTwilioSignature } = await import("@/lib/twilio");
    const ok = validateTwilioSignature({ signature: "sig", url: "https://a/api/twilio/sms", params: { From: "+1" } });
    expect(ok).toBe(true);
    expect(h.validateRequest).toHaveBeenCalledWith("tok", "sig", "https://a/api/twilio/sms", { From: "+1" });
  });

  it("returns false when signature header is null", async () => {
    const { validateTwilioSignature } = await import("@/lib/twilio");
    expect(validateTwilioSignature({ signature: null, url: "https://a", params: {} })).toBe(false);
    expect(h.validateRequest).not.toHaveBeenCalled();
  });
});

describe("sendComicMms", () => {
  it("sends an MMS with mediaUrl array when provided", async () => {
    const { sendComicMms } = await import("@/lib/twilio");
    await sendComicMms({ to: "+15551112222", body: "done", mediaUrl: "https://s3/x.png" });
    expect(h.create).toHaveBeenCalledWith({
      to: "+15551112222", from: "+15550000000", body: "done", mediaUrl: ["https://s3/x.png"],
    });
  });

  it("sends plain SMS (no mediaUrl key) when no media", async () => {
    const { sendComicMms } = await import("@/lib/twilio");
    await sendComicMms({ to: "+15551112222", body: "text only" });
    expect(h.create).toHaveBeenCalledWith({ to: "+15551112222", from: "+15550000000", body: "text only" });
  });
});
