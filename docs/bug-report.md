# Gold Loan Portal — Bug Reproduction Report

**Document Version**: 1.0.0  
**Phase**: Stage B — Reproduce  
**Author**: Senior QA Engineer, Full-Stack Developer, React Performance Engineer, API Tester & AI Agent Engineer  
**Date**: 2026-10-11  

---

## 1. Executive Summary & Status Overview

During Stage B, all suspected issues identified during the Stage A audit were subjected to independent, systematic reproduction using headless browser automation, pixel interaction, network inspection, and API testing against the native PostgreSQL 18 environment.

* **Total Issues Investigated**: 9
* **Confirmed Defects**: 9
* **Suspected but Unconfirmed**: 0
* **Non-Reproducible Issues**: 0
* **Destructive Actions Taken**: 0 (zero database resets, zero application code modified)

---

## 2. Summary of Confirmed Defects

| Bug ID | Severity | Category | Affected Files / Components | Short Description | Status |
|---|---|---|---|---|---|
| **BUG-01** | **High** | UI / State | `client/src/components/form/Step2LiveQuote.tsx` | Stale quotes & enabled "Review & Confirm" button when net weight > gross weight or cleared | Open |
| **BUG-02** | **High** | API / Contract | `server/src/middlewares/error.middleware.ts` | Malformed JSON in request body returns HTTP 500 instead of HTTP 400 | **FIXED** |
| **BUG-03** | **High** | Security / AI | `server/src/controllers/agent.controller.ts`, `server/src/agent/gemini.client.ts` | Verbal weight changes in chat fail to invalidate confirmation or update draft, leaving stale confirmation valid | Open |
| **BUG-04** | **High** | UI / State | `client/src/App.tsx` | Switching tabs unmounts `<AgentChatPanel />`, destroying active messages, session ID, and unconfirmed drafts | Open |
| **BUG-05** | **High** | Performance | `client/src/components/form/Step2LiveQuote.tsx` | Unstable object literal in `useDebounce` dependency restarts timer on every component render | Open |
| **BUG-06** | **Medium** | UI / UX | `client/src/components/form/Step2LiveQuote.tsx`, `client/src/App.tsx` | Duplicate `GET /api/v1/loan-schemes` and skeleton card flash upon entering Step 2 | Open |
| **BUG-07** | **Medium** | UI / UX | `client/src/components/form/Step2LiveQuote.tsx`, `client/src/App.tsx` | Back navigation from Step 3 to Step 2 flashes "Calculating valuation..." due to uninitialized quote map | Open |
| **BUG-08** | **Medium** | Network | `client/src/api/client.ts`, `client/src/components/form/Step2LiveQuote.tsx` | Missing `AbortController` in quote requests permits orphaned in-flight requests during rapid typing | Open |
| **BUG-09** | **High** | AI Agent | `server/src/agent/gemini.client.ts` | Deterministic mock agent drops natural queries, corrections ("Actually, net is 42g"), and plan changes into generic greetings | Open |

---

## 3. Detailed Bug Reports

### BUG-01: Stale Quotes & Enabled "Review & Confirm" Button on Invalid Weight Inputs

* **Bug ID**: `BUG-01`
* **Severity**: **High (S2)**
* **Affected Area**: Client Form / Live Quote State
* **Affected Files**: `client/src/components/form/Step2LiveQuote.tsx`
* **Reproduction Steps**:
  1. Navigate to `http://localhost:5173`.
  2. In Step 1, enter Full Name: `Priya Sharma`, Mobile: `9876543210`, Gross: `50.00`, Net: `45.00`, Karat: `22K`.
  3. Click "Calculate Live Quote" to enter Step 2.
  4. Verify Step 2 shows Ornament Valuation: `₹2,88,750`, Pure Gold: `41.2500 g`, Monthly EMI: `₹2,16,562`.
  5. In Step 2, edit Net Weight to `55.00` (which is greater than gross `50.00`) or delete the Net Weight input completely.
* **Expected Behavior**:
  - The previous quotation metrics must be cleared or flagged with an explicit validation error ("Net weight cannot exceed gross weight").
  - The "Review & Confirm" button must be disabled to prevent advancing to Step 3 with invalid data.
