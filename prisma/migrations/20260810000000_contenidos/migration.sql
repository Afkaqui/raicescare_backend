-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(400) NOT NULL,
    "body" TEXT NOT NULL,
    "program_code" VARCHAR(80),
    "location" VARCHAR(160),
    "starts_on" DATE,
    "ends_on" DATE,
    "goal_amount" DECIMAL(12,2),
    "goal_currency" VARCHAR(3),
    "cover_media_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(120) NOT NULL,
    "original_name" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" VARCHAR(300),
    "checksum_sha256" CHAR(64) NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_items_status_idx" ON "content_items"("status");

-- CreateIndex
CREATE INDEX "content_items_program_code_idx" ON "content_items"("program_code");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_kind_slug_key" ON "content_items"("kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

