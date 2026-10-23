/*
 * @Author: hidari
 * @Date: 2026-05-20
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-27 16:56:09
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 *
 * 使用 ONNX Runtime Web 加载本地模型生成向量嵌入
 *
 * 性能要点：onnxruntime-web 只用 `import type` 引类型，运行时才动态 import。
 * 原先是静态 import，导致首页就要背上 ort 的 wasm 胶水代码（dist 里还躺着
 * 一份 27MB 的 .wasm）；现在 ONNX 完全挡在「点索引博客」这一步之后，
 * 不进 AI 页的用户一次都不会碰到它。
 */
import type * as Ort from "onnxruntime-web";
import { loadCachedIndex, saveCachedIndex } from "./ragCache";
import type { PostIndex } from "./blogService";

// 仅在真正需要推理时加载的 ort 实例
let ortModule: typeof Ort | null = null;

async function getOrt(): Promise<typeof Ort> {
  if (!ortModule) {
    const mod = await import("onnxruntime-web");
    // esbuild interop：默认导出才是真正的命名空间
    ortModule = ((mod as { default?: typeof Ort }).default ?? mod) as typeof Ort;

    // 必须在创建 session 之前配好环境
    ortModule.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ortModule.env.wasm.simd = true;
  }
  return ortModule;
}

/**
 * 模型路径：用 int8 动态量化版（21.9MB），而不是 fp32 的 model.onnx（86.2MB）。
 * 体积差 4 倍，对检索质量的影响可以忽略，却直接决定用户第一次点「索引博客」
 * 要下多少字节。
 */
const MODEL_BASE = "/models/all-MiniLM-L6-v2";
const LOCAL_MODEL_PATH = `${MODEL_BASE}/onnx/model_int8.onnx`;

interface Chunk {
  text: string;
  source: string;
  title?: string;
  index: number;
}

interface RAGSource {
  text: string;
  source: string;
  title?: string;
  similarity: number;
}

let session: Ort.InferenceSession | null = null;
let chunks: Chunk[] = [];
let chunkVectors: number[][] = [];
let isReady = false;
let isLoading = false;
const vocab = new Map<string, number>();
let unkTokenId = 100;
let padTokenId = 0;

// 正确的 BERT WordPiece 分词器
async function loadTokenizer() {
  try {
    const vocabResponse = await fetch(`${MODEL_BASE}/vocab.txt`);
    const vocabText = await vocabResponse.text();

    vocab.clear();
    const lines = vocabText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const token = lines[i].trim();
      if (token) {
        vocab.set(token, i);
      }
    }

    // 查找特殊 token ID
    unkTokenId = vocab.get("[UNK]") ?? 100;
    padTokenId = vocab.get("[PAD]") ?? 0;

    console.log("分词器加载完成，词汇量:", vocab.size);
    return true;
  } catch (error) {
    console.error("分词器加载失败:", error);
    return false;
  }
}

// WordPiece 分词：将单个词拆分为 subword tokens
function wordPieceTokenize(word: string): string[] {
  const tokens: string[] = [];
  let start = 0;

  while (start < word.length) {
    let end = word.length;
    let found = false;

    // 从最长子串开始匹配
    while (start < end) {
      const sub = (start === 0 ? "" : "##") + word.slice(start, end).toLowerCase();
      if (vocab.has(sub)) {
        tokens.push(sub);
        found = true;
        break;
      }
      end--;
    }

    if (!found) {
      // 无法匹配，使用 [UNK]
      return ["[UNK]"];
    }

    start = end;
  }

  return tokens;
}

// 中文按字拆分（模拟 BertTokenizer 的 tokenize_chinese_chars）
function splitChineseChars(text: string): string {
  let result = "";
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      result += " " + ch + " ";
    } else {
      result += ch;
    }
  }
  return result;
}

