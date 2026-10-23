import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

/**
 * prismjs 打包垫片的回归测试
 *
 * ── 为什么需要这个测试 ──
 *
 * 之前三轮「代码块没有颜色」的排查都卡在同一处：
 * tsc / lint / build 全绿，vitest 里 highlight() 也能返回带 token 的 HTML，
 * 但线上就是纯文本。
 *
 * 根因是 prismjs 的组件文件以裸全局标识符结尾：
 *
 *     (function (Prism) { ... })(Prism);
 *
 * CommonJS 下 prismjs 自己写 global.Prism 兜住了；
 * Rollup 打包后 chunk 里只有 module.exports 的等价物，不产生全局，
 * 于是每个组件执行到 `})(Prism)` 就 ReferenceError。
 *
 * 而 vitest 跑在 jsdom 里，prismjs 走 CJS 分支会自己建全局 ——
 * 测试环境恰好掩盖了这个 bug。所以这里不测 highlightCode，
 * 而是直接测**垫片本身**在浏览器式环境下能不能撑住组件的调用序列。
 */

const shimPath = path.resolve(__dirname, "../../../scripts/prism-global-shim.js");
const configPath = path.resolve(__dirname, "../../../vite.config.ts");

describe("prism 全局垫片", () => {
  const shim = readFileSync(shimPath, "utf8");

  /** 在一个全新的 jsdom window 里跑垫片，返回该 window 的 Prism */
  const install = (dom: JSDOM) => {
    /*
      runScripts: "outside-only" 是必须的 ——
      不开的话 runInContext 直接抛 "This jsdom was not configured to
      allow script running"。
    */
    vm.runInContext(shim, dom.getInternalVMContext());
    return (dom.window as unknown as { Prism?: Record<string, unknown> }).Prism;
  };

  const newDom = () => new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });

  it("能创建可用的 globalThis.Prism", () => {
    const dom = newDom();
    const P = install(dom);

    expect(P).toBeDefined();
    const prism = P as Record<string, Record<string, unknown>>;
    expect(typeof prism.languages.extend).toBe("function");
    expect(typeof prism.util.clone).toBe("function");
    expect(prism.languages.plain).toBeDefined();
  });

  it("extend 能从已有语言派生出新对象", () => {
    const dom = newDom();
    /*
      这里不用 `as never` —— 那会让整个 P 退化成 never，
      P.languages.extend 的返回值也跟着变 unknown，
      后面每一次 P.languages.xxx 访问都会报 TS18046。
      直接断言成最小可用结构，extend 有真实签名。
    */
    const P = install(dom) as {
      languages: {
        extend: (id: string, redef: Record<string, unknown>) => unknown;
        // 索引签名只能是 unknown：extend 的返回值也是 unknown，
        // 写窄了（比如 Record<string, unknown>）会导致赋值报 TS2322
        [lang: string]: unknown;
      };
    };

    P.languages.javascript = { keyword: ["if", "else"] };
    P.languages.typescript = P.languages.extend("javascript", {
      className: { pattern: /x/ },
    });

    const ts = P.languages.typescript as Record<string, unknown>;
    expect(ts.className).toBeDefined();
    // 关键：数组要拷贝，不能共用引用。
    // 否则 typescript 组件往 keyword 上 .push() 会写回 javascript，
    // 后面 tsx 扩展时基准就脏了（实测报 undefined.push）。
    expect(ts.keyword).toEqual(["if", "else"]);
    expect(ts.keyword).not.toBe(
      (P.languages.javascript as Record<string, unknown>).keyword,
    );
  });

  it("clone 能处理自引用的语法定义而不爆栈", () => {
    const dom = newDom();
    const P = install(dom) as never as {
      util: { clone: (o: unknown) => unknown };
    };

    /*
      语法对象必须在**浏览器 realm 里**构造，不能在测试 realm 里建。
      垫片跑在 dom.window 里，它的 Object.prototype 和测试环境的不是同一个，
      `Object.getPrototypeOf(o) === Object.prototype` 这种判断会全部落空。
      真实浏览器里所有对象都在同一个 realm，不存在这个问题。
    */
    const win = dom.window as unknown as {
      eval: (code: string) => unknown;
    };
    const grammar = win.eval(`(function () {
      var g = { pattern: /a/ };
      g.inside = g;      // Prism 的 generic.inside 指回自己
      return g;
    })()`) as Record<string, unknown>;

    const cloned = P.util.clone(grammar) as Record<string, unknown>;

    expect(cloned).not.toBe(grammar);
    // 自引用既不能丢，也不能展开成无限深
    expect(cloned.inside).toBe(cloned);
    expect((cloned.pattern as RegExp).source).toBe("a");
    // RegExp 当叶子原样返回，不能被拷成 {}
    // （之前就是这么丢的：对 RegExp 做 for...in 拿不到属性，拷贝出 {}）
    expect((cloned.pattern as RegExp).test("a")).toBe(true);
  });

  it("重复执行是幂等的，不会覆盖已有注册", () => {
    const dom = newDom();
    const ctx = dom.getInternalVMContext();

    vm.runInContext(shim, ctx);
    const first = (dom.window as unknown as { Prism: { languages: Record<string, unknown> } }).Prism;
    first.languages.python = { keyword: "def" };

    // 第二个语言 chunk 也会带一份垫片（它们并行加载）
    vm.runInContext(shim, ctx);
    const second = (dom.window as unknown as { Prism: { languages: Record<string, unknown> } }).Prism;

    expect(second).toBe(first);
    // 关键：先注册好的 python 不能被后来的垫片抹掉
    expect(second.languages.python).toEqual({ keyword: "def" });
  });

  it("核心模块的整体赋值会被合并而不是丢弃已注册语法", () => {
    const dom = newDom();
    const ctx = dom.getInternalVMContext();
    vm.runInContext(shim, ctx);

    const win = dom.window as unknown as {
      Prism: { languages: Record<string, unknown>; highlight?: unknown };
    };

    // 模拟组件先注册
    win.Prism.languages.python = { keyword: "def" };

    // 再模拟 prism 核心的 _self.Prism = _（整体替换）
    win.Prism = {
      languages: { javascript: { keyword: "var" } },
      util: { clone: (o: unknown) => o },
      highlight: () => "x",
    } as never;

    expect(win.Prism.languages.python).toEqual({ keyword: "def" });
    expect(win.Prism.languages.javascript).toEqual({ keyword: "var" });
    expect(typeof win.Prism.highlight).toBe("function");
  });
});

describe("vite 配置", () => {
  const config = readFileSync(configPath, "utf8");

  it("prismjs 不再被手动合并成单个 chunk", () => {
    /*
      合并会导致 rollup 把 CJS 组件的 IIFE 提到 ES 核心之前执行，
      组件 extend('javascript') 时 javascript 还不存在。
      实测报 Cannot read properties of undefined (reading 'push')。
    */
    expect(config).not.toMatch(/node_modules\/prismjs"\)\s*return\s*"prism"/);
  });

  it("给 prism chunk 注入垫片", () => {
    expect(config).toContain("prism-global-shim");
    expect(config).toContain("generateBundle");
    // 匹配 prism-*.js 和 prism.js 两种命名
    expect(config).toMatch(/prism\(-|\\\.\)/);
  });
});