/**
 * 统一 Modal
 *
 * 之前每个弹窗各写一份 `fixed inset-0 z-50`，一共五份。五份里有四个已经修过，
 * 修出来的行为还不一样 —— 这个仓库的历史里可以逐条对上：
 *
 *   - AISettingsModal / ApiKeyModal / CodeBlock 是「两层 motion.div」
 *   - ShortcutsHelp 是「一层 motion.div + 内层 absolute 遮罩」
 *   - SubmitToolModal 是「一层 motion.div，遮罩和容器同一个元素」
 *
 * 三种写法混着放，就是「打开 modal 时后面遮罩层不对、往下滚动只能看到一部分」
 * 的直接来源。但真正让它们全部失效的，是下面这个更隐蔽的问题：
 *
 * ── 为什么 `position: fixed` 写对了还是会被裁 ──
 *
 * AISettingsModal 挂在 Navbar 内部，而 Navbar 自己带 `backdrop-blur-xl`。
 * `backdrop-filter` 和 `filter`、`transform`、`will-change` 一样，会创建
 * **新的层叠上下文**（stacking context）。于是这个 `<nav>` 变成一个包含块，
 * 内部的 `fixed inset-0` 不再相对视口定位，而是相对 nav 那个 64px 高的盒子。
 * 往下滚动时遮罩层只盖住导航条那一条，正文在它外面裸奔。
 *
 * `main` 上的 `relative z-10` 是同一类问题的另一个变体。
 *
 * ── 解法 ──
 *
 * 用 `createPortal(..., document.body)` 把弹窗物理搬到 body 下。
 * body 上没有任何 filter / transform / z-index，fixed 就是真正的视口级 fixed，
 * 不管调用方被塞在哪一层上下文里。这是唯一从根上解决的写法 ——
 * 调 z-50 → z-[10000] 只是把「谁压过谁」的概率调高，问题还在。
 *
 * 顺带在这里收口三件以前每份各写一遍的东西：
 *   1. 滚动锁（useModalScrollLock，已支持嵌套引用计数）
 *   2. Esc 关闭
 *   3. 点遮罩关闭 + 焦点归还
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 面板宽度类，默认 max-w-2xl */
  panelClassName?: string;
  /** 面板最大高度类，默认留出上下安全边距 */
  maxHeightClassName?: string;
  /** 遮罩样式，默认半透明黑 */
  backdropClassName?: string;
  /** 点击遮罩是否关闭，默认 true */
  closeOnBackdrop?: boolean;
  /**
   * 装饰元素：渲染在遮罩之上、面板之下。
   *
   * 只给「本来就在遮罩层里飘」的场景用（快捷键面板那圈漂浮的小图标）。
   * 绝大多数弹窗不需要这个参数 —— 装饰写在面板内容里更简单。
   */
  decorations?: ReactNode;
}

/**
 * 弹窗外壳：遮罩 + 居中面板 + 滚动锁 + Esc 关闭。
 *
 * 关键点：`children` 是**面板内容**，外层容器负责居中和点击透传，
 * 所以调用方不再需要自己写 `pointer-events-none` 那一套 ——
 * 那是之前最容易被漏掉、又最难查的一环（漏了就是遮罩把面板点不动）。
 */
export const Modal = ({
  isOpen,
  onClose,
  children,
  panelClassName = "max-w-2xl",
  maxHeightClassName = "max-h-[85vh]",
  backdropClassName = "bg-black/50 backdrop-blur-sm",
  closeOnBackdrop = true,
  decorations,
}: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // 滚动锁 + 吞掉会滚页面的按键，和五个弹窗以前各自调用的同一个 hook
  useModalScrollLock(isOpen);

  // Esc 关闭。只有 isOpen 时才挂载，关闭后不留监听。
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // 打开时把焦点移进面板，关闭后还给触发元素。
  //
  // 不做的话，焦点还留在背景页面的按钮上：Tab 键会在遮罩后面继续走，
  // 读屏软件读到的是「被遮住」的内容 —— 视觉上看不见，辅助技术却能读到。
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // SSR / 测试环境下 document.body 可能不存在，直接不渲染
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* 遮罩层：独立元素，负责变暗和接收点击 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`absolute inset-0 ${backdropClassName}`}
            onClick={closeOnBackdrop ? onClose : undefined}
          />

          {/* 装饰层：pointer-events-none，避免挡住遮罩点击 */}
          {decorations && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {decorations}
            </div>
          )}

          {/* 面板：focusable 让上面的 focus() 有落点 */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={`relative w-full ${panelClassName} ${maxHeightClassName} flex flex-col outline-none`}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default Modal;