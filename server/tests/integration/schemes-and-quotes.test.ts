import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';

describe('REST API: Schemes & Quotes (Phase 3)', () => {
  describe('GET /api/v1/loan-schemes', () => {
    it('returns seeded active loan schemes with expected structures', async () => {
      const res = await request(app).get('/api/v1/loan-schemes');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('schemes');
      expect(Array.isArray(res.body.schemes)).toBe(true);
      expect(res.body.schemes.length).toBeGreaterThanOrEqual(2);

      const bullet = res.body.schemes.find((s: any) => s.id === 'PLAN_BULLET_01');
      expect(bullet).toBeDefined();
      expect(bullet.name).toBe('Bullet Repayment');
      expect(bullet.interestRateAnnual).toBe(12.0);
      expect(bullet.maxLtv).toBe(0.70);
      expect(bullet.tenureMonths).toBe(12);
      expect(bullet.isActive).toBe(true);

      const emi = res.body.schemes.find((s: any) => s.id === 'PLAN_EMI_01');
      expect(emi).toBeDefined();
      expect(emi.name).toBe('Monthly EMI');
      expect(emi.interestRateAnnual).toBe(10.5);
      expect(emi.maxLtv).toBe(0.75);
      expect(emi.tenureMonths).toBe(12);
      expect(emi.isActive).toBe(true);
    });
  });

  describe('POST /api/v1/quotes', () => {
    it('Reference Case 1: 45g net, 50g gross, 22K, Monthly EMI -> Pure 41.25g, ₹2,88,750 value, ₹2,16,562 loan', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        pureGoldGrams: 41.25,
        goldValueRupees: 288750,
        goldValuePaise: 28875000,
        eligibleLoanRupees: 216562,
        eligibleLoanPaise: 21656200,
        currency: 'INR',
        appliedLtv: 0.75,
        appliedRatePerGram24K: 7000,
      });
    });

    it('Reference Case 2: 45g net, 50g gross, 22K, Bullet Repayment -> ₹2,88,750 value, ₹2,02,125 loan', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_BULLET_01',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        pureGoldGrams: 41.25,
        goldValueRupees: 288750,
        goldValuePaise: 28875000,
        eligibleLoanRupees: 202125,
        eligibleLoanPaise: 20212500,
        currency: 'INR',
        appliedLtv: 0.70,
        appliedRatePerGram24K: 7000,
      });
    });

    it('Reference Case 3: 10g net, 12g gross, 18K, Monthly EMI -> Pure 7.5g, ₹52,500 value, ₹39,375 loan', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 12,
          netWeightGrams: 10,
          karat: 18,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        pureGoldGrams: 7.5,
        goldValueRupees: 52500,
        goldValuePaise: 5250000,
        eligibleLoanRupees: 39375,
        eligibleLoanPaise: 3937500,
        currency: 'INR',
        appliedLtv: 0.75,
        appliedRatePerGram24K: 7000,
      });
    });

    it('Quote requests NEVER create leads in the database', async () => {
      const countBefore = await prisma.lead.count();

      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(200);

      const countAfter = await prisma.lead.count();
      expect(countAfter).toBe(countBefore);
    });

    it('returns 400 when net weight exceeds gross weight', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 50,
          netWeightGrams: 52,
          karat: 22,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
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

    it('returns 400 on invalid karat purity (e.g. 14K)', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 14,
          selectedPlanId: 'PLAN_EMI_01',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'karat' }),
        ])
      );
    });

    it('returns 400 on negative or zero weight', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 0,
          netWeightGrams: 0,
          karat: 22,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when selectedPlanId does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({
          grossWeightGrams: 50,
          netWeightGrams: 45,
          karat: 22,
          selectedPlanId: 'PLAN_NONEXISTENT_99',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PLAN_NOT_FOUND');
      expect(res.body.error.message).toContain('PLAN_NONEXISTENT_99');
    });
  });
});