// 完整的分词函数
function tokenize(text: string): { inputIds: number[]; attentionMask: number[] } {
  const maxLength = 256;

  // 先对中文按字拆分，再按空格和标点分割
  const spaced = splitChineseChars(text.toLowerCase());
  const words = spaced.split(/(\s+|[.,!?;:'"()[\]{}])/).filter((t) => t.trim().length > 0);

  const tokens: string[] = ["[CLS]"];

  for (const word of words) {
    const subTokens = wordPieceTokenize(word);
    for (const st of subTokens) {
      tokens.push(st);
      if (tokens.length >= maxLength - 1) break;
    }
    if (tokens.length >= maxLength - 1) break;
  }

  tokens.push("[SEP]");

  // 转换为 token IDs
  const inputIds = tokens.map((t) => vocab.get(t) ?? unkTokenId);

  // 填充
  while (inputIds.length < maxLength) {
    inputIds.push(padTokenId);
  }

  const attentionMask = inputIds.map((id) => (id !== padTokenId ? 1 : 0));

  return {
    inputIds: inputIds.slice(0, maxLength),
    attentionMask: attentionMask.slice(0, maxLength),
  };
}

// 初始化 ONNX 模型
export async function initEmbeddingModel(onProgress?: (status: string) => void): Promise<void> {
  if (session) {
    return;
  }

  if (isLoading) {
    while (isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return;
  }

  isLoading = true;
  onProgress?.("正在加载分词器...");

  try {
    // 先加载分词器
    const tokenizerLoaded = await loadTokenizer();
    if (!tokenizerLoaded) {
      throw new Error("分词器加载失败");
    }

    onProgress?.("正在加载 ONNX 模型...");

    // 到这一步才动态 import ort，把 wasm 下载推迟到用户真正需要时
    const ort = await getOrt();

    // 加载 ONNX 模型
    session = await ort.InferenceSession.create(LOCAL_MODEL_PATH, {
      executionProviders: ["wasm"],
    });

    console.log("模型加载成功");
    isReady = true;
    onProgress?.("模型加载完成！");
  } catch (error) {
    console.error("模型加载失败:", error);
    throw error;
  } finally {
    isLoading = false;
  }
}

// 生成单个文本的向量
async function getEmbedding(text: string): Promise<number[]> {
  if (!session) {
    throw new Error("模型未初始化");
  }

  const ort = await getOrt();
  const { inputIds, attentionMask } = tokenize(text);

  const inputIdsTensor = new ort.Tensor("int64", BigInt64Array.from(inputIds.map(BigInt)), [
    1,
    inputIds.length,
  ]);
  const attentionMaskTensor = new ort.Tensor(
    "int64",
    BigInt64Array.from(attentionMask.map(BigInt)),
    [1, attentionMask.length],
  );
  const tokenTypeIdsTensor = new ort.Tensor(
    "int64",
    BigInt64Array.from(new Array(inputIds.length).fill(0n)),
    [1, inputIds.length],
  );

  const results = await session.run({
    input_ids: inputIdsTensor,
    attention_mask: attentionMaskTensor,
    token_type_ids: tokenTypeIdsTensor,
  } as Record<string, Ort.Tensor>);

  // 提取最后一层的隐藏状态
  const lastHiddenState = results["last_hidden_state"];
  const data = lastHiddenState.data as Float32Array;
  const dims = lastHiddenState.dims;

  // Mean pooling
  // dims = [batch_size, seq_len, hidden_size]
  const seqLen = dims[1];
  const hiddenSize = dims[2];
  const embeddings: number[] = [];

  for (let i = 0; i < hiddenSize; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < seqLen; j++) {
      if (attentionMask[j] === 1) {
        sum += data[j * hiddenSize + i];
        count++;
      }
    }
    const value = count > 0 ? sum / count : 0;
    embeddings.push(isNaN(value) ? 0 : value);
  }

  // L2 归一化
  const norm = Math.sqrt(embeddings.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0 || isNaN(norm)) {
    // 如果向量全为零，返回零向量（避免 NaN）
    return embeddings.map(() => 0);
  }
  return embeddings.map((v) => v / norm);
}

// 批量生成向量 - 带实时进度回调
async function getEmbeddings(
  texts: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const embedding = await getEmbedding(texts[i]);
    results.push(embedding);

    // 每生成一个向量就更新进度
    console.log(`RAG Service: 调用进度回调 ${i + 1}/${texts.length}`);
    onProgress?.(i + 1, texts.length);

    if (i % 5 === 0) {
      console.log(`生成向量进度: ${i + 1}/${texts.length}`);
    }
  }

  return results;
}

// 切分文本为块
function splitIntoChunks(
  content: string,
  source: string,
  title?: string,
  maxChunkSize = 300,
): Chunk[] {
  const paragraphs = content.split(/\n\s*\n/);
  const result: Chunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length < 30) continue;

    const candidate = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;

    if (candidate.length > maxChunkSize && currentChunk) {
      result.push({
        text: currentChunk.trim(),
        source,
        title,
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
      title,
      index: chunkIndex,
    });
  }

  return result;
}

// 索引博客文章
export async function indexBlogPosts(
  blogContents: { path: string; title?: string; content: string }[],
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<void> {
  if (!isReady) {
    await initEmbeddingModel((status) => onProgress?.(0, 0, status));
  }

  console.log("📚 开始索引博客文章...");

  chunks = [];
  for (const blog of blogContents) {
    const newChunks = splitIntoChunks(blog.content, blog.path, blog.title);
    chunks.push(...newChunks);
  }
  console.log(`✂️ 切分成 ${chunks.length} 个文本块`);

  if (chunks.length === 0) {
    console.warn("没有文本块可索引");
    return;
  }

  const totalSteps = chunks.length * 2; // 分块 + 向量两步
  let currentStep = chunks.length; // 分块已完成

  onProgress?.(currentStep, totalSteps, "正在生成向量...");

  console.log("🔄 生成向量中...");
  chunkVectors = await getEmbeddings(
    chunks.map((c) => c.text),
    (vecDone) => {
      currentStep = chunks.length + vecDone;
      onProgress?.(currentStep, totalSteps, `生成向量: ${vecDone}/${chunks.length}`);
    },
  );

  // 均值向量必须在 chunkVectors 填好之后算，相关推荐和语义搜索都依赖它
  buildDocVectors();

  console.log(`✅ 索引完成，共 ${chunks.length} 个向量`);
  onProgress?.(totalSteps, totalSteps, "索引完成！");
}

// 余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0 || isNaN(denominator)) return 0;
  const result = dot / denominator;
  return isNaN(result) ? 0 : result;
}

// 检索相关片段
export async function retrieveSimilar(
  query: string,
  topK: number = 3,
): Promise<{ chunk: Chunk; similarity: number }[]> {
  if (chunks.length === 0) return [];

  const queryVector = await getEmbedding(query);

  const similarities = chunkVectors.map((vec, idx) => ({
    chunk: chunks[idx],
    similarity: cosineSimilarity(queryVector, vec),
  }));

  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, topK);
}

