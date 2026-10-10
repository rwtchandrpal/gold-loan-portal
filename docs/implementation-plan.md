# Gold Loan Portal — Implementation Plan

This implementation plan provides a phased, dependency-ordered blueprint for building the Gold Loan Intake Portal and AI Loan Assist Agent as specified in `docs/portal_assignment.pdf` and refined by architecture decisions.

---

## 1. Architectural Strategy & Repository Layout

### 1.1 Guiding Principles
* **Single Truth, Two Paths**: The Web Application Form (3-step flow) and the AI Chat Assistant must both execute the identical backend service layer.
* **Exact Financial Mathematics**: All calculations use precise arithmetic. Floor loans to whole rupees before converting to paise. Never float rupees as financial truth.
* **Strict Validation & Canonical Errors**: Every incoming payload is validated using Zod schemas matching the canonical error contract `{ error: { code, message, fields[] } }`. Name validation enforces ASCII letters and spaces only (`/^[a-zA-Z ]{2,60}$/`), strictly rejecting tabs and newlines.
* **Consistent AI Provider**: Google Gemini API used exclusively via the official SDK on the backend with `GEMINI_API_KEY`. Zero client-side API keys.
* **Database Sequence Application IDs**: Collision-safe public IDs formatted as `GL-1001`, `GL-1002`, etc., atomically generated from a dedicated PostgreSQL sequence `lead_application_id_seq` inside the insertion transaction. Never derived from table row counts.
* **Two-Stage Duplicate Prevention**: Baseline 7-day de-duplication lookup implemented first; concurrency-safe transactional advisory lock implemented as an atomic hardening bonus without permanent unique constraints.
* **Server-Enforced AI Confirmation**: Dedicated UI Confirmation Card with `Confirm & Submit` button, state-tracked `POST /api/v1/agent/confirm` endpoint binding session and draft version, immediate invalidation on detail change, and execution gating on `submit_application`.
* **Small, Tested, Complete Solution**: Avoid unnecessary microservices or over-engineering. Deliver clean, highly testable code satisfying all base requirements first.

