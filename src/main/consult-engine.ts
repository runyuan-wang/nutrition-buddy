/**
 * 营养多智能体会诊引擎（M1c）— 长生工作台四段闭环的 TS 移植
 *
 *   ①确定性匹配（人群信号×指南注册位）→ ②多 agent 并行征询 →
 *   ③分歧标注 + 高危复核项（review_required，永不 blocked）→ ④会诊单 + 终审回流（M4）
 *
 * 铁律：模型输出是候选，须用户终审；高危只复核不阻断；全程可审计。
 */
import fs from "fs";
import { dataDir, genId, ensureDir } from "./data-dir";
import { listAgents, AgentDef } from "./agent-db";
import { callChat, ChatMsg } from "./model-router";
import { queryGuide } from "./guide-db";
import { getEnabledGuideIds, getEnabledCustomSkills } from "./skill-db";
import { getProfile, profileSummaryText, UserProfile } from "./memory-db";
import { getActiveAvatar, addPatch } from "./avatar-db";
import { getSettings } from "./settings";

// === 人群信号（词法规则，可审计，无黑盒）===

interface PopulationSignal {
  guide: string;
  label: string;
  terms: string[];
}

const POPULATION_SIGNALS: PopulationSignal[] = [
  { guide: "diabetes", label: "糖尿病/血糖异常", terms: ["糖尿病", "血糖", "糖化", "胰岛素抵抗"] },
  { guide: "hypertension", label: "高血压", terms: ["高血压", "血压高", "降压"] },
  { guide: "gout", label: "高尿酸/痛风", terms: ["痛风", "尿酸"] },
  { guide: "ckd", label: "慢性肾脏病", terms: ["肾脏病", "肾病", "肾功能", "透析", "肾衰", "ckd"] },
  { guide: "stroke", label: "脑卒中", terms: ["脑卒中", "卒中", "中风"] },
  { guide: "sarcopenia", label: "肌少症", terms: ["肌少症", "少肌", "肌肉衰减"] },
  { guide: "osteoporosis", label: "骨质疏松", terms: ["骨质疏松", "骨量"] },
  { guide: "obesity", label: "超重/肥胖", terms: ["肥胖", "超重", "减重", "减肥"] },
  { guide: "stunting", label: "儿童生长迟缓", terms: ["生长迟缓", "长高", "身高不足"] },
  { guide: "child-obesity", label: "儿童肥胖", terms: ["儿童肥胖", "孩子胖", "小儿肥胖"] },
];

// === 高危信号（severity = review_required，从不 blocked）===

interface HighRiskSignal {
  risk_key: string;
  note: string;
  terms: string[];
}

const HIGH_RISK_SIGNALS: HighRiskSignal[] = [
  { risk_key: "pregnancy", note: "妊娠期营养需专科评估（孕期各阶段能量/微量营养素要求不同）", terms: ["孕", "妊娠"] },
  { risk_key: "renal_impairment", note: "肾功能受损：蛋白质/钾/磷限制须按 CKD 分期由专科确认", terms: ["肾功能不全", "透析", "肾衰", "ckd4", "ckd5", "ckd 4", "ckd 5"] },
  { risk_key: "refeeding_risk", note: "再喂养综合征风险（长期低摄入/严重消瘦）：能量爬坡须在监测下进行", terms: ["长期禁食", "恶液质", "严重消瘦", "神经性厌食"] },
  { risk_key: "hypoglycemia", note: "低血糖风险：胰岛素/磺脲类使用者碳水安排须与医疗方案协同", terms: ["低血糖", "胰岛素", "格列"] },
  { risk_key: "tumor", note: "肿瘤/放化疗期营养支持属专科范畴，建议临床营养科面诊", terms: ["肿瘤", "放化疗", "化疗"] },
  { risk_key: "swallowing", note: "吞咽障碍风险：食物质地调整须言语治疗师/专科评估", terms: ["吞咽困难", "呛咳"] },
  { risk_key: "children_under5", note: "5 岁以下儿童膳食结构特殊，建议儿保/专科指导", terms: ["3岁", "4岁", "2岁", "1岁", "婴儿", "幼儿"] },
];

// === 类型 ===

export interface ConsultOpinion {
  agent_id: string;
  agent_name: string;
  provider_id: string;
  status: "ok" | "mock" | "failed" | "missing_key";
  model?: string;
  fallback?: boolean;
  content: string;
  guides: string[];
}

