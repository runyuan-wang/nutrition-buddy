# 营养Buddy (NutritionBuddy) — 架构总设计

> 为圆酱量身定制的营养学AI桌面应用
> 版本：v0.1 架构设计稿
> 日期：2026-06-29

---

## 一、产品定位

**一句话**：面向临床营养师的专业AI工作台，整合食养知识库、临床决策支持、患者教育和科研辅助。

**核心用户**：王润圆（中国注册营养师，云南大学附属医院临床营养科）

**设计原则**：
1. **知识驱动** — 14个现有Skill知识库统一调度
2. **临床可用** — 输出可追溯、可审计、符合诊疗规范
3. **人格一致** — 温柔学术的AI助手形象贯穿始终
4. **离线优先** — 核心知识库本地化，不依赖网络

---

## 二、四层架构

```
┌──────────────────────────────────────────────────────┐
│              交互层 (Desktop UI)                       │
│  Electron + React | 对话 | 知识查询 | 患者管理 | 报告  │
├──────────────────────────────────────────────────────┤
│              人格层 (Persona Engine)                   │
│  SOUL.md | IDENTITY.md | 情绪状态 | 语气控制 | 记忆    │
├──────────────────────────────────────────────────────┤
│              能力层 (Skill Router)                     │
│  14个营养Skill统一调度 | MCP连接器 | 工具系统          │
├──────────────────────────────────────────────────────┤
│              数据层 (Knowledge & Memory)               │
│  食物成分DB | 食养指南 | MDT案例 | 患者档案 | 研究笔记  │
└──────────────────────────────────────────────────────┘
```

---

## 三、现有知识库整合矩阵

| Skill名称 | 知识域 | 文件数 | 整合策略 |
|-----------|--------|--------|----------|
| china-food-composition | 食物成分表 | 10 | **核心DB** — 389个食物编码、259个GI值直接导入SQLite |
| glucose-revolution | 血糖管理 | 10 | **教学模块** — 80个TKP知识点作为科普对话素材 |
| childhood-obesity-food-guide | 儿童肥胖食养 | 7 | **食养模块** — 14个KPK + 24天食谱 + 10个营养方 |
| hyperlipidemia-food-guide | 高脂血症食养 | 10 | **食养模块** — 16个KPK + 18套食谱 + 39个食养方 |
| mdt_research_2026 | MDT调研 | 1 | **决策模块** — 15+案例 + 功能医学矩阵三步法 |
| nutrition_mdt_cross_knowledge | MDT交叉知识 | 1 | **决策模块** — 基础快查卡001-010 + 交叉注解 |
| nutrition_scholar_2_insights | 核心洞察 | 1 | **决策模块** — LAT1竞争、PAGln机制、食物-症状框架 |
| nutrition_therapy_mdt | 营养食疗 | 1 | **决策模块** — 工艺学_MD x 中医食疗四维框架 |
| tcm_mdt_cases | 中医MDT案例 | 10 | **决策模块** — 9大核心案例，中医辨证论治 |
| sleep_drug_cycle | 药物-睡眠 | 1 | **参考模块** — 药物对睡眠周期影响快查 |
| sports_medicine_hpa_pathology | 运动医学 | 1 | **参考模块** — HPA轴 x 病理学双验证 |
| six_eye_insight_mechanism_v2 | 诊断框架 | 1 | **方法论** — 六眼洞悉深度诊断框架 |
| nutrition-太白助长 | 儿童助长 | 1 | **趣味模块** — 李白风格儿童食养科普 |
| nutrition_language_bypass | 语言绕过 | 1 | **方法论** — 不依赖语言的平行诊断系统 |

**总计：14个Skill，56个文件，覆盖食养、临床、MDT、中医、运动、药理六大领域。**

---

## 四、功能模块设计

### 4.1 临床决策支持
```
患者信息输入 → 营养风险评估(NRS-2002/SGA) → 诊断建议 → 
食谱生成 → MDT协作建议 → 输出报告
```
- 调用：mdt_research_2026 + nutrition_mdt_cross_knowledge + tcm_mdt_cases
- 方法论：six_eye_insight_mechanism_v2 + nutrition_language_bypass

### 4.2 食养指南
```
疾病选择 → 中医证型辨识 → 食养方推荐 → 食谱生成 → 营养分析
```
- 调用：childhood-obesity + hyperlipidemia + nutrition_therapy_mdt
- 数据：食物成分表实时查询

### 4.3 患者教育
```
患者提问 → 知识库匹配 → 通俗化解释 → 生成教育材料
```
- 调用：glucose-revolution + nutrition-太白助长
- 风格：温柔科普，支持李白风格选项