### 1.2 Repository Structure
```
gldportal/
├── docker-compose.yml              # Optional containerized PostgreSQL (Bonus B4)
├── docs/
│   ├── portal_assignment.pdf
│   ├── requirements-matrix.md
│   └── implementation-plan.md
├── server/
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma schema with sequence ID, LoanScheme, Lead, AgentSession
│   │   ├── migrations/
│   │   └── seed.ts                 # Seeds PLAN_BULLET_01 and PLAN_EMI_01
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts              # Validated environment configuration (PORT, GEMINI_API_KEY, etc.)
│   │   ├── core/
│   │   │   ├── constants.ts        # Domain constants (DEFAULT_MOCK_GOLD_RATE_24K = 7000)
│   │   │   ├── errors.ts           # Canonical error classes with uniform envelope
│   │   │   └── financial-maths.ts  # Pure financial formulas (rupees, paise, whole rupee floor)
│   │   ├── schemas/
│   │   │   ├── quote.schema.ts     # Zod schema for quotes
│   │   │   └── loan.schema.ts      # Zod schema for leads and applications
│   │   ├── services/
│   │   │   ├── quote.service.ts    # Pure quote calculations
│   │   │   ├── lead.service.ts     # Lead validation, 7-day de-dup, sequence ID gen, DB storage
│   │   │   └── session.service.ts  # Agent session draft tracking & confirmation state
│   │   ├── controllers/
│   │   │   ├── schemes.controller.ts
│   │   │   ├── quote.controller.ts
│   │   │   ├── lead.controller.ts
│   │   │   └── agent.controller.ts # Chat proxy and /confirm handler
│   │   ├── agent/
│   │   │   ├── gemini.client.ts    # Official Google Gemini SDK client
│   │   │   ├── tools.ts            # The 3 mandatory tools definition (mapping net/gross/karat)
│   │   │   └── system-prompt.ts    # Guardrails and system instructions
│   │   ├── routes/
│   │   │   └── api.routes.ts       # Express routes for /schemes, /quotes, /leads, /agent
│   │   ├── middlewares/
│   │   │   ├── validate.middleware.ts
│   │   │   └── error.middleware.ts # Centralized JSON-safe error handler
│   │   ├── utils/
│   │   │   └── serialization.ts    # JSON-safe BigInt and Decimal serializer
│   │   └── app.ts
│   │   └── index.ts
│   ├── tests/
│   │   ├── unit/
│   │   │   └── financial-maths.test.ts
│   │   ├── integration/
│   │   │   ├── quotes.test.ts
│   │   │   ├── leads.test.ts
│   │   │   ├── concurrency-leads.test.ts # Bonus B1 real parallel PostgreSQL test
│   │   │   └── schemes.test.ts
│   │   └── eval/
│   │       └── agent-conversations.eval.test.ts # The 5 mandatory AI conversations
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── components/
│   │   │   ├── form/
│   │   │   │   ├── Step1Details.tsx
│   │   │   │   ├── Step2LiveQuote.tsx
│   │   │   │   └── Step3Confirm.tsx
│   │   │   ├── chat/
│   │   │   │   ├── AgentChatPanel.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   └── ConfirmationCard.tsx # Authoritative draft summary + Confirm & Submit button
│   │   │   ├── admin/
│   │   │   │   └── AdminLeadsTable.tsx
│   │   │   └── common/
│   │   │       ├── Header.tsx
│   │   │       └── Card.tsx
│   │   ├── hooks/
│   │   │   ├── useDebounce.ts
│   │   │   └── useQuotes.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
├── .env.example
├── README.md
├── AI_LOG.md
├── package.json
└── tsconfig.json
```

---

## 2. Dependency-Ordered Implementation Phases

### Phase 1: Environment Setup, Native PostgreSQL, Database Schema & Seed Data
* **Status**: In Progress (Part 1 Foundation Verified; Part 2 Database Schema Gated)
  * [x] Root npm workspaces monorepo with `client` and `server` packages
  * [x] React + Vite + TypeScript + Tailwind CSS v4 in `client`
  * [x] Node.js + Express + TypeScript + Zod in `server`
  * [x] Prisma initialized in backend with PostgreSQL datasource
  * [x] Vitest, Supertest, RTL, and JSDOM configured with passing tests
  * [x] Root scripts (`dev`, `test`, `build`) with `concurrently` runner
  * [x] `.gitignore` and `.env.example` templates configured (no secrets committed)
  * [x] Backend `GET /health` endpoint and CORS verified
  * [ ] Native PostgreSQL setup & Prisma schema models/migrations *(Gated for approval)*
* **Estimated Effort**: 1.5 Hours
* **Primary Objective**: Establish the native PostgreSQL 18 database environment (`gold_loan_portal`, user `goldloan_dev`), stable Prisma ORM 7 workflow (`prisma.config.ts`, `@prisma/adapter-pg`), root monorepo scripts, database connection via `DATABASE_URL`, versioned migrations (`npm run db:migrate`), and idempotent seed script for loan schemes. (Optional `docker-compose.yml` retained for Bonus B4 / containerized fallback with `postgres:18-alpine`).
* **Key Files**:
  * Native PostgreSQL 18 on Windows (or local instance) with database `gold_loan_portal` and user `goldloan_dev`
  * `server/prisma.config.ts` (Prisma 7 central config)
  * `server/src/config/db.ts` (PrismaClient with `@prisma/adapter-pg` driver adapter)
  * `server/prisma/schema.prisma`
  * `server/prisma/seed.ts`
  * `server/.env.example` (template with `DATABASE_URL=postgresql://goldloan_dev:your_password@localhost:5432/gold_loan_portal?schema=public`)
  * `server/src/config/env.ts`
  * `docker-compose.yml` (Optional Bonus B4 / containerized fallback with `postgres:18-alpine`)
