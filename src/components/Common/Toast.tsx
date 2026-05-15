/*
 * @Author: hidari
 * @Date: 2026-05-15 16:17
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 16:21:01
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";

interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

let toastId = 0;
const toastListeners: Set<(toast: ToastMessage) => void> = new Set();

/**
 * 显示 toast 提示
 */
export const showToast = (
  message: string,
  type: "info" | "success" | "warning" | "error" = "info",
) => {
  const toast: ToastMessage = {
    id: `toast-${++toastId}`,
    message,
    type,
  };
  toastListeners.forEach((listener) => listener(toast));
};

/**
 * Toast 提示组件
 */
export const ToastProvider = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      // 3秒后自动移除
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3000);
    };

    toastListeners.add(handleToast);
    return () => {
      toastListeners.delete(handleToast);
    };
  }, []);

  const getToastStyles = (type: ToastMessage["type"]) => {
    switch (type) {
      case "success":
        return "bg-gradient-to-r from-green-500/90 to-emerald-500/90 text-white";
      case "warning":
        return "bg-gradient-to-r from-yellow-500/90 to-orange-500/90 text-white";
      case "error":
        return "bg-gradient-to-r from-red-500/90 to-pink-500/90 text-white";
      default:
        return "bg-gradient-to-r from-blue-500/90 to-indigo-500/90 text-white";
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg ${getToastStyles(toast.type)}`}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastProvider;
