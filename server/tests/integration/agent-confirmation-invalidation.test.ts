import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import { executeToolCall } from '../../src/agent/tools.js';
import { SessionService } from '../../src/services/session.service.js';

describe('BUG-03: Server-Enforced AI Confirmation Invalidation & Version Lifecycle', () => {
  const TEST_MOBILE_PREFIX = '98777';
  const createdLeadIds: string[] = [];

  beforeAll(async () => {
    // Clean up any existing leads matching test prefix from prior runs
    await prisma.lead.deleteMany({
      where: { mobileNumber: { startsWith: TEST_MOBILE_PREFIX } },
    });
  });

  afterAll(async () => {
    // Clean up all leads created during this test suite
    await prisma.lead.deleteMany({
      where: { mobileNumber: { startsWith: TEST_MOBILE_PREFIX } },
    });
  });

  it('Requirement 1: Confirmation of a valid draft records the current draft version', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30001`;

    // 1. Initial chat message providing complete valid application details
    const chatRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Priya Sharma, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });

    expect(chatRes.status).toBe(200);
    const sessionId = chatRes.body.sessionId;
    const initialVersion = chatRes.body.draftVersion;
    expect(initialVersion).toBe(1);
    expect(chatRes.body.isConfirmed).toBe(false);

    // 2. Explicit user confirmation via Confirmation Card
    const confirmRes = await request(app)
      .post('/api/v1/agent/confirm')
      .send({
        sessionId,
        draftVersion: initialVersion,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.confirmed).toBe(true);
    expect(confirmRes.body.draftVersion).toBe(1);

    // Assert database state directly
    const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    expect(sessionInDb?.isConfirmed).toBe(true);
    expect(sessionInDb?.draftVersion).toBe(1);
    expect(sessionInDb?.confirmedDraftVersion).toBe(1);
    expect(sessionInDb?.confirmedAt).not.toBeNull();
  });

  it('Requirement 2: A valid net-weight correction after confirmation updates draft, increments version, invalidates confirmation, and refreshes quote', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30002`;

    // 1. Initialize draft
    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Amit Patel, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });

    const sessionId = chatRes1.body.sessionId;
    const v1 = chatRes1.body.draftVersion;

    // Confirm draft v1 prior to submission
    await SessionService.confirmDraft(sessionId, v1);

    // Verify session is confirmed in DB
    const confirmedDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    expect(confirmedDb?.isConfirmed).toBe(true);

    // 2. Send correction: "Actually, my net weight is 40g."
    const chatRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        sessionId,
        message: 'Actually, my net weight is 40g.',
      });

    expect(chatRes2.status).toBe(200);
    expect(chatRes2.body.draftVersion).toBe(v1 + 1);
    expect(chatRes2.body.isConfirmed).toBe(false);
    expect(chatRes2.body.draft.netWeightGrams).toBe(40);
    expect(chatRes2.body.draft.pureGoldGrams).toBeCloseTo(36.6667, 3);
    // Loan for 40g: 40 * (22/24) * 7000 * 0.75 = 192,500 (refreshed, not stale 216,562)
    expect(chatRes2.body.draft.eligibleLoanRupees).toBe(192500);

    // Assert database state: confirmation MUST be invalidated and version bumped
    const updatedDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    expect(updatedDb?.isConfirmed).toBe(false);
    expect(updatedDb?.confirmedDraftVersion).toBeNull();
    expect(updatedDb?.confirmedAt).toBeNull();
    expect(updatedDb?.draftVersion).toBe(v1 + 1);
  });

  it('Requirement 3: Submission after a correction but before reconfirmation is strictly rejected', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30003`;

    // Initialize draft
    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Rahul Verma, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });
    const sessionId = chatRes1.body.sessionId;
    const v1 = chatRes1.body.draftVersion;

    // Simulate confirmed state for draft v1
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        isConfirmed: true,
        confirmedDraftVersion: v1,
        confirmedAt: new Date(),
      },
    });

    // Send correction to 40g -> draftVersion becomes 2, isConfirmed becomes false
    const chatRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 40g.' });

    expect(chatRes2.body.draftVersion).toBe(v1 + 1);
    expect(chatRes2.body.isConfirmed).toBe(false);

    // Verbal submission request before reconfirming MUST be rejected
    const submitRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        sessionId,
        message: 'Please submit my application now.',
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.reply).toMatch(/cannot proceed without your confirmation|confirm & submit/i);

    // Direct submit_application tool call must also reject
    const toolResult = await executeToolCall(
      'submit_application',
      {
        fullName: 'Rahul Verma',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 40,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      },
      sessionId
    );
    expect(toolResult.success).toBe(false);
    expect(toolResult.error).toBe('CONFIRMATION_REQUIRED');

    // Assert no lead was inserted into DB for this mobile
    const leads = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
    expect(leads).toHaveLength(0);
  });

  it('Requirement 4: Reconfirmation of the changed valid draft enables eligible submission', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30004`;

    // 1. Initial setup of v1
    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Neha Joshi, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });
    const sessionId = chatRes1.body.sessionId;
    const v1 = chatRes1.body.draftVersion;

    // Simulate confirmed draft v1
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        isConfirmed: true,
        confirmedDraftVersion: v1,
        confirmedAt: new Date(),
      },
    });

    // 2. Correction to 40g -> draftVersion becomes 2, confirmation invalidated
    const chatRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 40g.' });
    const v2 = chatRes2.body.draftVersion;
    expect(v2).toBe(v1 + 1);
    expect(chatRes2.body.isConfirmed).toBe(false);

    // 3. User explicitly confirms updated v2 via UI Confirmation Card
    const confirmRes2 = await request(app)
      .post('/api/v1/agent/confirm')
      .send({ sessionId, draftVersion: v2 });

    expect(confirmRes2.status).toBe(200);
    expect(confirmRes2.body.confirmed).toBe(true);
    expect(confirmRes2.body.draftVersion).toBe(v2);
    expect(confirmRes2.body.submission).toBeDefined();
    expect(confirmRes2.body.submission.success).toBe(true);

    const appId = confirmRes2.body.submission.applicationId;
    expect(appId).toMatch(/^GL-\d{4,}$/);
    createdLeadIds.push(appId);

    // Verify lead in DB was created with corrected 40g values
    const createdLead = await prisma.lead.findUnique({ where: { id: appId } });
    expect(createdLead).not.toBeNull();
    expect(Number(createdLead?.netWeightGrams)).toBe(40);
    expect(createdLead?.eligibleLoanPaise).toBe(19250000n);
  });

  it('Requirement 5: A correction that does not change the stored value does not create a false version change', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30005`;

    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Sanjay Gupta, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });
    const sessionId = chatRes1.body.sessionId;
    const v1 = chatRes1.body.draftVersion;

    // Confirm v1
    await request(app)
      .post('/api/v1/agent/confirm')
      .send({ sessionId, draftVersion: v1 });

    // Send statement repeating the same net weight (45g)
    const chatRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually my net weight is 45g.' });

    // Version must NOT bump since value did not change
    expect(chatRes2.status).toBe(200);
    expect(chatRes2.body.draftVersion).toBe(v1);

    // Confirmation must remain valid
    const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    expect(sessionInDb?.isConfirmed).toBe(true);
    expect(sessionInDb?.draftVersion).toBe(v1);
  });

  it('Requirement 6: An invalid correction cannot be submitted and does not corrupt previously stored details', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30006`;

    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Geeta Nair, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });
    const sessionId = chatRes1.body.sessionId;
    const v1 = chatRes1.body.draftVersion;

    // Confirm v1 prior to submission
    await SessionService.confirmDraft(sessionId, v1);

    // Send invalid correction: net 55g > gross 50g
    const chatRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually, my net weight is 55g.' });

    expect(chatRes2.status).toBe(200);
    expect(chatRes2.body.reply).toMatch(/validation error|cannot exceed gross weight/i);

    // Stored draft must NOT be corrupted with 55g; it should retain 45g
    expect(chatRes2.body.draft.netWeightGrams).toBe(45);
    const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    expect((sessionInDb?.draftPayload as any)?.netWeightGrams).toBe(45);

    // Prior confirmation MUST be invalidated so invalid state cannot be submitted
    expect(sessionInDb?.isConfirmed).toBe(false);
    expect(sessionInDb?.confirmedDraftVersion).toBeNull();

    // Submission attempt must fail
    const submitAttempt = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Submit application' });
    expect(submitAttempt.body.reply).toMatch(/cannot proceed without your confirmation/i);
  });

  it('Requirement 7: A correction to another confirmation-relevant field (scheme or name) also invalidates confirmation', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30007`;

    // Confirm draft v1 under PLAN_EMI_01
    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Devendra Rao, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });
    const sessionId = chatRes1.body.sessionId;
    const v1 = chatRes1.body.draftVersion;

    // Confirm v1 prior to submission
    await SessionService.confirmDraft(sessionId, v1);

    // Switch scheme to PLAN_BULLET_01
    const chatRes2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually change scheme to Bullet Repayment.' });

    expect(chatRes2.status).toBe(200);
    expect(chatRes2.body.draftVersion).toBe(v1 + 1);
    expect(chatRes2.body.isConfirmed).toBe(false);
    expect(chatRes2.body.draft.selectedPlanId).toBe('PLAN_BULLET_01');

    // Assert DB invalidation
    const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    expect(sessionInDb?.isConfirmed).toBe(false);
    expect(sessionInDb?.confirmedDraftVersion).toBeNull();
  });

  it('Requirement 8: Client-supplied stale version or payload mismatch cannot bypass server-side checks', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30008`;

    const chatRes1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Meera Sen, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });
    const sessionId = chatRes1.body.sessionId;

    // Confirm v1 prior to submission
    await SessionService.confirmDraft(sessionId, 1);

    // Mutate to v2 (net: 40)
    await request(app)
      .post('/api/v1/agent/chat')
      .send({ sessionId, message: 'Actually net weight is 40g.' });

    // Client attempts to reconfirm using stale version 1
    const staleConfirm = await request(app)
      .post('/api/v1/agent/confirm')
      .send({ sessionId, draftVersion: 1 });

    expect(staleConfirm.status).toBe(400);
    expect(staleConfirm.body.error.code).toBe('VALIDATION_ERROR');
    expect(staleConfirm.body.error.message).toMatch(/mismatch/i);

    // Attempt direct submission tool call with payload that differs from confirmed draft
    const mismatchToolCall = await executeToolCall(
      'submit_application',
      {
        fullName: 'Meera Sen',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 99, // Mismatched malicious weight
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      },
      sessionId
    );
    expect(mismatchToolCall.success).toBe(false);
    expect(mismatchToolCall.error).toBe('CONFIRMATION_REQUIRED');
  });

  it('Requirement 9: Failed tool execution leaves draft and confirmation metadata consistent', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30009`;

    const session = await SessionService.getOrCreateSession();
    await SessionService.updateDraft(session.id, {
      fullName: 'Kiran Desai',
      mobileNumber: testMobile,
      grossWeightGrams: 50,
      netWeightGrams: 45,
      karat: 22,
      selectedPlanId: 'PLAN_EMI_01',
    });

    // Execute calculate_quote with invalid karat (e.g. 20K)
    const quoteResult = await executeToolCall(
      'calculate_quote',
      { net: 45, gross: 50, karat: 20 },
      session.id
    );
    expect(quoteResult.success).toBe(false);
    expect(quoteResult.error).toBe('VALIDATION_ERROR');

    // Confirm draft in DB remains intact with original valid karat 22
    const sessionInDb = await prisma.agentSession.findUnique({ where: { id: session.id } });
    expect((sessionInDb?.draftPayload as any)?.karat).toBe(22);
    expect(sessionInDb?.draftVersion).toBe(1);
    expect(sessionInDb?.isConfirmed).toBe(false);
  });

  it('Requirement 10: Existing successful application submission behavior remains intact', async () => {
    const testMobile = `${TEST_MOBILE_PREFIX}30010`;

    // Standard complete happy path
    const chatRes = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `My name is Vijay Mallya, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });

    const sessionId = chatRes.body.sessionId;
    const version = chatRes.body.draftVersion;

    const confirmRes = await request(app)
      .post('/api/v1/agent/confirm')
      .send({ sessionId, draftVersion: version });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.confirmed).toBe(true);
    expect(confirmRes.body.submission).toBeDefined();
    expect(confirmRes.body.submission.success).toBe(true);

    const appId = confirmRes.body.submission.applicationId;
    expect(appId).toMatch(/^GL-\d{4,}$/);
    createdLeadIds.push(appId);
  });

  describe('Post-Submission Immutability, Idempotency & Lifecycle Invariants', () => {
    it('Invariant 1 & 2: Submitting an application successfully and then sending a weight correction preserves the original application ID, status, and does not create a second application', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}40001`;

      // 1. Submit initial application successfully
      const chatRes1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Ramesh Verma, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chatRes1.body.sessionId;
      const v1 = chatRes1.body.draftVersion;

      const confirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion: v1 });
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.submission.success).toBe(true);
      const originalAppId = confirmRes.body.submission.applicationId;
      createdLeadIds.push(originalAppId);

      // Verify DB lead count is exactly 1
      const initialLeads = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(initialLeads.length).toBe(1);

      // 2. Applicant sends conversational correction after submission
      const correctionRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          sessionId,
          message: 'Actually, my net weight is 40g.',
        });

      expect(correctionRes.status).toBe(200);
      expect(correctionRes.body.reply).toMatch(/already been submitted and cannot be modified/i);

      // Verify session draft was NOT stripped of applicationId, status, or submittedAt
      expect(correctionRes.body.draft.applicationId).toBe(originalAppId);
      expect(correctionRes.body.draft.status).toBe('SUBMITTED');
      expect(correctionRes.body.draft.netWeightGrams).toBe(45);
      expect(correctionRes.body.draftVersion).toBe(v1);

      // Verify DB session record
      const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
      const draftInDb = sessionInDb?.draftPayload as any;
      expect(draftInDb.applicationId).toBe(originalAppId);
      expect(draftInDb.status).toBe('SUBMITTED');
      expect(draftInDb.submittedAt).toBeDefined();
      expect(draftInDb.netWeightGrams).toBe(45);
      expect(sessionInDb?.draftVersion).toBe(v1);
      expect(sessionInDb?.isConfirmed).toBe(true);

      // Verify no second lead was created in DB
      const postLeads = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(postLeads.length).toBe(1);

      // Verify direct updateDraft rejects modification on submitted session
      await expect(
        SessionService.updateDraft(sessionId, { netWeightGrams: 40 })
      ).rejects.toThrow(/already been submitted/i);
    });

    it('Invariant 3: Repeating submission request for already-submitted session follows idempotency contract and creates no duplicate', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}40002`;

      // 1. Submit initial application successfully
      const chatRes1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Sunita Rao, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chatRes1.body.sessionId;
      const v1 = chatRes1.body.draftVersion;

      const confirmRes1 = await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion: v1 });
      expect(confirmRes1.status).toBe(200);
      const originalAppId = confirmRes1.body.submission.applicationId;
      createdLeadIds.push(originalAppId);

      // 2. Repeat confirm/submit endpoint call
      const confirmRes2 = await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion: v1 });
      expect(confirmRes2.status).toBe(200);
      expect(confirmRes2.body.confirmed).toBe(true);
      expect(confirmRes2.body.submission.success).toBe(true);
      expect(confirmRes2.body.submission.applicationId).toBe(originalAppId);

      // 3. Repeat submission via chat message
      const chatSubmitAgain = await request(app)
        .post('/api/v1/agent/chat')
        .send({ sessionId, message: 'Please submit my application' });
      expect(chatSubmitAgain.status).toBe(200);
      expect(chatSubmitAgain.body.reply).toMatch(/submitted successfully|already been submitted/i);

      // Assert exactly 1 lead in database
      const leadsInDb = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(leadsInDb.length).toBe(1);
    });

    it('Invariant 4: Post-submission tool execution with changed arguments cannot bypass submission checks', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}40003`;

      // 1. Submit application
      const chatRes1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Manoj Joshi, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chatRes1.body.sessionId;
      const v1 = chatRes1.body.draftVersion;

      const confirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion: v1 });
      const originalAppId = confirmRes.body.submission.applicationId;
      createdLeadIds.push(originalAppId);

      // 2. Directly invoke submit_application with modified netWeightGrams (40g instead of 45g)
      const bypassSubmit = await executeToolCall(
        'submit_application',
        {
          fullName: 'Manoj Joshi',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 40, // Mismatch
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        },
        sessionId
      );
      expect(bypassSubmit.success).toBe(false);
      expect(bypassSubmit.error).toBe('CONFIRMATION_REQUIRED');
      expect(bypassSubmit.message).toMatch(/does not match the confirmed draft value/i);

      // 3. Directly invoke calculate_quote on the submitted session
      const quoteAttempt = await executeToolCall(
        'calculate_quote',
        { net: 40, gross: 50, karat: 22 },
        sessionId
      );
      expect(quoteAttempt.success).toBe(false);
      expect(quoteAttempt.error).toBe('APPLICATION_ALREADY_SUBMITTED');

      // Verify DB lead remains untouched with original 45g
      const leadInDb = await prisma.lead.findUnique({ where: { id: originalAppId } });
      expect(Number(leadInDb?.netWeightGrams)).toBe(45);
    });

    it('Invariant 5: Normal pre-submission correction, invalidation, reconfirmation, and submission lifecycle still functions smoothly', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}40004`;

      // 1. Initial draft
      const chat1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Deepa Shah, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chat1.body.sessionId;
      const v1 = chat1.body.draftVersion;

      // 2. Verbal correction before submission (pre-submission)
      const chat2 = await request(app)
        .post('/api/v1/agent/chat')
        .send({ sessionId, message: 'Actually, my net weight is 42g.' });
      const v2 = chat2.body.draftVersion;
      expect(v2).toBe(v1 + 1);
      expect(chat2.body.isConfirmed).toBe(false);
      expect(chat2.body.draft.netWeightGrams).toBe(42);

      // 3. Confirm and submit v2
      const confirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion: v2 });
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.confirmed).toBe(true);
      expect(confirmRes.body.submission.success).toBe(true);
      const appId = confirmRes.body.submission.applicationId;
      createdLeadIds.push(appId);

      const createdLead = await prisma.lead.findUnique({ where: { id: appId } });
      expect(Number(createdLead?.netWeightGrams)).toBe(42);
    });

    it('Invariant 6: Failed or repeated operations do not leave session metadata inconsistent with persisted application record', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}40005`;

      // 1. Submit application
      const chat1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Anita Bose, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chat1.body.sessionId;
      const v1 = chat1.body.draftVersion;

      const confirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion: v1 });
      const appId = confirmRes.body.submission.applicationId;
      createdLeadIds.push(appId);

      // 2. Invalidate confirmation attempt on submitted session
      await SessionService.invalidateConfirmation(sessionId);

      // Session must remain confirmed for the submitted record
      const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
      expect(sessionInDb?.isConfirmed).toBe(true);
      expect(sessionInDb?.confirmedDraftVersion).toBe(v1);
      const draft = sessionInDb?.draftPayload as any;
      expect(draft.applicationId).toBe(appId);
      expect(draft.status).toBe('SUBMITTED');

      // Verify persisted application in Lead table matches session draft exactly
      const leadInDb = await prisma.lead.findUnique({ where: { id: appId } });
      expect(leadInDb?.id).toBe(draft.applicationId);
      expect(leadInDb?.fullName).toBe(draft.fullName);
      expect(Number(leadInDb?.netWeightGrams)).toBe(draft.netWeightGrams);
      expect(Number(leadInDb?.grossWeightGrams)).toBe(draft.grossWeightGrams);
      expect(leadInDb?.karat).toBe(draft.karat);
      expect(leadInDb?.selectedPlanId).toBe(draft.selectedPlanId);
    });
  });

  describe('Concurrent Submission Idempotency & Mutually Exclusive Transaction Verification', () => {
    it('Concurrent Scenario 1: Two overlapping POST /api/v1/agent/confirm requests for the same session create exactly one lead', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}50001`;

      // 1. Prepare valid confirmed draft
      const chatRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Sanjay Gupta, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chatRes.body.sessionId;
      const v1 = chatRes.body.draftVersion;

      // 2. Launch two genuinely concurrent /agent/confirm requests
      const [confirmResA, confirmResB] = await Promise.all([
        request(app).post('/api/v1/agent/confirm').send({ sessionId, draftVersion: v1 }),
        request(app).post('/api/v1/agent/confirm').send({ sessionId, draftVersion: v1 }),
      ]);

      expect(confirmResA.status).toBe(200);
      expect(confirmResB.status).toBe(200);

      // Verify exactly 1 lead in database
      const leadsInDb = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(leadsInDb.length).toBe(1);
      const createdAppId = leadsInDb[0].id;
      createdLeadIds.push(createdAppId);

      // Verify outcomes: both point to the same application ID
      const appIds = [
        confirmResA.body.submission?.applicationId || confirmResA.body.submission?.existingApplicationId,
        confirmResB.body.submission?.applicationId || confirmResB.body.submission?.existingApplicationId,
      ];
      expect(appIds[0]).toBe(createdAppId);
      expect(appIds[1]).toBe(createdAppId);

      // Verify session draft consistency in database
      const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
      const draft = sessionInDb?.draftPayload as any;
      expect(draft.applicationId).toBe(createdAppId);
      expect(draft.status).toBe('SUBMITTED');
      expect(draft.submittedAt).toBeDefined();
      expect(sessionInDb?.isConfirmed).toBe(true);
    });

    it('Concurrent Scenario 2: Two overlapping executeToolCall(submit_application) calls create exactly one lead and maintain draft consistency', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}50002`;

      // 1. Create and confirm session
      const session = await SessionService.getOrCreateSession();
      await SessionService.updateDraft(session.id, {
        fullName: 'Pooja Hegde',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      });
      await SessionService.confirmDraft(session.id, 1);

      // 2. Launch two overlapping submit_application tool calls
      const payload = {
        fullName: 'Pooja Hegde',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      };

      const [toolResA, toolResB] = await Promise.all([
        executeToolCall('submit_application', payload, session.id),
        executeToolCall('submit_application', payload, session.id),
      ]);

      // Exactly 1 lead created
      const leadsInDb = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(leadsInDb.length).toBe(1);
      const createdAppId = leadsInDb[0].id;
      createdLeadIds.push(createdAppId);

      // Exactly one succeeds, the other gets duplicate response referencing the same ID
      const resolvedAppIdA = toolResA.applicationId || toolResA.existingApplicationId;
      const resolvedAppIdB = toolResB.applicationId || toolResB.existingApplicationId;
      expect(resolvedAppIdA).toBe(createdAppId);
      expect(resolvedAppIdB).toBe(createdAppId);

      // Verify session state
      const sessionInDb = await prisma.agentSession.findUnique({ where: { id: session.id } });
      const draft = sessionInDb?.draftPayload as any;
      expect(draft.applicationId).toBe(createdAppId);
      expect(draft.status).toBe('SUBMITTED');
    });

    it('Concurrent Scenario 3: Two overlapping POST /api/v1/leads requests result in one 201 Created and one 409 Conflict', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}50003`;

      const payload = {
        fullName: 'Vikram Seth',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      };

      const [resA, resB] = await Promise.all([
        request(app).post('/api/v1/leads').send(payload),
        request(app).post('/api/v1/leads').send(payload),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const successRes = resA.status === 201 ? resA : resB;
      const conflictRes = resA.status === 409 ? resA : resB;

      expect(successRes.body.applicationId).toMatch(/^GL-\d{4,}$/);
      expect(conflictRes.body.error.code).toBe('DUPLICATE_APPLICATION');
      expect(conflictRes.body.error.existingApplicationId).toBe(successRes.body.applicationId);

      // Exactly 1 lead created
      const leadsInDb = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(leadsInDb.length).toBe(1);
      createdLeadIds.push(leadsInDb[0].id);
    });

    it('Concurrent Scenario 4: High-frequency race loop reliably prevents duplicate creation across multiple overlapping runs', async () => {
      for (let i = 1; i <= 5; i++) {
        const testMobile = `${TEST_MOBILE_PREFIX}5100${i}`;

        const payload = {
          fullName: 'Concurrency User Alpha',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        };

        const [r1, r2] = await Promise.all([
          request(app).post('/api/v1/leads').send(payload),
          request(app).post('/api/v1/leads').send(payload),
        ]);

        const statuses = [r1.status, r2.status].sort();
        expect(statuses).toEqual([201, 409]);

        const leadsInDb = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
        expect(leadsInDb.length).toBe(1);
        createdLeadIds.push(leadsInDb[0].id);
      }
    });

    it('Concurrent Scenario 5: Simultaneous POST /api/v1/agent/confirm and POST /api/v1/agent/chat (cross-endpoint race) creates exactly one lead', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}50005`;

      const chatRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Rohit Roy, mobile ${testMobile}. Net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });
      const sessionId = chatRes.body.sessionId;
      const v1 = chatRes.body.draftVersion;

      // Pre-confirm draft so chat submit is eligible
      await SessionService.confirmDraft(sessionId, v1);

      // Race confirm endpoint against chat submit endpoint
      const [confirmRes, chatSubmitRes] = await Promise.all([
        request(app).post('/api/v1/agent/confirm').send({ sessionId, draftVersion: v1 }),
        request(app).post('/api/v1/agent/chat').send({ sessionId, message: 'I have confirmed. Please submit my application.' }),
      ]);

      expect(confirmRes.status).toBe(200);
      expect(chatSubmitRes.status).toBe(200);

      // Exactly 1 lead created in database
      const leadsInDb = await prisma.lead.findMany({ where: { mobileNumber: testMobile } });
      expect(leadsInDb.length).toBe(1);
      const createdAppId = leadsInDb[0].id;
      createdLeadIds.push(createdAppId);

      // Both outcomes reference the created application ID
      expect(confirmRes.body.submission?.applicationId || confirmRes.body.submission?.existingApplicationId).toBe(createdAppId);
      expect(chatSubmitRes.body.reply).toMatch(new RegExp(createdAppId));

      // Session state is consistent
      const sessionInDb = await prisma.agentSession.findUnique({ where: { id: sessionId } });
      const draft = sessionInDb?.draftPayload as any;
      expect(draft.applicationId).toBe(createdAppId);
      expect(draft.status).toBe('SUBMITTED');
    });
  });
});
