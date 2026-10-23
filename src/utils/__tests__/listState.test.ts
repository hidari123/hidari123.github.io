/*
 * @Author: hidari
 * @Date: 2026-10-23
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { describe, it, expect } from "vitest";
import { parseListState, buildListSearch, buildListUrl } from "../listState";

const p = (s: string) => new URLSearchParams(s);

describe("listState · URL 互转", () => {
  it("空 URL 得到默认状态", () => {
    expect(parseListState(p(""))).toEqual({ category: null, tech: [], page: 1 });
  });

  it("页码从 URL 读出来", () => {
    expect(parseListState(p("page=3")).page).toBe(3);
  });

  it("非法页码夹回 1", () => {
    expect(parseListState(p("page=0")).page).toBe(1);
    expect(parseListState(p("page=-5")).page).toBe(1);
    expect(parseListState(p("page=abc")).page).toBe(1);
    expect(parseListState(p("page=")).page).toBe(1);
  });

  it("小数页码向下取整，不留半页", () => {
    expect(parseListState(p("page=2.7")).page).toBe(2);
  });

  it("分类与技术标签分开存", () => {
    expect(parseListState(p("cat=前端工程&tag=React,性能优化&page=2"))).toEqual({
      category: "前端工程",
      tech: ["React", "性能优化"],
      page: 2,
    });
  });

  it("多个技术标签全都要保住（旧实现只留第一个）", () => {
    const s = parseListState(p("tag=React,TypeScript,性能优化"));
    expect(s.tech).toEqual(["React", "TypeScript", "性能优化"]);
  });

  it("兼容旧的单值 ?tag= —— 它是主分类就归分类", () => {
    expect(parseListState(p("tag=前端工程"))).toEqual({
      category: "前端工程",
      tech: [],
      page: 1,
    });
  });

  it("兼容旧的单值 ?tag= —— 它是技术标签就归技术标签", () => {
    expect(parseListState(p("tag=React"))).toEqual({
      category: null,
      tech: ["React"],
      page: 1,
    });
  });

  it("旧链接 ?tag=分类,技术标签 能拆分", () => {
    expect(parseListState(p("tag=AI Agent,RAG"))).toEqual({
      category: "AI Agent",
      tech: ["RAG"],
      page: 1,
    });
  });

  it("cat 写了个不存在的分类时丢弃，不让筛选状态变成空结果", () => {
    expect(parseListState(p("cat=不存在的分类")).category).toBeNull();
  });

  it("未知 tag 不被过滤掉（支持用户自定义标签）", () => {
    expect(parseListState(p("tag=我自己造的标签")).tech).toEqual(["我自己造的标签"]);
  });

  it("空片段被清掉：a,,b 不能产生空标签", () => {
    expect(parseListState(p("tag=a,,b,")).tech).toEqual(["a", "b"]);
  });
});

describe("buildListSearch · 序列化", () => {
  it("默认状态不产生任何参数", () => {
    expect(buildListSearch({ category: null, tech: [], page: 1 })).toBe("");
  });

  it("第一页不写 page，避免 /blog?page=1 这种噪音", () => {
    const s = buildListSearch({ category: "前端工程", tech: [], page: 1 });
    const params = new URLSearchParams(s.replace(/^\?/, ""));
    expect(params.has("page")).toBe(false);
    expect(params.get("cat")).toBe("前端工程");
  });

  it("中文标签会被 URLSearchParams 百分号编码 —— 断言前先解码，不要假设原文输出", () => {
    // URLSearchParams.toString() 对非 ASCII 做 percent-encoding，
    // 这是正确行为；直接拿中文字面量去比对字符串一定会挂。
    const s = buildListSearch({ category: "前端工程", tech: [], page: 1 });
    expect(s.startsWith("?cat=")).toBe(true);
    expect(new URLSearchParams(s.replace(/^\?/, "")).get("cat")).toBe("前端工程");
  });

  it("含空格的标签编码成 + 而不是 %20，且能原样解回", () => {
    const s = buildListSearch({ category: "AI Agent", tech: [], page: 1 });
    expect(s).toBe("?cat=AI+Agent");
    expect(new URLSearchParams(s.replace(/^\?/, "")).get("cat")).toBe("AI Agent");
  });

  it("三个维度一起写", () => {
    const s = buildListSearch({ category: "前端工程", tech: ["React"], page: 4 });
    expect(parseListState(p(s.replace(/^\?/, "")))).toEqual({
      category: "前端工程",
      tech: ["React"],
      page: 4,
    });
  });

  it("buildListUrl 带上前缀路径", () => {
    expect(buildListUrl({ category: null, tech: [], page: 2 })).toBe("/blog?page=2");
  });

  /*
   * 回归：buildListUrl 返回的是**带路径**的，而 setSearchParams 的函数式
   * 更新要的是**纯 search 串**。
   *
   * 当时在 applyState 里写的是：
   *   const s = buildListUrl(merged);                // "/blog?page=3"
   *   new URLSearchParams(s.startsWith("?") ? ... ) // 前缀是 "/blog?" 不是 "?"
   * → 整串被当成一个 key 的名字，URL 变成 /blog?%2Fblog%3Fpage%3D3
   * → 页码既没生效、刷新也没了
   *
   * 单测测不到是因为buildListSearch 单独跑是对的，错的是两者之间的拼接。
   */
  it("buildListUrl 不能直接喂给 URLSearchParams —— 路径会变成 key 名", () => {
    const full = buildListUrl({ category: null, tech: [], page: 3 });
    const wrong = new URLSearchParams(full.replace(/^\?/, ""));
    // 错误用法产出的真实结果：整串变成了一个叫 "/blog?page" 的 key
    expect(wrong.get("page")).toBeNull();
    expect([...wrong.keys()]).toEqual(["/blog?page"]);

    const right = new URLSearchParams(
      buildListSearch({ category: null, tech: [], page: 3 }).replace(/^\?/, ""),
    );
    expect(right.get("page")).toBe("3");
  });
});

describe("往返一致", () => {
  const cases = [
    { category: null, tech: [] as string[], page: 1 },
    { category: "前端工程", tech: [] as string[], page: 1 },
    { category: null, tech: ["React"], page: 1 },
    { category: "工程实践", tech: ["React", "性能优化"], page: 5 },
  ];

  for (const c of cases) {
    it(`parse(build(x)) === x : ${JSON.stringify(c)}`, () => {
      const search = buildListSearch(c);
      const parsed = parseListState(p(search.replace(/^\?/, "")));
      expect(parsed).toEqual(c);
    });
  }
});