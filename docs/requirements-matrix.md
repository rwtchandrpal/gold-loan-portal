# Gold Loan Portal — Requirements Traceability Matrix

This concise traceability matrix provides end-to-end verification mapping between the 8-page assignment specification (`docs/portal_assignment.pdf`), architecture decisions, implementation target files, and automated test suites.

---

## 1. Traceability Matrix

| Requirement ID | Domain | Summary Specification | PDF Source Page | Priority | Architecture Target / File | Verification Method / Acceptance Test |
|---|---|---|---|---|---|---|
| **REQ-CORE-01** | Architecture | "Same Truth, Two Paths": Guided Web Form and AI Assistant share identical backend service layer | Page 1, 2, 3, 6 | **Mandatory** | `server/src/services/` | Both form and agent produce identical quote amounts and lead records |
| **REQ-CORE-02** | Tech Stack | React + Vite + TS + Tailwind CSS v4; Node.js + Express + TS + Zod; Native PostgreSQL 18 + Prisma 7; Gemini API; Vitest | Page 1, 3 | **Mandatory** | `server/`, `client/` | Monorepo builds and tests pass cleanly via root `npm test` |
| **REQ-ENV-01** | Database Env | Native PostgreSQL 18 on Windows (`gold_loan_portal`, user `goldloan_dev`, port 5432); Prisma 7 with `@prisma/adapter-pg`; versioned migrations | Decisions, Page 3, 8 | **Mandatory** | `server/prisma.config.ts`, `server/src/config/db.ts` | `npm run db:migrate` creates versioned migrations; `psql` inspection passes |
| **REQ-API-01** | REST API | `GET /api/v1/loan-schemes`: Return active plans seeded from database | Page 3, 4 | **Mandatory** | `server/src/controllers/schemes.controller.ts` | Supertest `schemes.test.ts` asserts 200 OK and 2 active schemes |
| **REQ-API-02** | REST API | `POST /api/v1/quotes`: Pure quote calculation (no DB write, returns pure gold, gold value, eligible loan) | Page 3, 4 | **Mandatory** | `server/src/controllers/quote.controller.ts` | Supertest `quotes.test.ts` asserts 200 OK and reference calculations |
| **REQ-API-03** | REST API | `POST /api/v1/leads`: Server-side recalculation, validation, 7-day de-dup, sequence ID (`GL-1001`), persist lead, return 201 | Page 3, 4, Decisions | **Mandatory** | `server/src/controllers/lead.controller.ts` | Supertest `leads.test.ts` asserts 201 Created with `/^GL-\d{4,}$/` |
| **REQ-API-04** | REST API | `GET /api/v1/leads`: Fetch all leads newest first with masked mobile numbers (`9876XXXX10`) | Page 3, 5 | **Mandatory** | `server/src/controllers/lead.controller.ts` | Supertest `leads.test.ts` asserts 200 OK and `/^\d{4}XXXX\d{2}$/` |
| **REQ-API-05** | Agent REST API | `POST /api/v1/agent/chat`: Conversational proxy to Gemini; `POST /api/v1/agent/confirm`: Explicit confirmation state | Page 6, Decisions | **Mandatory** | `server/src/controllers/agent.controller.ts` | Supertest agent tests verify session state transitions and confirmation gating |
| **REQ-VAL-01** | Validation Rules | Zod validation: applicant name (`/^[a-zA-Z ]{2,60}$/`), Indian mobile (`/^[6-9]\d{9}$/`), 2-decimal weights, karat `18|22|24` | Page 3, 4, Decisions | **Mandatory** | `server/src/schemas/loan.schema.ts` | Supertest validation tests assert 400 Bad Request on invalid inputs |
| **REQ-VAL-02** | Error Contract | Uniform JSON error shape `{ error: { code, message, fields[] } }`, HTTP 400, 404, 409, 500 without stack traces | Page 3, 8, Decisions | **Mandatory** | `server/src/middlewares/error.middleware.ts` | Assert error response shape matches canonical JSON envelope |
| **REQ-MATH-01** | Financial Engine | Loan calculated from unrounded gold value ($net \times karat \times 7000 / 24$), floored to whole rupees before paise conversion, LTV capped at $\min(maxLtv, 75\%)$ | Page 4, Decisions | **Mandatory** | `server/src/core/financial-maths.ts` | Vitest `financial-maths.test.ts` matches Cases 1, 2, and 3 with exact math |
| **REQ-MATH-02** | Money Precision | Store money as integer paise (`BigInt`); precise-decimal calculation with half-up rounding policy to nearest paise; zero binary floating math | Page 4, Decisions | **Mandatory** | `server/src/core/financial-maths.ts` | Unit tests verify exact integer paise conversion for all cases |
| **REQ-DATA-01** | Database Seeding | Seed 2 standard schemes: `PLAN_BULLET_01` (12.0% p.a., 70% LTV) and `PLAN_EMI_01` (10.5% p.a., 75% LTV) idempotently | Page 4 | **Mandatory** | `server/prisma/seed.ts` | `npm run db:seed` executes idempotently; verifies scheme IDs and rates |
| **REQ-DATA-02** | Duplicate Rule | Same mobile within 7 days rejected with 409 Conflict returning existing `applicationId`. No permanent unique constraint | Page 3, 4, 5, Decisions | **Mandatory** | `server/src/services/lead.service.ts` | Supertest asserts 409 on reapplication $\le 7$ days, 201 after $> 7$ days |
| **REQ-DATA-03** | Concurrency Safety | Optional Bonus B1: Transactional advisory lock on normalized mobile (`pg_advisory_xact_lock`) ensuring atomic check-and-insert | Decisions, Page 4, 7 | Optional Bonus (B1) | `server/src/services/lead.service.ts` | Real PostgreSQL parallel integration test firing 2 requests simultaneously |
| **REQ-DATA-04** | Application ID | Collision-safe sequence `lead_application_id_seq` starting at 1001, formatted as `GL-${nextval}` inside transaction | Decisions, Page 4, 5 | **Mandatory** | `server/prisma/migrations/`, `lead.service.ts` | Sequential submissions generate `GL-1001`, `GL-1002`; never derived from `count()` |
| **REQ-UI-01** | Frontend Flow | Single-Page App with 3-step application flow: Step 1 Details, Step 2 Live Quote, Step 3 Confirm & Success | Page 5 | **Mandatory** | `client/src/components/form/` | React Testing Library component tests verify step navigation |
| **REQ-UI-02** | Live Feedback | Live re-quoting debounced at ~300 ms calling `POST /api/v1/quotes`; inline field validation errors | Page 5 | **Mandatory** | `client/src/hooks/useQuotes.ts` | RTL tests verify debounced API trigger and inline error display |
| **REQ-UI-03** | Admin View | Table showing newest leads first with masked mobile (`9876XXXX10`), net weight, plan, loan amount, status, plan filter | Page 5 | **Mandatory** | `client/src/components/admin/AdminLeadsTable.tsx` | RTL tests verify table rendering, mobile masking, and plan filter |
| **REQ-UI-04** | Mobile Responsiveness | Responsive down to 375 px viewport, mobile numeric keypads for weights and mobile | Page 5 | **Mandatory** | `client/src/index.css`, form components | Responsive layout checks and viewport regression testing |
| **REQ-AI-01** | AI Architecture | Gemini API integrated server-side with function calling; no browser API keys; logs mask mobile numbers | Page 6, Decisions | **Mandatory** | `server/src/agent/gemini.client.ts` | Code inspection and unit test verifying zero client-exposed keys |
| **REQ-AI-02** | Agent Tools | Exactly 3 typed tools: `get_loan_schemes()`, `calculate_quote(net, gross, karat)`, `submit_application(payload)` | Page 6, Decisions | **Mandatory** | `server/src/agent/tools.ts` | Agent tool test suite verifies tool schema definitions and dispatch handlers |
| **REQ-AI-03** | Server-Enforced AI Confirmation | Dedicated UI Confirmation Card with `Confirm & Submit`; `POST /api/v1/agent/confirm` records state; tool blocked without valid confirmed draft | Page 6, Decisions | **Mandatory** | `server/src/services/session.service.ts`, `client/ConfirmationCard.tsx` | Unit tests verify tool rejection when unconfirmed; succeeds after confirmation |
| **REQ-AI-04** | Agent Guardrails | Never calculate math in LLM; stay on gold loans; decline investment advice & approval promises | Page 6 | **Mandatory** | `server/src/agent/system-prompt.ts` | Eval conversation tests assert strict guardrail compliance |
| **REQ-TEST-01** | Automated Tests | Unit tests for financial formulas (Cases 1–3), API integration tests for 400 validation, 404, 409 within 7 days, 201 lead creation | Page 4, 8, Decisions | **Mandatory** | `server/tests/unit/`, `server/tests/integration/` | `npm test` runs Vitest test suites with 100% passing status |
| **REQ-TEST-02** | AI Eval Suite | 5 mandatory test conversations: happy path, missing field, net > gross, 7-day duplicate, off-topic request | Page 6, 8 | **Mandatory** | `server/tests/eval/agent-conversations.eval.test.ts` | `npm run eval` evaluates all 5 scenarios against Gemini API |
| **REQ-TEST-03** | Concurrency Test | Real PostgreSQL integration test firing 2 parallel requests with same mobile, asserting exactly one 201 and one 409 | Page 4, 7, Decisions | Optional Bonus (B1) | `server/tests/integration/concurrency-leads.test.ts` | `Promise.all` test verifies transaction isolation and advisory lock |
| **REQ-DELIV-01**| Submission Artifacts| GitHub repo (`npm install`, `npm run dev`, `npm test` work), `README.md`, `AI_LOG.md`, `.env.example`, no committed secrets | Page 1, 8, Decisions | **Mandatory** | Root files | Verification of clean checkout execution and gitignored secrets |
| **REQ-BONUS-01**| Bonus: B1 Backend | Concurrency-safe advisory lock, `Idempotency-Key` header, Status workflow (`SUBMITTED` -> `UNDER_REVIEW`), cached gold rate | Page 3, 4, 7 | Optional (+5) | `server/src/services/lead.service.ts` | Integration tests verify idempotency and status transitions |
| **REQ-BONUS-02**| Bonus: B2 Agent | Prompt-injection evals, streaming replies, tool status chips | Page 6, 7 | Optional (+5) | `server/src/agent/`, `client/src/components/chat/` | Automated injection eval suite passes |
| **REQ-BONUS-03**| Bonus: B3 AI Extras | Appraisal slip photo OCR/multimodal extraction, natural language admin lead filters | Page 7 | Optional (+5) | `server/src/services/ocr.service.ts` | Multimodal test extracting weight and karat from sample image |
| **REQ-BONUS-04**| Bonus: B4 Ops Ready | `docker compose up` with `postgres:18-alpine`, GitHub Actions CI pipeline, rate limiting, `ARCHITECTURE.md`, 2-min demo video | Page 7 | Optional (+5) | `docker-compose.yml`, `.github/workflows/ci.yml` | CI pipeline executes and passes all test stages |

