/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:40:53
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useCallback, useEffect } from "react";
import { AIProvider, getProvider, getDefaultProvider } from "@/config/aiProviders";

const CURRENT_PROVIDER_KEY = "ai_current_provider";
const PROVIDER_KEY_PREFIX = "ai_provider_key_";
const CUSTOM_BASE_URL_KEY = "ai_custom_base_url";
const CUSTOM_MODEL_KEY = "ai_custom_model";

export interface UseAIProviderReturn {
  currentProvider: AIProvider;
  apiKey: string | null;
  isConfigured: boolean;
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;
  saveProvider: (provider: AIProvider) => void;
  saveKey: (key: string) => void;
  saveCustomConfig: (baseURL: string, model: string) => void;
  clearConfig: () => void;
  checkConfig: () => boolean;
  getCurrentConfig: () => {
    provider: AIProvider;
    apiKey: string | null;
    baseURL?: string;
    model?: string;
  };
}

export function useAIProvider(): UseAIProviderReturn {
  const [currentProviderId, setCurrentProviderId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CURRENT_PROVIDER_KEY) || getDefaultProvider().id;
    }
    return getDefaultProvider().id;
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const currentProvider = getProvider(currentProviderId) || getDefaultProvider();

  const apiKey =
    typeof window !== "undefined"
      ? localStorage.getItem(`${PROVIDER_KEY_PREFIX}${currentProviderId}`)
      : null;

  const customBaseURL =
    typeof window !== "undefined" ? localStorage.getItem(CUSTOM_BASE_URL_KEY) : null;

  const customModel = typeof window !== "undefined" ? localStorage.getItem(CUSTOM_MODEL_KEY) : null;

  // 监听 localStorage 变化
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CURRENT_PROVIDER_KEY) {
        setCurrentProviderId(e.newValue || getDefaultProvider().id);
      } else if (e.key?.startsWith(PROVIDER_KEY_PREFIX)) {
        // 强制组件重新渲染
        const providerId = e.key.replace(PROVIDER_KEY_PREFIX, "");
        setCurrentProviderId(localStorage.getItem(CURRENT_PROVIDER_KEY) || providerId);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const saveProvider = useCallback((provider: AIProvider) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(CURRENT_PROVIDER_KEY, provider.id);
      setCurrentProviderId(provider.id);
    }
  }, []);

  const saveKey = useCallback(
    (key: string) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(`${PROVIDER_KEY_PREFIX}${currentProviderId}`, key);
        setShowSettingsModal(false);
      }
    },
    [currentProviderId],
  );

  const saveCustomConfig = useCallback((baseURL: string, model: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(CUSTOM_BASE_URL_KEY, baseURL);
      localStorage.setItem(CUSTOM_MODEL_KEY, model);
      setShowSettingsModal(false);
    }
  }, []);

  const clearConfig = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(`${PROVIDER_KEY_PREFIX}${currentProviderId}`);
      if (currentProviderId === "custom") {
        localStorage.removeItem(CUSTOM_BASE_URL_KEY);
        localStorage.removeItem(CUSTOM_MODEL_KEY);
      }
    }
  }, [currentProviderId]);

  const checkConfig = useCallback((): boolean => {
    if (!currentProvider) {
      // 触发全局设置弹窗事件
      window.dispatchEvent(new CustomEvent("open-ai-settings"));
      return false;
    }

    if (currentProviderId === "custom") {
      if (!apiKey || !customBaseURL || !customModel) {
        window.dispatchEvent(new CustomEvent("open-ai-settings"));
        return false;
      }
    } else {
      if (!apiKey) {
        window.dispatchEvent(new CustomEvent("open-ai-settings"));
        return false;
      }
    }

    return true;
  }, [currentProvider, currentProviderId, apiKey, customBaseURL, customModel]);

  const getCurrentConfig = useCallback(() => {
    return {
      provider: currentProvider,
      apiKey,
      baseURL: currentProviderId === "custom" ? customBaseURL || undefined : undefined,
      model: currentProviderId === "custom" ? customModel || undefined : undefined,
    };
  }, [currentProvider, currentProviderId, apiKey, customBaseURL, customModel]);

  return {
    currentProvider,
    apiKey,
    isConfigured:
      !!apiKey && (currentProviderId !== "custom" || (!!customBaseURL && !!customModel)),
    showSettingsModal,
    setShowSettingsModal,
    saveProvider,
    saveKey,
    saveCustomConfig,
    clearConfig,
    checkConfig,
    getCurrentConfig,
  };
}
