/**
 * 专家分身（M4）— 多分身 + 校准回流闭环
 *
 * 范式继承长生 dietitian_review_patch 状态机：
 *   proposed → reviewed → applied / rejected（任何分支可 rejected）
 *   - apply 只在本人显式确认时把经验补丁追加进分身 md（可追溯留痕）
 *   - 不存在自动升格路径：AI 从不自动改写分身
 */
import fs from "fs";
import { dataDir, genId, ensureDir } from "./data-dir";

export interface AvatarInfo {
  id: string;         // 文件名（不含 .md）
  name: string;
  title: string;
  active: boolean;
  exists: boolean;
  size: number;
}

export interface AvatarContent {
  name: string;
  title: string;
  content: string;
  source: string;
  exists: boolean;
}

export type PatchStatus = "proposed" | "reviewed" | "applied" | "rejected";

export interface AvatarPatch {
  patch_id: string;
  avatar_id: string;
  source: "consult" | "chat" | "manual";
  ref_id: string;        // 关联会诊 id 等
  decision: string;      // 采纳/驳回/修改后采纳 的上下文说明
  experience: string;    // 经验补丁内容（拟沉淀进分身）
  status: PatchStatus;
  created_at: string;
  resolved_at?: string;
}

const DEFAULT_AVATAR_ID = "yuanjiang";
const FALLBACK_AVATAR = `# 专家分身：王润圆 · 注册营养师

- 原型：王润圆，中国注册营养师（昆明医科大学营养与食品卫生学硕士，云南大学附属医院临床营养科）
- 方法论：先评估再干预，后随访闭环；指南优先，辨证施食；个体化；随访可追踪
- 决策框架：复杂慢性问题按功能医学七大失衡定位根源；MDT 与临床方案协同
- 语言风格：先共情、再分析、后给方案；对用户术语降级，对同行标注证据等级
- 边界：不做诊断、不替代面诊、不给药；急重症立即建议就医；数据不编造，查不到就说查不到`;

function avatarsDir(): string {
  return dataDir("avatars");
}

function stateFile(): string {
  return dataDir("avatars", "state.json");
}

function patchesFile(): string {
  return dataDir("avatars", "patches.jsonl");
}

function readState(): { active_id: string } {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf-8")) as { active_id: string };
  } catch {
    return { active_id: DEFAULT_AVATAR_ID };
  }
}

function writeState(state: { active_id: string }): void {
  ensureDir(avatarsDir());
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2), "utf-8");
}

/** 首个分身：优先迁移既有 data/expert-avatar.md，否则用内置默认 */
function ensureDefaultAvatar(): void {
  ensureDir(avatarsDir());
  const file = `${avatarsDir()}\\${DEFAULT_AVATAR_ID}.md`;
  if (fs.existsSync(file)) return;
  let content = FALLBACK_AVATAR;
  try {
    const legacy = dataDir("expert-avatar.md");
    if (fs.existsSync(legacy)) {
      const legacyContent = fs.readFileSync(legacy, "utf-8").trim();
      if (legacyContent) content = legacyContent;
    }
  } catch {
    /* keep fallback */
  }
  fs.writeFileSync(file, content, "utf-8");
}

/** 从 md 首行/前几行提取分身名与头衔 */
function extractMeta(content: string): { name: string; title: string } {
  const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
  const name = firstLine.replace(/^专家分身[：:]\s*/, "") || "未命名分身";
  return { name, title: firstLine || "专家分身" };
}

export function listAvatars(): AvatarInfo[] {
  ensureDefaultAvatar();
  const state = readState();
  try {
    return fs
      .readdirSync(avatarsDir())
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const id = f.replace(/\.md$/, "");
        const content = fs.readFileSync(`${avatarsDir()}\\${f}`, "utf-8");
        const meta = extractMeta(content);
        return {
          id,
          name: meta.name,
          title: meta.title,
          active: id === state.active_id,
          exists: true,
          size: content.length,
        };
      });
  } catch {
    return [];
  }
}

