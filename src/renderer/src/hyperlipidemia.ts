/**
 * 高脂血症工作台数据层 — 基于《成人高脂血症食养指南（2023年版）》
 * 数据来源：src/renderer/src/data/hyperlipidemia.json
 *
 * 功能：
 *   1. 血脂化验单判断（TC/TG/LDL-C/HDL-C）
 *   2. 症状勾选 → 中医辨证分型
 *   3. 生成个性化食养方案（食药物质 + 食谱 + 茶饮/食养方）
 */
import rawData from "./data/hyperlipidemia.json";

export interface LipidInput {
  TC?: number;   // 总胆固醇 mmol/L
  TG?: number;   // 甘油三酯 mmol/L
  LDL?: number;  // 低密度脂蛋白 mmol/L
  HDL?: number;  // 高密度脂蛋白 mmol/L
}

export interface SyndromeResult {
  name: string;
  matchScore: number;
  matchedSymptoms: string[];
  tongue: string;
  pulse: string;
  key: string;
  foodMatters: string;
  recipes: Record<string, Record<string, string>>;
  formulas: { teas: FormulaItem[]; dishes: FormulaItem[] };
}

export interface FormulaItem {
  name: string;
  materials?: string;
  usage?: string;
  method?: string;
  taboo?: string;
}

export interface LipidLevel {
  item: string;
  value: number;
  level: "normal" | "borderline" | "high" | "low";
  label: string;
}

export const LIPID_DATA = rawData;

/** 血脂单项判断 */
export function judgeLipidItem(key: keyof LipidInput, value: number): LipidLevel {
  const ref = rawData.lipidReference[key];
  let level: LipidLevel["level"] = "normal";
  if (key === "HDL") {
    level = value < 1.0 ? "low" : "normal";
  } else if (key === "TC") {
    if (value >= 6.2) level = "high";
    else if (value >= 5.2) level = "borderline";
  } else if (key === "TG") {
    if (value >= 2.26) level = "high";
    else if (value >= 1.7) level = "borderline";
  } else if (key === "LDL") {
    if (value >= 4.1) level = "high";
    else if (value >= 3.4) level = "borderline";
  }
  return { item: ref.label, value, level, label: ref[level === "low" ? "note" : level] || "" };
}

/** 综合判断血脂异常类型 */
export function summarizeLipid(input: LipidInput): string[] {
  const conclusions: string[] = [];
  const j = (k: keyof LipidInput) => (input[k] ? judgeLipidItem(k, input[k]!) : null);
  const tc = j("TC"), tg = j("TG"), ldl = j("LDL"), hdl = j("HDL");

  if (tc && tc.level !== "normal") conclusions.push(`总胆固醇 ${input.TC}${tc.level === "high" ? "↑↑" : "↑"}（${tc.label}）`);
  if (tg && tg.level !== "normal") conclusions.push(`甘油三酯 ${input.TG}${tg.level === "high" ? "↑↑" : "↑"}（${tg.label}）`);
  if (ldl && ldl.level !== "normal") conclusions.push(`LDL-C ${input.LDL}${ldl.level === "high" ? "↑↑" : "↑"}（${ldl.label}）`);
  if (hdl && hdl.level === "low") conclusions.push(`HDL-C ${input.HDL}↓（偏低，${hdl.label}）`);

  if (conclusions.length === 0) return ["各项血脂指标均在正常范围内"];
  return conclusions;
}

/**
 * 中医辨证分型 — 根据勾选症状匹配 6 种证型
 * 计分规则：命中一个症状 +1，再结合证型核心特征加权
 */
export function syndromeMatch(checkedSymptoms: string[]): SyndromeResult[] {
  const scored = rawData.syndromes.map((s) => {
    const matched = s.symptoms.filter((sym) => checkedSymptoms.includes(sym));
    let score = matched.length;
    // 核心特征加权：命中核心组合症状给额外分
    if (s.name === "痰浊内阻型" && checkedSymptoms.includes("身体肥胖") && checkedSymptoms.includes("肢体沉重感")) score += 2;
    if (s.name === "痰瘀互结型" && (checkedSymptoms.includes("胸刺痛或闷痛") || checkedSymptoms.includes("口唇暗紫"))) score += 2;
    if (s.name === "气滞血瘀型" && (checkedSymptoms.includes("情绪低落或急躁易怒") || checkedSymptoms.includes("喜欢长叹气"))) score += 2;
    if (s.name === "气虚血瘀型" && (checkedSymptoms.includes("气短乏力") || checkedSymptoms.includes("活动后诱发或加重"))) score += 2;
    if (s.name === "肝肾阴虚型" && (checkedSymptoms.includes("头晕耳鸣") || checkedSymptoms.includes("腰酸腿软"))) score += 2;
    if (s.name === "脾虚湿盛型" && (checkedSymptoms.includes("大便不成形或腹泻") || checkedSymptoms.includes("食后腹胀"))) score += 2;
    return { syndrome: s, matched, score };
  });

  const maxScore = Math.max(...scored.map((x) => x.score), 0);
  // 至少命中 1 个症状才给出辨证
  return scored
    .filter((x) => x.matched.length > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => ({
      name: x.syndrome.name,
      matchScore: x.score,
      matchedSymptoms: x.matched,
      tongue: x.syndrome.tongue,
      pulse: x.syndrome.pulse,
      key: x.syndrome.key,
      foodMatters: x.syndrome.foodMatters,
      recipes: x.syndrome.recipes,
      formulas: x.syndrome.formulas,
    }));
}

/** 全部可选症状（去重、保持指南顺序） */
export const ALL_SYMPTOMS: { zheng: string; symptoms: string[] }[] = rawData.syndromes.map((s) => ({
  zheng: s.name,
  symptoms: s.symptoms,
}));
