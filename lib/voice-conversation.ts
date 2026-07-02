export type VoiceStep = "awaiting_name" | "awaiting_prompt" | "done";

export interface VoiceSession {
  step: VoiceStep;
  name?: string;
  prompt?: string;
}

export interface VoiceInbound {
  voicePrompt: string;
}

export interface VoiceReply {
  session: VoiceSession;
  say?: string;
  endCall?: boolean;
  action: "none" | "enqueue_generation";
}

export function handleVoiceTurn(session: VoiceSession, inbound: VoiceInbound): VoiceReply {
  const text = (inbound.voicePrompt || "").trim();

  switch (session.step) {
    case "awaiting_name": {
      if (!text) {
        return {
          session,
          say: "Sorry, I didn't catch your name. What's your name?",
          action: "none",
        };
      }
      return {
        session: { ...session, step: "awaiting_prompt", name: text },
        say: `Nice to meet you, ${text}! Now describe the comic you'd like — a scene, characters, or a vibe.`,
        action: "none",
      };
    }
    case "awaiting_prompt": {
      if (!text) {
        return {
          session,
          say: "Tell me what the comic should be about.",
          action: "none",
        };
      }
      return {
        session: { ...session, step: "done", prompt: text },
        say: "Great! Your comic is being created now and will be texted to your phone in about a minute. Goodbye!",
        endCall: true,
        action: "enqueue_generation",
      };
    }
    case "done":
    default: {
      return {
        session,
        say: "Your comic is on its way by text. Goodbye!",
        endCall: true,
        action: "none",
      };
    }
  }
}
