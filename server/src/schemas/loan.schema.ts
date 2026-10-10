import { z } from 'zod';
import { ALLOWED_KARATS } from '../core/constants.js';

export const leadCreationSchema = z
  .object({
    fullName: z
      .string({ required_error: 'Full name is required', invalid_type_error: 'Full name must be a string' })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(60, 'Full name cannot exceed 60 characters')
      .refine(
        (val) => !/[\t\n\r]/.test(val),
        'Full name cannot contain tabs or newlines'
      )
      .refine(
        (val) => /^[a-zA-Z ]{2,60}$/.test(val),
        'Full name must contain only English letters and spaces'
      ),
    mobileNumber: z
      .string({ required_error: 'Mobile number is required', invalid_type_error: 'Mobile number must be a string' })
      .trim()
      .regex(
        /^[6-9]\d{9}$/,
        'Mobile number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9'
      ),
    grossWeightGrams: z
      .number({ required_error: 'Gross weight is required', invalid_type_error: 'Gross weight must be a number' })
      .positive('Gross weight must be greater than 0 grams')
      .max(1000, 'Gross weight cannot exceed 1000 grams')
      .refine(
        (val) => Number(val.toFixed(2)) === val,
        'Gross weight cannot have more than 2 decimal places'
      ),
    netWeightGrams: z
      .number({ required_error: 'Net weight is required', invalid_type_error: 'Net weight must be a number' })
      .positive('Net weight must be greater than 0 grams')
      .max(1000, 'Net weight cannot exceed 1000 grams')
      .refine(
        (val) => Number(val.toFixed(2)) === val,
        'Net weight cannot have more than 2 decimal places'
      ),
    karat: z
      .number({ required_error: 'Karat is required', invalid_type_error: 'Karat must be a number' })
      .int('Karat must be an integer')
      .refine(
        (val) => (ALLOWED_KARATS as readonly number[]).includes(val),
        `Karat must be one of: ${ALLOWED_KARATS.join(', ')}`
      ),
    selectedPlanId: z
      .string({ required_error: 'Selected plan is required', invalid_type_error: 'Selected plan ID must be a string' })
      .min(1, 'Selected plan ID cannot be empty'),
  })
  .refine((data) => data.netWeightGrams <= data.grossWeightGrams, {
    message: 'Net weight cannot exceed gross weight',
    path: ['netWeightGrams'],
  });

export type LeadCreationInput = z.infer<typeof leadCreationSchema>;

export const leadQuerySchema = z.object({
  planId: z.string().optional(),
});

export type LeadQueryInput = z.infer<typeof leadQuerySchema>;
