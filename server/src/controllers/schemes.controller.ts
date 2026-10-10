import { Request, Response, NextFunction } from 'express';
import { LeadService } from '../services/lead.service.js';

export async function getLoanSchemes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await LeadService.getLoanSchemes();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