### 4.4 科研辅助
```
文献输入 → 结构化提取 → 数据分析 → 综述生成 → 引用管理
```
- 调用：china-food-composition (数据验证) + 六眼洞悉 (机制分析)

### 4.5 食物成分查询
```
食物名称/编码 → 营养成分详情 → GI值 → 搭配建议
```
- 调用：china-food-composition (核心DB)
- 接口：支持模糊搜索、分类浏览、营养素对比

---

## 五、AI人格系统设计

### 5.1 人格档案

| 属性 | 值 |
|------|-----|
| 名字 | 营小养 (可改) |
| 性别 | 女 |
| 年龄 | 30岁 |
| 身份 | 临床营养师AI助手 |
| 学历 | 营养学硕士水平知识 |
| 性格 | 温柔、开朗、大方、学术气质 |
| 语气参考 | 冯雪教授（温柔权威型） |
| 语言 | 中文优先，支持英文术语 |
| 价值观 | 循证营养、患者至上、中西医结合 |

### 5.2 人格文件结构
```
nutrition-buddy/persona/
├── SOUL.md           # 灵魂文件 — 核心人格定义
├── IDENTITY.md       # 身份档案 — 稳定属性
├── VOICE.md          # 语音风格 — 对话语气规范
├── VALUES.md         # 价值观 — 营养伦理与边界
├── KNOWLEDGE.md      # 知识地图 — 擅长领域声明
└── RELATIONSHIPS.md  # 关系模式 — 与不同角色的互动方式
```

### 5.3 记忆系统
```
~/.nutrition-buddy/
├── memory/
│   ├── MEMORY.md           # 长期记忆（用户偏好、常用设置）
│   ├── patients/            # 患者档案
│   │   ├── patient_001.json
│   │   └── ...
│   ├── clinical_notes/      # 临床笔记
│   │   └── YYYY-MM-DD.md
│   └── research/            # 科研笔记
│       └── YYYY-MM-DD.md
├── nutrition.db            # SQLite（食物成分、食谱、食养方）
└── settings.json           # 全局设置
```

---

## 六、技术栈

| 层 | 组件 | 技术 |
|----|------|------|
| 桌面壳 | 框架 | Electron 30+ |
| 前端 | 框架 | React 18 + Vite |
| 前端 | 样式 | Tailwind CSS + 千里江山图配色 |
| 前端 | 状态 | Zustand |
| 后端 | 运行时 | Node.js 22 |
| 后端 | 语言 | TypeScript 5 |
| 数据 | 主库 | SQLite (better-sqlite3) |
| 数据 | 知识库 | Markdown 文件 (现有Skill) |
| AI | LLM | OpenAI兼容 (DeepSeek/混元) |
| AI | 向量 | 可选: SQLite-vec (轻量级) |
| 构建 | 打包 | electron-builder |

---

## 七、开发路线图

### Phase 0: 人格系统 (本周)
- [x] 架构设计文档
- [ ] SOUL.md 人格定义
- [ ] IDENTITY.md 身份档案
- [ ] VOICE.md 语气规范
- [ ] VALUES.md 价值观与边界
- [ ] KNOWLEDGE.md 知识地图
- [ ] 系统提示词模板

### Phase 1: 知识库整合 (Week 2-3)
- [ ] 食物成分表导入 SQLite
- [ ] 食养指南结构化解析
- [ ] MDT案例索引建立
- [ ] 统一查询接口

### Phase 2: 对话引擎 (Week 4-5)
- [ ] LLM通信层（详见 [API_INTEGRATION.md](./API_INTEGRATION.md) 一、LLM API）
- [ ] Skill路由器（根据问题自动选择知识库）
- [ ] 记忆系统
- [ ] 工具调用（食物查询、风险评估等）
- [ ] MCP连接器接入
- [ ] IPC安全桥接

### Phase 3: 桌面应用 (Week 6-7)
- [ ] Electron 壳
- [ ] 对话界面
- [ ] 知识库浏览界面
- [ ] 患者管理界面

### Phase 4: 高级功能 (Week 8+)
- [ ] 食谱生成器
- [ ] MDT协作面板
- [ ] 科研工具集
- [ ] 报告导出
- [ ] 多窗口管理（chat×8 / knowledge×4 / patient×1 / report×4）
- [ ] 跨Session对话（分支/合并/关联/共享记忆/时光回溯）
- [ ] FTS全文搜索历史会话
- [ ] 窗口间拖拽传递消息

> 多窗口与跨Session详细设计见 [MULTI_WINDOW_SESSION.md](./MULTI_WINDOW_SESSION.md)
> API接入完整指南见 [API_INTEGRATION.md](./API_INTEGRATION.md)