---

## 2. Verification Test Coverage Mapping

| Test Category | Test File | Covered Requirements | Execution Command |
|---|---|---|---|
| **Financial Maths Unit Tests** | `server/tests/unit/financial-maths.test.ts` | REQ-MATH-01, REQ-MATH-02 | `npm test -- financial-maths` |
| **Scheme Listing Integration** | `server/tests/integration/schemes.test.ts` | REQ-API-01, REQ-DATA-01 | `npm test -- schemes` |
| **Quote Calculation API** | `server/tests/integration/quotes.test.ts` | REQ-API-02, REQ-MATH-01, REQ-VAL-01 | `npm test -- quotes` |
| **Lead Submission & Duplicate Handling** | `server/tests/integration/leads.test.ts` | REQ-API-03, REQ-API-04, REQ-DATA-02, REQ-DATA-04, REQ-VAL-01, REQ-VAL-02 | `npm test -- leads` |
| **Concurrency Advisory Lock (Bonus B1)** | `server/tests/integration/concurrency-leads.test.ts` | REQ-DATA-03, REQ-TEST-03, REQ-BONUS-01 | `npm test -- concurrency` |
| **AI Agent Conversations Evaluation** | `server/tests/eval/agent-conversations.eval.test.ts` | REQ-AI-01, REQ-AI-02, REQ-AI-03, REQ-AI-04, REQ-TEST-02 | `npm run eval` |
| **Frontend Form & UI Flow Tests** | `client/src/App.test.tsx`, component tests | REQ-UI-01, REQ-UI-02, REQ-UI-03, REQ-UI-04 | `npm test --workspace=client` |
