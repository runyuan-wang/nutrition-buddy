#!/usr/bin/env node
/**
 * 通用食养指南批量提取器
 *
 * 扫描 guideline-skills/ 下所有指南仓库，自动提取：
 *   1. 证型表（辨证要点）— 自动识别含"证"的表格行
 *   2. 证型食药物质 — 从证型表相邻列提取
 *   3. 食谱 — 从 recipes 类文件提取（标准表格格式）
 *   4. 食养方 — 从 dietary_formulas 类文件提取
 *
 * 输出：每个指南一个 JSON 到 src/renderer/src/data/guides/
 */
const fs = require("fs");
const path = require("path");

const SKILLS_ROOT = path.join(__dirname, "..", "..", "guideline-skills");
const OUT_ROOT = path.join(__dirname, "..", "src", "renderer", "src", "data", "guides");
// 指南元信息（id, 名称, 年份, 仓库目录）
const GUIDES = [
  { id: "diabetes", name: "糖尿病食养指南", year: "2023", dir: "diabetes-food-guide-skill" },
  { id: "hypertension", name: "高血压食养指南", year: "2023", dir: "hypertension-food-guide" },
  { id: "gout", name: "痛风食养指南", year: "2024", dir: "gout-dietary-guide" },
  { id: "ckd", name: "慢性肾脏病食养指南", year: "2024", dir: "ckd-food-guide-skill" },
  { id: "stroke", name: "脑卒中食养指南", year: "2026", dir: "stroke-food-guide-skill" },
  { id: "sarcopenia", name: "肌少症食养指南", year: "2026", dir: "sarcopenia-food-guide-skill" },
  { id: "osteoporosis", name: "骨质疏松食养指南", year: "2026", dir: "osteoporosis-food-guide-skill" },
  { id: "obesity", name: "成人肥胖食养指南", year: "2024", dir: "obesity-food-guide" },
  { id: "stunting", name: "儿童生长迟缓食养指南", year: "2023", dir: "stunting-dietary-guide" },
  { id: "child-obesity", name: "儿童肥胖食养指南", year: "2024", dir: "child-obesity-food-guide-skill" },
];

/** 读取目录下匹配前缀的所有文件 */
function readFiles(dir, prefix) {
  if (!fs.existsSync(dir)) return "";
  const files = fs.readdirSync(dir);
  const matched = files.filter((f) => f.startsWith(prefix) && f.endsWith(".md"));
  let content = "";
  for (const f of matched) {
    content += "\n" + fs.readFileSync(path.join(dir, f), "utf-8");
  }
  return content;
}

/** 解析 markdown 表格 */
function parseTable(md) {
  const lines = md.split(/\r?\n/);
  const tables = [];
  let cur = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|") && !t.includes("---")) {
      const cells = t.slice(1, -1).split("|").map((c) => c.trim().replace(/\*\*/g, ""));
      if (cells.some((c) => c.length > 0)) cur.push(cells);
    } else if (cur.length > 0) {
      tables.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) tables.push(cur);
  return tables;
}

