/**
 * 技能库视图（M3 + M5b）— 两态技能注册表 + 全生命周期
 * 指南/工具/工作台/自定义技能统一管理：启用停用即时生效（对话工具与会诊引擎按注册表调度）
 * M5b（对标 LearnBuddy Skills 共建共享）：文件导入 / 编辑更新 / 导出分享包 / 分享包导入
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { Lang } from "./i18n";
import type { SkillEntry, SkillBundle } from "./types";

const i18n = {
  zh: {
    title: "🧩 技能库",
    desc: "指南、工具、工作台、自定义技能统一注册。停用后对话与会诊立即不再调用（免改代码）。",
    groupGuide: "📖 食养指南技能",
    groupTool: "🔧 对话工具技能",
    groupWorkbench: "🖥 工作台技能",
    groupCustom: "✨ 自定义技能",
    population: "适用人群",
    boundary: "禁忌边界",
    evidence: "证据等级",
    version: "版本",
    enabled: "启用",
    importTitle: "导入自定义技能（知识态 md + 调度态注册）",
    importName: "技能名称",
    importContent: "技能内容（markdown，将注入会诊/对话上下文）",
    importPopulation: "适用人群（逗号分隔）",
    importBtn: "导入技能",
    pickFile: "📂 从本地文件导入（md/txt）",
    pickBundle: "📥 导入分享包（.json）",
    editBtn: "编辑",
    updateBtn: "更新覆盖",
    exportBtn: "导出分享",
    deleteBtn: "删除",
    editTitle: "编辑自定义技能（更新覆盖，版本日期自动留痕）",
    cancel: "取消",
    exported: "已导出分享包",
    deleted: "已删除",
    stats: "共",
    items: "项",
    official: "官方指南",
    builtin: "内置",
    custom: "自定义",
    distill: "蒸馏",
    confirmDelete: "确认删除该自定义技能？",
  },
  en: {
    title: "🧩 Skills",
    desc: "Unified registry for guides, tools, workbenches and custom skills. Toggle = instant effect.",
    groupGuide: "📖 Guide Skills",
    groupTool: "🔧 Tool Skills",
    groupWorkbench: "🖥 Workbench Skills",
    groupCustom: "✨ Custom Skills",
    population: "Population",
    boundary: "Boundary",
    evidence: "Evidence",
    version: "Version",
    enabled: "Enabled",
    importTitle: "Import custom skill",
    importName: "Skill name",
    importContent: "Content (markdown, injected into consult/chat context)",
    importPopulation: "Population (comma-separated)",
    importBtn: "Import",
    pickFile: "📂 Import from local files (md/txt)",
    pickBundle: "📥 Import bundle (.json)",
    editBtn: "Edit",
    updateBtn: "Update",
    exportBtn: "Export",
    deleteBtn: "Delete",
    editTitle: "Edit custom skill (overwrite, version date auto-stamped)",
    cancel: "Cancel",
    exported: "Bundle exported",
    deleted: "Deleted",
    stats: "",
    items: "skills",
    official: "Official guideline",
    builtin: "Built-in",
    custom: "Custom",
    distill: "Distilled",
    confirmDelete: "Delete this custom skill?",
  },
};

interface Props {
  lang: Lang;
}

const TYPE_LABEL: Record<string, keyof (typeof i18n)["zh"]> = {
  guide: "groupGuide",
  tool: "groupTool",
  workbench: "groupWorkbench",
  custom: "groupCustom",
};

export default function SkillsView({ lang }: Props) {
  const L = (k: keyof (typeof i18n)["zh"]) => i18n[lang][k];
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ name: "", content: "", population: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const bundleRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setSkills(await window.nutrition.skillsList());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  const toggle = async (id: string, enabled: boolean) => {
    await window.nutrition.skillsToggle(id, enabled);
    reload();
  };

  const doImport = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    await window.nutrition.skillsImport({
      name: form.name.trim(),
      content: form.content.trim(),
      population: form.population.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    setForm({ name: "", content: "", population: "" });
    setImporting(false);
    reload();
  };

  /** 本地文件导入：md/txt 多选，单文件 = 单技能（文件名做名称），多文件合并为一个技能 */
  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const texts: { filename: string; content: string }[] = [];
    for (const f of Array.from(files)) {
      const content = await f.text();
      texts.push({ filename: f.name, content });
    }
    if (texts.length === 1) {
      const name = texts[0].filename.replace(/\.(md|txt|markdown)$/i, "");
      setForm({ name, content: texts[0].content.trim(), population: form.population });
    } else {
      // 多文件合并为一个技能：正文按文件名分节
      const content = texts.map((t) => `## ${t.filename.replace(/\.(md|txt|markdown)$/i, "")}\n\n${t.content.trim()}`).join("\n\n");
      setForm({ ...form, content });
    }
    setImporting(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  /** 分享包导入 */
  const onPickBundle = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const bundle = JSON.parse(await files[0].text()) as SkillBundle;
      const r = await window.nutrition.skillsImportBundle(bundle);
      flash(r.ok ? `${r.message}：${r.entry?.name ?? ""}` : r.message);
      reload();
    } catch {
      flash("分享包解析失败（非有效 JSON）");
    }
    if (bundleRef.current) bundleRef.current.value = "";
  };

  /** 编辑回填 */
  const startEdit = async (id: string) => {
    const c = await window.nutrition.skillsContent(id);
    if (!c) return;
    const entry = skills.find((s) => s.skill_id === id);
    setForm({ name: c.name, content: c.content, population: entry?.applicable_population.join("，") ?? "" });
    setEditId(id);
    setImporting(false);
  };

  const doUpdate = async () => {
    if (!editId || !form.name.trim() || !form.content.trim()) return;
    await window.nutrition.skillsUpdate(editId, {
      name: form.name.trim(),
      content: form.content.trim(),
      population: form.population.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    setEditId(null);
    setForm({ name: "", content: "", population: "" });
    reload();
  };

  /** 导出分享包：浏览器端生成 .json 下载 */
  const doExport = async (id: string) => {
    const r = await window.nutrition.skillsExport(id);
    if (!r.ok || !r.bundle) { flash(r.message); return; }
    const blob = new Blob([JSON.stringify(r.bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skill-${r.bundle.skill.name.replace(/[\\/:*?"<>|]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash(L("exported"));
  };

  const doDelete = async (id: string) => {
    if (!confirm(L("confirmDelete"))) return;
    const r = await window.nutrition.skillsDelete(id);
    flash(r.ok ? L("deleted") : r.message);
    reload();
  };

  const renderGroup = (type: string) => {
    const list = skills.filter((s) => s.type === type);
    if (list.length === 0) return null;
    return (
      <div key={type} className="skill-group">
        <div className="consult-label">{L(TYPE_LABEL[type])}（{list.length}）</div>
        {list.map((s) => (
          <div key={s.skill_id} className={`food-result skill-card ${s.enabled ? "" : "off"}`}>
            <div className="name">
              {s.name}
              {s.evidence_level === "official_guideline" && (
                <span className="gi-badge low" style={{ marginLeft: 8 }}>{L("official")}</span>
              )}
              {s.type === "custom" && (
                <span className="gi-badge medium" style={{ marginLeft: 8 }}>{L("custom")}</span>
              )}
              {s.version_date && <span className="meta" style={{ marginLeft: 8 }}>{s.version_date}</span>}
            </div>
            {s.applicable_population.length > 0 && (
              <div className="meta">{L("population")}：{s.applicable_population.join("、")}</div>
            )}
            {s.contraindication_boundary && (
              <div className="meta">⛔ {L("boundary")}：{s.contraindication_boundary}</div>
            )}
            {s.type !== "tool" && (
              <button className="mini-btn" style={{ marginRight: 8 }} onClick={() => doExport(s.skill_id)}>
                ⇪ {L("exportBtn")}
              </button>
            )}
            {s.type === "custom" && (
              <>
                <button className="mini-btn" style={{ marginRight: 8 }} onClick={() => startEdit(s.skill_id)}>✎ {L("editBtn")}</button>
                <button className="mini-btn danger" onClick={() => doDelete(s.skill_id)}>🗑 {L("deleteBtn")}</button>
              </>
            )}
            <label className="skill-switch">
              <input type="checkbox" checked={s.enabled} onChange={(e) => toggle(s.skill_id, e.target.checked)} />
              <span>{L("enabled")}</span>
            </label>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="knowledge-panel skills-panel">
      <div className="chat-header" style={{ margin: "-20px -24px 16px" }}>
        <h2>{L("title")}</h2>
      </div>
      <p className="settings-desc">{L("desc")}（{L("stats")} {skills.length} {L("items")}）</p>
      {notice && <div className="settings-saved">{notice}</div>}

      {["guide", "tool", "workbench", "custom"].map(renderGroup)}

      {/* 编辑自定义技能（更新覆盖） */}
      {editId && (
        <div className="skill-import">
          <div className="consult-label" style={{ marginTop: 24 }}>{L("editTitle")}</div>
          <div className="profile-edit-form">
            <input placeholder={L("importName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea rows={8} placeholder={L("importContent")} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <input placeholder={L("importPopulation")} value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} />
            <div className="consult-actions">
              <button className="settings-primary-btn" onClick={doUpdate}>{L("updateBtn")}</button>
              <button className="settings-secondary-btn" onClick={() => { setEditId(null); setForm({ name: "", content: "", population: "" }); }}>{L("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入自定义技能 */}
      <div className="skill-import">
        <div className="consult-label" style={{ marginTop: 24 }}>{L("importTitle")}</div>
        {!importing && !editId ? (
          <div className="consult-actions" style={{ flexWrap: "wrap" }}>
            <button className="settings-secondary-btn" onClick={() => setImporting(true)}>＋ {L("importBtn")}</button>
            <button className="settings-secondary-btn" onClick={() => fileRef.current?.click()}>{L("pickFile")}</button>
            <button className="settings-secondary-btn" onClick={() => bundleRef.current?.click()}>{L("pickBundle")}</button>
          </div>
        ) : importing ? (
          <div className="profile-edit-form">
            <input placeholder={L("importName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea rows={5} placeholder={L("importContent")} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <input placeholder={L("importPopulation")} value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} />
            <div className="consult-actions">
              <button className="settings-primary-btn" onClick={doImport}>{L("importBtn")}</button>
              <button className="settings-secondary-btn" onClick={() => setImporting(false)}>✕</button>
            </div>
          </div>
        ) : null}
        <input ref={fileRef} type="file" accept=".md,.txt,.markdown" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
        <input ref={bundleRef} type="file" accept=".json" hidden onChange={(e) => onPickBundle(e.target.files)} />
      </div>
    </div>
  );
}
