/**
 * 食养指南库数据层 — 统一加载所有指南 JSON
 * 数据来源：src/renderer/src/data/guides/*.json（由 scripts/extract-all-guides.js 生成）
 */
import diabetes from "./data/guides/diabetes.json";
import hypertension from "./data/guides/hypertension.json";
import gout from "./data/guides/gout.json";
import ckd from "./data/guides/ckd.json";
import stroke from "./data/guides/stroke.json";
import sarcopenia from "./data/guides/sarcopenia.json";
import osteoporosis from "./data/guides/osteoporosis.json";
import obesity from "./data/guides/obesity.json";
import stunting from "./data/guides/stunting.json";
import childObesity from "./data/guides/child-obesity.json";

export interface GuideSyndrome {
  name: string;
  symptoms: string[];
}

export interface GuideRecipe {
  meals: Record<string, string>;
}

export interface GuideFormula {
  name: string;
  materials?: string;
  method?: string;
  usage?: string;
  taboo?: string;
}

export interface Guide {
  id: string;
  name: string;
  year: string;
  source: string;
  syndromeCount: number;
  recipeCount: number;
  formulaCount: number;
  syndromes: GuideSyndrome[];
  recipes: GuideRecipe[];
  formulas: GuideFormula[];
}

/** 指南清单 */
export const GUIDES: Guide[] = [
  diabetes, hypertension, gout, ckd, stroke,
  sarcopenia, osteoporosis, obesity, stunting, childObesity,
] as Guide[];

/** 按 ID 查找指南 */
export function getGuide(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id);
}

/** 症状 → 证型匹配（跨指南） */
export function matchGuideSyndromes(guide: Guide, checked: string[]): (GuideSyndrome & { matchScore: number; matched: string[] })[] {
  const scored = guide.syndromes.map((s) => {
    const matched = s.symptoms.filter((sym) => checked.includes(sym));
    return { ...s, matched, matchScore: matched.length };
  });
  return scored
    .filter((x) => x.matched.length > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((x) => ({ ...x, matchScore: x.matchScore }));
}

/** 指南总览统计 */
export function getGuideOverview(): { totalGuides: number; totalRecipes: number; totalSyndromes: number; totalFormulas: number } {
  return {
    totalGuides: GUIDES.length,
    totalRecipes: GUIDES.reduce((s, g) => s + g.recipeCount, 0),
    totalSyndromes: GUIDES.reduce((s, g) => s + g.syndromeCount, 0),
    totalFormulas: GUIDES.reduce((s, g) => s + g.formulaCount, 0),
  };
}
