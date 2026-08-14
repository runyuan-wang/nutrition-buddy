/**
 * 多智能体会诊工作台（M1）— 营养MDT
 *
 * 长生四段闭环 UI：选档案 → 勾顾问 → 出会诊单 → 终审回流（经验补丁进分身候审）
 */
import { useState, useEffect, useCallback } from "react";
import type { Lang } from "./i18n";
import type { AgentDef, ConsultResult, ConsultMeta, UserProfile, ProviderCatalogEntry } from "./types";

type T = (key: string) => string;

const i18n = {
  zh: {
    title: "🤝 多智能体会诊",
    desc: "营养MDT：多个专科顾问Agent并行会诊 → 主持人汇总分歧与高危复核 → 你终审（经验可沉淀为分身补丁）",
    step1: "① 用户档案",
    profileSelect: "选择用户档案",
    noProfile: "不使用档案（临时摘要）",
    tempSummary: "临时档案摘要（不用档案时填写，如：45岁男性 BMI28 糖尿病 高血压）",
    step2: "② 会诊问题",
    questionPh: "如：2型糖尿病合并高血压合并CKD3期，BMI 28，如何安排饮食？",
    step3: "③ 参会顾问（不选=自动匹配）",
    autoMatch: "自动匹配",
    runBtn: "发起会诊",
    running: "会诊中…（多路模型并行，约需1-2分钟）",
    historyTitle: "会诊历史",
    resultTitle: "会诊单",
    engineLLM: "多模型会诊",
    engineMock: "离线mock（未调用模型）",
    population: "检出人群",
    noPopulation: "未检出特殊人群",
    opinionsTitle: "各专科意见（候选，须终审）",
    moderationTitle: "主持人汇总",
    divergencesTitle: "⚠️ 意见分歧（需你仲裁）",
    riskTitle: "🚨 高危复核项（review_required，非阻断）",
    sheetTitle: "📄 完整会诊单（Markdown）",
    reviewTitle: "④ 终审回流",
    decision: "裁决",
    adopt: "采纳",
    reject: "驳回",
    adoptMod: "修改后采纳",
    rationalePh: "裁决理由（必填）",
    experiencePh: "经验补丁（可选）：想沉淀进专家分身的经验，如\"CKD3期合并糖尿病蛋白量按0.8g/kg起步\"",
    submitReview: "提交终审",
    reviewed: "已终审",
    patchCreated: "经验补丁已进入分身候审（proposed），去设置页采纳",
    agentsManage: "顾问管理",
    addAgent: "新建顾问",
    name: "名称",
    persona: "人设提示词",
    guides: "挂载指南（逗号分隔id）",
    provider: "绑定模型",
    temperature: "温度",
    save: "保存",
    delete: "删除",
    reset: "恢复预置",
    builtinNoDelete: "内置顾问不可删除（可停用）",
    enabled: "启用",
    mockEngine: "离线模式（不调用模型）",
  },
  en: {
    title: "🤝 Multi-Agent Consult",
    desc: "Nutrition MDT: parallel specialist agents → moderator summary with divergences & risk review → your final review",
    step1: "① User Profile",
    profileSelect: "Select profile",
    noProfile: "No profile (ad-hoc summary)",
    tempSummary: "Ad-hoc summary (e.g. 45y male BMI28 diabetes hypertension)",
    step2: "② Question",
    questionPh: "e.g. T2DM + hypertension + CKD3, BMI 28, dietary plan?",
    step3: "③ Agents (none = auto match)",
    autoMatch: "Auto match",
    runBtn: "Run Consult",
    running: "Consulting… (parallel models, ~1-2 min)",
    historyTitle: "History",
    resultTitle: "Consultation Sheet",
    engineLLM: "Multi-model consult",
    engineMock: "Offline mock",
    population: "Detected population",
    noPopulation: "None detected",
    opinionsTitle: "Specialist Opinions (candidates, need review)",
    moderationTitle: "Moderator Summary",
    divergencesTitle: "⚠️ Divergences (need arbitration)",
    riskTitle: "🚨 High-Risk Review Items (not blocking)",
    sheetTitle: "📄 Full Sheet (Markdown)",
    reviewTitle: "④ Final Review",
    decision: "Decision",
    adopt: "Adopt",
    reject: "Reject",
    adoptMod: "Adopt w/ modification",
    rationalePh: "Rationale (required)",
    experiencePh: "Experience patch (optional): to be distilled into expert avatar",
    submitReview: "Submit Review",
    reviewed: "Reviewed",
    patchCreated: "Experience patch proposed; adopt it in Settings",
    agentsManage: "Agent Management",
    addAgent: "New Agent",
    name: "Name",
    persona: "Persona prompt",
    guides: "Mounted guides (comma-separated ids)",
    provider: "Provider",
    temperature: "Temperature",
    save: "Save",
    delete: "Delete",
    reset: "Reset builtins",
    builtinNoDelete: "Built-in agents cannot be deleted (can disable)",
    enabled: "Enabled",
    mockEngine: "Offline mode (no model call)",
  },
};

