/*
 * @Author: hidari
 * @Date: 2026-05-15 16:05
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:15:03
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useEffect, useCallback, useRef, useState } from "react";

export interface KeyboardShortcutsOptions {
  onToggleHelp?: () => void;
  onNextPost?: () => void;
  onPrevPost?: () => void;
  onToggleTheme?: () => void;
  onFocusSearch?: () => void;
  onToggleAIChat?: () => void;
  onCloseModal?: () => void;
}

export interface UseKeyboardShortcutsReturn {
  isHelpVisible: boolean;
  setIsHelpVisible: (visible: boolean) => void;
}

/**
 * 检测是否在输入框中
 */
const isInputElement = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

/**
 * 全局键盘快捷键 Hook
 *
 * 支持的快捷键：
 * - `?` - 显示/隐藏快捷键帮助弹窗
 * - `J` / `↓` - 下一篇
 * - `K` / `↑` - 上一篇
 * - `T` - 切换主题
 * - `/` - 聚焦搜索框
 * - `E` - 打开 AI 助手
 * - `Esc` - 关闭弹窗/取消焦点
 */
export const useKeyboardShortcuts = (
  options: KeyboardShortcutsOptions,
): UseKeyboardShortcutsReturn => {
  const [isHelpVisible, setIsHelpVisible] = useState(false);

  // 防抖用的 ref
  const lastKeyPressTime = useRef<number>(0);
  const lastKeyRef = useRef<string>("");

  // 防抖时间（毫秒）
  const DEBOUNCE_TIME = 300;

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // 如果正在输入框中，不触发快捷键（除了 Esc）
      if (isInputElement(event.target) && event.key !== "Escape") {
        return;
      }

      // 获取按键（统一大小写）
      const key = event.key;
      const upperKey = key.toUpperCase();

      // 防抖处理：快速连续按同一个键
      const now = Date.now();
      if (key === lastKeyRef.current && now - lastKeyPressTime.current < DEBOUNCE_TIME) {
        return;
      }
      lastKeyPressTime.current = now;
      lastKeyRef.current = key;

      // 阻止默认行为
      let shouldPreventDefault = false;

      switch (upperKey) {
        case "?":
          // 显示/隐藏帮助弹窗（? 需要 shift 键输入）
          setIsHelpVisible((prev) => !prev);
          options.onToggleHelp?.();
          shouldPreventDefault = true;
          break;

        case "J":
        case "ARROWDOWN":
          // 下一篇
          options.onNextPost?.();
          shouldPreventDefault = true;
          break;

        case "K":
        case "ARROWUP":
          // 上一篇
          options.onPrevPost?.();
          shouldPreventDefault = true;
          break;

        case "T":
          // 切换主题
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            options.onToggleTheme?.();
            shouldPreventDefault = true;
          }
          break;

        case "/":
          // 聚焦搜索框
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
            options.onFocusSearch?.();
            shouldPreventDefault = true;
          }
          break;

        case "E":
          // 打开 AI 助手
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            options.onToggleAIChat?.();
            shouldPreventDefault = true;
          }
          break;

        case "ESCAPE":
          // 关闭弹窗
          setIsHelpVisible(false);
          options.onCloseModal?.();
          shouldPreventDefault = true;
          break;
      }

      if (shouldPreventDefault) {
        event.preventDefault();
      }
    },
    [options],
  );

  // 绑定键盘事件
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    isHelpVisible,
    setIsHelpVisible,
  };
};

export default useKeyboardShortcuts;
