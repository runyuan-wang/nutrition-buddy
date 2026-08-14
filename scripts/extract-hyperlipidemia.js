#!/usr/bin/env node
/**
 * 提取高脂血症食养指南数据 → 结构化 JSON
 * 从 SKILL 的 knowledge_base.md / recipes_data.md / dietary_formulas.md 提取
 * 输出：nutrition-buddy/src/renderer/src/data/hyperlipidemia.json
 */
const fs = require("fs");
const path = require("path");

const SKILL_DIR = path.join(
  process.env.USERPROFILE,
  ".workbuddy", "skills", "custom", "hyperlipidemia-food-guide-skill"
);
const OUT_DIR = path.join(__dirname, "..", "src", "renderer", "src", "data");
const OUT_FILE = path.join(OUT_DIR, "hyperlipidemia.json");

// 6 证型
const ZHENG_TYPES = ["痰浊内阻型", "痰瘀互结型", "气滞血瘀型", "肝肾阴虚型", "气虚血瘀型", "脾虚湿盛型"];

// ========== 1. 辨证要点（来自 knowledge_base.md KPK-14 行180） ==========
const syndromeText = fs.readFileSync(path.join(SKILL_DIR, "knowledge_base.md"), "utf-8");
const syndromeLine = syndromeText.split(/\r?\n/).find(l => l.includes("6种常见辨证分型及临床表现"));
// 手动从 KPK 数据中摘取（因为行太长，直接写结构化数据更可靠）

// ========== 2. 食药物质（KPK-10 行119） ==========
const foodMatterLine = syndromeText.split(/\r?\n/).find(l => l.includes("痰浊内阻型：佛手、杏仁"));

