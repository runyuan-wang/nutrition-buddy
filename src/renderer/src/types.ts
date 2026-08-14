/**
 * IPC API类型定义 — 渲染进程调用的接口
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface FoodItem {
  code: string;
  name: string;
  category: string;
}

export interface GIItem {
  food_name: string;
  value: number;
  level: string;
  category: string;
}

export interface AppSettings {
  apiKey: string;
  baseURL: string;
  model: string;
  providers?: Record<string, { apiKey: string; baseURL: string; model: string }>;
  wechatBot?: WeChatBotSettings;
  imageGen?: ImageGenSettings;
}

/** 微信 Bot 连接配置（M6） */
export interface WeChatBotSettings {
  enabled: boolean;
  type: "wecom_webhook" | "serverchan";
  webhook: string;
  sendkey: string;
}

/** 图像生成配置（M7b 宣教图工作台） */
export interface ImageGenSettings {
  provider: "zhipu" | "openai" | "custom";
  apiKey: string;
  baseURL: string;
  model: string;
  size: string;
}

/** 图像生成预设（与主进程 IMAGE_GEN_PRESETS 对应） */
export const IMAGE_PRESETS: { id: ImageGenSettings["provider"]; label: string; baseURL: string; model: string }[] = [
  { id: "zhipu", label: "智谱 CogView-4（国内直连）", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "cogview-4" },
  { id: "openai", label: "OpenAI DALL·E 3（需境外网络）", baseURL: "https://api.openai.com/v1", model: "dall-e-3" },
  { id: "custom", label: "自定义兼容端点", baseURL: "", model: "" },
];

// === 多对话会话（M6）===

export interface StoredMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatSessionData {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: StoredMessage[];
}

// === 多智能体会诊（M1）===

export interface AgentDef {
  agent_id: string;
  name: string;
  persona: string;
  guides: string[];
  provider_id: string;
  temperature: number;
  role: "specialist" | "moderator";
  enabled: boolean;
  builtin: boolean;
}

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  status: "configured" | "missing_key";
}

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

export interface ConsultMeta {
  consult_id: string;
  created_at: string;
  question: string;
  engine: string;
  agent_count: number;
  has_review: boolean;
}

// === 记忆系统（M2）===

export interface UserProfile {
  id: string;
  name: string;
  is_default: boolean;
  age?: number;
  sex?: string;
  height?: number;
  weight?: number;
  conditions: string[];
  allergies: string[];
  labs: Record<string, string>;
  diet_habits?: string;
  goals: string[];
  notes?: string;
  updated_at: string;
}

export interface MemoryFact {
  id: string;
  profile_id: string | null;
  content: string;
  source: "manual" | "consult" | "chat";
  created_at: string;
}

// === Skill 生态（M3）===

export interface SkillEntry {
  skill_id: string;
  name: string;
  type: "guide" | "tool" | "workbench" | "custom";
  source: string;
  applicable_population: string[];
  contraindication_boundary: string;
  evidence_level: string;
  version_date: string;
  enabled: boolean;
  builtin: boolean;
}

// === 专家分身（M4）===

export interface AvatarInfo {
  id: string;
  name: string;
  title: string;
  active: boolean;
  exists: boolean;
  size: number;
}

export interface AvatarPatch {
  patch_id: string;
  avatar_id: string;
  source: "consult" | "chat" | "manual";
  ref_id: string;
  decision: string;
  experience: string;
  status: "proposed" | "reviewed" | "applied" | "rejected";
  created_at: string;
  resolved_at?: string;
}

