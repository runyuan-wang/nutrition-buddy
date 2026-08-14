/**
 * 食物成分数据库 v2 — SQLite
 * 数据来源：中国食物成分表（标准版第6版）
 *
 * 表结构：
 *   foods                — 食物编码-名称对照表 (386条)
 *   gi_values            — 血糖生成指数 (255条)
 *   food_categories      — 食物分类体系 (63个亚类)
 *   nutrient_definitions — 营养素定义与分析方法 (31条)
 *   protein_factors      — 蛋白质转换系数
 */
import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import fs from "fs";

let db: Database.Database | null = null;

function getDbPath(): string {
  const devPath = path.join(__dirname, "..", "..", "data", "nutrition.db");
  if (fs.existsSync(devPath)) return devPath;
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "nutrition.db");
}

// === 类型定义 ===

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

export interface FoodCategory {
  class_code: string;
  class_name: string;
  subclass_code: string;
  subclass_name: string;
  food_count: string;
  volume: string;
}

export interface NutrientDef {
  nutrient_cn: string;
  nutrient_en: string;
  unit: string;
  infods_tag: string;
  method: string;
  precision: string;
}

// === 初始化 ===

export function initDatabase(): void {
  const dbPath = getDbPath();
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS foods (
      code TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gi_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_name TEXT NOT NULL, gi_value INTEGER NOT NULL,
      gi_level TEXT NOT NULL, category TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS food_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_code TEXT, class_name TEXT,
      subclass_code TEXT, subclass_name TEXT,
      food_count TEXT, volume TEXT
    );
    CREATE TABLE IF NOT EXISTS nutrient_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nutrient_cn TEXT, nutrient_en TEXT, unit TEXT,
      infods_tag TEXT, method TEXT, precision TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
    CREATE INDEX IF NOT EXISTS idx_gi_name ON gi_values(food_name);
    CREATE INDEX IF NOT EXISTS idx_cat_class ON food_categories(class_code);
  `);

  const foodCount = (db.prepare("SELECT COUNT(*) as c FROM foods").get() as { c: number }).c;
  if (foodCount === 0) {
    console.log("[food-db] 数据库为空，请运行 npm run import-foods 导入数据");
  }
}

// === 查询函数 ===

/** 模糊搜索食物 */
export function searchFood(keyword: string): FoodItem[] {
  if (!db) return [];
  return db
    .prepare("SELECT code, name, category FROM foods WHERE name LIKE ? LIMIT 20")
    .all(`%${keyword}%`) as FoodItem[];
}

/** 查询食物GI值 */
export function queryFood(name: string): GIItem | null {
  if (!db) return null;
  const row = db
    .prepare("SELECT food_name, gi_value as value, gi_level as level, category FROM gi_values WHERE food_name LIKE ? LIMIT 1")
    .get(`%${name}%`) as GIItem | undefined;
  return row || null;
}

/** 查询食物分类体系 */
export function getFoodCategories(classCode?: string): FoodCategory[] {
  if (!db) return [];
  if (classCode) {
    return db
      .prepare("SELECT class_code, class_name, subclass_code, subclass_name, food_count, volume FROM food_categories WHERE class_code = ?")
      .all(classCode) as FoodCategory[];
  }
  return db
    .prepare("SELECT class_code, class_name, subclass_code, subclass_name, food_count, volume FROM food_categories")
    .all() as FoodCategory[];
}

/** 按 GI 等级筛选食物（低GI<55 / 中GI 55-70 / 高GI>70） */
export function getFoodsByGILevel(level: "低GI" | "中GI" | "高GI", limit = 60): GIItem[] {
  if (!db) return [];
  return db
    .prepare("SELECT food_name, gi_value as value, gi_level as level, category FROM gi_values WHERE gi_level = ? LIMIT ?")
    .all(level, limit) as GIItem[];
}

/** 按大类浏览食物（classCode 如 '01' 谷类） */
export function getFoodsByClass(classCode: string, limit = 100): FoodItem[] {
  if (!db) return [];
  const cls = db
    .prepare("SELECT class_name FROM food_categories WHERE class_code = ? LIMIT 1")
    .get(classCode) as { class_name: string } | undefined;
  if (!cls) return [];
  return db
    .prepare("SELECT code, name, category FROM foods WHERE category = ? LIMIT ?")
    .all(cls.class_name, limit) as FoodItem[];
}

/** 获取所有 GI 等级分布统计 */
export function getGIStats(): { level: string; count: number }[] {
  if (!db) return [];
  return db
    .prepare("SELECT gi_level as level, COUNT(*) as count FROM gi_values GROUP BY gi_level")
    .all() as { level: string; count: number }[];
}

/** 查询营养素定义 */
export function getNutrientDefinitions(keyword?: string): NutrientDef[] {
  if (!db) return [];
  if (keyword) {
    return db
      .prepare("SELECT nutrient_cn, nutrient_en, unit, infods_tag, method, precision FROM nutrient_definitions WHERE nutrient_cn LIKE ? OR nutrient_en LIKE ? OR infods_tag LIKE ?")
      .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) as NutrientDef[];
  }
  return db
    .prepare("SELECT nutrient_cn, nutrient_en, unit, infods_tag, method, precision FROM nutrient_definitions")
    .all() as NutrientDef[];
}

// === 批量插入（供导入脚本使用）===

export function insertFoods(items: FoodItem[]): void {
  if (!db) return;
  const stmt = db.prepare("INSERT OR REPLACE INTO foods (code, name, category) VALUES (?, ?, ?)");
  db.transaction((rows: FoodItem[]) => { for (const r of rows) stmt.run(r.code, r.name, r.category); })(items);
}

export function insertGIValues(items: GIItem[]): void {
  if (!db) return;
  const stmt = db.prepare("INSERT INTO gi_values (food_name, gi_value, gi_level, category) VALUES (?, ?, ?, ?)");
  db.transaction((rows: GIItem[]) => { for (const r of rows) stmt.run(r.food_name, r.value, r.level, r.category); })(items);
}

// === 统计 ===

export function getStats(): {
  foodCount: number; giCount: number; categoryCount: number; nutrientCount: number
} {
  if (!db) return { foodCount: 0, giCount: 0, categoryCount: 0, nutrientCount: 0 };
  return {
    foodCount: (db.prepare("SELECT COUNT(*) as c FROM foods").get() as { c: number }).c,
    giCount: (db.prepare("SELECT COUNT(*) as c FROM gi_values").get() as { c: number }).c,
    categoryCount: (db.prepare("SELECT COUNT(*) as c FROM food_categories").get() as { c: number }).c,
    nutrientCount: (db.prepare("SELECT COUNT(*) as c FROM nutrient_definitions").get() as { c: number }).c,
  };
}
