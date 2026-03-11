"use client";

import { useCallback, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generic hook for async operations with loading/error state.
 * Returns [state, execute] where execute triggers the async fn.
 */
export function useAsync<T>(
  fn: (...args: unknown[]) => Promise<T>
): [AsyncState<T>, (...args: unknown[]) => Promise<T | null>] {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setState({ data: null, loading: true, error: null });
      try {
        const result = await fn(...args);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [fn]
  );

  return [state, execute];
}