export interface NutritionAPI {
  /** 流式对话 */
  chatStream: (
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: string) => void
  ) => void;

  /** 搜索食物 */
  searchFood: (keyword: string) => Promise<FoodItem[]>;

  /** 查询GI */
  queryGI: (foodName: string) => Promise<GIItem | null>;

  /** 获取数据库统计 */
  getStats: () => Promise<{ foodCount: number; giCount: number }>;

  /** 按GI等级筛选食物 */
  getFoodsByGILevel: (level: "低GI" | "中GI" | "高GI") => Promise<GIItem[]>;

  /** 按大类浏览食物 */
  getFoodsByClass: (classCode: string) => Promise<FoodItem[]>;

  /** GI等级分布统计 */
  getGIStats: () => Promise<{ level: string; count: number }[]>;

  /** 读取设置 */
  getSettings: () => Promise<AppSettings>;

  /** 保存设置 */
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;

  /** 测试 LLM 连接（最简请求，任意 OpenAI 兼容端点通用） */
  testConnection: (settings: AppSettings) => Promise<{ ok: boolean; message: string }>;

  /** 专家分身 */
  getExpertAvatar: () => Promise<{ name: string; title: string; content: string; source: string; exists: boolean }>;

  // 多智能体会诊（M1）
  agentsList: () => Promise<AgentDef[]>;
  agentsSave: (agent: Partial<AgentDef>) => Promise<AgentDef>;
  agentsDelete: (agentId: string) => Promise<{ ok: boolean; message: string }>;
  agentsReset: () => Promise<AgentDef[]>;
  providersCatalog: () => Promise<ProviderCatalogEntry[]>;
  consultRun: (req: { profile_id?: string; profile_summary?: string; question: string; agent_ids?: string[]; engine?: "llm" | "mock" | "auto" }) => Promise<ConsultResult>;
  consultList: () => Promise<ConsultMeta[]>;
  consultGet: (id: string) => Promise<ConsultResult | null>;
  consultReview: (id: string, review: { decision: "adopt" | "reject" | "adopt_with_modification"; rationale: string; experience?: string }) => Promise<{ ok: boolean; message: string; patch_id?: string }>;

  // 记忆系统（M2）
  profilesList: () => Promise<UserProfile[]>;
  profilesSave: (p: Partial<UserProfile>) => Promise<UserProfile>;
  profilesDelete: (id: string) => Promise<{ ok: boolean }>;
  memoryList: (profileId?: string) => Promise<MemoryFact[]>;
  memoryAdd: (m: { content: string; profile_id?: string | null }) => Promise<MemoryFact>;
  memoryDelete: (id: string) => Promise<{ ok: boolean }>;

  // Skill 生态（M3）
  skillsList: () => Promise<SkillEntry[]>;
  skillsToggle: (id: string, enabled: boolean) => Promise<SkillEntry | null>;
  skillsImport: (s: { name: string; content: string; population?: string[]; boundary?: string; evidence?: string; version?: string }) => Promise<SkillEntry>;
  skillsContent: (id: string) => Promise<{ name: string; content: string } | null>;
  skillsUpdate: (id: string, s: { name: string; content: string; population?: string[]; boundary?: string; evidence?: string; version?: string }) => Promise<SkillEntry | null>;
  skillsDelete: (id: string) => Promise<{ ok: boolean; message: string }>;
  skillsExport: (id: string) => Promise<{ ok: boolean; bundle?: SkillBundle; message: string }>;
  skillsImportBundle: (b: SkillBundle, overwriteId?: string) => Promise<{ ok: boolean; entry?: SkillEntry; message: string }>;

  // 专家分身（M4 + M5a 创建向导）
  avatarsList: () => Promise<AvatarInfo[]>;
  avatarsCatalog: () => Promise<{ id: string; name: string; title: string; active: boolean }[]>;
  avatarsActivate: (id: string) => Promise<{ ok: boolean; message: string }>;
  avatarsCreate: (a: { name: string; title?: string; content?: string }) => Promise<AvatarInfo>;
  avatarsDraft: (input: { name?: string; materials: { filename?: string; content: string }[] }) => Promise<AvatarDraftResult>;
  patchesList: (avatarId?: string) => Promise<AvatarPatch[]>;
  patchesAdvance: (id: string, action: "review" | "apply" | "reject") => Promise<{ ok: boolean; message: string }>;

  // 多对话会话（M6）
  chatsList: () => Promise<ChatMeta[]>;
  chatsCreate: (title?: string) => Promise<ChatSessionData>;
  chatsGet: (id: string) => Promise<ChatSessionData | null>;
  chatsRename: (id: string, title: string) => Promise<ChatMeta | null>;
  chatsDelete: (id: string) => Promise<{ ok: boolean }>;
  chatsAppend: (id: string, msgs: StoredMessage[]) => Promise<ChatSessionData | null>;
  onMenuNewChat: (cb: () => void) => () => void;

  // 微信 Bot 连接（M6）
  wechatTest: () => Promise<{ ok: boolean; message: string }>;
  wechatSend: (title: string, markdown: string) => Promise<{ ok: boolean; message: string }>;

  // 宣教图工作台（M7b）
  posterGenerate: (input: PosterInput) => Promise<PosterImageResult>;
  posterList: (limit?: number) => Promise<PosterImageMeta[]>;
  posterDraft: (topic: string, audience?: string, template?: PosterTemplateId) => Promise<PosterDraftResult>;
}

export type PosterTemplateId = "recipe_card" | "science_poster" | "weekly_plan" | "myth_buster" | "free";

export interface PosterInput {
  template: PosterTemplateId;
  title: string;
  points: string;
  audience?: string;
  style?: string;
}

export interface PosterImageResult {
  ok: boolean;
  message: string;
  id?: string;
  path?: string;
  dataUrl?: string;
  prompt?: string;
  createdAt?: string;
}

export interface PosterImageMeta {
  id: string;
  path: string;
  dataUrl: string;
  createdAt: string;
}

export interface PosterDraftResult {
  ok: boolean;
  message: string;
  title?: string;
  points?: string[];
}

/** 技能分享包（M5b，LearnBuddy Skills 共建共享对标） */
export interface SkillBundle {
  bundle_version: number;
  exported_at: string;
  skill: {
    name: string;
    type: "guide" | "tool" | "workbench" | "custom";
    content: string;
    applicable_population: string[];
    contraindication_boundary: string;
    evidence_level: string;
    version_date: string;
  };
}

/** 分身起草结果（M5a，LearnBuddy AI 提炼对标） */
export interface AvatarDraftResult {
  ok: boolean;
  engine: "llm" | "template";
  draft: string;
  model?: string;
  error?: string;
}

declare global {
  interface Window {
    nutrition: NutritionAPI;
  }
}
