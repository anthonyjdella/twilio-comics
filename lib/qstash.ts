import { Client } from "@upstash/qstash";
import { createHash } from "node:crypto";

export interface GenerationJob {
  phoneNumber: string;
  prompt: string;
  style?: string;
  characterImageUrls?: string[];
}

export async function publishGenerationJob(job: GenerationJob): Promise<void> {
  const client = new Client({ token: process.env.QSTASH_TOKEN! });
  const url = `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/api/twilio/generate-worker`;
  const hash = createHash("sha256")
    .update(`${job.phoneNumber}:${job.prompt}:${job.style ?? ""}:${(job.characterImageUrls ?? []).join(",")}`)
    .digest("hex")
    .slice(0, 16);
  await client.publishJSON({
    url,
    body: job,
    deduplicationId: `${job.phoneNumber}-${hash}`,
    retries: 2,
  });
}
