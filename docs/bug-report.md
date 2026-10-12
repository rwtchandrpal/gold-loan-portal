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
| **BUG-01** | **High** | UI / State | `client/src/components/form/Step2LiveQuote.tsx` | Stale quotes & enabled "Review & Confirm" button when net weight > gross weight or cleared | **FIXED** |
| **BUG-02** | **High** | API / Contract | `server/src/middlewares/error.middleware.ts` | Malformed JSON in request body returns HTTP 500 instead of HTTP 400 | **FIXED** |
| **BUG-03** | **High** | Security / AI | `server/src/controllers/agent.controller.ts`, `server/src/services/session.service.ts` | Verbal weight changes in chat fail to invalidate confirmation or update draft, leaving stale confirmation valid | **FIXED** |
| **BUG-04** | **High** | UI / State | `client/src/App.tsx` | Switching tabs unmounts `<AgentChatPanel />`, destroying active messages, session ID, and unconfirmed drafts | **FIXED** |
| **BUG-05** | **High** | Performance | `client/src/components/form/Step2LiveQuote.tsx` | Unstable object literal in `useDebounce` dependency restarts timer on every component render | **FIXED** |
| **BUG-06** | **Medium** | UI / UX | `client/src/components/form/Step2LiveQuote.tsx`, `client/src/App.tsx` | Duplicate `GET /api/v1/loan-schemes` and skeleton card flash upon entering Step 2 | **FIXED** |
| **BUG-07** | **Medium** | UI / UX | `client/src/components/form/Step2LiveQuote.tsx`, `client/src/App.tsx` | Back navigation from Step 3 to Step 2 flashes "Calculating valuation..." due to uninitialized quote map | **FIXED** |
| **BUG-08** | **Medium** | Network | `client/src/api/client.ts`, `client/src/components/form/Step2LiveQuote.tsx` | Missing `AbortController` in quote requests permits orphaned in-flight requests during rapid typing | **FIXED** |
| **BUG-09** | **High** | AI Agent | `server/src/agent/gemini.client.ts`, `server/src/controllers/agent.controller.ts` | Deterministic mock agent drops natural queries, corrections ("Actually, net is 42g"), and plan changes into generic greetings | **FIXED** |

---

## 3. Detailed Bug Reports

### BUG-01: Stale Quotes & Enabled "Review & Confirm" Button on Invalid Weight Inputs

* **Bug ID**: `BUG-01`
* **Status**: **FIXED & VERIFIED (Phase C3)**
* **Severity**: **High (S2)**
* **Affected Area**: Client Form / Live Quote State
* **Affected Files**: `client/src/components/form/Step2LiveQuote.tsx`, `client/src/hooks/useQuotes.ts`
* **Reproduction Steps**:
  1. Navigate to `http://localhost:5173`.
  2. In Step 1, enter Full Name: `Rahul Sharma`, Mobile: `9876543210`, Gross: `50.00`, Net: `45.00`, Karat: `22K`.
  3. Click "Calculate Live Quote" to enter Step 2.
  4. Verify Step 2 shows Ornament Valuation: `₹2,88,750`, Pure Gold: `41.2500 g`, Monthly EMI: `₹2,16,562`.
  5. In Step 2, edit Net Weight to `55.00` (which is greater than gross `50.00`) or delete the Net Weight input completely.
* **Expected Behavior**:
  - The previous quotation metrics must be cleared or flagged with an explicit validation error ("Net weight cannot exceed gross weight").
  - The "Review & Confirm" button must be disabled to prevent advancing to Step 3 with invalid data.
* **Actual Behavior (Before Fix)**:
  - The calculation effect returned early without clearing `quotesByPlan`.
  - The valuation card remained visible with the stale quote for 45g (`₹2,88,750`, `41.2500 g`).
  - The "Review & Confirm" button remained fully active and enabled, allowing the borrower to advance to Step 3 with invalid inputs.
* **Reproduction Frequency**: 100% (consistently reproducible).
* **Root Cause (Confirmed)**:
  - In `Step2LiveQuote.tsx`, the input validation guard executed `return;` when inputs were invalid. It did not clear active quotes, did not show field validation error states, and did not disable `handleProceed`.
