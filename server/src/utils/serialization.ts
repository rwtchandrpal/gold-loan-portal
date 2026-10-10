import { Decimal } from 'decimal.js';

/**
 * Masks an Indian mobile number for administrative responses and logging.
 * Format: 9876XXXX10 (First 4 digits, four 'X' characters, last 2 digits).
 */
export function maskMobileNumber(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length < 10) {
    return mobile;
  }
  const clean = digits.slice(-10);
  return `${clean.slice(0, 4)}XXXX${clean.slice(-2)}`;
}

/**
 * Safely converts Decimal and BigInt values to JSON-serializable types.
 * Decimal -> Number
 * BigInt -> Number (for values within safe integer range) or String
 */
export function serializeJsonSafe<T>(data: T): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'bigint') {
    // Fits safely within JavaScript Number.MAX_SAFE_INTEGER (up to 9,007,199,254,740,991)
    if (data <= BigInt(Number.MAX_SAFE_INTEGER) && data >= BigInt(Number.MIN_SAFE_INTEGER)) {
      return Number(data);
    }
    return data.toString();
  }

  if (data instanceof Decimal) {
    return data.toNumber();
  }

  // Handle Prisma Decimal-like objects that might not be instanceof Decimal directly
  if (
    typeof data === 'object' &&
    data !== null &&
    's' in data &&
    'e' in data &&
    'd' in data &&
    typeof (data as any).toNumber === 'function'
  ) {
    return (data as any).toNumber();
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeJsonSafe(item));
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeJsonSafe(value);
    }
    return result;
  }

  return data;
}
