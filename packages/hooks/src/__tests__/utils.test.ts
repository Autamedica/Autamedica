import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsync, useDebounce } from '../utils';

// ==========================================
// useAsync
// ==========================================

describe('useAsync', () => {
  it('starts in loading state', () => {
    const asyncFn = () => new Promise<string>(() => {});
    const { result } = renderHook(() => useAsync(asyncFn));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('resolves with data on success', async () => {
    const asyncFn = () => Promise.resolve('test-data');
    const { result } = renderHook(() => useAsync(asyncFn));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe('test-data');
    expect(result.current.error).toBeNull();
  });

  it('sets error on rejection', async () => {
    const error = new Error('fetch failed');
    const asyncFn = () => Promise.reject(error);
    const { result } = renderHook(() => useAsync(asyncFn));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('re-executes when deps change', async () => {
    let callCount = 0;
    const asyncFn = () => {
      callCount++;
      return Promise.resolve(callCount);
    };

    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => useAsync(asyncFn, [dep]),
      { initialProps: { dep: 1 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toBe(1);

    rerender({ dep: 2 });

    await waitFor(() => {
      expect(result.current.data).toBe(2);
    });

    expect(callCount).toBe(2);
  });

  it('cancels stale requests on unmount', async () => {
    let resolve: (v: string) => void;
    const asyncFn = () =>
      new Promise<string>((r) => {
        resolve = r;
      });

    const { result, unmount } = renderHook(() => useAsync(asyncFn));

    expect(result.current.loading).toBe(true);
    unmount();

    // Resolve after unmount - should not cause state update
    act(() => {
      resolve!('stale');
    });

    // No error thrown from updating unmounted component
    expect(result.current.data).toBeNull();
  });

  it('handles typed data correctly', async () => {
    interface User {
      id: number;
      name: string;
    }
    const asyncFn = () => Promise.resolve({ id: 1, name: 'Alice' });
    const { result } = renderHook(() => useAsync<User>(asyncFn));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.id).toBe(1);
    expect(result.current.data?.name).toBe('Alice');
  });

  it('resets error state on new request', async () => {
    let shouldFail = true;
    const asyncFn = () => {
      if (shouldFail) return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    };

    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => useAsync(asyncFn, [dep]),
      { initialProps: { dep: 1 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).not.toBeNull();

    shouldFail = false;
    rerender({ dep: 2 });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('ok');
  });
});

// ==========================================
// useDebounce
// ==========================================

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('does not update before delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 500),
      { initialProps: { value: 'initial' } },
    );

    rerender({ value: 'updated' });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('initial');
  });

  it('updates after delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 500),
      { initialProps: { value: 'initial' } },
    );

    rerender({ value: 'updated' });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('updated');
  });

  it('resets timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'd' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Only 100ms since last change, should still be 'a'
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 300ms since last change ('d'), should now be 'd'
    expect(result.current).toBe('d');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useDebounce(value, 250),
      { initialProps: { value: 0 } },
    );

    rerender({ value: 42 });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe(42);
  });

  it('works with object values', () => {
    const initial = { query: '' };
    const updated = { query: 'search term' };

    const { result, rerender } = renderHook(
      ({ value }: { value: typeof initial }) => useDebounce(value, 500),
      { initialProps: { value: initial } },
    );

    rerender({ value: updated });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toEqual({ query: 'search term' });
  });

  it('cleans up timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { unmount } = renderHook(() => useDebounce('value', 500));
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
