/**
 * 控糖革命工作台数据层 — 基于《控糖革命》Glucose Revolution
 * 数据来源：src/renderer/src/data/glucose-revolution.json
 *
 * 功能：
 *   1. 症状自测（血糖波动风险评分）
 *   2. 症状 → 推荐控糖窍门映射
 *   3. 窍门组合策略
 *   4. 一日控糖示范
 */
import rawData from "./data/glucose-revolution.json";

export interface GlucoseTip {
  id: number;
  name: string;
  stars: number;
  core: string;
  application: string;
}

export interface SymptomMatch {
  symptom: string;
  tips: number[];
  note?: string;
}

export const GLUCOSE_DATA = rawData;

/** 症状自测：返回命中数和风险等级 */
export function selfTestScore(checked: string[]): {
  hitCount: number;
  level: string;
  zhLevel: string;
} {
  const hitCount = rawData.selfTest.symptoms.filter((s) => checked.includes(s)).length;
  const levels = rawData.selfTest.interpretation;
  const found = levels.find((l) => hitCount >= l.min) || levels[levels.length - 1];
  return { hitCount, level: found.level, zhLevel: found.zh };
}

/** 症状 → 推荐窍门（去重排序，按星级优先） */
export function tipsForSymptoms(checked: string[]): GlucoseTip[] {
  const tipIds = new Set<number>();
  const notes: Record<number, string[]> = {};
  rawData.symptomMap.forEach((m) => {
    if (checked.includes(m.symptom)) {
      m.tips.forEach((tid) => {
        tipIds.add(tid);
        if (m.note) {
          if (!notes[tid]) notes[tid] = [];
          notes[tid].push(m.note);
        }
      });
    }
  });
  return rawData.tips
    .filter((t) => tipIds.has(t.id))
    .sort((a, b) => b.stars - a.stars || a.id - b.id)
    .map((t) => ({ ...t, application: notes[t.id]?.length ? `${t.application}（提示：${notes[t.id].join("；")}）` : t.application }));
}

/** 全部症状（自测用） */
export const SELF_TEST_SYMPTOMS: string[] = rawData.selfTest.symptoms;

/** 全部可勾选症状（映射表用） */
export const MAPPED_SYMPTOMS: string[] = Array.from(
  new Set(rawData.symptomMap.map((m) => m.symptom))
);
