/**
 * 儿童青少年肥胖工作台数据层 — 基于《儿童青少年肥胖食养指南（2024年版）》
 * 数据来源：src/renderer/src/data/childhood-obesity.json
 *
 * 功能：
 *   1. 儿童 BMI 计算与超重/肥胖判断（WS/T 586-2018 界值）
 *   2. 症状勾选 → 5 证型辨证
 *   3. 食养方案（食药物质 + 地区食谱 + 营养方）
 */
import rawData from "./data/childhood-obesity.json";

export interface ChildInput {
  age?: number;
  sex?: "男" | "女";
  height?: number; // cm
  weight?: number; // kg
}

export interface BMIResult {
  bmi: number;
  status: "normal" | "overweight" | "obesity" | "invalid";
  statusText: string;
}

export interface ChildSyndrome {
  name: string;
  symptoms: string[];
  tongue: string;
  pulse: string;
  key: string;
  foodMatters: string;
  formulas: { name: string; materials: string; method: string; usage: string }[];
}

export interface RegionRecipe {
  name: string;
  meals: Record<string, string>;
}

export const OBESITY_DATA = rawData;

/** 计算儿童 BMI 并判断（WS/T 586-2018） */
export function judgeChildBMI(input: ChildInput): BMIResult {
  if (!input.age || !input.sex || !input.height || !input.weight) {
    return { bmi: 0, status: "invalid", statusText: "" };
  }
  const age = Math.round(input.age);
  const hM = input.height / 100;
  const bmi = input.weight / (hM * hM);
  const table = input.sex === "男" ? rawData.bmiStandard.boys : rawData.bmiStandard.girls;
  const row = table.find((r) => r.age === age) || table[table.length - 1];
  const rounded = Math.round(bmi * 10) / 10;
  if (rounded >= row.obesity) return { bmi: rounded, status: "obesity", statusText: "肥胖" };
  if (rounded >= row.overweight) return { bmi: rounded, status: "overweight", statusText: "超重" };
  return { bmi: rounded, status: "normal", statusText: "正常" };
}

/** 症状 → 证型匹配（计分 + 核心特征加权） */
export function matchChildSyndrome(checked: string[]): (ChildSyndrome & { matchScore: number; matchedSymptoms: string[] })[] {
  const scored = rawData.syndromes.map((s) => {
    const matched = s.symptoms.filter((sym) => checked.includes(sym));
    let score = matched.length;
    // 核心特征加权
    if (s.name === "胃热火郁证" && (checked.includes("多食") || checked.includes("消谷善饥"))) score += 2;
    if (s.name === "痰湿内盛证" && (checked.includes("形体肥胖") && checked.includes("嗜卧懒动"))) score += 2;
    if (s.name === "气郁血瘀证" && (checked.includes("喜太息") || checked.includes("面晦唇暗"))) score += 2;
    if (s.name === "脾虚不运证" && (checked.includes("神疲乏力") || checked.includes("身体困重"))) score += 2;
    if (s.name === "脾肾阳虚证" && (checked.includes("四肢不温") || checked.includes("易于疲劳"))) score += 2;
    return { ...s, matched, score };
  });
  return scored
    .filter((x) => x.matched.length > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => ({ ...x, matchScore: x.score, matchedSymptoms: x.matched }));
}

/** 全部可选症状（去重） */
export const ALL_CHILD_SYMPTOMS: string[] = Array.from(
  new Set(rawData.syndromes.flatMap((s) => s.symptoms))
);

/** 地区列表 */
export const REGIONS: string[] = Object.keys(rawData.regions);
