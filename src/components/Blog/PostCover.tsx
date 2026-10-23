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
import { useIsDarkTheme } from "@/hooks/useTheme";

interface CoverPalette {
  /** 渐变起点 */
  from: string;
  /** 渐变终点 */
  to: string;
  /** 前景点缀色（角标文字、装饰块） */
  accent: string;
  /** 纹理的描边色 */
  line: string;
  /** 封面文字颜色。浅色底用深色文字，不然白字看不清 */
  ink: string;
}

/**
 * 色板从深色高饱和换成低饱和浅色系。
 *
 * 原来 12 组全是 #312e81 / #7c3aed 这类深色，35 张封面在列表里排下来像一排
 * 霓虹灯箱，和页面的可爱风完全不搭。而且标题是白字 + drop-shadow 压上去的，
 * 深底上勉强能读，浅底上直接消失。
 *
 * 现在的取值范围相当于 oklch(0.88~0.95, 0.04~0.10)：
 * 亮度拉高到接近纸白，彩度压到 0.04~0.10（人眼对低彩度本来就宽容，
 * 这一档看起来是奶油/浅杏/薄荷/雾霾蓝，不会脏也不会刺眼）。
 * 12 组色相互相错开 30 度左右，同一屏里不会撞色。
 *
 * ink 取同色相的深色变体（明度 0.32~0.40），保证标题对比度；
 * 深色模式下会自动换成对应色相的亮色（明度 0.86 左右）。
 */
const LIGHT_PALETTES: CoverPalette[] = [
  // 奶油粉
  { from: "#FDF2F4", to: "#F8E4E8", accent: "#C4758A", line: "#E8B4C0", ink: "#5C3A44" },
  // 浅杏
  { from: "#FDF6EC", to: "#F8EBD6", accent: "#B58444", line: "#E6C99B", ink: "#54402A" },
  // 薄荷绿
  { from: "#F1FAF5", to: "#E4F4EC", accent: "#4E9B77", line: "#A9DCC4", ink: "#2F5142" },
  // 雾霾蓝
  { from: "#F1F6FC", to: "#E2EDF8", accent: "#4E7FAE", line: "#A9C9E4", ink: "#2F4559" },
  // 淡紫
  { from: "#F7F4FC", to: "#EDE6F8", accent: "#7E69B5", line: "#C9BCE8", ink: "#3F3557" },
  // 灰蓝
  { from: "#F4F7F9", to: "#E7EEF3", accent: "#5C7C91", line: "#B4CAD8", ink: "#354954" },
  // 淡梅
  { from: "#FDF3F6", to: "#F7E4EC", accent: "#A75F83", line: "#E0AEC5", ink: "#4F3341" },
  // 淡青
  { from: "#F0FAFA", to: "#E0F2F2", accent: "#4A8F8C", line: "#A3D4D2", ink: "#2F4B4A" },
  // 米黄
  { from: "#FBFAF3", to: "#F1EFE0", accent: "#8A8250", line: "#CBC6A3", ink: "#43412C" },
  // 淡鲑
  { from: "#FDF4F0", to: "#F8E7E0", accent: "#B26F55", line: "#E6B8A4", ink: "#543628" },
  // 淡雪松
  { from: "#FBF6F0", to: "#F2E8DC", accent: "#9C7550", line: "#DCC1A2", ink: "#4C3A28" },
  // 淡豆绿
  { from: "#F6FAF2", to: "#EAF1DF", accent: "#6B9152", line: "#B7D1A1", ink: "#3A4D2E" },
];

/**
 * 深色模式色板。
 *
 * 不是把浅色版整体调亮，而是降到 oklch(0.30~0.36)：封面上要放白字，
 * 底色太亮就压不住字。这里的值是同色相的低明度版，色相关系保持一致，
 * 所以切主题时封面不会突然换掉颜色，只是变暗。
 * ink 反过来变成接近白，用来给深底上的角标文字。
 */
const DARK_PALETTES: CoverPalette[] = [
  { from: "#3D2F33", to: "#4A383D", accent: "#E8B4C0", line: "#6E5259", ink: "#F5E8EC" },
  { from: "#3B342A", to: "#483F31", accent: "#E6C99B", line: "#6B5C44", ink: "#F5EFE0" },
  { from: "#2C3B33", to: "#374A3E", accent: "#A9DCC4", line: "#4F6558", ink: "#E8F5EE" },
  { from: "#2C3743", to: "#364554", accent: "#A9C9E4", line: "#4E6172", ink: "#E8F1F8" },
  { from: "#332E42", to: "#40394F", accent: "#C9BCE8", line: "#5B5170", ink: "#F0EAF8" },
  { from: "#2F3940", to: "#3A4750", accent: "#B4CAD8", line: "#526875", ink: "#E9F1F5" },
  { from: "#3B2F37", to: "#483A44", accent: "#E0AEC5", line: "#6B515F", ink: "#F8EBF1" },
  { from: "#293A3A", to: "#334849", accent: "#A3D4D2", line: "#486767", ink: "#E6F4F4" },
  { from: "#3A3930", to: "#474638", accent: "#CBC6A3", line: "#66624C", ink: "#F3F2E7" },
  { from: "#3E322D", to: "#4C3D36", accent: "#E6B8A4", line: "#6F5749", ink: "#F9EDE6" },
  { from: "#3B342C", to: "#494034", accent: "#DCC1A2", line: "#6B5B49", ink: "#F6EEE3" },
  { from: "#323A2E", to: "#3E4937", accent: "#B7D1A1", line: "#57684A", ink: "#EDF4E6" },
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
  const dark = useIsDarkTheme();

  const { palette, pattern, seed, angle, decor } = useMemo(() => {
    const s = hashString(slug || title || "default");
    return {
      seed: s,
      palette: (dark ? DARK_PALETTES : LIGHT_PALETTES)[
        pick(s, 0, LIGHT_PALETTES.length)
      ],
      pattern: PATTERNS[pick(s, 1, PATTERNS.length)],
      angle: 90 + pick(s, 2, 4) * 30,
      decor: pick(s, 3, 3),
    };
  }, [slug, title, dark]);

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

      {/* 底部渐隐。浅色底下不能用黑色渐隐（会脏），改成用当前色板的 ink
          低透明度的渐变，保证标题可读但底色不被压死。 */}
      <div
        className="absolute inset-0"
        style={{
          background: dark
            ? "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.48) 100%)"
            : `linear-gradient(to bottom, ${palette.ink}00 0%, ${palette.ink}14 45%, ${palette.ink}2E 100%)`,
        }}
        aria-hidden="true"
      />

      {/* 文字层：用 HTML 而非 SVG text，任何容器比例下都不会被裁切 */}
      <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        {category && (
          <span
            className="self-start rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold"
            style={{
              background: dark ? "rgba(0,0,0,0.3)" : `${palette.ink}14`,
              color: dark ? palette.accent : palette.ink,
            }}
          >
            {category}
          </span>
        )}
        {variant === "card" && (
          <h3
            className="font-bold leading-tight line-clamp-2 text-base sm:text-xl"
            style={{
              color: palette.ink,
              // 深色底上的白字需要阴影提亮，浅色底上的深字不需要
              textShadow: dark ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
            }}
          >
            {title}
          </h3>
        )}
      </div>
    </div>
  );
};
