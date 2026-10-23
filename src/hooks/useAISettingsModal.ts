/**
 * 统一「打开 AI 设置」这件事
 *
 * ── 问题 ──
 * 原来 open-ai-settings 这个事件有两个监听者：
 *   - Navbar.tsx:32   -> 渲染一个 AISettingsModal
 *   - AIChat.tsx:60   -> 又渲染一个 AISettingsModal
 *
 * 而 useAIProvider.checkConfig() 在缺配置时会
 * dispatch("open-ai-settings")。于是在文章页点「解释」：
 *
 *   dispatch -> 两个监听者同时把各自 showSettings 置 true
 *           -> 页面上叠了两层一模一样的设置弹窗
 *           -> 关一次只关掉最上面那层，底下那层还在
 *           -> 必须关两次
 *
 * 这就是「点关闭还会再弹一次」的现象。
 *
 * ── 修法 ──
 * 弹窗只有一个实例，挂在 Layout 里（Navbar 和 AIChat 都是它的一部分，
 * 父级都有）。其他组件通过这个模块的函数打开，不再各自监听事件。
 *
 * 顺带修掉一个更隐蔽的问题：
 * Navbar 和 AIChat 各自调 useAIProvider()，而 hook 内部的
 * showSettingsModal 是各自独立的 useState。两处 state 不同步，
 * 在 Navbar 里保存完 key，AIChat 里的 showSettings 还开着。
 *
 * ── 为什么 set 是 Set 而不是单个回调 ──
 * 开发期严格模式下每个 effect 都会 mount/unmount 一轮。
 * 用单回调的话，StrictMode 清理再挂载之间如果正好来了个 dispatch，
 * 回调就被换掉，旧的那份再也收不到通知。
 * Set 允许挂载期间有几个订阅者，但 openAISettings 只置 true 一次，
 * 最终仍然是一个弹窗 ——「单实例」靠的是「单状态」，不是「单监听者」。
 */

import { useEffect, useState } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();

/** 打开 AI 设置弹窗。全局只有一个实例，重复调用是幂等的。 */
export function openAISettings(): void {
  for (const fn of listeners) fn();
}

/** 订阅打开事件。返回取消订阅函数。 */
export function subscribeAISettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 兼容：保留原来的 CustomEvent 通道。
 *
 * 还有别处（以及旧书签脚本）可能 dispatch 这个事件，
 * 这里桥接一下，但只广播给订阅者，不会重复弹窗。
 */
export function bridgeAISettingsEvent(): () => void {
  const handler = () => openAISettings();
  window.addEventListener("open-ai-settings", handler);
  return () => window.removeEventListener("open-ai-settings", handler);
}

/**
 * 在 Layout 里挂一次：唯一持有弹窗状态的地方。
 *
 * 返回的 show/hide 是稳定的（每次渲染重建也没关系，
 * 调用方都是直接传事件处理器，不会把它塞进 useEffect 依赖）。
 */
export function useAISettingsModal(): {
  open: boolean;
  show: () => void;
  hide: () => void;
} {
  const [open, setOpen] = useState(false);

  /*
    只在 false -> true 时写 state。
    已经开着就什么都不做 —— 避免同一个事件被两个通道
    （CustomEvent + 直接调用）各处理一次时多跑一次渲染，
    也就避免了两个来源同时置位时可能出现的中间态。
  */
  const show = () => setOpen((prev) => (prev ? prev : true));

  useEffect(() => subscribeAISettings(show), []);
  useEffect(() => bridgeAISettingsEvent(), []);

  return { open, show, hide: () => setOpen(false) };
}