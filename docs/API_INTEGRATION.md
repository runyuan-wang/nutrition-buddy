# 营养Buddy — API 接入完整指南

> 从零到可用：5类API × 每类3步 × 完整代码
> 版本：v0.1 | 日期：2026-06-30

---

## 总览：营养Buddy 需要接入的5类API

```
┌──────────────────────────────────────────────────────────┐
│                    营养Buddy API 架构                      │
│                                                          │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐   │
│  │ LLM API │  │ 数据API │  │ MCP连接器│  │ 内部API  │   │
│  │(对话引擎)│  │(知识查询)│  │(外部服务)│  │(进程间IPC)│   │
│  └─────────┘  └─────────┘  ┌──────────┐  ┌──────────┐   │
│                             │ 认证安全 │  │ 插件扩展 │   │
│                             └──────────┘  └──────────┘   │
└──────────────────────────────────────────────────────────┘
```

| API类别 | 核心作用 | 推荐选择 | 复杂度 |
|---------|---------|---------|--------|
| **1. LLM API** | AI对话、推理、生成 | DeepSeek / 混元 / OpenAI | ⭐⭐ |
| **2. 数据 API** | 食物成分、营养素查询 | 本地SQLite + 可选远程 | ⭐⭐⭐ |
| **3. MCP 连接器** | 腾讯文档、GitHub、邮件等 | WorkBuddy现有MCP生态 | ⭐⭐⭐⭐ |
| **4. 内部 IPC API** | Electron主进程↔渲染进程通信 | Electron IPC + Zustand | ⭐⭐ |
| **5. 插件扩展 API** | Skill动态加载、工具注册 | 自定义Plugin Host | ⭐⭐⭐⭐ |

---

## 一、LLM API 接入（对话引擎）

这是营养Buddy的"大脑"。所有对话、推理、知识路由都依赖它。

### 1.1 OpenAI兼容协议 — 统一接口

营养Buddy的核心设计原则：**使用OpenAI兼容协议**，这样你可以随时切换底层模型，不需要改任何业务代码。

```typescript
// src/core/llm/types.ts

/** LLM配置 — 单一配置对象驱动所有模型切换 */
export interface LLMConfig {
  provider: 'deepseek' | 'hunyuan' | 'openai' | 'zhipu' | 'custom';
  baseUrl: string;        // API base URL
  apiKey: string;         // 密钥（存于加密settings）
  model: string;          // 模型名
  maxTokens: number;      // 最大输出token
  temperature: number;    // 温度（营养场景建议0.3-0.5）
  topP: number;           // Top-P
  stream: boolean;        // 是否流式输出（推荐true）
}

/** 预设配置 — 开箱即用 */
export const LLM_PRESETS: Record<string, LLMConfig> = {
  deepseek: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',  // 用户自行填入
    model: 'deepseek-chat',
    maxTokens: 4096,
    temperature: 0.4,
    topP: 0.9,
    stream: true,
  },
  deepseek_reasoner: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-reasoner',
    maxTokens: 8192,
    temperature: 0.3,
    topP: 0.95,
    stream: true,
  },
  hunyuan: {
    provider: 'hunyuan',
    baseUrl: 'https://hunyuan.tencentcloudapi.com/openai/v1',
    apiKey: '',
    model: 'hunyuan-lite',
    maxTokens: 4096,
    temperature: 0.4,
    topP: 0.9,
    stream: true,
  },
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.4,
    topP: 0.9,
    stream: true,
  },
  zhipu: {
    provider: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4',
    maxTokens: 4096,
    temperature: 0.4,
    topP: 0.9,
    stream: true,
  },
};
```

### 1.2 LLM通信层 — 完整实现

