import { useState, useCallback } from "react";
import {
  selfTestScore, tipsForSymptoms, GLUCOSE_DATA,
  SELF_TEST_SYMPTOMS, MAPPED_SYMPTOMS, type GlucoseTip,
} from "./glucose";
import type { Lang } from "./i18n";

interface Props {
  lang: Lang;
  t: (key: string) => string;
}

const i18n = {
  zh: {
    title: "🍬 控糖工作台",
    desc: "基于《控糖革命》科学体系：症状自测 → 匹配控糖窍门 → 组合策略",
    selfTitle: "① 血糖波动自测（勾选你有的症状）",
    selfHint: "命中 4 项以上建议开始控糖",
    selfResult: "📈 自测结果",
    hit: "命中症状",
    item: "项",
    levelStrong: "强烈建议开始控糖",
    levelWarn: "值得关注，建议调整",
    levelKeep: "继续保持，预防为主",
    matchTitle: "② 症状 → 推荐窍门",
    matchHint: "勾选你想改善的症状，看看推荐哪些窍门",
    matchResult: "🎯 推荐窍门（按优先级排序）",
    noTips: "请勾选至少一个症状",
    tipStars: "优先级",
    core: "核心做法",
    how: "怎么用",
    comboTitle: "🧩 组合策略（进阶）",
    dayTitle: "📅 一日控糖示范",
    breakfast: "早餐",
    lunch: "午餐",
    afternoon: "下午茶",
    good: "推荐",
    avoid: "避免",
    order: "进食顺序",
    extra: "加分项",
    tips: "窍门",
    chooseFirst: "⚠️ 请勾选至少一个症状",
    disclaimer: "⚠️ 本工具基于《控糖革命》科普内容，不替代医学诊断。糖尿病或低血糖人群请遵医嘱。",
  },
  en: {
    title: "🍬 Glucose Workbench",
    desc: "Based on Glucose Revolution: symptom self-test → matched hacks → combos",
    selfTitle: "① Glucose Spike Self-Test (select symptoms)",
    selfHint: "4+ hits suggests starting glucose control",
    selfResult: "📈 Self-Test Result",
    hit: "Hits",
    item: "",
    levelStrong: "Strongly recommended to start glucose control",
    levelWarn: "Worth attention, consider adjusting",
    levelKeep: "Keep it up, prevention first",
    matchTitle: "② Symptom → Recommended Hacks",
    matchHint: "Select symptoms you want to improve",
    matchResult: "🎯 Recommended Hacks (priority order)",
    noTips: "Select at least one symptom",
    tipStars: "Priority",
    core: "Core",
    how: "How to use",
    comboTitle: "🧩 Combo Strategies (advanced)",
    dayTitle: "📅 One-Day Glucose-Friendly Example",
    breakfast: "Breakfast",
    lunch: "Lunch",
    afternoon: "Snack",
    good: "Good",
    avoid: "Avoid",
    order: "Order",
    extra: "Bonus",
    tips: "Hacks",
    chooseFirst: "⚠️ Select at least one symptom",
    disclaimer: "⚠️ Based on Glucose Revolution for education only. Diabetics should follow medical advice.",
  },
};

