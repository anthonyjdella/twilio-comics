<a href="https://www.makecomics.io/">
  <img alt="Make Comics" src="./public/og.png">
  <h1 align="center">Make Comics</h1>
</a>

<p align="center">
  Create comic books with AI. Generate stories, characters, and panels using advanced AI models.
</p>

## How AI Generates Comics

Comic pages are generated with [**OpenAI `gpt-image-2`**](https://platform.openai.com/docs/guides/image-generation): `images.edit` is used when a character reference image or a previous page is available (for visual consistency), and `images.generate` is used otherwise. Story titles and narratives are generated with [**Qwen3 80B**](https://www.together.ai/models/qwen3-next-80b-a3b-instruct) via Together AI.
The AI references previous pages for visual coherence and uses uploaded character images to maintain consistency across panels.

## Tech stack

- [Next.js 16](https://nextjs.org/) with React 19 and Tailwind CSS
- [Drizzle ORM](https://orm.drizzle.team/) with [Neon](https://neon.tech) PostgreSQL database
- [Clerk](https://clerk.com/) for authentication
- [OpenAI](https://openai.com/) for image generation (`gpt-image-2`)
- [Together AI](https://together.ai/) for story title/narrative generation (Qwen3 80B)
- [AWS S3](https://aws.amazon.com/s3/) for image storage
- [Upstash Redis](https://upstash.com/) for rate limiting
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- [Twilio](https://www.twilio.com/) for SMS/MMS delivery
- [Upstash QStash](https://upstash.com/docs/qstash/overview) for async background jobs

## Create comics by text (SMS/MMS)

Text the Twilio number your name, then a comic idea (optionally attach a photo) — you receive the finished comic as an MMS image plus a link to the web story page approximately 1 minute later.

The SMS channel uses an **async, webhook-driven design**: the incoming SMS webhook acknowledges instantly (to beat Twilio's ~15 second timeout), while a QStash background job generates the comic (30–60 seconds) and delivers it via outbound MMS.

### Setup checklist

1. **Create a Twilio account** and retrieve your Account SID and Auth Token from the [Twilio Console](https://console.twilio.com).

2. **Buy a Twilio phone number** with SMS, Voice, and MMS capabilities enabled.

3. **A2P 10DLC registration (Brand + Campaign)** — **REQUIRED for US SMS deliverability**. This ~10–15 day carrier review process is mandatory before your number can send SMS at scale. Start early.
   - Register your brand and campaign in the [Twilio Console](https://console.twilio.com).
   - Estimated completion: 10–15 days pending carrier review.

4. **Set the number's Messaging webhook** in the [Twilio Console](https://console.twilio.com):
   - Webhook URL: `<PUBLIC_BASE_URL>/api/twilio/sms` (HTTP POST)
   - Replace `<PUBLIC_BASE_URL>` with your public HTTPS domain (no trailing slash; e.g., `https://myapp.example.com` or `https://myapp.ngrok.io`).

5. **Enable Upstash QStash** in the [Upstash Console](https://console.upstash.com):
   - Create a QStash project and copy:
     - `QSTASH_TOKEN`
     - `QSTASH_CURRENT_SIGNING_KEY`
     - `QSTASH_NEXT_SIGNING_KEY`

6. **Set all env vars** in your `.env` file:
   - From Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - From QStash: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
   - Your public URL: `PUBLIC_BASE_URL`
   - Plus existing vars: `OPENAI_API_KEY`, `TOGETHER_API_KEY`, S3 credentials, database URL, Clerk keys, etc.

7. **Apply the database migration**:
   ```bash
   pnpm drizzle-kit push
   ```
   This introspects your live Neon database and applies the `conversations` table + `stories.source` column.
   
   **Important**: Use `drizzle-kit push`, not file-based `drizzle-kit migrate` — the migration folder has pre-existing orphaned history that only `push` handles correctly.

8. **Deploy or tunnel**: You need a public HTTPS URL so Twilio and QStash can reach your app.
   - **Production**: Deploy to Vercel, Railway, or your preferred host.
   - **Local testing**: Use [ngrok](https://ngrok.com/) or similar: `ngrok http 3000`, then set `PUBLIC_BASE_URL=https://<your-ngrok-url>`.

## Create comics by phone call

Call the Twilio number → a voice assistant asks your name and comic idea → the comic is generated and texted to you within ~1 minute.

The phone call channel uses [**Twilio ConversationRelay**](https://www.twilio.com/docs/voice/conversational-ai/conversation-relay) to pipe live voice interactions through OpenAI's Realtime API, running on a dedicated persistent WebSocket server (see `voice-server/`).

### Setup checklist

1. **Deploy the voice server** to a long-lived host (Fly.io, Railway, etc.):
   - See [`voice-server/README.md`](./voice-server/README.md) for detailed instructions.
   - Note the public `wss://` URL of your deployed server.

2. **Set `CONVERSATION_RELAY_WS_URL`** to that URL:
   - In the **Next.js app**: `.env` → `CONVERSATION_RELAY_WS_URL=wss://your-voice-server-url`
   - In the **voice server**: `.env` / secrets → same URL

3. **Configure the Twilio number's Voice webhook** in the [Twilio Console](https://console.twilio.com):
   - **Webhook URL**: `<PUBLIC_BASE_URL>/api/twilio/voice` (HTTP POST)
   - Replace `<PUBLIC_BASE_URL>` with your public HTTPS domain (no trailing slash; e.g., `https://myapp.example.com`).

4. **⚠️ Accept the AI/ML Features Addendum** in the Twilio Console:
   - Navigate to **Voice** → **Settings** → **Privacy & Security**
   - Enable "AI/ML Features"
   - **This is mandatory** — without it, ConversationRelay returns error 64110 "Account Opted Out" and calls fail.

5. The same Twilio number, QStash, and OpenAI setup from the **SMS channel are reused** — no additional Twilio or API accounts needed.

## Cloning & running

1. Clone the repo: `git clone https://github.com/nutlope/make-comics`
2. Create a `.env` file based on `.example.env` and add your API keys:
   - **OpenAI API key**: `OPENAI_API_KEY=<your_openai_api_key>`
   - **Together AI API key**: `TOGETHER_API_KEY=<your_together_ai_api_key>`
   - **AWS S3 credentials**: `S3_UPLOAD_KEY`, `S3_UPLOAD_SECRET`, `S3_UPLOAD_BUCKET`, `S3_UPLOAD_REGION`
   - **Database URL**: Use [Neon](https://neon.tech) to set up your PostgreSQL database: `DATABASE_URL=<your_database_url>`
   - **Clerk keys**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - **Upstash Redis**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
3. Run `npm install` and `npm run dev` to install dependencies and run locally
