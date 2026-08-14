/**
 * 食养指南查询模块（主进程）
 * 数据来源：data/guides/*.json（由 scripts/extract-all-guides.js 生成后复制）
 * 供 LLM 工具 query_guide 调用
 */
import fs from "fs";
import path from "path";

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

let guidesCache: Guide[] | null = null;

/** 指南名 → 匹配关键词 */
const GUIDE_ALIASES: Record<string, string[]> = {
  diabetes: ["糖尿病", "血糖", "diabetes", "糖病"],
  hypertension: ["高血压", "hypertension", "血压高"],
  gout: ["痛风", "高尿酸", "尿酸", "gout"],
  ckd: ["慢性肾脏病", "肾脏病", "肾病", "ckd", "肾衰"],
  stroke: ["脑卒中", "卒中", "中风", "stroke"],
  sarcopenia: ["肌少症", "肌肉衰减", "少肌症", "sarcopenia"],
  osteoporosis: ["骨质疏松", "骨质", "osteoporosis"],
  obesity: ["成人肥胖", "肥胖", "减肥", "obesity"],
  stunting: ["生长迟缓", "长不高", "生长发育", "stunting", "助长"],
  "child-obesity": ["儿童肥胖", "小胖墩", "孩子体重", "儿童减肥"],
};

/** 加载所有指南 */
export function loadGuides(): Guide[] {
  if (guidesCache) return guidesCache;
  const dir = path.join(__dirname, "..", "..", "data", "guides");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  guidesCache = files.map((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as Guide;
    } catch {
      return null;
    }
  }).filter((g): g is Guide => g !== null);
  return guidesCache;
}

/** 按名称或关键词查找指南 */
export function findGuide(query: string): Guide | undefined {
  const q = query.trim().toLowerCase();
  const guides = loadGuides();
  if (!q) return guides[0];
  // 精确 ID
  const byId = guides.find((g) => g.id.toLowerCase() === q);
  if (byId) return byId;
  // 别名匹配
  for (const g of guides) {
    const aliases = GUIDE_ALIASES[g.id] || [];
    if (aliases.some((a) => q.includes(a) || a.includes(q))) return g;
  }
  // 模糊包含
  return guides.find((g) => q.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(q));
}

/**
 * 查询指南内容
 * @param guideQuery 指南名称关键词，如"糖尿病"、"痛风"
 * @param topic 查询主题：证型/食谱/食养方/全部
 */
export function queryGuide(guideQuery: string, topic?: string): string {
  const guide = findGuide(guideQuery);
  if (!guide) {
    const names = loadGuides().map((g) => g.name).join("、");
    return `未找到该指南。可用指南：${names}`;
  }

  const t = (topic || "全部").trim();
  const parts: string[] = [`【${guide.name}（${guide.year}年版）】来源：${guide.source}`];

  if (t.includes("证") || t.includes("辨证") || t === "全部") {
    if (guide.syndromes.length > 0) {
      parts.push(`\n中医证型（${guide.syndromeCount}种）：`);
      guide.syndromes.forEach((s, i) => {
        parts.push(`${i + 1}. ${s.name}${s.symptoms.length > 0 ? " — 症状：" + s.symptoms.join("、") : ""}`);
      });
    }
  }

  if (t.includes("食谱") || t.includes("餐") || t === "全部") {
    if (guide.recipes.length > 0) {
      parts.push(`\n食谱示例（共${guide.recipeCount}套，展示前3套）：`);
      guide.recipes.slice(0, 3).forEach((r, i) => {
        parts.push(`食谱${i + 1}：`);
        Object.entries(r.meals).forEach(([meal, content]) => {
          parts.push(`  ${meal}：${content}`);
        });
      });
    }
  }

  if (t.includes("食养") || t.includes("方") || t === "全部") {
    if (guide.formulas.length > 0) {
      parts.push(`\n食养方（${guide.formulaCount}个）：`);
      guide.formulas.slice(0, 6).forEach((f, i) => {
        parts.push(`${i + 1}. ${f.name}${f.materials ? "（材料：" + f.materials + "）" : ""}`);
      });
    }
  }

  return parts.join("\n");
}
