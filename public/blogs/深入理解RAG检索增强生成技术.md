<!--
 * @Author: hidari
 * @Date: 2026-05-20 14:36:37
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-20 14:36:55
 * Copyright (c) 2026 by hidari, All Rights Reserved.
-->

---

title: "深入理解 RAG：检索增强生成技术从原理到实战"
date: "2026-05-15"
tags: [大模型应用, 工程实践, RAG]
cover: ""
description: "分块大小、召回数量、混合检索要不要做——用我自己这个博客的向量索引踩出来的阈值，以及纯向量检索在技术内容上为什么会召回一堆噪音。"

---

# 深入理解 RAG：检索增强生成技术从原理到实战

先给结论，因为这篇写的是我自己踩过的坑，不是 RAG 白皮书。

我给自己的博客做了一个 RAG，35 篇文章，ONNX MiniLM 跑在浏览器里。上线之后最大的问题不是模型答错，
是它**答得很自信地答错**——检索回来的是三段语义相近但其实没关系的文字，
然后在那一堆里编一个像模像样的结论。所以这篇重点不在「RAG 是什么」，
在「哪些参数真的影响结果，以及哪些步骤其实可以不做」。

## 为什么需要 RAG？

### 大语言模型的局限性

尽管 LLM 具备强大的通用能力，但在实际应用中仍面临诸多挑战：

| 问题           | 描述                                 | RAG 解决方案               |
| -------------- | ------------------------------------ | -------------------------- |
| **知识时效性** | 训练数据有截止日期，无法获取最新信息 | 实时检索最新文档           |
| **幻觉问题**   | 可能产生看似合理但错误的内容         | 基于检索结果生成，降低幻觉 |
| **领域知识**   | 缺乏特定行业的专业知识               | 注入领域专属文档           |
| **数据隐私**   | 不能或不愿将敏感数据用于训练         | 本地检索，不泄露数据       |
| **可解释性**   | 输出难以追溯来源                     | 检索结果可追溯             |

### RAG 的核心价值

```python
# 传统方式 vs RAG 方式对比

# ❌ 传统方式：完全依赖模型知识
def ask_traditional(question, model):
    return model.generate(f"回答问题：{question}")

# ✅ RAG 方式：结合检索和生成
def ask_with_rag(question, model, vector_store, top_k=5):
    # 1. 检索相关文档
    docs = vector_store.similarity_search(question, k=top_k)
    context = "\n".join([doc.content for doc in docs])

    # 2. 构建提示
    prompt = f"""
    基于以下参考资料回答问题。如果资料中没有相关信息，请如实说明。

    参考资料：
    {context}

    问题：{question}
    """

    # 3. 生成回答
    return model.generate(prompt)
```

## RAG 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         RAG 系统架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   数据源    │───▶│   文档处理   │───▶│   分块      │        │
│   │  (PDF/网页) │    │  (解析/清洗) │    │  (Chunking) │        │
│   └─────────────┘    └─────────────┘    └──────┬──────┘        │
│                                                 │               │
│                                                 ▼               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   生成回答  │◀───│   提示构建  │◀───│   向量检索   │        │
│   │   (LLM)     │    │  (Prompt)   │    │  (Retrieval)│        │
│   └─────────────┘    └─────────────┘    └──────┬──────┘        │
│                                                 │               │
│                                                 ▼               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   响应      │◀───│   重排序    │◀───│   向量嵌入  │        │
│   │  (Response) │    │  (Rerank)   │    │  (Embedding)│        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心技术详解

### 1. 文档分块策略（Chunking）

分块策略直接影响检索质量和生成效果。

```python
from typing import List, Optional
from dataclasses import dataclass

@dataclass
class Chunk:
    content: str
    metadata: dict
    embedding: Optional[List[float]] = None

class TextSplitter:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_text(self, text: str) -> List[Chunk]:
        """滑动窗口分块"""
        chunks = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size
            chunk_text = text[start:end]

            chunks.append(Chunk(
                content=chunk_text,
                metadata={"start": start, "end": end}
            ))

            start += self.chunk_size - self.chunk_overlap

        return chunks

# 递归字符分块（适合代码）
def recursive_chunk(text: str, separators: List[str] = ["\n\n", "\n", " "]) -> List[str]:
    def split(text, separators, depth=0):
        if depth >= len(separators):
            return [text] if text else []

        separator = separators[depth]
        parts = text.split(separator)

        result = []
        for part in parts:
            if len(part) > 500:  # 仍太长，继续分割
                result.extend(split(part, separators, depth + 1))
            else:
                result.append(part)

        return result

    return split(text, separators)
```

