import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';

describe('REST API: Leads Management (Phase 3)', () => {
  // Use isolated test mobile prefix to ensure real records are untouched
  const TEST_MOBILE_PREFIX = '99988';
  const createdTestLeadIds: string[] = [];

  afterAll(async () => {
    // Isolated clean up: remove ONLY the leads created during this test suite
    if (createdTestLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: createdTestLeadIds } },
      });
    }
  });

  describe('POST /api/v1/leads - Validation Rules', () => {
    it('returns 400 when mobile number is invalid (non-Indian format or wrong length)', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Priya Sharma',
          mobileNumber: '5555555555', // Starts with 5 (invalid Indian mobile)
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'mobileNumber' }),
        ])
      );
    });

    it('returns 400 when full name contains digits or forbidden characters', async () => {
      const resWithDigits = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Priya123 Sharma',
          mobileNumber: `${TEST_MOBILE_PREFIX}00001`,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(resWithDigits.status).toBe(400);
      expect(resWithDigits.body.error.code).toBe('VALIDATION_ERROR');

      const resWithNewline = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Priya\nSharma',
          mobileNumber: `${TEST_MOBILE_PREFIX}00002`,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(resWithNewline.status).toBe(400);
      expect(resWithNewline.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when net weight exceeds gross weight', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Priya Sharma',
          mobileNumber: `${TEST_MOBILE_PREFIX}00003`,
          grossWeightGrams: 50,
          netWeightGrams: 52,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'netWeightGrams',
            message: 'Net weight cannot exceed gross weight',
          }),
        ])
      );
    });

    it('returns 404 when selectedPlanId does not exist in the database', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Priya Sharma',
          mobileNumber: `${TEST_MOBILE_PREFIX}00004`,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_NONEXISTENT_99',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PLAN_NOT_FOUND');
    });

    it('returns 400 MALFORMED_JSON when request body contains invalid JSON', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Content-Type', 'application/json')
        .send('{"fullName": "Priya Sharma", "mobileNumber": 9876543210, "grossWeightGrams": invalid');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'MALFORMED_JSON',
          message: 'Malformed JSON payload in request body',
        },
      });
    });
  });

  describe('POST /api/v1/leads - Creation, Sequence IDs & Recalculation', () => {
    it('creates a new lead with 201 and collision-safe sequence ID matching /^GL-\\d{4,}$/', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}10001`;

      const res = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Priya Sharma',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('applicationId');
      expect(res.body.applicationId).toMatch(/^GL-\d{4,}$/);
      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.fullName).toBe('Priya Sharma');
      expect(res.body.pureGoldGrams).toBe(41.25);
      expect(res.body.eligibleLoanRupees).toBe(216562);
      expect(res.body).toHaveProperty('createdAt');

      createdTestLeadIds.push(res.body.applicationId);

      // Verify lead stored in DB with unmasked mobile
      const dbRecord = await prisma.lead.findUnique({
        where: { id: res.body.applicationId },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.mobileNumber).toBe(testMobile);
      expect(Number(dbRecord?.pureGoldGrams)).toBe(41.25);
      expect(Number(dbRecord?.eligibleLoanPaise)).toBe(21656200);
    });

    it('CRITICAL: Client-supplied financial amounts cannot override server calculations', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}10002`;

      const res = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Amit Verma',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
          // Malicious attempt to override financial figures:
          eligibleLoanRupees: 9999999,
          pureGoldGrams: 9999,
          goldValueRupees: 9999999,
        });

      expect(res.status).toBe(201);
      createdTestLeadIds.push(res.body.applicationId);

      // Server recalculation MUST prevail
      expect(res.body.pureGoldGrams).toBe(41.25);
      expect(res.body.eligibleLoanRupees).toBe(216562);
      expect(res.body.eligibleLoanRupees).not.toBe(9999999);

      const dbRecord = await prisma.lead.findUnique({
        where: { id: res.body.applicationId },
      });
      expect(Number(dbRecord?.eligibleLoanPaise)).toBe(21656200);
      expect(Number(dbRecord?.eligibleLoanPaise)).not.toBe(999999900);
    });
  });

  describe('POST /api/v1/leads - 7-Day De-duplication Policy', () => {
    it('returns 409 Conflict when same mobile number reapplies within 7 days', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}20001`;

      // 1. Initial successful application
      const firstRes = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Rahul Sen',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(firstRes.status).toBe(201);
      const initialAppId = firstRes.body.applicationId;
      createdTestLeadIds.push(initialAppId);

      // 2. Second application with same mobile within 7 days
      const duplicateRes = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Rahul Sen',
          mobileNumber: testMobile,
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_BULLET_01',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body).toHaveProperty('error');
      expect(duplicateRes.body.error.code).toBe('DUPLICATE_APPLICATION');
      expect(duplicateRes.body.error.existingApplicationId).toBe(initialAppId);
      expect(duplicateRes.body.error.existingApplicationDate).toBeDefined();
      expect(duplicateRes.body.error.message).toContain(initialAppId);
      expect(duplicateRes.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'mobileNumber' }),
        ])
      );
    });

    it('permits re-application after 8 days with 201 and new application ID', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}20002`;

      // 1. Initial application
      const firstRes = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Kavita Patel',
          mobileNumber: testMobile,
          grossWeightGrams: 20,
          netWeightGrams: 18,
          karat: 22,
          selectedPlanId: 'PLAN_BULLET_01',
        });

      expect(firstRes.status).toBe(201);
      const firstAppId = firstRes.body.applicationId;
      createdTestLeadIds.push(firstAppId);

      // 2. Simulate passage of 8 days by backdating the first lead
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await prisma.lead.update({
        where: { id: firstAppId },
        data: { createdAt: eightDaysAgo },
      });

      // 3. Reapplication after 8 days
      const secondRes = await request(app)
        .post('/api/v1/leads')
        .send({
          fullName: 'Kavita Patel',
          mobileNumber: testMobile,
          grossWeightGrams: 25,
          netWeightGrams: 22,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(secondRes.status).toBe(201);
      const secondAppId = secondRes.body.applicationId;
      createdTestLeadIds.push(secondAppId);

      expect(secondAppId).not.toBe(firstAppId);
      expect(secondAppId).toMatch(/^GL-\d{4,}$/);
    });

    it('Concurrency hardening: simultaneous parallel requests for same mobile yield 1x 201 and 1x 409', async () => {
      const testMobile = `${TEST_MOBILE_PREFIX}20003`;

      const requestPayload = {
        fullName: 'Concurrency Test Applicant',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      };

      // Fire 2 simultaneous parallel requests
      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/leads').send(requestPayload),
        request(app).post('/api/v1/leads').send(requestPayload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const successRes = res1.status === 201 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      createdTestLeadIds.push(successRes.body.applicationId);
      expect(conflictRes.body.error.code).toBe('DUPLICATE_APPLICATION');
      expect(conflictRes.body.error.existingApplicationId).toBe(successRes.body.applicationId);
    });
  });

  describe('GET /api/v1/leads - Admin Listing & Privacy Masking', () => {
    it('returns leads ordered newest first with masked mobile numbers', async () => {
      const res = await request(app).get('/api/v1/leads');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('leads');
      expect(Array.isArray(res.body.leads)).toBe(true);

      if (res.body.leads.length > 0) {
        // Privacy test: mobile numbers MUST be masked as 9876XXXX10
        for (const lead of res.body.leads) {
          expect(lead).toHaveProperty('maskedMobile');
          expect(lead.maskedMobile).toMatch(/^\d{4}XXXX\d{2}$/);
          // Raw unmasked mobile MUST NOT be exposed
          expect(lead).not.toHaveProperty('mobileNumber');
        }

        // Order test: newest first (createdAt descending)
        for (let i = 0; i < res.body.leads.length - 1; i++) {
          const current = new Date(res.body.leads[i].createdAt).getTime();
          const next = new Date(res.body.leads[i + 1].createdAt).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    it('filters admin leads by planId query parameter', async () => {
      const resBullet = await request(app)
        .get('/api/v1/leads')
        .query({ planId: 'PLAN_BULLET_01' });

      expect(resBullet.status).toBe(200);
      for (const lead of resBullet.body.leads) {
        expect(lead.selectedPlanId).toBe('PLAN_BULLET_01');
      }

      const resEmi = await request(app)
        .get('/api/v1/leads')
        .query({ planId: 'PLAN_EMI_01' });

      expect(resEmi.status).toBe(200);
      for (const lead of resEmi.body.leads) {
        expect(lead.selectedPlanId).toBe('PLAN_EMI_01');
      }
    });
  });
});