```typescript
// src/core/llm/chat.ts

import { LLMConfig } from './types';

/** 消息类型 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/** LLM客户端 — 支持流式 + 工具调用 */
export class LLMClient {
  private config: LLMConfig;
  private abortController: AbortController | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** 非流式请求 */
  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatMessage> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        stream: false,
        tools: tools || undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`LLM API Error [${response.status}]: ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.choices[0].message;
  }

  /** 流式请求 — 返回AsyncGenerator，逐token输出 */
  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncGenerator<string | ToolCall, void, unknown> {
    this.abortController = new AbortController();

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        stream: true,
        tools: tools || undefined,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM API Error [${response.status}]`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCalls: Map<number, ToolCall> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        const json = JSON.parse(line.slice(6));
        const delta = json.choices[0]?.delta;

        // 文本输出
        if (delta?.content) {
          yield delta.content;
        }

        // 工具调用 — 收集完整的function call
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!currentToolCalls.has(idx)) {
              currentToolCalls.set(idx, {
                id: tc.id || '',
                type: 'function',
                function: { name: tc.function?.name || '', arguments: '' },
              });
            }
            const existing = currentToolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name = tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      }
    }

    // 如果有完整的工具调用，逐个yield
    for (const tc of currentToolCalls.values()) {
      yield tc;
    }
  }

  /** 中断当前流式请求 */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /** 更新配置（切换模型等） */
  updateConfig(config: Partial<LLMConfig>): void {
    Object.assign(this.config, config);
  }
}
```

### 1.3 快速测试脚本 — 验证API可用

```typescript
// src/core/llm/test.ts

import { LLMClient, LLM_PRESETS, ChatMessage } from './chat';

/** 3步验证你的LLM API是否可用 */
async function testLLMConnection() {
  // Step 1: 选一个预设，填入你的API Key
  const config = { ...LLM_PRESETS.deepseek, apiKey: 'YOUR_API_KEY_HERE' };

  // Step 2: 创建客户端
  const client = new LLMClient(config);

  // Step 3: 发一条测试消息
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是营小养，一个温柔专业的临床营养师AI助手。',
    },
    {
      role: 'user',
      content: '小米粥的GI值是多少？适合糖尿病患者吗？',
    },
  ];

  console.log('发送测试请求...');
  const reply = await client.chat(messages);
  console.log('营小养回复:', reply.content);
}

// 流式测试
async function testStreamChat() {
  const config = { ...LLM_PRESETS.deepseek, apiKey: 'YOUR_API_KEY_HERE' };
  const client = new LLMClient(config);

  console.log('流式输出测试:');
  for await (const chunk of client.chatStream([
    { role: 'user', content: '解释NRS-2002营养风险评估量表' },
  ])) {
    if (typeof chunk === 'string') {
      process.stdout.write(chunk);
    } else {
      console.log('\n[Tool Call]', chunk.function.name, chunk.function.arguments);
    }
  }
}
```

---

## 二、数据 API（知识查询）

营养Buddy的"血液"——食物成分表、食养方、MDT案例。

### 2.1 离线优先策略

```
优先级：本地SQLite → 本地Skill文件 → 远程API（仅必要时）
```

**为什么不先查远程API？**
- 食物成分表数据稳定，一年更新一次就够了
- 离线可用 = 医院网络不稳定时也能工作
- 响应速度：本地查询 <1ms，远程API >100ms

### 2.2 SQLite 数据层 — 食物成分表核心

```typescript
// src/core/data/database.ts

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';  // 主进程中使用

const DB_PATH = path.join(app.getPath('userData'), 'nutrition.db');

export class NutritionDatabase {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');   // 读写并发
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  /** 初始化表结构 */
  private initialize(): void {
    this.db.exec(`
      -- 食物基本信息
      CREATE TABLE IF NOT EXISTS foods (
        code        TEXT PRIMARY KEY,  -- 食物编码（如 A010101）
        name        TEXT NOT NULL,     -- 食物名称
        category    TEXT,              -- 分类（谷类/蔬菜/水果/肉类...）
        subcategory TEXT,              -- 子分类
        edible_part REAL,             -- 可食部(%)
        energy_kcal REAL,            -- 能量(kcal/100g)
        water_g     REAL,             -- 水分(g)
        protein_g   REAL,             -- 蛋白质(g)
        fat_g       REAL,             -- 脂肪(g)
        carb_g      REAL,             -- 碳水化合物(g)
        fiber_g     REAL,             -- 膳食纤维(g)
        created_at  TEXT DEFAULT (datetime('now'))
      );

      -- GI值表
      CREATE TABLE IF NOT EXISTS food_gi (
        food_code  TEXT PRIMARY KEY,
        food_name  TEXT NOT NULL,
        gi_value   REAL,            -- GI值
        gi_type    TEXT,            -- 低GI/中GI/高GI
        glycemic_load REAL,        -- GL值（如果有）
        source     TEXT,            -- 数据来源
        FOREIGN KEY (food_code) REFERENCES foods(code)
      );

      -- 食养方
      CREATE TABLE IF NOT EXISTS diet_prescriptions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        disease    TEXT,             -- 适用疾病
        pattern    TEXT,             -- 中医证型
        ingredients TEXT,           -- 食材列表(JSON)
        method     TEXT,            -- 制作方法
        nutrition_analysis TEXT,    -- 营养分析(JSON)
        source_skill TEXT,          -- 来源Skill名
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- 全文搜索索引（FTS5）
      CREATE VIRTUAL TABLE IF NOT EXISTS foods_fts USING fts5(
        name, category, subcategory,
        content='foods', content_rowid='rowid'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS diet_fts USING fts5(
        name, disease, pattern, ingredients,
        content='diet_prescriptions', content_rowid='rowid'
      );
    `);
  }

  /** 查询食物 — 支持编码精确查询和名称模糊搜索 */
  getFood(query: string): any[] {
    // 编码精确查询
    if (/^[A-Z]\d{5,6}$/i.test(query)) {
      return this.db.prepare(`
        SELECT f.*, g.gi_value, g.gi_type, g.glycemic_load
        FROM foods f
        LEFT JOIN food_gi g ON f.code = g.food_code
        WHERE f.code = ?
      `).all(query.toUpperCase());
    }

    // 名称模糊搜索（FTS5）
    return this.db.prepare(`
      SELECT f.*, g.gi_value, g.gi_type
      FROM foods_fts ft
      JOIN foods f ON f.rowid = ft.rowid
      LEFT JOIN food_gi g ON f.code = g.food_code
      WHERE foods_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `).all(query);
  }

  /** 查询GI值范围 */
  getFoodsByGI(type: 'low' | 'medium' | 'high'): any[] {
    const giRange = {
      low: [0, 55],
      medium: [56, 69],
      high: [70, 100],
    };
    const [min, max] = giRange[type];
    return this.db.prepare(`
      SELECT f.name, f.code, g.gi_value, g.gi_type
      FROM foods f JOIN food_gi g ON f.code = g.food_code
      WHERE g.gi_value BETWEEN ? AND ?
      ORDER BY g.gi_value
    `).all(min, max);
  }

  /** 查询食养方 — 按疾病或证型 */
  getDietPrescriptions(disease?: string, pattern?: string): any[] {
    if (disease) {
      return this.db.prepare(`
        SELECT * FROM diet_prescriptions WHERE disease LIKE ?
      `).all(`%${disease}%`);
    }
    if (pattern) {
      return this.db.prepare(`
        SELECT * FROM diet_prescriptions WHERE pattern LIKE ?
      `).all(`%${pattern}%`);
    }
    return this.db.prepare('SELECT * FROM diet_prescriptions').all();
  }

  /** 营养素对比 — 多食物对比 */
  compareFoods(foodCodes: string[]): any[] {
    return this.db.prepare(`
      SELECT code, name, energy_kcal, protein_g, fat_g, carb_g, fiber_g
      FROM foods WHERE code IN (${foodCodes.map(() => '?').join(',')})
    `).all(...foodCodes);
  }

  /** 关闭数据库 */
  close(): void {
    this.db.close();
  }
}
```

### 2.3 Skill知识路由 — 从Markdown Skill提取结构化数据

```typescript
// src/core/data/skill-router.ts

import fs from 'fs';
import path from 'path';

/** Skill元数据（从YAML frontmatter解析） */
export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  author: string;
  version: string;
}

/** 知识路由规则 — 按关键词匹配最相关的Skill */
export interface RouteRule {
  keywords: string[];     // 触发关键词
  skillName: string;      // 目标Skill名
  priority: number;       // 优先级（1=最高）
  mode: 'inject' | 'tool';  // inject=直接注入知识, tool=工具调用
}

/** 路由表 — 从KNOWLEDGE.md自动生成 */
const ROUTE_TABLE: RouteRule[] = [
  // 食物成分
  { keywords: ['食物成分', '营养成分', 'GI', '升糖指数', '蛋白质', '碳水', '脂肪'],
    skillName: 'china-food-composition', priority: 1, mode: 'tool' },
  // 血糖管理
  { keywords: ['血糖', '控糖', '胰岛素', '糖化', 'CGM', '血糖峰值', '升糖'],
    skillName: 'glucose-revolution', priority: 2, mode: 'inject' },
  // 儿童肥胖
  { keywords: ['儿童肥胖', '超重', 'BMI', '减肥', '食养指南'],
    skillName: 'childhood-obesity-food-guide', priority: 2, mode: 'inject' },
  // 高脂血症
  { keywords: ['血脂', '胆固醇', '甘油三酯', '高脂', '脂蛋白'],
    skillName: 'hyperlipidemia-food-guide', priority: 2, mode: 'inject' },
  // MDT
  { keywords: ['MDT', '多学科', '协作', '查房', '综合治疗'],
    skillName: 'mdt_research_2026', priority: 3, mode: 'inject' },
  // 中医食疗
  { keywords: ['中医', '辨证', '药膳', '食治', '证型', '气血'],
    skillName: 'tcm_mdt_cases', priority: 3, mode: 'inject' },
  // 运动
  { keywords: ['运动', 'HPA', '皮质醇', '运动处方', '体适能'],
    skillName: 'sports_medicine_hpa_pathology', priority: 4, mode: 'inject' },
  // 睡眠+药物
  { keywords: ['睡眠', '失眠', 'SSRI', 'BZD', 'REM', '深睡'],
    skillName: 'sleep_drug_cycle', priority: 4, mode: 'inject' },
  // 六眼洞悉
  { keywords: ['诊断', '机制', '因果', '洞悉', '追问'],
    skillName: 'six_eye_insight_mechanism_v2', priority: 5, mode: 'inject' },
];

export class SkillRouter {
  private skillDir: string;
  private cache: Map<string, string> = new Map();  // Skill内容缓存

  constructor(skillDir: string) {
    this.skillDir = skillDir;
  }

  /** 根据用户消息路由到最匹配的Skill */
  route(userMessage: string): RouteRule[] {
    const matched: RouteRule[] = [];

    for (const rule of ROUTE_TABLE) {
      for (const kw of rule.keywords) {
        if (userMessage.includes(kw)) {
          matched.push(rule);
          break;
        }
      }
    }

    // 按优先级排序
    return matched.sort((a, b) => a.priority - b.priority);
  }

  /** 加载Skill内容（带缓存） */
  loadSkillContent(skillName: string): string {
    if (this.cache.has(skillName)) {
      return this.cache.get(skillName)!;
    }

    const skillPath = path.join(this.skillDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill not found: ${skillName} at ${skillPath}`);
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    this.cache.set(skillName, content);
    return content;
  }

  /** 构建注入消息 — 把Skill知识转为system message片段 */
  buildKnowledgeInjection(rules: RouteRule[]): string {
    const parts: string[] = [];

    for (const rule of rules) {
      if (rule.mode === 'inject') {
        const content = this.loadSkillContent(rule.skillName);
        // 只取知识内容部分，去掉YAML frontmatter
        const body = content.replace(/^---\n.*?\n---\n/, '');
        // 截取前2000字符（避免过长）
        parts.push(`【${rule.skillName}知识库】\n${body.slice(0, 2000)}`);
      }
    }

    return parts.join('\n\n');
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cache.clear();
  }
}
```

### 2.4 可选远程API — 补充本地缺失的数据

```typescript
// src/core/data/remote-api.ts

