/**
 * 悬浮目录的 Portal 容器
 *
 * ── 为什么必须 Portal 到 body ──
 *
 * 上一版目录「彻底不显示」，原因不是显隐逻辑写错（那部分确实已经改成
 * 在 scroll 里量 getBoundingClientRect 了），而是 fixed 定位失效：
 *
 *   BlogPost.tsx 里 <TocSidebar /> 是 <motion.article> 的兄弟节点，
 *   而 motion.article 被 framer-motion 注入了 transform
 *   （即使是 transform: none 也算），这会同时创建
 *   「层叠上下文」+「包含块」。于是后代元素上的
 *   position: fixed 改为相对这个 article 盒子定位。
 *
 *   article 是整篇长文，高度几千 px。`right-6 top-28` 落到 article 的
 *   内部坐标上，位置在正文右下方 —— 视口里永远看不到。
 *
 * 注意 overflow: hidden 不会裁剪 fixed，真正的原因是 transform。
 * 这和 Modal.tsx 撞的是同一个坑（Navbar 的 backdrop-filter），
 * 同一个项目里犯了两次，说明该有统一的约定而不是逐个 debug。
 *
 * 挂到 body 上后：body 上没有 transform/filter/backdrop-filter，
 * fixed 就是真正的视口级 fixed，与调用方在 DOM 里的位置完全无关。
 *
 * 不加任何包裹层。子元素自己的 `fixed` 会直接相对视口定位 ——
 * 一旦在这里套一层带 inset-0 的容器，那层容器自己就成了新的
 * 「谁建立包含块」的候选，等于把问题换个地方再犯一次。
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const FloatLayer = ({ children }: { children: ReactNode }) => {
  // 首帧时还没进浏览器（SSR / 测试环境），等挂载后再 Portal
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(children, document.body);
};