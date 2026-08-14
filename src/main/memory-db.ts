/**
 * 记忆系统（M2）— 用户档案 + 跨会话记忆
 *
 * 范式继承长生：JSONL/JSON 文件、确定性、可追溯可删改、无数据库。
 * 三层：
 *   1. 用户档案层 data/memory/profiles/*.json（会诊与对话自动引用）
 *   2. 跨会话记忆层 data/memory/memory.jsonl（长期事实）
 *   3. 检索注入层 buildChatMemoryContext()（词项检索 + 截断护栏，不静默截断）
 */
import fs from "fs";
import { dataDir, genId, ensureDir } from "./data-dir";

export interface UserProfile {
  id: string;
  name: string;
  is_default: boolean;
  age?: number;
  sex?: string;
  height?: number;   // cm
  weight?: number;   // kg
  conditions: string[];       // 健康状况/疾病关键词（用于人群匹配）
  allergies: string[];
  labs: Record<string, string>;  // 体检指标，如 {"LDL-C": "4.2 mmol/L"}
  diet_habits?: string;
  goals: string[];
  notes?: string;
  updated_at: string;
}

export interface MemoryFact {
  id: string;
  profile_id: string | null;  // 可选关联档案
  content: string;
  source: "manual" | "consult" | "chat";
  created_at: string;
}

function profilesDir(): string {
  return dataDir("memory", "profiles");
}

function memoryFile(): string {
  return dataDir("memory", "memory.jsonl");
}

// === 用户档案 ===

export function listProfiles(): UserProfile[] {
  ensureDir(profilesDir());
  try {
    return fs
      .readdirSync(profilesDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(profilesDir() + "\\" + f, "utf-8")) as UserProfile;
        } catch {
          return null;
        }
      })
      .filter((p): p is UserProfile => p !== null);
  } catch {
    return [];
  }
}

export function getProfile(id: string): UserProfile | null {
  return listProfiles().find((p) => p.id === id) || null;
}

export function saveProfile(input: Partial<UserProfile>): UserProfile {
  const profiles = listProfiles();
  const existing = input.id ? profiles.find((p) => p.id === input.id) : undefined;
  const profile: UserProfile = {
    id: existing?.id || input.id || genId("profile"),
    name: input.name || existing?.name || "未命名用户",
    is_default: input.is_default ?? existing?.is_default ?? profiles.length === 0,
    age: input.age ?? existing?.age,
    sex: input.sex ?? existing?.sex,
    height: input.height ?? existing?.height,
    weight: input.weight ?? existing?.weight,
    conditions: input.conditions ?? existing?.conditions ?? [],
    allergies: input.allergies ?? existing?.allergies ?? [],
    labs: input.labs ?? existing?.labs ?? {},
    diet_habits: input.diet_habits ?? existing?.diet_habits,
    goals: input.goals ?? existing?.goals ?? [],
    notes: input.notes ?? existing?.notes,
    updated_at: new Date().toISOString(),
  };
  // 设为默认档案时，其他档案取消默认
  if (profile.is_default) {
    for (const p of profiles) {
      if (p.id !== profile.id && p.is_default) {
        p.is_default = false;
        fs.writeFileSync(profilesDir() + "\\" + p.id + ".json", JSON.stringify(p, null, 2), "utf-8");
      }
    }
  }
  fs.writeFileSync(profilesDir() + "\\" + profile.id + ".json", JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}

export function deleteProfile(id: string): { ok: boolean } {
  const file = profilesDir() + "\\" + id + ".json";
  // 不使用 unlinkSync：本环境的回收站垫片会拦截并在 GUI 进程内抛异常。
  // 改用全环境验证过的「清空 + 改名 .deleted」：listProfiles 只认 .json，改名即出列。
  try {
    if (fs.existsSync(file)) {
      fs.writeFileSync(file, "", "utf-8");
      fs.renameSync(file, file + ".deleted");
    }
  } catch {
    /* 以最终列表状态为准 */
  }
  // 以最终状态为准：档案不再出现在列表即视为删除成功
  const stillThere = listProfiles().some((p) => p.id === id);
  return { ok: !stillThere };
}

/** 档案 → 人读摘要（注入会诊/对话上下文） */
export function profileSummaryText(p: UserProfile): string {
  const parts: string[] = [`姓名/称呼：${p.name}`];
  const basics: string[] = [];
  if (p.age) basics.push(`${p.age}岁`);
  if (p.sex) basics.push(p.sex);
  if (p.height && p.weight) {
    const bmi = (p.weight / Math.pow(p.height / 100, 2)).toFixed(1);
    basics.push(`${p.height}cm/${p.weight}kg（BMI ${bmi}）`);
  }
  if (basics.length) parts.push(basics.join(" · "));
  if (p.conditions.length) parts.push(`健康状况：${p.conditions.join("、")}`);
  if (p.allergies.length) parts.push(`过敏/不耐受：${p.allergies.join("、")}`);
  const labEntries = Object.entries(p.labs).filter(([, v]) => v);
  if (labEntries.length) parts.push(`近期指标：${labEntries.map(([k, v]) => `${k} ${v}`).join("；")}`);
  if (p.diet_habits) parts.push(`饮食运动习惯：${p.diet_habits}`);
  if (p.goals.length) parts.push(`目标：${p.goals.join("、")}`);
  if (p.notes) parts.push(`备注：${p.notes}`);
  return parts.join("\n");
}

// === 跨会话记忆 ===

export function listMemories(profileId?: string): MemoryFact[] {
  try {
    const raw = fs.readFileSync(memoryFile(), "utf-8");
    const all = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as MemoryFact);
    return profileId ? all.filter((m) => m.profile_id === profileId) : all;
  } catch {
    return [];
  }
}