/** 远程营养数据API — 仅在本地数据不足时使用 */

export interface RemoteFoodData {
  source: string;
  name: string;
  nutrients: Record<string, number>;
}

export class RemoteNutritionAPI {
  private cache: Map<string, RemoteFoodData> = new Map();

  /** 中国食物成分API（假设有官方接口） */
  async queryChinaFoodComposition(foodName: string): Promise<RemoteFoodData | null> {
    // 当前暂无官方公开API，使用本地SQLite优先
    // 未来可接入国家食品安全风险评估中心的数据服务
    console.warn('远程食物成分API暂未开通，使用本地数据');
    return null;
  }

  /** Open Food Facts — 全球食物数据库（可选补充） */
  async queryOpenFoodFacts(barcode: string): Promise<RemoteFoodData | null> {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === 0) return null;  // 产品未找到

    const product = data.product;
    const nutrients = product.nutriments || {};

    return {
      source: 'Open Food Facts',
      name: product.product_name_zh || product.product_name,
      nutrients: {
        energy_kcal: nutrients['energy-kcal_100g'],
        protein_g: nutrients.proteins_100g,
        fat_g: nutrients.fat_100g,
        carb_g: nutrients.carbohydrates_100g,
        fiber_g: nutrients.fiber_100g,
      },
    };
  }

  /** USDA FoodData Central — 美国食物数据库（英文，可选） */
  async queryUSDA(foodName: string, apiKey: string): Promise<RemoteFoodData | null> {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(foodName)}&api_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.foods?.length) return null;

    const food = data.foods[0];
    const nutrients: Record<string, number> = {};
    for (const n of food.foodNutrients) {
      nutrients[n.nutrientName] = n.value;
    }

    return {
      source: 'USDA FoodData',
      name: food.description,
      nutrients,
    };
  }
}
```

---

## 三、MCP 连接器接入（外部服务）

营养Buddy的"手脚"——连接腾讯文档、GitHub、邮件等外部服务。

### 3.1 MCP协议基础

MCP（Model Context Protocol）是Anthropic提出的标准协议，WorkBuddy已经完整实现了它：

```
通信方式：JSON-RPC 2.0 over stdio (本地) 或 HTTP SSE (远程)

