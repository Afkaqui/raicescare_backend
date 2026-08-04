-- DropTable
DROP TABLE "cta_events";

-- CreateTable
CREATE TABLE "cta_definitions" (
    "code" VARCHAR(80) NOT NULL,
    "label" VARCHAR(180) NOT NULL,
    "destination" VARCHAR(300) NOT NULL,
    "process_type" VARCHAR(60) NOT NULL,
    "analytics_category" VARCHAR(40) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cta_definitions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "cta_interactions" (
    "id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "cta_code" VARCHAR(80) NOT NULL,
    "visible_label" VARCHAR(180) NOT NULL,
    "source_page" TEXT NOT NULL,
    "source_section" VARCHAR(120) NOT NULL,
    "destination" TEXT NOT NULL,
    "process_type" VARCHAR(60) NOT NULL,
    "analytics_category" VARCHAR(40) NOT NULL,
    "session_id" UUID,
    "anonymous_user_id" UUID,
    "user_type" VARCHAR(60),
    "person_id" UUID,
    "organization_id" UUID,
    "category_of_interest" VARCHAR(120),
    "program_code" VARCHAR(80),
    "campaign_id" UUID,
    "initiative_id" UUID,
    "project_id" UUID,
    "opportunity_id" UUID,
    "request_type" VARCHAR(80),
    "request_id" UUID,
    "status" VARCHAR(40) NOT NULL DEFAULT 'clicked',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cta_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_events" (
    "id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "event_name" VARCHAR(120) NOT NULL,
    "event_category" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(180) NOT NULL,
    "email" VARCHAR(180),
    "phone" VARCHAR(40),
    "country" VARCHAR(100),
    "document_type" VARCHAR(30),
    "document_number_encrypted" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "organization_type" VARCHAR(80),
    "legal_name" VARCHAR(250) NOT NULL,
    "registration_number" VARCHAR(100),
    "country" VARCHAR(100),
    "website" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_requests" (
    "id" UUID NOT NULL,
    "tracking_code" VARCHAR(50) NOT NULL,
    "request_type" VARCHAR(80) NOT NULL,
    "interaction_id" UUID,
    "applicant_person_id" UUID,
    "applicant_organization_id" UUID,
    "category" VARCHAR(120),
    "source" VARCHAR(120),
    "status" VARCHAR(60) NOT NULL DEFAULT 'received',
    "assigned_owner_id" UUID,
    "response_deadline" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "institutional_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_sequences" (
    "prefix" VARCHAR(10) NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "request_sequences_pkey" PRIMARY KEY ("prefix","year")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "person_id" UUID,
    "request_id" UUID,
    "consent_type" VARCHAR(80) NOT NULL,
    "policy_version" VARCHAR(30) NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "source_ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_documents" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "document_type" VARCHAR(80) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "visibility" VARCHAR(30) NOT NULL DEFAULT 'internal',
    "validation_status" VARCHAR(40) NOT NULL DEFAULT 'uploaded',
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_status_history" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "previous_status" VARCHAR(80),
    "new_status" VARCHAR(80) NOT NULL,
    "public_comment" TEXT,
    "internal_comment" TEXT,
    "reason_code" VARCHAR(100),
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_assignments" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "assigned_user_id" UUID NOT NULL,
    "assigned_role" VARCHAR(80) NOT NULL,
    "assignment_type" VARCHAR(40) NOT NULL,
    "response_deadline" TIMESTAMPTZ(6),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "request_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_communications" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "communication_type" VARCHAR(40) NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(300),
    "message_summary" TEXT,
    "recipient_address" VARCHAR(250),
    "provider_message_id" VARCHAR(250),
    "status" VARCHAR(40),
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_outcomes" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "outcome_code" VARCHAR(100) NOT NULL,
    "outcome_summary" TEXT NOT NULL,
    "public_message" TEXT,
    "internal_basis" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "request_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cta_interactions_interaction_id_key" ON "cta_interactions"("interaction_id");

-- CreateIndex
CREATE INDEX "cta_interactions_cta_code_idx" ON "cta_interactions"("cta_code");

-- CreateIndex
CREATE INDEX "cta_interactions_session_id_idx" ON "cta_interactions"("session_id");

-- CreateIndex
CREATE INDEX "cta_interactions_status_idx" ON "cta_interactions"("status");

-- CreateIndex
CREATE INDEX "cta_interactions_occurred_at_idx" ON "cta_interactions"("occurred_at");

-- CreateIndex
CREATE INDEX "interaction_events_interaction_id_idx" ON "interaction_events"("interaction_id");

-- CreateIndex
CREATE INDEX "interaction_events_event_name_idx" ON "interaction_events"("event_name");

-- CreateIndex
CREATE INDEX "persons_email_idx" ON "persons"("email");

-- CreateIndex
CREATE INDEX "organizations_legal_name_idx" ON "organizations"("legal_name");

-- CreateIndex
CREATE UNIQUE INDEX "institutional_requests_tracking_code_key" ON "institutional_requests"("tracking_code");

-- CreateIndex
CREATE UNIQUE INDEX "institutional_requests_interaction_id_key" ON "institutional_requests"("interaction_id");

-- CreateIndex
CREATE INDEX "institutional_requests_request_type_idx" ON "institutional_requests"("request_type");

-- CreateIndex
CREATE INDEX "institutional_requests_status_idx" ON "institutional_requests"("status");

-- CreateIndex
CREATE INDEX "institutional_requests_submitted_at_idx" ON "institutional_requests"("submitted_at");

-- CreateIndex
CREATE INDEX "consents_request_id_idx" ON "consents"("request_id");

-- CreateIndex
CREATE INDEX "consents_consent_type_idx" ON "consents"("consent_type");

-- CreateIndex
CREATE INDEX "request_documents_request_id_idx" ON "request_documents"("request_id");

-- CreateIndex
CREATE INDEX "request_status_history_request_id_idx" ON "request_status_history"("request_id");

-- CreateIndex
CREATE INDEX "request_assignments_request_id_idx" ON "request_assignments"("request_id");

-- CreateIndex
CREATE INDEX "request_assignments_assigned_user_id_idx" ON "request_assignments"("assigned_user_id");

-- CreateIndex
CREATE INDEX "request_communications_request_id_idx" ON "request_communications"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "request_outcomes_request_id_key" ON "request_outcomes"("request_id");

-- AddForeignKey
ALTER TABLE "cta_interactions" ADD CONSTRAINT "cta_interactions_cta_code_fkey" FOREIGN KEY ("cta_code") REFERENCES "cta_definitions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "cta_interactions"("interaction_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_requests" ADD CONSTRAINT "institutional_requests_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "cta_interactions"("interaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_requests" ADD CONSTRAINT "institutional_requests_applicant_person_id_fkey" FOREIGN KEY ("applicant_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_requests" ADD CONSTRAINT "institutional_requests_applicant_organization_id_fkey" FOREIGN KEY ("applicant_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_assignments" ADD CONSTRAINT "request_assignments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_communications" ADD CONSTRAINT "request_communications_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_outcomes" ADD CONSTRAINT "request_outcomes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "institutional_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