* **Native Database Setup Instructions**:
  1. Install PostgreSQL 18 and pgAdmin 4 from [postgresql.org](https://www.postgresql.org/download/windows/) (or utilize an existing local PostgreSQL 18 instance on Windows).
  2. Create development user and database via pgAdmin 4 GUI or `psql`:
     ```sql
     CREATE USER goldloan_dev WITH PASSWORD 'your_password';
     CREATE DATABASE gold_loan_portal OWNER goldloan_dev;
     GRANT ALL PRIVILEGES ON DATABASE gold_loan_portal TO goldloan_dev;
     ```
  3. Configure `server/.env` based on `server/.env.example`:
     ```
     DATABASE_URL=postgresql://goldloan_dev:your_password@localhost:5432/gold_loan_portal?schema=public
     ```
     Never commit real credentials.
  4. Run versioned migrations: `npm run db:migrate` (executes `prisma migrate dev`).
  5. Seed schemes: `npm run db:seed`.
* **Prisma Schema Models**:
  ```prisma
  model LoanScheme {
    id                 String   @id
    name               String
    interestRateAnnual Decimal  @db.Decimal(5, 2)
    maxLtv             Decimal  @db.Decimal(3, 2)
    tenureMonths       Int
    description        String
    isActive           Boolean  @default(true)
    createdAt          DateTime @default(now())
    updatedAt          DateTime @updatedAt
  }

  model Lead {
    id                 String   @id // Formatted public ID: GL-1001, GL-1002
    fullName           String
    mobileNumber       String   // Plain in DB, masked in logs/admin responses
    grossWeightGrams   Decimal  @db.Decimal(8, 2)
    netWeightGrams     Decimal  @db.Decimal(8, 2)
    karat              Int
    pureGoldGrams      Decimal  @db.Decimal(8, 2)
    goldValuePaise     BigInt   // Exact currency in paise
    eligibleLoanPaise  BigInt   // Exact currency in paise
    selectedPlanId     String
    status             String   @default("SUBMITTED")
    createdAt          DateTime @default(now())
    updatedAt          DateTime @updatedAt

    @@index([mobileNumber, createdAt])
  }

  model AgentSession {
    id                    String    @id @default(uuid())
    messages              Json      @default("[]")
    draftPayload          Json?     // Authoritative pending draft details
    draftVersion          Int       @default(1)
    isConfirmed           Boolean   @default(false)
    confirmedDraftVersion Int?
    confirmedAt           DateTime?
    createdAt             DateTime  @default(now())
    updatedAt             DateTime  @updatedAt
  }
  ```
* **PostgreSQL Sequence**:
  * SQL migration includes: `CREATE SEQUENCE IF NOT EXISTS lead_application_id_seq START WITH 1001 INCREMENT BY 1;`
* **Automated Tests / Verification**:
  * Run `npm run db:migrate` -> `npm run db:seed` and verify database tables and seeded records.
* **Acceptance Criteria**:
  * Native PostgreSQL 18 service is running on `localhost:5432`, and backend connects cleanly via `DATABASE_URL` configured in `server/.env`.
  * Prisma migration creates tables and sequence; seed script creates both schemes idempotently.
  * Standard root workflow `npm install`, `npm run dev`, and `npm test` execute cleanly without requiring Docker.
  * No databases are deleted or reset automatically.

---

### Phase 2: Core Financial Engine & Unit Testing (Maths First)
* **Estimated Effort**: 1.5 Hours
* **Primary Objective**: Implement the pure mathematical calculation engine strictly matching Page 4 formulas with explicit rupee/paise separation, whole-rupee floor, and exact paise arithmetic without binary floating-point rounding.
* **Key Files**:
  * `server/src/core/constants.ts` (defines `DEFAULT_MOCK_GOLD_RATE_24K = 7000`)
  * `server/src/core/financial-maths.ts`
  * `server/tests/unit/financial-maths.test.ts`
* **Formulas & Constraints**:
  - **Weight Inputs**: Up to 2 decimal places in grams ($0 < \text{netWeightGrams} \le \text{grossWeightGrams} \le 1000.00$).
  - **Karat**: Integer `18 | 22 | 24`.
  - **Pure Gold**:
    $$\text{pureGoldGrams} = \text{netWeightGrams} \times \left(\frac{\text{karat}}{24}\right)$$
    Intermediate precision is preserved using high-precision decimal representation (minimum 6 decimal places / exact fractions).
  - **Gold Value & Rounding Policy**:
    $$\text{unroundedGoldValueRupees} = \text{pureGoldGrams} \times \text{rate24kPerGram} \quad (\text{mock rate } ₹7,000/\text{g})$$
    $$\text{goldValuePaise} = \text{round}_{\text{half-up}}(\text{unroundedGoldValueRupees} \times 100)$$
    $$\text{goldValueRupees} = \frac{\text{Number}(\text{goldValuePaise})}{100}$$
  - **Eligible Loan Amount (Calculated from Unrounded Gold Value)**:
    $$\text{effectiveLtv} = \min(\text{plan.maxLtv}, 0.75)$$
    $$\text{eligibleLoanRupees} = \lfloor \text{unroundedGoldValueRupees} \times \text{effectiveLtv} \rfloor$$
    $$\text{eligibleLoanPaise} = \text{BigInt}(\text{eligibleLoanRupees}) \times 100\text{n}$$
  * Eligible loan is strictly calculated from the unrounded gold value, floored to whole rupees (`Math.floor`), and converted to integer paise (`* 100n`).
  * Never calculate paise using `Math.round` on binary floating-point rupees; use documented precise-decimal arithmetic with half-up rounding for gold value.
  * Tests use `DEFAULT_MOCK_GOLD_RATE_24K = 7000` directly and do not depend on external environment variables.
* **Automated Tests**:
  * Unit test for Input 1: 45g net, 22K, EMI $\rightarrow$ Pure 41.25g, Value ₹2,88,750, Loan ₹2,16,562 (₹2,16,56,200 paise).
  * Unit test for Input 2: 45g net, 22K, Bullet $\rightarrow$ Value ₹2,88,750, Loan ₹2,02,125 (70% LTV).
  * Unit test for Input 3: 10g net, 18K, EMI $\rightarrow$ Pure 7.5g, Value ₹52,500, Loan ₹39,375.
* **Acceptance Criteria**:
  * All 3 reference financial calculations pass with 100% exact numerical match.

---

### Phase 3: Zod Schemas, Error Handling, REST Endpoints & De-duplication
* **Estimated Effort**: 2.5 Hours
* **Primary Objective**: Build the 4 core REST endpoints with strict Zod validation, canonical error contract, sequence Application IDs, JSON-safe serialization, and baseline 7-day de-duplication.
* **Key Files**:
  * `server/src/schemas/quote.schema.ts`
  * `server/src/schemas/loan.schema.ts`
  * `server/src/core/errors.ts`
  * `server/src/utils/serialization.ts`
  * `server/src/middlewares/validate.middleware.ts`
  * `server/src/middlewares/error.middleware.ts`
  * `server/src/services/quote.service.ts`
  * `server/src/services/lead.service.ts`
  * `server/src/controllers/schemes.controller.ts`
  * `server/src/controllers/quote.controller.ts`
  * `server/src/controllers/lead.controller.ts`
  * `server/src/routes/api.routes.ts`
  * `server/tests/integration/quotes.test.ts`
  * `server/tests/integration/leads.test.ts`
* **Validation Specifications**:
  * Name: `2-60` characters, ASCII letters and spaces only (`/^[a-zA-Z ]{2,60}$/`). Explicitly rejects tabs, newlines, control characters, and digits.
  * Mobile: Indian 10-digit starting with 6-9 (`/^[6-9]\d{9}$/`).
  * Weights: $0 < \text{netWeightGrams} \le \text{grossWeightGrams} \le 1000$.
  * Karat: Strictly `18 | 22 | 24`.
  * Plan ID: Must exist in active database schemes (else 404).
* **De-duplication & Application ID Rules**:
  * Application ID generation runs inside the insertion transaction:
    ```ts
    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('lead_application_id_seq');`;
    const applicationId = `GL-${nextval}`;
    ```
    Never derives ID from row count (`count()`). Tests assert pattern `/^GL-\d{4,}$/`.
  * **Baseline Duplicate Check**: Query database for `mobileNumber` with `createdAt >= NOW() - INTERVAL '7 DAYS'`.
  * If found within 7 days: return `409 Conflict` with `{ error: { code: "DUPLICATE_APPLICATION", message: "You already applied on...", fields: [{ field: "mobileNumber", ... }], existingApplicationId, existingApplicationDate } }`.
  * If re-applying after 7 days: allow creation and return `201 Created` with a new `applicationId`.
  * For all lead responses, mask mobile number as `9876XXXX10`.
  * `POST /api/v1/quotes` returns `200 OK` (pure calculation, zero DB write, does not create lead).
  * `POST /api/v1/leads` returns `201 Created` with `applicationId`.
* **Automated Tests**:
  * Test case 1a: `POST /quotes` with 45g 22K EMI returns 200 with pure 41.25g, ₹2,88,750 value, ₹2,16,562 loan.
  * Test case 1b: `POST /leads` with 45g 22K EMI returns 201 with `applicationId` matching `/^GL-\d{4,}$/`.
  * Test case 4: net 52g > gross 50g returns 400 with field error on `netWeightGrams`.
  * Test case 5: invalid mobile returns 400 with field error on `mobileNumber`.
  * Test case 6: duplicate mobile within 7 days returns 409 with existing `applicationId`.
  * Regression test 6b: application for same mobile after 8 days returns 201 with new `applicationId`.
  * GET `/api/v1/loan-schemes` returns seeded plans.
  * GET `/api/v1/leads` returns leads with masked mobiles.
* **Acceptance Criteria**:
  * Supertest integration test suite passes test cases 1 through 6 flawlessly.

---

### Phase 3b: Concurrency Hardening Bonus (Optional Bonus B1)
* **Estimated Effort**: 1.0 Hour (executed after Phase 3 baseline is verified)
* **Primary Objective**: Implement concurrency-safe duplicate prevention under simultaneous requests without introducing a permanent unique constraint.
* **Key Files**:
  * `server/src/services/lead.service.ts`
  * `server/tests/integration/concurrency-leads.test.ts`
* **Locking Strategy**:
  * In `lead.service.ts`, execute duplicate check and lead creation inside a single PostgreSQL transaction:
    ```ts
    const normalizedMobile = mobileNumber.replace(/\D/g, '').slice(-10);
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedMobile}));`;
      const existing = await tx.lead.findFirst({
        where: {
          mobileNumber: normalizedMobile,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) {
        throw new DuplicateApplicationError(existing.id, existing.createdAt);
      }
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('lead_application_id_seq');`;
      const applicationId = `GL-${nextval}`;
      return await tx.lead.create({
        data: { id: applicationId, mobileNumber: normalizedMobile, ... },
      });
    });
    ```
* **Automated Tests**:
  * Test case 8: Real PostgreSQL integration test firing 2 parallel requests simultaneously for the same new mobile number using `Promise.all`.
  * Assert that exactly one request receives `201 Created` and the other receives `409 Conflict`.
* **Acceptance Criteria**:
  * Concurrency test reliably yields exactly one 201 and one 409 under parallel requests.

---

### Phase 4: Gemini AI Loan Assist Agent & Server-Enforced Confirmation
* **Estimated Effort**: 2.5 Hours
* **Primary Objective**: Implement the server-side AI chat endpoint with Gemini API, typed function calling, privacy masking, strict guardrails, and server-enforced confirmation state.
* **Key Files**:
  * `server/src/services/session.service.ts` (manages `AgentSession` persistence, draft versions, and confirmation)
  * `server/src/agent/gemini.client.ts` (Google Gemini SDK client)
  * `server/src/agent/tools.ts` (the 3 mandatory tools definitions)
  * `server/src/agent/system-prompt.ts` (guardrails: gold loans only, no investment advice, no promises of approval)
  * `server/src/controllers/agent.controller.ts` (`POST /api/v1/agent/chat` and `POST /api/v1/agent/confirm`)
  * `server/tests/eval/agent-conversations.eval.test.ts`
* **The 3 Mandatory Tools**:
  1. `get_loan_schemes()`: Returns list of available schemes from DB.
  2. `calculate_quote(net, gross, karat)`: Calls quote service with mapped parameters (`netWeightGrams: net, grossWeightGrams: gross, karat`). LLM receives calculation output and MUST NOT compute arithmetic itself.
  3. `submit_application(payload)`: Executes through shared `leadService.createLead()` ONLY when valid server confirmation state exists.
* **Server-Enforced Confirmation Implementation**:
  * The agent gathers missing fields, calls `calculate_quote(net, gross, karat)`, and produces an authoritative draft summary with `draftVersion`.
  * The chat UI displays the Confirmation Card with `Confirm & Submit`.
  * User clicking `Confirm & Submit` sends `POST /api/v1/agent/confirm` with `{ sessionId, draftVersion }`.
  * Backend verifies that `draftVersion === session.draftVersion` and marks `session.isConfirmed = true`, `session.confirmedDraftVersion = draftVersion`.
  * Invalidation rule: If the user changes any parameter conversationally, `session.draftVersion` increments, and `isConfirmed` is reset to `false`.
  * In `submit_application` tool handler:
    ```ts
    if (!session.isConfirmed || session.confirmedDraftVersion !== session.draftVersion) {
      throw new Error("Application submission cannot proceed: user has not confirmed this exact application draft.");
    }
    ```
* **Guardrails & Privacy**:
  * Restricted strictly to gold loans; no investment advice; no promises of approval; polite declination of off-topic requests.
  * Server logs mask mobile numbers (`9876XXXX10`). Zero API keys in frontend.
* **The 5 Mandatory Conversation Tests**:
  * Conversation 1: Happy path with complete quotation, confirmation, and submission.
  * Conversation 2: Missing field; agent inquires for missing details.
  * Conversation 3: Net weight > gross weight; agent reports error and requests valid weights.
  * Conversation 4: 7-day duplicate mobile; agent catches 409 and explains friendly duplicate message.
  * Conversation 5: Off-topic inquiry; agent politely declines.
* **Acceptance Criteria**:
  * `npm run eval` executes and passes all 5 test conversation evaluations.

---

### Phase 5: Web Portal Frontend (3-Step Flow, Live Quotes & Admin View)
* **Estimated Effort**: 3.0 Hours
* **Primary Objective**: Build a responsive Single-Page React application featuring the 3-step application flow, live debounced re-quoting, inline validation, mobile keypad support, and admin leads table.
* **Key Files**:
  * `client/src/components/form/Step1Details.tsx`
  * `client/src/components/form/Step2LiveQuote.tsx`
  * `client/src/components/form/Step3Confirm.tsx`
  * `client/src/components/admin/AdminLeadsTable.tsx`
  * `client/src/hooks/useDebounce.ts`
  * `client/src/hooks/useQuotes.ts`
  * `client/src/api/client.ts`
  * `client/src/App.tsx`
* **Key UI Features**:
  * **Step 1**: Interactive form with inline validation feedback for name, mobile, weights, and karat. Inputs configured with `inputMode="numeric"` / `inputMode="decimal"` for mobile.
  * **Step 2**: Debounced quote calculation (~300ms) calling `POST /api/v1/quotes`. Dynamic plan cards displaying eligible loan, interest rate, and max LTV.
  * **Step 3**: Summary review screen, application submission, friendly 409 duplicate alert (*"You already applied on [Date], application GL-1001"*), and celebratory success screen displaying `applicationId`.
  * **Admin View**: Responsive table with masked mobiles (`9876XXXX10`), sorting newest first, and plan filter dropdown.
  * **Mobile Optimization**: Verified layout down to 375 px width.
* **Automated Tests**:
  * React Testing Library component tests verifying step progression, form validation messages, and live quote rendering.
* **Acceptance Criteria**:
  * Smooth 3-step form submission flow, debounced quotes display in <300ms, admin table masks mobiles correctly, 375px mobile responsiveness.

---

### Phase 6: AI Chat Interface & UI Confirmation Card Integration
* **Estimated Effort**: 1.5 Hours
* **Primary Objective**: Build the AI Chat Assist drawer/panel in the UI with conversational quoting, tool execution badges, and dedicated Confirmation Card with `Confirm & Submit` button.
* **Key Files**:
  * `client/src/components/chat/AgentChatPanel.tsx`
  * `client/src/components/chat/MessageBubble.tsx`
  * `client/src/components/chat/ConfirmationCard.tsx`
* **Key Features**:
  * Collapsible/docked conversational assistant accessible alongside the main application form ("One Portal. Two Ways To Apply").
  * When the agent presents the application summary, UI renders the dedicated **Confirmation Card** with details (Name, Gold Weight, Karat, Scheme, Loan Amount) and a `Confirm & Submit` button.
  * User clicking `Confirm & Submit` calls `POST /api/v1/agent/confirm`, which enables the agent to execute `submit_application`.
  * Parameter modification resets/invalidates confirmation card.
* **Acceptance Criteria**:
  * Field agent or borrower can submit either via Guided Form or AI Chat, producing identical lead records in the database.

---

### Phase 7: Polish, Documentation, AI_LOG & Deliverables
* **Estimated Effort**: 1.5 Hours
* **Primary Objective**: Finalize submission deliverables, environment templates, test suites, and documentation.
* **Key Files**:
  * `README.md`
  * `AI_LOG.md`
  * `.env.example` & `server/.env.example`
* **Deliverable Contents**:
  * `README.md`: Native PostgreSQL 18 setup guide (pgAdmin/psql steps), npm scripts guide, environment variables table (`GEMINI_API_KEY`, `DATABASE_URL`, etc.), architecture overview, optional Docker Compose alternative (Bonus B4), and "What you'd do with more time".
  * `AI_LOG.md`: Tools used, exact validation prompt, exact agent tools prompt, documented AI mistake, and test written to catch it.
  * `.env.example`: Safe template without committed credentials.
* **Verification**:
  * Fresh environment execution: ensure `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, and `npm test` execute cleanly without manual intervention.

