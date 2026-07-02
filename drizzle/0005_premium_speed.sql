CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"channel" text DEFAULT 'sms' NOT NULL,
	"state" text DEFAULT 'awaiting_name' NOT NULL,
	"collected" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_story_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "source" text DEFAULT 'web' NOT NULL;
