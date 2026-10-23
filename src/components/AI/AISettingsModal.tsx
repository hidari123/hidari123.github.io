/**
 * AI 设置弹窗
 *
 * 三个变化：
 *
 * 1. 去掉 DeepSeek 的「推荐」角标。原来只有它一家挂着绿标，整站看起来像
 *    在给单一服务打广告。用户要的是「我有好几家，帮我按顺序用」，
 *    不是「你只应该用这一家」。
 * 2. 一个供应商可以加多个 key。多个 key 的现实动机是额度和限流分摊，
 *    不只是「多开几个」。
 * 3. 供应商可以拖动排序，最上面的就是首选。调用失败时按这个顺序降级。
 */

import { useState, useEffect, useCallback } from "react";
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
  Plus,
  GripVertical,
  Star,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { AIProvider, AI_PROVIDERS } from "@/config/aiProviders";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import { getProviderKeys, setProviderKeys, getKeyHealth } from "@/services/keyPool";

const CUSTOM_BASE_URL_KEY = "ai_custom_base_url";
const CUSTOM_MODEL_KEY = "ai_custom_model";
const PREFERENCE_KEY = "ai_provider_order";

/** 读取用户排好的供应商优先级 */
function loadOrder(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 忽略损坏的存储
  }
  return [];
}

function saveOrder(order: string[]): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(order));
  } catch {
    // 忽略
  }
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: AIProvider, key: string, baseURL?: string, model?: string) => void;
  currentProviderId?: string;
  /** 降级链发生变化时通知上层，让 UI 能显示「实际用的哪一家」 */
  onCredentialsChanged?: () => void;
}

