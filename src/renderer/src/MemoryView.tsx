/**
 * 记忆库视图（M2）— 用户档案 + 跨会话长期记忆
 * 档案供会诊与对话自动引用；长期记忆按相关性注入系统提示词。
 */
import { useState, useEffect, useCallback } from "react";
import type { Lang } from "./i18n";
import type { UserProfile, MemoryFact } from "./types";

const i18n = {
  zh: {
    title: "🧠 记忆库",
    desc: "用户档案供会诊与对话自动引用；长期记忆跨会话保留、按相关性注入。全部本地文件，可随时查看和删除。",
    profilesTitle: "① 用户档案",
    newProfile: "＋ 新建档案",
    editProfile: "编辑档案",
    name: "称呼",
    age: "年龄",
    sex: "性别",
    height: "身高(cm)",
    weight: "体重(kg)",
    conditions: "健康状况（逗号分隔，如：糖尿病,高血压）",
    allergies: "过敏/不耐受（逗号分隔）",
    labs: "体检指标（每行一条：指标 值，如：LDL-C 4.2 mmol/L）",
    habits: "饮食运动习惯",
    goals: "目标（逗号分隔，如：减重5kg,控糖）",
    notes: "备注",
    isDefault: "设为默认档案（对话自动引用）",
    save: "保存档案",
    cancel: "取消",
    delete: "删除",
    default: "默认",
    memoriesTitle: "② 长期记忆",
    memoryPh: "想让我记住的事实，如：用户乳糖不耐受，改用无糖酸奶",
    addMemory: "添加记忆",
    noMemory: "暂无长期记忆",
    noProfileYet: "暂无用户档案，点击上方按钮新建",
  },
  en: {
    title: "🧠 Memory",
    desc: "Profiles are auto-referenced in chat & consults; long-term memories persist across sessions. All local files.",
    profilesTitle: "① User Profiles",
    newProfile: "＋ New Profile",
    editProfile: "Edit Profile",
    name: "Name",
    age: "Age",
    sex: "Sex",
    height: "Height(cm)",
    weight: "Weight(kg)",
    conditions: "Conditions (comma-separated)",
    allergies: "Allergies (comma-separated)",
    labs: "Labs (one per line: item value)",
    habits: "Diet & exercise habits",
    goals: "Goals (comma-separated)",
    notes: "Notes",
    isDefault: "Set as default profile",
    save: "Save Profile",
    cancel: "Cancel",
    delete: "Delete",
    default: "Default",
    memoriesTitle: "② Long-term Memory",
    memoryPh: "A fact to remember, e.g. lactose intolerant",
    addMemory: "Add Memory",
    noMemory: "No memories yet",
    noProfileYet: "No profiles yet. Click above to create one.",
  },
};

interface Props {
  lang: Lang;
}

const emptyProfile = {
  name: "", age: undefined as number | undefined, sex: "", height: undefined as number | undefined,
  weight: undefined as number | undefined, conditions: "", allergies: "", labs: "",
  diet_habits: "", goals: "", notes: "", is_default: false,
};