export function getAvatarContent(avatarId?: string): AvatarContent {
  ensureDefaultAvatar();
  const id = avatarId || readState().active_id;
  const file = `${avatarsDir()}\\${id}.md`;
  try {
    const content = fs.readFileSync(file, "utf-8").trim();
    if (content) {
      const meta = extractMeta(content);
      return { name: meta.name, title: meta.title, content, source: file, exists: true };
    }
  } catch {
    /* fall through */
  }
  return { name: "王润圆 · 注册营养师", title: "默认分身（兜底）", content: FALLBACK_AVATAR, source: "(内置默认)", exists: false };
}

/** 当前激活分身（persona 注入用） */
export function getActiveAvatar(): AvatarContent {
  return getAvatarContent();
}

export function setActiveAvatar(avatarId: string): { ok: boolean; message: string } {
  const list = listAvatars();
  if (!list.find((a) => a.id === avatarId)) return { ok: false, message: "分身不存在" };
  writeState({ active_id: avatarId });
  return { ok: true, message: "已激活" };
}

export function createAvatar(input: { name: string; title?: string; content?: string }): AvatarInfo {
  ensureDefaultAvatar();
  const id = genId("avatar");
  const name = input.name.trim() || "未命名分身";
  const content = input.content?.trim() || `# 专家分身：${name}\n\n- 方法论：（待本人校准）\n- 边界：不做诊断、不替代面诊、不给药`;
  fs.writeFileSync(`${avatarsDir()}\\${id}.md`, `# 专家分身：${name}\n\n${content.replace(/^#\s*.*\n/, "")}`, "utf-8");
  return { id, name, title: `专家分身：${name}`, active: false, exists: true, size: content.length };
}

// === 分身创建向导（M5a，对标 LearnBuddy 5 步链路）===

export interface AvatarDraftResult {
  ok: boolean;
  engine: "llm" | "template";
  draft: string;
  model?: string;
  error?: string;
}

const DRAFT_PROMPT = `你是营养Buddy的分身起草助手。请从下面的专家素材中提炼出一份"专家分身提示词草稿"，供专家本人校准。

严格输出以下 markdown 结构（不要输出其他内容）：
# 专家分身：（从素材推断的专家称呼）
- 原型：（资历、机构、专长领域，仅基于素材事实，不编造）
- 方法论：（提炼 3-5 条核心工作方法/决策思路，按重要性排序）
- 决策框架：（面对复杂营养问题的思考步骤，如：评估→定位→干预→随访）
- 语言风格：（沟通语气与表达特点，含对不同受众的差异）
- 边界：（职业边界与安全底线；若无素材依据，按临床营养通用边界填写）

要求：
1. 只从素材中提炼，素材没有的信息标注"（素材未提及，待校准）"
2. 草稿末尾单独一行注明素材来源清单
3. 这是草稿，最终以专家本人校准为准`;