interface Props {
  lang: Lang;
  t: T;
}

export default function ConsultWorkbench({ lang }: Props) {
  const L = (k: keyof (typeof i18n)["zh"]) => i18n[lang][k];
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [tempSummary, setTempSummary] = useState("");
  const [question, setQuestion] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [mockEngine, setMockEngine] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [history, setHistory] = useState<ConsultMeta[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [editing, setEditing] = useState<Partial<AgentDef> | null>(null);
  const [decision, setDecision] = useState<"adopt" | "reject" | "adopt_with_modification">("adopt");
  const [rationale, setRationale] = useState("");
  const [experience, setExperience] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");

  const reload = useCallback(async () => {
    try {
      const [p, a, pr, h] = await Promise.all([
        window.nutrition.profilesList(),
        window.nutrition.agentsList(),
        window.nutrition.providersCatalog(),
        window.nutrition.consultList(),
      ]);
      setProfiles(p);
      setAgents(a);
      setProviders(pr);
      setHistory(h);
    } catch (err) {
      console.error("加载会诊数据失败:", err);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const run = async () => {
    if (!question.trim() || running) return;
    setRunning(true);
    setReviewMsg("");
    try {
      const r = await window.nutrition.consultRun({
        profile_id: profileId || undefined,
        profile_summary: profileId ? undefined : tempSummary,
        question,
        agent_ids: selectedAgents.length ? selectedAgents : undefined,
        engine: mockEngine ? "mock" : "auto",
      });
      setResult(r);
      window.nutrition.consultList().then(setHistory);
    } catch (err) {
      console.error("会诊失败:", err);
    } finally {
      setRunning(false);
    }
  };

  const loadHistory = async (id: string) => {
    const r = await window.nutrition.consultGet(id);
    if (r) setResult(r);
  };

  const submitReview = async () => {
    if (!result || !rationale.trim()) return;
    const res = await window.nutrition.consultReview(result.consult_id, {
      decision,
      rationale,
      experience: experience.trim() || undefined,
    });
    setReviewMsg(res.message);
    if (res.ok) {
      const fresh = await window.nutrition.consultGet(result.consult_id);
      if (fresh) setResult(fresh);
    }
  };

  const saveAgent = async () => {
    if (!editing?.name?.trim()) return;
    await window.nutrition.agentsSave({
      ...editing,
      guides: typeof editing.guides === "string"
        ? (editing.guides as unknown as string).split(/[,，\s]+/).filter(Boolean)
        : editing.guides,
    });
    setEditing(null);
    reload();
  };

  const delAgent = async (id: string) => {
    const res = await window.nutrition.agentsDelete(id);
    if (!res.ok) alert(res.message);
    reload();
  };

  const opinionStatusBadge = (status: string) =>
    status === "ok" ? "" : status === "mock" ? " · 离线占位" : ` · ${status}`;

  return (
    <div className="knowledge-panel consult-panel">
      <div className="chat-header" style={{ margin: "-20px -24px 16px" }}>
        <h2>{L("title")}</h2>
      </div>
      <p className="settings-desc">{L("desc")}</p>

      {/* 配置区 */}
      <div className="consult-config">
        <div className="consult-section">
          <div className="consult-label">{lang === "zh" ? "① 用户档案" : "① Profile"}</div>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="settings-select">
            <option value="">{L("noProfile")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_default ? "（默认）" : ""} · {(p.conditions || []).join("、") || "无特殊状况"}
              </option>
            ))}
          </select>
          {!profileId && (
            <textarea
              className="consult-textarea"
              rows={2}
              value={tempSummary}
              onChange={(e) => setTempSummary(e.target.value)}
              placeholder={L("tempSummary")}
            />
          )}
        </div>

        <div className="consult-section">
          <div className="consult-label">{L("step2")}</div>
          <textarea
            className="consult-textarea"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={L("questionPh")}
          />
        </div>

        <div className="consult-section">
          <div className="consult-label">{L("step3")}</div>
          <div className="kb-filter-row">
            {agents.map((a) => (
              <button
                key={a.agent_id}
                className={`kb-filter-chip ${selectedAgents.includes(a.agent_id) ? "on" : ""} ${a.enabled ? "" : "dim"}`}
                onClick={() => toggleAgent(a.agent_id)}
                title={a.persona.slice(0, 80)}
              >
                {a.name}
              </button>
            ))}
          </div>
          <div className="consult-actions">
            <label className="consult-checkbox">
              <input type="checkbox" checked={mockEngine} onChange={(e) => setMockEngine(e.target.checked)} />
              {L("mockEngine")}
            </label>
            <button className="settings-primary-btn" onClick={run} disabled={running || !question.trim()}>
              {running ? L("running") : L("runBtn")}
            </button>
            <button className="settings-secondary-btn" onClick={() => { setShowManage(!showManage); setEditing(null); }}>
              {L("agentsManage")}
            </button>
          </div>
        </div>

        {/* 顾问管理 */}
        {showManage && (
          <div className="agent-manage">
            <div className="agent-manage-list">
              {agents.map((a) => (
                <div key={a.agent_id} className="agent-manage-row">
                  <span className={`agent-status-dot ${a.enabled ? "on" : ""}`} />
                  <strong>{a.name}</strong>
                  <span className="meta">{a.guides.join("/") || "-"} · {a.provider_id} · t={a.temperature}</span>
                  <label className="consult-checkbox">
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      onChange={async (e) => {
                        await window.nutrition.agentsSave({ agent_id: a.agent_id, enabled: e.target.checked });
                        reload();
                      }}
                    />
                    {L("enabled")}
                  </label>
                  <button className="settings-inline-btn" onClick={() => setEditing({ ...a })}>✎</button>
                  {/* M5c 复制为模板：内置顾问一键复制成自定义顾问再改造 */}
                  <button
                    className="settings-inline-btn"
                    title="复制为自定义顾问"
                    onClick={() => setEditing({ ...a, agent_id: undefined, name: a.name + "（副本）", builtin: false })}
                  >
                    ⧉
                  </button>
                  {!a.builtin && <button className="settings-inline-btn danger" onClick={() => delAgent(a.agent_id)}>🗑</button>}
                </div>
              ))}
              <button className="settings-secondary-btn" onClick={() => setEditing({ name: "", persona: "", guides: [], provider_id: "main", temperature: 0.4 })}>
                ＋ {L("addAgent")}
              </button>
              <button className="settings-secondary-btn" onClick={async () => { await window.nutrition.agentsReset(); reload(); }}>
                ↺ {L("reset")}
              </button>
            </div>
            {editing && (
              <div className="agent-edit-form">
                <input placeholder={L("name")} value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <textarea placeholder={L("persona")} rows={4} value={editing.persona || ""} onChange={(e) => setEditing({ ...editing, persona: e.target.value })} />
                <input
                  placeholder={L("guides")}
                  value={Array.isArray(editing.guides) ? editing.guides.join(",") : (editing.guides as unknown as string) || ""}
                  onChange={(e) => setEditing({ ...editing, guides: e.target.value as unknown as string[] })}
                />
                <select
                  className="settings-select"
                  value={editing.provider_id || "main"}
                  onChange={(e) => setEditing({ ...editing, provider_id: e.target.value })}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}{p.status === "configured" ? " ✅" : "（未配key，回退主模型）"}
                    </option>
                  ))}
                </select>
                <input
                  type="number" step="0.1" min="0" max="1"
                  value={editing.temperature ?? 0.4}
                  onChange={(e) => setEditing({ ...editing, temperature: Number(e.target.value) })}
                />
                <div className="consult-actions">
                  <button className="settings-primary-btn" onClick={saveAgent}>{L("save")}</button>
                  <button className="settings-secondary-btn" onClick={() => setEditing(null)}>✕</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 历史记录 */}
      {history.length > 0 && !result && (
        <div className="consult-history">
          <div className="consult-label">{L("historyTitle")}</div>
          {history.map((h) => (
            <div key={h.consult_id} className="food-result consult-history-item" onClick={() => loadHistory(h.consult_id)} style={{ cursor: "pointer" }}>
              <div className="name">{h.question.slice(0, 60)}</div>
              <div className="meta">
                {h.created_at.slice(0, 16).replace("T", " ")} · {h.engine === "llm" ? "多模型" : "mock"} · {h.agent_count}位顾问
                {h.has_review ? " · 已终审" : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 会诊结果 */}
      {result && (
        <div className="consult-result">
          <div className="consult-result-header">
            <h3>{L("resultTitle")} · {result.engine === "llm" ? L("engineLLM") : L("engineMock")}</h3>
            <button className="settings-inline-btn" onClick={() => setResult(null)}>✕</button>
          </div>
          <div className="meta">
            {L("population")}：{result.matched_population.length ? result.matched_population.join("、") : L("noPopulation")}
          </div>

          {result.opinions.map((o) => (
            <div key={o.agent_id + o.agent_name} className="opinion-card">
              <div className="opinion-card-head">
                <strong>◆ {o.agent_name}</strong>
                <span className="meta">{o.model || ""}{o.fallback ? "（回退主模型）" : ""}{opinionStatusBadge(o.status)}</span>
              </div>
              <div className="opinion-body">{o.content}</div>
            </div>
          ))}

          {result.moderation && (
            <div className="opinion-card moderator">
              <div className="opinion-card-head"><strong>🏛 {L("moderationTitle")}</strong></div>
              <div className="opinion-body">{result.moderation.content}</div>
            </div>
          )}

          {result.divergences.length > 0 && (
            <div className="risk-box divergence">
              <strong>{L("divergencesTitle")}</strong>
              <ol>{result.divergences.map((d, i) => <li key={i}>{d}</li>)}</ol>
            </div>
          )}

          {result.high_risk_items.length > 0 && (
            <div className="risk-box">
              <strong>{L("riskTitle")}</strong>
              <ul>
                {result.high_risk_items.map((h) => (
                  <li key={h.risk_key}><em>{h.risk_key}</em>：{h.note}</li>
                ))}
              </ul>
            </div>
          )}

          <details className="consult-sheet">
            <summary>{L("sheetTitle")}</summary>
            <pre>{result.sheet_md}</pre>
          </details>

          {/* 终审回流 */}
          <div className="review-box">
            <strong>{L("reviewTitle")}{result.review ? ` ✅ ${L("reviewed")}（${result.review.decision}）` : ""}</strong>
            {!result.review && (
              <>
                <div className="review-row">
                  <select className="settings-select" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
                    <option value="adopt">{L("adopt")}</option>
                    <option value="adopt_with_modification">{L("adoptMod")}</option>
                    <option value="reject">{L("reject")}</option>
                  </select>
                </div>
                <textarea className="consult-textarea" rows={2} placeholder={L("rationalePh")} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                <textarea className="consult-textarea" rows={2} placeholder={L("experiencePh")} value={experience} onChange={(e) => setExperience(e.target.value)} />
                <button className="settings-primary-btn" onClick={submitReview} disabled={!rationale.trim()}>
                  {L("submitReview")}
                </button>
              </>
            )}
            {reviewMsg && <div className="settings-status ok">{reviewMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
