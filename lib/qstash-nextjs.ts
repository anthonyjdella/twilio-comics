// Next.js-only: the App Router signature-verification wrapper. Kept separate
// from lib/qstash.ts so non-Next consumers (the voice WS server) can import
// publishGenerationJob without pulling the /nextjs subpath.
export { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