// RAG 问答
export async function askWithRAG(
  question: string,
  apiKey: string,
  apiUrl: string,
  model: string,
): Promise<{ answer: string; sources: RAGSource[] }> {
  if (chunks.length === 0) {
    return {
      answer: '请先点击"索引博客"按钮，等待索引完成后再提问。',
      sources: [],
    };
  }

  console.log(`❓ 问题: ${question}`);

  const retrieved = await retrieveSimilar(question, 3);

  if (retrieved.length === 0) {
    return { answer: "抱歉，没有找到相关内容。", sources: [] };
  }

  console.log(`📚 检索到 ${retrieved.length} 个相关片段`);

  const sources: RAGSource[] = retrieved.map((r) => ({
    text: r.chunk.text.slice(0, 200),
    source: r.chunk.source,
    title: r.chunk.title,
    similarity: r.similarity,
  }));

  const contextWithRefs = retrieved
    .map((r, i) => `[${i + 1}] (来源: ${r.chunk.title || r.chunk.source})\n${r.chunk.text}`)
    .join("\n\n---\n\n");

  const systemPrompt = `你是一个严谨的博客问答助手。请严格依据下面的【参考资料】回答问题。
如果参考资料中没有相关信息，请说"根据现有博客文章，无法回答这个问题"。
不要编造任何信息，不要使用参考资料之外的知识。

重要：回答时必须在引用资料的地方标注来源编号，例如 [1]、[2]。在回答的末尾，请列出实际使用的参考来源。

【参考资料】
${contextWithRefs}`;

  try {
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
      return {
        answer: `API 调用失败: ${result.error?.message || "未知错误"}`,
        sources,
      };
    }

    const answer = result.choices?.[0]?.message?.content || "无响应";
    return { answer, sources };
  } catch (error) {
    console.error("Chat API 调用失败:", error);
    return { answer: "调用 AI 服务失败，请检查网络连接", sources };
  }
}

