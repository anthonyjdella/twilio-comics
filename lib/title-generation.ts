import OpenAI from "openai";
import { COMIC_STYLES } from "./constants";

export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";

interface GenerateTitleAndDescriptionArgs {
  apiKey: string;
  prompt: string;
  style: string;
}

function fallbackTitle(prompt: string): string {
  return prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;
}

export async function generateTitleAndDescription({
  apiKey,
  prompt,
  style,
}: GenerateTitleAndDescriptionArgs): Promise<{
  title: string;
  description?: string;
}> {
  try {
    const styleName = COMIC_STYLES.find((s) => s.id === style)?.name || style;
    const client = new OpenAI({ apiKey });
    const titlePrompt = `Based on this comic book prompt, generate a compelling title and description for the comic book.

Prompt: "${prompt}"
Style: ${styleName}

Generate:
1. A catchy, engaging title (maximum 60 characters)
2. A brief description (2-3 sentences, maximum 200 characters)

Format your response as JSON:
{
  "title": "Title here",
  "description": "Description here"
}

Only return the JSON, no other text.`;

    const textResponse = await client.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a creative assistant that generates compelling comic book titles and descriptions. Always respond with valid JSON only.",
        },
        { role: "user", content: titlePrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 300,
    });

    const content = textResponse.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("No response from text generation");

    const parsed = JSON.parse(content) as {
      title?: string;
      description?: string;
    };
    const rawTitle = parsed.title?.trim() || fallbackTitle(prompt);
    const rawDescription = parsed.description?.trim();

    const title =
      rawTitle.length > 60 ? rawTitle.substring(0, 57) + "..." : rawTitle;
    const description =
      rawDescription && rawDescription.length > 200
        ? rawDescription.substring(0, 197) + "..."
        : rawDescription;

    return { title, description: description || undefined };
  } catch (error) {
    console.error("Error generating title and description:", error);
    return {
      title: fallbackTitle(prompt),
      description: undefined,
    };
  }
}