* **Actual Behavior**:
  - The calculation effect returns early without clearing `quotesByPlan`.
  - The valuation card remains visible with the stale quote for 45g (`₹2,88,750`, `41.2500 g`).
  - The "Review & Confirm" button remains fully active and enabled, allowing the borrower to advance to Step 3 with invalid inputs.
* **Reproduction Frequency**: 100% (consistently reproducible).
* **Evidence**:
  - Captured browser screenshot: `invalid_net_gt_gross_1791736272146.png` shows empty/invalid Net field alongside active `₹2,88,750` valuation and bright orange, enabled "Review & Confirm →" button.
* **Root Cause (Confirmed)**:
  - In `Step2LiveQuote.tsx` (lines 83–94), the input validation guard executes `return;` when inputs are invalid. It does not set `quotesByPlan: {}`, does not set an error state, and does not disable `handleProceed`.
* **Planned Regression Test**:
  - Component test in `Step2LiveQuote.test.tsx` verifying that entering net weight > gross weight immediately clears quotes, displays an inline validation message, and disables the proceed button.

---

### BUG-02: Express Body-Parser SyntaxError Drops to HTTP 500 on Malformed JSON

* **Bug ID**: `BUG-02`
* **Severity**: **High (S2)**
* **Affected Area**: Backend REST API / Error Handling Contract
* **Affected Files**: `server/src/middlewares/error.middleware.ts`, `server/src/app.ts`
* **Reproduction Steps**:
  1. Send an HTTP POST request to `http://localhost:4000/api/v1/quotes` or `http://localhost:4000/api/v1/leads` with `Content-Type: application/json` and malformed body: `invalid-json{`.
* **Expected Behavior**:
  - HTTP 400 Bad Request conforming to canonical error contract:
    ```json
    {
      "error": {
        "code": "MALFORMED_JSON",
        "message": "Malformed JSON payload in request body"
      }
    }
    ```
* **Actual Behavior**:
  - HTTP 500 Internal Server Error:
    ```json
    {
      "error": {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "An unexpected server error occurred."
      }
    }
    ```
* **Reproduction Frequency**: 100% (every malformed JSON request).
* **Evidence**:
  - `curl.exe -i -X POST http://localhost:4000/api/v1/quotes -H "Content-Type: application/json" -d "invalid-json{"`
  - Output header: `HTTP/1.1 500 Internal Server Error`
  - Server log: `[Internal Error]: Expected property name or '}' in JSON at position 1 (line 1 column 2)`
* **Root Cause (Confirmed)**:
  - `errorHandler` in `server/src/middlewares/error.middleware.ts` checked only `if (err instanceof DuplicateApplicationError)` and `if (err instanceof AppError)`.
  - Body-parser's native `SyntaxError` (which carries `err.status = 400` or `err.type = 'entity.parse.failed'`) is not an instance of `AppError`, falling into the catch-all HTTP 500 branch.
* **Status**: **FIXED & VERIFIED**
* **Files Changed**:
  - `server/src/middlewares/error.middleware.ts` (added handler for body-parser `SyntaxError` returning HTTP 400 with `MALFORMED_JSON`)
  - `server/tests/integration/schemes-and-quotes.test.ts` (added regression test for `POST /api/v1/quotes`)
  - `server/tests/integration/leads.test.ts` (added regression test for `POST /api/v1/leads`)
* **Regression Test Verification**:
  - `tests/integration/schemes-and-quotes.test.ts` ("returns 400 MALFORMED_JSON when request body contains invalid JSON") &rarr; PASS
  - `tests/integration/leads.test.ts` ("returns 400 MALFORMED_JSON when request body contains invalid JSON") &rarr; PASS
  - Complete backend suite: 62/62 tests PASS, `tsc` build PASS.

---

### BUG-03: Verbal Weight Corrections in AI Chat Fail to Invalidate Existing Confirmation

