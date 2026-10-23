/**
 * 个人简介配置
 *
 * 首页和 README 都从这里取值，改一处就行。
 *
 * ⚠️ 待补充：下面标了 TODO 的字段请填真实信息，不要留着占位符上线——
 * 面试官点开首页第一眼看到的就是这里，写「某科技公司前端工程师」这种空话
 * 比不写还减分。拿不准就先留空数组，前端会自动隐藏对应区块。
 */

export interface Profile {
  /** 一句话定位，显示在首页大标题下面 */
  headline: string;
  /** 副标题，说明在做什么方向的技术 */
  subheadline: string;
  /** 技能分组 */
  skills: { label: string; items: string[] }[];
  /** 精选文章 slug，按你想展示的顺序；为空则取最新 3 篇 */
  featuredSlugs: string[];
  links: { label: string; href: string }[];
}

export const PROFILE: Profile = {
  headline: "Hi，我是Hidari",
  subheadline: "前端 / AI 应用方向。写 React 与 TypeScript，也折腾 Agent 运行时和浏览器端推理。",

  skills: [
    {
      label: "语言与框架",
      items: ["TypeScript", "React", "Rust（阅读级）", "Node.js"],
    },
    {
      label: "工程与性能",
      items: ["Vite", "构建产物优化", "首屏性能", "GitHub Actions"],
    },
    {
      label: "AI 应用",
      items: ["RAG 检索增强", "ONNX Runtime Web", "SSE 流式", "Agent 运行时"],
    },
  ],

  // TODO: 填你想让面试官先看的 3~5 篇（都是你有真实代码细节的那些）
  featuredSlugs: [
    "SSE-Web-Worker-流式对话不掉帧",
    "Agent上下文压缩-checkpoint设计",
    "前端动态生成学术引用格式",
  ],

  links: [
    { label: "GitHub", href: "https://github.com/hidari123" },
    { label: "文章归档", href: "/blog" },
  ],
};