export const AISettingsModal = ({
  isOpen,
  onClose,
  onSave,
  currentProviderId,
  onCredentialsChanged,
}: AISettingsModalProps) => {
  const [step, setStep] = useState<"select" | "config">("select");
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  /** 该供应商下已保存的 key 列表 */
  const [keys, setKeys] = useState<string[]>([]);
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [order, setOrder] = useState<string[]>([]);

  // 遮罩铺满视口不代表 body 锁住了 —— 不锁的话滚轮会把底层页面一起滚走。
  useModalScrollLock(isOpen);

  // 按用户偏好排序展示；没排过就是配置里的自然顺序
  const orderedProviders = (): AIProvider[] => {
    if (order.length === 0) return AI_PROVIDERS;
    const byId = new Map(AI_PROVIDERS.map((p) => [p.id, p]));
    const sorted = order.map((id) => byId.get(id)).filter((p): p is AIProvider => !!p);
    const rest = AI_PROVIDERS.filter((p) => !order.includes(p.id));
    return [...sorted, ...rest];
  };

  const moveProvider = useCallback(
    (id: string, dir: -1 | 1) => {
      const list = orderedProviders().map((p) => p.id);
      const i = list.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setOrder(list);
      saveOrder(list);
    },
    [order],
  );

  // 打开时读回所有状态
  useEffect(() => {
    if (!isOpen) return;

    setOrder(loadOrder());
    setError("");
    setInputKey("");
    setShowKey(false);

    const savedProviderId = currentProviderId || localStorage.getItem("ai_current_provider");
    const provider = AI_PROVIDERS.find((p) => p.id === savedProviderId);
    if (provider) {
      setSelectedProvider(provider);
      setKeys(getProviderKeys(provider.id));
      if (provider.id === "custom") {
        setBaseURL(localStorage.getItem(CUSTOM_BASE_URL_KEY) || "");
        setModel(localStorage.getItem(CUSTOM_MODEL_KEY) || "");
      }
    }
  }, [isOpen, currentProviderId]);

  const handleClose = () => {
    setStep("select");
    setSelectedProvider(null);
    setKeys([]);
    setInputKey("");
    setShowKey(false);
    setBaseURL("");
    setModel("");
    setError("");
    onClose();
  };

  const handleProviderSelect = (provider: AIProvider) => {
    setSelectedProvider(provider);
    setKeys(getProviderKeys(provider.id));
    setInputKey("");
    setStep("config");
    setError("");
  };

  /** 把输入框里的 key 追加到列表，不覆盖已有 key */
  const addKey = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError("请输入 API Key");
      return;
    }
    if (keys.includes(trimmed)) {
      setError("这个 Key 已经添加过了");
      return;
    }
    // OpenAI 的 key 格式比较特殊，填错了当场报错比等到调用时失败好
    if (selectedProvider?.id === "openai" && !trimmed.startsWith("sk-")) {
      setError("OpenAI API Key 应该以 sk- 开头");
      return;
    }

    setKeys([...keys, trimmed]);
    setInputKey("");
    setError("");
  };

  const removeKey = (index: number) => {
    setKeys(keys.filter((_, i) => i !== index));
  };

  const moveKey = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[index], next[j]] = [next[j], next[index]];
    setKeys(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProvider) {
      setError("请选择 AI 服务商");
      return;
    }

    // 先把输入框里没点「添加」的那一个收进去
    let finalKeys = keys;
    const pending = inputKey.trim();
    if (pending && !keys.includes(pending)) {
      finalKeys = [...keys, pending];
    }

    if (finalKeys.length === 0) {
      setError("请至少添加一个 API Key");
      return;
    }

    if (selectedProvider.id === "custom") {
      if (!baseURL.trim()) {
        setError("请输入 API Base URL");
        return;
      }
      if (!model.trim()) {
        setError("请输入模型名称");
        return;
      }
      setProviderKeys(selectedProvider.id, finalKeys);
      localStorage.setItem(CUSTOM_BASE_URL_KEY, baseURL.trim());
      localStorage.setItem(CUSTOM_MODEL_KEY, model.trim());
      // 选中的就是首选，写进偏好顺序的第一位
      saveOrder([selectedProvider.id, ...loadOrder().filter((id) => id !== selectedProvider.id)]);
      onSave(selectedProvider, finalKeys[0], baseURL.trim(), model.trim());
      onCredentialsChanged?.();
    } else {
      setProviderKeys(selectedProvider.id, finalKeys);
      saveOrder([selectedProvider.id, ...loadOrder().filter((id) => id !== selectedProvider.id)]);
      // 沿用原签名：只上报第一个 key 供旧调用方使用
      onSave(selectedProvider, finalKeys[0]);
      onCredentialsChanged?.();
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
                      {step === "select" ? "选择并排序 AI 服务商" : `配置 ${selectedProvider?.name}`}
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
                  <div className="grid gap-3">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-[#6366f1]/5 border border-[#6366f1]/20 text-sm text-[var(--text-secondary)]">
                      <GripVertical className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#6366f1]" />
                      <span>
                        排在最上面的是<b className="text-[var(--text-primary)]">首选</b>。
                        调用失败（余额不足、限流、key 失效）时会自动按顺序试下一个。
                      </span>
                    </div>

                    {orderedProviders().map((provider: AIProvider, idx: number) => {
                      const configured = getProviderKeys(provider.id).length;
                      return (
                        <div
                          key={provider.id}
                          className="flex items-center gap-2 p-3 rounded-xl border border-[var(--border)] hover:border-[#6366f1] hover:bg-[#6366f1]/5 transition-all group"
                        >
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => moveProvider(provider.id, -1)}
                              disabled={idx === 0}
                              aria-label="上移"
                              className="p-0.5 text-[var(--text-secondary)] hover:text-[#6366f1] disabled:opacity-30 transition-colors"
                            >
                              <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveProvider(provider.id, 1)}
                              disabled={idx === orderedProviders().length - 1}
                              aria-label="下移"
                              className="p-0.5 text-[var(--text-secondary)] hover:text-[#6366f1] disabled:opacity-30 transition-colors"
                            >
                              <ChevronRight className="w-3 h-3 rotate-90" />
                            </button>
                          </div>

                          <button
                            onClick={() => handleProviderSelect(provider)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#6366f1]">
                                {provider.name}
                              </h3>
                              {idx === 0 && (
                                <span className="px-2 py-0.5 text-xs bg-[#6366f1]/10 text-[#6366f1] rounded-full inline-flex items-center gap-1">
                                  <Star className="w-3 h-3" />
                                  首选
                                </span>
                              )}
                              {configured > 0 && (
                                <span className="px-2 py-0.5 text-xs bg-green-500/10 text-green-600 rounded-full">
                                  {configured} 个 Key
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {provider.description}
                            </p>
                            {provider.freeCredits && (
                              <p className="text-sm text-green-600 font-medium mt-1">
                                {provider.freeCredits}
                              </p>
                            )}
                          </button>
                        </div>
                      );
                    })}
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
                    <button
                      type="button"
                      onClick={() => setStep("select")}
                      className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      返回选择服务商
                    </button>

                    {/* 已保存的 key 列表 */}
                    {keys.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                          已添加的 Key（按顺序使用）
                        </label>
                        <div className="flex flex-col gap-2">
                          {keys.map((k, i) => {
                            const degraded = getKeyHealth(selectedProvider!.id, i) === "deprioritized";
                            return (
                              <div
                                key={`${i}-${k.slice(-4)}`}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]"
                              >
                                <span className="text-xs text-[var(--text-secondary)] w-5 shrink-0">
                                  {i + 1}
                                </span>
                                <code className="flex-1 text-xs font-mono truncate text-[var(--text-primary)]">
                                  {showKey ? k : `${k.slice(0, 6)}••••••${k.slice(-4)}`}
                                </code>
                                {degraded && (
                                  <span
                                    className="text-xs text-amber-600 inline-flex items-center gap-1"
                                    title="这个 key 最近失败过，会被排到最后，但不会被删"
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    失败过
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => moveKey(i, -1)}
                                  disabled={i === 0}
                                  aria-label="上移"
                                  className="p-1 text-[var(--text-secondary)] hover:text-[#6366f1] disabled:opacity-30 transition-colors"
                                >
                                  <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveKey(i, 1)}
                                  disabled={i === keys.length - 1}
                                  aria-label="下移"
                                  className="p-1 text-[var(--text-secondary)] hover:text-[#6366f1] disabled:opacity-30 transition-colors"
                                >
                                  <ChevronRight className="w-3 h-3 rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeKey(i)}
                                  aria-label="删除"
                                  className="p-1 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* API Key 输入 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                        添加 API Key
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                          <input
                            type={showKey ? "text" : "password"}
                            value={inputKey}
                            onChange={(e) => setInputKey(e.target.value)}
                            onKeyDown={(e) => {
                              // 回车就加入列表，不用先去点按钮
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addKey();
                              }
                            }}
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
                        <button
                          type="button"
                          onClick={addKey}
                          className="shrink-0 px-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[#6366f1] hover:text-[#6366f1] transition-colors inline-flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          添加
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
                      <p className="text-xs text-[var(--text-secondary)] mt-2">
                        可以加多个：不同 key 的额度和限流是分开的，
                        按从上到下的顺序用。
                      </p>
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
                            placeholder="gpt-4o-mini"
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