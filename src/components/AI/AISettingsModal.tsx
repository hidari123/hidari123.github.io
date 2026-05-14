/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:34:03
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  Check,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { AIProvider, AI_PROVIDERS } from "@/config/aiProviders";

const PROVIDER_KEY_PREFIX = "ai_provider_key_";
const CUSTOM_BASE_URL_KEY = "ai_custom_base_url";
const CUSTOM_MODEL_KEY = "ai_custom_model";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: AIProvider, key: string, baseURL?: string, model?: string) => void;
  currentProviderId?: string;
}

export const AISettingsModal = ({
  isOpen,
  onClose,
  onSave,
  currentProviderId,
}: AISettingsModalProps) => {
  const [step, setStep] = useState<"select" | "config">("select");
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");

  // 当弹窗打开时，读取本地存储的配置
  useEffect(() => {
    if (isOpen) {
      const savedProviderId = localStorage.getItem("ai_current_provider") || currentProviderId;
      if (savedProviderId) {
        const provider = AI_PROVIDERS.find((p: AIProvider) => p.id === savedProviderId);
        if (provider) {
          setSelectedProvider(provider);
          // 读取对应的 API Key
          const savedKey = localStorage.getItem(`${PROVIDER_KEY_PREFIX}${savedProviderId}`);
          if (savedKey) {
            setInputKey(savedKey);
          }
          // 如果是自定义服务商，读取额外配置
          if (savedProviderId === "custom") {
            setBaseURL(localStorage.getItem(CUSTOM_BASE_URL_KEY) || "");
            setModel(localStorage.getItem(CUSTOM_MODEL_KEY) || "");
          }
        }
      }
    }
  }, [isOpen, currentProviderId]);

  const handleClose = () => {
    setStep("select");
    setSelectedProvider(null);
    setInputKey("");
    setShowKey(false);
    setBaseURL("");
    setModel("");
    setError("");
    onClose();
  };

  const handleProviderSelect = (provider: AIProvider) => {
    setSelectedProvider(provider);
    setStep("config");
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProvider) {
      setError("请选择 AI 服务商");
      return;
    }

    if (selectedProvider.id === "custom") {
      if (!inputKey.trim()) {
        setError("请输入 API Key");
        return;
      }
      if (!baseURL.trim()) {
        setError("请输入 API Base URL");
        return;
      }
      if (!model.trim()) {
        setError("请输入模型名称");
        return;
      }
      onSave(selectedProvider, inputKey.trim(), baseURL.trim(), model.trim());
    } else {
      const trimmedKey = inputKey.trim();
      if (!trimmedKey) {
        setError("请输入 API Key");
        return;
      }
      if (selectedProvider.id === "openai" && !trimmedKey.startsWith("sk-")) {
        setError("OpenAI API Key 应该以 sk- 开头");
        return;
      }
      onSave(selectedProvider, trimmedKey);
    }

    handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col">
              {/* 头部 */}
              <div className="relative p-6 pb-4 border-b border-[var(--border)]">
                <button
                  onClick={handleClose}
                  className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">AI 服务设置</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {step === "select" ? "选择 AI 服务商" : `配置 ${selectedProvider?.name}`}
                    </p>
                  </div>
                </div>

                {/* 步骤指示器 */}
                <div className="flex items-center gap-2 mt-4">
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      step === "select" ? "text-[#6366f1]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        step === "select" ? "bg-[#6366f1] text-white" : "bg-green-500 text-white"
                      }`}
                    >
                      {step === "config" ? <Check className="w-4 h-4" /> : "1"}
                    </div>
                    <span>选择服务商</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      step === "config" ? "text-[#6366f1]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        step === "config" ? "bg-[#6366f1] text-white" : "bg-[var(--bg-secondary)]"
                      }`}
                    >
                      2
                    </div>
                    <span>配置密钥</span>
                  </div>
                </div>
              </div>

              {/* 内容 */}
              <div className="flex-1 overflow-y-auto p-6">
                {step === "select" ? (
                  <div className="grid gap-4">
                    {AI_PROVIDERS.map((provider: AIProvider) => (
                      <button
                        key={provider.id}
                        onClick={() => handleProviderSelect(provider)}
                        className="text-left p-4 rounded-xl border border-[var(--border)] hover:border-[#6366f1] hover:bg-[#6366f1]/5 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#6366f1]">
                            {provider.name}
                          </h3>
                          {provider.id === "deepseek" && (
                            <span className="px-2 py-1 text-xs bg-green-500/10 text-green-600 rounded-full">
                              推荐
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mb-2">
                          {provider.description}
                        </p>
                        {provider.freeCredits && (
                          <p className="text-sm text-green-600 font-medium">
                            {provider.freeCredits}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    {/* 服务商信息 */}
                    <div className="mb-6 p-4 rounded-xl bg-[#6366f1]/5 border border-[#6366f1]/20">
                      <div className="flex items-center gap-2 text-[#6366f1] mb-2">
                        <Sparkles className="w-5 h-5" />
                        <span className="font-medium">{selectedProvider?.name}</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {selectedProvider?.description}
                      </p>
                    </div>

                    {/* 返回按钮 */}
                    {step === "config" && (
                      <button
                        type="button"
                        onClick={() => setStep("select")}
                        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        返回选择服务商
                      </button>
                    )}

                    {/* API Key 输入 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                        API Key
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                        <input
                          type={showKey ? "text" : "password"}
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          placeholder={selectedProvider?.keyPlaceholder}
                          className="w-full pl-10 pr-10 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {selectedProvider?.keyLink && (
                        <a
                          href={selectedProvider.keyLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[#6366f1] hover:underline mt-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {selectedProvider.keyLinkText}
                        </a>
                      )}
                    </div>

                    {/* 自定义服务商额外配置 */}
                    {selectedProvider?.id === "custom" && (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                            API Base URL
                          </label>
                          <input
                            type="text"
                            value={baseURL}
                            onChange={(e) => setBaseURL(e.target.value)}
                            placeholder="https://api.example.com/v1"
                            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/50"
                          />
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            填写兼容 OpenAI API 格式的服务商地址
                          </p>
                        </div>

                        <div className="mb-4">
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                            模型名称
                          </label>
                          <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="gpt-3.5-turbo"
                            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/50"
                          />
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            填写要使用的模型 ID
                          </p>
                        </div>
                      </>
                    )}

                    {/* 错误提示 */}
                    {error && (
                      <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-500">{error}</p>
                      </div>
                    )}

                    {/* 提交按钮 */}
                    <button
                      type="submit"
                      className="w-full py-3 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-medium hover:opacity-90 transition-opacity"
                    >
                      保存配置
                    </button>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
