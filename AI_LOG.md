# AI Development & Tooling Log (`AI_LOG.md`)

This log documents the AI development methodology, developer tools, exact prompts, and a genuine technical mistake encountered and resolved during the construction of the Gold Loan Portal.

---

## 1. Tools & Environment Used

* **AI Coding Agent**: Google Antigravity Agentic IDE (DeepMind advanced agentic coding architecture).
* **AI Model & SDK**: Google Gemini 2.5 Flash via the official `@google/genai` SDK on Node.js/TypeScript.
* **Testing Frameworks**: Vitest 3.2.7, Supertest 7.0.0, React Testing Library, JSDOM.
* **Database & ORM**: Native PostgreSQL 18.6 on Windows with Prisma ORM 7 (`@prisma/adapter-pg`).
* **Frontend**: React 18, Vite 6, TypeScript, Tailwind CSS v4.
* **Browser Automation**: Antigravity headless browser subagent for real-browser user interaction and visual regression verification.

---

## 2. Two Exact Prompts Used During Development

### Exact Prompt 1: Phase 2 Financial Calculation Engine
```text
Implement Phase 2: the pure gold-loan financial calculation engine and unit tests.

Use the existing database models, constants, and project architecture. Do not implement HTTP controllers, lead creation, frontend features, or LLM integration in this phase.

Implement a calculation service using precise decimal arithmetic.

The assignment defines:
- pureGoldGrams = netWeightGrams * (karat / 24)
- goldValue = pureGoldGrams * 7000
- eligibleLoanRupees = floor(goldValue * min(plan.maxLtv, 0.75))

Seeded plans:
- PLAN_BULLET_01: 70% LTV.
- PLAN_EMI_01: 75% LTV.

Requirements:
1. Use a precise decimal library or equivalent arithmetic; do not use binary floating-point values as the financial source of truth.
2. Keep sufficient precision for intermediate pure-gold grams and gold value.
3. Calculate the loan using the unrounded gold value and floor it to whole rupees.
4. Convert the final whole-rupee loan to integer paise only after flooring.
5. Define a documented, precise policy for gold value storage rounding to whole paise.
6. Verify reference test cases 1, 2, and 3 from page 4 of the assignment.
```

### Exact Prompt 2: Phase 6 React AI Chat & Confirmation Architecture
```text
Implement Phase 6: connect the React chat interface to the existing Gemini backend agent.

Create the chat panel, message bubbles, loading states, tool-status indicators where practical, and the Confirmation Card.

Requirements:
- The user can ask questions conversationally and provide missing details over multiple messages.
- The UI sends messages to POST /api/v1/agent/chat.
- The UI displays the server-authoritative pending application summary, not a summary reconstructed from untrusted model prose.
- The Confirmation Card includes applicant details, weights, karat, selected plan, loan offer, session ID, and draft version as appropriate.
- The `Confirm & Submit` button sends the required confirmation request for the displayed draft version.
- The backend verifies that the confirmed draft matches the current pending application.
- Ensure the confirmed-draft submission path is deterministic: do not rely on the LLM spontaneously deciding to call the submission tool after a confirmation event.
- A submission must still use the guarded submission handler and shared lead service.
- Changes to application details invalidate the old confirmation and update the card.
- Display the application ID, duplicate error, and other failures clearly.

Test successful submission, missing information, invalid weights, duplicate handling, cancellation or changed details, and attempts to bypass confirmation.

Confirm that the form and AI flows create equivalent lead records for equivalent inputs.

Run tests and build. Report actual outcomes and stop after this phase.
```

---

## 3. Genuine AI Mistake & The Automated Test That Catches It

