-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "subscription_id" UUID,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'mercadopago',
    "provider_payment_id" VARCHAR(80),
    "preference_id" VARCHAR(120),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PEN',
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "status_detail" VARCHAR(120),
    "payment_type_id" VARCHAR(60),
    "payment_method_id" VARCHAR(60),
    "payer_email" VARCHAR(180),
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'mercadopago',
    "provider_preapproval_id" VARCHAR(80),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PEN',
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "frequency_type" VARCHAR(20) NOT NULL DEFAULT 'months',
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "payer_email" VARCHAR(180),
    "next_payment_date" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'mercadopago',
    "event_type" VARCHAR(60) NOT NULL,
    "resource_id" VARCHAR(80) NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processing_note" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_request_id_idx" ON "payments"("request_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_request_id_key" ON "subscriptions"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_preapproval_id_key" ON "subscriptions"("provider_preapproval_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "payment_events_resource_id_idx" ON "payment_events"("resource_id");

-- CreateIndex
CREATE INDEX "payment_events_received_at_idx" ON "payment_events"("received_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

