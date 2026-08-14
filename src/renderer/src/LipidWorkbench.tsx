import { useState, useCallback } from "react";
import {
  judgeLipidItem, summarizeLipid, syndromeMatch,
  ALL_SYMPTOMS, type LipidInput, type SyndromeResult,
} from "./hyperlipidemia";
import type { Lang } from "./i18n";

interface Props {
  lang: Lang;
  t: (key: string) => string;
}

const i18n = {
  // 中文
  zh: {
    title: "🫀 血脂工作台",
    desc: "输入血脂化验单 + 勾选症状，系统按《成人高脂血症食养指南(2023)》给出判断与食养方案",
    lipidTitle: "① 血脂化验单（mmol/L）",
    tc: "总胆固醇 TC",
    tg: "甘油三酯 TG",
    ldl: "低密度脂蛋白 LDL-C",
    hdl: "高密度脂蛋白 HDL-C",
    lipidPlaceholder: "如 5.8",
    symptomTitle: "② 勾选您的症状（可多选）",
    symHint: "点击症状标签选择/取消",
    analyze: "🔍 生成辨证与食养方案",
    resultLipid: "📊 血脂水平判断",
    resultSyndrome: "🀄 中医辨证分型",
    noSyndrome: "未勾选症状，无法辨证。建议咨询中医师结合舌象脉象判断。",
    syndromeMatch: "匹配度排序",
    matched: "命中症状",
    tongue: "舌象",
    pulse: "脉象",
    keyPoint: "辨证要点",
    foodMatter: "🌿 推荐食药物质",
    recipes: "🍽️ 证型食谱示例",
    formulas: "🍵 茶饮与食养方",
    teas: "茶饮",
    dishes: "食养方",
    materials: "材料",
    usage: "用法",
    method: "做法",
    taboo: "禁忌",
    breakfast: "早餐",
    lunch: "中餐",
    dinner: "晚餐",
    snack: "加餐",
    tea: "茶饮",
    oilSalt: "油、盐",
    noData: "暂无数据",
    high: "偏高",
    borderline: "边缘升高",
    normal: "正常",
    low: "偏低",
    unit: "mmol/L",
    chooseFirst: "⚠️ 请至少填写一项血脂数值或勾选一个症状",
    disclaimer: "⚠️ 本工具依据《成人高脂血症食养指南(2023年版)》提供食养参考，不替代临床诊断。如有疑问请咨询注册营养师或医生。",
    allNormal: "各项血脂指标均在正常范围内，继续保持健康生活方式。",
    ref: "参考范围",
  },
  // English
  en: {
    title: "🫀 Lipid Workbench",
    desc: "Enter lipid panel + select symptoms. System evaluates per Dietary Guideline for Adult Hyperlipidemia (2023)",
    lipidTitle: "① Lipid Panel (mmol/L)",
    tc: "Total Cholesterol TC",
    tg: "Triglycerides TG",
    ldl: "LDL-C",
    hdl: "HDL-C",
    lipidPlaceholder: "e.g. 5.8",
    symptomTitle: "② Select your symptoms (multi)",
    symHint: "Click symptom tags to toggle",
    analyze: "🔍 Generate TCM Pattern & Diet Plan",
    resultLipid: "📊 Lipid Level Assessment",
    resultSyndrome: "🀄 TCM Pattern Differentiation",
    noSyndrome: "No symptoms selected. Consult a TCM practitioner for tongue/pulse assessment.",
    syndromeMatch: "Ranked by match score",
    matched: "Matched symptoms",
    tongue: "Tongue",
    pulse: "Pulse",
    keyPoint: "Key pattern",
    foodMatter: "🌿 Recommended Food-Medicine",
    recipes: "🍽️ Recipe Examples",
    formulas: "🍵 Teas & Dietary Formulas",
    teas: "Teas",
    dishes: "Formulas",
    materials: "Ingredients",
    usage: "Usage",
    method: "Method",
    taboo: "Caution",
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
    tea: "Tea",
    oilSalt: "Oil/Salt",
    noData: "N/A",
    high: "High",
    borderline: "Borderline",
    normal: "Normal",
    low: "Low",
    unit: "mmol/L",
    chooseFirst: "⚠️ Fill at least one lipid value or select a symptom",
    disclaimer: "⚠️ Based on the 2023 Dietary Guideline for adult hyperlipidemia for dietary reference only. Not a clinical diagnosis.",
    allNormal: "All lipid values are within normal range. Maintain a healthy lifestyle.",
    ref: "Reference",
  },
};

