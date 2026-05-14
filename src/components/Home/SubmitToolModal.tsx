/**
 * 提交工具弹窗组件
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, CheckCircle, Link, Loader2 } from "lucide-react";
import { CATEGORIES, type ToolCategory, saveSubmittedTool } from "../../data/tools";

interface SubmitToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SubmitToolModal = ({ isOpen, onClose, onSuccess }: SubmitToolModalProps) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    url: "",
    category: "dev" as ToolCategory,
    tags: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // 模拟提交延迟
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 保存工具
    saveSubmittedTool({
      name: formData.name,
      description: formData.description,
      url: formData.url,
      icon: "Box", // 默认图标
      category: formData.category,
      tags: formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isAI: false,
    });

    setIsSubmitting(false);
    setIsSuccess(true);

    // 3秒后关闭弹窗
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
      setFormData({ name: "", description: "", url: "", category: "dev", tags: "" });
      onSuccess?.();
    }, 2000);
  };

  const handleCopyShareText = () => {
    const shareText = `推荐工具：${formData.name}
描述：${formData.description}
链接：${formData.url}
分类：${CATEGORIES.find((c) => c.id === formData.category)?.name}
标签：${formData.tags}`;

    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-xl overflow-hidden"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">推荐工具</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  分享你认为好用的工具给其他人
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-6">
              {isSuccess ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                    提交成功！
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    感谢你的推荐，工具已添加到工具箱
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* 工具名称 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      工具名称 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例如：ChatGPT"
                      className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 
                                 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                                 transition-all duration-300"
                    />
                  </div>

                  {/* 描述 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      工具描述 *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="简要描述这个工具的主要功能..."
                      className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 
                                 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                                 transition-all duration-300 resize-none"
                    />
                  </div>

                  {/* 链接 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      工具链接 *
                    </label>
                    <div className="relative">
                      <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        required
                        value={formData.url}
                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                        placeholder="https://..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 
                                   text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400
                                   focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                                   transition-all duration-300"
                      />
                    </div>
                  </div>

                  {/* 分类 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      分类
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value as ToolCategory })
                      }
                      className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 
                                 text-gray-900 dark:text-white
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                                 transition-all duration-300"
                    >
                      {CATEGORIES.filter((c) => c.id !== "all").map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.icon} {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 标签 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      标签
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="用逗号分隔，例如：AI, 写作, 免费"
                      className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 
                                 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                                 transition-all duration-300"
                    />
                  </div>

                  {/* 按钮 */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200
                                 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 
                                 text-white font-medium hover:opacity-90 transition-opacity
                                 disabled:opacity-50 disabled:cursor-not-allowed
                                 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          提交中...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          提交工具
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* 底部提示 */}
            {!isSuccess && (
              <div className="px-6 pb-6">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-500">
                    💡 提示：提交的工具会保存在本地，你也可以{" "}
                    <button onClick={handleCopyShareText} className="underline hover:no-underline">
                      {copied ? "已复制！" : "复制分享文本"}
                    </button>{" "}
                    分享给他人
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