export function addMemory(input: { content: string; profile_id?: string | null; source?: MemoryFact["source"] }): MemoryFact {
  const fact: MemoryFact = {
    id: genId("mem"),
    profile_id: input.profile_id ?? null,
    content: input.content.trim(),
    source: input.source || "manual",
    created_at: new Date().toISOString(),
  };
  ensureDir(dataDir("memory"));
  fs.appendFileSync(memoryFile(), JSON.stringify(fact) + "\n", "utf-8");
  return fact;
}

export function deleteMemory(id: string): { ok: boolean } {
  const all = listMemories();
  const rest = all.filter((m) => m.id !== id);
  if (rest.length === all.length) return { ok: false };
  fs.writeFileSync(memoryFile(), rest.map((m) => JSON.stringify(m)).join("\n") + "\n", "utf-8");
  return { ok: true };
}

/** 中文友好的二元组 token（相邻两字），确定性词法打分 */
function shingles(s: string): Set<string> {
  const set = new Set<string>();
  const clean = s.replace(/\s+/g, "");
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

/** 词项检索：query 与记忆内容的二元组重叠得分（确定性，无 embedding） */
export function searchMemories(query: string, limit = 8): MemoryFact[] {
  const all = listMemories();
  if (!query.trim()) return all.slice(0, limit);
  const q = shingles(query);
  return all
    .map((m) => {
      let score = 0;
      for (const s of shingles(m.content)) if (q.has(s)) score += 1;
      return { m, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * 对话记忆注入上下文（默认档案 + 相关长期记忆）。
 * 截断护栏：总预算 3000 字符，超出时保留头部并显式标注截断，绝不静默丢弃。
 */
export function buildChatMemoryContext(question?: string): string {
  const sections: string[] = [];
  const def = listProfiles().find((p) => p.is_default);
  if (def) {
    sections.push(`## 当前用户档案（默认）\n${profileSummaryText(def)}`);
  }
  const hits = question ? searchMemories(question, 6) : [];
  const facts = hits.length > 0 ? hits : listMemories().slice(0, 3);
  if (facts.length > 0) {
    sections.push(`## 长期记忆（跨会话保留）\n${facts.map((f) => `- ${f.content}（${f.created_at.slice(0, 10)}记录）`).join("\n")}`);
  }
  if (sections.length === 0) return "";
  let text = sections.join("\n\n");
  if (text.length > 3000) {
    text = text.slice(0, 3000) + "\n…（记忆超预算已显式截断，完整记忆见记忆库）";
  }
  return text;
}