export default function LipidWorkbench({ lang, t }: Props) {
  const L = i18n[lang];
  const [input, setInput] = useState<LipidInput>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ lipid: string[]; syndromes: SyndromeResult[] } | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const parseNum = (v: string): number | undefined => {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  };

  const toggleSymptom = useCallback((sym: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }, []);

  const handleAnalyze = useCallback(() => {
    setErrMsg("");
    const hasLipid = Object.values(input).some((v) => v !== undefined);
    const hasSymptom = checked.size > 0;
    if (!hasLipid && !hasSymptom) {
      setErrMsg(L.chooseFirst);
      return;
    }
    const lipid = summarizeLipid(input);
    const syndromes = syndromeMatch([...checked]);
    setResults({ lipid, syndromes });
  }, [input, checked, L]);

  const levelLabel = (lv: string) =>
    lv === "high" ? L.high : lv === "borderline" ? L.borderline : lv === "low" ? L.low : L.normal;
  const levelClass = (lv: string) =>
    lv === "high" ? "badge-high" : lv === "borderline" ? "badge-border" : lv === "low" ? "badge-low" : "badge-ok";

  // 收集所有唯一症状
  const uniqueSymptoms = Array.from(new Set(ALL_SYMPTOMS.flatMap((g) => g.symptoms)));

  return (
    <div className="lipid-workbench">
      <div className="lipid-header">
        <h2>{L.title}</h2>
        <p className="lipid-desc">{L.desc}</p>
      </div>

      <div className="lipid-body">
        {/* ① 化验单 */}
        <div className="lipid-card">
          <h3>{L.lipidTitle}</h3>
          <div className="lipid-grid">
            {(["TC", "TG", "LDL", "HDL"] as const).map((k) => (
              <label key={k} className="lipid-field">
                <span className="lipid-label">{i18n[lang][k as keyof typeof i18n.en] || k}</span>
                <input
                  type="number" step="0.01" min="0"
                  placeholder={L.lipidPlaceholder}
                  value={input[k] ?? ""}
                  onChange={(e) => setInput((p) => ({ ...p, [k]: parseNum(e.target.value) }))}
                />
                <span className="lipid-unit">{L.unit}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ② 症状 */}
        <div className="lipid-card">
          <h3>{L.symptomTitle}</h3>
          <p className="lipid-hint">{L.symHint}</p>
          <div className="symptom-tags">
            {uniqueSymptoms.map((sym) => (
              <button
                key={sym}
                className={`symptom-tag ${checked.has(sym) ? "on" : ""}`}
                onClick={() => toggleSymptom(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        <button className="lipid-analyze" onClick={handleAnalyze}>
          {L.analyze}
        </button>
        {errMsg && <div className="lipid-error">{errMsg}</div>}

        {/* 结果 */}
        {results && (
          <div className="lipid-results">
            {/* 血脂判断 */}
            <div className="lipid-card">
              <h3>{L.resultLipid}</h3>
              {results.lipid.map((line, i) => (
                <div key={i} className="lipid-line">{line}</div>
              ))}
            </div>

            {/* 辨证分型 */}
            <div className="lipid-card">
              <h3>{L.resultSyndrome}</h3>
              <p className="lipid-hint">{L.syndromeMatch}</p>
              {results.syndromes.length === 0 ? (
                <div className="lipid-no-data">{L.noSyndrome}</div>
              ) : (
                results.syndromes.map((s, idx) => (
                  <div key={s.name} className="syndrome-result">
                    <div className="syndrome-head">
                      <span className="syndrome-name">
                        {idx + 1}. {s.name}
                      </span>
                      <span className="syndrome-score">{"★".repeat(Math.min(Math.max(s.matchScore, 1), 3))}</span>
                    </div>
                    <div className="syndrome-meta">
                      <span><b>{L.keyPoint}:</b> {s.key}</span>
                      <span><b>{L.tongue}:</b> {s.tongue}</span>
                      <span><b>{L.pulse}:</b> {s.pulse}</span>
                      {s.matchedSymptoms.length > 0 && (
                        <span><b>{L.matched}:</b> {s.matchedSymptoms.join("、")}</span>
                      )}
                    </div>

                    {/* 食药物质 */}
                    <div className="syndrome-section">
                      <div className="syndrome-section-title">{L.foodMatter}</div>
                      <div className="syndrome-matter">{s.foodMatters}</div>
                    </div>

                    {/* 食谱 */}
                    {Object.keys(s.recipes).length > 0 && (
                      <div className="syndrome-section">
                        <div className="syndrome-section-title">{L.recipes}</div>
                        {Object.entries(s.recipes).map(([exName, meals]) => (
                          <details key={exName} className="recipe-details" open={idx === 0 && exName === Object.keys(s.recipes)[0]}>
                            <summary>{exName}</summary>
                            <div className="recipe-meals">
                              {(Object.entries(meals) as [string, string][]).map(([meal, content]) => (
                                <div key={meal} className="recipe-meal">
                                  <span className="recipe-meal-name">
                                    {meal === "早餐" ? L.breakfast : meal === "中餐" ? L.lunch : meal === "晚餐" ? L.dinner : meal === "加餐" ? L.snack : meal === "茶饮" ? L.tea : meal === "油、盐" ? L.oilSalt : meal}
                                  </span>
                                  <span className="recipe-meal-content">{content}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}

                    {/* 茶饮与食养方 */}
                    {(s.formulas.teas.length > 0 || s.formulas.dishes.length > 0) && (
                      <div className="syndrome-section">
                        <div className="syndrome-section-title">{L.formulas}</div>
                        {s.formulas.teas.length > 0 && (
                          <div className="formula-group">
                            <div className="formula-group-title">{L.teas}</div>
                            {s.formulas.teas.map((f, fi) => (
                              <details key={fi} className="formula-details">
                                <summary>{f.name}</summary>
                                <div className="formula-body">
                                  {f.materials && <p><b>{L.materials}:</b> {f.materials}</p>}
                                  {f.usage && <p><b>{L.usage}:</b> {f.usage}</p>}
                                  {f.taboo && <p className="formula-taboo"><b>{L.taboo}:</b> {f.taboo}</p>}
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                        {s.formulas.dishes.length > 0 && (
                          <div className="formula-group">
                            <div className="formula-group-title">{L.dishes}</div>
                            {s.formulas.dishes.map((f, fi) => (
                              <details key={fi} className="formula-details">
                                <summary>{f.name}</summary>
                                <div className="formula-body">
                                  {f.materials && <p><b>{L.materials}:</b> {f.materials}</p>}
                                  {f.method && <p><b>{L.method}:</b> {f.method}</p>}
                                  {f.usage && <p><b>{L.usage}:</b> {f.usage}</p>}
                                  {f.taboo && <p className="formula-taboo"><b>{L.taboo}:</b> {f.taboo}</p>}
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="lipid-disclaimer">{L.disclaimer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
