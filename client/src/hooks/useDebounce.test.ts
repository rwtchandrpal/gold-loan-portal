import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce.js';

describe('useDebounce Hook (BUG-05 Regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays updating the debounced value until delayMs has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );

    expect(result.current).toBe('initial');

    rerender({ value: 'updated' });
    // Immediately after change, still initial
    expect(result.current).toBe('initial');

    // Advance 200ms (not yet 300ms)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('initial');

    // Advance remaining 100ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('updated');
  });

  it('debounces rapid input changes and commits only the final value', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'input-1' } }
    );

    rerender({ value: 'input-2' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('input-1');

    rerender({ value: 'input-3' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('input-1');

    rerender({ value: 'input-4' });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('input-1');

    // Full 300ms after the last input
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('input-4');
  });

  it('does not restart or cancel debounce timer when receiving a new object reference with identical contents', () => {
    // Initial render with an object
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: { gross: '50.00', net: '45.00', karat: 22 } } }
    );

    expect(result.current).toEqual({ gross: '50.00', net: '45.00', karat: 22 });

    // Step 1: User types new net weight at t=0
    rerender({ value: { gross: '50.00', net: '46.00', karat: 22 } });

    // Step 2: At t=150ms, an unrelated state change causes parent to re-render,
    // generating a brand new object reference with identical data { gross: '50.00', net: '46.00', karat: 22 }
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toEqual({ gross: '50.00', net: '45.00', karat: 22 });

    rerender({ value: { gross: '50.00', net: '46.00', karat: 22 } });

    // In the buggy implementation, creating a new object reference restarted the timer to 0,
    // meaning at t=300ms (150ms later) it would still be uncommitted.
    // With stable serialization, the 150ms already elapsed counts towards the 300ms total,
    // so advancing 150ms more reaches the 300ms target and commits!
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toEqual({ gross: '50.00', net: '46.00', karat: 22 });
  });
});
