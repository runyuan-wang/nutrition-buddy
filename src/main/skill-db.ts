/**
 * Skill 生态（M3）— 两态技能注册表
 *
 * 范式继承长生工作台「两态母体」：
 *   知识态：data/guides/*.json（指南）、data/skills/custom/*.md（自定义技能）
 *   调度态：data/skills/registry.jsonl（可寻址注册位：适用人群/禁忌边界/证据等级/版本）
 *
 * 现有 7 个硬编码 LLM 工具与 3 个工作台在注册表归一；
 * 新增指南/技能 = 注册即被对话与会诊引擎可寻址，免改代码。
 */
import fs from "fs";
import { dataDir, genId, ensureDir } from "./data-dir";
import { loadGuides } from "./guide-db";

export type SkillType = "guide" | "tool" | "workbench" | "custom";

export interface SkillEntry {
  skill_id: string;
  name: string;
  type: SkillType;
  /** 调度目标：guide id / 工具函数名 / 工作台视图 / 自定义 md 路径 */
  source: string;
  applicable_population: string[];
  contraindication_boundary: string;
  evidence_level: string;
  version_date: string;
  enabled: boolean;
  builtin: boolean;
}

const TOOL_SKILLS: { id: string; name: string; population: string[] }[] = [
  { id: "search_food", name: "食物搜索", population: ["通用"] },
  { id: "query_food_gi", name: "GI 查询", population: ["通用", "糖尿病", "控糖人群"] },
  { id: "get_food_categories", name: "食物分类体系", population: ["通用"] },
  { id: "get_nutrient_def", name: "营养素定义", population: ["通用", "专业同行"] },
  { id: "list_gi_by_level", name: "按GI等级列食物", population: ["糖尿病", "控糖人群"] },
  { id: "get_food_detail", name: "食物综合查询", population: ["通用"] },
  { id: "query_guide", name: "食养指南查询", population: ["全部食养人群"] },
  { id: "consult", name: "多智能体会诊", population: ["复杂多病共存", "MDT场景"] },
];

const WORKBENCH_SKILLS: { id: string; name: string; population: string[] }[] = [
  { id: "lipid", name: "血脂工作台", population: ["高脂血症", "心血管代谢"] },
  { id: "glucose", name: "控糖工作台", population: ["糖尿病", "控糖人群"] },
  { id: "child", name: "儿童肥胖工作台", population: ["儿童青少年肥胖"] },
];

function registryFile(): string {
  return dataDir("skills", "registry.jsonl");
}

