/**
 * Giscus 评论区配置
 *
 * 为什么这些值可以进版本库 —— 这是上一轮事故（.env 被 untrack 导致评论区消失）
 * 逼出来的一次纠偏，不是妥协：
 *
 * 1. Giscus 的 repoId / categoryId 天生就是公开数据。Giscus 把它们内联进每个
 *    访客浏览器里的 iframe 脚本，任何人打开你的文章页右键就能看到。真正管权限的
 *    是 GitHub Discussions 那一侧的设置（是否需要登录、哪些账号能发言），
 *    不是这两个字符串。把它们藏进 Actions secrets 只是心理安慰——真正的权限边界
 *    不在那儿。
 *
 * 2. 藏起来的代价是真实故障。.env 不进版本库 → CI 拿不到配置 → 线上评论区直接
 *    消失，而排查要跨到"哪个 commit 移的 .env"。把 ID 当普通构建期配置写死，
 *    构建就能在任何环境下复现同一份产物。
 *
 * 3. 这份文件里没有、也不会有任何密钥。LLM API Key 走的是完全另一条路：用户自己
 *    在设置面板里填（useOpenAIKey），构建期一律不注入。scripts/audit-secrets.cjs
 *    仍在 CI 上扫产物兜底。
 *
 * 想改配置：改这里就行，或者在 .env 里写同名 VITE_GISCUS_* 覆盖（本地调试用）。
 * CI 的 secrets 只在这四个值都存在时提供覆盖，缺一个就整体回落到这里。
 */

export interface GiscusConfig {
  /** 格式：用户名/仓库名 */
  repo: string;
  /** 仓库 ID，在 giscus.app 上生成 */
  repoId: string;
  /** Discussions 分类名 */
  category: string;
  /** Discussions 分类 ID */
  categoryId: string;
}

/** 权威配置源。CI / 本地构建都从这里取值，保证产物一致。 */
export const GISCUS_CONFIG: GiscusConfig = {
  repo: "hidari123/blog-comments",
  repoId: "R_kgDOSc6mtw",
  category: "Announcements",
  categoryId: "DIC_kwDOSc6mt84C8_-2",
};

/**
 * 合并环境变量覆盖。
 * 空字符串视为"没配"，这样 CI 里 secret 缺失时能干净地回落到默认配置，
 * 而不会把一个空 repoId 传给 @giscus/react。
 */
export function getGiscusConfig(): GiscusConfig {
  const env = import.meta.env ?? {};

  const pick = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;

  return {
    repo: pick(env.VITE_GISCUS_REPO, GISCUS_CONFIG.repo),
    repoId: pick(env.VITE_GISCUS_REPO_ID, GISCUS_CONFIG.repoId),
    category: pick(env.VITE_GISCUS_CATEGORY, GISCUS_CONFIG.category),
    categoryId: pick(env.VITE_GISCUS_CATEGORY_ID, GISCUS_CONFIG.categoryId),
  };
}

/** 配置是否完整。缺任何一个值都渲染"未配置"提示，而不是让 Giscus 静默失败。 */
export function isGiscusConfigured(config: GiscusConfig): boolean {
  return Boolean(config.repo && config.repoId && config.categoryId);
}