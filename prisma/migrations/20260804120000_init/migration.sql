-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "cta_events" (
    "id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "cta_id" VARCHAR(100) NOT NULL,
    "cta_label" VARCHAR(150) NOT NULL,
    "cta_code" VARCHAR(60),
    "location" VARCHAR(50) NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "source_page" VARCHAR(255),
    "campaign" VARCHAR(100),
    "session_id" UUID,
    "anonymous_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cta_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cta_events_cta_id_idx" ON "cta_events"("cta_id");

-- CreateIndex
CREATE INDEX "cta_events_session_id_idx" ON "cta_events"("session_id");

-- CreateIndex
CREATE INDEX "cta_events_occurred_at_idx" ON "cta_events"("occurred_at");
