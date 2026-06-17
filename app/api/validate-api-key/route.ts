import { type NextRequest, NextResponse } from "next/server";
import Together from "together-ai";

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { valid: false, error: "API key is required" },
        { status: 400 },
      );
    }

    // Dynamically fetch the fastest available model
    const routerRes = await fetch("https://whichllm.together.ai/router/fast", {
      next: { revalidate: 60 },
    });
    const { model } = await routerRes.json();

    // Fire a minimal completion — 1 output token to keep cost/latency negligible
    const client = new Together({ apiKey });
    await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    });

    return NextResponse.json({ valid: true });
  } catch (error: unknown) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status: number }).status
        : undefined;

    if (status === 401 || status === 403) {
      return NextResponse.json({ valid: false, error: "Invalid API key" });
    }

    return NextResponse.json(
      { valid: false, error: "Validation failed" },
      { status: 500 },
    );
  }
}
