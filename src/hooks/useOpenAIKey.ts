/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 09:58:56
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "openai_api_key";

export interface UseOpenAIKeyReturn {
  apiKey: string | null;
  isConfigured: boolean;
  saveApiKey: (key: string) => void;
  clearApiKey: () => void;
  showApiKeyModal: boolean;
  setShowApiKeyModal: (show: boolean) => void;
  checkApiKey: () => boolean;
}

export function useOpenAIKey(): UseOpenAIKeyReturn {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // 监听 localStorage 变化（跨标签页同步）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setApiKey(e.newValue);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const saveApiKey = useCallback((key: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, key);
      setApiKey(key);
      setShowApiKeyModal(false);
    }
  }, []);

  const clearApiKey = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      setApiKey(null);
    }
  }, []);

  const checkApiKey = useCallback((): boolean => {
    if (!apiKey) {
      setShowApiKeyModal(true);
      return false;
    }
    return true;
  }, [apiKey]);

  return {
    apiKey,
    isConfigured: !!apiKey,
    saveApiKey,
    clearApiKey,
    showApiKeyModal,
    setShowApiKeyModal,
    checkApiKey,
  };
}
