#!/usr/bin/env node
/**
 * 提取儿童青少年肥胖食养指南数据 → 结构化 JSON
 * 来源：《儿童青少年肥胖食养指南（2024年版）》SKILL
 * 输出：nutrition-buddy/src/renderer/src/data/childhood-obesity.json
 */
const fs = require("fs");
const path = require("path");

const SKILL_DIR = path.join(
  process.env.USERPROFILE, ".workbuddy", "skills", "childhood-obesity-food-guide"
);
const OUT_DIR = path.join(__dirname, "..", "src", "renderer", "src", "data");
const OUT_FILE = path.join(OUT_DIR, "childhood-obesity.json");

// ========== 1. 证型辨证要点（来自 knowledge_base.md） ==========
const kb = fs.readFileSync(path.join(SKILL_DIR, "knowledge_base.md"), "utf-8");

// 5 证型 + 症状（从表格行提取）
const syndromeTable = {
  "胃热火郁证": { symptoms: ["多食", "消谷善饥", "大便不爽或干结", "尿黄", "口干口苦", "喜饮水"], tongue: "舌质红，苔黄", pulse: "脉数", key: "多食易饥 + 口干口苦 + 便干尿黄" },
  "痰湿内盛证": { symptoms: ["形体肥胖", "身体沉重", "肢体困倦", "脘痞胸满", "头晕", "口干而不欲饮", "大便粘滞不爽", "嗜食肥甘", "嗜卧懒动"], tongue: "舌淡胖或大，苔白腻或白滑", pulse: "脉滑", key: "肥胖沉重 + 困倦嗜卧 + 苔白腻" },
  "气郁血瘀证": { symptoms: ["肥胖懒动", "喜太息", "胸闷胁满", "面晦唇暗", "肢端色泽不鲜或青紫", "便干", "失眠"], tongue: "舌质暗或有瘀斑瘀点，苔薄", pulse: "脉弦或涩", key: "懒动太息 + 胸闷胁满 + 面晦唇暗" },
  "脾虚不运证": { symptoms: ["肥胖臃肿", "神疲乏力", "身体困重", "脘腹痞闷", "四肢轻度浮肿", "劳则尤甚", "饮食如常或偏少", "大便溏或便秘"], tongue: "舌淡胖，边有齿印，苔薄白或白腻", pulse: "脉濡细", key: "神疲乏力 + 身体困重 + 舌淡胖齿印" },
  "脾肾阳虚证": { symptoms: ["形体肥胖", "易于疲劳", "四肢不温或厥冷", "喜食热饮", "小便清长"], tongue: "舌淡胖，苔薄白", pulse: "脉沉细", key: "易于疲劳 + 四肢不温 + 喜热饮" },
};

// 2. 证型食药物质（KPK-10 表格）
const foodMatters = {
  "胃热火郁证": "鲜芦根、淡竹叶、葛根、甘草",
  "痰湿内盛证": "橘皮、茯苓、薏苡仁、赤小豆、砂仁",
  "气郁血瘀证": "佛手、山楂、桃仁、薤白",
  "脾虚不运证": "茯苓、山药、芡实、白扁豆、莲子、大枣",
  "脾肾阳虚证": "益智仁、刀豆、肉桂、黑胡椒、丁香、生姜",
};

