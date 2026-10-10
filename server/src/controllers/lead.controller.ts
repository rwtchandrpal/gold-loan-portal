import { Request, Response, NextFunction } from 'express';
import { LeadService } from '../services/lead.service.js';
import type { LeadCreationInput, LeadQueryInput } from '../schemas/loan.schema.js';

export async function createLead(
  req: Request<{}, {}, LeadCreationInput>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const lead = await LeadService.createLead(req.body);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
}

export async function getLeads(
  req: Request<{}, {}, {}, LeadQueryInput>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await LeadService.getLeads(req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
