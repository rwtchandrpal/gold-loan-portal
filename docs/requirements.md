# Gold Loan Portal — Detailed Requirements Specification

This document is the authoritative and detailed engineering specification for the Gold Loan Intake Portal and AI Loan Assist Agent, derived from `docs/portal_assignment.pdf` (8 pages) and updated for the Windows development environment using native PostgreSQL 18 and stable Prisma ORM 7.

---

## 1. Architectural Strategy & Core Principles

### 1.1 "Same Truth, Two Paths"
The portal provides two distinct intake pathways for applicants:
1. **Guided Web Form**: A responsive 3-step application flow with debounced live quoting.
2. **AI Loan Assist Agent**: A conversational assistant powered by Google Gemini API function calling.

Both pathways invoke the **exact same backend service layer**, sharing:
* Zod validation schemas (`loan.schema.ts`, `quote.schema.ts`).
* Exact financial calculation engine (`financial-maths.ts`).
* 7-day de-duplication rules and conflict error responses.
* Atomic database sequence application ID generation (`GL-1001`).

### 1.2 Server as Single Financial Authority
* The frontend and AI assistant never determine loan amounts or gold value independently.
* The server recomputes pure gold, gold value, and eligible loan amounts upon submission.
* Client-provided financial figures are untrusted and discarded.

