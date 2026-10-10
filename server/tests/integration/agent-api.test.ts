import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';

describe('AI Agent REST API: /agent/chat and /agent/confirm (Phase 4)', () => {
  const TEST_MOBILE_PREFIX = '98888';
  const createdLeadIds: string[] = [];

  afterAll(async () => {
    // Isolated clean up of test records
    if (createdLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
    }
  });

  describe('POST /api/v1/agent/chat - General & Guardrails', () => {
    it('politely declines off-topic requests (stocks/crypto/weather)', async () => {
      const res = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: 'Should I invest in Bitcoin or Tesla stocks today?',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('reply');
      expect(res.body.reply.toLowerCase()).toMatch(/gold loan/);
      expect(res.body.reply.toLowerCase()).toMatch(/(cannot|exclusively|decline|specialize)/);
    });

    it('returns schemes when asked about available loan plans', async () => {
      const res = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: 'What loan schemes or plans do you offer?',
        });

      expect(res.status).toBe(200);
      expect(res.body.reply).toMatch(/Bullet Repayment|PLAN_BULLET_01/);
      expect(res.body.reply).toMatch(/Monthly EMI|PLAN_EMI_01/);
    });

    it('prompts for missing net weight and karat when only gross weight is provided', async () => {
      const res = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: 'I have 50g of gross gold ornaments.',
        });

      expect(res.status).toBe(200);
      expect(res.body.reply.toLowerCase()).toMatch(/net.*weight/);
      expect(res.body.reply.toLowerCase()).toMatch(/karat/);
    });

    it('reports validation error when user provides net weight greater than gross weight', async () => {
      const res = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: 'Please calculate loan: net 55g, gross 50g, 22K gold.',
        });

      expect(res.status).toBe(200);
      expect(res.body.reply).toMatch(/Net weight cannot exceed gross weight/i);
    });
  });

  describe('Confirmation Security Gate & Submission Flow', () => {
    it('complete multi-turn flow: quote -> unconfirmed attempt rejected -> confirm -> submission succeeds', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}11101`;

      // 1. Initial message providing details and weights
      const chatRes1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Sunita Rao, mobile ${testMobile}. I have net 45g and gross 50g of 22K gold. I want PLAN_EMI_01.`,
        });

      expect(chatRes1.status).toBe(200);
      const sessionId = chatRes1.body.sessionId;
      expect(sessionId).toBeDefined();
      expect(chatRes1.body.draft).toBeDefined();
      expect(chatRes1.body.draft.netWeightGrams).toBe(45);
      expect(chatRes1.body.draft.pureGoldGrams).toBe(41.25);
      expect(chatRes1.body.isConfirmed).toBe(false);

      const draftVersion = chatRes1.body.draftVersion;
      expect(draftVersion).toBeGreaterThanOrEqual(1);

      // 2. Attempting to submit BEFORE user confirmation MUST be refused
      const submitBeforeConfirm = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          sessionId,
          message: 'Please submit my application right now.',
        });

      expect(submitBeforeConfirm.status).toBe(200);
      expect(submitBeforeConfirm.reply || submitBeforeConfirm.body.reply).toMatch(
        /cannot proceed without your confirmation|confirm & submit/i
      );

      // 3. User explicitly clicks "Confirm & Submit" on UI Confirmation Card
      const confirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({
          sessionId,
          draftVersion,
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.confirmed).toBe(true);
      expect(confirmRes.body.draftVersion).toBe(draftVersion);

      // 4. Now submitting application succeeds
      const submitAfterConfirm = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          sessionId,
          message: 'I have confirmed. Please submit my application.',
        });

      expect(submitAfterConfirm.status).toBe(200);
      expect(submitAfterConfirm.body.reply).toMatch(/submitted successfully.*GL-\d{4,}/i);

      // Extract created applicationId to clean up
      const match = submitAfterConfirm.body.reply.match(/GL-\d{4,}/);
      if (match) {
        createdLeadIds.push(match[0]);
      }
    });

    it('invalidates confirmation if application details change after confirmation', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}11102`;

      // 1. Prepare draft
      const chatRes1 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `My name is Ramesh Kumar, mobile ${testMobile}. Net 20g, gross 22g, 22K, PLAN_EMI_01.`,
        });

      const sessionId = chatRes1.body.sessionId;
      const initialVersion = chatRes1.body.draftVersion;

      // 2. Confirm draft
      const confirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({
          sessionId,
          draftVersion: initialVersion,
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.confirmed).toBe(true);

      // 3. User modifies details conversationally (e.g. net weight changed to 30g)
      const chatRes2 = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          sessionId,
          message: 'Actually I have net 30g, gross 32g, 22K gold.',
        });

      expect(chatRes2.status).toBe(200);
      // Version must bump and confirmation must be invalidated
      expect(chatRes2.body.draftVersion).toBe(initialVersion + 1);
      expect(chatRes2.body.isConfirmed).toBe(false);

      // 4. Submission attempted without re-confirming fails
      const submitRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          sessionId,
          message: 'Please submit my application.',
        });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.reply).toMatch(
        /cannot proceed without your confirmation|confirm & submit/i
      );
    });

    it('rejects confirmation request with mismatched draftVersion (HTTP 400)', async () => {
      const chatRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `Net 10g, gross 12g, 18K. Name John Doe, mobile ${TEST_MOBILE_PREFIX}11103.`,
        });

      const sessionId = chatRes.body.sessionId;
      const currentVersion = chatRes.body.draftVersion;

      const badConfirmRes = await request(app)
        .post('/api/v1/agent/confirm')
        .send({
          sessionId,
          draftVersion: currentVersion + 99, // Mismatched out-of-date version
        });

      expect(badConfirmRes.status).toBe(400);
      expect(badConfirmRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(badConfirmRes.body.error.message).toMatch(/mismatch/i);
    });

    it('explains friendly duplicate message when applicant reapplies within 7 days', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}11104`;

      // 1. First lead directly created
      const initialLead = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Anil Gupta',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(initialLead.status).toBe(201);
      const initialAppId = initialLead.body.applicationId;
      createdLeadIds.push(initialAppId);

      // 2. Agent conversation attempting to re-apply with same mobile
      const chatRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          message: `I want to apply. Name Anil Gupta, mobile ${testMobile}, net 45g, gross 50g, 22K, PLAN_EMI_01.`,
        });

      const sessionId = chatRes.body.sessionId;
      const draftVersion = chatRes.body.draftVersion;

      // Confirm
      await request(app)
        .post('/api/v1/agent/confirm')
        .send({ sessionId, draftVersion });

      // Submit
      const submitRes = await request(app)
        .post('/api/v1/agent/chat')
        .send({
          sessionId,
          message: 'Submit my application now.',
        });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.reply).toMatch(/already applied within the last 7 days/i);
      expect(submitRes.body.reply).toContain(initialAppId);
    });
  });
});
