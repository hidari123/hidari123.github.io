/**
 * prismjs 扩展语法的类型声明
 *
 * `@types/prismjs` 只声明了主入口（prismjs），没覆盖
 * `prismjs/components/prism-*` 这一整目录。这些模块的副作用是往
 * 全局 Prism.languages 上注册语法，本身不导出任何东西，所以统一声明成
 * 无返回值即可。
 *
 * 不这么做的后果是 tsconfig 的 strict 模式下每个 import 都报 TS7016，
 * 而 CI 的 `pnpm run tsc` 是硬门禁。
 */

declare module "prismjs/components/prism-typescript";
declare module "prismjs/components/prism-tsx";
declare module "prismjs/components/prism-python";
declare module "prismjs/components/prism-go";
declare module "prismjs/components/prism-json";
declare module "prismjs/components/prism-bash";
declare module "prismjs/components/prism-sql";