export default function GlucoseWorkbench({ lang, t }: Props) {
  const L = i18n[lang];
  const [selfChecked, setSelfChecked] = useState<Set<string>>(new Set());
  const [matchChecked, setMatchChecked] = useState<Set<string>>(new Set());
  const [showSelf, setShowSelf] = useState(false);
  const [showMatch, setShowMatch] = useState(false);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (sym: string) =>
      set((prev) => {
        const next = new Set(prev);
        if (next.has(sym)) next.delete(sym);
        else next.add(sym);
        return next;
      });

  const toggleSelf = useCallback(toggle(setSelfChecked), []);
  const toggleMatch = useCallback(toggle(setMatchChecked), []);

  const selfResult = selfTestScore([...selfChecked]);
  const matchedTips: GlucoseTip[] = showMatch ? tipsForSymptoms([...matchChecked]) : [];

  const day = GLUCOSE_DATA.dayExample;

  return (
    <div className="lipid-workbench">
      <div className="lipid-header">
        <h2>{L.title}</h2>
        <p className="lipid-desc">{L.desc}</p>
      </div>

      <div className="lipid-body">
        {/* ① 自测 */}
        <div className="lipid-card">
          <h3>{L.selfTitle}</h3>
          <p className="lipid-hint">{L.selfHint}</p>
          <div className="symptom-tags">
            {SELF_TEST_SYMPTOMS.map((sym) => (
              <button key={sym} className={`symptom-tag ${selfChecked.has(sym) ? "on" : ""}`} onClick={() => toggleSelf(sym)}>
                {sym}
              </button>
            ))}
          </div>
          <button className="lipid-analyze" style={{ marginTop: 12 }} onClick={() => setShowSelf(true)}>
            {L.selfResult}
          </button>
          {showSelf && (
            <div className="glucose-self-result">
              <span className="glucose-hit-count">{selfResult.hitCount} {L.item}</span>
              <span className={`glucose-level ${selfResult.hitCount >= 4 ? "high" : selfResult.hitCount >= 2 ? "warn" : "ok"}`}>
                {selfResult.hitCount >= 4 ? L.levelStrong : selfResult.hitCount >= 2 ? L.levelWarn : L.levelKeep}
              </span>
            </div>
          )}
        </div>

        {/* ② 症状→窍门 */}
        <div className="lipid-card">
          <h3>{L.matchTitle}</h3>
          <p className="lipid-hint">{L.matchHint}</p>
          <div className="symptom-tags">
            {MAPPED_SYMPTOMS.map((sym) => (
              <button key={sym} className={`symptom-tag ${matchChecked.has(sym) ? "on" : ""}`} onClick={() => toggleMatch(sym)}>
                {sym}
              </button>
            ))}
          </div>
          <button className="lipid-analyze" style={{ marginTop: 12 }} onClick={() => setShowMatch(true)}>
            {L.matchResult}
          </button>
          {showMatch && (
            <div className="glucose-tips">
              {matchedTips.length === 0 ? (
                <div className="lipid-no-data">{L.noTips}</div>
              ) : (
                matchedTips.map((tip) => (
                  <div key={tip.id} className="glucose-tip">
                    <div className="glucose-tip-head">
                      <span className="glucose-tip-name">{L.tips} {tip.id}：{tip.name}</span>
                      <span className="syndrome-score">{"★".repeat(tip.stars)}</span>
                    </div>
                    <div className="glucose-tip-body">
                      <p><b>{L.core}:</b> {tip.core}</p>
                      <p><b>{L.how}:</b> {tip.application}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ③ 组合策略 */}
        <div className="lipid-card">
          <h3>{L.comboTitle}</h3>
          {GLUCOSE_DATA.combos.map((c, i) => (
            <div key={i} className="glucose-combo">
              <div className="glucose-combo-name">{c.name} <span className="glucose-combo-effect">({c.effect})</span></div>
              <div className="glucose-combo-tips">{c.tips}</div>
            </div>
          ))}
        </div>

        {/* ④ 一日示范 */}
        <div className="lipid-card">
          <h3>{L.dayTitle}</h3>
          <div className="glucose-day">
            <div className="glucose-day-block">
              <div className="glucose-day-meal">{L.breakfast}</div>
              <p>✅ {L.good}: {day.breakfast.good}</p>
              <p className="formula-taboo">❌ {L.avoid}: {day.breakfast.avoid}</p>
            </div>
            <div className="glucose-day-block">
              <div className="glucose-day-meal">{L.lunch}</div>
              <p>🔄 {L.order}: {day.lunch.order}</p>
              <p>➕ {L.extra}: {day.lunch.extra}</p>
            </div>
            <div className="glucose-day-block">
              <div className="glucose-day-meal">{L.afternoon}</div>
              <p>✅ {L.good}: {day.afternoon.good}</p>
              <p className="formula-taboo">❌ {L.avoid}: {day.afternoon.avoid}</p>
            </div>
          </div>
        </div>

        <div className="lipid-disclaimer">{L.disclaimer}</div>
      </div>
    </div>
  );
}
