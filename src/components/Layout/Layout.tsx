/*
 * @Author: hidari
 * @Date: 2026-05-13 14:56:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 14:55:08
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-16">{children}</main>
      <Footer />
    </div>
  );
};
