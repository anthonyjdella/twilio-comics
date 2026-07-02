import { describe, it, expect } from "vitest";
import { handleVoiceTurn } from "@/lib/voice-conversation";

describe("handleVoiceTurn", () => {
  it("first utterance (name) → asks for the comic idea, no enqueue", () => {
    const r = handleVoiceTurn({ step: "awaiting_name" }, { voicePrompt: "Ada" });
    expect(r.session.step).toBe("awaiting_prompt");
    expect(r.session.name).toBe("Ada");
    expect(r.say).toMatch(/Ada/);
    expect(r.action).toBe("none");
    expect(r.endCall).toBeFalsy();
  });

  it("second utterance (prompt) → enqueues, confirms, ends the call", () => {
    const r = handleVoiceTurn(
      { step: "awaiting_prompt", name: "Ada" },
      { voicePrompt: "a robot detective in the rain" },
    );
    expect(r.session.step).toBe("done");
    expect(r.session.prompt).toBe("a robot detective in the rain");
    expect(r.action).toBe("enqueue_generation");
    expect(r.endCall).toBe(true);
    expect(r.say).toMatch(/text|phone|sent/i);
  });

  it("empty name utterance re-prompts, stays awaiting_name, no enqueue", () => {
    const r = handleVoiceTurn({ step: "awaiting_name" }, { voicePrompt: "   " });
    expect(r.session.step).toBe("awaiting_name");
    expect(r.action).toBe("none");
    expect(r.endCall).toBeFalsy();
  });

  it("empty prompt utterance re-prompts, stays awaiting_prompt", () => {
    const r = handleVoiceTurn({ step: "awaiting_prompt", name: "Ada" }, { voicePrompt: "" });
    expect(r.session.step).toBe("awaiting_prompt");
    expect(r.action).toBe("none");
    expect(r.endCall).toBeFalsy();
  });

  it("done step ignores further input without enqueuing again", () => {
    const r = handleVoiceTurn({ step: "done", name: "Ada", prompt: "x" }, { voicePrompt: "hello?" });
    expect(r.action).toBe("none");
    expect(r.endCall).toBe(true);
  });
});
