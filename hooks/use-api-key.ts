"use client";

import { useEffect } from "react";
import useLocalStorageState from "use-local-storage-state";

const OPENAI_API_KEY_STORAGE_KEY = "openai_api_key";
const LEGACY_API_KEY_STORAGE_KEY = "together_api_key";

export function useApiKey(): [string | null, (key: string | null) => void] {
  const [apiKey, setApiKey] = useLocalStorageState<string | null>(
    OPENAI_API_KEY_STORAGE_KEY,
    { defaultValue: null },
  );

  useEffect(() => {
    if (apiKey !== null) return;

    const legacyValue = window.localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY);
    if (!legacyValue) return;

    try {
      const parsed = JSON.parse(legacyValue);
      if (typeof parsed === "string" && parsed) {
        setApiKey(parsed);
        window.localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
      }
    } catch {
      setApiKey(legacyValue);
      window.localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
    }
  }, [apiKey, setApiKey]);

  return [apiKey, setApiKey];
}
