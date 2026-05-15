/*
 * @Author: hidari
 * @Date: 2026-05-15 16:20
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:28:33
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect, useCallback } from "react";

interface AICallRecord {
  id: string;
  timestamp: number;
  duration: number;
  success: boolean;
}

interface AICallStats {
  callCount: number;
  totalDuration: number;
  averageDuration: number;
  successCount: number;
  failureCount: number;
  lastCallTime: number | null;
}

interface UseAICallStatsReturn {
  stats: AICallStats;
  recordCall: (duration: number, success: boolean) => void;
  resetStats: () => void;
}

// 全局状态用于跨组件共享
let globalCallCount = 0;
let globalTotalDuration = 0;
let globalSuccessCount = 0;
let globalFailureCount = 0;
let globalLastCallTime: number | null = null;
const globalRecords: AICallRecord[] = [];

// 事件监听器列表
const listeners: Set<() => void> = new Set();

// 通知所有监听器
const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export const useAICallStats = (): UseAICallStatsReturn => {
  const [stats, setStats] = useState<AICallStats>({
    callCount: 0,
    totalDuration: 0,
    averageDuration: 0,
    successCount: 0,
    failureCount: 0,
    lastCallTime: null,
  });

  // 记录一次 AI 调用
  const recordCall = useCallback((duration: number, success: boolean) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const record: AICallRecord = {
      id,
      timestamp: Date.now(),
      duration,
      success,
    };

    globalCallCount++;
    globalTotalDuration += duration;
    globalLastCallTime = Date.now();

    if (success) {
      globalSuccessCount++;
    } else {
      globalFailureCount++;
    }

    // 只保留最近 100 条记录
    if (globalRecords.length >= 100) {
      globalRecords.shift();
    }
    globalRecords.push(record);

    notifyListeners();
  }, []);

  // 重置统计
  const resetStats = useCallback(() => {
    globalCallCount = 0;
    globalTotalDuration = 0;
    globalSuccessCount = 0;
    globalFailureCount = 0;
    globalLastCallTime = null;
    globalRecords.length = 0;
    notifyListeners();
  }, []);

  // 更新状态
  const updateStats = useCallback(() => {
    const averageDuration = globalCallCount > 0 ? globalTotalDuration / globalCallCount : 0;

    setStats({
      callCount: globalCallCount,
      totalDuration: globalTotalDuration,
      averageDuration,
      successCount: globalSuccessCount,
      failureCount: globalFailureCount,
      lastCallTime: globalLastCallTime,
    });
  }, []);

  // 订阅全局状态变化
  useEffect(() => {
    const listener = () => {
      updateStats();
    };

    listeners.add(listener);
    updateStats();

    return () => {
      listeners.delete(listener);
    };
  }, [updateStats]);

  return {
    stats,
    recordCall,
    resetStats,
  };
};

// 导出全局记录获取函数，供 AI 服务调用
export const recordGlobalAICall = (duration: number, success: boolean) => {
  globalCallCount++;
  globalTotalDuration += duration;
  globalLastCallTime = Date.now();

  if (success) {
    globalSuccessCount++;
  } else {
    globalFailureCount++;
  }

  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const record: AICallRecord = {
    id,
    timestamp: Date.now(),
    duration,
    success,
  };

  if (globalRecords.length >= 100) {
    globalRecords.shift();
  }
  globalRecords.push(record);

  notifyListeners();
};

// 获取全局统计
export const getGlobalAICallStats = (): AICallStats => {
  const averageDuration = globalCallCount > 0 ? globalTotalDuration / globalCallCount : 0;

  return {
    callCount: globalCallCount,
    totalDuration: globalTotalDuration,
    averageDuration,
    successCount: globalSuccessCount,
    failureCount: globalFailureCount,
    lastCallTime: globalLastCallTime,
  };
};

export default useAICallStats;
