// src/services/frontendRAG.ts
// 纯前端 RAG，使用用户自己的 API Key

export interface Chunk {
  text: string;
  source: string;
  title?: string;
  index: number;
}

export interface RAGSource {
  text: string;
  source: string;
  title?: string;
  similarity: number;
}

let chunks: Chunk[] = [];
let chunkVectors: number[][] = [];

// ============= 1. 调用 Embedding API =============
async function getEmbedding(text: string, apiKey: string, apiUrl: string): Promise<number[]> {
  const response = await fetch(`${apiUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "embo-01",
      texts: [text],
      type: "db",
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || "Embedding API 失败");
  }

  if (result.vectors && result.vectors[0]) {
    return result.vectors[0];
  }

  throw new Error("返回格式异常");
}

// ============= 2. 切分文章 =============
function splitIntoChunks(content: string, source: string, maxChunkSize = 800): Chunk[] {
  const paragraphs = content.split(/\n\s*\n/);
  const result: Chunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const candidate = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;

    if (candidate.length > maxChunkSize && currentChunk) {
      result.push({
        text: currentChunk.trim(),
        source,
        index: chunkIndex++,
      });
      currentChunk = trimmed;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk) {
    result.push({
      text: currentChunk.trim(),
      source,
      index: chunkIndex,
    });
  }

  return result;
}

// ============= 3. 索引博客（用户点击时触发）=============
export async function indexBlogPosts(
  blogContents: { path: string; content: string }[],
  apiKey: string,
  apiUrl: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  console.log("📚 开始索引博客文章...");

  // 1. 切分所有文章
  chunks = [];
  for (const blog of blogContents) {
    const newChunks = splitIntoChunks(blog.content, blog.path);
    chunks.push(...newChunks);
  }
  console.log(`✂️ 切分成 ${chunks.length} 个文本块`);

  if (chunks.length === 0) {
    console.warn("没有文本块可索引");
    return;
  }

  // 2. 生成所有块的向量
  console.log("🔄 生成向量中...");
  chunkVectors = [];

  for (let i = 0; i < chunks.length; i++) {
    const vec = await getEmbedding(chunks[i].text, apiKey, apiUrl);
    chunkVectors.push(vec);
    onProgress?.(i + 1, chunks.length);
    // 小延迟，避免请求过快
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(`✅ 索引完成，共 ${chunks.length} 个向量`);
}

// ============= 4. 余弦相似度 =============
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============= 5. 检索相关片段 =============
async function retrieveSimilar(
  query: string,
  apiKey: string,
  apiUrl: string,
  topK: number = 3,
): Promise<{ chunk: Chunk; similarity: number }[]> {
  if (chunks.length === 0) {
    return [];
  }

  // 生成查询向量
  const queryVector = await getEmbedding(query, apiKey, apiUrl);

  // 计算相似度
  const similarities = chunkVectors.map((vec, idx) => ({
    chunk: chunks[idx],
    similarity: cosineSimilarity(queryVector, vec),
  }));

  // 排序取 topK
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, topK);
}

// ============= 6. RAG 问答 =============
export async function askWithRAG(
  question: string,
  apiKey: string,
  apiUrl: string,
  model: string,
): Promise<{ answer: string; sources: { text: string; source: string; similarity: number }[] }> {
  if (chunks.length === 0) {
    return {
      answer: '请先点击"索引博客"按钮，等待索引完成后再提问。',
      sources: [],
    };
  }

  console.log(`❓ 问题: ${question}`);

  // 1. 检索相关片段
  const retrieved = await retrieveSimilar(question, apiKey, apiUrl, 3);

  if (retrieved.length === 0) {
    return {
      answer: "抱歉，没有找到相关内容。",
      sources: [],
    };
  }

  console.log(`📚 检索到 ${retrieved.length} 个相关片段`);

  // 2. 构建上下文和引用
  const context = retrieved.map((r) => r.chunk.text).join("\n\n---\n\n");
  const sources = retrieved.map((r) => ({
    text: r.chunk.text.slice(0, 150),
    source: r.chunk.source,
    similarity: r.similarity,
  }));

  // 3. 构建 prompt
  const systemPrompt = `你是一个严谨的博客问答助手。请严格依据下面的【参考资料】回答问题。
如果参考资料中没有相关信息，请说"根据现有博客文章，无法回答这个问题"。
不要编造任何信息，不要使用参考资料之外的知识。

【参考资料】
${context}`;

  // 4. 调用 Chat API
  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.1,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Chat API 错误:", result);
    return {
      answer: `API 调用失败: ${result.error?.message || "未知错误"}`,
      sources,
    };
  }

  const answer = result.choices?.[0]?.message?.content || "无响应";

  return { answer, sources };
}

// ============= 导出状态 =============
export function isRAGReady(): boolean {
  return chunks.length > 0;
}

// 获取索引统计（调试用）
export function getRAGStats(): { chunkCount: number; vectorCount: number; dimension: number } {
  return {
    chunkCount: chunks.length,
    vectorCount: chunkVectors.length,
    dimension: chunkVectors[0]?.length || 0,
  };
}
