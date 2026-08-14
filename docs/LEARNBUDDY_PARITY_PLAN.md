# 营养Buddy 对标 LearnBuddy — 总体改造方案 (v4)

> 目标：把营养Buddy 升级为与腾讯 LearnBuddy 同范式的「营养行业智能体」。
> 四大支柱：**多智能体协作 / 专家分身 / 记忆系统 / Skill 生态**（用户优先级排序）。
> **设计范式来源：不引外部架构，直接继承圆酱自己的「长生·临床营养师内用工作台」（私有仓 `runyuan-wang/changsheng-workbench` v0.1–v0.4）**——四段闭环、两态母体、多路会诊、终审回流、可审计 RAG，全部是已验证的成熟契约。
> 状态：方案稿（待确认，暂不落码）。
> 关联：`docs/BUDDY_PARITY_PLAN.md`（v3，本文取代其路线图部分）、`docs/ARCHITECTURE.md`、长生参考快照 `../changsheng-ref/docs_changsheng_workbench.md`。

---

## 〇、定位修正（用户已拍板）

**服务对象一律称「用户」，不称「患者」。**

理由：营养Buddy 的使用者不只是医院场景的临床营养师——可能是普通营养师、健康管理者，甚至本人自助使用。LearnBuddy 也不只是老师用。营养Buddy 定位为：

- **专业模式**：营养师内用（长生式会诊/复核工作台，面向"用户档案"服务对象）
- **自助模式**：普通用户日常营养问答与自我管理

术语清理原则：**产品自身文案（persona / UI / i18n / 工作台）统一"用户"**；**指南 JSON 等知识内容中引述原文的"患者"保留**（医学语境、忠于指南原文）。

现状扫描（共 10 处产品文案需改，指南 JSON 的 5 处保留）：

| 文件 | 处数 | 处理 |
|---|---|---|
| `src/main/persona.ts` | 5 | 改「用户」（如"患者至上→用户至上"、"对患者术语降级→对用户术语降级"） |
| `src/main/expert-avatar.ts` | 1 | 改「用户」 |
| `src/renderer/src/i18n.ts` | 1 | 改「用户」（zh/en 同步） |
| `src/renderer/src/GuideLibraryView.tsx` | 1 | 改「用户」 |
| `src/renderer/src/GlucoseWorkbench.tsx` | 1 | 免责声明语境微调（"糖尿病或低血糖用户请遵医嘱"） |
| `src/renderer/src/data/guides/*.json` | 5 | **保留**（指南原文） |

---

## 一、对标基准：LearnBuddy 四支柱 × 营养Buddy 现状 × 长生范式

| LearnBuddy 能力 | 营养Buddy 现状 | 长生工作台已有范式（直接继承） |
|---|---|---|
| 多智能体协作（多 Agent 自主规划） | ✗ 单模型单轮，7 个硬编码工具 | `model_consultation`：多路模型意见 + 主读/保守二读故意制造分歧 + `divergences` 标注仲裁 + 高危 `review_required` |
| 跨会话长期记忆 | ✗ 无（重启即失） | 100k 上下文工作区记账 + `rag_chunk_index.jsonl` 可审计本地检索 + surfaces 可追溯 |
| Skills 生态（开放技能、一键建智能体） | △ 14 SKILL + 10 指南是"死数据"，7 工具硬编码 | **两态母体**：MD 母体（人读+front matter）↔ `guide_skill_registry.jsonl`（可调度注册位：适用人群/禁忌边界/证据等级/版本） |
| 专家分身（核心：私域数据+本人校准+边界声明） | △ Phase 0.5 已有 `data/expert-avatar.md` 注入提示词 | `dietitian_review_patch` 终审回流：adopt/reject/adopt_with_modification + `experience_patch` + 母体补丁状态机 `proposed→reviewed→applied/rejected`（**永不自动升格**） |

继承长生的三条铁律（写入营养Buddy 产品原则）：

1. **高危不阻断，只复核**：`severity = review_required`，从不 `blocked`。
2. **模型输出是候选**：多 agent 意见须用户（营养师）终审，不自动成为建议。
3. **不自动改写知识底座**：母体/分身的升格必须经人工确认状态机。

技术栈适配：长生是 Python+JSONL，营养Buddy 是 Electron+TypeScript——**移植的是数据契约与流程范式，不是代码**；存储沿用长生原则（JSONL + MD 文件，不引数据库），与营养Buddy 现有 `data/guides/*.json` 即时生效模式一致。

---

## 二、四支柱设计

### 支柱一：多智能体协作（营养会诊引擎）— 最高优先级

**Agent 注册表** `data/agents.json`（用户可完全配置，对标 LearnBuddy"一键建智能体"）：

```json
{
  "agent_id": "agent_lipid",
  "name": "血脂管理顾问",
  "persona": "聚焦血脂代谢与食养干预的专科顾问…",
  "skills": ["skill_hyperlipidemia"],        // 挂载技能（支柱三）
  "guides": ["hyperlipidemia"],              // 挂载指南（现有10部）
  "provider_id": "kimi",                     // 每个agent可绑不同模型
  "temperature": 0.4,
  "role": "specialist",                       // specialist | moderator
  "enabled": true
}
```

**多模型 adapter 层**（继承长生五路契约）：统一 OpenAI-compatible `build_request/parse_response`，provider 目录（kimi/openai/deepseek/qwen/zhipu，含 base_url 覆盖）；key 只存主进程设置、**前端与 agent 配置不回显 key**；`missing_key` 状态绝不外呼。

**会诊编排**（继承 `run_consultation` 四段闭环，移植为 TS）：