* **Bug ID**: `BUG-03`
* **Severity**: **High (S2)**
* **Affected Area**: AI Agent Architecture / Confirmation Security Gate
* **Affected Files**: `server/src/controllers/agent.controller.ts`, `server/src/agent/gemini.client.ts`
* **Reproduction Steps**:
  1. Start chat session: `"Name Priya Sharma, mobile 9876543210, net 45g, gross 50g, 22K, PLAN_EMI_01"`.
  2. Confirm the resulting draft v1 via `POST /api/v1/agent/confirm` (`isConfirmed: true`, `draftVersion: 1`).
  3. Send conversational correction: `"Actually, my net weight is 40g."`
  4. Inspect session confirmation state and draft values.
* **Expected Behavior**:
  - Server updates net weight to 40g, recomputes quote, increments draft version to v2, and strictly invalidates confirmation (`isConfirmed: false`).
* **Actual Behavior**:
  - `extractApplicantDetailsFromText` only checks for name, mobile, and plan code; it does not extract weights.
  - `MockGeminiAgent` fails to parse "40g" without gross weight and drops the message into default greeting.
  - The session draft remains unchanged at 45g, and `isConfirmed` remains `true` for draft v1. If the user subsequently says "Please submit", the backend submits the stale 45g application without re-confirmation.
* **Reproduction Frequency**: 100%.
* **Evidence**:
  - Supertest output from `reproduce-agent.test.ts`:
    ```text
    --- Scenario 7: Initial Confirmation ---
    Confirmed: true, Draft Version: 1
    After modification:
    Is Confirmed: true, Draft Version: 1, Net Weight: 45
    ```
* **Root Cause (Confirmed)**:
  - Weight parsing is absent from `extractApplicantDetailsFromText` in `agent.controller.ts`, and `MockGeminiAgent` lacks conversational memory of previous turns.
* **Planned Regression Test**:
  - Multi-turn test in `agent-api.test.ts` verifying that saying "Actually, net is 40g" updates draft to v2 and resets `isConfirmed: false`.

---

### BUG-04: Chat Messages, Session ID, and Draft Wiped on UI Tab Navigation

* **Bug ID**: `BUG-04`
* **Status**: **FIXED & VERIFIED (Phase C2)**
* **Severity**: **High (S2)**
* **Affected Area**: Frontend Tab Lifecycle / Conversation Continuity
* **Affected Files**: `client/src/App.tsx`
* **Reproduction Steps**:
  1. In browser, navigate to "AI Assistant" tab.
  2. Converse with agent until a pending draft is presented on the Confirmation Card.
  3. Click "Apply (Form)" tab or "Admin Leads" tab.
  4. Click back to "AI Assistant" tab.
* **Expected Behavior**:
  - Chat history, session ID, and active draft card must be preserved.
* **Actual Behavior (Before Fix)**:
  - `<AgentChatPanel />` is unmounted by React conditional rendering `{activeTab === 'chat' ? <AgentChatPanel /> : ...}`.
  - Upon returning to the tab, the component mounts afresh: session ID is blank, messages reset to welcome message, and unsubmitted confirmation is lost.
* **Reproduction Frequency**: 100%.
* **Root Cause (Confirmed)**:
  - Component unmounting upon tab change rather than maintaining persistent panel state (e.g. keeping mounted with CSS `hidden` or lifting state to `App.tsx`).
* **Fix Applied**:
  - In `client/src/App.tsx`, `<AgentChatPanel />` is kept continuously mounted in a container with visibility toggled via `<div className={activeTab === 'chat' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'chat'}>`.
  - Chat messages, `sessionId`, draft object, version, and confirmation state remain permanently intact across tab changes without unmounting or firing duplicate API calls.
* **Actual Verification Results**:
  - Unit/Integration Regression Test: `client/src/App.test.tsx` test `BUG-04: preserves chat conversation, draft details, and confirmation card across tab navigation` passes.
  - Browser Verification: Subagent navigated between tabs and verified chat conversation, assistant reply, and confirmation card remain preserved across Apply, Admin, and Chat tab toggles.

---

### BUG-05: Unstable Object Literal Dependencies in `useDebounce`

