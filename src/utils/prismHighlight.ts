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

const BASIC_NAMES = [
  "typescript",
  "python",
  "go",
  "json",
  "bash",
  "sql",
  "jsx",
] as const;

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
  /*
    必须分两批，tsx 不能和基础语法并行。

    prism-tsx.js 的开头是：
      var typescript = Prism.util.clone(Prism.languages.typescript);
      Prism.languages.tsx = Prism.languages.extend('jsx', typescript);

    两个硬依赖：
      1. Prism.languages.typescript 必须已注册
      2. Prism.languages.jsx 也必须已注册 —— 这一个很容易漏，
         jsx 本身不在文章里出现，但它不在列表里就会抛
         "Cannot set properties of undefined (setting 'comment')"

    同一个 languages 对象被并发写入时先后顺序不确定，所以拆成两批：
    第一批是互相独立的基础语法（含 jsx），并行没问题；
    第二批只有 tsx，必须等前面确定注册完。
    用 allSettled 而不是 all：一个失败不至于让整组全废。
  */
  const basic = await Promise.allSettled([
    import("prismjs/components/prism-typescript"),
    import("prismjs/components/prism-jsx"),
    import("prismjs/components/prism-python"),
    import("prismjs/components/prism-go"),
    import("prismjs/components/prism-json"),
    import("prismjs/components/prism-bash"),
    import("prismjs/components/prism-sql"),
  ]);

  const failed: string[] = basic
    .map((r, i) => (r.status === "rejected" ? BASIC_NAMES[i] : null))
    .filter((x) => x !== null);

  await import("prismjs/components/prism-tsx").catch((err: unknown) => {
    failed.push("tsx");
    console.warn("[prism] tsx 加载失败", err);
  });

  if (failed.length) {
    console.warn(
      `[prism] 这些语法没加载上，对应语言退回纯文本: ${failed.join(", ")}`,
    );
  }
};

/**
 * 文章里出现过的语言别名 → prism 正式名
 *
 * 值可以是 null：表示「这个语言不需要高亮」。
 * 不用 `null as unknown as string` 那种强制转换的写法 —— 那个 null
 * 在后面 `?? language.toLowerCase()` 时会被当成 nullish 吃掉，
 * 结果 text 反而回退成了去查 Prism.languages.text，拿到一个
 * 永远为 undefined 的grammar，最后返回 null；但如果哪天上真的
 * 有人注册了 .text，行为又会变。显式声明 Record<string, string | null>
 * 让「不需要高亮」是一个确定的状态。
 */
const ALIASES: Record<string, string | null> = {
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
  // 本来就是纯文本的东西，不需要 token 化
  text: null,
  plaintext: null,
  txt: null,
};

interface PrismLike {
  languages: Record<string, unknown>;
  highlight(code: string, grammar: unknown, language: string): string;
}

/** 语法文件注册的目标（ prismjs 自己的 global.Prism ） */
type GlobalWithPrism = { Prism?: PrismLike };

/** 已加载的 Prism 实例。null 表示还没加载（SSR / 尚未 import 完成） */
let prismPromise: Promise<PrismLike | null> | null = null;

/** 幂等：多次调用只加载一次 */
function loadPrism(): Promise<PrismLike | null> {
  if (prismPromise) return prismPromise;

  prismPromise = (async () => {
    try {
      const mod = (await import("prismjs")) as unknown;

      /*
        prismjs 的产物是 CommonJS（末尾 module.exports = Prism），
        经过 Vite/vitest 转 ESM 之后包装层不稳定：
        Node 下是 { default: Prism }，浏览器 bundle 下可能再包一层。

        不管包几层，一律用「自己找到那个带 highlight 的对象」的方式，
        避免写死 .default 把互操作的坑藏起来。
      */
      let current: unknown = mod;
      for (let i = 0; i < 4 && current; i++) {
        const candidate = current as { default?: unknown; highlight?: unknown };
        if (typeof candidate.highlight === "function") break;
        if (!("default" in candidate)) break;
        current = candidate.default;
      }

      const direct = current as PrismLike | undefined;
      if (!direct || typeof direct.highlight !== "function") {
        console.warn("[prism] 没拿到 Prism 实例（检查 CJS/ESM 互操作）");
        return null;
      }

      // 扩展语法加载
      try {
        await loadExtraLanguages();
      } catch (err) {
        console.warn("[prism] 扩展语法加载失败，部分语言不高亮", err);
      }

      /*
        关键：prism-xxx.js 这些语法文件是 IIFE，内部引用的是全局 Prism：
            (function (Prism) { Prism.languages.python = ... })(Prism);
        末尾的 `global.Prism = Prism` 赋值挂在 prismjs 自己的沙箱里。

        结果是：语法注册到了 globalThis.Prism 上，而上面拿到的
        import 实例是另一个对象。两者的 languages 恰好是同一个引用
        （能跑通 typescript 就是因为它注册得早），但并不是所有路径
        都碰巧共享——实测拿 import 实例时 typescript/python/go
        全部取不到。

        所以这里在加载完语法之后，优先采用 globalThis.Prism。
        拿不到再退回 import 实例（万一某些打包器把 global 也代理了）。
      */
      const globalPrism = (globalThis as GlobalWithPrism).Prism;
      const instance =
        globalPrism && typeof globalPrism.highlight === "function"
          ? globalPrism
          : direct;

      return instance;
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

  const key = language.toLowerCase();

  // 有别名就用别名；别名为 null 表示「不需要高亮」；
  // 没登记过就直接拿原名去查 Prism.languages
  const normalized = Object.prototype.hasOwnProperty.call(ALIASES, key)
    ? ALIASES[key]
    : key;

  // text / plaintext 之类本来就不需要高亮
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