### 2. 向量嵌入与检索

```python
from sentence_transformers import SentenceTransformer
import numpy as np

class VectorStore:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.documents = []
        self.embeddings = None

    def add_documents(self, chunks: List[Chunk]):
        """添加文档并生成嵌入"""
        texts = [chunk.content for chunk in chunks]
        embeddings = self.model.encode(texts, show_progress_bar=True)

        if self.embeddings is None:
            self.embeddings = embeddings
        else:
            self.embeddings = np.vstack([self.embeddings, embeddings])

        self.documents.extend(chunks)

    def similarity_search(self, query: str, k: int = 5) -> List[Chunk]:
        """向量相似度检索"""
        query_embedding = self.model.encode([query])
        similarities = np.dot(self.embeddings, query_embedding.T).flatten()

        top_k_indices = np.argsort(similarities)[-k:][::-1]
        return [self.documents[i] for i in top_k_indices]

    def search_with_filter(self, query: str, filter_dict: dict, k: int = 5) -> List[Chunk]:
        """带过滤条件的检索"""
        all_results = self.similarity_search(query, k * 3)

        filtered = []
        for chunk in all_results:
            if all(chunk.metadata.get(k) == v for k, v in filter_dict.items()):
                filtered.append(chunk)
                if len(filtered) >= k:
                    break

        return filtered
```

### 3. 混合检索策略

```python
class HybridRetriever:
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store

    def retrieve(self, query: str, k: int = 5, alpha: float = 0.5) -> List[Chunk]:
        """
        混合检索：结合向量检索和关键词检索
        alpha: 权重，1.0=纯向量，0.0=纯关键词
        """
        # 向量检索
        vector_results = self.vector_store.similarity_search(query, k * 2)

        # BM25 关键词检索（简化实现）
        bm25_results = self.bm25_search(query, k * 2)

        # 加权融合
        fused = self.rerank(query, vector_results, bm25_results, alpha)

        return fused[:k]

    def bm25_search(self, query: str, k: int) -> List[Chunk]:
        """BM25 检索实现"""
        # 实际项目中推荐使用 rank_bm25 库
        scores = {}
        query_terms = query.lower().split()

        for i, doc in enumerate(self.vector_store.documents):
            score = sum(1 for term in query_terms if term in doc.content.lower())
            scores[i] = score

        sorted_indices = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [self.vector_store.documents[i] for i, _ in sorted_indices[:k]]

    def rerank(self, query, vector_results, bm25_results, alpha):
        """结果重排序"""
        seen = {}
        all_results = vector_results + bm25_results

        for chunk in all_results:
            if chunk not in seen:
                seen[chunk] = 0

            seen[chunk] += alpha if chunk in vector_results else (1 - alpha)

        return sorted(seen.keys(), key=lambda x: seen[x], reverse=True)
```

### 4. 生产级 RAG 系统实现

```python
from typing import List, Optional
from dataclasses import dataclass
from enum import Enum

class RetrievalStrategy(Enum):
    SIMPLE = "simple"
    HYBRID = "hybrid"
    SEMANTIC = "semantic"

@dataclass
class RAGConfig:
    chunk_size: int = 500
    chunk_overlap: int = 50
    retrieval_top_k: int = 5
    retrieval_alpha: float = 0.5  # 混合检索权重
    rerank_top_k: int = 3
    min_similarity: float = 0.5

class RAGSystem:
    def __init__(self, config: RAGConfig = None):
        self.config = config or RAGConfig()
        self.splitter = TextSplitter(
            self.config.chunk_size,
            self.config.chunk_overlap
        )
        self.vector_store = VectorStore()
        self.llm = ChatOpenAI(model="gpt-4")

    def index_documents(self, documents: List[dict]):
        """索引文档"""
        all_chunks = []

        for doc in documents:
            text = doc["content"]
            chunks = self.splitter.split_text(text)

            for chunk in chunks:
                chunk.metadata.update({
                    "source": doc.get("source", "unknown"),
                    "title": doc.get("title", ""),
                })
            all_chunks.extend(chunks)

        self.vector_store.add_documents(all_chunks)
        print(f"Indexed {len(all_chunks)} chunks from {len(documents)} documents")

    def query(self, question: str, strategy: RetrievalStrategy = RetrievalStrategy.HYBRID) -> dict:
        """查询并生成回答"""
        # 1. 检索相关文档
        if strategy == RetrievalStrategy.HYBRID:
            docs = self.vector_store.similarity_search(question, self.config.retrieval_top_k)
        else:
            docs = self.vector_store.similarity_search(question, self.config.retrieval_top_k)

        # 2. 过滤低相关度结果
        docs = [d for d in docs if self.is_relevant(question, d.content)]

        if not docs:
            return {
                "answer": "抱歉，没有找到相关信息来回答您的问题。",
                "sources": []
            }

        # 3. 构建上下文
        context = "\n\n".join([f"[{i+1}] {doc.content}" for i, doc in enumerate(docs)])

        # 4. 生成回答
        prompt = f"""基于以下参考资料回答问题。如果资料中没有相关信息，请如实说明。
不要直接说"根据参考资料"，而是像正常对话一样回答。

参考资料：
{context}

问题：{question}

回答："""

        response = self.llm.invoke(prompt)

        return {
            "answer": response.content,
            "sources": [
                {
                    "content": doc.content[:200] + "...",
                    "source": doc.metadata.get("source", ""),
                    "title": doc.metadata.get("title", "")
                }
                for doc in docs
            ]
        }

    def is_relevant(self, query: str, document: str) -> bool:
        """简单相关性判断"""
        query_terms = set(query.lower().split())
        doc_terms = set(document.lower().split())
        overlap = len(query_terms & doc_terms)
        return overlap >= min(2, len(query_terms))
```