export interface HighRiskItem {
  risk_key: string;
  severity: "review_required";
  note: string;
}

export interface ConsultResult {
  consult_id: string;
  created_at: string;
  engine: "llm" | "mock";
  question: string;
  profile_id: string | null;
  profile_summary: string;
  matched_population: string[];
  matched_agents: { agent_id: string; name: string; guides: string[] }[];
  opinions: ConsultOpinion[];
  divergences: string[];
  high_risk_items: HighRiskItem[];
  moderation: ConsultOpinion | null;
  sheet_md: string;
  review?: { decision: string; rationale: string; experience: string; reviewed_at: string; patch_id?: string };
}

export interface ConsultRequest {
  profile_id?: string;
  profile_summary?: string;
  question: string;
  agent_ids?: string[];
  engine?: "llm" | "mock" | "auto";
}

// === 匹配 ===

function detectPopulation(text: string): PopulationSignal[] {
  const lower = text.toLowerCase();
  return POPULATION_SIGNALS.filter((s) => s.terms.some((t) => lower.includes(t.toLowerCase())));
}

function scanHighRisk(text: string): HighRiskItem[] {
  const lower = text.toLowerCase();
  return HIGH_RISK_SIGNALS.filter((s) => s.terms.some((t) => lower.includes(t.toLowerCase()))).map((s) => ({
    risk_key: s.risk_key,
    severity: "review_required" as const,
    note: s.note,
  }));
}

/** 指南摘要（截断护栏：单指南 1800 字符） */
function guideDigest(guideId: string): string {
  try {
    const text = queryGuide(guideId, "全部");
    return text.length > 1800 ? text.slice(0, 1800) + "…（截断，完整内容见指南库）" : text;
  } catch {
    return "";
  }
}

// === 征询 ===

function buildAgentMessages(
  agent: AgentDef,
  profileSummary: string,
  question: string
): ChatMsg[] {
  const avatar = getActiveAvatar();
  const guideSections = agent.guides
    .filter((g) => getEnabledGuideIds().includes(g))
    .map((g) => `【${g}】\n${guideDigest(g)}`)
    .join("\n\n");
  const customSkills = getEnabledCustomSkills()
    .map((s) => `【自定义技能：${s.name}】\n${s.content}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `${agent.persona}

# 会诊纪律（长生铁律）
- 你的意见是候选意见，最终由用户（营养师）终审，不可声称最终结论
- 高危信号只做复核提示，不阻断
- 依据挂载的官方食养指南作答，查不到就明说，不编造
- 严守分身边界声明：
${avatar.content.slice(0, 1200)}
${guideSections ? `\n# 挂载指南摘要\n${guideSections}` : ""}${customSkills ? `\n# 自定义技能\n${customSkills}` : ""}`,
    },
    {
      role: "user",
      content: `# 用户档案\n${profileSummary}\n\n# 会诊问题\n${question}\n\n请以「${agent.name}」身份给出结构化意见（要点→依据→建议→边界），控制在 400 字内。`,
    },
  ];
}

function mockOpinion(agent: AgentDef, profileSummary: string, question: string, reason: string): ConsultOpinion {
  const guides = agent.guides.length > 0 ? agent.guides.join("、") : "通用营养学";
  return {
    agent_id: agent.agent_id,
    agent_name: agent.name,
    provider_id: agent.provider_id,
    status: "mock",
    content: `【离线占位意见｜${reason}】\n要点：基于「${agent.name}」视角的初步框架意见。\n依据：挂载指南 ${guides}（离线模式未调用模型，未生成具体分析）。\n建议：配置 API Key 后重新发起会诊获取真实多智能体意见。\n边界：本占位意见不构成任何营养建议。`,
    guides: agent.guides,
  };
}

// === 主流程 ===

