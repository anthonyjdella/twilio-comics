import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock("openai", () => {
  function OpenAI() {
    return { chat: { completions: { create: createMock } } };
  }
  return { default: OpenAI };
});

import { generateTitleAndDescription, TEXT_MODEL } from "@/lib/title-generation";

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: "Rooftop Signal",
            description: "A noir hero watches over the city from above.",
          }),
        },
      },
    ],
  });
});

describe("generateTitleAndDescription", () => {
  it("uses an OpenAI text model and parses the JSON response", async () => {
    const result = await generateTitleAndDescription({
      apiKey: "test-key",
      prompt: "batman on a rooftop",
      style: "noir",
    });

    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock.mock.calls[0][0]).toMatchObject({
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
    });
    expect(result).toEqual({
      title: "Rooftop Signal",
      description: "A noir hero watches over the city from above.",
    });
  });

  it("falls back to a prompt-derived title if text generation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createMock.mockRejectedValue(new Error("network error"));

    try {
      const result = await generateTitleAndDescription({
        apiKey: "test-key",
        prompt: "a very long comic prompt that should be trimmed into a readable fallback title",
        style: "noir",
      });

      expect(result).toEqual({
        title: "a very long comic prompt that should be trimmed in...",
        description: undefined,
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
