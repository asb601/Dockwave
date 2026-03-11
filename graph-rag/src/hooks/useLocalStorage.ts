"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook for persistent state backed by localStorage.
 * Falls back gracefully when localStorage is unavailable (SSR, private mode).
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore write errors (quota exceeded, private mode, etc.)
        }
        return next;
      });
    },
    [key]
  );

  // Sync with other tabs
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== key) return;
      try {
        setStoredValue(e.newValue ? (JSON.parse(e.newValue) as T) : initialValue);
      } catch {
        // ignore parse errors
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key, initialValue]);

  return [storedValue, setValue];
}