/** 从素材起草分身（AI 提炼；无 key 时返回结构化模板草稿，诚实标注） */
export async function draftAvatarFromMaterials(input: {
  name?: string;
  materials: { filename?: string; content: string }[];
}): Promise<AvatarDraftResult> {
  const named = (input.materials || []).filter((m) => m.content?.trim());
  if (named.length === 0) {
    return { ok: false, engine: "template", draft: "", error: "未提供任何素材" };
  }
  const materialText = named
    .map((m, i) => `【素材${i + 1}${m.filename ? "：" + m.filename : ""}】\n${m.content.trim().slice(0, 6000)}`)
    .join("\n\n");

  const { callChat } = await import("./model-router");
  const nameHint = input.name?.trim() ? `（专家称呼建议：${input.name.trim()}）` : "";
  const result = await callChat("main", [
    { role: "system", content: DRAFT_PROMPT },
    { role: "user", content: `${nameHint}\n\n${materialText}` },
  ], { temperature: 0.3, maxTokens: 2048 });

  if (result.status === "ok" && result.content) {
    const draft = `${result.content}\n\n> 起草方式：AI 提炼（模型 ${result.model}${result.fallback ? "，主模型路由" : ""}）· 状态：**待本人校准**，校准确认前不作为正式分身`;
    return { ok: true, engine: "llm", draft, model: result.model };
  }
  // 无 key / 调用失败：返回结构化模板（含素材来源），本人可手工填写 —— 离线也能走完向导
  const sourceList = named.map((m, i) => `- 素材${i + 1}${m.filename ? "：" + m.filename : ""}`).join("\n");
  const template = `# 专家分身：${input.name?.trim() || "（待命名）"}

- 原型：（素材未提及，待校准）
- 方法论：（素材未提及，待校准）
- 决策框架：评估 → 定位 → 干预 → 随访（通用骨架，请按本人实践修改）
- 语言风格：（素材未提及，待校准）
- 边界：不做医学诊断、不推荐药物、不替代面诊；急重症立即建议就医；数据不编造

> 起草方式：离线模板（${result.status === "missing_key" ? "未配置 API Key" : "模型调用失败：" + (result.error || "")}）· 状态：**待本人校准**
> 素材来源：\n${sourceList}`;
  return { ok: true, engine: "template", draft: template, error: result.error };
}

// === 校准回流补丁 ===

export function listPatches(avatarId?: string): AvatarPatch[] {
  try {
    const raw = fs.readFileSync(patchesFile(), "utf-8");
    const all = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as AvatarPatch);
    return avatarId ? all.filter((p) => p.avatar_id === avatarId) : all;
  } catch {
    return [];
  }
}

export function addPatch(input: {
  avatar_id?: string;
  source: AvatarPatch["source"];
  ref_id?: string;
  decision?: string;
  experience: string;
}): AvatarPatch {
  const patch: AvatarPatch = {
    patch_id: genId("patch"),
    avatar_id: input.avatar_id || readState().active_id,
    source: input.source,
    ref_id: input.ref_id || "",
    decision: input.decision || "",
    experience: input.experience.trim(),
    status: "proposed",
    created_at: new Date().toISOString(),
  };
  ensureDir(avatarsDir());
  fs.appendFileSync(patchesFile(), JSON.stringify(patch) + "\n", "utf-8");
  return patch;
}

/**
 * 补丁状态机推进（唯一合法入口）：
 *   proposed → reviewed | rejected
 *   reviewed → applied | rejected
 *   applied / rejected 为终态
 * apply = 把经验补丁追加进分身 md（显式留痕），绝非静默改写。
 */
export function advancePatch(patchId: string, action: "review" | "apply" | "reject"): { ok: boolean; message: string } {
  const patches = listPatches();
  const patch = patches.find((p) => p.patch_id === patchId);
  if (!patch) return { ok: false, message: "补丁不存在" };

  const legal: Record<PatchStatus, Partial<Record<typeof action, PatchStatus>>> = {
    proposed: { review: "reviewed", reject: "rejected" },
    reviewed: { apply: "applied", reject: "rejected" },
    applied: {},
    rejected: {},
  };
  const next = legal[patch.status][action];
  if (!next) return { ok: false, message: `非法跃迁：${patch.status} → ${action}` };

  if (next === "applied") {
    const file = `${avatarsDir()}\\${patch.avatar_id}.md`;
    const stamp = new Date().toISOString().slice(0, 10);
    const addition = `\n\n## 经验补丁 ${stamp}（来源：${patch.source}${patch.ref_id ? " " + patch.ref_id : ""}）\n\n${patch.experience}\n`;
    fs.appendFileSync(file, addition, "utf-8");
  }

  patch.status = next;
  patch.resolved_at = new Date().toISOString();
  const rest = patches.filter((p) => p.patch_id !== patchId);
  fs.writeFileSync(patchesFile(), [...rest, patch].map((p) => JSON.stringify(p)).join("\n") + "\n", "utf-8");
  return { ok: true, message: `已${next === "applied" ? "采纳并写入分身" : next === "reviewed" ? "进入复核" : "驳回"}` };
}
