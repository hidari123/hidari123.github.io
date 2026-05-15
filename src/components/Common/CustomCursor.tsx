/*
 * @Author: hidari
 * @Date: 2026-05-15 15:30:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 15:35:50
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/** 光标类型 */
export type CursorType = "ghost" | "pixel-cat";

interface CustomCursorProps {
  /** 光标类型：'ghost' | 'pixel-cat' */
  cursorType?: CursorType;
  /** 光标大小（默认 24px） */
  size?: number;
  /** 悬停时放大倍数 */
  hoverScale?: number;
}

// ==================== SVG 组件 ====================

/** 发光小幽灵 */
const GhostCursor = ({
  size,
  isHovering,
  isClicking,
}: {
  size: number;
  isHovering: boolean;
  isClicking: boolean;
}) => (
  <svg
    width={size}
    height={size * 1.2}
    viewBox="0 0 40 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="ghostGlow" cx="50%" cy="30%" r="70%">
        <stop offset="0%" stopColor={isHovering ? "#fdf2f8" : "#fce7f3"} />
        <stop offset="100%" stopColor={isHovering ? "#fbcfe8" : "#f9a8d4"} />
      </radialGradient>
      <filter id="ghostBlur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={isHovering ? "2" : "1"} />
      </filter>
    </defs>

    {isHovering && (
      <ellipse
        cx="20"
        cy="24"
        rx="18"
        ry="22"
        fill="rgba(244, 114, 182, 0.3)"
        filter="url(#ghostBlur)"
      />
    )}

    <path
      d="M20 4C11.16 4 4 11.16 4 20V42C4 42 6 40 10 40V42C10 44.76 12.24 47 15 47C15 47 17 45 20 45C23 45 25 47 25 47C27.76 47 30 44.76 30 42V40C34 40 36 42 36 42V20C36 11.16 28.84 4 20 4Z"
      fill="url(#ghostGlow)"
      opacity={isClicking ? 0.8 : 1}
    />

    <ellipse cx="20" cy="46" rx="10" ry="2" fill="rgba(0, 0, 0, 0.1)" />

    {isHovering ? (
      <>
        <path
          d="M12 22Q15 25 18 22"
          stroke="#1f2937"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M22 22Q25 25 28 22"
          stroke="#1f2937"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ) : (
      <>
        <ellipse cx="14" cy="20" rx="3" ry="4" fill="#1f2937" />
        <ellipse cx="26" cy="20" rx="3" ry="4" fill="#1f2937" />
        <ellipse cx="15" cy="19" rx="1" ry="1.5" fill="white" />
        <ellipse cx="27" cy="19" rx="1" ry="1.5" fill="white" />
      </>
    )}

    {isHovering && (
      <>
        <ellipse cx="8" cy="26" rx="3" ry="2" fill="rgba(244, 114, 182, 0.5)" />
        <ellipse cx="32" cy="26" rx="3" ry="2" fill="rgba(244, 114, 182, 0.5)" />
      </>
    )}

    <path
      d="M4 40C4 40 8 36 12 40C16 44 20 40 24 40C28 40 32 36 36 40V42C36 42 34 40 30 40C26 40 22 44 18 40C14 36 10 42 6 40V40C4 40 4 40 4 40Z"
      fill="url(#ghostGlow)"
      opacity={0.9}
    />
  </svg>
);

