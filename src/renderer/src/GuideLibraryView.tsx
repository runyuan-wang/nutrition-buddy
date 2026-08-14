import { useState, useCallback } from "react";
import { GUIDES, getGuide, matchGuideSyndromes, getGuideOverview } from "./guideLibrary";
import type { Lang } from "./i18n";

interface Props {
  lang: Lang;
  t: (key: string) => string;
}

const i18n = {
  zh: {
    title: "📚 食养指南库",
    desc: "国家卫健委官方食养指南全收录：选择指南 → 浏览证型/食谱/食养方，或勾症状辨证",
    overview: "📊 指南库总览",
    selectGuide: "选择指南",
    selectPlaceholder: "请选择一部指南...",
    syndromes: "中医证型",
    recipes: "食谱",
    formulas: "食养方",
    recipeCount: "套",
    syndromeTitle: "🀄 中医证型",
    syndromeMatchTitle: "🎯 症状辨证",
    symptomHint: "勾选用户症状，匹配最可能的证型（点击标签选择）",
    matchBtn: "🔍 匹配证型",
    matchedResult: "匹配结果",
    noMatch: "未勾选症状，或没有匹配到证型。建议结合舌象脉象由专业中医师辨证。",
    matchScore: "匹配度",
    matchedSymptoms: "命中症状",
    recipesTitle: "🍽️ 食谱示例",
    formulasTitle: "🍵 食养方",
    materials: "材料",
    method: "做法",
    usage: "用法",
    taboo: "禁忌",
    meals: "餐次",
    breakfast: "早餐",
    lunch: "中餐",
    dinner: "晚餐",
    snack: "加餐",
    tea: "茶饮",
    oilSalt: "油、盐",
    noData: "该指南暂无此部分数据",
    disclaimer: "⚠️ 所有内容基于国家卫生健康委发布的官方食养指南，仅供专业人员参考，不替代临床诊断。",
    totalGuides: "部指南",
    totalRecipes: "套食谱",
    totalSyndromes: "个证型",
    totalFormulas: "个食养方",
    year: "年版",
  },
  en: {
    title: "📚 Food Guide Library",
    desc: "Official NHC dietary guidelines: select a guide → browse patterns/recipes/formulas, or match symptoms",
    overview: "📊 Library Overview",
    selectGuide: "Select Guide",
    selectPlaceholder: "Choose a guide...",
    syndromes: "TCM Patterns",
    recipes: "Recipes",
    formulas: "Formulas",
    recipeCount: "sets",
    syndromeTitle: "🀄 TCM Patterns",
    syndromeMatchTitle: "🎯 Symptom Matching",
    symptomHint: "Select patient symptoms to match patterns (click tags)",
    matchBtn: "🔍 Match Patterns",
    matchedResult: "Match Result",
    noMatch: "No symptoms selected or no match. Consult a TCM practitioner.",
    matchScore: "Score",
    matchedSymptoms: "Matched",
    recipesTitle: "🍽️ Recipes",
    formulasTitle: "🍵 Formulas",
    materials: "Ingredients",
    method: "Method",
    usage: "Usage",
    taboo: "Caution",
    meals: "Meals",
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
    tea: "Tea",
    oilSalt: "Oil/Salt",
    noData: "No data for this guide",
    disclaimer: "⚠️ Based on official NHC dietary guidelines for professionals only. Not a clinical diagnosis.",
    totalGuides: "guides",
    totalRecipes: "recipes",
    totalSyndromes: "patterns",
    totalFormulas: "formulas",
    year: "",
  },
};

