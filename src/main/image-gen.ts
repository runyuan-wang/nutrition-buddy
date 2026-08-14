/**
 * 图像生成模块（M7b 宣教图工作台）
 *
 * 营养师出图的真实场景：给用户做食养宣教材料——
 *   食谱卡片 / 科普海报 / 一周食谱总览 / 误区提醒 / 自由创作
 *
 * 设计原则（长生范式）：
 *   - 模板 prompt 确定性拼接，可审计、无黑盒
 *   - 图像服务 OpenAI 兼容 /images/generations，key 只存主进程
 *   - 未配置 key 明确报错，绝不外呼（fail-closed）
 *   - 产物落盘 data/images/*.png，本地可审计
 */
import fs from "fs";
import path from "path";
import { dataDir, genId, ensureDir } from "./data-dir";
import { getSettings } from "./settings";
import { callChat } from "./model-router";

export type PosterTemplate = "recipe_card" | "science_poster" | "weekly_plan" | "myth_buster" | "free";

export interface PosterInput {
  template: PosterTemplate;
  /** 标题（free 模板下即完整描述） */
  title: string;
  /** 要点（每行一条） */
  points: string;
  /** 目标人群，如 "2型糖尿病中老年用户" */
  audience?: string;
  /** 视觉风格 */
  style?: string;
}

export interface ImageResult {
  ok: boolean;
  message: string;
  id?: string;
  /** 本地绝对路径 */
  path?: string;
  /** data:image/png;base64,...（渲染端直接 <img>） */
  dataUrl?: string;
  /** 使用的最终 prompt（可审计） */
  prompt?: string;
  createdAt?: string;
}

/** 模板定义：每种宣教材料的确定性 prompt 骨架 */
const TEMPLATE_META: Record<PosterTemplate, { label: string; instruction: string }> = {
  recipe_card: {
    label: "今日食谱卡片",
    instruction:
      "一张精美的竖版今日食谱卡片，用于营养师发给用户。中央大字标题，下方整齐排列今日三餐菜品与份量，底部一行小字标注总能量。配色明快、留白充足、有食欲，整体像专业营养工作室出品。",
  },
  science_poster: {
    label: "营养科普海报",
    instruction:
      "一张面向大众的营养科普海报，信息层级清晰：醒目主标题、2-4 条要点短句配简洁图标或小插画、底部一行行动建议。画面干净现代，适合张贴或转发朋友圈。",
  },
  weekly_plan: {
    label: "一周食谱总览",
    instruction:
      "一张横向的一周食谱总览表格式海报，7 列对应周一到周日，行对应早/中/晚餐，格子内菜品名简洁可读，顶部大标题。像专业营养科定制的一周餐单，整洁优雅。",
  },
  myth_buster: {
    label: "食养误区提醒",
    instruction:
      "一张对比式科普卡片：左侧 ❌ 误区说法，右侧 ✅ 正确做法，中间清晰分隔。警示但不吓人，暖色调，底部一句鼓励的话，适合发给老年用户。",
  },
  free: {
    label: "自由创作",
    instruction: "根据描述创作",
  },
};

export const POSTER_TEMPLATES = (Object.keys(TEMPLATE_META) as PosterTemplate[]).map((k) => ({
  id: k,
  label: TEMPLATE_META[k].label,
}));

const DEFAULT_STYLE = "清新扁平插画风格，柔和自然色调，专业营养宣教质感，无错别字";