/** 像素小猫 */
const PixelCatCursor = ({
  size,
  isHovering,
  isClicking,
}: {
  size: number;
  isHovering: boolean;
  isClicking: boolean;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {!isClicking && (
      <ellipse
        cx="16"
        cy="30"
        rx={isHovering ? "10" : "8"}
        ry={isHovering ? "3" : "2"}
        fill="rgba(0, 0, 0, 0.15)"
      />
    )}

    {isHovering && <ellipse cx="16" cy="16" rx="14" ry="14" fill="rgba(255, 182, 193, 0.3)" />}

    <rect x="8" y="10" width="16" height="14" rx="3" fill={isHovering ? "#fff5f7" : "#fff"} />

    <polygon points="6,10 10,2 14,10" fill={isHovering ? "#fce7f3" : "#fdf2f8"} />
    <polygon points="8,9 10,4 12,9" fill={isHovering ? "#f9a8d4" : "#fbcfe8"} />

    <polygon points="18,10 22,2 26,10" fill={isHovering ? "#fce7f3" : "#fdf2f8"} />
    <polygon points="20,9 22,4 24,9" fill={isHovering ? "#f9a8d4" : "#fbcfe8"} />

    {isHovering ? (
      <>
        <path
          d="M11 14C11 14 10 12 9 13C8 14 9 16 11 17C13 16 14 14 13 13C12 12 11 14 11 14Z"
          fill="#f472b6"
        />
        <path
          d="M21 14C21 14 20 12 19 13C18 14 19 16 21 17C23 16 24 14 23 13C22 12 21 14 21 14Z"
          fill="#f472b6"
        />
      </>
    ) : (
      <>
        <ellipse cx="11" cy="15" rx="2.5" ry="3" fill="#1f2937" />
        <ellipse cx="21" cy="15" rx="2.5" ry="3" fill="#1f2937" />
        <ellipse cx="11.5" cy="14" rx="1" ry="1" fill="white" />
        <ellipse cx="21.5" cy="14" rx="1" ry="1" fill="white" />
      </>
    )}

    <polygon points="16,18 15,20 17,20" fill="#f9a8d4" />

    <g stroke={isHovering ? "#f9a8d4" : "#d1d5db"} strokeWidth="0.8" strokeLinecap="round">
      <line x1="6" y1="17" x2="2" y2="15" className={isHovering ? "whisker-left-1" : ""} />
      <line x1="6" y1="19" x2="2" y2="19" className={isHovering ? "whisker-left-2" : ""} />
      <line x1="6" y1="21" x2="2" y2="23" className={isHovering ? "whisker-left-3" : ""} />
      <line x1="26" y1="17" x2="30" y2="15" className={isHovering ? "whisker-right-1" : ""} />
      <line x1="26" y1="19" x2="30" y2="19" className={isHovering ? "whisker-right-2" : ""} />
      <line x1="26" y1="21" x2="30" y2="23" className={isHovering ? "whisker-right-3" : ""} />
    </g>

    <path
      d="M14 21 Q16 23 18 21"
      stroke="#f9a8d4"
      strokeWidth="1"
      fill="none"
      strokeLinecap="round"
    />

    <g transform="translate(16, 8)">
      <polygon points="-4,0 0,-3 4,0 0,3" fill="#f472b6" />
      <polygon points="-4,0 0,3 4,0 0,-3" fill="#f9a8d4" />
      <circle cx="0" cy="0" r="1.5" fill="#fbbf24" />
    </g>
  </svg>
);

// ==================== 主组件 ====================

export const CustomCursor = ({
  cursorType = "ghost",
  size = 24,
  hoverScale = 1.3,
}: CustomCursorProps) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const particleIdRef = useRef(0);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 18, stiffness: 150, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  const addParticle = useCallback((x: number, y: number) => {
    const id = particleIdRef.current++;
    setParticles((prev) => [...prev, { id, x, y }]);

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 500);
  }, []);

  const checkHover = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const clickableSelectors = [
      "a",
      "button",
      "[role='button']",
      ".card",
      ".btn",
      ".card-hover",
      "input",
      "textarea",
      "select",
      "[data-cursor='pointer']",
    ];

    const isClickable = clickableSelectors.some((selector) => {
      try {
        return target.closest(selector) !== null;
      } catch {
        return false;
      }
    });

    setIsHovering(isClickable);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - lastPositionRef.current.x);
      const deltaY = Math.abs(e.clientY - lastPositionRef.current.y);

      if (deltaX > 15 || deltaY > 15) {
        addParticle(lastPositionRef.current.x, lastPositionRef.current.y);
        lastPositionRef.current = { x: e.clientX, y: e.clientY };
      }

      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      setIsVisible(true);
      checkHover(e);
    },
    [mouseX, mouseY, checkHover, addParticle],
  );

  const handleMouseLeave = useCallback(() => setIsVisible(false), []);
  const handleMouseEnter = useCallback(() => setIsVisible(true), []);
  const handleMouseDown = useCallback(() => setIsClicking(true), []);
  const handleMouseUp = useCallback(() => setIsClicking(false), []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("mouseenter", handleMouseEnter);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("mouseenter", handleMouseEnter);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseLeave, handleMouseEnter, handleMouseDown, handleMouseUp]);

  const currentScale = isClicking ? 0.85 : isHovering ? hoverScale : 1;

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .custom-cursor-wrapper { display: none !important; }
        }

        @keyframes cursor-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
          50% { transform: translate(-50%, -50%) scale(1.05); filter: brightness(1.1); }
        }

        .cursor-pulse { animation: cursor-pulse 1.2s ease-in-out infinite; }

        @keyframes particle-fade {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.3); }
        }

        .cursor-particle { animation: particle-fade 0.5s ease-out forwards; }

        @keyframes whisker-shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(3deg); }
          75% { transform: rotate(-3deg); }
        }

        .whisker-left-1, .whisker-left-2, .whisker-left-3 {
          transform-origin: 6px 19px;
          animation: whisker-shake 0.3s ease-in-out infinite;
        }

        .whisker-right-1, .whisker-right-2, .whisker-right-3 {
          transform-origin: 26px 19px;
          animation: whisker-shake 0.3s ease-in-out infinite;
        }
      `}</style>

      {particles.map((particle) => (
        <div
          key={particle.id}
          className="cursor-particle pointer-events-none fixed z-[9998]"
          style={{
            left: particle.x,
            top: particle.y,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background:
              cursorType === "ghost"
                ? "radial-gradient(circle, rgba(249, 168, 212, 0.8), transparent)"
                : "radial-gradient(circle, rgba(255, 182, 193, 0.8), transparent)",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      <motion.div
        className="custom-cursor-wrapper pointer-events-none fixed top-0 left-0 z-[9999]"
        style={{ x: cursorX, y: cursorY, opacity: isVisible ? 1 : 0 }}
        animate={{ scale: currentScale }}
        transition={{ scale: { type: "spring", stiffness: 300, damping: 20 } }}
      >
        <div className={`${isHovering ? "cursor-pulse" : ""}`}>
          {cursorType === "ghost" ? (
            <GhostCursor size={size} isHovering={isHovering} isClicking={isClicking} />
          ) : (
            <PixelCatCursor size={size} isHovering={isHovering} isClicking={isClicking} />
          )}
        </div>
      </motion.div>
    </>
  );
};

export default CustomCursor;
