# Gold Loan Portal — With an AI Loan Assist Agent

A production-minded, full-stack gold loan intake portal featuring both a guided 3-step application form and an interactive AI Loan Assist Agent powered by Google Gemini API function calling. Both intake pathways are built on the architectural principle of **"Same Truth, Two Paths"**, sharing identical Zod validation rules, exact financial calculations, and 7-day de-duplication logic.

---

## 1. Architectural Overview & System Design

```
+---------------------------------------------------------------------------------+
|                                 USER INTERFACE                                  |
|                                                                                 |
|   +----------------------------------+     +--------------------------------+   |
|   | 3-Step Guided Application Form   |     | AI Loan Assist Agent Panel     |   |
|   | - Step 1: Applicant Details      |     | - Conversational intake        |   |
|   | - Step 2: Live Debounced Quote   |     | - 3 Function-calling tools     |   |
|   | - Step 3: Confirm & Application  |     | - UI Confirmation Card         |   |
|   +----------------------------------+     +--------------------------------+   |
|                                      \     /                                    |
+---------------------------------------\---/-------------------------------------+
                                         \ /
                                          v
+---------------------------------------------------------------------------------+
|                       SHARED BACKEND SERVICE LAYER                              |
|                                                                                 |
|   * Zod Schemas: ASCII name regex, Indian mobile, gross/net weights, karats     |
|   * Financial Engine: Pure gold grams, gold value (₹7,000/g 24K), loan amount   |
|     (whole-rupee floor before paise conversion, LTV ceiling capped at 75%)      |
|   * Server-Enforced AI Confirmation: Dedicated draft verification state         |
|   * De-duplication: 7-day rejection window with HTTP 409 Conflict               |
|   * Collision-Safe Sequence ID: Database sequence lead_application_id_seq      |
+---------------------------------------------------------------------------------+
                                          |
                                          v
+---------------------------------------------------------------------------------+
|                        NATIVE POSTGRESQL + PRISMA ORM                           |
|                                                                                 |
|   * Database: gold_loan_portal (running locally on Windows / localhost:5432)   |
|   * Tables: LoanScheme, Lead, AgentSession, Sequence: lead_application_id_seq   |
+---------------------------------------------------------------------------------+
```

### Core Technologies
* **Frontend**: React 18, Vite 6, TypeScript, Tailwind CSS v4, Lucide React
* **Backend**: Node.js, Express, TypeScript, Zod, Prisma ORM 7 (`@prisma/adapter-pg`)
* **Database**: Native PostgreSQL 18 on Windows (default development database)
* **AI Engine**: Google Gemini API via official SDK (`@google/genai`) on the backend
* **Testing**: Vitest, Supertest, React Testing Library, JSDOM

---

## 2. Prerequisites

* **Node.js**: v18+ or v20+ (Node v24 LTS recommended)
* **npm**: v9+ (npm workspaces monorepo)
* **PostgreSQL 18**: Installed natively on Windows (or local instance on port `5432`)
* **pgAdmin 4**: (Optional GUI) Included with standard Windows PostgreSQL installer

---

## 3. Local Database Setup Guide (Native PostgreSQL on Windows)

Native PostgreSQL 18 is the **default development database** for this repository. Docker Compose is not required.

### Step 3.1: Install PostgreSQL 18 & pgAdmin 4
1. Download the Windows installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/).
2. Run the installer and ensure **PostgreSQL Server**, **Command Line Tools**, and **pgAdmin 4** are selected.
3. Keep default port `5432` during installation.

### Step 3.2: Create User & Database
You can create the user and database using either **pgAdmin 4 (GUI)** or the **Command Line (`psql`)**.

#### Option A: Using pgAdmin 4 (GUI)
1. Open **pgAdmin 4** and connect to your local PostgreSQL 18 server (enter the master password set during install).
2. Create the development user:
   * In Object Explorer, right-click **Login/Group Roles** &rarr; **Create** &rarr; **Login/Group Role...**.
   * **General** tab: Name = `goldloan_dev`.
   * **Definition** tab: Password = your chosen password (e.g., `post1234` or `your_password`).
   * **Privileges** tab: Toggle **Can login?** to **Yes**.
   * Click **Save**.
3. Create the database:
   * Right-click **Databases** &rarr; **Create** &rarr; **Database...**.
   * **General** tab: Database = `gold_loan_portal`, Owner = `goldloan_dev`.
   * Click **Save**.

#### Option B: Using Command Line (`psql`)
Open PowerShell or Command Prompt as Administrator and run:
```sql
psql -U postgres -c "CREATE USER goldloan_dev WITH PASSWORD 'your_password';"
psql -U postgres -c "CREATE DATABASE gold_loan_portal OWNER goldloan_dev;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE gold_loan_portal TO goldloan_dev;"
```