┌────────────┐     stdio/SSE      ┌────────────┐
│  营养Buddy │ ←──────────────→ │  MCP Server │
│  (Host)    │                    │  (Provider) │
└────────────┘                    └────────────┘

消息格式：
  request:  { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  response: { jsonrpc: "2.0", id: 1, result: { tools: [...] } }
```

### 3.2 MCP连接器配置文件

```jsonc
// ~/.nutrition-buddy/mcp.json

{
  "mcpServers": {
    // 腾讯文档 — 导出食养方案到腾讯文档
    "tencent-docs": {
      "command": "node",
      "args": ["path/to/tencent-docs-mcp-server/dist/index.js"],
      "env": {
        "TENCENT_DOCS_TOKEN": "${TENCENT_DOCS_TOKEN}"
      }
    },

    // GitHub — 管理知识库版本、提交食养方案
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },

    // QQ邮箱 — 接收患者邮件、发送食养方案
    "qq-mail": {
      "command": "node",
      "args": ["path/to/qq-mail-mcp-server/dist/index.js"],
      "env": {
        "QQ_MAIL_COOKIE": "${QQ_MAIL_COOKIE}"
      }
    },

    // 自定义：营养数据MCP Server（把本地SQLite暴露为MCP工具）
    "nutrition-local": {
      "command": "node",
      "args": ["${APP_PATH}/mcp-servers/nutrition-local/dist/index.js"],
      "env": {
        "DB_PATH": "${USER_DATA_PATH}/nutrition.db"
      }
    }
  }
}
```

### 3.3 自定义MCP Server — 把营养数据暴露为工具

```typescript
// mcp-servers/nutrition-local/src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/** 营养数据MCP Server — 将本地SQLite暴露为MCP工具 */
const DB_PATH = process.env.DB_PATH || path.join(
  process.env.HOME || process.env.USERPROFILE!,
  '.nutrition-buddy',
  'nutrition.db'
);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const server = new Server(
  { name: 'nutrition-local', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// 注册工具列表
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'query_food',
      description: '查询食物营养成分。支持编码精确查询（如A010101）或名称模糊搜索（如"小米"）',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '食物编码或名称' },
        },
        required: ['query'],
      },
    },
    {
      name: 'query_gi',
      description: '查询食物GI值。type可选: low(≤55), medium(56-69), high(≥70)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['low', 'medium', 'high'], description: 'GI分类' },
        },
        required: ['type'],
      },
    },
    {
      name: 'query_diet_prescription',
      description: '查询食养方。按疾病（如"糖尿病"）或中医证型（如"气虚"）搜索',
      inputSchema: {
        type: 'object',
        properties: {
          disease: { type: 'string', description: '疾病名称' },
          pattern: { type: 'string', description: '中医证型' },
        },
      },
    },
    {
      name: 'compare_foods',
      description: '对比多个食物的营养成分。传入食物编码列表',
      inputSchema: {
        type: 'object',
        properties: {
          codes: {
            type: 'array',
            items: { type: 'string' },
            description: '食物编码列表',
          },
        },
        required: ['codes'],
      },
    },
  ],
}));

