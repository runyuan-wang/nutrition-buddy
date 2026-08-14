/**
 * 食物成分表数据导入脚本 v2
 * 从 knowledge-base/china-food-composition/ 解析全部数据导入SQLite
 *
 * 新增：
 *   - 食物分类体系 (food_categories 表)
 *   - 营养素定义 (nutrient_definitions 表)
 *   - 蛋白质转换系数 (protein_factors 表)
 *
 * 用法: node scripts/import-foods.js
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// 数据源 — 优先用项目内 knowledge-base，其次用 WorkBuddy skill
const KB_DATA_DIR = path.join(__dirname, "..", "knowledge-base", "china-food-composition", "data");
const SKILL_DATA_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME,
  ".workbuddy", "skills", "custom", "china-food-composition", "data"
);
const DATA_DIR = fs.existsSync(KB_DATA_DIR) ? KB_DATA_DIR : SKILL_DATA_DIR;

// 输出数据库路径
const DB_PATH = path.join(__dirname, "..", "data", "nutrition.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

// === 创建全部表 ===
db.exec(`
  CREATE TABLE IF NOT EXISTS foods (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS gi_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_name TEXT NOT NULL,
    gi_value INTEGER NOT NULL,
    gi_level TEXT NOT NULL,
    category TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS food_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_code TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subclass_code TEXT NOT NULL,
    subclass_name TEXT NOT NULL,
    food_count TEXT,
    volume TEXT
  );
  CREATE TABLE IF NOT EXISTS nutrient_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nutrient_cn TEXT NOT NULL,
    nutrient_en TEXT,
    unit TEXT,
    infods_tag TEXT,
    method TEXT,
    precision TEXT
  );
  CREATE TABLE IF NOT EXISTS protein_factors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_type TEXT NOT NULL,
    factor REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
  CREATE INDEX IF NOT EXISTS idx_gi_name ON gi_values(food_name);
  CREATE INDEX IF NOT EXISTS idx_cat_class ON food_categories(class_code);
`);

// === 解析函数 ===

function parseFoodCodeMap(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const foods = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\|\s*(\d{6})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
    if (match) {
      foods.push({ code: match[1], name: match[2].trim(), category: match[3].trim() });
    }
  }
  return foods;
}

function parseGITable(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const giItems = [];
  let currentCategory = "未分类";
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^##\s+(.+)/);
    if (headerMatch) { currentCategory = headerMatch[1].trim(); continue; }
    const match = trimmed.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|$/);
    if (match) {
      const giValue = parseInt(match[3], 10);
      let level = giValue < 55 ? "低GI" : giValue <= 70 ? "中GI" : "高GI";
      giItems.push({
        food_name: match[2].trim(), gi_value: giValue, gi_level: level, category: currentCategory
      });
    }
  }
  return giItems;
}

/**
 * 解析食物分类体系
 * 格式: ### 01 谷类及制品（108条）
 *        | 亚类编码 | 亚类名称 | 食物条数 |
 */
function parseFoodClassification(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const categories = [];
  let currentClass = null;
  let volume = "第一册";

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    // 册标题
    if (trimmed.match(/第二册/)) volume = "第二册";

    // 类标题: ### 01 谷类及制品（108条）
    const classMatch = trimmed.match(/^###\s+(\d{2})\s+(.+?)（(\d+)条）/);
    if (classMatch) {
      currentClass = { code: classMatch[1], name: classMatch[2].trim(), count: classMatch[3] };
      continue;
    }

    // 亚类行: | 1 | 小麦 | 37 |
    if (currentClass) {
      const subMatch = trimmed.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
      if (subMatch) {
        categories.push({
          class_code: currentClass.code,
          class_name: currentClass.name,
          subclass_code: subMatch[1].trim(),
          subclass_name: subMatch[2].trim(),
          food_count: subMatch[3].trim(),
          volume: volume
        });
      }
    }
  }
  return categories;
}

/**
 * 解析营养素定义
 * 格式: | 营养素 | 英文名 | 单位 | INFOODS Tagname | 分析/计算方法 | 精确度 |
 */
function parseNutrientDefinitions(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const nutrients = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    // 匹配6列表格行
    const match = trimmed.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
    if (match && !match[1].includes("营养素") && !match[1].includes("---")) {
      nutrients.push({
        nutrient_cn: match[1].trim(),
        nutrient_en: match[2].trim(),
        unit: match[3].trim(),
        infods_tag: match[4].trim(),
        method: match[5].trim(),
        precision: match[6].trim()
      });
    }
  }
  return nutrients;
}

