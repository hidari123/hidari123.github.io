/*
 * @Author: hidari
 * @Date: 2026-05-14 10:07
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 10:12:16
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { motion } from "framer-motion";
import { ExternalLink, Key, AlertCircle, CheckCircle, Sparkles } from "lucide-react";

export const AIHelp = () => {
  return (
    <div className="min-h-[calc(100vh-8rem)] py-12">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* 标题 */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-4">AI 功能帮助</h1>
            <p className="text-[var(--text-secondary)] text-lg">了解如何配置和使用博客的 AI 功能</p>
          </div>

          {/* DeepSeek 教程 */}
          <section className="mb-12">
            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <span className="text-2xl">🌊</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                    DeepSeek（推荐）
                  </h2>
                  <p className="text-green-600 font-medium">
                    🎁 新用户注册即送 500 万 tokens 免费额度
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                获取 API Key 步骤：
              </h3>
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                    1
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">访问 DeepSeek 开放平台</p>
                    <a
                      href="https://platform.deepseek.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#6366f1] hover:underline text-sm mt-1"
                    >
                      https://platform.deepseek.com
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                    2
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">注册账号</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                      使用手机号或邮箱注册，无需实名认证和支付方式
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                    3
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">获取 API Key</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                      进入「API Keys」页面，点击「Create API Key」按钮创建
                    </p>
                    <a
                      href="https://platform.deepseek.com/api_keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#6366f1] hover:underline text-sm mt-1"
                    >
                      直接访问 API Keys 页面
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                    4
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">复制并保存</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                      复制生成的 API Key，妥善保存，不要泄露给他人
                    </p>
                  </div>
                </li>
              </ol>

              <div className="flex items-start gap-2 p-4 bg-green-500/10 rounded-xl mt-4">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-600 font-medium">DeepSeek 优势</p>
                  <ul className="text-sm text-[var(--text-secondary)] mt-1 space-y-1">
                    <li>• 新用户赠送 500 万 tokens 免费额度</li>
                    <li>• 无需绑定信用卡或支付方式</li>
                    <li>• 支持 GPT-4 级别的模型</li>
                    <li>• 价格相对 OpenAI 更便宜</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* OpenAI 教程 */}
          <section className="mb-12">
            <div className="bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/20 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                  <span className="text-2xl">🤖</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)]">OpenAI</h2>
                  <p className="text-[var(--text-secondary)]">ChatGPT 开发者平台</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                获取 API Key 步骤：
              </h3>
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold">
                    1
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">访问 OpenAI 平台</p>
                    <a
                      href="https://platform.openai.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#6366f1] hover:underline text-sm mt-1"
                    >
                      https://platform.openai.com
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold">
                    2
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">注册或登录账号</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                      使用 Google 账号、Microsoft 账号或邮箱注册
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold">
                    3
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">绑定支付方式</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                      需要绑定信用卡（Visa、Mastercard 等）才能使用 API
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold">
                    4
                  </span>
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">获取 API Key</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                      进入「API Keys」页面，点击「Create new secret key」创建
                    </p>
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#6366f1] hover:underline text-sm mt-1"
                    >
                      直接访问 API Keys 页面
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </li>
              </ol>

              <div className="flex items-start gap-2 p-4 bg-amber-500/10 rounded-xl mt-4">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-600 font-medium">注意事项</p>
                  <ul className="text-sm text-[var(--text-secondary)] mt-1 space-y-1">
                    <li>• OpenAI API 需要绑定信用卡</li>
                    <li>• 新用户有 5 美元免费额度</li>
                    <li>• API Key 以「sk-」开头</li>
                    <li>• 请妥善保管 Key，不要泄露</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 自定义服务商 */}
          <section className="mb-12">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ec4899] to-[#f43f5e] flex items-center justify-center">
                  <Key className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)]">自定义服务商</h2>
                  <p className="text-[var(--text-secondary)]">使用其他兼容 OpenAI API 的服务商</p>
                </div>
              </div>

              <p className="text-[var(--text-secondary)] mb-4">
                如果你想使用其他 AI 服务商（如硅基流动、OneAPI 等），只要它们兼容 OpenAI 的 API
                格式， 就可以在「自定义」选项中配置。
              </p>

              <div className="space-y-3">
                <div className="p-4 bg-[var(--bg-secondary)] rounded-xl">
                  <h4 className="font-medium text-[var(--text-primary)] mb-2">配置项说明：</h4>
                  <ul className="text-sm text-[var(--text-secondary)] space-y-2">
                    <li>
                      <strong>API Key：</strong>服务商提供的访问密钥
                    </li>
                    <li>
                      <strong>API Base URL：</strong>服务商提供的 API 地址，如{" "}
                      <code className="px-2 py-1 bg-[var(--bg-card)] rounded">
                        https://api.example.com/v1
                      </code>
                    </li>
                    <li>
                      <strong>模型名称：</strong>要使用的模型 ID，如{" "}
                      <code className="px-2 py-1 bg-[var(--bg-card)] rounded">gpt-3.5-turbo</code>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 安全提示 */}
          <section className="mb-12">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <h2 className="text-xl font-bold text-red-500">安全提示</h2>
              </div>
              <ul className="space-y-2 text-[var(--text-secondary)]">
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  您的 API Key 仅存储在浏览器本地（localStorage）中
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  不会上传到任何服务器或第三方服务
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  请勿在公共电脑上保存 API Key
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  如果 Key 泄露，请立即在服务商平台删除并重新生成
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  建议设置 API Key 的使用限额，防止意外扣费
                </li>
              </ul>
            </div>
          </section>

          {/* 常见问题 */}
          <section>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">常见问题</h2>
            <div className="space-y-4">
              <details className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <summary className="p-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                  <h3 className="font-medium text-[var(--text-primary)]">
                    Q: API 请求失败怎么办？
                  </h3>
                </summary>
                <div className="px-4 pb-4 text-[var(--text-secondary)]">
                  <p>检查以下几点：</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>API Key 是否正确（不要有多余的空格）</li>
                    <li>API Key 是否还有额度</li>
                    <li>网络连接是否正常</li>
                    <li>服务商是否在维护</li>
                  </ul>
                </div>
              </details>

              <details className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <summary className="p-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                  <h3 className="font-medium text-[var(--text-primary)]">
                    Q: 如何查看 API 使用量？
                  </h3>
                </summary>
                <div className="px-4 pb-4 text-[var(--text-secondary)]">
                  <p>请前往对应服务商的控制台查看：</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>DeepSeek：platform.deepseek.com → Usage</li>
                    <li>OpenAI：platform.openai.com → Usage</li>
                  </ul>
                </div>
              </details>

              <details className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <summary className="p-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                  <h3 className="font-medium text-[var(--text-primary)]">Q: 可以切换服务商吗？</h3>
                </summary>
                <div className="px-4 pb-4 text-[var(--text-secondary)]">
                  <p>
                    可以！点击导航栏的设置按钮，随时切换不同的 AI 服务商。每个服务商的 API Key
                    是分开存储的。
                  </p>
                </div>
              </details>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
};