### Step 3.3: Configure Server Environment Variables
Copy the example environment file:
```bash
cp server/.env.example server/.env
```
Open `server/.env` and update `DATABASE_URL` with your local credentials:
```env
# Server Configuration
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Database (Native PostgreSQL 18 on Windows)
DATABASE_URL=postgresql://goldloan_dev:your_password@localhost:5432/gold_loan_portal?schema=public

# Financial Constants
GOLD_RATE_24K=7000

# Google Gemini API Key (Server-Side Only)
GEMINI_API_KEY=your_gemini_api_key_here
```

> **Security Rule**: Credentials are read exclusively from server-side environment variables. Real `.env` files are ignored by Git (`.gitignore`) and must never be committed.

### Step 3.4: Apply Versioned Schema Migrations
Run Prisma Migrate from the monorepo root:
```bash
npm run db:migrate
```
*Note: Versioned migrations are created and applied in `server/prisma/migrations` via `prisma migrate dev`. Using `prisma db push` as a substitute is prohibited.*

### Step 3.5: Seed Loan Schemes & Sequence
Run the idempotent database seed script:
```bash
npm run db:seed
```
This populates the two mandatory loan schemes and establishes the sequence:
* **Bullet Repayment (`PLAN_BULLET_01`)**: 12.0% p.a., 70% Max LTV, 12 months tenure.
* **Monthly EMI (`PLAN_EMI_01`)**: 10.5% p.a., 75% Max LTV, 12 months tenure.
* **Sequence (`lead_application_id_seq`)**: Starts at `1001`, increments by 1 for formatted application IDs (`GL-1001`, `GL-1002`, etc.).

