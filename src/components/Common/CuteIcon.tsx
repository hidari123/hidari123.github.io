/**
 * 可爱图标组件 - 基于 Iconify
 * 支持多个图标集：IconPark、Carbon、Fluent 等
 */
import { Icon } from "@iconify/react";

interface CuteIconProps {
  icon: string; // 图标名称，格式：collection:name，如 "icon-park:home"
  size?: number | string;
  color?: string;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

// 常用图标映射
export const ICONS = {
  // 导航
  home: "icon-park:home",
  blog: "icon-park:book",
  robot: "icon-park:robot",
  tool: "icon-park:tool",

  // AI 相关
  chat: "icon-park:chat",
  brain: "icon-park:brain",
  sparkles: "icon-park:sparkle",
  magic: "icon-park:magic-wand",

  // 社交
  github: "icon-park:github",
  twitter: "icon-park:twitter",
  mail: "icon-park:mail",

  // 工具
  search: "icon-park:search",
  filter: "icon-park:filter",
  setting: "icon-park:setting",
  code: "icon-park:code",
  link: "icon-park:link",

  // UI
  arrowRight: "icon-park:arrow-right",
  arrowUp: "icon-park:arrow-up",
  close: "icon-park:close",
  check: "icon-park:check",
  plus: "icon-park:add",
  star: "icon-park:star",

  // 装饰
  sparkle: "icon-park:sparkle",
  heart: "icon-park:heart",
  flower: "icon-park:flower",
};

export const CuteIcon = ({
  icon,
  size = 24,
  color,
  className = "",
  onClick,
  style,
}: CuteIconProps) => {
  return (
    <Icon
      icon={icon}
      width={size}
      height={size}
      color={color}
      className={className}
      onClick={onClick}
      style={style}
    />
  );
};

// 带动画的图标组件
export const AnimatedIcon = ({
  icon,
  size = 24,
  color,
  className = "",
  animation = "float", // float, bounce, spin, pulse
}: CuteIconProps & { animation?: "float" | "bounce" | "spin" | "pulse" }) => {
  const animationStyles: Record<string, React.CSSProperties> = {
    float: {
      animation: "iconFloat 3s ease-in-out infinite",
    },
    bounce: {
      animation: "iconBounce 1s ease-in-out infinite",
    },
    spin: {
      animation: "iconSpin 2s linear infinite",
    },
    pulse: {
      animation: "iconPulse 2s ease-in-out infinite",
    },
  };

  return (
    <CuteIcon
      icon={icon}
      size={size}
      color={color}
      className={`${className}`}
      style={animationStyles[animation]}
    />
  );
};

export default CuteIcon;