/** 确定性 prompt 构建（可审计：同一输入必得同一 prompt） */
export function buildPosterPrompt(input: PosterInput): string {
  const meta = TEMPLATE_META[input.template] ?? TEMPLATE_META.free;
  const points = (input.points || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const parts: string[] = [];
  parts.push(meta.instruction);
  parts.push(`主标题：「${input.title.trim()}」`);
  if (input.audience?.trim()) parts.push(`目标人群：${input.audience.trim()}（图文亲切易懂，避免术语）`);
  if (points.length) parts.push(`内容要点（按顺序呈现）：\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
  parts.push(`画面风格：${(input.style || "").trim() || DEFAULT_STYLE}`);
  parts.push("中文排版正确、清晰可读。");
  return parts.join("\n");
}

function imagesDir(): string {
  const dir = dataDir("images");
  ensureDir(dir);
  return dir;
}

/** 调用 OpenAI 兼容 /images/generations 出图并存盘 */
export async function generateImage(prompt: string): Promise<ImageResult> {
  const promptClean = (prompt || "").trim();
  if (!promptClean) return { ok: false, message: "prompt 不能为空" };
  const cfg = getSettings().imageGen;
  if (!cfg || !cfg.apiKey || !cfg.baseURL || !cfg.model) {
    return { ok: false, message: "图像生成未配置：请在 设置 → 图像生成 填写服务商、API Key 与模型" };
  }

  let json: any;
  try {
    const resp = await fetch(cfg.baseURL.replace(/\/$/, "") + "/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, prompt: promptClean, size: cfg.size || "1024x1024" }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, message: `图像服务返回 ${resp.status}：${text.slice(0, 200)}` };
    }
    json = JSON.parse(text);
  } catch (err: any) {
    return { ok: false, message: `图像服务请求失败：${String(err?.message || err).slice(0, 200)}` };
  }

  const item = json?.data?.[0];
  let base64 = "";
  if (typeof item?.b64_json === "string" && item.b64_json) {
    base64 = item.b64_json;
  } else if (typeof item?.url === "string" && item.url) {
    try {
      const imgResp = await fetch(item.url);
      if (!imgResp.ok) return { ok: false, message: `下载图片失败：HTTP ${imgResp.status}` };
      base64 = Buffer.from(await imgResp.arrayBuffer()).toString("base64");
    } catch (err: any) {
      return { ok: false, message: `下载图片失败：${String(err?.message || err).slice(0, 160)}` };
    }
  } else {
    return { ok: false, message: "图像服务响应中未找到 b64_json 或 url" };
  }

  const id = genId("img");
  const file = path.join(imagesDir(), id + ".png");
  fs.writeFileSync(file, Buffer.from(base64, "base64"));
  return {
    ok: true,
    message: "生成成功",
    id,
    path: file,
    dataUrl: `data:image/png;base64,${base64}`,
    prompt: promptClean,
    createdAt: new Date().toISOString(),
  };
}

export interface ImageMeta {
  id: string;
  path: string;
  dataUrl: string;
  createdAt: string;
}

/** 最近生成列表（新→旧） */
export function listImages(limit = 12): ImageMeta[] {
  const dir = imagesDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
  return files.map(({ f, mtime }) => {
    const base64 = fs.readFileSync(path.join(dir, f)).toString("base64");
    return {
      id: f.replace(/\.png$/, ""),
      path: path.join(dir, f),
      dataUrl: `data:image/png;base64,${base64}`,
      createdAt: new Date(mtime).toISOString(),
    };
  });
}

/** 宣教图入口：模板 → prompt → 出图 */
export async function generatePoster(input: PosterInput): Promise<ImageResult> {
  const prompt = buildPosterPrompt(input);
  const result = await generateImage(prompt);
  return { ...result, prompt };
}

export interface DraftCopyResult {
  ok: boolean;
  message: string;
  title?: string;
  points?: string[];
}

/** AI 起草宣教文案：主题 → 标题 + 要点（营养师校准后再生图） */
export async function draftPosterCopy(topic: string, audience?: string, template?: PosterTemplate): Promise<DraftCopyResult> {
  const t = (topic || "").trim();
  if (!t) return { ok: false, message: "请先填写宣教主题" };
  const meta = template ? TEMPLATE_META[template] : undefined;
  const system =
    "你是资深临床营养宣教专家，擅长把专业食养建议写成大众爱看的宣教文案。只输出 JSON，不要任何其他文字。";
  const user = `宣教主题：${t}\n目标人群：${audience?.trim() || "一般人群"}\n材料类型：${meta?.label || "营养科普海报"}\n\n请起草：一个 12 字以内的吸引人标题，和 3-5 条每条 20 字以内的要点短句（口语化、可执行、不吓人）。\n输出格式：{"title":"...","points":["...","..."]}`;
  const r = await callChat("main", [
    { role: "system", content: system },
    { role: "user", content: user },
  ], { temperature: 0.6, maxTokens: 512 });
  if (r.status !== "ok") return { ok: false, message: `文案起草失败：${r.error || r.status}` };
  try {
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, message: "模型未返回 JSON，请重试或手填文案" };
    const parsed = JSON.parse(m[0]);
    const title = String(parsed.title || "").trim();
    const points = Array.isArray(parsed.points) ? parsed.points.map((p: unknown) => String(p).trim()).filter(Boolean) : [];
    if (!title || !points.length) return { ok: false, message: "返回内容不完整，请重试或手填文案" };
    return { ok: true, message: "起草完成，请校准后生成", title, points };
  } catch {
    return { ok: false, message: "解析模型输出失败，请重试或手填文案" };
  }
}
