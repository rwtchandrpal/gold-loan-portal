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

### Step 3.3: Configure Root Environment Variables
The repository uses a single canonical root `.env` file for local development. Copy the template from the monorepo root:
```bash
cp .env.example .env
```
Open `.env` and verify or update your local configuration:
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
GEMINI_MODEL=gemini-2.5-flash

# Frontend Client Configuration (Vite)
VITE_API_BASE_URL=http://localhost:4000
```

> **Security Rule**: The root `.env` is the single canonical local configuration file. Real `.env` files and credentials are excluded by Git (`.gitignore`) and must never be committed. In cloud deployments (Render and Vercel), environment variables are supplied directly through their respective platform dashboards.

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
| `npm test` | Runs all Vitest unit, integration, and component tests across workspaces |
| `npm run build` | Builds frontend production assets and compiles backend TypeScript |
| `npm run build:server` | Compiles backend TypeScript (`tsc`) |
| `npm run build:client` | Compiles frontend React/Vite assets to `client/dist` |
| `npm run start:server` | Starts the compiled production backend server (`node dist/index.js`) |
| `npm run db:migrate` | Runs Prisma development migrations against local PostgreSQL (`prisma migrate dev`) |
| `npm run db:migrate:deploy` | Applies pending migrations in production using `DIRECT_URL` (`prisma migrate deploy`) |
| `npm run db:seed` | Seeds database idempotently with loan schemes and sequence |
| `npm run db:verify` | Verifies PostgreSQL connection, tables, sequence, and seeded schemes |
| `npm run db:studio` | Launches Prisma Studio GUI at `http://localhost:5555` |
| `npm run eval` | Runs the 5 mandatory AI agent evaluation conversation test suite |
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

## 10. Production Deployment Guide (Render Backend & Vercel Frontend)

This repository supports three deployment scenarios from a single unified GitHub repository:

### Scenario 1: Local Development
* **Environment file**: Single canonical root `.env` (copied from `.env.example`).
* **Database**: Native PostgreSQL 18 on Windows (`localhost:5432`) or containerized via Docker.
* **Backend**: Express API on port 4000.
* **Frontend**: Vite dev server on port 5173, reading `VITE_API_BASE_URL=http://localhost:4000` from the root `.env`.
* **Execution**: Single root command `npm run dev`.

---

### Scenario 2: Backend Deployment on Render (Web Service)
Deploy the Express API as a Node.js Web Service on [Render](https://render.com) using Neon PostgreSQL:

1. **Repository Settings**:
   * **Root Directory**: `.` (repository root)
   * **Environment**: `Node`
   * **Build Command**: `npm ci --include=dev && npm run prisma:generate --workspace=server && npm run build --workspace=server`
   * **Start Command**: `npm run start --workspace=server`
   * **Pre-Deploy Command** (for database migrations): `npm run db:migrate:deploy --workspace=server`
2. **Render Environment Variables**:
   Configure in Render Dashboard (**Environment** tab):

| Variable | Value / Notes | Required? |
|---|---|---|
| `NODE_ENV` | `production` | Yes |
| `PORT` | *(Provided dynamically by Render, e.g. 10000)* | Auto-injected |
| `DATABASE_URL` | Neon pooled connection string (`sslmode=require`) | Yes |
| `DIRECT_URL` | Neon direct unpooled connection string (`sslmode=require`) | Yes (for migrations) |
| `CORS_ORIGIN` | Your deployed Vercel frontend URL (e.g. `https://gold-loan-portal.vercel.app`) | Yes |
| `GOLD_RATE_24K` | `7000` | Yes |
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Optional (default) |

> **Note**: A Blueprint specification [`render.yaml`](file:///d:/projects/gldportal/render.yaml) is included in the repository root for automated infrastructure-as-code setup.

---

### Scenario 3: Frontend Deployment on Vercel
Deploy the React/Vite single-page application on [Vercel](https://vercel.com):

1. **Project Import Settings**:
   * **Framework Preset**: `Vite`
   * **Root Directory**: `.` (repository root)
   * **Build Command**: `npm run build --workspace=client`
   * **Output Directory**: `client/dist`
   * **Install Command**: `npm install`
2. **Vercel Environment Variables**:
   Configure in Vercel Project Settings (**Environment Variables**):

| Variable | Value / Notes | Required? |
|---|---|---|
| `VITE_API_BASE_URL` | Your deployed Render backend URL (e.g. `https://gold-loan-api.onrender.com`) | Yes |

3. **Production Isolation Safeguards**:
   * Vercel builds receive **only** variables prefixed with `VITE_`.
   * Server-only secrets (`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`) are completely absent from client bundles.
   * A build-time check in `vite.config.ts` prevents accidental deployments targeting `localhost`.
   * Single-page routing rewrites are configured in [`vercel.json`](file:///d:/projects/gldportal/vercel.json).

---

## 11. Environment Variables Matrix

| Variable | Scope | Local Default | Render Backend | Vercel Frontend |
|---|---|---|---|---|
| `PORT` | Backend | `4000` | Injected by Render | N/A |
| `NODE_ENV` | Backend | `development` | `production` | N/A |
| `CORS_ORIGIN` | Backend | `http://localhost:5173` | Vercel URL (`https://...`) | N/A |
| `DATABASE_URL` | Backend | `postgresql://...localhost:5432` | Neon Pooled URL | N/A |
| `DIRECT_URL` | Backend | *(Optional locally)* | Neon Direct URL | N/A |
| `GOLD_RATE_24K` | Backend | `7000` | `7000` | N/A |
| `GEMINI_API_KEY` | Backend | Local developer key | Production Gemini key | N/A |
| `GEMINI_MODEL` | Backend | `gemini-2.5-flash` | `gemini-2.5-flash` | N/A |
| `VITE_API_BASE_URL` | Frontend | `http://localhost:4000` | N/A | Render Backend URL (`https://...`) |

---

## 12. Deliverables & Documentation Index

| File | Purpose |
|---|---|
| [`README.md`](file:///d:/projects/gldportal/README.md) | Complete project overview, architecture, native PostgreSQL 18 setup, and deployment guides |
| [`AI_LOG.md`](file:///d:/projects/gldportal/AI_LOG.md) | AI tooling log, two exact prompts, and genuine AI mistake with automated regression test |
| [`.env.example`](file:///d:/projects/gldportal/.env.example) | Root environment configuration template with zero committed credentials |
| [`vercel.json`](file:///d:/projects/gldportal/vercel.json) | Vercel monorepo configuration for frontend build and SPA routing |
| [`render.yaml`](file:///d:/projects/gldportal/render.yaml) | Render Blueprint configuration for backend web service deployment |
| [`docs/requirements-matrix.md`](file:///d:/projects/gldportal/docs/requirements-matrix.md) | Requirements traceability matrix mapped directly to the 8-page assignment PDF |
| [`docs/implementation-plan.md`](file:///d:/projects/gldportal/docs/implementation-plan.md) | Phased engineering implementation blueprint and gating record |
| [`docs/requirements.md`](file:///d:/projects/gldportal/docs/requirements.md) | Complete business rules, financial precision standards, and API specifications |