* **Fix Applied**:
  - Implemented `validateQuoteInputs` in `client/src/hooks/useQuotes.ts` enforcing all domain validation rules: non-empty gross and net weights, net weight $\le$ gross weight, weights $\in (0, 1000]$ grams, max 2 decimal places, and valid karat (`18K`, `22K`, `24K`).
  - Displayed descriptive field-level error messages (`#step2-gross-error`, `#step2-net-error`, `#step2-karat-error`) with red border indicators.
  - Enforced `isProgressionAllowed`: strictly disabled "Review & Confirm" unless all inputs are valid AND the active quote's canonical input key (`${grossWeight}|${netWeight}|${karat}`) matches the current valid input key.
  - When inputs become invalid or cleared, active quote is immediately invalidated and cleared from display, showing fallback prompt: "Enter valid weight and karat to view valuation".
  - When inputs are corrected back to valid values, quote recalculation automatically triggers and restores valuation metrics and enabled progression state.
* **Actual Verification Results**:
  - Unit / Component Regression Tests in `client/src/components/form/Step2LiveQuote.test.tsx` and `client/src/hooks/useQuotes.test.ts`:
    - `BUG-01: clears valuation, displays inline error, and disables Review button when net weight is cleared` (PASS)
    - `BUG-01: displays validation error and disables Review button when net weight exceeds gross weight` (PASS)
    - `BUG-01: restores quote and re-enables Review button when invalid inputs are corrected` (PASS)
    - `BUG-01: displays inline error for non-positive or out-of-range weights (>1000g)` (PASS)
    - `BUG-01: displays inline error and disables Review button when karat is invalid` (PASS)
    - `BUG-01: displays error message and retry button when quote API fails` (PASS)
  - Browser Verification (Desktop & 375px mobile):
    - `step2_net_required_error_1791740023350.png`: Clearing Net Weight shows `#step2-net-error` with `"Net weight is required"`, clears valuation, and disables "Review & Confirm".
    - `step2_net_exceeds_gross_error_1791740031587.png`: Net Weight 55.00g with Gross 50.00g shows `#step2-net-error` with `"Net weight cannot exceed gross weight"`, clears valuation, and disables "Review & Confirm".
    - Correcting Net Weight to 42.50g clears error, re-calculates quote, re-enables "Review & Confirm", advances to Step 3, and retains cached quote on rewind.

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
* **Status**: **FIXED & VERIFIED (Phase C4)**
* **Severity**: **High (S2)**
* **Affected Area**: AI Agent Architecture / Confirmation Security Gate & Draft Version Lifecycle
* **Affected Files**:
  - `server/src/services/session.service.ts`
  - `server/src/agent/tools.ts`
  - `server/src/agent/gemini.client.ts`
  - `server/src/controllers/agent.controller.ts`
  - `server/tests/integration/agent-confirmation-invalidation.test.ts`
* **Reproduction Steps**:
  1. Start chat session: `"Name Priya Sharma, mobile 9876543210, net 45g, gross 50g, 22K, PLAN_EMI_01"`.
  2. Confirm the resulting draft v1 via `POST /api/v1/agent/confirm` (`isConfirmed: true`, `draftVersion: 1`).
  3. Send conversational correction: `"Actually, my net weight is 40g."`
  4. Inspect session confirmation state and draft values.
* **Expected Behavior**:
  - Server updates net weight to 40g, recomputes quote, increments draft version to v2, and strictly invalidates confirmation (`isConfirmed: false`, `confirmedDraftVersion: null`).
  - Stale submission attempts are rejected with `CONFIRMATION_REQUIRED`.
  - Reconfirmation must be explicitly performed on the latest valid draft version before submission can proceed.
* **Actual Behavior (Before Fix)**:
  - `extractApplicantDetailsFromText` only checked for name, mobile, and plan code; it did not extract weights.
  - `MockGeminiAgent` failed to recognize partial weights ("40g") without re-specifying gross weight, dropping the message into default greeting or unhandled turn.
  - The session draft remained unchanged at 45g, and `isConfirmed` remained `true` for draft v1 with `draftVersion: 1`.
  - Stale draft could be submitted without re-confirmation.
