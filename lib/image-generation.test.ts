import { describe, it, expect, vi, beforeEach } from "vitest";

const { generateMock, editMock, toFileMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  editMock: vi.fn(),
  toFileMock: vi.fn(async (buf: Buffer, name: string, opts: any) => ({ name, opts })),
}));

vi.mock("openai", () => {
  function OpenAI() {
    return { images: { generate: generateMock, edit: editMock } };
  }
  return { default: OpenAI, toFile: toFileMock };
});

import { generateComicImage, IMAGE_SIZE } from "@/lib/image-generation";

const B64 = Buffer.from("fake-png-bytes").toString("base64");

beforeEach(() => {
  generateMock.mockReset();
  editMock.mockReset();
  generateMock.mockResolvedValue({ data: [{ b64_json: B64 }] });
  editMock.mockResolvedValue({ data: [{ b64_json: B64 }] });
  // Stub fetch for reference-image downloads
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode("ref").buffer,
    headers: { get: () => "image/png" },
  })));
});

describe("generateComicImage", () => {
  it("uses images.generate (text-only) when there are no reference images", async () => {
    const out = await generateComicImage({ apiKey: "k", prompt: "hero", referenceImageUrls: [] });
    expect(generateMock).toHaveBeenCalledOnce();
    expect(editMock).not.toHaveBeenCalled();
    const arg = generateMock.mock.calls[0][0];
    expect(arg.model).toBe("gpt-image-2");
    expect(arg.size).toBe("1024x1536");
    expect(arg.size).toBe(IMAGE_SIZE);
    expect(arg.quality).toBe("high");
    expect(arg).not.toHaveProperty("response_format");
    expect(arg).not.toHaveProperty("temperature");
    expect(out).toBeInstanceOf(Buffer);
    expect(out.toString()).toBe("fake-png-bytes");
  });

  it("uses images.edit with input images when reference images are provided", async () => {
    await generateComicImage({ apiKey: "k", prompt: "hero", referenceImageUrls: ["https://s3/a.png", "https://s3/b.png"] });
    expect(editMock).toHaveBeenCalledOnce();
    expect(generateMock).not.toHaveBeenCalled();
    const arg = editMock.mock.calls[0][0];
    expect(arg.model).toBe("gpt-image-2");
    expect(Array.isArray(arg.image)).toBe(true);
    expect(arg.image).toHaveLength(2);
    expect(arg.quality).toBe("high");
    expect(arg.input_fidelity).toBe("high");
  });

  it("caps reference images at 16", async () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://s3/${i}.png`);
    await generateComicImage({ apiKey: "k", prompt: "x", referenceImageUrls: urls });
    expect(editMock.mock.calls[0][0].image).toHaveLength(16);
  });

  it("throws when OpenAI returns no image data", async () => {
    generateMock.mockResolvedValue({ data: [] });
    await expect(generateComicImage({ apiKey: "k", prompt: "x" })).rejects.toThrow(/no image/i);
  });
});
