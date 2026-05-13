/*
 * @Author: hidari
 * @Date: 2026-05-13 16:30
 * @LastEditors: hidari
 * @LastEditTime: 2026-05-13 16:44:34
 * Copyright (c) 2026 by hidari, All Rights Reserved.
 */

// GitHub API 配置
const GITHUB_API_BASE = "https://api.github.com";

// 评论接口（原始 GitHub API 返回）
export interface Comment {
  id: number;
  body: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  created_at: string;
  updated_at: string;
}

// 解析后的评论接口
export interface ParsedComment {
  id: number;
  name: string;
  email?: string;
  body: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  created_at: string;
}

// Issue 接口
export interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

// 获取 GitHub Token
function getGitHubToken(): string | null {
  return localStorage.getItem("github_token");
}

// 获取仓库配置
function getRepoConfig() {
  return {
    owner: import.meta.env.VITE_GITHUB_REPO_OWNER || "",
    repo: import.meta.env.VITE_GITHUB_REPO_NAME || "",
  };
}

// 内部解析接口
interface InternalParsedComment {
  body: string;
  name?: string;
  email?: string;
  date?: string;
}

function parseCommentBody(body: string): InternalParsedComment {
  const lines = body.split("\n");
  let metaLine = "";
  const contentLines: string[] = [];

  // 查找元信息行（格式：<!-- name=xxx email=xxx date=xxx -->）
  for (const line of lines) {
    if (line.includes("<!--") && line.includes("-->")) {
      metaLine = line;
    } else if (!line.startsWith("<!--")) {
      contentLines.push(line);
    }
  }

  const result: InternalParsedComment = {
    body: contentLines.join("\n").trim(),
  };

  // 解析元信息
  const nameMatch = metaLine.match(/name=([^>\s]+)/);
  const emailMatch = metaLine.match(/email=([^>\s]+)/);
  const dateMatch = metaLine.match(/date=([^>\s]+)/);

  if (nameMatch) result.name = decodeURIComponent(nameMatch[1]);
  if (emailMatch) result.email = decodeURIComponent(emailMatch[1]);
  if (dateMatch) result.date = decodeURIComponent(dateMatch[1]);

  return result;
}

/**
 * 获取某个 Issue 的所有评论
 */
export async function getComments(issueNumber: number): Promise<Comment[]> {
  const { owner, repo } = getRepoConfig();

  if (!owner || !repo) {
    throw new Error("请先配置 GitHub 仓库信息");
  }

  const token = getGitHubToken();
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { headers },
  );

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`获取评论失败: ${response.status}`);
  }

  const comments: Comment[] = await response.json();
  return comments;
}

/**
 * 创建新评论
 */
export async function createComment(
  issueNumber: number,
  body: string,
  name: string,
  email?: string,
): Promise<Comment> {
  const { owner, repo } = getRepoConfig();

  if (!owner || !repo) {
    throw new Error("请先配置 GitHub 仓库信息");
  }

  const token = getGitHubToken();
  if (!token) {
    throw new Error("请先设置 GitHub Token 以发表评论");
  }

  const date = new Date().toISOString();
  // 将用户信息作为 HTML 注释添加到评论中，便于解析
  const commentBody = `<!-- name=${encodeURIComponent(name)} email=${encodeURIComponent(email || "")} date=${encodeURIComponent(date)} -->\n\n${body}`;

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ body: commentBody }),
    },
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("GitHub Token 无效或已过期，请重新设置");
    }
    if (response.status === 403) {
      throw new Error("没有权限发表评论，请检查 Token 权限");
    }
    throw new Error(`发表评论失败: ${response.status}`);
  }

  return await response.json();
}

/**
 * 根据 slug 查找或创建对应的 Issue
 */
export async function findOrCreateIssue(slug: string, title: string): Promise<Issue> {
  const { owner, repo } = getRepoConfig();

  if (!owner || !repo) {
    throw new Error("请先配置 GitHub 仓库信息");
  }

  const token = getGitHubToken();
  if (!token) {
    throw new Error("请先设置 GitHub Token");
  }

  const issueTitle = `[Blog] ${slug}`;

  // 先尝试查找已存在的 Issue
  const searchResponse = await fetch(
    `${GITHUB_API_BASE}/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} ${issueTitle}`)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    const existingIssue = searchData.items?.find(
      (item: Issue) => item.title === issueTitle && !item.body?.startsWith("<!-- duplicated"),
    );

    if (existingIssue) {
      return existingIssue;
    }
  }

  // 创建新的 Issue
  const createResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      title: issueTitle,
      body: `## ${title}\n\n文章评论区\n\n---\n*请在此下方留言*`,
      labels: ["blog", "comments"],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`创建 Issue 失败: ${createResponse.status}`);
  }

  return await createResponse.json();
}

/**
 * 获取文章的评论（包含解析后的元信息）
 */
export async function getArticleComments(issueNumber: number): Promise<
  Array<{
    id: number;
    name: string;
    email?: string;
    body: string;
    user: Comment["user"];
    created_at: string;
  }>
> {
  const comments = await getComments(issueNumber);

  return comments.map((comment) => {
    const parsed = parseCommentBody(comment.body);
    return {
      id: comment.id,
      name: parsed.name || comment.user.login,
      email: parsed.email,
      body: parsed.body,
      user: comment.user,
      created_at: parsed.date || comment.created_at,
    };
  });
}

/**
 * 检查是否已配置 GitHub Token
 */
export function hasGitHubToken(): boolean {
  return !!getGitHubToken();
}

/**
 * 检查是否已配置仓库信息
 */
export function hasRepoConfig(): boolean {
  const { owner, repo } = getRepoConfig();
  return !!owner && !!repo;
}

/**
 * 获取当前配置状态
 */
export function getConfigStatus(): {
  hasToken: boolean;
  hasRepo: boolean;
  isComplete: boolean;
} {
  const hasToken = hasGitHubToken();
  const hasRepo = hasRepoConfig();

  return {
    hasToken,
    hasRepo,
    isComplete: hasToken && hasRepo,
  };
}