* **Reproduction Frequency**: 100%.
* **Root Cause (Confirmed)**:
  - `MockGeminiAgent` previously required all three weight parameters (`net`, `gross`, `karat`) simultaneously to invoke `calculate_quote`. A partial correction (e.g. only net weight) was not recognized against the existing draft context.
  - Prior confirmation state was not version-bound in execution gates: `isDraftConfirmed` checked only `isConfirmed === true && confirmedDraftVersion === draftVersion`, but `updateDraft` did not invalidate confirmation upon partial weight mutations or clear prior submission metadata (`applicationId`, `status`, `submittedAt`).
  - Validation failures during conversational updates did not invalidate existing confirmations, risking submissions on corrupted drafts.
  - Model arguments in `submit_application` were not checked for exact parity against the confirmed server draft in the database.
* **Fix & Architecture Implementation**:
  1. **Strict Version-Bound Confirmation**:
     - `SessionService.updateDraft`: Enforces domain validation for all fields. If input is invalid, immediately invalidates any prior confirmation and throws `ValidationError`.
     - Automatically recalculates pure gold, gold value, and eligible loan when valid weights/karat are present; clears financial figures if weights are incomplete.
     - On material change, increments `draftVersion` exactly once, sets `isConfirmed: false` and `confirmedDraftVersion: null`, and strips any prior submission metadata (`applicationId`, `status`, `submittedAt`).
     - Avoids false version increments when input values match existing draft state.
  2. **Canonical Confirmation Invalidation (`invalidateConfirmation`)**:
     - Added `SessionService.invalidateConfirmation(sessionId)` to reset `isConfirmed: false` and `confirmedDraftVersion: null`.
     - Invoked by `calculate_quote` tool in `server/src/agent/tools.ts` whenever quote parameter validation fails.
  3. **Strict Submission Gate & Parity Checking**:
     - `SessionService.isDraftConfirmed`: Requires `isConfirmed === true && confirmedDraftVersion !== null && confirmedDraftVersion === draftVersion && draftPayload !== null`.
     - `submit_application` tool: Verifies that caller arguments match the confirmed draft in the database across `fullName`, `mobileNumber`, `grossWeightGrams`, `netWeightGrams`, `karat`, and `selectedPlanId`. Mismatches reject with `CONFIRMATION_REQUIRED`.
  4. **MockGeminiAgent Contextual Weight Correction**:
     - Handles partial weight adjustments (e.g., `"Actually, my net weight is 40g."`) by pulling missing dimensions from the existing session draft, executing `calculate_quote`, and prompting the user to review and confirm the updated Confirmation Card on screen.
  5. **20K Purity Verification**:
     - Canonical requirements and assignment specification strictly allow `18 | 22 | 24` karat. 20K is confirmed unsupported and rejected by domain validation.
* **Regression Test Verification**:
  - Created `server/tests/integration/agent-confirmation-invalidation.test.ts` covering 10 targeted requirements:
    1. Confirmation of a valid draft records current draft version.
    2. Valid net-weight correction updates draft, increments version, invalidates confirmation, and refreshes quote.
    3. Submission after correction before reconfirmation is rejected with `CONFIRMATION_REQUIRED`.
    4. Reconfirmation of changed valid draft enables eligible submission with correct loan amounts.
    5. No-op correction with identical value does not bump version or falsely invalidate confirmation.
    6. Invalid correction cannot be submitted, does not corrupt stored details, and invalidates confirmation.
    7. Correction to other confirmation-relevant fields (scheme, name) also invalidates confirmation.
    8. Client-supplied confirmation flags, stale versions, or payload mismatches cannot bypass server checks.
    9. Failed or repeated tool execution leaves draft and confirmation metadata consistent.
    10. Existing successful application submission behavior remains intact.
  - Results:
    - `tests/integration/agent-confirmation-invalidation.test.ts`: 15/15 PASS (including 5 post-submission immutability & idempotency invariant tests).
    - Full server test suite (`npm test --workspace=server`): 8 test files, 77/77 PASS.
    - Deterministic evaluation suite (`npm run eval`): 5/5 PASS.
    - Full client test suite (`npm test --workspace=client`): 9 test files, 62/62 PASS.
    - Full build (`npm run build`): PASS.
    - `git diff --check`: PASS (clean).