* **Bug ID**: `BUG-05`
* **Status**: **FIXED & VERIFIED (Phase C2)**
* **Severity**: **High (S2)**
* **Affected Area**: React Rendering Performance / Hook Lifecycle
* **Affected Files**: `client/src/hooks/useDebounce.ts`, `client/src/components/form/Step2LiveQuote.tsx`
* **Reproduction Steps**:
  1. Open Step 2.
  2. Inspect dependency array `[value, delayMs]` in `useDebounce.ts`.
* **Expected Behavior**:
  - Debounce timer should only reset when primitive weight/karat values change.
* **Actual Behavior (Before Fix)**:
  - `Step2LiveQuote.tsx` passed `useDebounce({ grossWeight, netWeight, karat }, 300)`.
  - An inline object literal created a new reference on every render.
  - Unrelated renders cancelled the active timer and restarted it for another 300ms, causing debounce delay jitter and unnecessary re-renders.
* **Reproduction Frequency**: 100% on every component render.
* **Root Cause (Confirmed)**:
  - Unmemoized object literal passed into `useDebounce` hook, plus hook dependency tracking reference equality rather than serialized structural/primitive equality.
* **Fix Applied**:
  - In `client/src/components/form/Step2LiveQuote.tsx`, memoized weights object via `useMemo(() => ({ grossWeight, netWeight, karat }), [grossWeight, netWeight, karat])`.
  - In `client/src/hooks/useDebounce.ts`, tracked `serializedValue` (primitive string or value) in the `useEffect` dependency array and maintained `valueRef.current`, ensuring identical-content re-renders never restart or cancel the active debounce timer.
* **Actual Verification Results**:
  - Unit/Regression Tests: `client/src/hooks/useDebounce.test.ts` (3 tests) pass:
    - `delays updating the debounced value until delayMs has elapsed`
    - `debounces rapid input changes and commits only the final value`
    - `does not restart or cancel debounce timer when receiving a new object reference with identical contents`

---

### BUG-06: Duplicate Loan-Scheme Requests & Skeleton Flash on Step 2 Entry

* **Bug ID**: `BUG-06`
* **Status**: **FIXED & VERIFIED (Phase C2)**
* **Severity**: **Medium (S3)**
* **Affected Area**: Frontend UX / Unnecessary Network Calls
* **Affected Files**: `client/src/components/form/Step2LiveQuote.tsx`, `client/src/App.tsx`
* **Reproduction Steps**:
  1. Load app (which already loads schemes in `App.tsx`).
  2. Click "Calculate Live Quote" to enter Step 2.
  3. Observe the "Choose Loan Scheme" section.
* **Expected Behavior**:
  - Loan schemes display immediately using the pre-loaded schemes without skeleton cards or duplicate network requests.
* **Actual Behavior (Before Fix)**:
  - `Step2LiveQuote` initialized `loadingSchemes: true` on mount and issued an identical `GET /api/v1/loan-schemes` request, flashing pulsing skeleton boxes every time Step 2 was opened.
* **Reproduction Frequency**: 100%.
* **Root Cause (Confirmed)**:
  - Component ignored pre-loaded schemes from `App.tsx` and re-fetched locally with initial `loadingSchemes: true`.
* **Fix Applied**:
  - `client/src/App.tsx` passes `initialSchemes={schemes}` to `<Step2LiveQuote />`.
  - `client/src/components/form/Step2LiveQuote.tsx` initializes `schemes` with `initialSchemes` and sets `loadingSchemes: false` when initial schemes exist, bypassing the redundant network request and suppressing skeleton placeholders.
  - Preserved genuine loading and error states for cold/failed scheme fetches.
* **Actual Verification Results**:
  - Regression Tests:
    - `Step2LiveQuote.test.tsx`: `BUG-06: reuses preloaded initialSchemes, avoids duplicate getLoanSchemes call and skeleton flicker` (passes)
    - `Step2LiveQuote.test.tsx`: `BUG-06: preserves error state when initial scheme loading genuinely fails` (passes)
    - `App.test.tsx`: `BUG-06: fetches loan schemes once on mount and avoids redundant requests when advancing to Step 2` (passes)

---

