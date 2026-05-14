/*
 * @Author: hidari
 * @Date: 2026-05-14 13:40
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-14 13:40:57
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { createContext, useContext, useState, ReactNode } from "react";

interface AIContextType {
  currentArticleContent: string | null;
  currentArticleTitle: string | null;
  setCurrentArticle: (content: string | null, title: string | null) => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: ReactNode }) {
  const [currentArticleContent, setCurrentArticleContent] = useState<string | null>(null);
  const [currentArticleTitle, setCurrentArticleTitle] = useState<string | null>(null);

  const setCurrentArticle = (content: string | null, title: string | null) => {
    setCurrentArticleContent(content);
    setCurrentArticleTitle(title);
  };

  return (
    <AIContext.Provider value={{ currentArticleContent, currentArticleTitle, setCurrentArticle }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAIContext() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAIContext must be used within AIProvider");
  }
  return context;
}
