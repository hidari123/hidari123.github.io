/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

export interface Model {
  id: string;
  name: string;
  /** 模型的定位说明，用于在设置弹窗里解释「该用哪个」 */
  note?: string;
  /** 是否支持 reasoning/thinking 类输出 */
  reasoning?: boolean;
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

/**
 * 支持的服务商。
 *
 * 模型列表只放「现在还能用且值得展示」的。放一个已经过时的模型
 * （比如 gpt-3.5-turbo）在面试场景里是减分的——面试官会认为你没跟进。
 */
export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "国产大模型，API 兼容 OpenAI 格式，价格低",
    baseURL: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat", note: "通用对话，日常首选" },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        note: "带思维链，复杂推理更强，稍慢",
        reasoning: true,
      },
      { id: "deepseek-coder", name: "DeepSeek Coder", note: "代码补全与解释" },
    ],
    defaultModel: "deepseek-chat",
    keyPlaceholder: "请输入 DeepSeek API Key",
    keyLink: "https://platform.deepseek.com/api_keys",
    keyLinkText: "获取 DeepSeek API Key",
    freeCredits: "新用户注册即送免费额度",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT 开发者平台，生态最全",
    baseURL: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o mini", note: "便宜快，日常够用" },
      { id: "gpt-4o", name: "GPT-4o", note: "综合能力更强" },
      {
        id: "o3-mini",
        name: "o3-mini",
        note: "推理模型，适合需要推导的问题",
        reasoning: true,
      },
    ],
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "请输入 OpenAI API Key (sk-...)",
    keyLink: "https://platform.openai.com/api-keys",
    keyLinkText: "获取 OpenAI API Key",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow 硅基流动",
    description: "国内聚合平台，一个 Key 调多家开源模型",
    baseURL: "https://api.siliconflow.cn/v1",
    models: [
      { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen2.5 7B", note: "阿里通义千问" },
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen2.5 72B", note: "更强的千问大参数版本" },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek-V3", note: "开源权重，可私有化" },
      { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2", note: "长上下文见长" },
    ],
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    keyPlaceholder: "请输入 SiliconFlow API Key",
    keyLink: "https://cloud.siliconflow.cn/account/ak",
    keyLinkText: "获取 SiliconFlow API Key",
    freeCredits: "注册送免费额度",
  },
  {
    id: "custom",
    name: "自定义",
    description: "其他兼容 OpenAI API 格式的服务商（Ollama / vLLM / 各家网关）",
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
