import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';

describe('AI Agent Evaluation Suite: The 5 Mandatory Conversations (npm run eval)', () => {
  const TEST_PREFIX = '97777';
  const createdTestLeadIds: string[] = [];

  afterAll(async () => {
    if (createdTestLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: createdTestLeadIds } },
      });
    }
  });

  it('Evaluation 1 (Happy Path): Complete quotation, user confirmation, and successful submission', async () => {
    const testMobile = `${TEST_PREFIX}00001`;

    // Turn 1: User provides complete quotation parameters
    const turn1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `Hello! I would like a gold loan. My name is Sneha Reddy, mobile ${testMobile}. I have net 45g and gross 50g of 22K gold. I prefer Monthly EMI (PLAN_EMI_01).`,
      });

    expect(turn1.status).toBe(200);
    const sessionId = turn1.body.sessionId;
    expect(sessionId).toBeDefined();

    // Verify calculate_quote tool was invoked
    const quoteToolCall = turn1.body.toolCallsExecuted.find(
      (t: any) => t.name === 'calculate_quote'
    );
    expect(quoteToolCall).toBeDefined();
    expect(quoteToolCall.result.pureGoldGrams).toBe(41.25);
    expect(quoteToolCall.result.goldValueRupees).toBe(288750);
    expect(quoteToolCall.result.quotesByPlan.PLAN_EMI_01.eligibleLoanRupees).toBe(216562);

    // Verify draft details
    expect(turn1.body.draft).toBeDefined();
    expect(turn1.body.draft.netWeightGrams).toBe(45);
    expect(turn1.body.draft.pureGoldGrams).toBe(41.25);
    expect(turn1.body.isConfirmed).toBe(false);

    const draftVersion = turn1.body.draftVersion;

    // Turn 2: User confirms draft via POST /api/v1/agent/confirm (UI Confirmation Card action)
    const confirmRes = await request(app)
      .post('/api/v1/agent/confirm')
      .send({
        sessionId,
        draftVersion,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.confirmed).toBe(true);

    // Turn 3: User instructs agent to finalize submission
    const turn3 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        sessionId,
        message: 'I have confirmed the details. Please submit my gold loan application.',
      });

    expect(turn3.status).toBe(200);
    const submitToolCall = turn3.body.toolCallsExecuted.find(
      (t: any) => t.name === 'submit_application'
    );
    expect(submitToolCall).toBeDefined();
    expect(submitToolCall.result.success).toBe(true);
    expect(submitToolCall.result.applicationId).toMatch(/^GL-\d{4,}$/);

    expect(turn3.body.reply).toMatch(/submitted successfully.*GL-\d{4,}/i);

    createdTestLeadIds.push(submitToolCall.result.applicationId);
  });

  it('Evaluation 2 (Missing Fields): Agent prompts applicant for missing weights and karat', async () => {
    // User only gives gross weight without net weight, karat, or mobile
    const res = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: 'I have some gold bangles with gross weight of 40 grams.',
      });

    expect(res.status).toBe(200);
    expect(res.body.reply.toLowerCase()).toMatch(/net.*weight/);
    expect(res.body.reply.toLowerCase()).toMatch(/karat/);
    // Did not invoke submit_application tool
    const submitTool = res.body.toolCallsExecuted.find((t: any) => t.name === 'submit_application');
    expect(submitTool).toBeUndefined();
  });

  it('Evaluation 3 (Validation Error): Net weight greater than gross weight is flagged with prompt to correct', async () => {
    // User gives invalid weights: net 50g > gross 40g
    const res = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: 'Calculate my quote: net 50g, gross 40g, 22K gold.',
      });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/net weight cannot exceed gross weight/i);

    // calculate_quote tool was invoked and caught the error cleanly
    const quoteTool = res.body.toolCallsExecuted.find((t: any) => t.name === 'calculate_quote');
    expect(quoteTool).toBeDefined();
    expect(quoteTool.result.success).toBe(false);
    expect(quoteTool.result.error).toBe('VALIDATION_ERROR');
  });

  it('Evaluation 4 (7-Day Duplicate): Duplicate applicant within 7 days receives friendly explanation with application ID', async () => {
    const testMobile = `${TEST_PREFIX}00004`;

    // 1. Existing lead created
    const existing = await request(app)
      .post('/api/v1/leads')
      .send({
        fullName: 'Vikram Malhotra',
        mobileNumber: testMobile,
        grossWeightGrams: 50,
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
      });

    expect(existing.status).toBe(201);
    const existingAppId = existing.body.applicationId;
    createdTestLeadIds.push(existingAppId);

    // 2. Chat session attempting to re-apply
    const chat1 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: `Apply for loan. Name Vikram Malhotra, mobile ${testMobile}, net 45g, gross 50g, 22K, PLAN_EMI_01.`,
      });

    const sessionId = chat1.body.sessionId;
    const draftVersion = chat1.body.draftVersion;

    // Confirm
    await request(app)
      .post('/api/v1/agent/confirm')
      .send({ sessionId, draftVersion });

    // Submit
    const chat2 = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        sessionId,
        message: 'Please submit.',
      });

    expect(chat2.status).toBe(200);
    expect(chat2.body.reply).toMatch(/already applied within the last 7 days/i);
    expect(chat2.body.reply).toContain(existingAppId);

    const submitTool = chat2.body.toolCallsExecuted.find((t: any) => t.name === 'submit_application');
    expect(submitTool).toBeDefined();
    expect(submitTool.result.success).toBe(false);
    expect(submitTool.result.error).toBe('DUPLICATE_APPLICATION');
  });

  it('Evaluation 5 (Off-Topic Inquiry): Agent politely declines investment/crypto inquiries and stays on gold loans', async () => {
    const res = await request(app)
      .post('/api/v1/agent/chat')
      .send({
        message: 'Can you tell me whether Ethereum or Bitcoin is better to buy for investment, or what the weather is today?',
      });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/specialize exclusively in gold loans|gold loan portal/i);
    expect(res.body.reply).toMatch(/cannot.*invest/i);
    // Zero tools called
    expect(res.body.toolCallsExecuted).toHaveLength(0);
  });
});
