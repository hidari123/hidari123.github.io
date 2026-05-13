/*
 * @Author: hidari
 * @Date: 2026-05-13 14:58:00
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:49:05
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout/Layout";
import { Home } from "@/pages/Home";
import { BlogList } from "@/pages/BlogList";
import { BlogPost } from "@/pages/BlogPost";
import { SettingsPage } from "@/pages/Settings";
import { NotFound } from "@/pages/NotFound";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