// ========== 3. 食谱（recipes_data.md） ==========
function parseRecipes(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const result = {}; // 证型 -> { 示例1: {早餐,茶饮,中餐,加餐,晚餐,油盐}, ... }
  let currentType = null;
  let currentExample = null;
  let currentMeal = null;
  let currentText = "";

  const flushMeal = () => {
    if (currentMeal && currentExample && currentText.trim()) {
      currentExample[currentMeal] = currentText.trim().replace(/\|.*$/, "").trim();
    }
    currentText = "";
  };

  for (const line of lines) {
    const t = line.trim();
    const typeMatch = t.match(/^##\s+(一|二|三|四|五|六)、(.+?型)/);
    if (typeMatch) {
      currentType = typeMatch[2];
      if (!result[currentType]) result[currentType] = {};
      currentExample = null;
      continue;
    }
    const exMatch = t.match(/^###\s+(示例\d+)/);
    if (exMatch && currentType) {
      flushMeal();
      currentExample = result[currentType][exMatch[1]] = {};
      continue;
    }
    if (!currentExample) continue;
    const mealMatch = t.match(/^\|\s*(早餐|茶饮|中餐|加餐|晚餐|油、盐)\s*\|/);
    if (mealMatch) {
      flushMeal();
      currentMeal = mealMatch[1];
      const cell = t.replace(/^\|\s*(早餐|茶饮|中餐|加餐|晚餐|油、盐)\s*\|/, "");
      currentText = cell.replace(/\|.*$/, "").trim();
      continue;
    }
    if (currentMeal && t.startsWith("|") && !t.includes("---")) {
      const cell = t.split("|")[1]?.trim() || "";
      if (cell) currentText = currentText ? currentText + "；" + cell : cell;
    }
  }
  flushMeal();
  return result;
}

// ========== 4. 食养方（dietary_formulas.md） ==========
function parseFormulas(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const result = {}; // 证型 -> { teas: [{name, materials, usage, taboo}], dishes: [{name, materials, method, usage, taboo}] }
  let currentType = null;
  let section = null; // '食养茶饮' | '食养方'
  let currentItem = null;

  for (const line of lines) {
    const t = line.trim();
    const typeMatch = t.match(/^##\s+(一|二|三|四|五|六)、(.+?型)/);
    if (typeMatch) {
      currentType = typeMatch[2];
      result[currentType] = { teas: [], dishes: [] };
      currentItem = null;
      continue;
    }
    if (!currentType) continue;
    if (t === "食养茶饮" || t.startsWith("### 食养茶饮")) { section = "teas"; continue; }
    if (t === "食养方" || t.startsWith("### 食养方")) { section = "dishes"; continue; }
    const itemMatch = t.match(/^\*{0,2}\s*(\d+)[.、]\s*(.+)$/);
    if (itemMatch && section) {
      currentItem = { name: itemMatch[2].trim() };
      result[currentType][section].push(currentItem);
      continue;
    }
    if (currentItem && t.startsWith("- ")) {
      const [key, ...rest] = t.slice(2).split("：");
      const val = rest.join("：").trim();
      if (key.includes("材料")) currentItem.materials = val;
      else if (key.includes("用法")) currentItem.usage = val;
      else if (key.includes("做法")) currentItem.method = val;
      else if (key.includes("禁忌")) currentItem.taboo = val;
      else if (!currentItem.note) currentItem.note = key + "：" + val;
    }
  }
  return result;
}

// ========== 5. 证型辨证要点（手动结构化，来自指南原文） ==========
const syndromes = {
  "痰浊内阻型": {
    symptoms: ["身体肥胖", "肢体沉重感", "头昏多眠", "容易困倦", "胸闷气短", "大便黏或不成形"],
    tongue: "舌体胖大，舌苔粘腻",
    pulse: "脉滑",
    key: "身体肥胖 + 肢体沉重 + 头昏困倦 + 舌苔粘腻",
  },
  "痰瘀互结型": {
    symptoms: ["身体肥胖", "肢体沉重感", "头昏多眠", "容易困倦", "胸刺痛或闷痛", "口唇暗紫", "大便黏腻"],
    tongue: "舌体胖大，舌苔粘腻，或舌质紫暗，或舌有瘀点瘀斑",
    pulse: "脉滑或涩",
    key: "肥胖 + 胸刺痛/闷痛 + 口唇暗紫",
  },
  "气滞血瘀型": {
    symptoms: ["胸部或胁部胀满", "针刺样疼痛", "情绪低落或急躁易怒", "喜欢长叹气", "口唇紫暗"],
    tongue: "舌暗红，有瘀点或瘀斑",
    pulse: "脉细涩",
    key: "胸胁胀满/刺痛 + 情绪波动 + 长叹气",
  },
  "气虚血瘀型": {
    symptoms: ["气短乏力", "精神疲倦", "少言懒言", "胸部或胁部针刺样疼痛", "活动后诱发或加重", "出汗多"],
    tongue: "舌淡暗或淡紫或有瘀斑、瘀点",
    pulse: "脉涩",
    key: "气短乏力 + 活动后刺痛加重",
  },
  "肝肾阴虚型": {
    symptoms: ["头晕耳鸣", "腰酸腿软", "手心脚心发热", "心烦失眠", "健忘多梦"],
    tongue: "舌红，舌苔少",
    pulse: "脉细数",
    key: "头晕耳鸣 + 腰酸 + 五心烦热 + 舌红少苔",
  },
  "脾虚湿盛型": {
    symptoms: ["身体困倦", "大便不成形或腹泻", "饮食无味", "食后腹胀"],
    tongue: "舌淡，舌体胖大有齿痕，舌苔白粘腻",
    pulse: "脉细弱或濡缓",
    key: "困倦 + 大便不成形 + 食后腹胀 + 舌胖有齿痕",
  },
};

// ========== 6. 食药物质（KPK-10，手动结构化自指南原文） ==========
const foodMatters = {
  "痰浊内阻型": "佛手、杏仁（甜、苦）、昆布、香薷、桔红、桔梗、荷叶、葛根、橘皮、薏苡仁、莱菔子、紫苏子、山药、莲子、茯苓、决明子、山楂、白扁豆、菊花、赤小豆",
  "痰瘀互结型": "莱菔子、桔梗、白果、薏苡仁、山药、橘皮、昆布、茯苓、荷叶、决明子、山楂、桃仁、杏仁、葛根、白扁豆、沙棘",
  "气滞血瘀型": "佛手、杏仁（甜、苦）、当归、西红花、姜黄、荜茇、桃仁、山楂、重瓣玫瑰、陈皮、刀豆、葛根、决明子",
  "气虚血瘀型": "人参（人工种植≤5年）、山药、白扁豆、茯苓、莲子、薏苡仁、大枣、昆布、山楂、荷叶、桃仁、决明子、葛根、黄芪、党参、西洋参、沙棘",
  "肝肾阴虚型": "桑椹、枸杞子、菊花、黄精、山茱萸、百合、天麻、夏枯草、山药、荷叶、桑叶、黑芝麻、决明子、山楂、葛根、乌梅、铁皮石斛",
  "脾虚湿盛型": "人参（人工种植≤5年）、生姜、山药、白扁豆、茯苓、莲子、薏苡仁、山楂、橘皮、赤小豆、昆布、莱菔子、荷叶、桑叶、决明子、葛根、党参、麦芽",
};

// ========== 7. 血脂水平判断标准（成人，mmol/L） ==========
const lipidReference = {
  TC: { label: "总胆固醇 TC", unit: "mmol/L", normal: "<5.2", borderline: "5.2～6.19", high: "≥6.2" },
  TG: { label: "甘油三酯 TG", unit: "mmol/L", normal: "<1.7", borderline: "1.7～2.25", high: "≥2.26" },
  LDL: { label: "低密度脂蛋白胆固醇 LDL-C", unit: "mmol/L", normal: "<3.4", borderline: "3.4～4.09", high: "≥4.1" },
  HDL: { label: "高密度脂蛋白胆固醇 HDL-C", unit: "mmol/L", normal: "≥1.0", note: "偏低：<1.0（男）/<1.3（女）" },
};

// ========== 组装 ==========
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const recipes = parseRecipes(path.join(SKILL_DIR, "recipes_data.md"));
  const formulas = parseFormulas(path.join(SKILL_DIR, "dietary_formulas.md"));

  const data = {
    source: "国家卫生健康委《成人高脂血症食养指南（2023年版）》",
    author: "王润圆（中国注册营养师）",
    lipidReference,
    syndromes: ZHENG_TYPES.map(type => ({
      name: type,
      ...syndromes[type],
      foodMatters: foodMatters[type],
      recipes: recipes[type] || {},
      formulas: formulas[type] || { teas: [], dishes: [] },
    })),
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log("✅ 已生成:", OUT_FILE);
  console.log("证型数:", data.syndromes.length);
  console.log("食谱示例数:", data.syndromes.reduce((s, x) => s + Object.keys(x.recipes).length, 0));
  console.log("茶饮数:", data.syndromes.reduce((s, x) => s + x.formulas.teas.length, 0));
  console.log("食养方数:", data.syndromes.reduce((s, x) => s + x.formulas.dishes.length, 0));
} catch (e) {
  console.error("❌ 提取失败:", e.message);
  process.exit(1);
}
