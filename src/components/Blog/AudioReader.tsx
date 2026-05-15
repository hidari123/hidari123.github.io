/*
 * @Author: hidari
 * @Date: 2026-05-15 15:40:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-15 15:47:27
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, Pause, Play, Square, Settings } from "lucide-react";

interface AudioReaderProps {
  /** 文章内容（Markdown 格式） */
  content: string;
  /** 文章标题 */
  title?: string;
}

export const AudioReader = ({ content, title }: AudioReaderProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [rate, setRate] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentParagraph, setCurrentParagraph] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isSpeakingRef = useRef(false);

  // 清理文本：移除 Markdown 标记和代码块
  const cleanText = useCallback((text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, " [代码示例] ")
      .replace(/`[^`]*`/g, "")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/^>\s*/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/^[-*_]{3,}$/gm, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, []);

  // 分割段落
  const splitParagraphs = useCallback((text: string): string[] => {
    return text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 10);
  }, []);

  // 初始化语音列表
  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setIsSupported(false);
      return;
    }

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      const chineseVoice = availableVoices.find(
        (v) => v.lang.includes("zh") || v.lang.includes("CN"),
      );
      if (chineseVoice) {
        setSelectedVoice(chineseVoice.name);
      } else if (availableVoices.length > 0) {
        setSelectedVoice(availableVoices[0].name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // 处理内容
  useEffect(() => {
    const cleaned = cleanText(content);
    const paras = splitParagraphs(cleaned);
    setParagraphs(paras);
  }, [content, cleanText, splitParagraphs]);

  // 停止朗读
  const stopSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraph(-1);
    setProgress(0);
    setShowControls(false);
  }, []);

  // 开始朗读
  const startSpeech = useCallback(() => {
    if (paragraphs.length === 0) return;

    stopSpeech();
    setShowControls(true);

    const voice = voices.find((v) => v.name === selectedVoice);
    if (!voice) return;

    let currentIndex = 0;

    const speakNext = () => {
      if (currentIndex >= paragraphs.length) {
        stopSpeech();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(paragraphs[currentIndex]);
      utterance.voice = voice;
      utterance.rate = rate;
      utterance.pitch = 1;

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        setIsPlaying(true);
        setIsPaused(false);
        setCurrentParagraph(currentIndex);
        setProgress(((currentIndex + 1) / paragraphs.length) * 100);
      };

      utterance.onend = () => {
        currentIndex++;
        speakNext();
      };

      utterance.onerror = (event) => {
        if (event.error !== "interrupted") {
          console.error("朗读错误:", event.error);
        }
        stopSpeech();
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  }, [paragraphs, voices, selectedVoice, rate, stopSpeech]);

  // 暂停朗读
  const pauseSpeech = useCallback(() => {
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, []);

  // 继续朗读
  const resumeSpeech = useCallback(() => {
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, []);

  // 页面切换时停止
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  if (!isSupported) {
    return null;
  }

  const canPlay = paragraphs.length > 0;

  return (
    <div className="audio-reader relative flex items-center gap-2">
      {/* 主按钮 */}
      <motion.button
        onClick={() => {
          if (isPlaying && !isPaused) {
            pauseSpeech();
          } else if (isPaused) {
            resumeSpeech();
          } else {
            startSpeech();
          }
        }}
        disabled={!canPlay}
        whileHover={{ scale: canPlay ? 1.05 : 1 }}
        whileTap={{ scale: canPlay ? 0.95 : 1 }}
        className={`
          relative px-4 py-2 rounded-full font-medium text-sm
          flex items-center gap-2 transition-all overflow-hidden
          ${
            canPlay
              ? "bg-gradient-to-r from-pink-500/90 to-rose-500/90 text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40"
              : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
          }
        `}
      >
        {isPlaying && !isPaused && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-pink-400/30 to-rose-400/30"
            animate={{ x: ["0%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        )}

        <span className="relative z-10 flex items-center gap-2">
          {!isPlaying ? (
            <>
              <Volume2 className="w-4 h-4" />
              <span>朗读</span>
            </>
          ) : isPaused ? (
            <>
              <Play className="w-4 h-4" />
              <span>继续</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              <span>暂停</span>
            </>
          )}
        </span>
      </motion.button>

      {/* 悬浮控制按钮 - 仅在播放时显示 */}
      <AnimatePresence>
        {showControls && isPlaying && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-1 overflow-hidden"
          >
            {/* 停止按钮 */}
            <motion.button
              onClick={stopSpeech}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="停止"
            >
              <Square className="w-3 h-3" />
            </motion.button>

            {/* 设置按钮 */}
            <motion.button
              onClick={() => setShowSettings(!showSettings)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`p-1.5 rounded-full transition-colors ${
                showSettings
                  ? "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
              title="朗读设置"
            >
              <Settings className="w-3 h-3" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 设置面板 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 w-64 p-4 rounded-xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-pink-100 dark:border-pink-900/30 shadow-xl z-50"
          >
            {/* 进度条 */}
            {isPlaying && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>进度</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink-500 to-rose-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentParagraph + 1} / {paragraphs.length} 段
                </div>
              </div>
            )}

            {/* 语速控制 */}
            <div className="mb-4">
              <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <span>语速</span>
                <span className="text-pink-500">{rate}x</span>
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-pink-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.5x</span>
                <span>1x</span>
                <span>2x</span>
              </div>
            </div>

            {/* 语音选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                语音
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-700 dark:text-gray-300"
              >
                {voices
                  .filter((v) => v.lang.includes("zh") || v.lang.includes("CN"))
                  .map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name.replace(/\([^)]+\)/, "")} ({voice.lang})
                    </option>
                  ))}
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 点击外部关闭 */}
      {showSettings && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
      )}
    </div>
  );
};

export default AudioReader;