---

## 3. Ambiguities & Architectural Clarifications Resolved

| Item | Topic | Assignment Note | Resolved Architectural Decision |
|---|---|---|---|
| **RES-01** | **Database Environment** | PostgreSQL preferred. Include migrations and seed script. | Native PostgreSQL 18 on Windows (or local instance) as primary default development database with database `gold_loan_portal` and user `goldloan_dev`. Connection configured via `DATABASE_URL` in `server/.env`. Credentials isolated in environment variables (`.env.example` template). Root `docker-compose.yml` retained as optional Bonus B4 / CI containerization with `postgres:18-alpine`. No automatic database deletion. |
| **RES-02** | **Duplicate Prevention & Concurrency** | Page 3 notes *"A simple lookup before inserting is fine. Making it safe for simultaneous requests is a bonus"*. | Baseline 7-day de-duplication lookup is mandatory. Concurrency-safe advisory lock (`pg_advisory_xact_lock`) inside transaction is optional bonus B1. No permanent unique constraint so re-applications > 7 days are permitted. |
| **RES-03** | **Application ID Generation** | Page 3 states *"returns 201 with an applicationId"*, Page 5 examples show `"GL-1042"`. | Collision-safe sequence `lead_application_id_seq` starting at 1001, formatted as `GL-${seq}`. Generated atomically in transaction. Never derived from row count. Tests assert pattern `/^GL-\d{4,}$/`. |
| **RES-04** | **Agent UI Confirmation Step** | Page 6 notes `submit_application` *"Runs only after a confirmation step in the UI that shows the full summary"*. | UI renders dedicated Confirmation Card with `Confirm & Submit`. Backend records confirmation state via `POST /api/v1/agent/confirm` tied to session and draft version. State invalidated if parameters change. Tool blocked without valid confirmed draft. Exactly 3 mandatory tools. |
| **RES-05** | **Financial Precision** | Page 4 specifies floor operation and mock ₹7,000/g 24K rate. | Eligible loan floored to whole rupees (`Math.floor`) before converting to integer paise (`BigInt`). Pure domain constant `DEFAULT_MOCK_GOLD_RATE_24K = 7000` prevents environment drift in tests. Safe JSON serialization for BigInt/Decimal. |
| **RES-06** | **Name Validation** | Page 3 specifies *"Name 2–60 characters, letters and spaces only"*. | Enforced as ASCII letters and spaces only (`/^[a-zA-Z ]{2,60}$/`). Explicitly rejects tabs, newlines, numbers, and symbols. |

