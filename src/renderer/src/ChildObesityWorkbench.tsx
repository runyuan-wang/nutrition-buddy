import { useState, useCallback } from "react";
import {
  judgeChildBMI, matchChildSyndrome, ALL_CHILD_SYMPTOMS, REGIONS,
  OBESITY_DATA, type ChildInput, type RegionRecipe,
} from "./childhoodObesity";
import type { Lang } from "./i18n";

interface Props {
  lang: Lang;
  t: (key: string) => string;
}

const i18n = {
  zh: {
    title: "👶 儿童肥胖工作台",
    desc: "基于《儿童青少年肥胖食养指南(2024)》：BMI 评估 + 辨证分型 + 地区化食谱",
    bmiTitle: "① 儿童基本信息（BMI 评估）",
    age: "年龄（岁）",
    sex: "性别",
    male: "男",
    female: "女",
    height: "身高（cm）",
    weight: "体重（kg）",
    bmiResult: "📏 BMI 评估结果",
    bmi: "BMI",
    statusNormal: "正常",
    statusOverweight: "超重",
    statusObesity: "肥胖",
    bmiNote: "判定标准：WS/T 586-2018 学龄儿童青少年超重与肥胖筛查",
    symptomTitle: "② 勾选孩子症状（可多选）",
    analyze: "🔍 生成辨证与食养方案",
    resultSyndrome: "🀄 中医辨证分型",
    noSyndrome: "未勾选症状，无法辨证。建议咨询中医师结合舌象脉象判断。",
    keyPoint: "辨证要点",
    tongue: "舌象",
    pulse: "脉象",
    matched: "命中症状",
    foodMatter: "🌿 推荐食药物质",
    formulas: "🍵 辨证营养方",
    materials: "材料",
    method: "做法",
    usage: "用法",
    regionRecipes: "🗺️ 地区化食谱（24天样例）",
    region: "地区",
    recipes: "食谱",
    meals: "餐次",
    breakfast: "早餐",
    lunch: "中餐",
    dinner: "晚餐",
    snack: "零食",
    oilSalt: "油、盐",
    chooseFirst: "⚠️ 请填写身高体重并勾选至少一个症状",
    disclaimer: "⚠️ 本工具依据《儿童青少年肥胖食养指南(2024年版)》提供食养参考，不替代临床诊断。食药物质请在专业人员指导下使用。",
    fillBMITip: "填写年龄/性别/身高/体重后点击评估",
  },
  en: {
    title: "👶 Childhood Obesity Workbench",
    desc: "Based on Dietary Guideline for Childhood Obesity (2024): BMI + TCM pattern + regional recipes",
    bmiTitle: "① Child Info (BMI Assessment)",
    age: "Age (years)",
    sex: "Sex",
    male: "Male",
    female: "Female",
    height: "Height (cm)",
    weight: "Weight (kg)",
    bmiResult: "📏 BMI Assessment",
    bmi: "BMI",
    statusNormal: "Normal",
    statusOverweight: "Overweight",
    statusObesity: "Obesity",
    bmiNote: "Per WS/T 586-2018 child overweight/obesity screening",
    symptomTitle: "② Select symptoms (multi)",
    analyze: "🔍 Generate TCM Pattern & Diet Plan",
    resultSyndrome: "🀄 TCM Pattern Differentiation",
    noSyndrome: "No symptoms selected. Consult a TCM practitioner.",
    keyPoint: "Key pattern",
    tongue: "Tongue",
    pulse: "Pulse",
    matched: "Matched",
    foodMatter: "🌿 Recommended Food-Medicine",
    formulas: "🍵 Pattern Formulas",
    materials: "Ingredients",
    method: "Method",
    usage: "Usage",
    regionRecipes: "🗺️ Regional Recipes (24 days)",
    region: "Region",
    recipes: "Recipes",
    meals: "Meals",
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
    oilSalt: "Oil/Salt",
    chooseFirst: "⚠️ Fill height/weight and select a symptom",
    disclaimer: "⚠️ Based on the 2024 guideline for dietary reference only. Not a clinical diagnosis.",
    fillBMITip: "Fill age/sex/height/weight then assess",
  },
};