// 处理工具调用
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_food': {
        const query = args.query as string;
        const results = /^[A-Z]\d{5,6}$/i.test(query)
          ? db.prepare(`
              SELECT f.*, g.gi_value, g.gi_type
              FROM foods f LEFT JOIN food_gi g ON f.code = g.food_code
              WHERE f.code = ?
            `).all(query.toUpperCase())
          : db.prepare(`
              SELECT f.*, g.gi_value, g.gi_type
              FROM foods_fts ft JOIN foods f ON f.rowid = ft.rowid
              LEFT JOIN food_gi g ON f.code = g.food_code
              WHERE foods_fts MATCH ? ORDER BY rank LIMIT 20
            `).all(query);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      case 'query_gi': {
        const giRange: Record<string, [number, number]> = {
          low: [0, 55], medium: [56, 69], high: [70, 100],
        };
        const [min, max] = giRange[args.type as string];
        const results = db.prepare(`
          SELECT f.name, f.code, g.gi_value, g.gi_type
          FROM foods f JOIN food_gi g ON f.code = g.food_code
          WHERE g.gi_value BETWEEN ? AND ? ORDER BY g.gi_value
        `).all(min, max);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      case 'query_diet_prescription': {
        const disease = args.disease as string;
        const pattern = args.pattern as string;
        let results: any[];
        if (disease) {
          results = db.prepare('SELECT * FROM diet_prescriptions WHERE disease LIKE ?').all(`%${disease}%`);
        } else if (pattern) {
          results = db.prepare('SELECT * FROM diet_prescriptions WHERE pattern LIKE ?').all(`%${pattern}%`);
        } else {
          results = db.prepare('SELECT * FROM diet_prescriptions').all();
        }
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      case 'compare_foods': {
        const codes = args.codes as string[];
        const placeholders = codes.map(() => '?').join(',');
        const results = db.prepare(`
          SELECT code, name, energy_kcal, protein_g, fat_g, carb_g, fiber_g
          FROM foods WHERE code IN (${placeholders})
        `).all(...codes);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

// 启动
const transport = new StdioServerTransport();
server.connect(transport);
console.log('Nutrition Local MCP Server running on stdio');
```

---

## 四、内部 IPC API（Electron 进程间通信）

营养Buddy的"神经系统"——Electron主进程与渲染进程之间的通信。

### 4.1 IPC通道设计

```typescript
// src/core/ipc/channels.ts

/** IPC通道命名规范：domain:action */

export const IPC_CHANNELS = {
  // LLM相关
  LLM_CHAT:           'llm:chat',
  LLM_CHAT_STREAM:    'llm:chat-stream',
  LLM_ABORT:          'llm:abort',
  LLM_SWITCH_MODEL:   'llm:switch-model',

  // 数据查询
  DB_QUERY_FOOD:      'db:query-food',
  DB_QUERY_GI:        'db:query-gi',
  DB_QUERY_DIET:      'db:query-diet-prescription',
  DB_COMPARE_FOODS:   'db:compare-foods',

  // MCP相关
  MCP_LIST_SERVERS:   'mcp:list-servers',
  MCP_CALL_TOOL:      'mcp:call-tool',
  MCP_CONNECT:        'mcp:connect',
  MCP_DISCONNECT:     'mcp:disconnect',

  // 记忆相关
  MEMORY_GET:         'memory:get',
  MEMORY_SET:         'memory:set',
  MEMORY_SEARCH:      'memory:search',

  // 窗口管理
  WINDOW_CREATE:      'window:create',
  WINDOW_BRANCH:      'window:branch',
  WINDOW_CLOSE:       'window:close',
  WINDOW_GET_ALL:     'window:get-all',

  // Session管理
  SESSION_CREATE:     'session:create',
  SESSION_BRANCH:     'session:branch',
  SESSION_MERGE:      'session:merge',
  SESSION_LINK:       'session:link',
  SESSION_SHARE_MEMO: 'session:share-memory',
  SESSION_SEARCH:     'session:search',

  // 设置
  SETTINGS_GET:       'settings:get',
  SETTINGS_SET:       'settings:set',

  // 导出
  EXPORT_REPORT:      'export:report',
  EXPORT_TO_TENCENT_DOC: 'export:tencent-doc',
};
```

### 4.2 主进程 Handler（安全侧）

```typescript
// src/main/ipc-handlers.ts

import { ipcMain, BrowserWindow } from 'electron';
import { NutritionDatabase } from '../core/data/database';
import { LLMClient } from '../core/llm/chat';
import { IPC_CHANNELS } from '../core/ipc/channels';

let db: NutritionDatabase;
let llmClient: LLMClient;

export function registerIPCHandlers() {
  db = new NutritionDatabase();

  // --- LLM 对话 ---
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT, async (_event, messages, tools) => {
    return await llmClient.chat(messages, tools);
  });

  // 流式对话 — 通过event.sender逐token推送
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT_STREAM, async (event, messages, tools) => {
    try {
      for await (const chunk of llmClient.chatStream(messages, tools)) {
        if (typeof chunk === 'string') {
          event.sender.send('llm:stream-chunk', chunk);
        } else {
          event.sender.send('llm:stream-tool-call', chunk);
        }
      }
      event.sender.send('llm:stream-done');
    } catch (err: any) {
      event.sender.send('llm:stream-error', err.message);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LLM_ABORT, () => {
    llmClient.abort();
  });

  ipcMain.handle(IPC_CHANNELS.LLM_SWITCH_MODEL, (_event, config) => {
    llmClient.updateConfig(config);
  });

  // --- 数据查询 ---
  ipcMain.handle(IPC_CHANNELS.DB_QUERY_FOOD, (_event, query) => {
    return db.getFood(query);
  });

  ipcMain.handle(IPC_CHANNELS.DB_QUERY_GI, (_event, type) => {
    return db.getFoodsByGI(type);
  });

  ipcMain.handle(IPC_CHANNELS.DB_QUERY_DIET, (_event, disease, pattern) => {
    return db.getDietPrescriptions(disease, pattern);
  });

  ipcMain.handle(IPC_CHANNELS.DB_COMPARE_FOODS, (_event, codes) => {
    return db.compareFoods(codes);
  });

  // --- MCP ---
  ipcMain.handle(IPC_CHANNELS.MCP_CALL_TOOL, async (_event, serverName, toolName, args) => {
    // 通过MCP SDK调用外部工具
    // 实现见下文 MCP Manager
    return { content: 'MCP工具调用结果' };
  });

  // --- 窗口管理 ---
  ipcMain.handle(IPC_CHANNELS.WINDOW_CREATE, (_event, type, mode) => {
    return createNewWindow(type, mode);
  });
}
```

### 4.3 渲染进程 API（React调用侧）

```typescript
// src/renderer/api.ts

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../core/ipc/channels';

/** 渲染进程API — React组件直接调用，如同调用本地函数 */

export const api = {
  // LLM
  llm: {
    chat: (messages: any[], tools?: any[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.LLM_CHAT, messages, tools),

    // 流式对话 — 返回EventEmitter风格
    chatStream: (messages: any[], tools?: any[]) => {
      ipcRenderer.invoke(IPC_CHANNELS.LLM_CHAT_STREAM, messages, tools);
      return {
        onChunk: (cb: (text: string) => void) =>
          ipcRenderer.on('llm:stream-chunk', (_e, text) => cb(text)),
        onToolCall: (cb: (tc: any) => void) =>
          ipcRenderer.on('llm:stream-tool-call', (_e, tc) => cb(tc)),
        onDone: (cb: () => void) =>
          ipcRenderer.on('llm:stream-done', () => cb()),
        onError: (cb: (err: string) => void) =>
          ipcRenderer.on('llm:stream-error', (_e, err) => cb(err)),
        dispose: () => {
          ipcRenderer.removeAllListeners('llm:stream-chunk');
          ipcRenderer.removeAllListeners('llm:stream-tool-call');
          ipcRenderer.removeAllListeners('llm:stream-done');
          ipcRenderer.removeAllListeners('llm:stream-error');
        },
      };
    },

    abort: () => ipcRenderer.invoke(IPC_CHANNELS.LLM_ABORT),
    switchModel: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.LLM_SWITCH_MODEL, config),
  },

  // 数据
  db: {
    queryFood: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_FOOD, query),
    queryGI: (type: 'low' | 'medium' | 'high') => ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_GI, type),
    queryDiet: (disease?: string, pattern?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_DIET, disease, pattern),
    compareFoods: (codes: string[]) => ipcRenderer.invoke(IPC_CHANNELS.DB_COMPARE_FOODS, codes),
  },

  // MCP
  mcp: {
    callTool: (serverName: string, toolName: string, args: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_CALL_TOOL, serverName, toolName, args),
  },

  // 窗口
  window: {
    create: (type: string, mode: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CREATE, type, mode),
  },
};
```

### 4.4 React中使用 — 一个完整对话组件

```tsx
// src/renderer/components/ChatPanel.tsx

import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

export function ChatPanel() {
  const [messages, setMessages] = useState<Array<{role: string; content: string}>>([]);
  const [streaming, setStreaming] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const streamRef = useRef<any>(null);

  const sendMessage = async (userInput: string) => {
    // 添加用户消息
    const newMessages = [...messages, { role: 'user', content: userInput }];
    setMessages(newMessages);
    setIsLoading(true);
    setStreaming('');

    // 构建系统提示词（注入营小养人格 + 动态知识）
    const systemPrompt = buildSystemPrompt(userInput);

    // 流式调用
    const stream = api.llm.chatStream([
      { role: 'system', content: systemPrompt },
      ...newMessages,
    ], getToolDefinitions());

    streamRef.current = stream;
    let fullResponse = '';

    stream.onChunk((text) => {
      fullResponse += text;
      setStreaming(fullResponse);
    });

    stream.onToolCall(async (tc) => {
      // 处理工具调用（如查询食物成分）
      const result = await handleToolCall(tc);
      // 把工具结果发回LLM继续对话
      // ...（完整Agent Loop见下文）
    });

    stream.onDone(() => {
      setMessages([...newMessages, { role: 'assistant', content: fullResponse }]);
      setStreaming('');
      setIsLoading(false);
      stream.dispose();
    });

    stream.onError((err) => {
      setStreaming(`❌ Error: ${err}`);
      setIsLoading(false);
    });
  };

  return (
    <div className="chat-panel">
      {messages.map((msg, i) => (
        <div key={i} className={`message ${msg.role}`}>
          {msg.content}
        </div>
      ))}
      {streaming && <div className="message assistant streaming">{streaming}</div>}
      <input
        onKeyDown={(e) => e.key === 'Enter' && sendMessage(e.currentTarget.value)}
        disabled={isLoading}
        placeholder="问营小养任何营养问题..."
      />
    </div>
  );
}
```

---

## 五、插件扩展 API（Skill系统）

营养Buddy的"进化能力"——动态加载新Skill、注册新工具。

### 5.1 Skill加载器

```typescript
// src/core/plugins/skill-loader.ts

import fs from 'fs';
import path from 'path';

export interface LoadedSkill {
  name: string;
  description: string;
  triggers: string[];
  content: string;     // SKILL.md全文
  scripts?: Record<string, string>;  // scripts/目录下的脚本路径
  references?: Record<string, string>; // references/目录下的参考文件
  assets?: Record<string, string>;   // assets/目录下的资源
}

export class SkillLoader {
  private skillDirs: string[];  // Skill搜索路径列表

  constructor(skillDirs: string[]) {
    this.skillDirs = skillDirs;
  }

  /** 加载所有Skill */
  loadAll(): LoadedSkill[] {
    const skills: LoadedSkill[] = [];

    for (const dir of this.skillDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(dir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;

        skills.push(this.loadOne(path.join(dir, entry.name)));
      }
    }

    return skills;
  }

  /** 加载单个Skill */
  private loadOne(skillDir: string): LoadedSkill {
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    // 解析YAML frontmatter
    const frontmatterMatch = skillMd.match(/^---\n(.*?)\n---\n/s);
    const frontmatter = frontmatterMatch
      ? this.parseYaml(frontmatterMatch[1])
      : {};

    const body = frontmatterMatch
      ? skillMd.slice(frontmatterMatch[0].length)
      : skillMd;

    // 扫描子目录
    const scripts = this.scanSubdir(skillDir, 'scripts');
    const references = this.scanSubdir(skillDir, 'references');
    const assets = this.scanSubdir(skillDir, 'assets');

    return {
      name: frontmatter.name || path.basename(skillDir),
      description: frontmatter.description || frontmatter.summary || '',
      triggers: frontmatter.trigger_words || frontmatter.triggers || [],
      content: body,
      scripts,
      references,
      assets,
    };
  }

  /** 扫描子目录 */
  private scanSubdir(base: string, subdir: string): Record<string, string> {
    const dirPath = path.join(base, subdir);
    if (!fs.existsSync(dirPath)) return {};

    const result: Record<string, string> = {};
    for (const file of fs.readdirSync(dirPath)) {
      result[file] = path.join(dirPath, file);
    }
    return result;
  }

  /** 简易YAML解析（只处理常见字段） */
  private parseYaml(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    for (const line of yaml.split('\n')) {
      const match = line.match(/^(\w[\w_-]*):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        // 处理列表值
        if (value.startsWith('[') && value.endsWith(']')) {
          result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''));
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}
```

### 5.2 工具注册系统 — 把Skill能力转为LLM Tool

```typescript
// src/core/plugins/tool-registry.ts

import { ToolDefinition } from '../llm/chat';
import { LoadedSkill } from './skill-loader';
import { NutritionDatabase } from '../data/database';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private handlers: Map<string, (args: any) => Promise<any>> = new Map();
  private db: NutritionDatabase;

  constructor(db: NutritionDatabase) {
    this.db = db;
    this.registerBuiltinTools();
  }

  /** 注册内置工具 — 食物查询、GI查询等 */
  private registerBuiltinTools(): void {
    // 食物成分查询
    this.register({
      definition: {
        type: 'function',
        function: {
          name: 'query_food',
          description: '查询食物营养成分。支持编码精确查询或名称模糊搜索',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '食物编码(如A010101)或名称(如"小米")' },
            },
            required: ['query'],
          },
        },
      },
      handler: async (args) => this.db.getFood(args.query),
    });

    // GI值查询
    this.register({
      definition: {
        type: 'function',
        function: {
          name: 'query_gi',
          description: '查询食物GI值分类。low(≤55)/medium(56-69)/high(≥70)',
          parameters: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['type'],
          },
        },
      },
      handler: async (args) => this.db.getFoodsByGI(args.type),
    });

    // 食养方查询
    this.register({
      definition: {
        type: 'function',
        function: {
          name: 'query_diet_prescription',
          description: '查询食养方。按疾病或中医证型搜索',
          parameters: {
            type: 'object',
            properties: {
              disease: { type: 'string', description: '疾病名' },
              pattern: { type: 'string', description: '中医证型' },
            },
          },
        },
      },
      handler: async (args) => this.db.getDietPrescriptions(args.disease, args.pattern),
    });

    // 营养素对比
    this.register({
      definition: {
        type: 'function',
        function: {
          name: 'compare_foods',
          description: '对比多个食物的营养成分',
          parameters: {
            type: 'object',
            properties: {
              codes: { type: 'array', items: { type: 'string' }, description: '食物编码列表' },
            },
            required: ['codes'],
          },
        },
      },
      handler: async (args) => this.db.compareFoods(args.codes),
    });
  }

  /** 注册自定义工具 */
  register(tool: { definition: ToolDefinition; handler: (args: any) => Promise<any> }): void {
    const name = tool.definition.function.name;
    this.tools.set(name, tool.definition);
    this.handlers.set(name, tool.handler);
  }

  /** 从Skill自动生成工具注册 */
  registerFromSkill(skill: LoadedSkill): void {
    // 某些Skill可以自动映射为工具
    // 例如：china-food-composition → 已有内置query_food工具
    // 其他Skill以注入模式使用，不需要注册为工具
  }

  /** 获取所有工具定义（传给LLM） */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 执行工具调用 */
  async execute(toolName: string, args: any): Promise<any> {
    const handler = this.handlers.get(toolName);
    if (!handler) throw new Error(`Tool not found: ${toolName}`);
    return await handler(args);
  }
}
```

---

## 六、认证与安全

### 6.1 API密钥管理 — 永不裸存

```typescript
// src/core/auth/key-manager.ts