### BUG-07: Valuation Card Flashes "Calculating valuation..." on Rewind from Step 3

* **Bug ID**: `BUG-07`
* **Status**: **FIXED & VERIFIED (Phase C2)**
* **Severity**: **Medium (S3)**
* **Affected Area**: Frontend UX / State Persistence Across Step Rewind
* **Affected Files**: `client/src/components/form/Step2LiveQuote.tsx`, `client/src/App.tsx`
* **Reproduction Steps**:
  1. Advance to Step 3.
  2. Click "← Back" button to return to Step 2.
  3. Observe valuation card.
* **Expected Behavior**:
  - Previously calculated valuation (`₹2,88,750`) and loan figures render immediately without loading flash.
* **Actual Behavior (Before Fix)**:
  - `quotesByPlan` initialized as `{}` on Step 2 mount, flashing "Calculating valuation..." until the debounce timer and API call completed.
* **Reproduction Frequency**: 100%.
* **Root Cause (Confirmed)**:
  - Quotes state was not passed from `App.tsx` to `Step2LiveQuote` upon remounting.
* **Fix Applied**:
  - `client/src/App.tsx` persists `quotes` in top-level state and passes `initialQuotes={quotes}` to `<Step2LiveQuote />`.
  - `client/src/components/form/Step2LiveQuote.tsx` initializes `quotesByPlan` with `initialQuotes`.
  - `initialQuoteWeightKey` tracks input weight parity; if inputs have not changed, quote re-fetching is skipped and no loading badge or placeholder is displayed.
  - If weights are modified in Step 1 or Step 2, quotes are cleared/recalculated fresh.
* **Actual Verification Results**:
  - Regression Tests:
    - `Step2LiveQuote.test.tsx`: `BUG-07: restores existing quotes without loading flash when returning from Step 3 with unchanged inputs` (passes)
    - `Step2LiveQuote.test.tsx`: `BUG-07: recalculates quote when weight inputs change in Step 2` (passes)
    - `App.test.tsx`: `BUG-07: preserves quotes and avoids loading flash across Step 2 -> Step 3 -> Step 2 navigation` (passes)
    - `App.test.tsx`: `BUG-07: discards cached quote and fetches fresh valuation if applicant inputs change in Step 1` (passes)
  - Browser Verification: Captured `back_to_step2_verified_1791738519208.png` showing immediate valuation restoration without loading indicators or skeleton flicker upon Step 3 → Step 2 rewind.

---

---

### BUG-08: Missing In-Flight Request Cancellation (`AbortController`)

* **Bug ID**: `BUG-08`
* **Severity**: **Medium (S3)**
* **Affected Area**: Network Optimization & Concurrency Safety
* **Affected Files**: `client/src/api/client.ts`, `client/src/components/form/Step2LiveQuote.tsx`
* **Reproduction Steps**:
  1. Inspect `api.getQuote()` implementation.
* **Expected Behavior**:
  - `api.getQuote()` accepts an optional `AbortSignal`.
  - `Step2LiveQuote` aborts pending in-flight requests when inputs change or when unmounting.
* **Actual Behavior**:
  - `api.getQuote()` takes only `QuoteRequest`. Rapid typing fires multiple concurrent requests, consuming network connections and backend processing.
* **Reproduction Frequency**: 100%.
* **Evidence**:
  - Source inspection of `client/src/api/client.ts` lines 52–59.
* **Root Cause (Confirmed)**:
  - No `AbortSignal` parameter in API client method and no abort controller in `Step2LiveQuote`.
* **Planned Regression Test**:
  - Spy test asserting `AbortController.abort()` is called when inputs update during a pending request.

---

### BUG-09: Mock AI Agent Drops Multi-Turn Queries, Corrections, and Plan Changes

* **Bug ID**: `BUG-09`
* **Severity**: **High (S2)**
* **Affected Area**: AI Agent Conversational Understanding & Evaluation
* **Affected Files**: `server/src/agent/gemini.client.ts`
* **Reproduction Steps**:
  1. Send `"I have 45 grams of 22K gold."` -> Response: Generic greeting (fails to ask if gross or net).
  2. Send `"The gross weight is 50 grams."` in Turn 2 -> Response: Prompts for net weight and karat again (loses Turn 1 details).
  3. Send `"Change the plan to Bullet."` -> Response: Generic greeting; does not recalculate quote or inform user of updated eligible loan.
  4. Send `"Actually, my net weight is 42 grams."` -> Response: Generic greeting; leaves draft at 45g.
