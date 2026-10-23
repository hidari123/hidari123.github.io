/**
 * Prism 高亮（按需加载）
 *
 * 背景：这个仓库装了 prismjs、写了完整的两套 `.token.*` 主题色（globals.css）、
 * 还给 prism 分了独立 chunk —— 但全项目 grep 不到一句 `import Prism`，
 * 所以主题色从来没被触发过，代码块一直是纯白。
 *
 * 为什么不直接 `import Prism from "prismjs"`：
 *   prismjs 的默认入口 `prism.js` 打包了 markup/css/clike/javascript 四种基础语法，
 *   再加十几种扩展，总共 ~300KB / min ~90KB。而实际文章里只用到 9 种语言：
 *
 *     typescript 178   python 43   go 5   tsx 5   javascript 4
 *     json 4   bash 2   sql 2   text 1   xml 1
 *
 *   所以这里只注册这几种，其余语言回退到纯文本。
 *
 * 为什么动态 import：
 *   博客列表页、首页、设置页都不渲染代码块，没必要为此阻塞首屏。
 *   BlogPost 已经在 App.tsx 里 lazy 过了，文章页本身就是异步块；
 *   高亮再叠一层动态 import，首屏体积不变。
 *
 * 降级策略：任何一步失败（chunk 404、语法未注册、网络差）都返回纯文本，
 * 绝不让代码块把整页带崩——代码块只是锦上添花，读不到高亮不影响文章内容。
 */

/*
  写法必须是显式的一串 import()，不能写
  `import(\`prismjs/components/prism-${lang}\`)`。

  原因：Rollup 对无法静态分析的动态 import 只会留一个警告，然后用原样的
  表达式去运行期解析。而 prismjs 是裸模块名（bare specifier），浏览器里
  没有 import map，根本解析不了 —— 构建能过，点了代码块直接在控制台报
  "Failed to resolve module specifier"，高亮静默失败。

  实测过：写成模板字符串后 dist 里真的留了
  `import(\`prismjs/components/prism-${u}\`)` 这行字面量，
  没有任何语言 chunk 被产出。必须逐个写死字面量路径。
*/
const loadExtraLanguages = async () => {
  await Promise.all([
    import("prismjs/components/prism-typescript"),
    import("prismjs/components/prism-tsx"),
    import("prismjs/components/prism-python"),
    import("prismjs/components/prism-go"),
    import("prismjs/components/prism-json"),
    import("prismjs/components/prism-bash"),
    import("prismjs/components/prism-sql"),
  ]);
};

/** 文章里出现过的语言别名 → prism 正式名 */
const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  html: "markup",
  xml: "markup",
  svg: "markup",
  text: null as unknown as string,
  plaintext: null as unknown as string,
  txt: null as unknown as string,
};

interface PrismLike {
  languages: Record<string, unknown>;
  highlight(code: string, grammar: unknown, language: string): string;
}

/** 已加载的 Prism 实例。null 表示还没加载（SSR / 尚未 import 完成） */
let prismPromise: Promise<PrismLike | null> | null = null;

/** 幂等：多次调用只加载一次 */
function loadPrism(): Promise<PrismLike | null> {
  if (prismPromise) return prismPromise;

  prismPromise = (async () => {
    try {
      // 静态路径交给 Vite 预编译，组件依赖列表保持可静态分析
      const Prism = (await import("prismjs")).default as unknown as PrismLike;

      // 扩展语法依赖基础语法，tsx 内部还会再 require typescript，顺序不能乱
      try {
        await loadExtraLanguages();
      } catch (err) {
        console.warn("[prism] 扩展语法加载失败，部分语言不高亮", err);
      }

      return Prism;
    } catch (err) {
      console.warn("[prism] 加载失败，代码块退回纯文本", err);
      return null;
    }
  })();

  return prismPromise;
}

/**
 * 把代码高亮成 HTML。
 *
 * 返回的是 HTML 字符串，必须经 `dangerouslySetInnerHTML` 注入。
 * Prism 的输出只包含 `<span class="token ...">`，不做任何 HTML 转义以外的
 * 内容改写——但它**不转义代码里的尖括号**（TSX 代码里的 `<Foo />` 会变成真标签）。
 * 所以调用方必须确认 code 来自受信任的静态文章文件（本项目即如此，
 * 文章在 public/blogs 下，进版本库，不接受用户提交）。
 *
 * @returns 高亮后的 HTML；未就绪或不支持该语言时返回 null，调用方渲染纯文本。
 */
export async function highlightCode(code: string, language: string): Promise<string | null> {
  const Prism = await loadPrism();
  if (!Prism) return null;

  const normalized = ALIASES[language.toLowerCase()] ?? language.toLowerCase();

  // text/plaintext 之类本来就不需要高亮
  if (!normalized) return null;

  const grammar = Prism.languages[normalized];
  if (!grammar) return null;

  try {
    return Prism.highlight(code, grammar, normalized);
  } catch (err) {
    console.warn(`[prism] 高亮 ${normalized} 失败`, err);
    return null;
  }
}

/** 测试用：重置模块级缓存 */
export function resetPrismForTest(): void {
  prismPromise = null;
}