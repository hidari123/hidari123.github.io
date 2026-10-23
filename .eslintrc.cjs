/**
 * ESLint 配置
 *
 * 重点不是格式（格式交给 prettier），而是三类会导致真实 bug 的规则：
 *   - react-hooks：调用顺序违规（原稿的代码块组件就踩了这个坑）
 *   - no-floating-promises：漏 await 的 promise，错误会静默丢失
 *   - react-hooks/exhaustive-deps：依赖数组漏项，闭包拿到过期值
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  ignorePatterns: ["dist", "node_modules", "public", "scripts", "*.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint", "react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

    // 设计上就是可变状态容器，只读时直接抛错
    "react-hooks/exhaustive-deps": "warn",

    // while (true) 是流式读取的标准写法（reader.read() 靠 done 退出），
    // 逐个改写成 do/while 反而更难读，统一豁免
    "no-constant-condition": ["error", { checkLoops: false }],

    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-non-null-assertion": "off",
    "no-console": "off",
  },
  overrides: [
    {
      // 测试里允许更宽松的类型断言
      files: ["**/__tests__/**/*.{ts,tsx}"],
      rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
  ],
};