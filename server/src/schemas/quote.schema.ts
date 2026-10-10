import { z } from 'zod';
import { ALLOWED_KARATS } from '../core/constants.js';

export const quoteRequestSchema = z
  .object({
    grossWeightGrams: z
      .number({ invalid_type_error: 'Gross weight must be a number' })
      .positive('Gross weight must be greater than 0 grams')
      .max(1000, 'Gross weight cannot exceed 1000 grams')
      .refine(
        (val) => Number(val.toFixed(2)) === val,
        'Gross weight cannot have more than 2 decimal places'
      ),
    netWeightGrams: z
      .number({ invalid_type_error: 'Net weight must be a number' })
      .positive('Net weight must be greater than 0 grams')
      .max(1000, 'Net weight cannot exceed 1000 grams')
      .refine(
        (val) => Number(val.toFixed(2)) === val,
        'Net weight cannot have more than 2 decimal places'
      ),
    karat: z
      .number({ invalid_type_error: 'Karat must be a number' })
      .int('Karat must be an integer')
      .refine(
        (val) => (ALLOWED_KARATS as readonly number[]).includes(val),
        `Karat must be one of: ${ALLOWED_KARATS.join(', ')}`
      ),
    selectedPlanId: z
      .string({ invalid_type_error: 'Selected plan ID must be a string' })
      .min(1, 'Selected plan ID cannot be empty')
      .optional(),
  })
  .refine((data) => data.netWeightGrams <= data.grossWeightGrams, {
    message: 'Net weight cannot exceed gross weight',
    path: ['netWeightGrams'],
  });

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
