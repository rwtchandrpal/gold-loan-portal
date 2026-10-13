import { Request, Response, NextFunction } from 'express';
import { AppError, DuplicateApplicationError } from '../core/errors.js';
import { maskMobileNumber } from '../utils/serialization.js';

/**
 * Central Error-Handling Middleware.
 * 
 * Enforces the canonical JSON error contract:
 * { error: { code, message, fields?, ... } }
 * Zero stack traces exposed to clients.
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Handle body-parser malformed JSON SyntaxError (400)
  if (
    (err instanceof SyntaxError || err?.type === 'entity.parse.failed') &&
    (err?.status === 400 || err?.statusCode === 400) &&
    'body' in err
  ) {
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Malformed JSON payload in request body',
      },
    });
    return;
  }

  // Handle CORS Forbidden origin (403)
  if (typeof err?.message === 'string' && err.message.startsWith('Not allowed by CORS')) {
    res.status(403).json({
      error: {
        code: 'CORS_FORBIDDEN',
        message: 'Origin not allowed by CORS configuration',
      },
    });
    return;
  }

  // 2. Handle known DuplicateApplicationError (409)
  if (err instanceof DuplicateApplicationError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        existingApplicationId: err.existingApplicationId,
        existingApplicationDate: err.existingApplicationDate,
        fields: err.fields,
      },
    });
    return;
  }

  // 2. Handle known AppError (400, 404, etc.)
  if (err instanceof AppError) {
    const responsePayload: Record<string, any> = {
      code: err.code,
      message: err.message,
    };
    if (err.fields && err.fields.length > 0) {
      responsePayload.fields = err.fields;
    }

    res.status(err.statusCode).json({
      error: responsePayload,
    });
    return;
  }

  // 3. Handle Unexpected Server Errors (500)
  // Mask any accidental sensitive data in internal logs
  const safeLogMessage = typeof err?.message === 'string'
    ? err.message.replace(/\b([6-9]\d{9})\b/g, (_m: string, p1: string) => maskMobileNumber(p1))
    : 'Unknown internal error';

  console.error('[Internal Error]:', safeLogMessage);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    },
  });
}
