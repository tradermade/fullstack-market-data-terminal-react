import { useCallback, useEffect, useState } from "react";

function readPersistedValue(key, defaultValue, validate) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return defaultValue;
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) return defaultValue;
    return parsed;
  } catch {
    return defaultValue;
  }
}

/**
 * useState but backed by localStorage.
 * Serializes with JSON; pass validate to guard stale or invalid values.
 */
export function usePersistedState(key, defaultValue, validate) {
  const [entry, setEntry] = useState(() => ({
    key,
    value: readPersistedValue(key, defaultValue, validate),
  }));

  let value = entry.value;
  if (entry.key !== key) {
    value = readPersistedValue(key, defaultValue, validate);
    setEntry({ key, value });
  }

  const setValue = useCallback((nextValue) => {
    setEntry((prev) => {
      const base = prev.key === key
        ? prev.value
        : readPersistedValue(key, defaultValue, validate);
      const value = typeof nextValue === "function" ? nextValue(base) : nextValue;
      return { key, value };
    });
  }, [key, defaultValue, validate]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be full or unavailable in private mode.
    }
  }, [key, value]);

  return [value, setValue];
}