import { safeStorage } from 'electron';  // Electron加密存储
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const KEYS_FILE = path.join(app.getPath('userData'), 'api-keys.enc');

export class KeyManager {
  /** 保存API密钥 — 使用Electron safeStorage加密 */
  save(provider: string, apiKey: string): void {
    const keys = this.loadAll();
    keys[provider] = apiKey;

    const encrypted = safeStorage.encryptString(JSON.stringify(keys));
    fs.writeFileSync(KEYS_FILE, encrypted.toString('base64'));
  }

  /** 读取API密钥 — 自动解密 */
  load(provider: string): string | null {
    const keys = this.loadAll();
    return keys[provider] || null;
  }

  /** 加载所有密钥 */
  private loadAll(): Record<string, string> {
    if (!fs.existsSync(KEYS_FILE)) return {};

    const buffer = Buffer.from(fs.readFileSync(KEYS_FILE, 'utf-8'), 'base64');
    if (!safeStorage.isEncryptionAvailable()) {
      // 加密不可用时，明文存储（开发环境）
      console.warn('safeStorage不可用，密钥将以明文存储');
      return JSON.parse(buffer.toString());
    }

    const decrypted = safeStorage.decryptString(buffer);
    return JSON.parse(decrypted);
  }

  /** 删除密钥 */
  delete(provider: string): void {
    const keys = this.loadAll();
    delete keys[provider];
    const encrypted = safeStorage.encryptString(JSON.stringify(keys));
    fs.writeFileSync(KEYS_FILE, encrypted.toString('base64'));
  }
}
```

### 6.2 安全沙箱 — 限制工具调用权限

```typescript
// src/core/auth/permission.ts

