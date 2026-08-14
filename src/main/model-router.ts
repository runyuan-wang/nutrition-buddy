/**
 * 多模型路由层（M1a）— 契约继承自长生工作台五路 adapter 设计
 *
 * 铁律（长生 §6.5）：
 *  - key 只存主进程设置，目录/会诊产物只记录 provider_id/model/status，从不记录 key 值
 *  - 无 key → missing_key，绝不外呼
 *  - 统一 OpenAI-compatible Chat Completions 契约
 */
import OpenAI from "openai";
import { getSettings } from "./settings";

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  status: "configured" | "missing_key";
}

/** 预置 provider 目录（不含 key）。main = 设置页的主模型配置 */
export const PROVIDER_PRESETS: { id: string; label: string; baseURL: string; model: string }[] = [
  { id: "main", label: "主模型（设置页配置）", baseURL: "", model: "" },
  { id: "kimi", label: "Kimi / Moonshot", baseURL: "https://api.moonshot.cn/v1", model: "kimi-k2.5" },
  { id: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "zhipu", label: "智谱 GLM", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "qwen", label: "通义千问 Qwen", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "openai", label: "OpenAI GPT", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
];

/** provider 目录（给前端选择用，不含 key） */
export function getProviderCatalog(): ProviderCatalogEntry[] {
  const s = getSettings();
  return PROVIDER_PRESETS.map((p) => {
    if (p.id === "main") {
      return {
        id: "main",
        label: p.label,
        baseURL: s.baseURL,
        model: s.model,
        status: s.apiKey ? "configured" : "missing_key",
      };
    }
    const saved = s.providers?.[p.id];
    return {
      id: p.id,
      label: p.label,
      baseURL: saved?.baseURL || p.baseURL,
      model: saved?.model || p.model,
      status: saved?.apiKey ? "configured" : "missing_key",
    };
  });
}

export interface ResolvedProvider {
  id: string;
  baseURL: string;
  model: string;
  apiKey: string;
  status: "configured" | "missing_key";
}

/** 解析 provider 配置：main 走设置主配置，其余走 providers[id]，未配置回退 main */
export function resolveProvider(providerId: string): ResolvedProvider {
  const s = getSettings();
  if (providerId === "main" || !providerId) {
    return {
      id: "main",
      baseURL: s.baseURL,
      model: s.model,
      apiKey: s.apiKey,
      status: s.apiKey ? "configured" : "missing_key",
    };
  }
  const saved = s.providers?.[providerId];
  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
  if (saved?.apiKey) {
    return {
      id: providerId,
      baseURL: saved.baseURL || preset?.baseURL || s.baseURL,
      model: saved.model || preset?.model || s.model,
      apiKey: saved.apiKey,
      status: "configured",
    };
  }
  // 未配置 key：回退主模型（会诊意见里会标注 fallback）
  return {
    id: providerId,
    baseURL: s.baseURL,
    model: s.model,
    apiKey: s.apiKey,
    status: s.apiKey ? "configured" : "missing_key",
  };
}

export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CallResult {
  status: "ok" | "missing_key" | "failed";
  content: string;
  model?: string;
  usedProvider?: string;
  fallback?: boolean;
  error?: string;
}

/**
 * 非流式单轮调用（会诊征询用）。
 * provider 未配 key 时回退主模型；主模型也无 key → missing_key，绝不外呼。
 */
export async function callChat(
  providerId: string,
  messages: ChatMsg[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<CallResult> {
  const resolved = resolveProvider(providerId);
  let target = resolved;
  let fallback = false;
  if (resolved.status === "missing_key") {
    // 该 provider 未配 key → 回退主模型
    const main = resolveProvider("main");
    if (main.status === "missing_key") {
      return { status: "missing_key", content: "", error: "未配置任何模型 API Key" };
    }
    target = main;
    fallback = providerId !== "main";
  }

  try {
    const client = new OpenAI({ apiKey: target.apiKey, baseURL: target.baseURL });
    const resp = await client.chat.completions.create({
      model: target.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 2048,
    });
    const content = resp.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      status: "ok",
      content,
      model: target.model,
      usedProvider: target.id,
      fallback,
    };
  } catch (err) {
    const e = err as { message?: string };
    return { status: "failed", content: "", model: target.model, usedProvider: target.id, fallback, error: e.message || "调用失败" };
  }
}
