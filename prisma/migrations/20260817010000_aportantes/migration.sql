-- AlterTable
ALTER TABLE "institutional_requests" ADD COLUMN     "donor_id" UUID;

-- CreateTable
CREATE TABLE "donors" (
    "id" UUID NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "full_name" VARCHAR(180) NOT NULL,
    "password_hash" TEXT,
    "phone" VARCHAR(40),
    "country" VARCHAR(100),
    "email_verified_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_sessions" (
    "id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip_hash" TEXT,
    "user_agent" VARCHAR(300),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_tokens" (
    "id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donors_email_key" ON "donors"("email");

-- CreateIndex
CREATE INDEX "donors_status_idx" ON "donors"("status");

-- CreateIndex
CREATE UNIQUE INDEX "donor_sessions_token_hash_key" ON "donor_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "donor_sessions_donor_id_idx" ON "donor_sessions"("donor_id");

-- CreateIndex
CREATE INDEX "donor_sessions_expires_at_idx" ON "donor_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "donor_tokens_token_hash_key" ON "donor_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "donor_tokens_donor_id_idx" ON "donor_tokens"("donor_id");

-- CreateIndex
CREATE INDEX "institutional_requests_donor_id_idx" ON "institutional_requests"("donor_id");

-- AddForeignKey
ALTER TABLE "institutional_requests" ADD CONSTRAINT "institutional_requests_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_sessions" ADD CONSTRAINT "donor_sessions_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_tokens" ADD CONSTRAINT "donor_tokens_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