export default function ChildObesityWorkbench({ lang, t }: Props) {
  const L = i18n[lang];
  const [child, setChild] = useState<ChildInput>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bmiResult, setBmiResult] = useState<ReturnType<typeof judgeChildBMI> | null>(null);
  const [results, setResults] = useState<ReturnType<typeof matchChildSyndrome> | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const toggleSymptom = useCallback((sym: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }, []);

  const handleAssess = useCallback(() => {
    setBmiResult(judgeChildBMI(child));
  }, [child]);

  const handleAnalyze = useCallback(() => {
    setErrMsg("");
    if (checked.size === 0) {
      setErrMsg(L.chooseFirst);
      return;
    }
    setResults(matchChildSyndrome([...checked]));
  }, [checked, L]);

  const bmiStatusClass =
    bmiResult?.status === "obesity" ? "badge-high"
    : bmiResult?.status === "overweight" ? "badge-border"
    : bmiResult?.status === "normal" ? "badge-ok" : "";

  return (
    <div className="lipid-workbench">
      <div className="lipid-header">
        <h2>{L.title}</h2>
        <p className="lipid-desc">{L.desc}</p>
      </div>

      <div className="lipid-body">
        {/* ① BMI */}
        <div className="lipid-card">
          <h3>{L.bmiTitle}</h3>
          <p className="lipid-hint">{L.fillBMITip}</p>
          <div className="lipid-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
            <label className="lipid-field">
              <span className="lipid-label">{L.age}</span>
              <input type="number" min="6" max="18" value={child.age ?? ""}
                onChange={(e) => setChild((p) => ({ ...p, age: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
            <label className="lipid-field">
              <span className="lipid-label">{L.sex}</span>
              <select className="settings-select" value={child.sex ?? ""}
                onChange={(e) => setChild((p) => ({ ...p, sex: e.target.value as ChildInput["sex"] }))}>
                <option value="">-</option>
                <option value="男">{L.male}</option>
                <option value="女">{L.female}</option>
              </select>
            </label>
            <label className="lipid-field">
              <span className="lipid-label">{L.height}</span>
              <input type="number" min="100" max="200" value={child.height ?? ""}
                onChange={(e) => setChild((p) => ({ ...p, height: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
            <label className="lipid-field">
              <span className="lipid-label">{L.weight}</span>
              <input type="number" min="15" max="120" value={child.weight ?? ""}
                onChange={(e) => setChild((p) => ({ ...p, weight: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
          </div>
          <button className="lipid-analyze" style={{ marginTop: 12 }} onClick={handleAssess}>
            {L.bmiResult}
          </button>
          {bmiResult && bmiResult.status !== "invalid" && (
            <div className="glucose-self-result">
              <span className="glucose-hit-count">{L.bmi}: {bmiResult.bmi}</span>
              <span className={`glucose-level ${bmiResult.status === "obesity" ? "high" : bmiResult.status === "overweight" ? "warn" : "ok"}`}>
                {bmiResult.status === "obesity" ? L.statusObesity : bmiResult.status === "overweight" ? L.statusOverweight : L.statusNormal}
              </span>
            </div>
          )}
          <p className="lipid-hint" style={{ marginTop: 8, fontSize: 11 }}>{L.bmiNote}</p>
        </div>

        {/* ② 症状 */}
        <div className="lipid-card">
          <h3>{L.symptomTitle}</h3>
          <div className="symptom-tags">
            {ALL_CHILD_SYMPTOMS.map((sym) => (
              <button key={sym} className={`symptom-tag ${checked.has(sym) ? "on" : ""}`} onClick={() => toggleSymptom(sym)}>
                {sym}
              </button>
            ))}
          </div>
        </div>

        <button className="lipid-analyze" onClick={handleAnalyze}>{L.analyze}</button>
        {errMsg && <div className="lipid-error">{errMsg}</div>}

        {/* 辨证结果 */}
        {results && (
          <div className="lipid-card">
            <h3>{L.resultSyndrome}</h3>
            {results.length === 0 ? (
              <div className="lipid-no-data">{L.noSyndrome}</div>
            ) : (
              results.map((s, idx) => (
                <div key={s.name} className="syndrome-result">
                  <div className="syndrome-head">
                    <span className="syndrome-name">{idx + 1}. {s.name}</span>
                    <span className="syndrome-score">{"★".repeat(Math.min(Math.max(s.matchScore, 1), 3))}</span>
                  </div>
                  <div className="syndrome-meta">
                    <span><b>{L.keyPoint}:</b> {s.key}</span>
                    <span><b>{L.tongue}:</b> {s.tongue}</span>
                    <span><b>{L.pulse}:</b> {s.pulse}</span>
                    {s.matchedSymptoms.length > 0 && <span><b>{L.matched}:</b> {s.matchedSymptoms.join("、")}</span>}
                  </div>
                  <div className="syndrome-section">
                    <div className="syndrome-section-title">{L.foodMatter}</div>
                    <div className="syndrome-matter">{s.foodMatters}</div>
                  </div>
                  {s.formulas.length > 0 && (
                    <div className="syndrome-section">
                      <div className="syndrome-section-title">{L.formulas}</div>
                      {s.formulas.map((f, fi) => (
                        <details key={fi} className="formula-details">
                          <summary>{f.name}</summary>
                          <div className="formula-body">
                            {f.materials && <p><b>{L.materials}:</b> {f.materials}</p>}
                            {f.method && <p><b>{L.method}:</b> {f.method}</p>}
                            {f.usage && <p><b>{L.usage}:</b> {f.usage}</p>}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 地区食谱 */}
        <div className="lipid-card">
          <h3>{L.regionRecipes}</h3>
          {REGIONS.map((region) => (
            <div key={region} className="syndrome-section" style={{ marginTop: 4 }}>
              <div className="syndrome-section-title">{region}</div>
              {OBESITY_DATA.regions[region].map((r: RegionRecipe, ri: number) => (
                <details key={ri} className="recipe-details" open={region === REGIONS[0] && ri === 0}>
                  <summary>{r.name}</summary>
                  <div className="recipe-meals">
                    {Object.entries(r.meals).map(([meal, content]) => (
                      <div key={meal} className="recipe-meal">
                        <span className="recipe-meal-name">
                          {meal === "早餐" ? L.breakfast : meal === "中餐" ? L.lunch : meal === "晚餐" ? L.dinner : meal === "零食" ? L.snack : meal === "油、盐" ? L.oilSalt : meal}
                        </span>
                        <span className="recipe-meal-content">{content}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>

        <div className="lipid-disclaimer">{L.disclaimer}</div>
      </div>
    </div>
  );
}