/** 从知识库提取证型（自动识别含"证"的表格行 + KPK内容行） */
function extractSyndromes(kb) {
  const tables = parseTable(kb);
  const syndromes = [];
  for (const table of tables) {
    if (table.length < 2) continue;
    const header = table[0].join(" ");
    if (!/证型|辨证|证/.test(header)) continue;
    for (let i = 1; i < table.length; i++) {
      const row = table[i];
      const name = row.find((c) => /证$|证 /g.test(c) && c.length < 15) || row[0];
      if (!name || name.length > 20) continue;
      const otherCols = row.filter((c) => c !== name && c.length > 0);
      const symptoms = otherCols.length > 0 ? otherCols[0] : "";
      if (name.endsWith("证") || /(湿|热|虚|瘀|郁|痰|脾|肾|肝|气|血|阳|阴)证/.test(name)) {
        syndromes.push({ name, symptoms: symptoms.split(/[、，,;；\/]/).filter((s) => s.length > 1).slice(0, 10) });
      }
    }
  }

  // 补充：从"食养建议"等 KPK 内容行提取（格式：（1）**XX证**——症状）
  const contentMatches = kb.match(/[（(]\d+[)）]\s*\*{0,2}([^——\*]{2,10}证)\*{0,2}[—–-]{1,3}([^\n（(]+)/g) || [];
  for (const m of contentMatches) {
    const mm = m.match(/[（(]\d+[)）]\s*\*{0,2}([^——\*]{2,10}证)\*{0,2}[—–-]{1,3}([^\n（(]+)/);
    if (mm) {
      const name = mm[1].trim();
      const symptoms = mm[2].trim().split(/[、，,;；\/]/).filter((s) => s.length > 1).slice(0, 10);
      if (name.length <= 10 && symptoms.length > 0) {
        syndromes.push({ name, symptoms });
      }
    }
  }

  // 补充：从列表行提取（格式：- **XX证**：症状 或 - XX证：症状）
  const listMatches = kb.match(/^[-*]\s*\*{0,2}([^：:*\n]{2,10}证)\*{0,2}\s*[：:]\s*([^\n]+)$/gm) || [];
  for (const m of listMatches) {
    const mm = m.match(/^[-*]\s*\*{0,2}([^：:*\n]{2,10}证)\*{0,2}\s*[：:]\s*([^\n]+)$/);
    if (mm) {
      const name = mm[1].trim();
      const symptoms = mm[2].trim().split(/[、，,;；\/]/).filter((s) => s.length > 1).slice(0, 10);
      if (name.length <= 10 && symptoms.length > 0) {
        syndromes.push({ name, symptoms });
      }
    }
  }

  // 去重
  const seen = new Set();
  return syndromes.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

/** 从食谱文件提取（标准表格: | 餐次 | 食谱 | + 文本行模式兜底） */
function extractRecipes(recipesContent) {
  const tables = parseTable(recipesContent);
  const recipes = [];
  for (const table of tables) {
    if (table.length < 2) continue;
    const header = table[0].join(" ");
    if (!/餐次|早餐/.test(header)) continue;
    let current = null;
    for (let i = 1; i < table.length; i++) {
      const row = table[i];
      const meal = row[0];
      const food = row[1] || "";
      if (/早餐|中餐|晚餐|加餐|茶饮|油|盐|零食|汤/.test(meal)) {
        if (!current) current = { meals: {} };
        current.meals[meal] = food;
      }
    }
    if (current) recipes.push(current);
  }

  // 兜底：文本行模式（"早餐 XXX" 或 "早餐：XXX" 或 "早餐" 独立行）
  if (recipes.length === 0) {
    const lines = recipesContent.split(/\r?\n/);
    let current = null;
    for (const line of lines) {
      const t = line.trim();
      // 新食谱标题（纯文本："春季食谱 1"、"食谱1" 等）
      const newRecipe = t.match(/^(春|夏|秋|冬)?季?食谱\s*\d+|^食谱\s*\d+|^示例\s*\d+/);
      if (newRecipe) {
        if (current && Object.keys(current.meals).length >= 2) recipes.push(current);
        current = { meals: {} };
        continue;
      }
      const mealMatch = t.match(/^(早餐|中餐|晚餐|加餐|茶饮|油、盐|零食|汤)\s*[：:]\s*(.*)$/);
      const mealBare = t.match(/^(早餐|中餐|晚餐|加餐|茶饮|油、盐|零食|汤)$/);
      const mealSpace = t.match(/^(早餐|中餐|晚餐|加餐|茶饮|油、盐|零食|汤)\s+(.+)$/);
      if (mealMatch || mealBare || mealSpace) {
        if (!current) current = { meals: {} };
        const meal = mealMatch ? mealMatch[1] : mealBare ? mealBare[1] : mealSpace[1];
        const content = mealMatch ? mealMatch[2].trim() : mealBare ? "" : mealSpace[2].trim();
        current.meals[meal] = content;
        continue;
      }
      // 续行：非空、非表、非数字 → 追加到上一餐
      if (current && t.length > 2 && !/^[|#-]/.test(t) && !/^\d+\s*\/\s*\d+/.test(t)) {
        const lastMeal = Object.keys(current.meals).pop();
        if (lastMeal && current.meals[lastMeal] !== undefined && current.meals[lastMeal].length < 400) {
          current.meals[lastMeal] = current.meals[lastMeal] ? current.meals[lastMeal] + "；" + t : t;
        }
      }
    }
    if (current && Object.keys(current.meals).length >= 2) recipes.push(current);
  }
  return recipes;
}

/** 从食养方文件提取 */
function extractFormulas(content) {
  const lines = content.split(/\r?\n/);
  const formulas = [];
  let cur = null;
  for (const line of lines) {
    const t = line.trim();
    const nameMatch = t.match(/^\*{0,2}\s*(?:[0-9一二三四五六七八九十]+[.、])?\s*(.+?)(?:饮|汤|粥|糊|膏|饼|茶|羹|煲|饭|面|菜|汁|盅|包|卷)\s*$/);
    const itemMatch = t.match(/^#{3,4}\s*(.+)$/);
    const dashMatch = t.match(/^[-*]\s*\*{0,2}(材料|做法|用法|原料|制作|禁忌)[：:]\s*(.+)$/);
    if (itemMatch) {
      const name = itemMatch[1].replace(/\*\*/g, "").trim();
      // 排除"食养说明""注意事项"等非方剂标题
      if (name.length > 2 && name.length < 25 && !/说明|注意|禁忌|建议|附录|分类|示例/.test(name)) {
        cur = { name, materials: "", method: "", usage: "", taboo: "" };
        formulas.push(cur);
        continue;
      }
    }
    if (cur && dashMatch) {
      const [, key, val] = dashMatch;
      if (/材料|原料/.test(key)) cur.materials = val;
      else if (/做法|制作/.test(key)) cur.method = val;
      else if (/用法/.test(key)) cur.usage = val;
      else if (/禁忌/.test(key)) cur.taboo = val;
    }
  }
  return formulas;
}

// ========== 主流程 ==========
try {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const summary = [];

  for (const guide of GUIDES) {
    const dir = path.join(SKILLS_ROOT, guide.dir);
    if (!fs.existsSync(dir)) {
      console.log(`⚠️ 跳过 ${guide.id}（目录不存在）`);
      continue;
    }
    // 处理 CKD 前缀变体
    const prefix = guide.id === "ckd" ? "ckd-" : "";
    const kb = readFiles(dir, prefix + "knowledge_base");
    const recipesContent = readFiles(dir, prefix + "recipes");
    const formulasContent = readFiles(dir, prefix + "dietary_formulas");

    // 痛风食谱在多个文件（coastal/inland/plateau）
    let goutRecipes = "";
    if (guide.id === "gout") {
      for (const f of ["recipes_coastal.md", "recipes_inland.md", "recipes_plateau.md"]) {
        const p = path.join(dir, f);
        if (fs.existsSync(p)) goutRecipes += "\n" + fs.readFileSync(p, "utf-8");
      }
    }

    const syndromes = extractSyndromes(kb);
    const recipes = extractRecipes(guide.id === "gout" ? goutRecipes : recipesContent);
    const formulas = extractFormulas(formulasContent);

    const data = {
      id: guide.id,
      name: guide.name,
      year: guide.year,
      source: `国家卫生健康委《${guide.name}（${guide.year}年版）》`,
      syndromeCount: syndromes.length,
      recipeCount: recipes.length,
      formulaCount: formulas.length,
      syndromes,
      recipes,
      formulas,
    };

    const outFile = path.join(OUT_ROOT, guide.id + ".json");
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf-8");
    summary.push(`${guide.name}(${guide.year}): ${syndromes.length}证型 / ${recipes.length}食谱 / ${formulas.length}食养方`);
    console.log(`✅ ${guide.id}: 证型${syndromes.length} 食谱${recipes.length} 食养方${formulas.length}`);
  }

  console.log("\n=== 汇总 ===");
  summary.forEach((s) => console.log(s));
} catch (e) {
  console.error("❌ 失败:", e.message);
  process.exit(1);
}
