import { Router } from 'express';
import { getLoanSchemes } from '../controllers/schemes.controller.js';
import { createQuote } from '../controllers/quote.controller.js';
import { createLead, getLeads } from '../controllers/lead.controller.js';
import { handleAgentChat, handleAgentConfirm } from '../controllers/agent.controller.js';
import { validateBody, validateQuery } from '../middlewares/validate.middleware.js';
import { quoteRequestSchema } from '../schemas/quote.schema.js';
import { leadCreationSchema, leadQuerySchema } from '../schemas/loan.schema.js';

export const apiRouter = Router();

// 1. GET /api/v1/loan-schemes
apiRouter.get('/loan-schemes', getLoanSchemes);

// 2. POST /api/v1/quotes
apiRouter.post('/quotes', validateBody(quoteRequestSchema), createQuote);

// 3. POST /api/v1/leads
apiRouter.post('/leads', validateBody(leadCreationSchema), createLead);

// 4. GET /api/v1/leads
apiRouter.get('/leads', validateQuery(leadQuerySchema), getLeads);

// 5. POST /api/v1/agent/chat
apiRouter.post('/agent/chat', handleAgentChat);

// 6. POST /api/v1/agent/confirm
apiRouter.post('/agent/confirm', handleAgentConfirm);