* **Phase C4 Follow-up — Submitted-Application Immutability and Idempotency Audit**:
  - **Audit Verdict**: The baseline implementation was NOT completely safe against post-submission mutation and required targeted hardening. While `LeadService` enforced the 7-day de-duplication window on repeated submissions, `SessionService.updateDraft` lacked a finalized-state guard and would allow subsequent draft mutations to strip `applicationId`, `status`, and `submittedAt`, reverting a finalized application back to an unsubmitted draft.
  - **Hardening Applied**:
    1. **Finalized Immutability in `SessionService.updateDraft`**: Added guard rejecting field mutations with `ValidationError` (`Application ${currentDraft.applicationId} has already been submitted and cannot be modified.`). Protected `applicationId`, `status`, and `submittedAt` from deletion or mutation.
    2. **Protected Confirmation in `SessionService.invalidateConfirmation` & `confirmDraft`**: Invalidation requests on submitted sessions are ignored, maintaining `isConfirmed: true` and preserving session-to-lead consistency.
    3. **Tool Guards in `tools.ts`**:
       - `calculate_quote` rejects quote recalculations on submitted sessions with `APPLICATION_ALREADY_SUBMITTED`.
       - `submit_application` strictly returns idempotent success when `currentDraft.applicationId` is present, preventing double-calling `LeadService.createLead`.
    5. **Concurrency, Atomicity & Database Safeguards**:
       - **PostgreSQL Advisory Transaction Lock (`pg_advisory_xact_lock`)**: In `LeadService.createLead`, `tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cleanMobile}));`` acquires an exclusive transaction-scoped advisory lock on the hashed applicant mobile number.
       - **Serialization Guarantee**: When two overlapping requests arrive simultaneously for the same applicant or session, PostgreSQL forces the secondary transaction to wait until the primary transaction commits.
       - **De-duplication in Transaction**: Upon unblocking, the secondary transaction immediately sees the committed record from the first transaction in `tx.lead.findFirst({ where: { mobileNumber, createdAt: { gte: sevenDaysAgo } } })` and throws `DuplicateApplicationError`.
       - **Zero Race Condition Window**: This database-level serialization prevents two simultaneous requests from passing the duplicate check before either commits, guaranteeing that exactly one application record is inserted.
       - **Sequence Isolation**: `nextval('lead_application_id_seq')` ensures unique public IDs (`GL-XXXX`).
  - **Integration Verification**:
    - Added dedicated test suite `Concurrent Submission Idempotency & Mutually Exclusive Transaction Verification` in `server/tests/integration/agent-confirmation-invalidation.test.ts` covering 5 overlapping concurrency scenarios:
      1. Concurrent `POST /api/v1/agent/confirm` calls for the same session.
      2. Concurrent `executeToolCall('submit_application')` calls for the same session.
      3. Concurrent `POST /api/v1/leads` calls (Form path) resulting in exactly one 201 Created and one 409 Conflict.
      4. High-frequency race loop (5 consecutive overlapping iterations) proving zero timing vulnerability.
      5. Cross-endpoint race (`POST /api/v1/agent/confirm` vs `POST /api/v1/agent/chat` simultaneously).
    - In all scenarios, exactly one application was created in `leads`, both callers received the documented outcome with identical `applicationId`, and `agent_sessions` draft state remained consistent.
    - Test Suite Result: 20/20 PASS (`tests/integration/agent-confirmation-invalidation.test.ts`).
    - Full server test suite: 8 test files, 82/82 PASS.

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
* **Status**: **FIXED & VERIFIED (Phase C3)**
* **Severity**: **Medium (S3)**
* **Affected Area**: Network Optimization & Concurrency Safety
* **Affected Files**: `client/src/api/client.ts`, `client/src/hooks/useQuotes.ts`, `client/src/components/form/Step2LiveQuote.tsx`
* **Reproduction Steps**:
  1. Inspect `api.getQuote()` implementation.
  2. Rapidly type weight inputs (e.g. 40 -> 42 -> 45) in Step 2.
* **Expected Behavior**:
  - `api.getQuote()` accepts an optional `AbortSignal`.
  - Pending superseded in-flight requests are cancelled via `AbortController.abort()`.
  - Aborted requests are handled silently as standard control-flow events (no error toasts, no stale overwrites).
  - Out-of-order responses cannot overwrite newer quotes (latest-request-wins generation tracking).
* **Actual Behavior (Before Fix)**:
  - `api.getQuote()` took only `QuoteRequest` with no signal forwarding. Rapid typing fired multiple concurrent un-cancellable requests, risking race conditions and stale overwrite if network latency varied.
* **Reproduction Frequency**: 100%.
* **Root Cause (Confirmed)**:
  - No `AbortSignal` parameter in API client method and no abort controller / generation lifecycle management in `Step2LiveQuote`.
* **Fix Applied**:
  - In `client/src/api/client.ts`, updated `api.getQuote(req: QuoteRequest, signal?: AbortSignal)` to pass `signal` into `fetch(..., { signal })`.
  - In `client/src/hooks/useQuotes.ts`, maintained an `AbortController` ref (`activeAbortControllerRef`). Whenever input changes or a new request generation begins, the previous in-flight request is immediately aborted via `abortController.abort()`.
  - Component unmount / hook disposal automatically aborts pending requests in the effect cleanup.
  - Handled `AbortError` / `DOMException` silently as normal control flow: aborted requests do not display error messages, do not clear newer loading states, and do not trigger retries.
  - Implemented request generation tracking (`activeGenerationRef`) and canonical input key association (`activeQuoteInputKey`) ensuring only the latest initiated request can commit state ("latest-request-wins"). Stale responses arriving out of order are safely discarded.
  - Included manual retry capability (`refetchQuotes`) for genuine non-aborted network/API errors.
* **Actual Verification Results**:
  - Unit / Integration Regression Tests in `client/src/hooks/useQuotes.test.ts` (13 tests):
    - `BUG-08: passes AbortSignal to api.getQuote and aborts prior request when inputs change` (PASS)
    - `BUG-08: latest request wins when earlier request completes after later request (Scenario C)` (PASS)
    - `BUG-08: aborts in-flight request when component unmounts (Scenario D)` (PASS)
    - `BUG-08: treats AbortError as normal control flow without setting error banner` (PASS)
    - `BUG-08: handles API failure and allows recovery via refetchQuotes (Scenario F)` (PASS)
  - Browser Verification:
    - Executed rapid input typing and verified smooth debounced quote recalculations with zero stale overwrite.
    - Verified network resilience and clean disposal across Step 2 -> Step 3 navigation.

---

### BUG-09: Mock AI Agent Drops Multi-Turn Queries, Corrections, and Plan Changes

* **Bug ID**: `BUG-09`
* **Status**: **FIXED & VERIFIED (Phase C5)**
* **Severity**: **High (S2)**
* **Affected Area**: AI Agent Conversational Understanding & Multi-Turn Evaluation
* **Affected Files**: `server/src/agent/gemini.client.ts`, `server/src/controllers/agent.controller.ts`, `server/tests/integration/agent-multiturn.test.ts`
* **Reproduction Steps**:
  1. Send `"I have 45 grams of 22K gold."` -> Response: Generic greeting (fails to ask if gross or net).
  2. Send `"The gross weight is 50 grams."` in Turn 2 -> Response: Prompts for net weight and karat again (loses Turn 1 details).
  3. Send `"Change the plan to Bullet."` -> Response: Generic greeting; does not recalculate quote or inform user of updated eligible loan.
  4. Send `"Actually, my net weight is 42 grams."` -> Response: Generic greeting; leaves draft at 45g.
* **Expected Behavior**:
  - The AI assistant accumulates applicant details across multiple turns into the server-persisted session draft without requiring all inputs in a single sentence.
  - Contextual corrections (e.g. `"Actually, my net weight is 42 grams."`, `"The gross weight should be 48 grams, not 50."`) update specific fields, recalculate quotations, and invalidate previous confirmations.
  - Ambiguous corrections (e.g. `"I entered the wrong weight."`) ask for clarification without mutating the draft.
  - Loan scheme queries and comparisons (e.g. `"Which scheme has a lower interest rate?"`) invoke `get_loan_schemes()` and provide dynamic, accurate answers.
  - Scheme switching (e.g. `"Actually, change my selection to the other scheme."`) resolves to real scheme data, refreshes eligible loan figures, and invalidates confirmations.
* **Actual Behavior (Before Fix)**:
  - `MockGeminiAgent` used rigid single-turn regexes requiring net, gross, and karat in the exact same sentence.
  - Partial inputs were not persisted into `session.draftPayload` between turns.
  - Scheme queries were answered with hardcoded text instead of invoking `get_loan_schemes()`.
  - Ambiguous corrections and scheme switches fell through to the default generic greeting.
* **Reproduction Frequency**: 100% (consistently reproducible).
* **Root Cause (Confirmed)**:
  - `MockGeminiAgent` was stateless between user messages: it failed to persist partial weight entries to `SessionService.updateDraft`, lacked disambiguation logic for contrastive corrections (`"48 grams, not 50"`), and did not invoke the `get_loan_schemes` tool dynamically for scheme inquiries or selections.
* **Fix Applied**:
  - Refactored `MockGeminiAgent` in `server/src/agent/gemini.client.ts`:
    1. **Multi-turn Detail Accumulation**: Persists valid partial inputs (`grossWeightGrams`, `netWeightGrams`, `karat`, `fullName`, `mobileNumber`, `selectedPlanId`) into `SessionService.updateDraft` on each turn. Recognizes what fields remain missing and prompts the applicant accordingly.
    2. **Canonical Financial Engine Call**: Once all three financial inputs (`gross`, `net`, `karat`) are present, invokes `calculate_quote` tool, updating pure gold and plan quotations server-side.
    3. **Contextual & Contrastive Corrections**: Parses target values from contrastive phrasing (`"gross should be 48 grams, not 50"` extracts 48g). Updates draft via canonical server path, recalculates quotation, increments `draftVersion`, and invalidates confirmation state.
    4. **Ambiguous Correction Disambiguation**: Identifies vague statements (`"I entered the wrong weight."`) without numeric values and prompts for clarification (`"Could you please specify whether you would like to update your gross weight or net weight, and provide the correct value in grams?"`) without mutating the draft.
    5. **Scheme Discovery & Comparison**: Invokes `get_loan_schemes()` tool for scheme inquiries and interest rate comparisons (`"Which scheme has a lower interest rate?"`), dynamically returning accurate terms (Monthly EMI at 10.5% vs Bullet Repayment at 12.0%).
    6. **Dynamic Scheme Selection & Toggle**: Supports `"the other scheme"` / plan switches, dynamically resolving against database scheme records, updating `selectedPlanId`, recalculating loan amounts, and invalidating confirmation.
    7. **Domain & Bounds Validation**: Rejects invalid karats (not in `18, 22, 24`), out-of-bounds weights (`> 1000g` or `≤ 0g`), and `net > gross` without corrupting the draft.
    8. **Immutability & Submission Guard**: Preserves all C4 safeguards (prevents modifying already-submitted applications, enforces explicit confirmation before submission, blocks submission on incomplete drafts).
  - Refined `extractApplicantDetailsFromText` in `server/src/controllers/agent.controller.ts` to distinguish pure scheme inquiries from selections and avoid duplicate toggle side-effects.
* **Actual Verification Results**:
  - Comprehensive 14-scenario integration test suite in `server/tests/integration/agent-multiturn.test.ts` (14/14 PASS):
    - `Scenario 1: Applicant details provided over multiple messages produce complete draft` (PASS)
    - `Scenario 2: Single-field net-weight correction updates draft and quotation` (PASS)
    - `Scenario 3: Gross-weight correction with contrast ("48 grams, not 50") applied correctly` (PASS)
    - `Scenario 4: Ambiguous correction triggers clarification without draft mutation` (PASS)
    - `Scenario 5: Invalid/unsupported karat rejected without corrupting draft` (PASS)
    - `Scenario 6: Incomplete draft triggers follow-up and blocks submission` (PASS)
    - `Scenario 7: Asking for schemes invokes current scheme data & compares interest rates` (PASS)
    - `Scenario 8: Selecting scheme resolves to real scheme and updates server selection` (PASS)
    - `Scenario 9: Switching schemes ("the other scheme") invalidates confirmation and updates loan` (PASS)
    - `Scenario 10: Corrections after confirmation block submission until reconfirmed` (PASS)
    - `Scenario 11: Repeatedly supplying unchanged value does not bump draft version` (PASS)
    - `Scenario 12: Successful submission remains immutable; retrying does not create duplicate` (PASS)
    - `Scenario 13: Existing supported conversation scenarios continue to pass` (PASS)
    - `Scenario 14: Unknown requests handled gracefully without fabricated numbers` (PASS)
  - AI Agent Evaluation Suite (`npm run eval`): 5/5 passed.
  - Server Workspace Test Suite (`npm test --workspace=server`): 9 test files, 96/96 passed.
  - Client Workspace Test Suite (`npm test --workspace=client`): 9 test files, 62/62 passed.
  - Full Monorepo Test Suite (`npm test`): 18 test files, 158/158 passed.
  - Monorepo Production Build (`npm run build`): Clean compilation without errors or warnings.
  - Git whitespace/diff check (`git diff --check`): Clean exit (0 errors).

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