export default function GuideLibrary({ lang, t }: Props) {
  const L = i18n[lang];
  const [selectedId, setSelectedId] = useState<string>(GUIDES[0].id);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [matchResult, setMatchResult] = useState<ReturnType<typeof matchGuideSyndromes> | null>(null);

  const guide = getGuide(selectedId);
  const overview = getGuideOverview();

  const toggleSymptom = useCallback((sym: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }, []);

  const handleGuideChange = useCallback((id: string) => {
    setSelectedId(id);
    setChecked(new Set());
    setMatchResult(null);
  }, []);

  const handleMatch = useCallback(() => {
    if (!guide) return;
    setMatchResult(matchGuideSyndromes(guide, [...checked]));
  }, [guide, checked]);

  // 指南内所有证型的症状（去重）
  const allSymptoms = guide ? Array.from(new Set(guide.syndromes.flatMap((s) => s.symptoms))) : [];
  const mealLabel = (m: string) =>
    m === "早餐" ? L.breakfast : m === "中餐" ? L.lunch : m === "晚餐" ? L.dinner : m === "加餐" ? L.snack : m === "茶饮" ? L.tea : m === "油、盐" ? L.oilSalt : m;

  return (
    <div className="lipid-workbench">
      <div className="lipid-header">
        <h2>{L.title}</h2>
        <p className="lipid-desc">{L.desc}</p>
      </div>

      <div className="lipid-body">
        {/* 总览 */}
        <div className="lipid-card">
          <h3>{L.overview}</h3>
          <div className="guide-overview">
            <span className="guide-ov-item">📚 {overview.totalGuides} {L.totalGuides}</span>
            <span className="guide-ov-item">🍽️ {overview.totalRecipes} {L.totalRecipes}</span>
            <span className="guide-ov-item">🀄 {overview.totalSyndromes} {L.totalSyndromes}</span>
            <span className="guide-ov-item">🍵 {overview.totalFormulas} {L.totalFormulas}</span>
          </div>
        </div>

        {/* 指南选择 */}
        <div className="lipid-card">
          <h3>{L.selectGuide}</h3>
          <select className="settings-select" style={{ width: "100%", maxWidth: 420 }} value={selectedId} onChange={(e) => handleGuideChange(e.target.value)}>
            {GUIDES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}（{g.year}）
              </option>
            ))}
          </select>
          {guide && (
            <div className="guide-meta">
              <span>🀄 {guide.syndromeCount} {L.syndromes}</span>
              <span>🍽️ {guide.recipeCount} {L.recipeCount}</span>
              <span>🍵 {guide.formulaCount} {L.formulas}</span>
            </div>
          )}
        </div>

        {guide && (
          <>
            {/* 症状辨证 */}
            {guide.syndromes.length > 0 && (
              <div className="lipid-card">
                <h3>{L.syndromeMatchTitle}</h3>
                <p className="lipid-hint">{L.symptomHint}</p>
                <div className="symptom-tags">
                  {allSymptoms.map((sym) => (
                    <button key={sym} className={`symptom-tag ${checked.has(sym) ? "on" : ""}`} onClick={() => toggleSymptom(sym)}>
                      {sym}
                    </button>
                  ))}
                </div>
                <button className="lipid-analyze" style={{ marginTop: 12 }} onClick={handleMatch}>
                  {L.matchBtn}
                </button>
                {matchResult && (
                  <div className="glucose-tips">
                    {matchResult.length === 0 ? (
                      <div className="lipid-no-data">{L.noMatch}</div>
                    ) : (
                      matchResult.map((s, i) => (
                        <div key={s.name} className="syndrome-result">
                          <div className="syndrome-head">
                            <span className="syndrome-name">{i + 1}. {s.name}</span>
                            <span className="syndrome-score">{"★".repeat(Math.min(Math.max(s.matchScore, 1), 3))}</span>
                          </div>
                          {s.matched.length > 0 && (
                            <div className="syndrome-meta">
                              <span><b>{L.matchedSymptoms}:</b> {s.matched.join("、")}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 证型列表 */}
            {guide.syndromes.length > 0 && (
              <div className="lipid-card">
                <h3>{L.syndromeTitle}</h3>
                {guide.syndromes.map((s, i) => (
                  <div key={i} className="syndrome-result">
                    <div className="syndrome-head">
                      <span className="syndrome-name">{s.name}</span>
                    </div>
                    {s.symptoms.length > 0 && (
                      <div className="syndrome-meta">
                        <span>{s.symptoms.join("、")}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 食谱 */}
            {guide.recipes.length > 0 ? (
              <div className="lipid-card">
                <h3>{L.recipesTitle}（{guide.recipeCount} {L.recipeCount}）</h3>
                {guide.recipes.slice(0, 12).map((r, i) => (
                  <details key={i} className="recipe-details" open={i === 0}>
                    <summary>{L.recipes} {i + 1}</summary>
                    <div className="recipe-meals">
                      {Object.entries(r.meals).map(([meal, content]) => (
                        <div key={meal} className="recipe-meal">
                          <span className="recipe-meal-name">{mealLabel(meal)}</span>
                          <span className="recipe-meal-content">{content}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
                {guide.recipes.length > 12 && (
                  <div className="lipid-hint" style={{ marginTop: 8 }}>
                    ...共 {guide.recipeCount} 套（展开查看前 12 套）
                  </div>
                )}
              </div>
            ) : (
              <div className="lipid-card"><div className="lipid-no-data">{L.noData}</div></div>
            )}

            {/* 食养方 */}
            {guide.formulas.length > 0 && (
              <div className="lipid-card">
                <h3>{L.formulasTitle}（{guide.formulaCount}）</h3>
                {guide.formulas.map((f, i) => (
                  <details key={i} className="formula-details">
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
          </>
        )}

        <div className="lipid-disclaimer">{L.disclaimer}</div>
      </div>
    </div>
  );
}
