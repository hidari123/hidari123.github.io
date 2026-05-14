/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:16:23
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

export interface Model {
  id: string;
  name: string;
}

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  baseURL: string;
  models: Model[];
  defaultModel: string;
  keyPlaceholder: string;
  keyLink: string;
  keyLinkText: string;
  requiresBaseURL?: boolean;
  requiresModel?: boolean;
  freeCredits?: string;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "国产大模型，注册即送免费额度，无需支付方式",
    baseURL: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-coder", name: "DeepSeek Coder" },
    ],
    defaultModel: "deepseek-chat",
    keyPlaceholder: "请输入 DeepSeek API Key",
    keyLink: "https://platform.deepseek.com/api_keys",
    keyLinkText: "获取 DeepSeek API Key",
    freeCredits: "🎁 新用户注册即送 500 万 tokens 免费额度",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT 开发者平台，功能强大",
    baseURL: "https://api.openai.com/v1",
    models: [
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    ],
    defaultModel: "gpt-3.5-turbo",
    keyPlaceholder: "请输入 OpenAI API Key (sk-...)",
    keyLink: "https://platform.openai.com/api-keys",
    keyLinkText: "获取 OpenAI API Key",
  },
  {
    id: "custom",
    name: "自定义",
    description: "使用其他兼容 OpenAI API 格式的服务商",
    baseURL: "",
    models: [],
    defaultModel: "",
    keyPlaceholder: "请输入 API Key",
    keyLink: "",
    keyLinkText: "",
    requiresBaseURL: true,
    requiresModel: true,
  },
];

export const getProvider = (id: string): AIProvider | undefined => {
  return AI_PROVIDERS.find((p) => p.id === id);
};

export const getDefaultProvider = (): AIProvider => {
  return AI_PROVIDERS[0];
};
