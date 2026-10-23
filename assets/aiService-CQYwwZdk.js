async function c(s,t,e){const{provider:n,apiKey:r}=t,i=t.baseURL||n.baseURL||t.apiUrl,p=t.model||n.defaultModel,h=`${i}/chat/completions`,f={model:p,messages:s,stream:!0};try{const o=await fetch(h,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${r}`},body:JSON.stringify(f)});if(!o.ok){const l=await o.json().catch(()=>({}));throw new Error(l.error?.message||`API 请求失败: ${o.status} ${o.statusText}`)}if(!o.body)throw new Error("响应体为空");const a=o.body.getReader(),w=new TextDecoder;let m="";for(;;){const{done:l,value:P}=await a.read();if(l){e?.onComplete?.();break}const S=w.decode(P,{stream:!0}).split(`
`);for(const y of S)if(y.startsWith("data: ")){const d=y.slice(6);if(d==="[DONE]")return e?.onComplete?.(),m;try{const u=JSON.parse(d).choices?.[0]?.delta?.content;u&&(m+=u,e?.onChunk?.(u))}catch{}}}return m}catch(o){const a=o instanceof Error?o:new Error("未知错误");throw e?.onError?.(a),a}}async function C(s,t,e){const r=[{role:"system",content:`你是一个文章摘要助手。请根据用户提供的内容，生成一段简洁、准确的摘要，概括文章的主要内容、核心观点和重要信息。

要求：
1. 直接输出摘要内容，不要添加任何标题、标签或前缀
2. 简洁明了，一般不超过 200 字
3. 突出重点，避免无关细节
4. 使用通俗易懂的语言`},{role:"user",content:`请为以下文章生成摘要：

${s}`}];return c(r,t,e)}async function T(s,t,e,n){const i=[{role:"system",content:`你是一个基于文章内容的问答助手。请根据提供的文章内容，准确回答用户的问题。如果文章中没有相关信息，请明确告知用户。回答应该：
1. 直接针对问题给出答案
2. 结合文章内容进行解释
3. 如需引用原文，请标注
4. 如果文章中没有相关信息，请如实说明`},{role:"user",content:`文章内容：
${t}

问题：${s}`}];return c(i,e,n)}async function $(s,t,e){const r=[{role:"system",content:`你是 Hitari's Blog 的 AI 助手，一个友好、知识渊博的助手。你可以：
1. 回答关于博客项目、技术栈（React、TypeScript、Vite、Tailwind CSS）的问题
2. 讨论编程、前端开发、设计模式等技术话题
3. 进行日常闲聊，保持友好自然的对话风格
4. 如果用户问到你不知道的信息，诚实地说不知道

项目基本信息：
- 项目名称：Hitari's Blog（一个现代化的博客系统）
- 作者 GitHub：https://github.com/hidari123
- 技术栈：React + TypeScript + Vite + Tailwind CSS
- AI 服务商：支持 DeepSeek（推荐）、OpenAI、自定义 API`},...s];return c(r,t,e)}async function k(s,t,e){const r=[{role:"system",content:`你是一个代码解释助手。请详细解释用户提供的代码，包括：
1. 代码的功能和作用
2. 关键代码段的作用
3. 使用的技术或语法要点
4. 代码的执行流程
5. 如果有优化建议，也请提出`},{role:"user",content:`请解释以下代码：

\`\`\`
${s}
\`\`\``}];return c(r,t,e)}export{T as a,$ as c,k as e,C as g};
