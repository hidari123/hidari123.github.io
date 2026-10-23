/*
 * @Author: hidari
 * @Date: 2026-10-23
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * 换路由时把页面滚回顶部。
 *
 * 为什么不直接用 react-router v6 的 <ScrollRestoration />：
 * 它的语义是「记住每个 key 的滚动位置，后退时还原」—— 这对后退是对的，
 * 但本站的诉求是「每次打开新页面都从顶部看起」，前进导航也必须回顶，
 * 两者诉求相反。它的默认 key 还是 location.key，每次导航一个新 key，
 * 还原到的其实是「上一次的位置」，正好是我们要去掉的行为。
 *
 * 真正的问题出在浏览器原生 scroll restoration 上：
 * `globals.css` 全局设了 `scroll-behavior: smooth`，而浏览器会记住
 * 「/blog 这个 URL 上次停在 831px」。SPA 内 pushState 跳转浏览器不会重置，
 * 于是从其它页面进 /blog 时直接停在上次的滚动位置。
 * 实测：首页滚到 900 → 点进 /blog，落在 831。
 *
 * 所以这里显式接管，不依赖浏览器那套。
 *
 * 两个坑：
 * 1. behavior 必须给 "instant"。全局是 smooth，不显式覆盖的话新页面一进来
 *    就开始 500ms 向上飘的动画，观感比不回顶更糟。
 * 2. 只在 POP（即浏览器后退/前进）之外回顶。POP 的还原由浏览器自己做，
 *    我们再插一脚会和浏览器的动画抢，反而闪。
 */
export const useScrollToTop = () => {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  // 首次挂载不要滚：用户可能是在同一页刷新时带着锚点进来的
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (navigationType === "POP") return;

    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, search, navigationType]);
};