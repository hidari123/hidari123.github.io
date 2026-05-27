/*
 * @Author: hidari
 * @Date: 2026-05-20
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-27 14:56:43
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 *
 * 使用 ONNX Runtime Web 加载本地模型生成向量嵌入
 */
import * as ort from "onnxruntime-web";

// 配置 ONNX Runtime Web
ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
ort.env.wasm.simd = true;

// 本地模型路径
const LOCAL_MODEL_PATH = "/models/all-MiniLM-L6-v2/onnx/model.onnx";

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

let session: ort.InferenceSession | null = null;
let chunks: Chunk[] = [];
let chunkVectors: number[][] = [];
let isReady = false;
let isLoading = false;
let vocab: Map<number, string> = new Map();

// 简单的 BERT 分词器实现
async function loadTokenizer() {
  try {
    const vocabResponse = await fetch(
      `${LOCAL_MODEL_PATH.replace("/onnx/model.onnx", "/vocab.txt")}`,
    );
    const vocabText = await vocabResponse.text();

    vocab.clear();
    vocabText.split("\n").forEach((line, index) => {
      const token = line.trim();
      if (token) {
        vocab.set(index, token);
      }
    });

    console.log("分词器加载完成，词汇量:", vocab.size);
    return true;
  } catch (error) {
    console.error("分词器加载失败:", error);
    return false;
  }
}

// 简单的分词函数
function tokenize(text: string): { inputIds: number[]; attentionMask: number[] } {
  // 简单分词：按空格和标点符号分割
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);

  // 转换为 token IDs
  const inputIds: number[] = [101]; // [CLS]

  for (const token of tokens) {
    // 简单匹配：如果 vocab 中有完全匹配的，就用那个 ID
    let found = false;
    for (const [id, vocabToken] of vocab) {
      if (vocabToken === token) {
        inputIds.push(id);
        found = true;
        break;
      }
    }
    if (!found) {
      // 如果没找到，尝试 subword
      for (let i = 0; i < token.length; i++) {
        inputIds.push(100); // [UNK]
      }
    }
  }

  inputIds.push(102); // [SEP]

  // 填充到固定长度
  const maxLength = 256;
  while (inputIds.length < maxLength) {
    inputIds.push(0);
  }

  const attentionMask = inputIds.map((id) => (id > 0 ? 1 : 0));

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
  } as Record<string, ort.Tensor>);

  // 提取最后一层的隐藏状态
  const lastHiddenState = results["last_hidden_state"];
  const data = lastHiddenState.data as Float32Array;
  const dims = lastHiddenState.dims;

  // Mean pooling
  const seqLen = dims[2];
  const hiddenSize = dims[3];
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
    embeddings.push(count > 0 ? sum / count : 0);
  }

  // L2 归一化
  const norm = Math.sqrt(embeddings.reduce((sum, v) => sum + v * v, 0));
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
function splitIntoChunks(content: string, source: string, maxChunkSize = 300): Chunk[] {
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
    const newChunks = splitIntoChunks(blog.content, blog.path);
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
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

  const context = retrieved.map((r) => r.chunk.text).join("\n\n---\n\n");
  const sources: RAGSource[] = retrieved.map((r) => ({
    text: r.chunk.text.slice(0, 200),
    source: r.chunk.source,
    title: r.chunk.title,
    similarity: r.similarity,
  }));

  const systemPrompt = `你是一个严谨的博客问答助手。请严格依据下面的【参考资料】回答问题。
如果参考资料中没有相关信息，请说"根据现有博客文章，无法回答这个问题"。
不要编造任何信息，不要使用参考资料之外的知识。

【参考资料】
${context}`;

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

  const context = retrieved.map((r) => r.chunk.text).join("\n\n---\n\n");
  const sources: RAGSource[] = retrieved.map((r) => ({
    text: r.chunk.text.slice(0, 200),
    source: r.chunk.source,
    title: r.chunk.title,
    similarity: r.similarity,
  }));

  const systemPrompt = `你是一个严谨的博客问答助手。请严格依据下面的【参考资料】回答问题。
如果参考资料中没有相关信息，请说"根据现有博客文章，无法回答这个问题"。
不要编造任何信息，不要使用参考资料之外的知识。

【参考资料】
${context}`;

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
}
