-- CreateTable
CREATE TABLE "loan_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interest_rate_annual" DECIMAL(5,2) NOT NULL,
    "max_ltv" DECIMAL(3,2) NOT NULL,
    "tenure_months" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "gross_weight_grams" DECIMAL(8,2) NOT NULL,
    "net_weight_grams" DECIMAL(8,2) NOT NULL,
    "karat" INTEGER NOT NULL,
    "pure_gold_grams" DECIMAL(10,4) NOT NULL,
    "gold_value_paise" BIGINT NOT NULL,
    "eligible_loan_paise" BIGINT NOT NULL,
    "selected_plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "draft_payload" JSONB,
    "draft_version" INTEGER NOT NULL DEFAULT 1,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_draft_version" INTEGER,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_mobile_number_created_at_idx" ON "leads"("mobile_number", "created_at");

-- CreateIndex
CREATE INDEX "leads_selected_plan_id_idx" ON "leads"("selected_plan_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_selected_plan_id_fkey" FOREIGN KEY ("selected_plan_id") REFERENCES "loan_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS lead_application_id_seq START WITH 1001 INCREMENT BY 1;