## RAG 优化策略

### 1. 查询优化

```python
class QueryOptimizer:
    def __init__(self, llm):
        self.llm = llm

    def expand_query(self, query: str) -> List[str]:
        """查询扩展 - 同义词、相关概念"""
        prompt = f"""对于以下查询，生成3个不同的表述方式（保持原意）：

查询：{query}

要求：
1. 使用不同的词汇表达相同意思
2. 可以添加相关领域术语
3. 每个表述用换行分隔"""

        response = self.llm.invoke(prompt)
        queries = response.content.strip().split("\n")
        return [query] + queries

    def decompose_query(self, query: str) -> List[str]:
        """查询分解 - 将复杂问题拆分为子问题"""
        prompt = f"""将以下复杂问题拆分为2-3个简单的子问题：

问题：{query}

格式：
1. [子问题1]
2. [子问题2]
3. [子问题3]（可选）"""

        response = self.llm.invoke(prompt)
        # 解析子问题...
        return [query]  # 简化实现
```

### 2. 上下文压缩

```python
class ContextCompressor:
    def __init__(self, llm):
        self.llm = llm

    def compress(self, documents: List[Chunk], query: str) -> List[Chunk]:
        """上下文压缩 - 提取最相关部分"""
        compressed = []

        for doc in documents:
            prompt = f"""从以下文档中提取与问题最相关的部分。

问题：{query}

文档：{doc.content}

要求：
1. 直接提取相关段落，不要改写
2. 保留关键信息和上下文
3. 如果完全不相关，返回空"""

            response = self.llm.invoke(prompt)

            if response.content.strip():
                compressed.append(Chunk(
                    content=response.content,
                    metadata=doc.metadata
                ))

        return compressed
```

> 我自己的经验：分块先从 300~500 字符试起，比「按固定 token 数切」的效果好。
> 按段落边界（Markdown 的空行）切优先于硬切，否则一句话被砍成两半，召回的就是碎片。

## 优化策略

### 混合检索要不要做？

这个问题我犹豫了很久，结论是：**35 篇文档的规模下不用做**。

纯向量检索在技术内容上确实会召回噪音——「缓存」和「WebSocket 心跳」语义上确实近，
但它们对你当前的问题不一定相关。加上 BM25 确实能缓解这个问题，
可引入的是一个新的复杂度：融合权重怎么定、召回结果怎么去重、两路结果不一致时信谁。

35 篇文档的时候，我先加了阈值过滤（相似度低于 0.3 直接丢弃），
效果已经够好。等文档到几千篇、或者开始出现大量专有名词缩写（`SSE`、`RLS`、
`mmCIF` 这类）时再上混合检索——那时候关键词那一路才是真的必要。

### 成本比效果敏感

我的向量索引 35 篇文章大约 300 个块，int8 量化后 22MB，
在浏览器里全量重算一遍是秒级。所以站内检索我干脆不做缓存，
每次算完就扔。**先测出重建的代价，再决定要不要缓存**——
很多「需要缓存」的判断是想象出来的。

## 总结

RAG 真正起作用的地方，不在 prompt 写得多巧妙，而在三件事上：
分块切得对不对、召回的相似度阈值卡不卡、答完之后有没有校验它是否真被支持。

前两件我写在上面了。第三件（self-correction：回答完让模型自己检查
「这个结论有没有被引用支持」）我还没做，但在我看来那是 RAG 和「会胡说的搜索」的分界线。

```

```
