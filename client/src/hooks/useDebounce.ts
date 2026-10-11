import { useState, useEffect, useRef } from 'react';

/**
 * Generic debounce hook that delays updating the returned value
 * until the specified delay has passed since the last change.
 * Uses stable primitive serialization in the effect dependencies
 * to prevent timer churn and cancellation on unstable object references.
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const valueRef = useRef<T>(value);
  valueRef.current = value;

  // Derive stable primitive representation for dependency tracking
  const serializedValue =
    typeof value === 'object' && value !== null ? JSON.stringify(value) : value;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(valueRef.current);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [serializedValue, delayMs]);

  return debouncedValue;
}
