/*
 * @Author: hidari
 * @Date: 2026-05-14 09:54
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 09:57:10
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState } from "react";
import { X, Key, ExternalLink, Eye, EyeOff, AlertCircle, Sparkles } from "lucide-react";
import { Modal } from "@/components/Common/Modal";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
}

export const ApiKeyModal = ({ isOpen, onClose, onSave }: ApiKeyModalProps) => {
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  // 滚动锁、Esc 关闭、遮罩点击、焦点管理都由 Modal 外壳统一处理，
  // 以前这里是单独调 useModalScrollLock 的五份之一。

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedKey = inputKey.trim();

    if (!trimmedKey) {
      setError("请输入 API Key");
      return;
    }

    if (!trimmedKey.startsWith("sk-")) {
      setError("API Key 格式不正确，应该以 sk- 开头");
      return;
    }

    onSave(trimmedKey);
    setInputKey("");
    setError("");
  };

  const handleClose = () => {
    setInputKey("");
    setError("");
    setShowKey(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} panelClassName="max-w-md">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl overflow-hidden">
          {/* 头部 */}
              <div className="relative p-6 pb-4">
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
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">配置 AI 功能</h2>
                    <p className="text-sm text-[var(--text-secondary)]">输入您的 OpenAI API Key</p>
                  </div>
                </div>
              </div>

              {/* 内容 */}
              <div className="px-6 pb-6">
                <form onSubmit={handleSubmit}>
                  {/* 输入框 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      API Key
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Key className="h-5 w-5 text-[var(--text-secondary)]" />
                      </div>
                      <input
                        type={showKey ? "text" : "password"}
                        value={inputKey}
                        onChange={(e) => {
                          setInputKey(e.target.value);
                          setError("");
                        }}
                        placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                        className={`w-full pl-10 pr-10 py-3 rounded-xl border ${
                          error
                            ? "border-red-500 focus:ring-red-500"
                            : "border-[var(--border)] focus:border-[#6366f1]"
                        } bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 transition-colors`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                      <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </div>
                    )}
                  </div>

                  {/* 提示信息 */}
                  <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-[#6366f1] flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-[var(--text-secondary)]">
                        <p className="mb-2">
                          您的 API Key
                          将安全地存储在浏览器本地（localStorage）中，不会发送到任何第三方服务器。
                        </p>
                        <p>
                          使用自己的 API Key 可以享受完整的 AI
                          功能，包括文章摘要、智能问答和代码解释。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 获取 Key 链接 */}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 mb-6 text-sm text-[#6366f1] hover:text-[#4f46e5] transition-colors"
                  >
                    <span>如何获取 OpenAI API Key</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  {/* 按钮 */}
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    保存并开始使用
                  </button>
                </form>
              </div>

              {/* 底部安全提示 */}
              <div className="px-6 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
                <p className="text-xs text-center text-[var(--text-secondary)]">
                  🔒 您的密钥仅存储在本地，不会被上传或共享
                </p>
              </div>
            </div>
    </Modal>
  );
};
