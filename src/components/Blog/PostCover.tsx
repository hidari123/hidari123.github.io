/**
 * 文章封面（代码生成）
 *
 * 为什么不用图片：
 *   - 原来的实现是 35 篇文章共用一张 Unsplash 外链图，既丑又是第三方热链，
 *     现场演示时网络一抖就变空白；
 *   - 图片资源要几百 KB，35 张就是几十 MB；
 *   - 用 SVG 在客户端画，0 字节请求、0 加载延迟。
 *
 * 结构上分三层：
 *   1. 容器：CSS 渐变背景（颜色由 slug 派生）
 *   2. 纹理：内联 SVG，绝对定位铺满，用 slice 裁切（纹理被裁不影响观感）
 *   3. 文字：HTML 层而不是 SVG text
 *
 * 第 3 点是关键：卡片是 208px 高、详情页是 21:9，比例各不相同，
 * 如果文字画在 SVG 里，slice 裁切会让第二行标题直接消失。
 * 文字交给 HTML 就不会有这个问题。
 *
 * 规则：slug → 种子 → 色板 + 图案。同一篇文章永远得到同一张图。
 * frontmatter 里写了 cover 的话，仍然优先用作者指定的图片。
 */
import { useId, useMemo } from "react";

interface CoverPalette {
  /** 渐变起点 */
  from: string;
  /** 渐变终点 */
  to: string;
  /** 前景点缀色（角标文字、装饰块） */
  accent: string;
  /** 纹理的描边色 */
  line: string;
}

/**
 * 色板按序号取。深浅两套主题下都能保证足够的对比度，
 * 且相邻卡片的色相刻意错开，避免列表里撞色。
 */
const PALETTES: CoverPalette[] = [
  { from: "#312e81", to: "#7c3aed", accent: "#c4b5fd", line: "#a78bfa" },
  { from: "#0c4a6e", to: "#0891b2", accent: "#a5f3fc", line: "#67e8f9" },
  { from: "#064e3b", to: "#059669", accent: "#a7f3d0", line: "#6ee7b7" },
  { from: "#78350f", to: "#ea580c", accent: "#fed7aa", line: "#fdba74" },
  { from: "#881337", to: "#e11d48", accent: "#fecdd3", line: "#fda4af" },
  { from: "#1e293b", to: "#4f46e5", accent: "#c7d2fe", line: "#a5b4fc" },
  { from: "#4a044e", to: "#c026d3", accent: "#f5d0fe", line: "#e879f9" },
  { from: "#134e4a", to: "#0d9488", accent: "#99f6e4", line: "#5eead4" },
  { from: "#7c2d12", to: "#dc2626", accent: "#fecaca", line: "#fca5a5" },
  { from: "#164e63", to: "#0284c7", accent: "#bae6fd", line: "#7dd3fc" },
  { from: "#3b0764", to: "#7e22ce", accent: "#e9d5ff", line: "#d8b4fe" },
  { from: "#713f12", to: "#ca8a04", accent: "#fef08a", line: "#fde047" },
];

/** 纹理种类。每种对应一个纯代码绘制的几何图案。 */
type PatternKind = "grid" | "dots" | "rings" | "waves" | "diagonal" | "arcs";

const PATTERNS: PatternKind[] = ["grid", "dots", "rings", "waves", "diagonal", "arcs"];

/** FNV-1a：短、稳定、分布均匀的字符串哈希 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619，用移位避免 32 位溢出丢精度
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/** 取 seed 的高若干位做不同用途的派生，避免所有决策挤在同一个数字上 */
const pick = (seed: number, salt: number, modulo: number) =>
  Math.abs((seed >>> (salt * 5)) ^ (salt * 2654435761)) % modulo;

/** 生成一段确定性的伪随机序列，用来摆装饰点的位置 */
function pseudoRandom(seed: number, count: number): number[] {
  const out: number[] = [];
  let state = seed || 1;
  for (let i = 0; i < count; i++) {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    out.push(state / 0xffffffff);
  }
  return out;
}

interface PostCoverProps {
  /** 用于派生的种子，通常是文章 slug */
  slug: string;
  /** 标题，显示在封面上 */
  title: string;
  /** 分类标签，显示为角标 */
  category?: string;
  /**
   * 封面形态：
   * - card：列表卡片，封面里带标题
   * - art：纯装饰背景，标题由下方的 HTML 展示（可选中、可被搜索引擎抓到）
   */
  variant?: "card" | "art";
  /** 追加到根元素上的 className */
  className?: string;
}