### Step 3.6: Inspect Database with Prisma Studio (Optional)
To view and inspect tables via the browser:
```bash
npm run db:studio
```
Prisma Studio opens at [http://localhost:5555](http://localhost:5555).

---

## 4. Running the Application

### 4.1 Install All Dependencies
From the repository root:
```bash
npm install
```
This automatically installs dependencies across both `server` and `client` workspaces.

### 4.2 Start Development Servers
```bash
npm run dev
```
Using `concurrently`, this single root command launches:
* **Backend API**: [http://localhost:4000](http://localhost:4000) (Health check: `http://localhost:4000/health`)
* **Frontend Portal**: [http://localhost:5173](http://localhost:5173)

### 4.3 Run Test Suites
```bash
npm test
```
Executes Vitest across backend (unit, integration, and Supertest suites) and frontend (React Testing Library).

---

## 5. Root Monorepo Scripts Reference

| Script | Purpose |
|---|---|
| `npm run dev` | Runs backend (port 4000) and frontend (port 5173) concurrently |
| `npm test` | Runs all Vitest unit, integration, and component tests |
| `npm run build` | Builds frontend production assets and compiles backend TypeScript |
| `npm run db:migrate` | Runs versioned Prisma migrations against PostgreSQL (`prisma migrate dev`) |
| `npm run db:seed` | Seeds database idempotently with loan schemes and sequence |
| `npm run db:studio` | Launches Prisma Studio GUI at `http://localhost:5555` |
| `npm run db:up` | *(Optional/Bonus B4)* Starts PostgreSQL 18 container if Docker is used |
| `npm run db:down` | *(Optional/Bonus B4)* Stops containerized PostgreSQL |

---

## 6. Financial Calculation Rules & Exact Precision

Financial calculations are handled strictly on the server:
1. **Weight Input Precision**:
   * Up to 2 decimal places in grams (0.01g resolution, $0 < \text{netWeightGrams} \le \text{grossWeightGrams} \le 1000.00$).
2. **Pure Gold**:
   $$\text{pureGoldGrams} = \text{netWeightGrams} \times \left(\frac{\text{karat}}{24}\right)$$
   Intermediate calculations preserve full precision (minimum 6 decimal places / exact fractions) to prevent cumulative rounding loss.
3. **Gold Value & Rounding Policy**:
   $$\text{unroundedGoldValueRupees} = \text{pureGoldGrams} \times \text{rate24kPerGram} \quad (\text{mock rate ₹7,000/g})$$
   $$\text{goldValuePaise} = \text{round}_{\text{half-up}}(\text{unroundedGoldValueRupees} \times 100)$$
   $$\text{goldValueRupees} = \frac{\text{Number}(\text{goldValuePaise})}{100}$$
4. **Eligible Loan Amount (Calculated from Unrounded Gold Value)**:
   $$\text{eligibleLoanRupees} = \lfloor \text{unroundedGoldValueRupees} \times \min(\text{plan.maxLtv}, 0.75) \rfloor$$
   $$\text{eligibleLoanPaise} = \text{BigInt}(\text{eligibleLoanRupees}) \times 100\text{n}$$
5. **Precision Standards**:
   * Eligible loan is strictly calculated from the unrounded gold value, floored to whole rupees (`Math.floor`), and converted to integer paise (`* 100n`).
   * Stored in database as integer **paise** (`BigInt`) or `DECIMAL`.
   * Never compute paise using `Math.round` on binary floating-point rupees; use documented precise-decimal arithmetic with half-up rounding for gold value.
   * Client-provided financial amounts are never trusted; server re-computes on every submission.

---

## 7. REST API Endpoints

All endpoints follow the uniform error contract `{ error: { code, message, fields[] } }`.

1. **`GET /api/v1/loan-schemes`**
   * Returns list of active loan plans seeded from database.
2. **`POST /api/v1/quotes`**
   * Calculates pure gold, estimated value, and eligible loan without database writes.
3. **`POST /api/v1/leads`**
   * Validates inputs, recomputes financial figures, checks 7-day de-duplication window, generates sequence ID (`GL-1001`), persists lead, and returns HTTP 201.
4. **`GET /api/v1/leads`**
   * Returns all submitted leads ordered newest first with mobile numbers masked (`9876XXXX10`).
5. **`POST /api/v1/agent/chat`**
   * Proxies AI agent conversation to Gemini API with typed tool calling.
6. **`POST /api/v1/agent/confirm`**
   * Records authoritative user confirmation state binding `sessionId` and `draftVersion`.

---

## 8. AI Loan Assist Agent

* **Provider**: Google Gemini API via server-side SDK. Zero browser API keys.
* **Mandatory Tools**:
  1. `get_loan_schemes()`
  2. `calculate_quote(net, gross, karat)`
  3. `submit_application(payload)`
* **Server-Enforced Confirmation**:
  * The agent cannot submit an application on its own.
  * When details are collected, the UI renders a **Confirmation Card** with a `Confirm & Submit` button.
  * Clicking the button calls `POST /api/v1/agent/confirm`, authorizing the server to allow `submit_application` execution for that specific draft version.
  * Modifying any weight, karat, or applicant detail immediately invalidates confirmation.
* **Strict Guardrails**:
  * Agent never computes financial math in the LLM; all quotes are computed via `calculate_quote`.
  * Agent stays strictly within gold loans; declines stock/crypto advice or approval promises.

---

## 9. Optional Containerized Setup (Bonus B4)

While native PostgreSQL on Windows is the primary default, a root `docker-compose.yml` is provided for containerized environments:
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```
To stop the container:
```bash
docker compose down
```

---

## 10. Future Enhancements ("What you'd do with more time")

1. **Production Concurrency Hardening (Bonus B1)**: Deploy PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`) on hashed mobile numbers to ensure atomic check-and-insert under high concurrent load.
2. **Real-Time Live Gold Price Ingestion**: Integrate Indian Bullion and Jewellers Association (IBJA) or Metalprice API with in-memory Redis caching and 60-second TTL fallback.
3. **Appraisal Slip Multimodal OCR (Bonus B3)**: Allow applicants to upload appraisal receipts to auto-extract gross weight, net weight, and hallmark karat via Gemini Multimodal.
4. **SMS OTP Verification**: Enforce Indian mobile verification via Twilio/Gupshup before application finalization.
5. **Role-Based Admin Access**: Add JWT/OAuth2 role-based authentication to `GET /api/v1/leads` with audit trails.

---

## 11. Deliverables & Documentation Index

| File | Purpose |
|---|---|
| [`README.md`](file:///d:/projects/gldportal/README.md) | Complete project overview, architecture, native PostgreSQL 18 setup, and script reference |
| [`AI_LOG.md`](file:///d:/projects/gldportal/AI_LOG.md) | AI tooling log, two exact prompts, and genuine AI mistake with automated regression test |
| [`.env.example`](file:///d:/projects/gldportal/.env.example) | Root environment configuration template with zero committed credentials |
| [`server/.env.example`](file:///d:/projects/gldportal/server/.env.example) | Server-specific environment template with PostgreSQL and Gemini settings |
| [`docs/requirements-matrix.md`](file:///d:/projects/gldportal/docs/requirements-matrix.md) | Requirements traceability matrix mapped directly to the 8-page assignment PDF |
| [`docs/implementation-plan.md`](file:///d:/projects/gldportal/docs/implementation-plan.md) | Phased engineering implementation blueprint and gating record |
| [`docs/requirements.md`](file:///d:/projects/gldportal/docs/requirements.md) | Complete business rules, financial precision standards, and API specifications |
