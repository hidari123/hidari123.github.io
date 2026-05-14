/**
 * 工具箱数据配置
 * 定义各种实用工具和AI工具的数据结构
 */

// 工具接口定义
export interface Tool {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string; // lucide-react 图标名称
  category: ToolCategory;
  tags: string[];
  isAI: boolean;
}

// 工具分类
export type ToolCategory = "all" | "ai" | "dev" | "writing" | "design" | "seo";

// 分类配置
export const CATEGORIES: { id: ToolCategory; name: string; icon: string }[] = [
  { id: "all", name: "全部", icon: "📦" },
  { id: "ai", name: "AI 工具", icon: "🤖" },
  { id: "dev", name: "开发工具", icon: "🛠️" },
  { id: "writing", name: "写作辅助", icon: "📝" },
  { id: "design", name: "设计工具", icon: "🎨" },
  { id: "seo", name: "SEO 工具", icon: "🔍" },
];

// 工具列表数据
export const tools: Tool[] = [
  // AI 工具
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "OpenAI 开发的大型语言模型，支持对话、写作、代码生成等多种任务",
    url: "https://chat.openai.com",
    icon: "Bot",
    category: "ai",
    tags: ["对话AI", "GPT-4", "写作助手"],
    isAI: true,
  },
  {
    id: "claude",
    name: "Claude",
    description: "Anthropic 开发的安全可靠的 AI 助手，擅长分析、写作和编程",
    url: "https://claude.ai",
    icon: "Brain",
    category: "ai",
    tags: ["对话AI", "分析助手", "代码生成"],
    isAI: true,
  },
  {
    id: "midjourney",
    name: "Midjourney",
    description: "强大的 AI 图像生成工具，通过文字描述创作精美艺术作品",
    url: "https://www.midjourney.com",
    icon: "Image",
    category: "ai",
    tags: ["图像生成", "艺术创作", "AI绘图"],
    isAI: true,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "AI 驱动的搜索引擎，提供实时、准确的问答和资料检索服务",
    url: "https://www.perplexity.ai",
    icon: "Search",
    category: "ai",
    tags: ["AI搜索", "知识问答", "实时信息"],
    isAI: true,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "最大的开源 AI 模型库和社区，提供各类预训练模型和工具",
    url: "https://huggingface.co",
    icon: "Cpu",
    category: "ai",
    tags: ["开源模型", "机器学习", "模型市场"],
    isAI: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Google 开发的下一代 AI 模型，融合文本、代码、图像理解能力",
    url: "https://gemini.google.com",
    icon: "Sparkles",
    category: "ai",
    tags: ["多模态", "Google", "AI助手"],
    isAI: true,
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "AI 编程助手，为开发者提供代码补全、生成和解释功能",
    url: "https://github.com/features/copilot",
    icon: "Code",
    category: "ai",
    tags: ["编程助手", "代码补全", "GitHub"],
    isAI: true,
  },
  {
    id: "stable-diffusion",
    name: "Stable Diffusion",
    description: "开源的 AI 图像生成模型，支持本地部署和自定义训练",
    url: "https://stability.ai",
    icon: "Palette",
    category: "ai",
    tags: ["图像生成", "开源", "本地部署"],
    isAI: true,
  },

  // 开发工具
  {
    id: "json-formatter",
    name: "JSON Formatter",
    description: "在线 JSON 格式化、压缩、验证和语法高亮工具",
    url: "https://jsonformatter.curiousconcept.com",
    icon: "FileJson",
    category: "dev",
    tags: ["JSON", "格式化", "开发辅助"],
    isAI: false,
  },
  {
    id: "regex-tester",
    name: "正则表达式测试器",
    description: "实时测试和调试正则表达式，支持多种编程语言",
    url: "https://regex101.com",
    icon: "Regex",
    category: "dev",
    tags: ["正则", "测试", "开发辅助"],
    isAI: false,
  },
  {
    id: "color-converter",
    name: "颜色转换工具",
    description: "在 HEX、RGB、HSL、HSV 等颜色格式之间快速转换",
    url: "https://colorpicker.me",
    icon: "Palette",
    category: "dev",
    tags: ["颜色", "设计", "前端开发"],
    isAI: false,
  },
  {
    id: "code-beautifier",
    name: "代码美化器",
    description: "格式化 HTML、CSS、JavaScript 代码，保持统一代码风格",
    url: "https://codebeautify.org",
    icon: "Wand2",
    category: "dev",
    tags: ["代码格式化", "代码美化", "开发辅助"],
    isAI: false,
  },
  {
    id: "diff-checker",
    name: "Diff 对比工具",
    description: "比较两个文本或代码文件的差异，高亮显示变更内容",
    url: "https://www.diffchecker.com",
    icon: "FileDiff",
    category: "dev",
    tags: ["对比", "差异", "版本控制"],
    isAI: false,
  },
  {
    id: "base64-encode",
    name: "Base64 编解码",
    description: "在线 Base64 编码解码工具，支持字符串和文件转换",
    url: "https://www.base64encode.org",
    icon: "Lock",
    category: "dev",
    tags: ["编码", "加密", "开发辅助"],
    isAI: false,
  },
  {
    id: "crontab-generator",
    name: "Cron 表达式生成器",
    description: "可视化创建和测试 Cron 定时任务表达式",
    url: "https://crontab.guru",
    icon: "Clock",
    category: "dev",
    tags: ["定时任务", "Cron", "服务器"],
    isAI: false,
  },
  {
    id: "jwt-decoder",
    name: "JWT 解码器",
    description: "在线解码和验证 JSON Web Token，查看 Payload 内容",
    url: "https://jwt.io",
    icon: "Key",
    category: "dev",
    tags: ["JWT", "Token", "身份验证"],
    isAI: false,
  },

  // 写作辅助
  {
    id: "markdown-editor",
    name: "在线 Markdown 编辑器",
    description: "实时预览的 Markdown 编辑器，支持导出多种格式",
    url: "https://markdown.com.cn/editor",
    icon: "FileText",
    category: "writing",
    tags: ["Markdown", "编辑器", "写作"],
    isAI: false,
  },
  {
    id: "grammarly",
    name: "Grammarly",
    description: "AI 语法检查和写作助手，帮助提升英文写作质量",
    url: "https://www.grammarly.com",
    icon: "CheckCircle",
    category: "writing",
    tags: ["语法检查", "英语写作", "AI辅助"],
    isAI: true,
  },
  {
    id: "word-counter",
    name: "字数统计工具",
    description: "统计中英文字数、字符数、段落数，支持关键词密度分析",
    url: "https://wordcounter.net",
    icon: "Hash",
    category: "writing",
    tags: ["字数统计", "写作辅助", "关键词"],
    isAI: false,
  },
  {
    id: "thesaurus",
    name: "英语同义词词典",
    description: "查找英语单词的同义词、反义词，丰富词汇表达",
    url: "https://www.thesaurus.com",
    icon: "BookOpen",
    category: "writing",
    tags: ["同义词", "英语学习", "写作"],
    isAI: false,
  },
  {
    id: "hemingway",
    name: "Hemingway Editor",
    description: "让写作更清晰、更大胆，分析文本可读性并给出建议",
    url: "https://hemingwayapp.com",
    icon: "PenTool",
    category: "writing",
    tags: ["写作辅助", "可读性", "英文写作"],
    isAI: false,
  },

  // 设计工具
  {
    id: "figma",
    name: "Figma",
    description: "基于浏览器的协作 UI 设计工具，支持实时团队协作",
    url: "https://www.figma.com",
    icon: "Figma",
    category: "design",
    tags: ["UI设计", "协作", "原型设计"],
    isAI: false,
  },
  {
    id: "unsplash",
    name: "Unsplash",
    description: "高质量免费图片素材库，数百万张可商用高清照片",
    url: "https://unsplash.com",
    icon: "Image",
    category: "design",
    tags: ["图片素材", "免费", "商用"],
    isAI: false,
  },
  {
    id: "coolors",
    name: "Coolors",
    description: "智能配色方案生成器，快速创建和谐美观的色彩搭配",
    url: "https://coolors.co",
    icon: "Palette",
    category: "design",
    tags: ["配色", "色彩", "设计辅助"],
    isAI: false,
  },
  {
    id: "iconfont",
    name: "IconFont",
    description: "阿里巴巴矢量图标库，提供丰富的图标资源和管理工具",
    url: "https://www.iconfont.cn",
    icon: "Grid",
    category: "design",
    tags: ["图标", "矢量图", "素材"],
    isAI: false,
  },
  {
    id: "tinypng",
    name: "TinyPNG",
    description: "智能 PNG/JPEG 图片压缩工具，大幅减小文件体积",
    url: "https://tinypng.com",
    icon: "ImagePlus",
    category: "design",
    tags: ["图片压缩", "优化", "Web开发"],
    isAI: false,
  },
  {
    id: "canva",
    name: "Canva",
    description: "在线平面设计平台，海量模板轻松创建社交媒体图文",
    url: "https://www.canva.com",
    icon: "Layout",
    category: "design",
    tags: ["平面设计", "模板", "社交媒体"],
    isAI: false,
  },

  // SEO 工具
  {
    id: "google-trends",
    name: "Google Trends",
    description: "分析关键词搜索趋势，了解用户兴趣和搜索热度变化",
    url: "https://trends.google.com",
    icon: "TrendingUp",
    category: "seo",
    tags: ["关键词", "趋势", "搜索热度"],
    isAI: false,
  },
  {
    id: "analytics",
    name: "Google Analytics",
    description: "网站流量分析工具，跟踪用户行为和转化数据",
    url: "https://analytics.google.com",
    icon: "BarChart3",
    category: "seo",
    tags: ["流量分析", "数据统计", "用户行为"],
    isAI: false,
  },
  {
    id: "pagespeed",
    name: "PageSpeed Insights",
    description: "Google 网站性能测试工具，提供优化建议和性能评分",
    url: "https://pagespeed.web.dev",
    icon: "Gauge",
    category: "seo",
    tags: ["性能测试", "加载速度", "优化建议"],
    isAI: false,
  },
  {
    id: "mobile-test",
    name: "移动端友好测试",
    description: "Google 移动端兼容性测试，检查网站在移动设备的体验",
    url: "https://search.google.com/test/mobile-friendly",
    icon: "Smartphone",
    category: "seo",
    tags: ["移动端", "兼容性", "用户体验"],
    isAI: false,
  },
  {
    id: "schema-generator",
    name: "Schema 生成器",
    description: "生成结构化数据代码，帮助搜索引擎理解网页内容",
    url: "https://schema.org",
    icon: "Code2",
    category: "seo",
    tags: ["结构化数据", "SEO优化", "搜索引擎"],
    isAI: false,
  },
];

// 工具存储键名
const STORAGE_KEY = "submitted_tools";

// 获取用户提交的工具
export const getSubmittedTools = (): Tool[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// 保存用户提交的工具
export const saveSubmittedTool = (tool: Omit<Tool, "id">): void => {
  const tools = getSubmittedTools();
  const newTool: Tool = {
    ...tool,
    id: `custom-${Date.now()}`,
  };
  tools.push(newTool);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
};

// 获取所有工具（包括用户提交的）
export const getAllTools = (): Tool[] => {
  return [...tools, ...getSubmittedTools()];
};
