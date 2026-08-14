# 营养Buddy v0.2

> 临床营养师AI助手 — 能跑的版本，不是PPT

> ## ⚠️ 许可声明
> 本项目采用 **CC BY-NC 4.0** 许可（见 [LICENSE](./LICENSE)）：
> **仅供个人学习、研究与非商业用途使用，禁止商用**。转载/二次开发须署名原作者（王润圆 / runyuan-wang）并保持同样许可。

## 这是什么

一个基于 Electron + React + TypeScript 的桌面应用，整合了：
- 营小养 AI 人格（温柔学术型临床营养师助手）
- 中国食物成分表（386个食物编码 + 255个GI值）
- OpenAI 兼容 LLM 流式对话 + 工具调用

## v0.2 四大支柱（LearnBuddy 对标，范式继承长生工作台）

| 支柱 | 入口 | 说明 |
|------|------|------|
| 多智能体会诊（营养MDT） | 侧边栏「多智能体会诊」 | 8 个内置专科顾问 + 用户自建 agent（可一键复制内置顾问改造）；词法人群匹配 → 并行征询 → 主持人汇总（含分歧与高危标注）→ 会诊单 → 营养师终审 |
| 专家分身 | 设置页「多分身管理」 | 多分身切换/新建；**从素材创建向导**（粘贴/本地文件 → AI 提炼方法论/思维链/风格草稿 → 本人校准 → 启用，无 Key 时降级模板）；终审经验以补丁状态机（proposed→reviewed→applied/rejected）回流分身，永不自动改写知识底座 |
| 记忆系统 | 侧边栏「记忆库」 | 用户档案（BMI自动计算/化验指标）+ 跨会话长期记忆（二元组词法检索，无 embedding），对话与会诊自动注入 |
| Skill 生态 | 侧边栏「技能库」 | 两态注册表（知识态 md/JSON + 调度态 registry.jsonl）：10 指南 + 8 工具 + 3 工作台，逐项启停；**全生命周期**：粘贴/本地文件导入、编辑更新覆盖、删除、导出分享包（.json）、分享包导入互导 |

多模型路由：主模型 + Kimi/DeepSeek/智谱/Qwen/OpenAI 五路 adapter，按 agent 绑定模型，key 只存本地主进程，未配置自动回退主模型。

## v0.2.x 易用性补强

- **UI 改版**：深色渐变侧边栏 + 图标化分组导航（对话/会诊/宣教图/记忆/技能 + 知识工作台）、渐变气泡、胶囊激活态、卡片阴影层次
- **宣教图工作台**（侧边栏「宣教图工作台」）：营养师给用户出宣教材料——今日食谱卡片 / 营养科普海报 / 一周食谱总览 / 食养误区提醒 / 自由创作 5 模板；✨AI 起草文案（主模型起草 → 本人校准）→ 🎨生成图片（智谱 CogView / OpenAI DALL·E / 任意兼容端点，设置页配置）；产物落盘 `data/images/`，历史可回看
- **多对话**：对话视图顶部会话栏——新建（Ctrl+N）/ 切换 / 改名 / 删除；每轮对话自动落盘 `data/chats/*.json`，重启不丢；首条用户消息自动成为会话标题
- **中文菜单**：文件/编辑/视图/窗口/帮助 全中文（含「关于 营养Buddy」），快捷键与系统行为保留
- **微信 Bot 连接**（设置页）：企业微信群机器人 Webhook / Server酱 两种通道，配置后可把消息推送到微信；「发送测试消息」一键验证；未启用/未配置时明确报错、绝不外呼

## 快速安装（5步跑起来）

```bash
# 1. 安装依赖
npm install --registry https://registry.npmmirror.com

# 2. 导入食物数据（需要先安装 china-food-composition skill）
npm run import-foods

# 3. 配置API Key
cp .env.example .env
# 编辑 .env，填入你的 DeepSeek 或其他 OpenAI 兼容 API Key

# 4. 编译
npm run build

# 5. 启动！
npm start
```

### 开发模式（热重载）

```bash
npm run dev
```

## 目录结构

```
nutrition-buddy/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 窗口管理 + IPC 注册
│   │   ├── llm.ts         # LLM 通信层（流式 + 工具调用）
│   │   ├── food-db.ts     # SQLite 食物成分查询
│   │   └── persona.ts     # 营小养系统提示词
│   ├── preload/
│   │   └── preload.ts     # IPC 安全桥
│   └── renderer/          # React 前端
│       └── src/
│           ├── App.tsx     # 主界面（对话 + 食物查询）
│           ├── types.ts    # 类型定义
│           └── index.css   # 千里江山图配色
├── scripts/
│   └── import-foods.js    # 食物数据导入脚本
├── data/                  # 运行时数据（全部本地文件，无数据库，改文件即时生效）
│   ├── nutrition.db       # SQLite（仅食物成分表）
│   ├── agents.json        # 多智能体注册表
│   ├── skills/            # 技能注册表（registry.jsonl）+ 自定义技能
│   ├── memory/            # 用户档案 profiles/ + 跨会话记忆 memory.jsonl
│   ├── avatars/           # 专家分身 md + 补丁状态机 patches.jsonl
│   └── consults/          # 会诊记录 json
├── persona/               # AI 人格系统文档
├── docs/                  # 架构设计文档
└── package.json
```

## 功能

### 对话模式
- 流式输出，实时显示 AI 回复
- 营小养人格注入（温柔学术型）
- 支持工具调用：AI 自动查询食物成分和 GI 值
- Markdown 渲染（表格、代码块）

### 食物查询模式
- 模糊搜索 386 个食物编码
- 点击查看 GI 值（低/中/高分类标注）
- 数据来源：中国食物成分表（标准版第6版）

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + Vite 6 |
| 语言 | TypeScript 5 |
| 数据库 | SQLite (better-sqlite3) |
| LLM | OpenAI 兼容协议 (DeepSeek / 混元 / 智谱) |
| 安全 | contextIsolation + IPC 桥 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NUTRITION_BUDDY_LLM_API_KEY` | LLM API密钥 | (必填) |
| `NUTRITION_BUDDY_LLM_BASE_URL` | API基础URL | `https://api.deepseek.com/v1` |
| `NUTRITION_BUDDY_LLM_MODEL` | 模型名称 | `deepseek-chat` |

## 作者

王润圆 · 昆明医科大学 · 营养与食品卫生学硕士 · 中国注册营养师

## 许可

CC BY-NC 4.0 — 禁止商用