/** 工具调用权限级别 */
export enum PermissionLevel {
  SAFE = 'safe',       // 无风险：数据查询、计算
  MODERATE = 'moderate', // 中风险：文件读写、邮件发送
  DANGEROUS = 'dangerous', // 高风险：删除文件、公开发布
}

/** 权限配置 */
export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  query_food:               PermissionLevel.SAFE,
  query_gi:                 PermissionLevel.SAFE,
  query_diet_prescription:  PermissionLevel.SAFE,
  compare_foods:            PermissionLevel.SAFE,
  memory_get:               PermissionLevel.SAFE,
  memory_search:            PermissionLevel.SAFE,
  mcp_call_tool:            PermissionLevel.MODERATE,
  export_report:            PermissionLevel.MODERATE,
  export_tencent_doc:       PermissionLevel.MODERATE,
  memory_set:               PermissionLevel.MODERATE,
  window_create:            PermissionLevel.MODERATE,
  file_delete:              PermissionLevel.DANGEROUS,
  email_send:               PermissionLevel.DANGEROUS,
  github_push:              PermissionLevel.DANGEROUS,
};

/** 权限检查器 */
export function checkPermission(toolName: string, userSettings: any): boolean {
  const level = TOOL_PERMISSIONS[toolName] || PermissionLevel.MODERATE;

  switch (level) {
    case PermissionLevel.SAFE:
      return true;  // 安全操作永远允许
    case PermissionLevel.MODERATE:
      return userSettings.allowModerate ?? true;  // 用户可配置
    case PermissionLevel.DANGEROUS:
      return userSettings.allowDangerous ?? false;  // 默认禁止，需用户确认
  }
}
```

---

## 七、完整 Agent Loop — 把所有API串起来

这是营养Buddy最核心的运行逻辑，把LLM、工具、记忆、人格全部串联：

```typescript
// src/core/agent/agent-loop.ts

import { LLMClient, ChatMessage, ToolDefinition } from '../llm/chat';
import { ToolRegistry } from '../plugins/tool-registry';
import { SkillRouter } from '../data/skill-router';
import { KeyManager } from '../auth/key-manager';

export class NutritionAgentLoop {
  private llm: LLMClient;
  private toolRegistry: ToolRegistry;
  private skillRouter: SkillRouter;
  private keyManager: KeyManager;
  private maxIterations = 10;  // 防止无限循环

  constructor(
    llm: LLMClient,
    toolRegistry: ToolRegistry,
    skillRouter: SkillRouter,
    keyManager: KeyManager,
  ) {
    this.llm = llm;
    this.toolRegistry = toolRegistry;
    this.skillRouter = skillRouter;
    this.keyManager = keyManager;
  }

