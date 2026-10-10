import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError, type ErrorFieldDetail } from '../core/errors.js';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fields: ErrorFieldDetail[] = err.errors.map((e) => ({
          field: e.path.join('.') || 'body',
          message: e.message,
        }));
        return next(new ValidationError('Validation failed', fields));
      }
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fields: ErrorFieldDetail[] = err.errors.map((e) => ({
          field: e.path.join('.') || 'query',
          message: e.message,
        }));
        return next(new ValidationError('Validation failed for query parameters', fields));
      }
      next(err);
    }
  };
}