function readRegistry(): SkillEntry[] {
  try {
    const raw = fs.readFileSync(registryFile(), "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as SkillEntry);
  } catch {
    return [];
  }
}

function writeRegistry(list: SkillEntry[]): void {
  ensureDir(dataDir("skills"));
  fs.writeFileSync(registryFile(), list.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");
}

/** 指南 → 注册条目（证据等级：官方指南） */
function guideEntry(g: { id: string; name: string; year: string; syndromeCount: number; recipeCount: number }): SkillEntry {
  return {
    skill_id: `guide_${g.id}`,
    name: g.name,
    type: "guide",
    source: g.id,
    applicable_population: [g.name.replace(/《|》|（.*?）|\(.*?\)/g, "")],
    contraindication_boundary: "急重症、妊娠期特殊状态等以指南原文禁忌为准；高危信号仅复核提示",
    evidence_level: "official_guideline",
    version_date: g.year,
    enabled: true,
    builtin: true,
  };
}

/** 确保注册表存在且内置条目齐全（合并新增内置，保留用户启停状态） */
export function ensureRegistry(): SkillEntry[] {
  let list = readRegistry();
  if (list.length === 0) {
    list = [
      ...loadGuides().map(guideEntry),
      ...TOOL_SKILLS.map((t) => ({
        skill_id: `tool_${t.id}`,
        name: t.name,
        type: "tool" as SkillType,
        source: t.id,
        applicable_population: t.population,
        contraindication_boundary: "",
        evidence_level: "builtin",
        version_date: "",
        enabled: true,
        builtin: true,
      })),
      ...WORKBENCH_SKILLS.map((w) => ({
        skill_id: `workbench_${w.id}`,
        name: w.name,
        type: "workbench" as SkillType,
        source: w.id,
        applicable_population: w.population,
        contraindication_boundary: "不替代医学诊断",
        evidence_level: "distilled",
        version_date: "",
        enabled: true,
        builtin: true,
      })),
    ];
    writeRegistry(list);
    return list;
  }
  // 合并新增内置（新指南 / 新工具）
  const ids = new Set(list.map((e) => e.skill_id));
  const additions: SkillEntry[] = [];
  for (const g of loadGuides()) {
    const sid = `guide_${g.id}`;
    if (!ids.has(sid)) additions.push(guideEntry(g));
  }
  for (const t of TOOL_SKILLS) {
    const sid = `tool_${t.id}`;
    if (!ids.has(sid)) {
      additions.push({
        skill_id: sid, name: t.name, type: "tool", source: t.id,
        applicable_population: t.population, contraindication_boundary: "",
        evidence_level: "builtin", version_date: "", enabled: true, builtin: true,
      });
    }
  }
  if (additions.length > 0) {
    list = [...list, ...additions];
    writeRegistry(list);
  }
  return list;
}

export function listSkills(): SkillEntry[] {
  return ensureRegistry();
}

export function setSkillEnabled(skillId: string, enabled: boolean): SkillEntry | null {
  const list = ensureRegistry();
  const target = list.find((e) => e.skill_id === skillId);
  if (!target) return null;
  target.enabled = enabled;
  writeRegistry(list);
  return target;
}

export interface CustomSkillInput {
  name: string;
  content: string;
  population?: string[];
  boundary?: string;
  evidence?: string;
  version?: string;
}

/** 导入自定义技能：知识态写入 data/skills/custom/*.md + 注册调度态 */
export function importCustomSkill(input: CustomSkillInput): SkillEntry {
  const id = genId("skill");
  ensureDir(dataDir("skills", "custom"));
  const file = dataDir("skills", "custom", `${id}.md`);
  fs.writeFileSync(file, `# ${input.name}\n\n${input.content}\n`, "utf-8");
  const entry: SkillEntry = {
    skill_id: id,
    name: input.name,
    type: "custom",
    source: file,
    applicable_population: input.population || [],
    contraindication_boundary: input.boundary || "",
    evidence_level: input.evidence || "custom",
    version_date: input.version || new Date().toISOString().slice(0, 10),
    enabled: true,
    builtin: false,
  };
  const list = ensureRegistry();
  list.push(entry);
  writeRegistry(list);
  return entry;
}

/** 更新自定义技能（覆盖知识态 + 刷新调度态元数据，版本日期留痕） */
export function updateCustomSkill(skillId: string, input: CustomSkillInput): SkillEntry | null {
  const list = ensureRegistry();
  const target = list.find((e) => e.skill_id === skillId && e.type === "custom");
  if (!target) return null;
  if (input.content?.trim()) {
    fs.writeFileSync(target.source, `# ${input.name || target.name}\n\n${input.content.trim()}\n`, "utf-8");
  }
  target.name = input.name?.trim() || target.name;
  if (input.population) target.applicable_population = input.population;
  if (input.boundary !== undefined) target.contraindication_boundary = input.boundary;
  if (input.evidence) target.evidence_level = input.evidence;
  target.version_date = new Date().toISOString().slice(0, 10);
  writeRegistry(list);
  return target;
}

/** 删除自定义技能（内置不可删）：知识态改名 .deleted 出列 + 注册行移除 */
export function deleteCustomSkill(skillId: string): { ok: boolean; message: string } {
  const list = ensureRegistry();
  const target = list.find((e) => e.skill_id === skillId && e.type === "custom");
  if (!target) return { ok: false, message: "技能不存在或非自定义技能" };
  try {
    if (fs.existsSync(target.source)) {
      fs.writeFileSync(target.source, "", "utf-8");
      fs.renameSync(target.source, target.source + ".deleted");
    }
  } catch { /* 以注册表终态为准 */ }
  writeRegistry(list.filter((e) => e.skill_id !== skillId));
  return { ok: true, message: "已删除" };
}

/** 读取自定义技能全文（编辑回填用） */
export function getCustomSkillContent(skillId: string): { name: string; content: string } | null {
  const target = ensureRegistry().find((e) => e.skill_id === skillId && e.type === "custom");
  if (!target) return null;
  try {
    const raw = fs.readFileSync(target.source, "utf-8");
    const content = raw.replace(/^#\s*.*\n/, "").trim();
    return { name: target.name, content };
  } catch {
    return null;
  }
}

/** 技能分享包（对标 LearnBuddy Skills 共建共享：单 JSON 文件即可互导） */
export interface SkillBundle {
  bundle_version: 1;
  exported_at: string;
  skill: {
    name: string;
    type: SkillType;
    content: string;
    applicable_population: string[];
    contraindication_boundary: string;
    evidence_level: string;
    version_date: string;
  };
}

/** 导出技能为分享包（指南/自定义均可导出；工具类无知识态不导） */
export function exportSkill(skillId: string): { ok: boolean; bundle?: SkillBundle; message: string } {
  const target = ensureRegistry().find((e) => e.skill_id === skillId);
  if (!target) return { ok: false, message: "技能不存在" };
  if (target.type === "tool") return { ok: false, message: "内置工具无知识态，不支持导出" };
  let content = "";
  if (target.type === "custom") {
    const got = getCustomSkillContent(skillId);
    content = got?.content || "";
  } else if (target.type === "guide") {
    try {
      content = JSON.stringify(loadGuides().find((g) => g.id === target.source) || {}, null, 2);
    } catch { content = ""; }
  } else {
    content = `工作台：${target.name}（调度入口，无独立知识态）`;
  }
  return {
    ok: true,
    message: "已生成分享包",
    bundle: {
      bundle_version: 1,
      exported_at: new Date().toISOString(),
      skill: {
        name: target.name,
        type: target.type,
        content,
        applicable_population: target.applicable_population,
        contraindication_boundary: target.contraindication_boundary,
        evidence_level: target.evidence_level,
        version_date: target.version_date,
      },
    },
  };
}

/** 从分享包导入技能（自定义池，覆盖同名可选） */
export function importSkillBundle(bundle: SkillBundle, opts?: { overwriteId?: string }): { ok: boolean; entry?: SkillEntry; message: string } {
  const s = bundle?.skill;
  if (!s || !s.name?.trim() || !s.content?.trim()) return { ok: false, message: "分享包格式无效（缺 name/content）" };
  if (opts?.overwriteId) {
    const updated = updateCustomSkill(opts.overwriteId, {
      name: s.name, content: s.content,
      population: s.applicable_population, boundary: s.contraindication_boundary,
      evidence: s.evidence_level, version: s.version_date,
    });
    if (updated) return { ok: true, entry: updated, message: "已覆盖更新" };
  }
  const entry = importCustomSkill({
    name: s.name, content: s.content,
    population: s.applicable_population, boundary: s.contraindication_boundary,
    evidence: s.evidence_level || "shared", version: s.version_date,
  });
  return { ok: true, entry, message: "已导入" };
}

/** 已启用的工具函数名（llm.ts 过滤工具用；consult 恒可用） */
export function getEnabledToolNames(): string[] {
  return ensureRegistry()
    .filter((e) => e.type === "tool" && e.enabled)
    .map((e) => e.source);
}

/** 已启用的指南 id（llm.ts query_guide 校验 + 会诊引擎挂载用） */
export function getEnabledGuideIds(): string[] {
  return ensureRegistry()
    .filter((e) => e.type === "guide" && e.enabled)
    .map((e) => e.source);
}

/** 已启用的自定义技能内容（注入会诊/对话上下文） */
export function getEnabledCustomSkills(): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  for (const e of ensureRegistry()) {
    if (e.type === "custom" && e.enabled) {
      try {
        const content = fs.readFileSync(e.source, "utf-8");
        // 截断护栏：单技能最多 2000 字
        out.push({ name: e.name, content: content.slice(0, 2000) });
      } catch {
        /* 文件丢失则跳过 */
      }
    }
  }
  return out;
}
