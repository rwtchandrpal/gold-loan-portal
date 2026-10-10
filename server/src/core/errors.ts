/**
 * Canonical error classes and structures for Gold Loan Portal.
 * Follows the uniform JSON error shape: { error: { code, message, fields, ... } }
 */

export interface ErrorFieldDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly fields?: ErrorFieldDetail[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fields?: ErrorFieldDetail[]
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: ErrorFieldDetail[]) {
    super(400, 'VALIDATION_ERROR', message, fields);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, fields?: ErrorFieldDetail[], code = 'NOT_FOUND') {
    super(404, code, message, fields);
  }
}

export class DuplicateApplicationError extends AppError {
  public readonly existingApplicationId: string;
  public readonly existingApplicationDate: string;

  constructor(existingApplicationId: string, existingApplicationDate: Date | string) {
    const dateStr =
      existingApplicationDate instanceof Date
        ? existingApplicationDate.toISOString()
        : existingApplicationDate;

    super(
      409,
      'DUPLICATE_APPLICATION',
      `You already applied within the last 7 days. Your existing application ID is ${existingApplicationId}.`,
      [
        {
          field: 'mobileNumber',
          message: `Duplicate application within 7 days. Existing application: ${existingApplicationId}`,
        },
      ]
    );
    this.existingApplicationId = existingApplicationId;
    this.existingApplicationDate = dateStr;
  }
}
