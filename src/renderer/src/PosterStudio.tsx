/**
 * 宣教图工作台（M7b）
 *
 * 营养师出图的真实工作流：
 *   选模板 → AI 起草文案（可选）→ 本人校准 → 生图 → 发用户
 * 模板：今日食谱卡片 / 营养科普海报 / 一周食谱总览 / 食养误区提醒 / 自由创作
 */
import { useCallback, useEffect, useState } from "react";
import type { PosterInput, PosterImageResult, PosterImageMeta, PosterDraftResult, PosterTemplateId } from "./types";

interface Tpl {
  id: PosterTemplateId;
  label: string;
  ico: string;
  titlePh: string;
  pointsPh: string;
}

const TEMPLATES: Tpl[] = [
  { id: "recipe_card", label: "今日食谱卡片", ico: "🍽️", titlePh: "例：控糖一日三餐", pointsPh: "早餐：燕麦牛奶+水煮蛋\n午餐：杂粮饭+清蒸鱼+焯油菜\n晚餐：荞麦面+豆腐煲（份量见宣教单）" },
  { id: "science_poster", label: "营养科普海报", ico: "📢", titlePh: "例：每天半斤水果就够啦", pointsPh: "水果不能替代蔬菜\n果汁≠水果\n两餐之间吃最佳" },
  { id: "weekly_plan", label: "一周食谱总览", ico: "📅", titlePh: "例：张阿姨的一周控糖餐单", pointsPh: "可留空或填写备注（如忌口、能量目标）" },
  { id: "myth_buster", label: "食养误区提醒", ico: "⚠️", titlePh: "例：喝粥养胃？", pointsPh: "❌ 白粥升糖快\n✅ 杂粮粥配蛋白质\n✅ 胃口差少量多餐" },
  { id: "free", label: "自由创作", ico: "🎨", titlePh: "描述你想生成的画面（将作为完整描述）", pointsPh: "可选：补充细节要点" },
];

const STYLES = ["清新扁平插画", "水彩手绘", "真实食物摄影", "国风水墨", "儿童卡通风"];