1. **确定性匹配**：从用户档案自动检出适用人群/风险信号 → 匹配 agent 与其挂载技能（词法规则可审计，无黑盒）；
2. **并行征询**：每个启用的 specialist agent 以独立上下文（各自 persona+技能+指南切片）出意见；moderator（营小养本体）做主读；
3. **分歧与高危标注**：意见冲突记入 `divergences`（需用户仲裁）；高危信号只产 `review_required` 复核项；
4. **会诊单汇总**：渲染人读 Markdown 会诊单（长生 `render_consultation_sheet` 同构）。

**入口两个**：① 新增「会诊工作台」视图（选用户档案 → 勾选 agent → 出会诊单 → 终审）；② 主对话第 8 个工具 `consult`（营小养可自主发起会诊）。

### 支柱二：记忆系统

三层，全部 JSONL/JSON + MD，无数据库（长生原则）：

1. **用户档案层** `data/memory/profiles/*.json`：基本状况、体检指标、饮食运动习惯、目标、禁忌。术语即"用户档案"（非患者档案）。会诊与对话自动引用。
2. **跨会话记忆层** `data/memory/memory.jsonl`：对话中沉淀的长期事实（偏好、既往建议、反馈结果）。带 `source_session`、`confidence`、`created_at`，可追溯可删改。
3. **检索注入层**：会诊时按档案+话题检索相关记忆与指南片段注入上下文（复用长生 RAG 骨架思想：确定性分块+词项打分起步，契约预留 embedding 升级位）；**no-silent-truncation 护栏**——超预算先检索/压缩，不静默截断。

### 支柱三：Skill 生态

**两态技能**（直接照搬长生两态母体）：

- **知识态**：现有 `data/guides/*.json` + 可导入的 SKILL.md / MD 母体（带 front matter：source/version/适用人群/禁忌边界/证据等级/关键推荐）；
- **调度态**：`data/skills/registry.jsonl` 注册位——`skill_id / skill_name / applicable_population / contraindication_boundary / evidence_level / version_date / source_path / enabled`。

**能力归一**：现有 7 个硬编码 LLM 工具改由注册表声明（工具型技能）；指南、工作台能力（血脂/控糖/儿童肥胖）登记为知识型/应用型技能。新增指南 = 导入 → 注册 → 即被对话与会诊引擎可寻址，**免改代码**。

**技能管理页**：列表（元数据+启用开关）、导入 SKILL.md/MD 母体、查看禁忌边界与证据等级。Agent 注册表从技能里挑选挂载——支柱一与支柱三在此打通。

### 支柱四：专家分身（校准闭环升级）

现有 Phase 0.5（`data/expert-avatar.md` 运行时注入）升级为长生式闭环：

1. **多分身**：`data/avatars/*.md`——不止圆酱一个；任何营养师用户都可建自己的分身（对应"普通营养师也在用"的定位）。
2. **校准回流**（移植 `dietitian_review_patch`）：对话/会诊产物可被用户标记审阅 → 生成 `experience_patch`（经验补丁，`proposed`）→ 分身修订建议进状态机 `proposed→reviewed→applied/rejected`，**本人确认才生效，永不自动改写分身文件**。
3. **边界声明版本化**：分身内的知识边界声明带版本号，校准历史留痕。

---

## 三、路线图（M0–M4）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **M0 术语与地基** | "患者→用户"清理（10 处）；`data/` 目录规划（agents/skills/memory/avatars） | 全产品文案无"患者"（指南原文除外）；构建通过 |
| **M1 多智能体会诊** | 多模型 adapter 层 + agent 注册表 + 会诊引擎（匹配→并行征询→分歧→会诊单）+ 会诊工作台 UI + 对话 `consult` 工具 | 用户可增删改 agent 并绑定不同模型；对同一档案多 agent 出意见且分歧可见；key 不出现在任何前端产物 |
| **M2 记忆系统** | 用户档案 + 跨会话记忆 + 检索注入 + 截断护栏 | 跨会话记住用户档案与偏好；会诊自动带档案；记忆可查看可删除 |
| **M3 Skill 生态** | 技能注册表（两态）+ 技能管理页 + 7 工具归一 + agent 挂载 | 新增一部指南零改码即可被对话/会诊/agent 使用；技能可启用禁用 |
| **M4 分身闭环** | 多分身管理 + 校准回流状态机 + 边界声明版本化 | 审阅一条回答 → 产生经验补丁（proposed）→ 本人确认后分身更新且历史留痕 |

依赖关系：M0 → M1 →（M2、M3 可并行）→ M4。M1 是核心（用户第一优先级），且 M1 的 agent 注册表依赖 M3 的最小注册表先行（M1 内嵌最小版技能注册，M3 做完整管理）。

---

## 四、风险与边界（继承长生 §8，全部适用）

- 高危信号只做 `review_required` 复核提示，**永不 `blocked`**；自助模式下额外提示"建议咨询专业人士"。
- 多 agent 意见是**候选**，须用户终审；不自动成为建议。
- **不自动改写**母体、分身、记忆中的知识性内容——升格走人工状态机。
- 不引数据库：JSONL + MD，确定性、可审计、离线优先。
- 多模型 adapter 未配 key 时 `missing_key` 静默降级单模型，不崩。
- 自助模式与专业模式提示词分层：同一知识底座，自助模式术语降级+免责更重。

---

## 五、与旧方案的关系

- 本文取代 `BUDDY_PARITY_PLAN.md` v3 的路线图部分；v3 的家族代差分析、Phase 0.5（专家分身初稿，已落地）仍然有效。
- Phase 0.5 产出（`expert-avatar.md` + 加载器 + 设置页展示）在 M4 中升级为多分身，不推倒重来。
