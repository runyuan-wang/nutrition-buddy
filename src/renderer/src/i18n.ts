/**
 * 营养Buddy 国际化 (i18n) — 轻量双语支持
 * 语言：zh-CN（默认）/ en
 * 偏好持久化：localStorage
 */
import { useEffect, useState } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "nutrition-buddy-lang";

/** 从 localStorage 读取语言，无则默认中文 */
export function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return "zh";
}

/** 语言字典 */
const dict = {
  // 侧边栏
  appName: { zh: "营养Buddy", en: "NutritionBuddy" },
  features: { zh: "功能", en: "Features" },
  navChat: { zh: "对话", en: "Chat" },
  navKnowledge: { zh: "食物查询", en: "Food Lookup" },
  navLipid: { zh: "血脂工作台", en: "Lipid Workbench" },
  navGlucose: { zh: "控糖工作台", en: "Glucose Workbench" },
  navChild: { zh: "儿童肥胖", en: "Child Obesity" },
  navGuides: { zh: "指南库", en: "Guide Library" },
  navConsult: { zh: "多智能体会诊", en: "Multi-Agent Consult" },
  navMemory: { zh: "记忆库", en: "Memory" },
  navSkills: { zh: "技能库", en: "Skills" },
  navPoster: { zh: "宣教图工作台", en: "Poster Studio" },
  footerLine1: { zh: "营小养 v0.2 · 王润圆制作", en: "YingXiaoYang v0.2 · by Wang Runyuan" },
  footerLine2: {
    zh: "非医疗器械 · 仅供专业人员参考",
    en: "Not a medical device · For professionals only",
  },
  langLabel: { zh: "语言 / Language", en: "Language / 语言" },

  // 对话区
  chatTitle: { zh: "💬 营小养对话", en: "💬 Chat with YingXiaoYang" },
  statusThinking: { zh: "正在思考...", en: "Thinking..." },
  statusReady: { zh: "就绪", en: "Ready" },
  emptyTitle: { zh: "你好，我是营小养", en: "Hi, I'm YingXiaoYang" },
  emptyDesc: {
    zh: "你的临床营养AI助手。可以问我食物成分、GI值、营养风险评估、食养方案等问题。",
    en: "Your clinical nutrition AI assistant. Ask me about food composition, GI values, nutrition risk screening, and dietary guidance.",
  },
  inputPlaceholder: {
    zh: "输入你的营养问题... (Enter发送, Shift+Enter换行)",
    en: "Type your nutrition question... (Enter to send, Shift+Enter for newline)",
  },
  send: { zh: "发送", en: "Send" },
  errorPrefix: { zh: "❌ 出错了：", en: "❌ Error: " },
  errorSuffix: {
    zh: "\n\n请检查 .env 文件是否配置了 API Key",
    en: "\n\nPlease check your API Key in the .env file",
  },

  // 建议问题
  suggestion1: { zh: "米饭的GI值是多少？", en: "What is the GI value of rice?" },
  suggestion2: { zh: "帮我搜索含有'燕麦'的食物", en: "Search for foods containing 'oats'" },
  suggestion3: {
    zh: "NRS-2002营养风险筛查怎么做？",
    en: "How to perform NRS-2002 nutrition risk screening?",
  },
  suggestion4: { zh: "高脂血症人群怎么吃？", en: "Dietary advice for hyperlipidemia?" },

  // 知识库面板
  kbTitle: { zh: "📖 食物成分查询", en: "📖 Food Composition Lookup" },
  kbPlaceholder: {
    zh: "搜索食物名称，如'米饭'、'燕麦'...",
    en: "Search food by name, e.g. 'rice', 'oats'...",
  },
  search: { zh: "搜索", en: "Search" },
  foundPrefix: { zh: "找到 ", en: "Found " },
  foundSuffix: { zh: " 个结果，点击查看GI值：", en: " result(s). Click to view GI value:" },
  metaCode: { zh: "编码", en: "Code" },
  metaCategory: { zh: "分类", en: "Category" },
  kbEmptyTitle: { zh: "搜索食物", en: "Search Foods" },
  kbEmptyDesc: {
    zh: "输入食物名称关键词，查询编码和GI值",
    en: "Enter a food name keyword to look up its code and GI value",
  },
  giLevelLow: { zh: "低GI", en: "Low GI" },
  giLevelMedium: { zh: "中GI", en: "Medium GI" },
  giLevelHigh: { zh: "高GI", en: "High GI" },
  giBadge: { zh: "GI=", en: "GI=" },

  // 设置面板
  navSettings: { zh: "⚙️ 设置", en: "⚙️ Settings" },
  settingsTitle: { zh: "⚙️ 设置", en: "⚙️ Settings" },
  settingsDesc: {
    zh: "在这里填写你的 LLM API 配置，保存后立即生效，无需修改任何文件。",
    en: "Configure your LLM API here. Changes apply immediately — no file editing needed.",
  },
  apiKeyLabel: { zh: "API Key", en: "API Key" },
  apiKeyPlaceholder: { zh: "sk- 粘贴你的 API Key", en: "sk- paste your API Key" },
  apiKeyHelp: {
    zh: "从 platform.moonshot.cn 获取（Kimi / Moonshot）",
    en: "Get it from platform.moonshot.cn (Kimi / Moonshot)",
  },
  baseUrlLabel: { zh: "接口地址 (Base URL)", en: "Base URL" },
  baseUrlPlaceholder: { zh: "https://api.moonshot.cn/v1", en: "https://api.moonshot.cn/v1" },
  modelLabel: { zh: "模型 (Model)", en: "Model" },
  modelPlaceholder: { zh: "kimi-k3", en: "kimi-k3" },
  modelHelp: {
    zh: "常用：kimi-k3（旗舰）/ kimi-k2.5（更省）/ deepseek-chat",
    en: "Common: kimi-k3 (flagship) / kimi-k2.5 (cheaper) / deepseek-chat",
  },
  showKey: { zh: "显示", en: "Show" },
  hideKey: { zh: "隐藏", en: "Hide" },
  saveSettings: { zh: "保存配置", en: "Save Settings" },
  savedOk: { zh: "✅ 配置已保存并生效", en: "✅ Settings saved & applied" },
  savedFail: { zh: "❌ 保存失败：", en: "❌ Save failed: " },
  testConnection: { zh: "🔍 测试连接", en: "🔍 Test Connection" },
  testing: { zh: "测试中...", en: "Testing..." },
  testOk: { zh: "✅ 连接成功！模型可用。", en: "✅ Connection OK! Model is ready." },
  testFail: { zh: "❌ 连接失败：", en: "❌ Connection failed: " },
  noKeyWarning: { zh: "⚠️ 请先填写 API Key", en: "⚠️ Please fill in your API Key first" },
  settingsNote: {
    zh: "💡 配置仅保存在本机，不会上传。食物查询功能无需 API Key，可直接使用。",
    en: "💡 Settings are stored locally only. Food lookup works without an API Key.",
  },
  presetLabel: { zh: "快速选择模型", en: "Quick model presets" },
  presetPlaceholder: { zh: "选择常见模型自动填充...", en: "Pick a common model to autofill..." },
  presetHint: {
    zh: "选择后会填充接口地址和模型名，再填入对应的 API Key 即可",
    en: "Picking a preset fills Base URL and Model. Then just paste the matching API Key.",
  },
  customModel: { zh: "自定义（手动填写）", en: "Custom (manual)" },
} as const;

export type DictKey = keyof typeof dict;

/** 翻译函数：t("navChat") 返回当前语言的文案 */
export function translate(key: DictKey, lang: Lang): string {
  return dict[key][lang];
}

/** React Hook：语言状态 + 切换 */
export function useLang() {
  const [lang, setLang] = useState<Lang>(getInitialLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const toggle = () => setLang((l) => (l === "zh" ? "en" : "zh"));

  return { lang, setLang, toggle, t: (key: DictKey) => translate(key, lang) };
}
