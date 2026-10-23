/*
 * @Author: hidari
 * @Date: 2026-05-13 14:58:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-10-22 16:40:00
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./styles/a11y.css";

/**
 * 还原 SPA 路径。
 *
 * GitHub Pages 是纯静态托管，没有服务端重写。直接访问 /blog/xxx 时
 * 服务器返回 404.html，URL 保持原样但内容是错的。
 *
 * scripts/spa-fallback.cjs 生成的 404.html 会把原始路径编码进 ?p=，
 * 重定向到站点根目录的 index.html。此时 URL 长这样：
 *
 *   /?p=%2Fblog%2Fxxx
 *
 * 这里把路径还原回 /blog/xxx，然后清掉 ?p= 参数。
 * 顺序很重要：必须先 history.replaceState 改地址栏，再让 React Router
 * 读取，否则路由匹配到的还是 /?p=...。
 */
function restoreSpaPath(): void {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get("p");

  if (!encoded) return;

  // 兜底：只接受站内路径，防止被构造成外站跳转
  const target = encoded.startsWith("/") ? encoded : `/${encoded}`;
  const [pathname, rest = ""] = target.split(/(?=[?#])/);

  url.pathname = pathname;
  url.search = "";
  url.hash = "";

  // 把被拆出来的 query/hash 重新拼回去
  if (rest) {
    const [q, h] = rest.split("#");
    url.search = q || "";
    url.hash = h ? `#${h}` : "";
  }

  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
restoreSpaPath();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
