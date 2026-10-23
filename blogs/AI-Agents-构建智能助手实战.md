---
title: "AI Agents 实战：从零构建智能助手应用"
date: "2026-05-16"
tags: [AI Agent, 大模型应用, 工程实践]
cover: ""
description: "深入讲解 AI Agent 的核心概念、架构设计，以及如何使用 LangChain 和 AutoGPT 构建智能助手"
---

# AI Agents 实战：从零构建智能助手应用

AI Agent（人工智能代理）是当前 AI 领域最热门的研究方向之一。本文将带你深入理解 AI Agent 的原理，并通过实际代码示例构建智能助手应用。

## 什么是 AI Agent？

AI Agent 是一种能够自主感知环境、做出决策并执行动作的智能系统。与传统的 LLM 调用不同，Agent 具有：

- **自主规划**：分解复杂任务为可执行的步骤
- **工具使用**：调用外部工具扩展能力边界
- **记忆能力**：保存和检索历史信息
- **多步骤推理**：链式思考解决复杂问题

### Agent 的核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       AI Agent 架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                              │
│   │   用户输入   │                                              │
│   └──────┬──────┘                                              │
│          │                                                     │
│          ▼                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   规划器   │◀───│   记忆     │───▶│   工具池    │        │
│   │ (Planner)  │    │ (Memory)   │    │  (Tools)    │        │
│   └──────┬──────┘    └─────────────┘    └──────┬──────┘        │
│          │                                      │               │
│          │         ┌─────────────┐              │               │
│          └────────▶│   执行器   │◀─────────────┘               │
│                    │ (Executor)  │                              │
│                    └──────┬──────┘                              │
│                           │                                     │
│                           ▼                                     │
│                    ┌─────────────┐                              │
│                    │    反馈     │                              │
│                    └─────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 实战：用 LangChain 构建 Agent

### 1. 环境准备

```bash
# 安装必要的依赖
pip install langchain langchain-openai langchain-community
pip install duckduckgo-search wikipedia
pip install python-dotenv
```

### 2. 基础 Agent 实现

```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI
from langchain.tools import Tool
from langchain import hub

# 初始化 LLM
llm = ChatOpenAI(
    model="gpt-4",
    temperature=0,
    api_key="your-api-key"
)

# 定义工具
def search_web(query: str) -> str:
    """搜索互联网获取最新信息"""
    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=5))
        return "\n".join([f"- {r['title']}: {r['body']}" for r in results])

def calculate(expression: str) -> str:
    """执行数学计算"""
    try:
        result = eval(expression)
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

# 注册工具
tools = [
    Tool(
        name="WebSearch",
        func=search_web,
        description="当需要获取最新信息或不确定的事实时使用此工具"
    ),
    Tool(
        name="Calculator",
        func=calculate,
        description="用于数学计算，输入数学表达式"
    )
]

# 创建 Agent
prompt = hub.pull("hwchase17/react")
agent = create_react_agent(llm, tools, prompt)

# 创建 Agent 执行器
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=10
)

# 运行 Agent
result = agent_executor.invoke({
    "input": "查询今天北京的天气，并计算 123 * 456 的结果"
})
print(result["output"])
```

### 3. 带记忆的 Agent

```python
from langchain.memory import ConversationBufferMemory
from langchain.agents import AgentExecutor, create_react_agent

# 创建记忆组件
memory = ConversationBufferMemory(
    memory_key="chat_history",
    return_messages=True
)

# 创建带记忆的 Agent
agent = create_react_agent(llm, tools, prompt)

agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    memory=memory,  # 添加记忆
    verbose=True
)

# 多轮对话
result1 = agent_executor.invoke({"input": "我叫张三"})
result2 = agent_executor.invoke({"input": "我叫什么名字？"})
print(result2["output"])  # 应该记住"张三"
```

### 4. 多 Agent 协作系统

```python
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

# 定义不同的 Agent
class Agent:
    def __init__(self, name: str, role: str, tools: list, system_prompt: str):
        self.name = name
        self.role = role
        self.llm = ChatOpenAI(model="gpt-4", temperature=0)

        prompt = ChatPromptTemplate.from_messages([
            ("system", f"你是一个{role}。{system_prompt}"),
            MessagesPlaceholder(variable_name="chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])

        self.agent = create_openai_functions_agent(self.llm, tools, prompt)
        self.executor = AgentExecutor(agent=self.agent, tools=tools)

# 创建多个专业 Agent
researcher = Agent(
    name="researcher",
    role="研究员",
    tools=[search_web],
    system_prompt="你负责从互联网搜集相关信息，提供准确的事实和数据。"
)

coder = Agent(
    name="coder",
    role="程序员",
    tools=[calculate],
    system_prompt="你负责编写代码和执行计算任务。确保代码正确且高效。"
)

writer = Agent(
    name="writer",
    role="作家",
    tools=[],
    system_prompt="你负责将信息整理成易于理解的文字输出。"
)

# Agent 协作示例
def solve_task_with_agents(task: str):
    # 1. 研究员搜集信息
    research_result = researcher.executor.invoke({
        "input": f"研究这个主题：{task}"
    })

    # 2. 程序员处理数据
    code_result = coder.executor.invoke({
        "input": f"基于以下信息，编写处理代码：{research_result['output']}"
    })

    # 3. 作家整理输出
    final_result = writer.executor.invoke({
        "input": f"将以下内容整理成报告格式：{code_result['output']}"
    })

    return final_result["output"]
```

## ReAct 推理模式

ReAct（Reasoning + Acting）是一种结合推理和行动的 Agent 模式。

```python
from langchain import hub
from langchain.agents import AgentExecutor, create_react_agent
from langchain_core.agents import AgentFinish

# ReAct 提示词模板
REACT_TEMPLATE = """你是一个 AI 助手，使用 ReAct 模式进行推理。

你可以通过以下步骤思考问题：
1. Thought: 思考下一步应该做什么
2. Action: 执行一个动作（使用工具）
3. Observation: 观察结果
4. ... 重复以上步骤直到得到答案
4. Final
```
