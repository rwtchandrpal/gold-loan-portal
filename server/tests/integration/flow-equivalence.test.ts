import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';

describe('Dual Entry Flow Equivalence: Form Path vs. AI Agent Path (Phase 6)', () => {
  const TEST_PREFIX = '96666';
  const createdLeadIds: string[] = [];

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
    }
  });

  it('proves the Form Path and AI Agent Path produce mathematically and structurally equivalent lead records for equivalent inputs', async () => {
    const formMobile = `${TEST_PREFIX}88001`;
    const agentMobile = `${TEST_PREFIX}88002`;

    // 1. Submit through Path A: Guided Form API (POST /api/v1/leads)
    const formRes = await request(app)
      .post('/api/v1/leads')
      .send({
        fullName: 'Meera Patel',
        mobileNumber: formMobile,
        grossWeightGrams: 50.0,
        netWeightGrams: 45.0,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      });

    expect(formRes.status).toBe(201);
    const formAppId = formRes.body.applicationId;
    expect(formAppId).toMatch(/^GL-\d+$/);
    createdLeadIds.push(formAppId);

    // 2. Submit through Path B: AI Chat Agent Path (POST /api/v1/agent/chat -> POST /api/v1/agent/confirm)
    const chatTurn1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `Hello! My name is Meera Patel, mobile ${agentMobile}. I have net 45g and gross 50g of 22K gold ornaments. I select Monthly EMI (PLAN_EMI_01).`,
      });

    expect(chatTurn1.status).toBe(200);
    const sessionId = chatTurn1.body.sessionId;
    const draftVersion = chatTurn1.body.draftVersion;

    const confirmRes = await request(app)
      .post('/api/v1/agent/confirm')
      .send({
        sessionId,
        draftVersion,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.confirmed).toBe(true);
    expect(confirmRes.body.submission).toBeDefined();
    expect(confirmRes.body.submission.success).toBe(true);

    const agentAppId = confirmRes.body.submission.applicationId;
    expect(agentAppId).toMatch(/^GL-\d+$/);
    createdLeadIds.push(agentAppId);

    // 3. Inspect persistent database records directly
    const formDbRecord = await prisma.lead.findUnique({
      where: { id: formAppId },
    });
    const agentDbRecord = await prisma.lead.findUnique({
      where: { id: agentAppId },
    });

    expect(formDbRecord).not.toBeNull();
    expect(agentDbRecord).not.toBeNull();

    // Verify mathematical and structural equivalence ("Same Truth, Two Paths")
    expect(Number(formDbRecord!.grossWeightGrams)).toBe(Number(agentDbRecord!.grossWeightGrams));
    expect(Number(formDbRecord!.grossWeightGrams)).toBe(50.0);

    expect(Number(formDbRecord!.netWeightGrams)).toBe(Number(agentDbRecord!.netWeightGrams));
    expect(Number(formDbRecord!.netWeightGrams)).toBe(45.0);

    expect(formDbRecord!.karat).toBe(agentDbRecord!.karat);
    expect(formDbRecord!.karat).toBe(22);

    expect(Number(formDbRecord!.pureGoldGrams)).toBe(Number(agentDbRecord!.pureGoldGrams));
    expect(Number(formDbRecord!.pureGoldGrams)).toBe(41.25);

    expect(formDbRecord!.goldValuePaise).toBe(agentDbRecord!.goldValuePaise);
    expect(Number(formDbRecord!.goldValuePaise)).toBe(28875000);

    expect(formDbRecord!.eligibleLoanPaise).toBe(agentDbRecord!.eligibleLoanPaise);
    expect(Number(formDbRecord!.eligibleLoanPaise)).toBe(21656200);

    expect(formDbRecord!.selectedPlanId).toBe(agentDbRecord!.selectedPlanId);
    expect(formDbRecord!.selectedPlanId).toBe('PLAN_EMI_01');

    expect(formDbRecord!.status).toBe(agentDbRecord!.status);
    expect(formDbRecord!.status).toBe('SUBMITTED');
  });
});
