/*
 * @Author: hidari
 * @Date: 2026-05-15 16:20
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:28:12
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect, useCallback, useRef } from "react";

// 扩展 performance 类型以支持 Chrome 的 memory API
interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

interface PerformanceMetrics {
  pageLoadTime: number;
  memoryUsage: number;
  memoryLimit: number;
  repaintCount: number;
  fps: number;
  isDevMode: boolean;
  isDevToolsOpen: boolean;
}

// 检查是否为开发模式
const isDevelopment = import.meta.env.DEV;

// 检测 DevTools 是否打开
const isDevToolsOpen = (): boolean => {
  const threshold = 160;
  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;
  return widthThreshold || heightThreshold;
};

export const usePerformance = (updateInterval: number = 1000) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    memoryUsage: 0,
    memoryLimit: 0,
    repaintCount: 0,
    fps: 0,
    isDevMode: isDevelopment,
    isDevToolsOpen: false,
  });

  const repaintCountRef = useRef(0);
  const fpsRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const animationFrameRef = useRef<number>();

  // 计算 FPS
  const calculateFPS = useCallback(() => {
    const now = performance.now();
    const delta = now - lastTimeRef.current;

    frameCountRef.current++;

    if (delta >= 1000) {
      fpsRef.current = Math.round((frameCountRef.current * 1000) / delta);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    animationFrameRef.current = requestAnimationFrame(calculateFPS);
  }, []);

  // 获取页面加载时间
  const getPageLoadTime = useCallback((): number => {
    const perfEntries = performance.getEntriesByType("navigation");
    if (perfEntries.length > 0) {
      const navigation = perfEntries[0] as PerformanceNavigationTiming;
      return Math.round(navigation.loadEventEnd - navigation.startTime);
    }
    // 如果没有 navigation timing，使用 paint timing
    const paintEntries = performance.getEntriesByType("paint");
    const paintEntry = paintEntries.find((entry) => entry.name === "complete");
    if (paintEntry) {
      return Math.round(paintEntry.startTime);
    }
    return 0;
  }, []);

  // 获取内存使用情况
  const getMemoryUsage = useCallback((): { used: number; limit: number } => {
    const memory = (performance as PerformanceWithMemory).memory;
    if (memory) {
      return {
        used: memory.usedJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }
    return { used: 0, limit: 0 };
  }, []);

  // 设置 PerformanceObserver 监听重绘
  useEffect(() => {
    let observer: PerformanceObserver | null = null;

    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "layout-shift" || entry.entryType === "paint") {
            repaintCountRef.current++;
          }
        }
      });

      observer.observe({ entryTypes: ["layout-shift", "paint"] });
    } catch {
      // PerformanceObserver 不支持，忽略错误
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  // 启动 FPS 计算
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(calculateFPS);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [calculateFPS]);

  // 定期更新指标
  useEffect(() => {
    const updateMetrics = () => {
      const { used, limit } = getMemoryUsage();

      setMetrics({
        pageLoadTime: getPageLoadTime(),
        memoryUsage: used,
        memoryLimit: limit,
        repaintCount: repaintCountRef.current,
        fps: fpsRef.current,
        isDevMode: isDevelopment,
        isDevToolsOpen: isDevToolsOpen(),
      });
    };

    // 初始更新
    updateMetrics();

    // 定时更新
    const interval = setInterval(updateMetrics, updateInterval);

    return () => clearInterval(interval);
  }, [updateInterval, getMemoryUsage, getPageLoadTime]);

  // 格式化字节大小
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }, []);

  // 格式化时间
  const formatTime = useCallback((ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }, []);

  // 是否显示面板（开发模式或 DevTools 打开时）
  const shouldShow = metrics.isDevMode || metrics.isDevToolsOpen;

  return {
    metrics,
    shouldShow,
    formatBytes,
    formatTime,
  };
};

export default usePerformance;