/** 绘制纹理层 */
function renderPattern(kind: PatternKind, palette: CoverPalette, seed: number) {
  const { line } = palette;
  const rand = pseudoRandom(seed, 24);

  switch (kind) {
    case "grid": {
      const cells = Array.from({ length: 7 }, (_, i) => 100 + i * 95);
      return (
        <g opacity="0.18" stroke={line} strokeWidth="1.2">
          {cells.map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="520" />
          ))}
          {cells.map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="800" y2={y} />
          ))}
        </g>
      );
    }
    case "dots": {
      const points = Array.from({ length: 34 }, (_, i) => ({
        cx: rand[i % rand.length] * 800,
        cy: rand[(i + 11) % rand.length] * 520,
        r: 2 + rand[(i + 5) % rand.length] * 4,
      }));
      return (
        <g opacity="0.32" fill={line}>
          {points.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
          ))}
        </g>
      );
    }
    case "rings": {
      const cx = 240 + rand[0] * 320;
      const cy = 120 + rand[1] * 200;
      return (
        <g opacity="0.2" fill="none" stroke={line} strokeWidth="1.6">
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} cx={cx} cy={cy} r={40 + i * 46} />
          ))}
        </g>
      );
    }
    case "waves": {
      return (
        <g opacity="0.22" fill="none" stroke={line} strokeWidth="2">
          {Array.from({ length: 6 }, (_, i) => {
            const y = 70 + i * 78;
            const amp = 26 + rand[i] * 30;
            return (
              <path
                key={i}
                d={`M -20 ${y} C 140 ${y - amp}, 280 ${y + amp}, 440 ${y} S 700 ${y - amp}, 820 ${y}`}
              />
            );
          })}
        </g>
      );
    }
    case "diagonal": {
      return (
        <g opacity="0.16" stroke={line} strokeWidth="14">
          {Array.from({ length: 14 }, (_, i) => (
            <line key={i} x1={i * 75 - 180} y1="520" x2={i * 75 + 220} y2="0" />
          ))}
        </g>
      );
    }
    case "arcs":
    default: {
      return (
        <g opacity="0.2" fill="none" stroke={line} strokeWidth="2">
          {Array.from({ length: 5 }, (_, i) => {
            const r = 180 + i * 110;
            return <circle key={i} cx="760" cy="470" r={r} />;
          })}
        </g>
      );
    }
  }
}

export const PostCover = ({
  slug,
  title,
  category,
  variant = "card",
  className = "",
}: PostCoverProps) => {
  // 多张封面同屏时，SVG id 必须唯一，否则会互相覆盖
  const uid = useId().replace(/:/g, "");
  const glowId = `cover-glow-${uid}`;

  const { palette, pattern, seed, angle, decor } = useMemo(() => {
    const s = hashString(slug || title || "default");
    return {
      seed: s,
      palette: PALETTES[pick(s, 0, PALETTES.length)],
      pattern: PATTERNS[pick(s, 1, PATTERNS.length)],
      angle: 90 + pick(s, 2, 4) * 30,
      decor: pick(s, 3, 3),
    };
  }, [slug, title]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(${angle}deg, ${palette.from} 0%, ${palette.to} 100%)`,
      }}
      role="img"
      aria-label={title}
    >
      {/* 纹理层：被裁切不影响观感 */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 520"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={glowId} cx="0.75" cy="0.2" r="0.7">
            <stop offset="0%" stopColor={palette.accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="800" height="520" fill={`url(#${glowId})`} />
        {renderPattern(pattern, palette, seed)}

        {/* 构图装饰：打破纹理的规整感 */}
        {decor === 0 && <circle cx="640" cy="120" r="150" fill={palette.accent} opacity="0.1" />}
        {decor === 1 && (
          <rect x="520" y="40" width="220" height="220" rx="28" fill={palette.accent} opacity="0.1" />
        )}
        {decor === 2 && (
          <path d="M 520 470 L 760 120 L 800 300 L 620 470 Z" fill={palette.accent} opacity="0.1" />
        )}
      </svg>

      {/* 底部渐隐，保证标题在任何底色上都可读 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.62) 100%)",
        }}
        aria-hidden="true"
      />

      {/* 文字层：用 HTML 而非 SVG text，任何容器比例下都不会被裁切 */}
      <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        {category && (
          <span
            className="self-start rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold"
            style={{ background: "rgba(0,0,0,0.25)", color: palette.accent }}
          >
            {category}
          </span>
        )}
        {variant === "card" && (
          <h3 className="text-white font-bold leading-tight line-clamp-2 text-base sm:text-xl drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            {title}
          </h3>
        )}
      </div>
    </div>
  );
};
