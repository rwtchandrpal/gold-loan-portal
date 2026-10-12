import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '../api/client.js';
import { useDebounce } from './useDebounce.js';
import type { LoanScheme, QuoteResponse } from '../types/api.js';

export interface InputValidationErrors {
  grossWeight?: string;
  netWeight?: string;
  karat?: string;
}

export interface UseQuotesParams {
  grossWeight: string;
  netWeight: string;
  karat: number;
  schemes: LoanScheme[];
  initialQuotes?: Record<string, QuoteResponse>;
  initialApplicantData?: {
    grossWeightGrams: string;
    netWeightGrams: string;
    karat: number;
  };
  onUpdateWeights?: (gross: string, net: string, karat: number) => void;
}

export interface UseQuotesResult {
  quotesByPlan: Record<string, QuoteResponse>;
  loadingQuotes: boolean;
  quoteError: string | null;
  activeQuoteInputKey: string | null;
  currentCanonicalKey: string | null;
  isValid: boolean;
  validationErrors: InputValidationErrors;
  refetchQuotes: () => void;
}

/**
 * Validates weights and karat against business rules and API schema.
 */
export function validateQuoteInputs(
  gross: string,
  net: string,
  karat: number
): { isValid: boolean; errors: InputValidationErrors } {
  const errors: InputValidationErrors = {};
  const trimmedGross = gross ? gross.trim() : '';
  const trimmedNet = net ? net.trim() : '';
  const grossNum = parseFloat(trimmedGross);
  const netNum = parseFloat(trimmedNet);

  // Gross weight validation
  if (!trimmedGross) {
    errors.grossWeight = 'Gross weight is required';
  } else if (isNaN(grossNum) || grossNum <= 0) {
    errors.grossWeight = 'Gross weight must be greater than 0 grams';
  } else if (grossNum > 1000) {
    errors.grossWeight = 'Gross weight cannot exceed 1000 grams';
  } else if (!/^\d+(\.\d{1,2})?$/.test(trimmedGross)) {
    errors.grossWeight = 'Max 2 decimal places allowed';
  }

  // Net weight validation
  if (!trimmedNet) {
    errors.netWeight = 'Net weight is required';
  } else if (isNaN(netNum) || netNum <= 0) {
    errors.netWeight = 'Net weight must be greater than 0 grams';
  } else if (netNum > 1000) {
    errors.netWeight = 'Net weight cannot exceed 1000 grams';
  } else if (!/^\d+(\.\d{1,2})?$/.test(trimmedNet)) {
    errors.netWeight = 'Max 2 decimal places allowed';
  } else if (!isNaN(grossNum) && grossNum > 0 && netNum > grossNum) {
    errors.netWeight = 'Net weight cannot exceed gross weight';
  }

  // Karat validation
  if (![18, 22, 24].includes(karat)) {
    errors.karat = 'Select a valid karat purity (18K, 22K, or 24K)';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Formats canonical key representing exact weight and purity inputs.
 */
export function toCanonicalKey(gross: string, net: string, karat: number): string | null {
  const validation = validateQuoteInputs(gross, net, karat);
  if (!validation.isValid) return null;
  const g = parseFloat(gross.trim());
  const n = parseFloat(net.trim());
  return `${g.toFixed(2)}:${n.toFixed(2)}:${karat}`;
}

export function useQuotes({
  grossWeight,
  netWeight,
  karat,
  schemes,
  initialQuotes,
  initialApplicantData,
  onUpdateWeights,
}: UseQuotesParams): UseQuotesResult {
  // 1. Instant validation of current inputs
  const currentValidation = useMemo(
    () => validateQuoteInputs(grossWeight, netWeight, karat),
    [grossWeight, netWeight, karat]
  );

  const currentCanonicalKey = useMemo(
    () => (currentValidation.isValid ? toCanonicalKey(grossWeight, netWeight, karat) : null),
    [grossWeight, netWeight, karat, currentValidation.isValid]
  );

  // Check if initialQuotes match the initial inputs on mount
  const initialMatchesOnMount = useMemo(() => {
    if (!initialQuotes || Object.keys(initialQuotes).length === 0 || !initialApplicantData) {
      return false;
    }
    const initialKey = toCanonicalKey(
      initialApplicantData.grossWeightGrams,
      initialApplicantData.netWeightGrams,
      initialApplicantData.karat
    );
    const currKey = toCanonicalKey(grossWeight, netWeight, karat);
    return Boolean(initialKey && currKey && initialKey === currKey);
  }, [initialQuotes, initialApplicantData, grossWeight, netWeight, karat]);

  // Quotes state initialized if initialQuotes match current inputs
  const [quotesByPlan, setQuotesByPlan] = useState<Record<string, QuoteResponse>>(() => {
    if (initialMatchesOnMount && initialQuotes) {
      return initialQuotes;
    }
    return {};
  });

  const [activeQuoteInputKey, setActiveQuoteInputKey] = useState<string | null>(() => {
    if (initialMatchesOnMount && initialApplicantData) {
      return toCanonicalKey(
        initialApplicantData.grossWeightGrams,
        initialApplicantData.netWeightGrams,
        initialApplicantData.karat
      );
    }
    return null;
  });

  const [loadingQuotes, setLoadingQuotes] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Manual retry trigger
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const refetchQuotes = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  // Request cancellation & concurrency controls
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRef = useRef<number>(0);

  // 2. Debounce inputs to prevent excessive network calls (~300ms)
  const weightsToDebounce = useMemo(
    () => ({ grossWeight, netWeight, karat, retryNonce }),
    [grossWeight, netWeight, karat, retryNonce]
  );
  const debouncedWeights = useDebounce(weightsToDebounce, 300);

  // Validate debounced inputs
  const debouncedValidation = useMemo(
    () =>
      validateQuoteInputs(
        debouncedWeights.grossWeight,
        debouncedWeights.netWeight,
        debouncedWeights.karat
      ),
    [debouncedWeights.grossWeight, debouncedWeights.netWeight, debouncedWeights.karat]
  );

  const debouncedCanonicalKey = useMemo(
    () =>
      debouncedValidation.isValid
        ? toCanonicalKey(
            debouncedWeights.grossWeight,
            debouncedWeights.netWeight,
            debouncedWeights.karat
          )
        : null,
    [
      debouncedWeights.grossWeight,
      debouncedWeights.netWeight,
      debouncedWeights.karat,
      debouncedValidation.isValid,
    ]
  );

  // Synchronize debounced state and calculate quotes
  useEffect(() => {
    // If debounced inputs are invalid: abort in-flight requests and clear stale quotes immediately
    if (!debouncedValidation.isValid || !debouncedCanonicalKey) {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      activeGenerationRef.current++;
      setLoadingQuotes(false);
      setQuoteError(null);
      setQuotesByPlan({});
      setActiveQuoteInputKey(null);
      return;
    }

    // If schemes are not yet available, wait
    if (schemes.length === 0) {
      return;
    }

    // If quotes already exist for this exact canonical key and no manual retry was requested
    if (activeQuoteInputKey === debouncedCanonicalKey && Object.keys(quotesByPlan).length > 0 && retryNonce === 0) {
      return;
    }

    // Cancel any previous in-flight quote request
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    const generationId = ++activeGenerationRef.current;
    const targetKey = debouncedCanonicalKey;

    const grossNum = parseFloat(debouncedWeights.grossWeight.trim());
    const netNum = parseFloat(debouncedWeights.netWeight.trim());
    const currentKarat = debouncedWeights.karat;

    async function fetchQuotes() {
      setLoadingQuotes(true);
      setQuoteError(null);

      try {
        const quotePromises = schemes.map(async (scheme) => {
          const quote = await api.getQuote(
            {
              grossWeightGrams: grossNum,
              netWeightGrams: netNum,
              karat: currentKarat,
              selectedPlanId: scheme.id,
            },
            abortController.signal
          );
          return { schemeId: scheme.id, quote };
        });

        const results = await Promise.all(quotePromises);

        // Only commit if this request is still the active generation
        if (generationId === activeGenerationRef.current) {
          const map: Record<string, QuoteResponse> = {};
          for (const item of results) {
            map[item.schemeId] = item.quote;
          }
          setQuotesByPlan(map);
          setActiveQuoteInputKey(targetKey);
          setLoadingQuotes(false);
          setQuoteError(null);

          if (onUpdateWeights) {
            onUpdateWeights(
              debouncedWeights.grossWeight,
              debouncedWeights.netWeight,
              debouncedWeights.karat
            );
          }
        }
      } catch (err: any) {
        // Normal control-flow event: AbortError should be silently discarded
        if (
          err?.name === 'AbortError' ||
          (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
        ) {
          return;
        }

        // Only commit error if this request is still the active generation
        if (generationId === activeGenerationRef.current) {
          setQuoteError(err?.message || 'Unable to calculate live quotation. Please retry.');
          setQuotesByPlan({});
          setActiveQuoteInputKey(null);
          setLoadingQuotes(false);
        }
      }
    }

    fetchQuotes();

    return () => {
      abortController.abort();
    };
  }, [
    debouncedCanonicalKey,
    debouncedValidation.isValid,
    debouncedWeights,
    schemes,
    retryNonce,
    activeQuoteInputKey,
    onUpdateWeights,
  ]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Compute final valid quote map: only return quotes when current live inputs match active canonical key
  const effectiveQuotes = useMemo(() => {
    if (!currentValidation.isValid || !currentCanonicalKey) {
      return {};
    }
    if (activeQuoteInputKey !== currentCanonicalKey) {
      return {};
    }
    return quotesByPlan;
  }, [currentValidation.isValid, currentCanonicalKey, activeQuoteInputKey, quotesByPlan]);

  return {
    quotesByPlan: effectiveQuotes,
    loadingQuotes,
    quoteError,
    activeQuoteInputKey,
    currentCanonicalKey,
    isValid: currentValidation.isValid,
    validationErrors: currentValidation.errors,
    refetchQuotes,
  };
}