export default function MemoryView({ lang }: Props) {
  const L = (k: keyof (typeof i18n)["zh"]) => i18n[lang][k];
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [editing, setEditing] = useState<(typeof emptyProfile & { id?: string }) | null>(null);
  const [newMemory, setNewMemory] = useState("");

  const reload = useCallback(async () => {
    const [p, m] = await Promise.all([
      window.nutrition.profilesList(),
      window.nutrition.memoryList(),
    ]);
    setProfiles(p);
    setMemories(m);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const startEdit = (p?: UserProfile) => {
    if (p) {
      setEditing({
        id: p.id, name: p.name, age: p.age, sex: p.sex || "", height: p.height, weight: p.weight,
        conditions: (p.conditions || []).join(","), allergies: (p.allergies || []).join(","),
        labs: Object.entries(p.labs || {}).map(([k, v]) => `${k} ${v}`).join("\n"),
        diet_habits: p.diet_habits || "", goals: (p.goals || []).join(","), notes: p.notes || "",
        is_default: p.is_default,
      });
    } else {
      setEditing({ ...emptyProfile, is_default: profiles.length === 0 });
    }
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    const labs: Record<string, string> = {};
    editing.labs.split("\n").forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) labs[parts[0]] = parts.slice(1).join(" ");
    });
    await window.nutrition.profilesSave({
      id: editing.id,
      name: editing.name.trim(),
      age: editing.age ? Number(editing.age) : undefined,
      sex: editing.sex || undefined,
      height: editing.height ? Number(editing.height) : undefined,
      weight: editing.weight ? Number(editing.weight) : undefined,
      conditions: editing.conditions.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      allergies: editing.allergies.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      labs,
      diet_habits: editing.diet_habits || undefined,
      goals: editing.goals.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      notes: editing.notes || undefined,
      is_default: editing.is_default,
    });
    setEditing(null);
    reload();
  };

  const addMemory = async () => {
    if (!newMemory.trim()) return;
    await window.nutrition.memoryAdd({ content: newMemory.trim() });
    setNewMemory("");
    reload();
  };

  const field = (label: string, node: React.ReactNode, key?: string) => (
    <label className="settings-field" key={key}>
      <span className="settings-label">{label}</span>
      {node}
    </label>
  );

  return (
    <div className="knowledge-panel memory-panel">
      <div className="chat-header" style={{ margin: "-20px -24px 16px" }}>
        <h2>{L("title")}</h2>
      </div>
      <p className="settings-desc">{L("desc")}</p>

      {/* 用户档案 */}
      <div className="consult-label">{L("profilesTitle")}</div>
      <div className="profile-list">
        {profiles.map((p) => (
          <div key={p.id} className="food-result profile-card">
            <div className="name">
              {p.name}
              {p.is_default && <span className="gi-badge low" style={{ marginLeft: 8 }}>{L("default")}</span>}
            </div>
            <div className="meta">
              {[p.age ? `${p.age}岁` : "", p.sex || "", p.height && p.weight ? `${p.height}cm/${p.weight}kg` : "",
                (p.conditions || []).join("、")]
                .filter(Boolean).join(" · ")}
            </div>
            {(p.goals || []).length > 0 && <div className="meta">🎯 {(p.goals || []).join("、")}</div>}
            <div className="profile-actions">
              <button className="settings-inline-btn" onClick={() => startEdit(p)}>✎ {L("editProfile")}</button>
              <button
                className="settings-inline-btn danger"
                onClick={async () => { await window.nutrition.profilesDelete(p.id); reload(); }}
              >
                🗑 {L("delete")}
              </button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && !editing && <div className="meta">{L("noProfileYet")}</div>}
        {!editing && (
          <button className="settings-secondary-btn" onClick={() => startEdit()}>{L("newProfile")}</button>
        )}
      </div>

      {editing && (
        <div className="profile-edit-form">
          {field(L("name"), <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />)}
          <div className="field-row">
            {field(L("age"), <input type="number" value={editing.age ?? ""} onChange={(e) => setEditing({ ...editing, age: e.target.value ? Number(e.target.value) : undefined })} />)}
            {field(L("sex"), <input value={editing.sex} onChange={(e) => setEditing({ ...editing, sex: e.target.value })} />)}
            {field(L("height"), <input type="number" value={editing.height ?? ""} onChange={(e) => setEditing({ ...editing, height: e.target.value ? Number(e.target.value) : undefined })} />)}
            {field(L("weight"), <input type="number" value={editing.weight ?? ""} onChange={(e) => setEditing({ ...editing, weight: e.target.value ? Number(e.target.value) : undefined })} />)}
          </div>
          {field(L("conditions"), <input value={editing.conditions} onChange={(e) => setEditing({ ...editing, conditions: e.target.value })} placeholder="糖尿病,高血压" />)}
          {field(L("allergies"), <input value={editing.allergies} onChange={(e) => setEditing({ ...editing, allergies: e.target.value })} />)}
          {field(L("labs"), <textarea rows={3} value={editing.labs} onChange={(e) => setEditing({ ...editing, labs: e.target.value })} placeholder="LDL-C 4.2 mmol/L&#10;HbA1c 7.1%" />)}
          {field(L("habits"), <input value={editing.diet_habits} onChange={(e) => setEditing({ ...editing, diet_habits: e.target.value })} />)}
          {field(L("goals"), <input value={editing.goals} onChange={(e) => setEditing({ ...editing, goals: e.target.value })} />)}
          {field(L("notes"), <input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />)}
          <label className="consult-checkbox">
            <input type="checkbox" checked={editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
            {L("isDefault")}
          </label>
          <div className="consult-actions">
            <button className="settings-primary-btn" onClick={save}>{L("save")}</button>
            <button className="settings-secondary-btn" onClick={() => setEditing(null)}>{L("cancel")}</button>
          </div>
        </div>
      )}

      {/* 长期记忆 */}
      <div className="consult-label" style={{ marginTop: 24 }}>{L("memoriesTitle")}</div>
      <div className="memory-add-row">
        <input
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addMemory()}
          placeholder={L("memoryPh")}
        />
        <button className="settings-primary-btn" onClick={addMemory}>{L("addMemory")}</button>
      </div>
      <div className="memory-list">
        {memories.length === 0 && <div className="meta">{L("noMemory")}</div>}
        {memories.map((m) => (
          <div key={m.id} className="food-result memory-item">
            <div className="name" style={{ fontSize: 14 }}>{m.content}</div>
            <div className="meta">
              {m.created_at.slice(0, 16).replace("T", " ")} · {m.source}
              <button
                className="settings-inline-btn danger"
                style={{ marginLeft: 12 }}
                onClick={async () => { await window.nutrition.memoryDelete(m.id); reload(); }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