// RAG 流式问答
export async function askWithRAGStream(
  question: string,
  apiKey: string,
  apiUrl: string,
  model: string,
  onChunk: (text: string) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void,
): Promise<{ answer: string; sources: RAGSource[] }> {
  if (chunks.length === 0) {
    const msg = '请先点击"索引博客"按钮，等待索引完成后再提问。';
    onChunk(msg);
    onComplete?.();
    return { answer: msg, sources: [] };
  }

  console.log(`❓ 问题: ${question}`);

  const retrieved = await retrieveSimilar(question, 3);

  if (retrieved.length === 0) {
    const msg = "抱歉，没有找到相关内容。";
    onChunk(msg);
    onComplete?.();
    return { answer: msg, sources: [] };
  }

  console.log(`📚 检索到 ${retrieved.length} 个相关片段`);

  const contextWithRefs = retrieved
    .map((r, i) => `[${i + 1}] (来源: ${r.chunk.title || r.chunk.source})\n${r.chunk.text}`)
    .join("\n\n---\n\n");
  const sources: RAGSource[] = retrieved.map((r) => ({
    text: r.chunk.text.slice(0, 200),
    source: r.chunk.source,
    title: r.chunk.title,
    similarity: r.similarity,
  }));

  const systemPrompt = `你是一个严谨的博客问答助手。请严格依据下面的【参考资料】回答问题。
如果参考资料中没有相关信息，请说"根据现有博客文章，无法回答这个问题"。
不要编造任何信息，不要使用参考资料之外的知识。

重要：回答时必须在引用资料的地方标注来源编号，例如 [1]、[2]。在回答的末尾，请列出实际使用的参考来源。

【参考资料】
${contextWithRefs}`;

  try {
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
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = `API 调用失败: ${errorData.error?.message || "未知错误"}`;
      const err = new Error(errMsg);
      onError?.(err);
      return { answer: errMsg, sources };
    }

    if (!response.body) {
      const err = new Error("响应体为空");
      onError?.(err);
      return { answer: "响应体为空", sources };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onComplete?.();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onComplete?.();
            return { answer: fullContent, sources };
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onChunk(delta);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return { answer: fullContent, sources };
  } catch (error) {
    const err = error instanceof Error ? error : new Error("调用 AI 服务失败，请检查网络连接");
    console.error("Chat API 调用失败:", error);
    onError?.(err);
    return { answer: "调用 AI 服务失败，请检查网络连接", sources };
  }
}

// 状态检查
export function isRAGReady(): boolean {
  return isReady && chunks.length > 0;
}

export function getRAGStats(): { chunkCount: number; vectorCount: number; dimension: number } {
  return {
    chunkCount: chunks.length,
    vectorCount: chunkVectors.length,
    dimension: chunkVectors[0]?.length || 0,
  };
}

export function clearIndex(): void {
  chunks = [];
  chunkVectors = [];
  docVectors = {};
}

/**
 * 每篇文章的向量均值。
 *
 * 相关推荐用它而不是重新推理：把一篇文章所有块的向量平均一下，
 * 得到一个「这篇文章讲什么」的粗粒度表征。和另一篇的平均向量算余弦，
 * 就得到了相似度。零额外推理成本。
 */
let docVectors: Record<string, number[]> = {};