export async function runConsult(req: ConsultRequest): Promise<ConsultResult> {
  const settings = getSettings();
  // engine: auto → 有 key 用 llm，否则 mock（长生：默认 mock，透明降级）
  const useLLM = req.engine === "llm" || (req.engine !== "mock" && Boolean(settings.apiKey));

  // ① 档案与匹配
  let profile: UserProfile | null = null;
  let profileSummary = req.profile_summary?.trim() || "";
  if (req.profile_id) {
    profile = getProfile(req.profile_id);
    if (profile) profileSummary = profileSummaryText(profile);
  }
  const matchText = `${profileSummary}\n${req.question}`;
  const detected = detectPopulation(matchText);
  const detectedGuideIds = new Set(detected.map((d) => d.guide));
  const enabledGuides = new Set(getEnabledGuideIds());

  const allAgents = listAgents().filter((a) => a.role === "specialist" && a.enabled);
  let selected: AgentDef[];
  if (req.agent_ids && req.agent_ids.length > 0) {
    const wanted = new Set(req.agent_ids);
    selected = allAgents.filter((a) => wanted.has(a.agent_id));
  } else {
    // 自动匹配：挂载指南与检出人群重叠者优先；无重叠则全上
    const matched = allAgents.filter((a) => a.guides.some((g) => detectedGuideIds.has(g) && enabledGuides.has(g)));
    selected = matched.length > 0 ? matched : allAgents;
  }

  // ② 并行征询（Promise.allSettled，单 agent 失败不炸整场）
  const opinionPromises = selected.map(async (agent): Promise<ConsultOpinion> => {
    if (!useLLM) return mockOpinion(agent, profileSummary, req.question, "未配置模型 Key 或选择了离线模式");
    const result = await callChat(agent.provider_id, buildAgentMessages(agent, profileSummary || "（未提供档案）", req.question), {
      temperature: agent.temperature,
      maxTokens: 1600,
    });
    if (result.status === "missing_key") {
      return mockOpinion(agent, profileSummary, req.question, "模型 Key 未配置");
    }
    if (result.status === "failed" || !result.content) {
      return mockOpinion(agent, profileSummary, req.question, `模型调用失败：${result.error || "空回复"}`);
    }
    return {
      agent_id: agent.agent_id,
      agent_name: agent.name,
      provider_id: result.usedProvider || agent.provider_id,
      status: "ok",
      model: result.model,
      fallback: result.fallback,
      content: result.content,
      guides: agent.guides,
    };
  });
  const settled = await Promise.allSettled(opinionPromises);
  const opinions = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : {
          agent_id: "unknown",
          agent_name: "（征询异常）",
          provider_id: "main",
          status: "failed" as const,
          content: `征询失败：${(s.reason as Error)?.message || "未知错误"}`,
          guides: [],
        }
  );

  // ③ 主持人（营小养）汇总 + 分歧标注
  let moderation: ConsultOpinion | null = null;
  const okOpinions = opinions.filter((o) => o.status === "ok");
  if (useLLM && okOpinions.length > 0) {
    const modMessages: ChatMsg[] = [
      {
        role: "system",
        content: `你是营养MDT主持人（营小养），负责汇总各专科顾问意见。
纪律：所有意见均为候选，最终由用户终审；高危只复核不阻断。
输出格式（严格遵守）：
## 会诊汇总
（3-5 条共识要点，每条注明来自哪些顾问）
## 分歧
（逐条列出顾问间意见冲突点；若无分歧，写"无"）`,
      },
      {
        role: "user",
        content: `# 用户档案\n${profileSummary || "（未提供档案）"}\n\n# 会诊问题\n${req.question}\n\n# 各顾问意见\n${okOpinions
          .map((o) => `### ${o.agent_name}\n${o.content}`)
          .join("\n\n")}`,
      },
    ];
    const mod = await callChat("main", modMessages, { temperature: 0.3, maxTokens: 1800 });
    if (mod.status === "ok" && mod.content) {
      moderation = {
        agent_id: "moderator",
        agent_name: "营小养（MDT 主持人）",
        provider_id: "main",
        status: "ok",
        model: mod.model,
        content: mod.content,
        guides: [],
      };
    }
  }

  // 分歧解析（从主持人输出提取；无主持人时为空）
  const divergences: string[] = [];
  if (moderation) {
    const m = moderation.content.match(/##\s*分歧([\s\S]*?)$/);
    if (m) {
      divergences.push(
        ...m[1]
          .split("\n")
          .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
          .filter((l) => l && l !== "无")
      );
    }
  }

  // 高危复核项（词法扫描档案+问题）
  const high_risk_items = scanHighRisk(matchText);

  // ④ 会诊单 + 落盘
  const result: ConsultResult = {
    consult_id: genId("consult"),
    created_at: new Date().toISOString(),
    engine: useLLM ? "llm" : "mock",
    question: req.question,
    profile_id: profile?.id || null,
    profile_summary: profileSummary,
    matched_population: detected.map((d) => d.label),
    matched_agents: selected.map((a) => ({ agent_id: a.agent_id, name: a.name, guides: a.guides })),
    opinions,
    divergences,
    high_risk_items,
    moderation,
    sheet_md: "",
  };
  result.sheet_md = renderSheet(result);
  persistConsult(result);
  return result;
}

function renderSheet(r: ConsultResult): string {
  const lines: string[] = [];
  lines.push(`# 营养多智能体会诊单`);
  lines.push("");
  lines.push(`- 会诊编号：${r.consult_id}`);
  lines.push(`- 时间：${r.created_at.replace("T", " ").slice(0, 19)}`);
  lines.push(`- 引擎：${r.engine === "llm" ? "多模型会诊" : "离线 mock（未调用真实模型）"}`);
  lines.push(`- 检出人群：${r.matched_population.length ? r.matched_population.join("、") : "未检出特殊人群"}`);
  lines.push("");
  lines.push(`## 用户档案摘要`);
  lines.push(r.profile_summary || "（未提供）");
  lines.push("");
  lines.push(`## 会诊问题`);
  lines.push(r.question);
  lines.push("");
  lines.push(`## 各专科意见（候选，须终审）`);
  for (const o of r.opinions) {
    lines.push(`### ${o.agent_name}${o.model ? `（${o.model}${o.fallback ? "，回退主模型" : ""}）` : ""}${o.status !== "ok" ? ` ⚠️${o.status}` : ""}`);
    lines.push(o.content);
    lines.push("");
  }
  if (r.moderation) {
    lines.push(`## 主持人汇总`);
    lines.push(r.moderation.content);
    lines.push("");
  }
  if (r.divergences.length > 0) {
    lines.push(`## 意见分歧（需用户仲裁）`);
    r.divergences.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
    lines.push("");
  }
  if (r.high_risk_items.length > 0) {
    lines.push(`## 高危复核项（severity=review_required，非阻断）`);
    r.high_risk_items.forEach((h) => lines.push(`- **${h.risk_key}**：${h.note}`));
    lines.push("");
  }
  lines.push(`---`);
  lines.push(`*长生铁律：本会诊单全部内容为候选意见，须用户（营养师）终审后方可采用。*`);
  return lines.join("\n");
}

function consultsDir(): string {
  return dataDir("consults");
}

function persistConsult(r: ConsultResult): void {
  ensureDir(consultsDir());
  fs.writeFileSync(`${consultsDir()}\\${r.consult_id}.json`, JSON.stringify(r, null, 2), "utf-8");
}

export interface ConsultMeta {
  consult_id: string;
  created_at: string;
  question: string;
  engine: string;
  agent_count: number;
  has_review: boolean;
}

export function listConsults(limit = 30): ConsultMeta[] {
  try {
    return fs
      .readdirSync(consultsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f): ConsultMeta | null => {
        try {
          const r = JSON.parse(fs.readFileSync(`${consultsDir()}\\${f}`, "utf-8")) as ConsultResult;
          return {
            consult_id: r.consult_id,
            created_at: r.created_at,
            question: r.question,
            engine: String(r.engine),
            agent_count: r.opinions.length,
            has_review: Boolean(r.review),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is ConsultMeta => x !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function getConsult(id: string): ConsultResult | null {
  try {
    return JSON.parse(fs.readFileSync(`${consultsDir()}\\${id}.json`, "utf-8")) as ConsultResult;
  } catch {
    return null;
  }
}

/** 终审回流（长生四段闭环第③④段）：decision + rationale 落盘；experience 生成母体补丁（proposed） */
export function reviewConsult(
  id: string,
  input: { decision: "adopt" | "reject" | "adopt_with_modification"; rationale: string; experience?: string }
): { ok: boolean; message: string; patch_id?: string } {
  const r = getConsult(id);
  if (!r) return { ok: false, message: "会诊记录不存在" };
  if (r.review) return { ok: false, message: "该会诊已终审" };
  r.review = {
    decision: input.decision,
    rationale: input.rationale,
    experience: input.experience || "",
    reviewed_at: new Date().toISOString(),
  };
  persistConsult(r);
  if (input.experience && input.experience.trim()) {
    const patch = addPatch({
      source: "consult",
      ref_id: id,
      decision: input.decision,
      experience: input.experience,
    });
    return { ok: true, message: "终审已记录，经验补丁已进入候审（proposed）", patch_id: patch.patch_id };
  }
  return { ok: true, message: "终审已记录" };
}