---

## 4. Phase Dependency Graph

```mermaid
flowchart TD
    P1[Phase 1: Environment, Native PostgreSQL, DB Schema & Seeds] --> P2[Phase 2: Core Financial Engine & Unit Tests]
    P2 --> P3[Phase 3: Zod Schemas, API Endpoints, 7-Day De-dup & Sequence IDs]
    P3 --> P3B[Phase 3b: Optional Bonus B1 Advisory Lock Concurrency]
    P3 --> P4[Phase 4: Gemini AI Agent, Server Confirmation & Eval Suite]
    P3 --> P5[Phase 5: Web Portal Frontend 3-Step Flow & Admin View]
    P4 --> P6[Phase 6: AI Chat UI & Dedicated Confirmation Card]
    P5 --> P6
    P6 --> P7[Phase 7: Documentation, AI_LOG & Deliverable Verification]
```

---

## 5. Summary of Time Estimates

| Phase | Description | Estimated Time |
|---|---|:---:|
| **Phase 1** | Native PostgreSQL Setup, Prisma Schema, Sequence ID & Seed | 1.5 hrs |
| **Phase 2** | Pure Financial Maths Engine & Exact Unit Tests | 1.5 hrs |
| **Phase 3** | Zod Schemas, 4 REST Endpoints, Sequence IDs, 7-Day De-dup & API Tests | 2.5 hrs |
| **Phase 3b** | *(Bonus B1)* Concurrency Hardening with Advisory Locks & Parallel Tests | 1.0 hr |
| **Phase 4** | Gemini AI Agent, 3 Tools, Server Confirmation & 5 Eval Scenarios | 2.5 hrs |
| **Phase 5** | React 3-Step Guided Form, Live Debounced Quote & Admin Table | 3.0 hrs |
| **Phase 6** | AI Chat Panel, Message Bubbles & UI Confirmation Card Integration | 1.5 hrs |
| **Phase 7** | README.md, AI_LOG.md, .env.example, Native DB Verification | 1.5 hrs |
| **Total** | **Full-Stack Implementation, Concurrency Hardening & Test Coverage** | **~15.0 hrs** |