### 1.3 Uniform Error Contract
All endpoints and validation errors conform strictly to:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": [
      { "field": "grossWeightGrams", "message": "Gross weight must be greater than net weight" }
    ]
  }
}
```
HTTP status codes strictly observed:
* `200 OK`: Successful retrieval or pure quote calculation.
* `201 Created`: Successful lead submission.
* `400 Bad Request`: Input validation errors.
* `404 Not Found`: Plan ID does not exist.
* `409 Conflict`: Duplicate application within 7 days.
* `500 Internal Server Error`: Unhandled server errors. Stack traces are never leaked in client responses.

---

## 2. Environment & Database Specification (Native PostgreSQL 18)

### 2.1 Default Local Environment
* **Database Engine**: Native PostgreSQL 18 (e.g. `PostgreSQL 18.6 on x86_64-windows` running locally on port `5432`). Docker is **not** required for local development.
* **Database Name**: `gold_loan_portal`
* **Development User**: `goldloan_dev`
* **Connection String**:
  ```
  DATABASE_URL=postgresql://goldloan_dev:your_password@localhost:5432/gold_loan_portal?schema=public
  ```
* **Credentials Isolation**: `DATABASE_URL` is read strictly from `server/.env`. Actual credentials are gitignored (`.gitignore`) and never committed. Templates are maintained in `server/.env.example` and `.env.example`.

### 2.2 Step-by-Step Local Database Setup Guide
1. **Install PostgreSQL 18**: Download and install PostgreSQL 18 with pgAdmin 4 on Windows from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/).
2. **Create User & Database**:
   * **Option A: pgAdmin 4 (GUI)**:
     - Connect to PostgreSQL 18 server.
     - Right-click **Login/Group Roles** &rarr; **Create** &rarr; **Login/Group Role...** (Name: `goldloan_dev`, Definition: set local password, Privileges: Can login = Yes). Click Save.
     - Right-click **Databases** &rarr; **Create** &rarr; **Database...** (Database: `gold_loan_portal`, Owner: `goldloan_dev`). Click Save.
   * **Option B: Command Line (`psql`)**:
     ```sql
     CREATE USER goldloan_dev WITH PASSWORD 'your_password';
     CREATE DATABASE gold_loan_portal OWNER goldloan_dev;
     GRANT ALL PRIVILEGES ON DATABASE gold_loan_portal TO goldloan_dev;
     ```
3. **Configure Environment**: Copy `server/.env.example` to `server/.env` and update `DATABASE_URL`.
4. **Apply Versioned Migrations**: `npm run db:migrate` (executes `prisma migrate dev`).
5. **Run Seed Script**: `npm run db:seed` (executes `tsx prisma/seed.ts`).

### 2.3 Stable Prisma ORM 7 Architecture
* **Pinned Dependencies**:
  - `@prisma/client`: `7.10.0`
  - `@prisma/adapter-pg`: `7.10.0`
  - `prisma`: `7.10.0`
  - `pg`: `^8.13.3`
  - `@types/pg`: `^8.11.11`
  *(Prisma ORM 8 RC is strictly avoided).*
* **Central Configuration (`server/prisma.config.ts`)**:
  Manages datasource URL, migration path, and schema path:
  ```typescript
  import 'dotenv/config';
  import { defineConfig, env } from 'prisma/config';

  export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    datasource: { url: env('DATABASE_URL') },
  });
  ```
* **PostgreSQL Driver Adapter**: Direct connections require `@prisma/adapter-pg` initialized with a `pg.Pool` connection pool in `server/src/config/db.ts`.
* **Schema Management Rule**: **Prisma Migrate is required.** `npm run db:migrate` creates and applies versioned migrations in `prisma/migrations`. `prisma db push` is not a substitute for versioned migrations.

### 2.4 Optional Containerized Setup (Bonus B4)
An optional `docker-compose.yml` is provided for containerized CI/CD environments using `postgres:18-alpine` with persistent volume `postgres_data` and healthcheck `pg_isready`. Native PostgreSQL remains the primary default development workflow.

---

## 3. Financial Calculation Engine & Precision Standards

### 3.1 Allowed Input Precision
* **Weights**: Specified in grams with up to **2 decimal places** (e.g. `45.00`, `45.25`, or `10.5`).
* **Karat**: Integer restricted strictly to `18 | 22 | 24`.
* **Validation Bounds**: $0 < \text{netWeightGrams} \le \text{grossWeightGrams} \le 1000.00$.

### 3.2 Exact Calculation Formulas & Rounding Policy
1. **Pure Gold (Unrounded Intermediate Value)**:
   $$\text{pureGoldGrams} = \text{netWeightGrams} \times \left(\frac{\text{karat}}{24}\right)$$
   *Intermediate Precision*: Maintained using full-precision decimal/fraction arithmetic (minimum 6 decimal places / exact fractions) to eliminate intermediate rounding loss.

2. **Unrounded Gold Value**:
   $$\text{unroundedGoldValueRupees} = \text{pureGoldGrams} \times \text{rate24kPerGram} \quad (\text{mock rate } ₹7,000/\text{g})$$
   $$\text{unroundedGoldValueRupees} = \frac{\text{netWeightGrams} \times \text{karat} \times 7000}{24}$$

3. **Eligible Loan Amount (Calculated from Unrounded Gold Value)**:
   The eligible loan is calculated strictly from the **unrounded gold value**, then floored to whole rupees:
   $$\text{effectiveLtv} = \min(\text{plan.maxLtv}, 0.75)$$
   $$\text{eligibleLoanRupees} = \lfloor \text{unroundedGoldValueRupees} \times \text{effectiveLtv} \rfloor$$
   $$\text{eligibleLoanPaise} = \text{BigInt}(\text{eligibleLoanRupees}) \times 100\text{n}$$
   *Rule*: Because `eligibleLoanRupees` is floored to whole rupees first, converting to integer paise via `* 100n` guarantees zero fractional paise and zero floating-point error.

4. **Gold Value Storage & Display Rounding Policy**:
   For database persistence and JSON response serialization:
   * **Precise Decimal Arithmetic**: Calculated using exact decimal representation without binary floating-point `Math.round(rupees * 100)`.
   * **Rounding Policy**: Half-up rounding (`ROUND_HALF_UP`) to the nearest integer paise:
     $$\text{goldValuePaise} = \text{round}_{\text{half-up}}(\text{unroundedGoldValueRupees} \times 100)$$
     $$\text{goldValueRupees} = \frac{\text{Number}(\text{goldValuePaise})}{100}$$

### 3.3 Reference Financial Test Cases (Page 4)
* **Test Case 1**: 45g net, 22K, Monthly EMI (75% LTV)
  - Pure Gold: $45 \times 22 / 24 = 41.25\text{g}$
  - Gold Value: $41.25 \times 7000 = ₹2,88,750$ ($28,875,000\text{ paise}$)
  - Eligible Loan: $\lfloor 288750 \times 0.75 \rfloor = ₹2,16,562$ ($21,656,200\text{ paise}$)
* **Test Case 2**: 45g net, 22K, Bullet Repayment (70% LTV)
  - Pure Gold: $41.25\text{g}$
  - Gold Value: $₹2,88,750$
  - Eligible Loan: $\lfloor 288750 \times 0.70 \rfloor = ₹2,02,125$ ($20,212,500\text{ paise}$)
* **Test Case 3**: 10g net, 18K, Monthly EMI (75% LTV)
  - Pure Gold: $10 \times 18 / 24 = 7.50\text{g}$
  - Gold Value: $7.5 \times 7000 = ₹52,500$ ($5,250,000\text{ paise}$)
  - Eligible Loan: $\lfloor 52500 \times 0.75 \rfloor = ₹39,375$ ($3,937,500\text{ paise}$)

---

## 4. REST API Endpoints Specification

### 4.1 `GET /api/v1/loan-schemes` (Page 3, 4)
* **Purpose**: Fetches active gold loan plans seeded from database.
* **Response (`200 OK`)**:
  ```json
  {
    "schemes": [
      {
        "id": "PLAN_BULLET_01",
        "name": "Bullet Repayment",
        "interestRateAnnual": 12.0,
        "maxLtv": 0.70,
        "tenureMonths": 12,
        "description": "12 months, interest + principal at maturity",
        "isActive": true
      },
      {
        "id": "PLAN_EMI_01",
        "name": "Monthly EMI",
        "interestRateAnnual": 10.5,
        "maxLtv": 0.75,
        "tenureMonths": 12,
        "description": "12 months, equal monthly instalments",
        "isActive": true
      }
    ]
  }
  ```

### 4.2 `POST /api/v1/quotes` (Page 3, 4)
* **Purpose**: Pure financial calculation (zero database writes, zero lead persistence).
* **Request**:
  ```json
  {
    "grossWeightGrams": 50,
    "netWeightGrams": 45,
    "karat": 22,
    "selectedPlanId": "PLAN_EMI_01"
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "pureGoldGrams": 41.25,
    "goldValueRupees": 288750,
    "goldValuePaise": 28875000,
    "eligibleLoanRupees": 216562,
    "eligibleLoanPaise": 21656200,
    "currency": "INR",
    "appliedLtv": 0.75,
    "appliedRatePerGram24K": 7000
  }
  ```

### 4.3 `POST /api/v1/leads` (Page 3, 4, 5)
* **Purpose**: Validates applicant details, recalculates finances on server, checks 7-day de-duplication window, generates sequence ID (`GL-1001`), and persists lead.
* **Request**:
  ```json
  {
    "fullName": "Priya Sharma",
    "mobileNumber": "9876543210",
    "grossWeightGrams": 50,
    "netWeightGrams": 45,
    "karat": 22,
    "selectedPlanId": "PLAN_EMI_01"
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "applicationId": "GL-1001",
    "status": "SUBMITTED",
    "fullName": "Priya Sharma",
    "pureGoldGrams": 41.25,
    "eligibleLoanRupees": 216562,
    "createdAt": "2026-10-10T12:00:00.000Z"
  }
  ```
* **Duplicate Conflict (`409 Conflict`)**:
  Returned when the same mobile number reapplies within 7 days:
  ```json
  {
    "error": {
      "code": "DUPLICATE_APPLICATION",
      "message": "You already applied within the last 7 days. Your existing application ID is GL-1001.",
      "existingApplicationId": "GL-1001",
      "existingApplicationDate": "2026-10-10T12:00:00.000Z",
      "fields": [
        { "field": "mobileNumber", "message": "Duplicate application within 7 days" }
      ]
    }
  }
  ```

### 4.4 `GET /api/v1/leads` (Page 3, 5)
* **Purpose**: Administrative leads retrieval, ordered newest first (`createdAt DESC`).
* **Privacy Requirement**: Mobile numbers must be masked (`9876XXXX10`). Raw mobile numbers are never returned.
* **Response (`200 OK`)**:
  ```json
  {
    "leads": [
      {
        "id": "GL-1001",
        "fullName": "Priya Sharma",
        "maskedMobile": "9876XXXX10",
        "grossWeightGrams": 50,
        "netWeightGrams": 45,
        "karat": 22,
        "pureGoldGrams": 41.25,
        "eligibleLoanRupees": 216562,
        "selectedPlanId": "PLAN_EMI_01",
        "status": "SUBMITTED",
        "createdAt": "2026-10-10T12:00:00.000Z"
      }
    ]
  }
  ```

### 4.5 Agent Endpoints (`/api/v1/agent/chat` and `/api/v1/agent/confirm`)
* `POST /api/v1/agent/chat`: Conversational interface proxying to Gemini with typed tool execution.
* `POST /api/v1/agent/confirm`: Explicit user confirmation endpoint recording session draft approval before `submit_application` tool can execute.

---

## 5. Input Validation Rules (Zod)

* **Applicant Name**: Length `2–60` characters, ASCII letters and spaces only (`/^[a-zA-Z ]{2,60}$/`). Explicitly rejects numbers, tabs (`\t`), newlines (`\n`, `\r`), and symbols.
* **Mobile Number**: Indian 10-digit format starting with digits 6–9 (`/^[6-9]\d{9}$/`).
* **Weights**: $0 < \text{netWeightGrams} \le \text{grossWeightGrams} \le 1000.00$, max 2 decimal places.
* **Karat**: Integer value strictly `18 | 22 | 24`.
* **Selected Plan**: Must match an active `LoanScheme.id` in the database; returns `404 Not Found` if nonexistent.

---

## 6. Database Models, Sequences & Seeding

### 6.1 Prisma Models (`server/prisma/schema.prisma`)
* **`LoanScheme`**: `id` (PK, string), `name`, `interestRateAnnual` (Decimal 5,2), `maxLtv` (Decimal 3,2), `tenureMonths` (Int), `description`, `isActive` (Boolean).
* **`Lead`**: `id` (PK, string, formatted `GL-${seq}`), `fullName`, `mobileNumber`, `grossWeightGrams` (Decimal 8,2), `netWeightGrams` (Decimal 8,2), `karat` (Int), `pureGoldGrams` (Decimal 8,2), `goldValuePaise` (BigInt), `eligibleLoanPaise` (BigInt), `selectedPlanId` (FK), `status` (String), timestamps. Index on `[mobileNumber, createdAt]`.
* **`AgentSession`**: `id` (UUID PK), `messages` (JSON), `draftPayload` (JSON), `draftVersion` (Int), `isConfirmed` (Boolean), `confirmedDraftVersion` (Int), `confirmedAt` (DateTime), timestamps.

### 6.2 Sequence ID Generation
Database sequence `lead_application_id_seq` starting at 1001:
```sql
CREATE SEQUENCE IF NOT EXISTS lead_application_id_seq START WITH 1001 INCREMENT BY 1;
```
Application ID generated inside transaction via `SELECT nextval('lead_application_id_seq');` and formatted as `GL-${nextval}`. Row count (`count()`) is strictly prohibited.

### 6.3 Idempotent Seeding
`npm run db:seed` provisions:
* `lead_application_id_seq` starting at 1001.
* `PLAN_BULLET_01`: 12.0% p.a., 70% Max LTV, 12 months.
* `PLAN_EMI_01`: 10.5% p.a., 75% Max LTV, 12 months.

---

## 7. AI Loan Assist Agent Specifications

### 7.1 Architecture & Gemini Integration
* Integrated exclusively server-side using `@google/genai` (or `@google/generative-ai`) with `GEMINI_API_KEY`.
* Zero client-side API keys. Mobile numbers masked in all server logs (`9876XXXX10`).

### 7.2 The Three Mandatory Tools
1. **`get_loan_schemes()`**: Returns active schemes from database.
2. **`calculate_quote(net, gross, karat)`**: Pure financial quote calculation. (Parameter signature is strictly `(net, gross, karat)`; internally mapped to `netWeightGrams`, `grossWeightGrams`, `karat`).
3. **`submit_application(payload)`**: Persists lead with sequence ID and returns confirmation.

### 7.3 Server-Enforced Confirmation Gate
* The agent cannot finalize lead submission without user confirmation.
* Once quote and applicant details are gathered, the UI renders a **Confirmation Card** with a summary and a `Confirm & Submit` button.
* Clicking the button sends `POST /api/v1/agent/confirm` with `{ sessionId, draftVersion }`.
* The `submit_application` tool handler verifies `session.isConfirmed === true` and `session.confirmedDraftVersion === session.draftVersion`.
* Any modification to weights, karat, plan, or details immediately resets `isConfirmed = false`.

### 7.4 Agent Guardrails
* **No LLM Math**: All calculations must use `calculate_quote`.
* **Scope Control**: Operates strictly within gold loans. Declines investment advice, crypto/stocks, or approval guarantees.

---

## 8. Web Frontend UI/UX Specifications

### 8.1 3-Step Guided Form Flow
* **Step 1: Details**: Full name and 10-digit mobile number with inline validation.
* **Step 2: Live Quote**: Weights, karat selector, live debounced re-quoting (~300ms), and plan selection cards.
* **Step 3: Confirm & Application**: Review summary, final submission action, and friendly 409 conflict message with previous application ID and date.
* **Mobile Responsiveness**: Adaptive down to 375 px viewport with numeric keypads (`inputMode="decimal"` / `inputMode="numeric"`).

### 8.2 Admin Leads View
* Sorts leads newest first (`createdAt DESC`).
* Displays masked mobile numbers (`9876XXXX10`), net weight, plan, loan amount, status, and creation date.
* Plan filter dropdown.

---

## 9. Evaluation Suite & Test Coverage

### 9.1 Financial Maths Unit Tests
* Reference Cases 1, 2, and 3 pass with 100% exact numerical match.

### 9.2 API Integration Tests (Supertest)
* Case 1a: Quote Calculation $\rightarrow$ 200 OK.
* Case 1b: Lead Creation $\rightarrow$ 201 Created with sequence ID `GL-1001`.
* Case 4: Net weight > gross weight $\rightarrow$ 400 Bad Request.
* Case 5: Invalid mobile number $\rightarrow$ 400 Bad Request.
* Case 6: Same mobile within 7 days $\rightarrow$ 409 Conflict returning existing ID.
* Case 6b: Same mobile after 8 days $\rightarrow$ 201 Created with new sequence ID.

### 9.3 AI Agent Conversation Evaluation Suite (`npm run eval`)
1. **Happy path**: Gathers details, invokes tools, renders confirmation, submits lead.
2. **Missing weight field**: Prompts applicant for missing net/gross weight before quoting.
3. **Validation error (net > gross)**: Identifies error and prompts user to correct weights.
4. **Duplicate within 7 days**: Explains existing application conflict and provides ID.
5. **Off-topic inquiry**: Politely declines investment/crypto questions and returns to gold loans.

---

## 10. Deliverables & Rubric Mapping

1. **GitHub Repository**: Monorepo with working root scripts: `npm install`, `npm run dev`, `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run db:studio`.
2. **`README.md`**: Native PostgreSQL 18 setup guide, pgAdmin walkthrough, environment variables, scripts reference, and future enhancements.
3. **`AI_LOG.md`**: Tools used, exact prompts, and documented caught AI mistake with regression test.
4. **`.env.example`**: Clean template with zero committed credentials.