// === 导入食物编码表 ===
const foodCodePath = path.join(DATA_DIR, "food-code-name-map.md");
if (fs.existsSync(foodCodePath)) {
  console.log("[import] 解析食物编码表...");
  const foods = parseFoodCodeMap(foodCodePath);
  console.log(`[import]   → ${foods.length} 个食物`);
  const stmt = db.prepare("INSERT OR REPLACE INTO foods (code, name, category) VALUES (?, ?, ?)");
  db.transaction((rows) => { for (const r of rows) stmt.run(r.code, r.name, r.category); })(foods);
  console.log(`[import]   ✓ 食物编码表导入完成`);
} else {
  console.log(`[import] ✗ 食物编码表不存在: ${foodCodePath}`);
}

// === 导入GI数据表 ===
const giTablePath = path.join(DATA_DIR, "gi-table.md");
if (fs.existsSync(giTablePath)) {
  console.log("[import] 解析GI数据表...");
  const giItems = parseGITable(giTablePath);
  console.log(`[import]   → ${giItems.length} 个GI值`);
  db.exec("DELETE FROM gi_values");
  const stmt = db.prepare("INSERT INTO gi_values (food_name, gi_value, gi_level, category) VALUES (?, ?, ?, ?)");
  db.transaction((rows) => { for (const r of rows) stmt.run(r.food_name, r.gi_value, r.gi_level, r.category); })(giItems);
  console.log(`[import]   ✓ GI数据导入完成`);
} else {
  console.log(`[import] ✗ GI数据表不存在: ${giTablePath}`);
}

// === 导入食物分类体系 ===
const classPath = path.join(DATA_DIR, "food-classification.md");
if (fs.existsSync(classPath)) {
  console.log("[import] 解析食物分类体系...");
  const categories = parseFoodClassification(classPath);
  console.log(`[import]   → ${categories.length} 个亚类`);
  db.exec("DELETE FROM food_categories");
  const stmt = db.prepare(
    "INSERT INTO food_categories (class_code, class_name, subclass_code, subclass_name, food_count, volume) VALUES (?, ?, ?, ?, ?, ?)"
  );
  db.transaction((rows) => {
    for (const r of rows) stmt.run(r.class_code, r.class_name, r.subclass_code, r.subclass_name, r.food_count, r.volume);
  })(categories);
  console.log(`[import]   ✓ 食物分类导入完成`);
} else {
  console.log(`[import] ✗ 食物分类表不存在: ${classPath}`);
}

// === 导入营养素定义 ===
const nutrientPath = path.join(DATA_DIR, "nutrient-definitions.md");
if (fs.existsSync(nutrientPath)) {
  console.log("[import] 解析营养素定义...");
  const nutrients = parseNutrientDefinitions(nutrientPath);
  console.log(`[import]   → ${nutrients.length} 个营养素`);
  db.exec("DELETE FROM nutrient_definitions");
  const stmt = db.prepare(
    "INSERT INTO nutrient_definitions (nutrient_cn, nutrient_en, unit, infods_tag, method, precision) VALUES (?, ?, ?, ?, ?, ?)"
  );
  db.transaction((rows) => {
    for (const r of rows) stmt.run(r.nutrient_cn, r.nutrient_en, r.unit, r.infods_tag, r.method, r.precision);
  })(nutrients);
  console.log(`[import]   ✓ 营养素定义导入完成`);
} else {
  console.log(`[import] ✗ 营养素定义表不存在: ${nutrientPath}`);
}

// === 统计 ===
const foodCount = db.prepare("SELECT COUNT(*) as c FROM foods").get().c;
const giCount = db.prepare("SELECT COUNT(*) as c FROM gi_values").get().c;
const catCount = db.prepare("SELECT COUNT(*) as c FROM food_categories").get().c;
const nutrientCount = db.prepare("SELECT COUNT(*) as c FROM nutrient_definitions").get().c;
console.log("\n[done] 导入完成！");
console.log(`  食物编码:   ${foodCount} 条`);
console.log(`  GI数据:     ${giCount} 条`);
console.log(`  食物分类:   ${catCount} 个亚类`);
console.log(`  营养素定义: ${nutrientCount} 条`);
console.log(`  数据库:     ${DB_PATH}`);
db.close();
