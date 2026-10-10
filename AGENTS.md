# Permanent Agent Development Rules: Gold Loan Portal

These permanent engineering rules govern all agent and developer workflows for this repository. Every contribution must adhere strictly to these principles.

---

## 1. Source of Truth & Project Blueprints
* Strictly follow [`docs/requirements-matrix.md`](file:///d:/projects/gldportal/docs/requirements-matrix.md) and [`docs/implementation-plan.md`](file:///d:/projects/gldportal/docs/implementation-plan.md).
* The 8-page assignment specification at [`docs/portal_assignment.pdf`](file:///d:/projects/gldportal/docs/portal_assignment.pdf) is the foundational source of truth for all business and grading rules.

## 2. Frontend Technology Stack
* Build the frontend with **React + Vite + TypeScript + Tailwind CSS**.
* Keep the user interface responsive down to 375 px mobile viewport with numeric keypad inputs.

## 3. Backend Technology Stack
* Build the backend with **Node.js + Express + TypeScript + Zod**.
* Adhere to strict typing, uniform JSON error contracts, and central async error handling.

## 4. Persistence & Database Environment
* Use **PostgreSQL + Prisma** for all persistence.
* Run native PostgreSQL 18 on Windows as the primary development database (`gold_loan_portal`, user `goldloan_dev`, port `5432`). Docker Compose (`docker-compose.yml`) is an optional bonus only.
* Use versioned Prisma migrations (`npm run db:migrate`). Never use `prisma db push` as a substitute for migrations.

## 5. Architectural Separation of Concerns
* Maintain clear boundaries across the codebase:
  * **Routes**: Pure HTTP mapping and middleware attachment.
  * **Validation Schemas**: Zod definitions validating inputs and tool parameters.
  * **Business Services**: Domain logic, calculation engines, de-duplication rules.
  * **Database Access**: Prisma client queries and sequence management.
  * **AI Orchestration**: Gemini API client, tool definitions, and system prompts.

## 6. Independent Quote Calculation Service
* Keep the quote calculation engine pure and independent:
  * Zero HTTP request or response object coupling.
  * Zero database reads or writes.
  * Directly callable by REST endpoints, the AI agent tool handler, and unit tests.

## 7. Server as Single Financial Authority
* The server is the absolute source of truth for financial calculations and application submissions.
* Client-provided financial figures must never be trusted; the server recomputes pure gold, gold value, and eligible loan amounts on every submission.

## 8. Exact Financial Precision
* Never use imprecise binary floating-point rupees as the financial source of truth.
* Store currency values as integer **paise** (or PostgreSQL `DECIMAL`/`NUMERIC`).
* Calculate eligible loan from unrounded gold value, floor to whole rupees (`Math.floor`), and convert that amount to paise (`* 100n`). Enforce the 75% max LTV ceiling server-side.
* Apply documented precise-decimal arithmetic and half-up rounding policy for gold value.

## 9. Unified Service Layer ("Same Truth, Two Paths")
* Reuse the exact same Zod validation schemas and business services across both entry points:
  * The 3-step Guided Application Form.
  * The AI Loan Assist Agent function-calling tool handlers.

## 10. Exact Endpoints & Fixed Tool Set
* Implement precisely the four required REST endpoints:
  1. `GET /api/v1/loan-schemes`
  2. `POST /api/v1/quotes`
  3. `POST /api/v1/leads`
  4. `GET /api/v1/leads`
* Expose precisely the three mandatory AI tools:
  1. `get_loan_schemes()`
  2. `calculate_quote(net, gross, karat)`
  3. `submit_application(payload)`
* Do not invent additional endpoints or a 4th agent tool at this stage.

## 11. Zero Client Secrets & Environment Isolation
* Never expose API keys or secrets in frontend code.
* Manage all secrets via server-side environment variables (`.env`). Ship `.env.example` templates and keep actual credentials out of Git.

## 12. Enforced AI Confirmation State
* Never submit a lead through the AI agent without a valid backend-enforced confirmation state for the current application details.
* The user must explicitly interact with the UI `Confirm & Submit` button on the Confirmation Card.
* The backend must verify this state before allowing `submit_application` to execute.
* Invalidate confirmation state immediately if applicant details, weights, karat, or selected plan change.

## 13. Privacy & Masked Data
* Mask mobile numbers in all server logs and AI prompts (`9876XXXX10`).
* Mask mobile numbers in all administrative responses (`GET /api/v1/leads`). Never leak raw mobile numbers in client responses.

## 14. Test-Driven Discipline
* Write automated unit and integration tests alongside each feature, not only at the end.
* Cover mathematical precision, 400 validation cases, 409 duplicate conflicts within 7 days, 201 re-applications after 7 days, and AI evaluation conversations.

## 15. Root Monorepo Commands
* Root `npm install`, `npm run dev`, and `npm test` must work cleanly and be documented in `README.md`.
* Provide coordinated scripts for database lifecycle (`db:up`, `db:down`, `db:migrate`, `db:seed`) and eval suites (`npm run eval`).

## 16. Minimalist Dependencies
* Do not add unnecessary frameworks, heavy helper libraries, microservice tooling, or unneeded dependencies.
* Keep the solution lean, focused, and maintainable.

## 17. Factual Verification
* Do not invent requirements or claim tests have passed without actually running them and inspecting execution output.

## 18. Security & Clean Git Repository
* Never commit secrets, real applicant records, API keys, or active `.env` files to Git. Maintain strict `.gitignore` rules.

## 19. Phase Review & Transparent Reporting
* After every phase, run relevant checks, inspect errors, and summarize:
  * Changed and created files.
  * Actual test outputs and verification results.
  * Known limitations or items deferred to subsequent phases.

## 20. Strict Phase Gating
* Work strictly on the current phase.
* Do not start the next phase without explicit approval from the user.