  /** 运行一个完整的Agent Loop */
  async run(
    userMessage: string,
    conversationHistory: ChatMessage[],
    onStreamChunk: (text: string) => void,
  ): Promise<ChatMessage[]> {
    let messages: ChatMessage[] = [...conversationHistory];

    // Step 1: 注入系统提示词 + 动态知识
    const knowledgeInjection = this.skillRouter.buildKnowledgeInjection(
      this.skillRouter.route(userMessage)
    );

    const systemPrompt = this.buildSystemPrompt(knowledgeInjection);

    // Step 2: 添加用户消息
    messages.push({ role: 'user', content: userMessage });

    // Step 3: Agent Loop — 多轮对话直到无工具调用
    let iteration = 0;
    while (iteration < this.maxIterations) {
      iteration++;

      // 构建请求消息（含系统提示词）
      const requestMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      // 获取可用工具定义
      const tools = this.toolRegistry.getToolDefinitions();

      // Step 4: 调用LLM（流式）
      let fullResponse = '';
      let toolCalls: any[] = [];

      for await (const chunk of this.llm.chatStream(requestMessages, tools)) {
        if (typeof chunk === 'string') {
          fullResponse += chunk;
          onStreamChunk(chunk);
        } else {
          toolCalls.push(chunk);
        }
      }

      // Step 5: 如果有工具调用，执行并继续循环
      if (toolCalls.length > 0) {
        // 添加assistant消息（含tool_calls）
        messages.push({
          role: 'assistant',
          content: fullResponse || '',
          tool_calls: toolCalls,
        });

        // 执行每个工具调用
        for (const tc of toolCalls) {
          const args = JSON.parse(tc.function.arguments);

          // 权限检查
          // ...（见Permission模块）

          // 执行工具
          const result = await this.toolRegistry.execute(tc.function.name, args);

          // 添加工具结果消息
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: tc.id,
            name: tc.function.name,
          });
        }

        // 继续循环，让LLM基于工具结果生成回复
        continue;
      }

      // Step 6: 无工具调用 — 回复完成
      messages.push({ role: 'assistant', content: fullResponse });
      break;
    }

    return messages;
  }

  /** 构建系统提示词 */
  private buildSystemPrompt(knowledgeInjection: string): string {
    // 读取人格文件（SOUL.md等）
    // ...（见SYSTEM_PROMPT.md模板）

    return `
你是营小养，一个温柔专业的临床营养师AI助手。

【人格核心】
- 温柔 × 学术 = 亲和权威
- 先共情，再分析，最后给方案
- 循证优先，中医结合，患者至上

【知识注入】
${knowledgeInjection}

【工具能力】
你可以调用以下工具：
- query_food: 查询食物营养成分
- query_gi: 查询GI值分类
- query_diet_prescription: 查询食养方
- compare_foods: 对比多个食物营养

当需要精确数据时，优先使用工具查询而非猜测。
    `.trim();
  }
}
```

---

## 八、快速启动清单

### 第1天就能跑的最小API组合

| # | 步骤 | 命令/代码 | 预期结果 |
|---|------|----------|---------|
| 1 | 安装依赖 | `npm init -y && npm i better-sqlite3 openai` | package.json就绪 |
| 2 | 写LLM配置 | 复制`LLM_PRESETS`，填入DeepSeek Key | API可调 |
| 3 | 测试LLM | 运行`testLLMConnection()` | 收到回复 |
| 4 | 创建SQLite | 运行`NutritionDatabase.initialize()` | 表结构就绪 |
| 5 | 导入食物数据 | 把china-food-composition数据写入SQLite | 可查询 |
| 6 | 测试查询 | `db.getFood('小米')` | 返回营养成分 |
| 7 | 注册工具 | 复制`ToolRegistry.registerBuiltinTools()` | 4个工具可用 |
| 8 | 运行Agent Loop | `agentLoop.run('小米粥GI值是多少？')` | 流式回复+工具调用 |

### API Key获取路径

| Provider | 注册地址 | 价格 | 特点 |
|----------|---------|------|------|
| DeepSeek | https://platform.deepseek.com | ¥1/百万token(input) | 性价比最高，中文好 |
| 混元 | https://hunyuan.tencent.com | 有免费额度 | 腾讯系，企业首选 |
| OpenAI | https://platform.openai.com | $5/百万token | 最强模型，需境外支付 |
| 智谱GLM | https://open.bigmodel.cn | 有免费额度 | 中文优秀，国内可用 |

---

## 九、架构总览图

```
┌─ Electron主进程 ─────────────────────────────────────────────┐
│                                                              │
│  KeyManager ←→ safeStorage(加密密钥)                         │
│  NutritionDatabase ←→ SQLite(食物/食养/GI)                    │
│  LLMClient ←→ DeepSeek/OpenAI API(流式+工具调用)              │
│  MCPManager ←→ stdio/HTTP(JSON-RPC外部服务)                   │
│  ToolRegistry ←→ SkillLoader(动态工具注册)                     │
│  SkillRouter ←→ Skill MD(知识路由匹配)                        │
│                                                              │
│  ↓ ipcMain.handle()                                          │
│                                                              │
├─ IPC Bridge ────────────────────────────────────────────────┤
│                                                              │
│  ↓ ipcRenderer.invoke()                                      │
│                                                              │
├─ Electron渲染进程(React) ──────────────────────────────────────┤
│                                                              │
│  api.llm.chatStream()  → 流式对话                             │
│  api.db.queryFood()    → 食物查询                             │
│  api.mcp.callTool()    → 外部服务                             │
│  api.window.create()   → 多窗口                               │
│                                                              │
│  Zustand Store ←→ 多窗口状态同步                               │
│  ChatPanel ←→ AgentLoop ←→ ToolRegistry ←→ SQLite            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

> **核心原则**：渲染进程永远不直接访问数据库、不直接调用LLM API、不直接接触密钥。
> 所有"危险"操作都在主进程完成，渲染进程通过IPC安全调用。
