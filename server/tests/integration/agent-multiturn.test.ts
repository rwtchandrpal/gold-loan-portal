import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import { SessionService } from '../../src/services/session.service.js';

describe('BUG-09: Stateful, Context-Aware AI Agent Multi-Turn & Scheme Handling', () => {
  const TEST_PREFIX = '98999';
  const createdLeadIds: string[] = [];

  beforeAll(async () => {
    await prisma.lead.deleteMany({
      where: { mobileNumber: { startsWith: TEST_PREFIX } },
    });
  });

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
    }
    await prisma.lead.deleteMany({
      where: { mobileNumber: { startsWith: TEST_PREFIX } },
    });
  });

  // Scenario 1: Multi-turn detail collection
  it('Scenario 1: Applicant details provided over multiple messages produce a complete, valid draft without losing earlier fields', async () => {
    const testMobile = `${TEST_PREFIX}00001`;

    // Turn 1: "I want a gold loan."
    const turn1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ message: 'I want a gold loan.' });
    expect(turn1.status).toBe(200);
    const sessionId = turn1.body.sessionId;
    expect(sessionId).toBeDefined();

    // Turn 2: "The gross weight is 50 grams."
    const turn2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'The gross weight is 50 grams.' });
    expect(turn2.status).toBe(200);
    expect(turn2.body.draft.grossWeightGrams).toBe(50);
    expect(turn2.body.reply.toLowerCase()).toMatch(/net.*weight/);

    // Turn 3: "Net weight is 45 grams."
    const turn3 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Net weight is 45 grams.' });
    expect(turn3.status).toBe(200);
    expect(turn3.body.draft.grossWeightGrams).toBe(50); // Preserved from Turn 2!
    expect(turn3.body.draft.netWeightGrams).toBe(45);
    expect(turn3.body.reply.toLowerCase()).toMatch(/karat/);

    // Turn 4: "It is 22 karat."
    const turn4 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'It is 22 karat.' });
    expect(turn4.status).toBe(200);
    expect(turn4.body.draft.grossWeightGrams).toBe(50);
    expect(turn4.body.draft.netWeightGrams).toBe(45);
    expect(turn4.body.draft.karat).toBe(22);
    expect(turn4.body.draft.pureGoldGrams).toBe(41.25);
    expect(turn4.body.draft.goldValueRupees).toBe(288750);

    // Turn 5: "My name is Rajesh Patel."
    const turn5 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'My name is Rajesh Patel.' });
    expect(turn5.status).toBe(200);
    expect(turn5.body.draft.fullName).toBe('Rajesh Patel');
    expect(turn5.body.draft.grossWeightGrams).toBe(50);
    expect(turn5.body.draft.netWeightGrams).toBe(45);

    // Turn 6: "Mobile number is 9899900001."
    const turn6 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: `Mobile number is ${testMobile}.` });
    expect(turn6.status).toBe(200);
    expect(turn6.body.draft.mobileNumber).toBe(testMobile);

    // Turn 7: "I prefer Monthly EMI."
    const turn7 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'I prefer Monthly EMI.' });
    expect(turn7.status).toBe(200);
    expect(turn7.body.draft.selectedPlanId).toBe('PLAN_EMI_01');
    expect(turn7.body.draft.eligibleLoanRupees).toBe(216562);

    // Verify persisted session in database has all fields
    const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    const draftInDb = sessionInDb?.draftPayload as any;
    expect(draftInDb.fullName).toBe('Rajesh Patel');
    expect(draftInDb.mobileNumber).toBe(testMobile);
    expect(draftInDb.grossWeightGrams).toBe(50);
    expect(draftInDb.netWeightGrams).toBe(45);
    expect(draftInDb.karat).toBe(22);
    expect(draftInDb.pureGoldGrams).toBe(41.25);
    expect(draftInDb.goldValueRupees).toBe(288750);
    expect(draftInDb.selectedPlanId).toBe('PLAN_EMI_01');
    expect(draftInDb.eligibleLoanRupees).toBe(216562);
  });

  // Scenario 2: Single-field net-weight correction
  it('Scenario 2: A single-field net-weight correction updates the existing draft and quotation', async () => {
    const testMobile = `${TEST_PREFIX}00002`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Anita Roy, mobile ${testMobile}. Net 45g, gross 50g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;

    // Confirm draft v1 prior to submission
    await SessionService.confirmDraft(sessionId, v1);

    // Send single-field net weight correction: "Actually, my net weight is 42 grams."
    const corrRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 42 grams.' });

    expect(corrRes.status).toBe(200);
    expect(corrRes.body.draft.netWeightGrams).toBe(42);
    expect(corrRes.body.draft.grossWeightGrams).toBe(50); // Preserved!
    expect(corrRes.body.draft.karat).toBe(22); // Preserved!
    expect(corrRes.body.draft.pureGoldGrams).toBe(38.5);
    expect(corrRes.body.draft.goldValueRupees).toBe(269500);
    expect(corrRes.body.draft.eligibleLoanRupees).toBe(202125);
    expect(corrRes.body.isConfirmed).toBe(false); // Invalidation!
    expect(corrRes.body.draftVersion).toBe(v1 + 1);
  });

  // Scenario 3: Gross-weight correction with negated value
  it('Scenario 3: A gross-weight correction with contrast ("48 grams, not 50") is applied to the correct field', async () => {
    const testMobile = `${TEST_PREFIX}00003`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Sanjay Verma, mobile ${testMobile}. Net 42g, gross 50g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;

    // Correction with contrast: "The gross weight should be 48 grams, not 50."
    const corrRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'The gross weight should be 48 grams, not 50.' });

    expect(corrRes.status).toBe(200);
    expect(corrRes.body.draft.grossWeightGrams).toBe(48); // Not 50!
    expect(corrRes.body.draft.netWeightGrams).toBe(42); // Preserved!
    expect(corrRes.body.reply).toMatch(/gross weight 48g/i);
  });

  // Scenario 4: Ambiguous correction triggers clarification
  it('Scenario 4: An ambiguous correction triggers clarification rather than an incorrect mutation', async () => {
    const testMobile = `${TEST_PREFIX}00004`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Meera Bai, mobile ${testMobile}. Net 42g, gross 48g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;

    // Ambiguous correction: "I entered the wrong weight."
    const ambigRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'I entered the wrong weight.' });

    expect(ambigRes.status).toBe(200);
    expect(ambigRes.body.reply).toMatch(/specify whether you would like to update your gross weight or net weight/i);
    // Draft version must NOT increment and draft weights must NOT mutate
    expect(ambigRes.body.draftVersion).toBe(v1);
    expect(ambigRes.body.draft.grossWeightGrams).toBe(48);
    expect(ambigRes.body.draft.netWeightGrams).toBe(42);
  });

  // Scenario 5: Invalid/unsupported karat input rejected without corrupting draft
  it('Scenario 5: Invalid or unsupported karat input is rejected without corrupting the draft', async () => {
    const testMobile = `${TEST_PREFIX}00005`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Deepa Das, mobile ${testMobile}. Net 42g, gross 48g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;

    // Confirm draft
    await SessionService.confirmDraft(sessionId, v1);

    // Invalid karat: "Actually it is 20 karat."
    const badKaratRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually it is 20 karat.' });

    expect(badKaratRes.status).toBe(200);
    expect(badKaratRes.body.reply).toMatch(/validation error.*karat must be one of: 18, 22, or 24/i);
    // Confirmation invalidated per C4
    expect(badKaratRes.body.isConfirmed).toBe(false);
    // Draft karat is NOT corrupted to 20!
    expect(badKaratRes.body.draft.karat).toBe(22);
  });

  // Scenario 6: Incomplete draft triggers follow-up and blocks submission
  it('Scenario 6: An incomplete draft triggers a relevant follow-up question and cannot be submitted', async () => {
    // Only gross weight provided
    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ message: 'The gross weight is 50 grams.' });
    const sessionId = initRes.body.sessionId;

    // Attempt to submit incomplete draft
    const submitRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Please submit my application.' });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.reply).toMatch(/application details are incomplete/i);
    expect(submitRes.body.reply).toMatch(/net weight/i);
    // submit_application tool must not have been executed
    const submitTool = submitRes.body.toolCallsExecuted.find((t: any) => t.name === 'submit_application');
    expect(submitTool).toBeUndefined();
  });

  // Scenario 7: Scheme queries invoke current scheme data
  it('Scenario 7: Asking for schemes invokes current scheme data and returns accurate information and interest comparisons', async () => {
    // General scheme query
    const res1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ message: 'What loan schemes are available?' });

    expect(res1.status).toBe(200);
    const toolCall1 = res1.body.toolCallsExecuted.find((t: any) => t.name === 'get_loan_schemes');
    expect(toolCall1).toBeDefined();
    expect(res1.body.reply).toMatch(/Bullet Repayment.*12.*%.*70.*%/i);
    expect(res1.body.reply).toMatch(/Monthly EMI.*10.5.*%.*75.*%/i);

    // Interest rate comparison query: "Which scheme has a lower interest rate?"
    const res2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ message: 'Which scheme has a lower interest rate?' });

    expect(res2.status).toBe(200);
    const toolCall2 = res2.body.toolCallsExecuted.find((t: any) => t.name === 'get_loan_schemes');
    expect(toolCall2).toBeDefined();
    expect(res2.body.reply).toMatch(/Monthly EMI.*PLAN_EMI_01.*lower interest rate.*10.5%/i);
  });

  // Scenario 8: Selecting a scheme resolves to real scheme
  it('Scenario 8: Selecting a scheme resolves to a real scheme and updates server-side selection', async () => {
    const res = await request(app)
      .post('/api/v1/agent/chat')
      .send({ message: 'I want the bullet repayment plan.' });

    expect(res.status).toBe(200);
    expect(res.body.draft.selectedPlanId).toBe('PLAN_BULLET_01');
    expect(res.body.reply).toMatch(/Bullet Repayment.*PLAN_BULLET_01/i);
    const toolCall = res.body.toolCallsExecuted.find((t: any) => t.name === 'get_loan_schemes');
    expect(toolCall).toBeDefined();
  });

  // Scenario 9: Switching schemes invalidates confirmation
  it('Scenario 9: Switching schemes ("the other scheme") invalidates confirmation and updates loan calculation', async () => {
    const testMobile = `${TEST_PREFIX}00009`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Rakesh Singh, mobile ${testMobile}. Net 45g, gross 50g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;
    expect(initRes.body.draft.eligibleLoanRupees).toBe(216562); // 75% LTV

    // Confirm draft v1
    await SessionService.confirmDraft(sessionId, v1);

    // Switch scheme: "Actually, change my selection to the other scheme."
    const switchRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, change my selection to the other scheme.' });

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.draft.selectedPlanId).toBe('PLAN_BULLET_01');
    // Loan for Bullet (70% LTV): 288,750 * 0.70 = 202,125
    expect(switchRes.body.draft.eligibleLoanRupees).toBe(202125);
    expect(switchRes.body.isConfirmed).toBe(false);
    expect(switchRes.body.draftVersion).toBe(v1 + 1);
  });

  // Scenario 10: Corrections after confirmation block submission until reconfirmed
  it('Scenario 10: Corrections after confirmation retain C4 behavior: submission blocked until reconfirmed', async () => {
    const testMobile = `${TEST_PREFIX}00010`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Tarun Paul, mobile ${testMobile}. Net 45g, gross 50g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;

    // Confirm
    await SessionService.confirmDraft(sessionId, v1);

    // Send correction
    const corrRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 40 grams.' });
    const v2 = corrRes.body.draftVersion;
    expect(corrRes.body.isConfirmed).toBe(false);

    // Attempt submit prior to re-confirmation MUST be rejected
    const submitAttempt1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Please submit my application.' });
    expect(submitAttempt1.status).toBe(200);
    expect(submitAttempt1.body.reply).toMatch(/cannot proceed without your confirmation|confirm & submit/i);

    // Reconfirm v2
    await SessionService.confirmDraft(sessionId, v2);

    // Submit now succeeds
    const submitAttempt2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Please submit my application now.' });
    expect(submitAttempt2.status).toBe(200);
    expect(submitAttempt2.body.reply).toMatch(/submitted successfully.*GL-\d{4,}/i);

    const match = submitAttempt2.body.reply.match(/GL-\d{4,}/);
    if (match) createdLeadIds.push(match[0]);
  });

  // Scenario 11: Repeatedly supplying unchanged value does not increment version
  it('Scenario 11: Repeatedly supplying an unchanged value does not increment the draft version unnecessarily', async () => {
    const testMobile = `${TEST_PREFIX}00011`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Leela Nair, mobile ${testMobile}. Net 45g, gross 50g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;

    // Re-state exact same net weight: "Actually, my net weight is 45 grams."
    const sameRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 45 grams.' });

    expect(sameRes.status).toBe(200);
    // Version must NOT have incremented
    expect(sameRes.body.draftVersion).toBe(v1);
  });

  // Scenario 12: Submitted application immutability and idempotency
  it('Scenario 12: A successful submission remains immutable, and retrying submission does not create a duplicate application', async () => {
    const testMobile = `${TEST_PREFIX}00012`;

    const initRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Manoj Joshi, mobile ${testMobile}. Net 45g, gross 50g, 22K, Monthly EMI.`,
      });
    const sessionId = initRes.body.sessionId;
    const v1 = initRes.body.draftVersion;

    await request(app)
      .post('/api/v1/agent/confirm')
      .send({ sessionId, draftVersion: v1 });

    const submitRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Please submit my application.' });

    expect(submitRes1.status).toBe(200);
    const match = submitRes1.body.reply.match(/GL-\d{4,}/);
    expect(match).not.toBeNull();
    const appId = match![0];
    createdLeadIds.push(appId);

    // Retrying submission: idempotent response
    const submitRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Please submit my application.' });
    expect(submitRes2.status).toBe(200);
    expect(submitRes2.body.reply).toContain(appId);

    // Attempting correction after submission: rejected!
    const modRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 40g.' });
    expect(modRes.status).toBe(200);
    expect(modRes.body.reply).toMatch(/already been submitted and cannot be modified/i);

    // Confirm in DB that only 1 lead exists for this mobile number
    const count = await prisma.lead.count({ where: { mobileNumber: testMobile } });
    expect(count).toBe(1);
  });

  // Scenario 13: Existing supported conversation scenarios continue to pass
  it('Scenario 13: Existing supported conversation scenarios (complete single-turn quote + confirm + submit) continue to pass', async () => {
    const testMobile = `${TEST_PREFIX}00013`;

    const chat1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `Hello! I would like a gold loan. My name is Neha Gupta, mobile ${testMobile}. I have net 45g and gross 50g of 22K gold. I prefer Monthly EMI (PLAN_EMI_01).`,
      });

    expect(chat1.status).toBe(200);
    const sessionId = chat1.body.sessionId;
    const v1 = chat1.body.draftVersion;
    expect(chat1.body.draft.eligibleLoanRupees).toBe(216562);

    await SessionService.confirmDraft(sessionId, v1);

    const chat2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'I have confirmed the details. Please submit my gold loan application.' });

    expect(chat2.status).toBe(200);
    expect(chat2.body.reply).toMatch(/submitted successfully.*GL-\d{4,}/i);
    const match = chat2.body.reply.match(/GL-\d{4,}/);
    if (match) createdLeadIds.push(match[0]);
  });

  // Scenario 14: Unknown/unsupported requests handled gracefully
  it('Scenario 14: Unknown requests are handled gracefully without fabricated financial information or unintended state changes', async () => {
    const res = await request(app)
      .post('/api/v1/agent/chat')
      .send({ message: 'What is the recipe for chocolate chip cookies?' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/specialize exclusively in gold loans|gold loan portal/i);
    expect(res.body.toolCallsExecuted).toHaveLength(0);
  });
});