export default function PosterStudio({ lang }: { lang: "zh" | "en" }) {
  const [tpl, setTpl] = useState<PosterTemplateId>("recipe_card");
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [result, setResult] = useState<PosterImageResult | null>(null);
  const [history, setHistory] = useState<PosterImageMeta[]>([]);
  const [draftHint, setDraftHint] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await window.nutrition.posterList(12));
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const activeTpl = TEMPLATES.find((t) => t.id === tpl)!;

  const handleDraft = useCallback(async () => {
    if (!title.trim() && tpl !== "free") { setDraftHint(lang === "zh" ? "自由起草请先写个主题，或直接在下方标题栏写主题后点此润色" : "Enter a topic first"); return; }
    setDrafting(true);
    setDraftHint("");
    try {
      const topic = title.trim() || points.trim().slice(0, 50);
      const r: PosterDraftResult = await window.nutrition.posterDraft(topic, audience, tpl);
      if (r.ok && r.title) {
        setTitle(r.title);
        if (r.points?.length) setPoints(r.points.join("\n"));
        setDraftHint(lang === "zh" ? "✅ 已起草，请校准后再生成（AI 文案仅供参考）" : "Drafted, review before generating");
      } else {
        setDraftHint(`❌ ${r.message}`);
      }
    } catch (e) {
      setDraftHint(`❌ ${String(e)}`);
    } finally {
      setDrafting(false);
    }
  }, [title, points, audience, tpl, lang]);

  const handleGenerate = useCallback(async () => {
    if (!title.trim()) { setResult({ ok: false, message: lang === "zh" ? "请先填写标题（或自由创作的画面描述）" : "Title required" }); return; }
    setBusy(true);
    setResult(null);
    try {
      const input: PosterInput = { template: tpl, title, points, audience, style };
      const r = await window.nutrition.posterGenerate(input);
      setResult(r);
      if (r.ok) loadHistory();
    } catch (e) {
      setResult({ ok: false, message: String(e) });
    } finally {
      setBusy(false);
    }
  }, [tpl, title, points, audience, style, lang, loadHistory]);

  return (
    <div className="knowledge-panel">
      <div className="chat-header" style={{ margin: "-20px -24px 16px", padding: "12px 24px" }}>
        <h2>🎨 {lang === "zh" ? "宣教图工作台" : "Poster Studio"}</h2>
        <span className="status">{lang === "zh" ? "给用户做的食养宣教材料" : "Education materials"}</span>
      </div>

      <div className="poster-grid">
        {/* 左：创作表单 */}
        <div className="poster-card">
          <h4>📝 {lang === "zh" ? "创作" : "Compose"}</h4>
          <div className="poster-tpl">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={tpl === t.id ? "on" : ""} onClick={() => setTpl(t.id)}>
                {t.ico} {t.label}
              </button>
            ))}
          </div>

          <div className="poster-form">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={activeTpl.titlePh}
            />
            <textarea
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder={activeTpl.pointsPh}
              rows={5}
              style={{ resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder={lang === "zh" ? "目标人群（选填，如：糖尿病中老年用户）" : "Audience (optional)"}
                style={{ flex: 1 }}
              />
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="kb-filter-chip"
                onClick={handleDraft}
                disabled={drafting}
                style={{ border: "1.5px solid var(--border-strong)", background: "#fff", padding: "8px 14px", fontSize: 13, cursor: drafting ? "wait" : "pointer" }}
              >
                {drafting ? "✍️ 起草中…" : "✨ AI 起草文案"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={busy}
                style={{
                  flex: 1, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600,
                  color: "#fff", cursor: busy ? "wait" : "pointer",
                  background: "linear-gradient(135deg,#2ba26b,#1f8a5c)",
                  boxShadow: "0 4px 12px rgba(31,138,92,.3)",
                }}
              >
                {busy ? "🎨 生成中…（约10-30秒）" : "🎨 生成宣教图"}
              </button>
            </div>
            {draftHint && <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{draftHint}</div>}
          </div>
        </div>

        {/* 右：预览 */}
        <div className="poster-card">
          <h4>🖼️ {lang === "zh" ? "预览" : "Preview"}</h4>
          {result && !result.ok && <div className="poster-err">{result.message}</div>}
          <div className="poster-preview">
            {busy && (
              <div className="poster-busy">
                <div className="spin" />
                {lang === "zh" ? "正在生成宣教图…" : "Generating…"}
              </div>
            )}
            {!busy && result?.ok && result.dataUrl && (
              <>
                <img src={result.dataUrl} alt={result.prompt} />
                <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  📁 {result.path}
                </div>
              </>
            )}
            {!busy && !result?.ok && !result && (
              <div className="poster-empty">
                {lang === "zh"
                  ? "选择模板，填写文案（可让 AI 先起草），点「生成宣教图」。\n生成失败时请到 设置 → 图像生成 检查服务商与 API Key。"
                  : "Pick a template, compose copy, and generate.\nConfigure provider in Settings → Image Generation."}
              </div>
            )}
            {!busy && result && !result.ok && <div className="poster-empty">🤔</div>}
          </div>
        </div>
      </div>

      {/* 历史 */}
      {history.length > 0 && (
        <div className="poster-card" style={{ marginTop: 16 }}>
          <h4>🗂️ {lang === "zh" ? "最近生成（data/images）" : "Recent (data/images)"}</h4>
          <div className="poster-history">
            {history.map((h) => (
              <img key={h.id} src={h.dataUrl} alt={h.id} title={h.path} onClick={() => setResult({ ok: true, message: "", dataUrl: h.dataUrl, path: h.path, id: h.id, createdAt: h.createdAt })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