// ========== 3. 营养方（dietary_formulas.md） ==========
const df = fs.readFileSync(path.join(SKILL_DIR, "dietary_formulas.md"), "utf-8");
const formulas = { "胃热火郁证": [], "痰湿内盛证": [], "气郁血瘀证": [], "脾虚不运证": [], "脾肾阳虚证": [] };
let curZheng = null, curItem = null;
for (const line of df.split(/\r?\n/)) {
  const t = line.trim();
  const zhengMatch = t.match(/^###\s*[（(](一|二|三|四|五)[)）]\s*(.+?证)$/);
  if (zhengMatch) {
    curZheng = zhengMatch[2];
    continue;
  }
  if (!curZheng) continue;
  const itemMatch = t.match(/^####\s*(.+)$/);
  if (itemMatch) {
    curItem = { name: itemMatch[1].trim(), materials: "", method: "", usage: "" };
    formulas[curZheng].push(curItem);
    continue;
  }
  if (curItem) {
    const m = t.match(/^[-*]\s*\*\*(主要材料|制作方法|用法用量)\*\*[：:]\s*(.+)$/);
    if (m) {
      if (m[1] === "主要材料") curItem.materials = m[2];
      else if (m[1] === "制作方法") curItem.method = m[2];
      else if (m[1] === "用法用量") curItem.usage = m[2];
    }
  }
}

// ========== 4. 地区食谱（recipes_data.md） ==========
const rd = fs.readFileSync(path.join(SKILL_DIR, "recipes_data.md"), "utf-8");
const regions = ["东北地区", "西北地区", "中部地区", "西南地区", "东南地区"];
const recipes = {}; // 地区 -> 食谱数组
let curRegion = null, curRecipe = null, curMeal = null;
const regionMap = {};
regionMap["东北"] = "东北地区"; regionMap["西北"] = "西北地区"; regionMap["中部"] = "中部地区"; regionMap["西南"] = "西南地区"; regionMap["东南"] = "东南地区";

for (const line of rd.split(/\r?\n/)) {
  const t = line.trim();
  const regionMatch = t.match(/^##\s*(东北|西北|中部|西南|东南)地区$/);
  if (regionMatch) {
    curRegion = regionMap[regionMatch[1]];
    if (!recipes[curRegion]) recipes[curRegion] = [];
    curRecipe = null;
    continue;
  }
  if (!curRegion) continue;
  const recipeMatch = t.match(/^###\s*(冬春季食谱\d|夏秋季食谱\d|冬季食谱\d|夏季食谱\d|示例\d|食谱\d)$/);
  if (recipeMatch) {
    curRecipe = { name: recipeMatch[1], meals: {} };
    recipes[curRegion].push(curRecipe);
    curMeal = null;
    continue;
  }
  if (curRecipe) {
    const mealMatch = t.match(/^[-*]\s*\*\*(早餐|中餐|晚餐|油、盐|零食)\*\*[：:]\s*$/);
    if (mealMatch) {
      curMeal = mealMatch[1];
      curRecipe.meals[curMeal] = "";
      continue;
    }
    const mealContent = t.match(/^[-*]\s*\*\*(早餐|中餐|晚餐|油、盐|零食)\*\*[：:]\s*(.+)$/);
    if (mealContent) {
      curMeal = mealContent[1];
      curRecipe.meals[curMeal] = mealContent[2];
      continue;
    }
    if (curMeal && t.startsWith("- ")) {
      const add = t.slice(2).replace(/\*\*/g, "");
      if (curRecipe.meals[curMeal]) curRecipe.meals[curMeal] += "；" + add;
      else curRecipe.meals[curMeal] = add;
    }
  }
}

// ========== 5. 儿童 BMI 标准（中国学龄儿童青少年超重肥胖筛查 BMI 界值，kg/m²） ==========
// 参考 WS/T 586-2018《学龄儿童青少年超重与肥胖筛查》
const bmiBoys = [
  { age: 6, overweight: 17.7, obesity: 19.6 }, { age: 7, overweight: 18.4, obesity: 20.6 },
  { age: 8, overweight: 19.2, obesity: 21.6 }, { age: 9, overweight: 20.0, obesity: 22.7 },
  { age: 10, overweight: 20.9, obesity: 23.8 }, { age: 11, overweight: 21.8, obesity: 25.0 },
  { age: 12, overweight: 22.6, obesity: 26.1 }, { age: 13, overweight: 23.3, obesity: 27.2 },
  { age: 14, overweight: 23.9, obesity: 28.2 }, { age: 15, overweight: 24.4, obesity: 29.0 },
  { age: 16, overweight: 24.7, obesity: 29.6 }, { age: 17, overweight: 24.9, obesity: 30.1 },
  { age: 18, overweight: 25.1, obesity: 30.4 },
];
const bmiGirls = [
  { age: 6, overweight: 17.2, obesity: 18.9 }, { age: 7, overweight: 17.9, obesity: 19.7 },
  { age: 8, overweight: 18.6, obesity: 20.7 }, { age: 9, overweight: 19.4, obesity: 21.8 },
  { age: 10, overweight: 20.3, obesity: 23.0 }, { age: 11, overweight: 21.2, obesity: 24.1 },
  { age: 12, overweight: 22.1, obesity: 25.2 }, { age: 13, overweight: 22.9, obesity: 26.2 },
  { age: 14, overweight: 23.6, obesity: 27.1 }, { age: 15, overweight: 24.2, obesity: 27.9 },
  { age: 16, overweight: 24.7, obesity: 28.5 }, { age: 17, overweight: 25.0, obesity: 29.0 },
  { age: 18, overweight: 25.3, obesity: 29.4 },
];

// ========== 组装 ==========
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = {
    source: "国家卫生健康委《儿童青少年肥胖食养指南（2024年版）》",
    author: "王润圆（中国注册营养师）",
    bmiStandard: { boys: bmiBoys, girls: bmiGirls, note: "WS/T 586-2018 学龄儿童青少年超重与肥胖筛查 BMI 界值" },
    syndromes: Object.keys(syndromeTable).map((name) => ({
      name, ...syndromeTable[name], foodMatters: foodMatters[name],
      formulas: formulas[name],
    })),
    regions: recipes,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log("✅ 已生成:", OUT_FILE);
  console.log("证型数:", data.syndromes.length);
  console.log("地区数:", Object.keys(recipes).length, "| 食谱总数:", Object.values(recipes).reduce((s, r) => s + r.length, 0));
  console.log("营养方总数:", data.syndromes.reduce((s, x) => s + x.formulas.length, 0));
  Object.keys(recipes).forEach((r) => console.log(" -", r, recipes[r].length, "套"));
} catch (e) {
  console.error("❌ 提取失败:", e.message);
  process.exit(1);
}