### Description of the Mistake
During the implementation of Phase 6 in [`server/src/agent/tools.ts`](file:///d:/projects/gldportal/server/src/agent/tools.ts), the tool handler for `submit_application` was initially designed to ingest any caller parameters into the draft session prior to verifying the confirmation gate:

```typescript
// INITIALLY ERRONEOUS CODE in submit_application:
case 'submit_application': {
  // Ingest caller arguments into draft
  if (rawArgs && typeof rawArgs === 'object') {
    ...
    await SessionService.updateDraft(sessionId, candidateUpdate); // BUG!
  }

  // Check confirmation gate
  const isConfirmed = await SessionService.isDraftConfirmed(sessionId);
  if (!isConfirmed) {
    return { success: false, error: 'CONFIRMATION_REQUIRED', ... };
  }
  ...
}
```

However, under the security rules in [`server/src/services/session.service.ts`](file:///d:/projects/gldportal/server/src/services/session.service.ts), `SessionService.updateDraft` intentionally invalidates prior confirmation (`isConfirmed = false`) whenever draft fields change on an already confirmed session to prevent tampering.

Because `updateDraft` was invoked unconditionally inside `submit_application` before evaluating `isDraftConfirmed`, calling `submit_application` immediately wiped out the valid confirmation state that the user had just established via `POST /api/v1/agent/confirm`. The tool then checked `isConfirmed`, saw `false`, and aborted with an unexpected `CONFIRMATION_REQUIRED` error!

### The Test That Catches the Bug
This regression was caught by two automated test suites:
1. [`server/tests/eval/agent-conversations.eval.test.ts`](file:///d:/projects/gldportal/server/tests/eval/agent-conversations.eval.test.ts) (`Evaluation 4 (7-Day Duplicate)`):
   ```typescript
   // Confirm
   await request(app)
     .post('/api/v1/agent/confirm')
     .send({ sessionId, draftVersion });

   // Submit
   const chat2 = await request(app)
     .post('/api/v1/agent/chat')
     .send({ sessionId, message: 'Please submit.' });

   expect(chat2.body.reply).toMatch(/already applied within the last 7 days/i);
   ```
   **Failure Output**:
   ```text
   AssertionError: expected 'Application submission cannot proceed without your confirmation. Please review the details on the Confirmation Card...' to match /already applied within the last 7 days/i
   ```
2. [`server/tests/integration/agent-api.test.ts`](file:///d:/projects/gldportal/server/tests/integration/agent-api.test.ts) (`explains friendly duplicate message when applicant reapplies within 7 days`).

### The Resolution
In [`server/src/agent/tools.ts`](file:///d:/projects/gldportal/server/src/agent/tools.ts), the confirmation check was reordered to execute **first**:
- If `isDraftConfirmed(sessionId)` is `true`, no draft update is permitted, preserving the confirmed state and proceeding directly to lead submission.
- If `isDraftConfirmed(sessionId)` is `false`, caller parameters are safely ingested into the unconfirmed draft so the user can inspect them on the UI Confirmation Card before submitting.

---

## 4. Distinction Between Test Environments

| Test Category | Execution Mechanism | Description | Status |
|---|---|---|---|
| **Unit & Integration Tests** | `npm test` / Vitest + Supertest | 158 tests (96 server, 62 client across 18 test files) covering financial mathematics, Zod schemas, 400/404/409 error contracts, PostgreSQL sequence IDs, advisory lock concurrency, confirmation invalidation, and React components | **158 Passed (100%)** |
| **Mocked AI Eval Suite** | `npm run eval` | 5 multi-turn evaluation conversations executing deterministically against `MockGeminiAgent` covering happy path, missing fields, net > gross, 7-day duplicates, and off-topic requests | **5 Passed (100%)** |
| **Live Gemini API Smoke & Chat** | `npx tsx src/scripts/smoke-gemini.ts` + Chrome Browser Subagent | Real API calls using official `@google/genai` SDK with `GEMINI_API_KEY`. Verified model tool calls (`calculate_quote`, `submit_application`), mobile masking in server logs, and live end-to-end browser submission | **Verified Live** |
| **Live API Rate Limit Constraint** | Free-tier quota (20 req/day) | When the Google Gemini API free-tier quota is reached (`RESOURCE_EXHAUSTED` 429), the application gracefully falls back to deterministic handling while alerting the developer in logs | **Documented** |
