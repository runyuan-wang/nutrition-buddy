/**
 * 设置存储模块 — API Key / BaseURL / Model 的用户配置
 *
 * 存储位置：Electron userData 目录下的 settings.json
 * 优先级：UI保存的配置 > 环境变量 > 默认值
 *
 * 这样非技术用户可以在应用内填写 Key，无需手动编辑 .env
 */
import { app } from "electron";
import fs from "fs";
import path from "path";

/** 多模型路由的单路配置（会诊引擎用，key 只存主进程，不回显前端列表） */
export interface ProviderSettings {
  apiKey: string;
  baseURL: string;
  model: string;
}

/** 微信 Bot 连接配置（主进程外呼，不回显 key） */
export interface WeChatBotSettings {
  enabled: boolean;
  /** wecom_webhook = 企业微信群机器人；serverchan = Server酱 */
  type: "wecom_webhook" | "serverchan";
  webhook: string;
  sendkey: string;
}

/** 图像生成配置（宣教图工作台用，OpenAI 兼容 images 接口） */
export interface ImageGenSettings {
  /** zhipu = 智谱 CogView；openai = DALL·E；custom = 任意兼容端点 */
  provider: "zhipu" | "openai" | "custom";
  apiKey: string;
  baseURL: string;
  model: string;
  size: string;
}

export interface AppSettings {
  apiKey: string;
  baseURL: string;
  model: string;
  /** 额外模型路由表：providerId → 配置（可选） */
  providers?: Record<string, ProviderSettings>;
  /** 微信 Bot 连接（可选） */
  wechatBot?: WeChatBotSettings;
  /** 图像生成（可选） */
  imageGen?: ImageGenSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  baseURL: "https://api.moonshot.cn/v1",
  model: "kimi-k3",
  providers: {},
  wechatBot: { enabled: false, type: "wecom_webhook", webhook: "", sendkey: "" },
  imageGen: {
    provider: "zhipu",
    apiKey: "",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    model: "cogview-4",
    size: "1024x1024",
  },
};

/** 图像生成预设（供设置面板下拉） */
export const IMAGE_GEN_PRESETS: { id: ImageGenSettings["provider"]; label: string; baseURL: string; model: string; note: string }[] = [
  { id: "zhipu", label: "智谱 CogView-4", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "cogview-4", note: "国内直连，中文理解好" },
  { id: "openai", label: "OpenAI DALL·E 3", baseURL: "https://api.openai.com/v1", model: "dall-e-3", note: "需境外网络" },
  { id: "custom", label: "自定义兼容端点", baseURL: "", model: "", note: "任意 OpenAI 兼容 /images/generations" },
];

function normalizeImageGen(raw: unknown): ImageGenSettings {
  const d = DEFAULT_SETTINGS.imageGen!;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Partial<ImageGenSettings>;
  const preset = IMAGE_GEN_PRESETS.find((p) => p.id === r.provider);
  return {
    provider: preset ? r.provider! : "custom",
    apiKey: (r.apiKey || "").trim(),
    baseURL: (r.baseURL || preset?.baseURL || "").trim(),
    model: (r.model || preset?.model || "").trim(),
    size: (r.size || d.size).trim(),
  };
}

/** 预设模型（OpenAI 兼容）—— 供设置面板下拉选择 */
export interface PresetModel {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  note?: string;
}

export const PRESET_MODELS: PresetModel[] = [
  {
    id: "kimi-k3",
    label: "Kimi K3 (Moonshot 旗舰)",
    baseURL: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    note: "推理强，上下文 1M",
  },
  {
    id: "kimi-k2.5",
    label: "Kimi K2.5 (Moonshot 均衡)",
    baseURL: "https://api.moonshot.cn/v1",
    model: "kimi-k2.5",
    note: "不强制思考，更省 token",
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek V3 (深度求索)",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    note: "性价比高",
  },
  {
    id: "glm-4-flash",
    label: "GLM-4-Flash (智谱 免费)",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    note: "免费额度",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o-mini (OpenAI)",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "需境外网络",
  },
  {
    id: "ollama",
    label: "Ollama 本地 (如 qwen2.5)",
    baseURL: "http://localhost:11434/v1",
    model: "qwen2.5",
    note: "本地免费，需装 Ollama",
  },
];

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

/** 读取设置：UI配置 > 环境变量 > 默认值 */
export function getSettings(): AppSettings {
  // 1. 尝试读取 userData/settings.json（UI 保存的配置）
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf-8");
    const saved = JSON.parse(raw) as Partial<AppSettings>;
    if (saved && typeof saved === "object") {
      return {
        apiKey: saved.apiKey ?? "",
        baseURL: saved.baseURL || DEFAULT_SETTINGS.baseURL,
        model: saved.model || DEFAULT_SETTINGS.model,
        providers: saved.providers && typeof saved.providers === "object" ? saved.providers : {},
        wechatBot:
          saved.wechatBot && typeof saved.wechatBot === "object"
            ? {
                enabled: !!saved.wechatBot.enabled,
                type: saved.wechatBot.type === "serverchan" ? "serverchan" : "wecom_webhook",
                webhook: saved.wechatBot.webhook || "",
                sendkey: saved.wechatBot.sendkey || "",
              }
            : DEFAULT_SETTINGS.wechatBot,
        imageGen: normalizeImageGen(saved.imageGen),
      };
    }
  } catch {
    /* 文件不存在或损坏时走环境变量 */
  }

  // 2. 环境变量（兼容 .env 方式）
  return {
    apiKey: process.env.NUTRITION_BUDDY_LLM_API_KEY || "",
    baseURL:
      process.env.NUTRITION_BUDDY_LLM_BASE_URL || DEFAULT_SETTINGS.baseURL,
    model: process.env.NUTRITION_BUDDY_LLM_MODEL || DEFAULT_SETTINGS.model,
    providers: {},
    wechatBot: DEFAULT_SETTINGS.wechatBot,
    imageGen: DEFAULT_SETTINGS.imageGen,
  };
}

/** 保存设置到 userData/settings.json */
export function saveSettings(settings: AppSettings): AppSettings {
  const normalized: AppSettings = {
    apiKey: (settings.apiKey || "").trim(),
    baseURL: (settings.baseURL || DEFAULT_SETTINGS.baseURL).trim(),
    model: (settings.model || DEFAULT_SETTINGS.model).trim(),
    providers: settings.providers && typeof settings.providers === "object"
      ? settings.providers
      : {},
    wechatBot: settings.wechatBot && typeof settings.wechatBot === "object"
      ? {
          enabled: !!settings.wechatBot.enabled,
          type: settings.wechatBot.type === "serverchan" ? "serverchan" : "wecom_webhook",
          webhook: (settings.wechatBot.webhook || "").trim(),
          sendkey: (settings.wechatBot.sendkey || "").trim(),
        }
      : DEFAULT_SETTINGS.wechatBot,
    imageGen: normalizeImageGen(settings.imageGen),
  };
  try {
    fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2), "utf-8");
  } catch (err) {
    console.error("[settings] 保存失败:", err);
  }
  return normalized;
}