/** 计算每篇文章的均值向量。必须在 chunkVectors 填充后调用 */
function buildDocVectors(): void {
  if (chunks.length === 0 || chunkVectors.length === 0) return;

  const dim = chunkVectors[0].length;
  const acc = new Map<string, number[]>();
  const counts = new Map<string, number>();

  for (let i = 0; i < chunks.length; i++) {
    const src = chunks[i].source;
    const sum = acc.get(src) ?? new Array<number>(dim).fill(0);
    const v = chunkVectors[i];
    for (let d = 0; d < dim; d++) sum[d] += v[d];
    acc.set(src, sum);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }

  docVectors = {};
  for (const [src, sum] of acc) {
    const n = counts.get(src) ?? 1;
    docVectors[src] = sum.map((x) => x / n);
  }
}

/**
 * 相关推荐：根据已建好的索引，推出与 source 最相近的几篇文章。
 *
 * 需要索引已就绪（点过「索引博客」或命中缓存）。没就绪时返回空数组，
 * 调用方直接不渲染这个区块——不显示比显示一个空的「相关阅读」好。
 *
 * excludeSelf 传 true 时会排除自己那篇。相似度低于阈值的结果直接丢掉：
 * 余弦相似 0.5 的两篇文章，硬凑成「相关推荐」不如不给。
 */
export async function findRelatedPosts(
  source: string,
  topK = 3,
  minSimilarity = 0.35,
): Promise<{ source: string; title?: string; similarity: number }[]> {
  if (!isReady || chunks.length === 0) return [];

  const query = docVectors[source];
  if (!query) return [];

  const scored = Object.entries(docVectors)
    .filter(([src]) => src !== source)
    .map(([src, vec]) => ({
      source: src,
      title: chunks.find((c) => c.source === src)?.title,
      similarity: cosineSimilarity(query, vec),
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK);
}

/**
 * 站内语义搜索：不是关键词匹配，是向量检索。
 *
 * 关键词匹配搜「缓存」就只出带「缓存」两个字的文章；向量检索能出
 * 「快取失效」「memcached」「stale-while-revalidate」这类写法不同但意思一样的。
 * 代价是需要模型和索引，所以关键词搜索保留作为降级路径。
 *
 * topK 里会带上相似度，交给调用方决定要不要展示。
 */
export async function semanticSearch(
  query: string,
  topK = 8,
  minSimilarity = 0.25,
): Promise<{ source: string; title?: string; similarity: number }[]> {
  if (!isReady || chunks.length === 0) return [];

  const queryVector = await getEmbedding(query);
  if (!queryVector) return [];

  const scored = Object.entries(docVectors)
    .map(([src, vec]) => ({
      source: src,
      title: chunks.find((c) => c.source === src)?.title,
      similarity: cosineSimilarity(queryVector, vec),
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK);
}

/** 把内部索引恢复到内存。用于命中缓存的快路径 */
export function restoreIndex(data: {
  chunks: { text: string; source: string; title?: string; index: number }[];
  chunkVectors: number[][];
  docVectors: Record<string, number[]>;
}): void {
  chunks = data.chunks;
  chunkVectors = data.chunkVectors;
  docVectors = data.docVectors;
  isReady = true;
}

/**
 * 建索引的统一入口：先查缓存，命中直接返回，miss 才真算。
 *
 * 之前每次都要重新推理 300 多个块（浏览器 CPU 上几秒到几十秒），
 * 而文章没变、模型没变时结果完全一样。缓存命中直接反序列化，毫秒级。
 *
 * 返回是否命中缓存，供 UI 区分「索引完成（缓存）」和「索引完成（重新计算）」。
 */
export async function ensureIndex(
  posts: PostIndex[],
  contents: { path: string; title?: string; content: string }[],
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<{ fromCache: boolean }> {
  const cached = loadCachedIndex(posts);
  if (cached) {
    restoreIndex(cached);
    onProgress?.(1, 1, "索引缓存命中");
    return { fromCache: true };
  }

  await indexBlogPosts(contents, onProgress);

  // 算完就存。只存文章索引的描述信息，不存正文（正文已经在 blogs/ 目录里了）
  try {
    saveCachedIndex(
      posts,
      chunks,
      chunkVectors,
    );
  } catch {
    // 缓存写失败不影响功能
  }

  return { fromCache: false };
}
