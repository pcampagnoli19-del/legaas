-- Migration 0003: Campos de Gestão de Certidões, Validades, Alertas e Extração IA (Groq) na tabela documents
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "certificate_type" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "issuing_authority" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "issue_date" date;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "expiration_date" date;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "alert_days_before" integer[] DEFAULT ARRAY[30, 15, 7]::integer[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "control_code" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "extracted_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_org_expiration_idx" ON "documents" USING btree ("organization_id","expiration_date");