* **Expected Behavior**:
  - Agent extracts partial weights, asks focused clarification questions, preserves previously provided information across turns, applies corrections, and recomputes quotes.
* **Actual Behavior**:
  - `MockGeminiAgent` uses rigid single-turn regexes that require both "net" and "gross" in the exact same turn. Multi-turn corrections fall through to the default greeting.
* **Reproduction Frequency**: 100%.
* **Evidence**:
  - Vitest reproduction run output in `reproduce-agent.test.ts`.
* **Root Cause (Confirmed)**:
  - `MockGeminiAgent` does not inspect session draft or previous message history, lacking stateful multi-turn recovery.
* **Planned Regression Test**:
  - Comprehensive conversational evaluation suite in `tests/eval/agent-conversations.eval.test.ts` covering natural language inputs, multi-turn corrections, and plan changes.

---

## 4. Verification of Correct Functionality (Non-Defects)

The following areas were independently verified to function strictly in accordance with requirements:
* **Financial Formulas**: $45 \times (22/24) \times 7000 \times 0.75 = ₹216,562$; $45 \times (22/24) \times 7000 \times 0.70 = ₹202,125$; $10 \times (18/24) \times 7000 \times 0.75 = ₹39,375$. Matches all 3 reference cases across server math, API, and UI.
* **Server Recalculation Authority**: Malicious client values (`eligibleLoanRupees: 9999999`) in `POST /api/v1/leads` are completely ignored and recomputed server-side.
* **PostgreSQL Sequence IDs**: Generates sequential IDs `GL-1001`, `GL-1002` from database sequence `lead_application_id_seq`.
* **Mobile Masking & Privacy**: Admin list strictly masks numbers as `9876XXXX10`; raw numbers never leaked in admin API or DOM.
* **7-Day De-duplication**: Re-applying with same mobile within 7 days returns HTTP 409 Conflict with existing application ID; re-application after 8 days succeeds with HTTP 201.
* **Advisory Lock Concurrency**: Simultaneous requests for same mobile serialize via `pg_advisory_xact_lock(hashtext(mobile))`, returning 1x 201 and 1x 409.

---

## 5. Recommended Repair Order for Stage C

To ensure safety, data integrity, and stable regression gating:

1. **Phase C1 (API & Error Handling)**:
   - Fix `BUG-02`: Handle `SyntaxError` in `error.middleware.ts` to return HTTP 400 `MALFORMED_JSON`.
2. **Phase C2 (UI Flickering & State Persistence)**:
   - Fix `BUG-05`: Memoize `useDebounce` inputs in `Step2LiveQuote.tsx`.
   - Fix `BUG-06`: Pass pre-loaded `schemes` from `App.tsx` into `Step2LiveQuote.tsx` to eliminate skeleton flash and duplicate API call.
   - Fix `BUG-07`: Pass initial quotes map from `App.tsx` into `Step2LiveQuote.tsx` to eliminate rewind flash.
   - Fix `BUG-04`: Retain `<AgentChatPanel />` state across tab navigation in `App.tsx`.
3. **Phase C3 (Live Quote Validation & Concurrency Safety)**:
   - Fix `BUG-01`: Clear quotes, display inline error, and disable button when inputs are invalid in `Step2LiveQuote.tsx`.
   - Fix `BUG-08`: Integrate `AbortController` in `api.getQuote()` and `Step2LiveQuote.tsx`.
4. **Phase C4 (AI Agent State & Confirmation Security)**:
   - Fix `BUG-03`: Extract weights/karat in `agent.controller.ts` and invalidate confirmation on modifications.
   - Fix `BUG-09`: Upgrade `MockGeminiAgent` to accumulate session context across multi-turn messages, handle natural queries, corrections, and plan switches.
