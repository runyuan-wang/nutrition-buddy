import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage, AppSettings, GIItem, FoodItem, AvatarInfo, AvatarPatch, ChatMeta } from "./types";
import { IMAGE_PRESETS } from "./types";
import { useLang, type Lang } from "./i18n";
import LipidWorkbench from "./LipidWorkbench";
import GlucoseWorkbench from "./GlucoseWorkbench";
import ChildObesityWorkbench from "./ChildObesityWorkbench";
import GuideLibrary from "./GuideLibraryView";
import ConsultWorkbench from "./ConsultWorkbench";
import MemoryView from "./MemoryView";
import SkillsView from "./SkillsView";
import PosterStudio from "./PosterStudio";

type View = "chat" | "knowledge" | "lipid" | "glucose" | "child" | "guides" | "consult" | "memory" | "skills" | "poster" | "settings";

interface UIMessage extends ChatMessage {
  id: string;
  streaming?: boolean;
}

const SUGGESTION_KEYS = ["suggestion1", "suggestion2", "suggestion3", "suggestion4"] as const;

/** 预设模型（与主进程 settings.ts 保持一致） */
const PRESETS = [
  { id: "kimi-k3", label: "Kimi K3 (Moonshot)", baseURL: "https://api.moonshot.cn/v1", model: "kimi-k3" },
  { id: "kimi-k2.5", label: "Kimi K2.5 (Moonshot)", baseURL: "https://api.moonshot.cn/v1", model: "kimi-k2.5" },
  { id: "deepseek-chat", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "glm-4-flash", label: "GLM-4-Flash (智谱)", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "gpt-4o-mini", label: "GPT-4o-mini (OpenAI)", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "ollama", label: "Ollama 本地", baseURL: "http://localhost:11434/v1", model: "qwen2.5" },
] as const;

export default function App() {
  const { lang, toggle, t } = useLang();
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // 多对话会话（M6）：会话列表 + 当前会话，消息落盘 data/chats/*.json
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<
    { code: string; name: string; category: string }[]
  >([]);
  const [giResult, setGiResult] = useState<{
    food_name: string;
    value: number;
    level: string;
    category: string;
  } | null>(null);
  const [giFilter, setGiFilter] = useState<"低GI" | "中GI" | "高GI" | null>(null);
  const [giList, setGiList] = useState<GIItem[]>([]);
  const [classList, setClassList] = useState<{ code: string; name: string }[]>([]);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [activeClassName, setActiveClassName] = useState("");
  const [classFoods, setClassFoods] = useState<FoodItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 设置面板状态
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: "",
    baseURL: "",
    model: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [avatar, setAvatar] = useState<{
    name: string;
    title: string;
    source: string;
    exists: boolean;
  } | null>(null);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [patches, setPatches] = useState<AvatarPatch[]>([]);
  // M5a 分身创建向导（对标 LearnBuddy：素材导入 → AI 提炼 → 本人校准 → 启用）
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardName, setWizardName] = useState("");
  const [wizardPaste, setWizardPaste] = useState("");
  const [wizardFiles, setWizardFiles] = useState<{ filename: string; content: string }[]>([]);
  const [wizardDraft, setWizardDraft] = useState<string | null>(null);
  const [wizardEngine, setWizardEngine] = useState<"llm" | "template">("template");
  const [wizardBusy, setWizardBusy] = useState(false);
  const wizardFileRef = useRef<HTMLInputElement>(null);
  // 微信 Bot 连接（M6）
  const [wechatStatus, setWechatStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [wechatMsg, setWechatMsg] = useState("");

  /** 额外模型路由（会诊多模型用） */
  const EXTRA_PROVIDERS = [
    { id: "kimi", label: "Kimi / Moonshot", model: "kimi-k2.5" },
    { id: "deepseek", label: "DeepSeek", model: "deepseek-chat" },
    { id: "zhipu", label: "智谱 GLM", model: "glm-4-flash" },
    { id: "qwen", label: "通义千问", model: "qwen-plus" },
    { id: "openai", label: "OpenAI GPT", model: "gpt-4o-mini" },
  ];

  // 加载设置
  useEffect(() => {
    (async () => {
      try {
        const s = await window.nutrition.getSettings();
        setSettings(s);
      } catch (err) {
        console.error("加载设置失败:", err);
      } finally {
        setSettingsLoaded(true);
      }
    })();
    // 加载专家分身状态（展示用）
    window.nutrition
      .getExpertAvatar()
      .then(setAvatar)
      .catch((err) => console.error("加载专家分身失败:", err));
    // 加载分身目录与校准补丁
    window.nutrition.avatarsList().then(setAvatars).catch(() => {});
    window.nutrition.patchesList().then(setPatches).catch(() => {});
  }, []);

  // === 多对话会话（M6）：初始化会话列表，无会话则自动新建 ===
  const refreshChats = useCallback(async (): Promise<ChatMeta[]> => {
    const list = await window.nutrition.chatsList();
    setChats(list);
    return list;
  }, []);

  const switchChat = useCallback(async (id: string) => {
    const c = await window.nutrition.chatsGet(id);
    if (!c) return;
    setActiveChatId(id);
    setMessages(
      c.messages.map((m, i) => ({
        id: `${id}_${i}`,
        role: m.role as UIMessage["role"],
        content: m.content,
      }))
    );
  }, []);

  const newChat = useCallback(async () => {
    const c = await window.nutrition.chatsCreate();
    await refreshChats();
    setActiveChatId(c.id);
    setMessages([]);
    setView("chat");
  }, [refreshChats]);

  useEffect(() => {
    (async () => {
      try {
        let list = await window.nutrition.chatsList();
        if (list.length === 0) {
          await window.nutrition.chatsCreate();
          list = await window.nutrition.chatsList();
        }
        setChats(list);
        await switchChat(list[0].id);
      } catch (err) {
        console.error("加载会话失败:", err);
      }
    })();
  }, [switchChat]);

  // 菜单「新建对话」（Ctrl+N）
  const newChatRef = useRef(newChat);
  newChatRef.current = newChat;
  useEffect(() => {
    return window.nutrition.onMenuNewChat(() => newChatRef.current());
  }, []);

  // 加载食物大类列表（数字版成分表）
  useEffect(() => {    (async () => {
      try {
        const cats = await window.nutrition.getCategories();
        // 提取 8 个大类
        const seen = new Map<string, string>();
        cats.forEach((c) => {
          if (!seen.has(c.class_code)) seen.set(c.class_code, c.class_name);
        });
        setClassList(
          Array.from(seen.entries()).map(([code, name]) => ({ code, name }))
        );
      } catch (err) {
        console.error("加载分类失败:", err);
      }
    })();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 自动调整textarea高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: UIMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);

    // 收集流式token
    const history: ChatMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    window.nutrition.chatStream(
      history,
      (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + token }
              : m
          )
        );
      },
      async (fullText) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: fullText, streaming: false }
              : m
          )
        );
        setLoading(false);
        // 持久化本轮对话到会话文件（M6）
        if (activeChatId) {
          await window.nutrition
            .chatsAppend(activeChatId, [
              { role: "user", content: text },
              { role: "assistant", content: fullText },
            ])
            .catch(() => {});
          refreshChats();
        }
      },
      async (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `${t("errorPrefix")}${err}${t("errorSuffix")}`,
                  streaming: false,
                }
              : m
          )
        );
        setLoading(false);
        // 出错也保留用户消息与错误回复，便于回看
        if (activeChatId) {
          await window.nutrition
            .chatsAppend(activeChatId, [{ role: "user", content: text }])
            .catch(() => {});
          refreshChats();
        }
      }
    );
  }, [input, loading, messages, t, activeChatId, refreshChats]);

  const handleSearch = useCallback(async () => {
    if (!searchKeyword.trim()) return;
    const results = await window.nutrition.searchFood(searchKeyword);
    setSearchResults(results);
    setGiResult(null);
  }, [searchKeyword]);

  const handleQueryGI = useCallback(async (name: string) => {
    const result = await window.nutrition.queryGI(name);
    setGiResult(result);
  }, []);

  // 按GI等级筛选
  const handleFilterGI = useCallback(async (level: "低GI" | "中GI" | "高GI") => {
    setGiFilter(level);
    setActiveClass(null);
    setClassFoods([]);
    setSearchResults([]);
    const list = await window.nutrition.getFoodsByGILevel(level);
    setGiList(list);
  }, []);

  // 按大类浏览
  const handleBrowseClass = useCallback(async (code: string) => {
    setActiveClass(code);
    setGiFilter(null);
    setGiList([]);
    setSearchResults([]);
    const c = classList.find((x) => x.code === code);
    setActiveClassName(c?.name || "");
    const foods = await window.nutrition.getFoodsByClass(code);
    setClassFoods(foods);
  }, [classList]);

  // 保存设置
  const handleSaveSettings = useCallback(async () => {
    setSaveStatus("idle");
    try {
      const saved = await window.nutrition.saveSettings(settings);
      setSettings(saved);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("保存设置失败:", err);
      setSaveStatus("fail");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [settings]);

  // 测试微信 Bot 连接（M6）：先保存配置，再由主进程发测试消息
  const handleWechatTest = useCallback(async () => {
    setWechatStatus("testing");
    setWechatMsg("");
    try {
      await window.nutrition.saveSettings(settings);
      const r = await window.nutrition.wechatTest();
      setWechatStatus(r.ok ? "ok" : "fail");
      setWechatMsg(r.message);
    } catch (err) {
      setWechatStatus("fail");
      setWechatMsg(String(err));
    }
  }, [settings]);

  // 测试连接：主进程用最简请求验证 Key / BaseURL / Model（不依赖工具调用）
  const handleTestConnection = useCallback(async () => {    if (!settings.apiKey.trim()) {
      setTestStatus("fail");
      setTestMsg(t("noKeyWarning"));
      return;
    }
    setTestStatus("testing");
    setTestMsg("");
    try {
      const result = await window.nutrition.testConnection(settings);
      if (result.ok) {
        setTestStatus("ok");
        setTestMsg(`${t("testOk")}${result.message ? `（${result.message}）` : ""}`);
      } else {
        setTestStatus("fail");
        setTestMsg(`${t("testFail")}${result.message}`);
      }
    } catch (err) {
      setTestStatus("fail");
      setTestMsg(`${t("testFail")}${(err as Error).message}`);
    }
  }, [settings, t]);

  // 选择预设模型 → 自动填充 BaseURL 和 Model
  const handlePresetChange = useCallback(
    (presetId: string) => {
      const preset = PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setSettings((s) => ({
        ...s,
        baseURL: preset.baseURL,
        model: preset.model,
      }));
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessage = (msg: UIMessage) => {
    // 简单的markdown渲染：表格、代码块、粗体
    const content = msg.content;

    if (msg.streaming && content === "") {
      return (
        <div className="typing-indicator">
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </div>
      );
    }

    return <div>{formatMarkdown(content)}</div>;
  };

  // 简易markdown格式化
  const formatMarkdown = (text: string) => {
    const parts: React.ReactNode[] = [];
    const lines = text.split("\n");
    let inTable = false;
    let tableRows: string[] = [];

    const flushTable = () => {
      if (tableRows.length === 0) return;
      const parsed = tableRows.map((row) =>
        row
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c !== "")
      );
      if (parsed.length >= 2) {
        const headers = parsed[0];
        const rows = parsed.slice(2); // skip separator row
        parts.push(
          <table key={`tbl-${parts.length}`}>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      tableRows = [];
    };

    for (const line of lines) {
      if (line.trim().startsWith("|")) {
        inTable = true;
        tableRows.push(line);
      } else {
        if (inTable) {
          flushTable();
          inTable = false;
        }
        parts.push(<div key={`ln-${parts.length}`}>{line || "\u00A0"}</div>);
      }
    }
    if (inTable) flushTable();

    return <>{parts}</>;
  };

  const giLevelClass = (level: string) => {
    if (level.includes("低") || level.includes("Low")) return "low";
    if (level.includes("中") || level.includes("Medium")) return "medium";
    return "high";
  };

  const giLevelText = (level: string, lang: Lang) => {
    if (level.includes("低") || level.includes("Low")) return lang === "zh" ? "低GI" : "Low GI";
    if (level.includes("中") || level.includes("Medium")) return lang === "zh" ? "中GI" : "Medium GI";
    return lang === "zh" ? "高GI" : "High GI";
  };

  return (
    <div className="app">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-tile">🌿</span>
          <span className="logo-text">
            {t("appName")}
            <span className="logo-sub">NUTRITION BUDDY</span>
          </span>
        </div>
        <div className="sidebar-section">{t("features")}</div>
        <div
          className={`sidebar-item ${view === "chat" ? "active" : ""}`}
          onClick={() => setView("chat")}
        >
          <span className="nav-ico">💬</span>
          {t("navChat")}
        </div>
        <div
          className={`sidebar-item ${view === "consult" ? "active" : ""}`}
          onClick={() => setView("consult")}
        >
          <span className="nav-ico">🤝</span>
          {t("navConsult")}
        </div>
        <div
          className={`sidebar-item ${view === "poster" ? "active" : ""}`}
          onClick={() => setView("poster")}
        >
          <span className="nav-ico">🎨</span>
          {t("navPoster")}
        </div>
        <div
          className={`sidebar-item ${view === "memory" ? "active" : ""}`}
          onClick={() => setView("memory")}
        >
          <span className="nav-ico">🧠</span>
          {t("navMemory")}
        </div>
        <div
          className={`sidebar-item ${view === "skills" ? "active" : ""}`}
          onClick={() => setView("skills")}
        >
          <span className="nav-ico">🧩</span>
          {t("navSkills")}
        </div>
        <div className="sidebar-section">{"📚 知识工作台"}</div>
        <div
          className={`sidebar-item ${view === "knowledge" ? "active" : ""}`}
          onClick={() => setView("knowledge")}
        >
          <span className="nav-ico">🔍</span>
          {t("navKnowledge")}
        </div>
        <div
          className={`sidebar-item ${view === "guides" ? "active" : ""}`}
          onClick={() => setView("guides")}
        >
          <span className="nav-ico">📖</span>
          {t("navGuides")}
        </div>
        <div
          className={`sidebar-item ${view === "lipid" ? "active" : ""}`}
          onClick={() => setView("lipid")}
        >
          <span className="nav-ico">❤️</span>
          {t("navLipid")}
        </div>
        <div
          className={`sidebar-item ${view === "glucose" ? "active" : ""}`}
          onClick={() => setView("glucose")}
        >
          <span className="nav-ico">🩸</span>
          {t("navGlucose")}
        </div>
        <div
          className={`sidebar-item ${view === "child" ? "active" : ""}`}
          onClick={() => setView("child")}
        >
          <span className="nav-ico">🧒</span>
          {t("navChild")}
        </div>
        <div className="sidebar-section">⚙</div>
        <div
          className={`sidebar-item ${view === "settings" ? "active" : ""}`}
          onClick={() => setView("settings")}
        >
          <span className="nav-ico">⚙️</span>
          {t("navSettings")}
        </div>
        <div className="sidebar-footer">
          <button
            className="lang-toggle"
            onClick={toggle}
            title={t("langLabel")}
          >
            🌐 {lang === "zh" ? "English" : "中文"}
          </button>
          <br />
          {t("footerLine1")}
          <br />
          {t("footerLine2")}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main">
        {view === "chat" ? (
          <div className="chat-area">
            <div className="chat-header">
              <h2>{t("chatTitle")}</h2>
              <span className="status">
                {loading ? t("statusThinking") : t("statusReady")}
              </span>
            </div>

            {/* 会话栏（M6 多对话）：新建 / 切换 / 改名 / 删除 */}
            <div className="chat-sessions">
              <button
                className="chat-new-btn"
                onClick={newChat}
                title="新建对话 (Ctrl+N)"
              >
                ＋ 新对话
              </button>
              <div className="chat-session-list">
                {chats.map((c) => (
                  <div
                    key={c.id}
                    className={`chat-session-item ${c.id === activeChatId ? "active" : ""}`}
                    onClick={() => !loading && switchChat(c.id)}
                    title={`${c.title}（${c.message_count} 条消息）`}
                  >
                    <span className="chat-session-title">{c.title}</span>
                    <button
                      className="chat-session-act"
                      title="重命名"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const name = prompt("会话名称", c.title);
                        if (name && name.trim()) {
                          await window.nutrition.chatsRename(c.id, name.trim());
                          refreshChats();
                        }
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="chat-session-act danger"
                      title="删除会话"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`删除会话「${c.title}」？消息将一并删除。`)) return;
                        await window.nutrition.chatsDelete(c.id);
                        const list = await refreshChats();
                        if (c.id === activeChatId) {
                          if (list.length > 0) switchChat(list[0].id);
                          else newChat();
                        }
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="emoji">🌿</div>
                  <h3>{t("emptyTitle")}</h3>
                  <p>{t("emptyDesc")}</p>
                  <div className="suggestions">
                    {SUGGESTION_KEYS.map((key) => (
                      <button
                        key={key}
                        className="suggestion"
                        onClick={() => {
                          setInput(t(key));
                          textareaRef.current?.focus();
                        }}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.role}`}>
                    {renderMessage(msg)}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("inputPlaceholder")}
                rows={1}
                disabled={loading}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}>
                {t("send")}
              </button>
            </div>
          </div>
        ) : view === "knowledge" ? (
          <div className="knowledge-panel">
            <div className="chat-header" style={{ margin: "-20px -24px 16px" }}>
              <h2>{t("kbTitle")}</h2>
            </div>

            {/* 搜索 */}
            <div className="knowledge-search">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("kbPlaceholder")}
              />
              <button onClick={handleSearch}>{t("search")}</button>
            </div>

            {/* GI 等级筛选 */}
            <div className="kb-filter-row">
              {(["低GI", "中GI", "高GI"] as const).map((lv) => (
                <button
                  key={lv}
                  className={`kb-filter-chip ${giFilter === lv ? "on" : ""}`}
                  onClick={() => handleFilterGI(lv)}
                >
                  {lang === "zh" ? lv : lv === "低GI" ? "Low GI" : lv === "中GI" ? "Medium GI" : "High GI"}
                </button>
              ))}
            </div>

            {/* 分类浏览 */}
            <div className="kb-category-row">
              {classList.map((c) => (
                <button
                  key={c.code}
                  className={`kb-category-chip ${activeClass === c.code ? "on" : ""}`}
                  onClick={() => handleBrowseClass(c.code)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {searchResults.length > 0 && (
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  {t("foundPrefix")} {searchResults.length} {t("foundSuffix")}
                </p>
                {searchResults.map((food) => (
                  <div
                    key={food.code}
                    className="food-result"
                    onClick={() => handleQueryGI(food.name)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="name">{food.name}</div>
                    <div className="meta">
                      {t("metaCode")}: {food.code} · {t("metaCategory")}: {food.category}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* GI 筛选结果 */}
            {giList.length > 0 && (
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  {lang === "zh" ? `「${giFilter}」食物 ${giList.length} 个：` : `"${giFilter}" foods: ${giList.length}`}
                </p>
                {giList.map((g) => (
                  <div key={g.food_name} className="food-result">
                    <div className="name">
                      {g.food_name}
                      <span className={`gi-badge ${giLevelClass(g.level)}`} style={{ marginLeft: 8 }}>
                        {giLevelText(g.level, lang)} ({t("giBadge")}{g.value})
                      </span>
                    </div>
                    <div className="meta">{t("metaCategory")}: {g.category}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 分类浏览结果 */}
            {classFoods.length > 0 && (
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  {lang === "zh" ? `「${activeClassName}」食物 ${classFoods.length} 个，点击查看GI：` : `"${activeClassName}" foods: ${classFoods.length}. Click for GI:`}
                </p>
                {classFoods.map((food) => (
                  <div
                    key={food.code}
                    className="food-result"
                    onClick={() => handleQueryGI(food.name)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="name">{food.name}</div>
                    <div className="meta">
                      {t("metaCode")}: {food.code} · {t("metaCategory")}: {food.category}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {giResult && (
              <div className="food-result" style={{ marginTop: 16 }}>
                <div className="name">
                  {giResult.food_name}
                  <span
                    className={`gi-badge ${giLevelClass(giResult.level)}`}
                    style={{ marginLeft: 8 }}
                  >
                    {giLevelText(giResult.level, lang)} ({t("giBadge")}
                    {giResult.value})
                  </span>
                </div>
                <div className="meta">{t("metaCategory")}: {giResult.category}</div>
              </div>
            )}

            {searchResults.length === 0 && giList.length === 0 && classFoods.length === 0 && !giResult && (
              <div className="empty-state">
                <div className="emoji">🔍</div>
                <h3>{t("kbEmptyTitle")}</h3>
                <p>{t("kbEmptyDesc")}</p>
              </div>
            )}
          </div>
        ) : view === "lipid" ? (
          <LipidWorkbench lang={lang} t={t} />
        ) : view === "glucose" ? (
          <GlucoseWorkbench lang={lang} t={t} />
        ) : view === "child" ? (
          <ChildObesityWorkbench lang={lang} t={t} />
        ) : view === "guides" ? (
          <GuideLibrary lang={lang} t={t} />
        ) : view === "consult" ? (
          <ConsultWorkbench lang={lang} t={t} />
        ) : view === "memory" ? (
          <MemoryView lang={lang} />
        ) : view === "skills" ? (
          <SkillsView lang={lang} />
        ) : view === "poster" ? (
          <PosterStudio lang={lang} />
        ) : (
          <div className="knowledge-panel settings-panel">
            <div className="chat-header" style={{ margin: "-20px -24px 16px" }}>
              <h2>{t("settingsTitle")}</h2>
            </div>

            <p className="settings-desc">{t("settingsDesc")}</p>

            <div className="settings-form">
              {/* 专家分身（多分身 + 校准回流，对标 LearnBuddy） */}
              <div className="settings-field avatar-card">
                <span className="settings-label">专家分身（多分身 + 校准回流）</span>
                <div className="avatar-body">
                  <div className="avatar-title">
                    {avatar ? avatar.title : "王润圆 · 注册营养师"}
                  </div>
                  <div className="avatar-name">
                    {avatar ? avatar.name : "…"}
                  </div>
                  <div className="avatar-meta">
                    分身定义：{avatar ? avatar.source : "加载中…"}
                  </div>
                  {/* 分身切换 */}
                  <div className="avatar-row">
                    {avatars.map((a) => (
                      <button
                        key={a.id}
                        className={`kb-filter-chip ${a.active ? "on" : ""}`}
                        onClick={async () => {
                          await window.nutrition.avatarsActivate(a.id);
                          setAvatars(await window.nutrition.avatarsList());
                          setAvatar(await window.nutrition.getExpertAvatar());
                        }}
                      >
                        {a.name}{a.active ? " ●" : ""}
                      </button>
                    ))}
                    <button
                      className="kb-filter-chip"
                      onClick={async () => {
                        const name = prompt("新分身名称（如：张营养师）");
                        if (!name) return;
                        await window.nutrition.avatarsCreate({ name });
                        setAvatars(await window.nutrition.avatarsList());
                      }}
                    >
                      ＋ 新建分身
                    </button>
                    <button
                      className="kb-filter-chip"
                      onClick={() => { setWizardOpen(!wizardOpen); setWizardDraft(null); }}
                    >
                      🧬 从素材创建（AI 提炼）
                    </button>
                  </div>
                  {/* M5a 分身创建向导：素材导入 → AI 提炼草稿 → 本人校准 → 保存（对标 LearnBuddy 5 步链路） */}
                  {wizardOpen && (
                    <div className="avatar-wizard">
                      <div className="avatar-tip">
                        三步：① 上传/粘贴专家素材（论文、指南笔记、诊疗记录）→ ② AI 提炼方法论/思维链/风格草稿 → ③ 本人校准后保存启用
                      </div>
                      {wizardDraft === null ? (
                        <div className="profile-edit-form">
                          <input placeholder="专家称呼（如：李主任 · 肾内营养）" value={wizardName} onChange={(e) => setWizardName(e.target.value)} />
                          <textarea
                            rows={4}
                            placeholder="粘贴素材文本（可多段，AI 将提炼方法论、决策框架、语言风格）"
                            value={wizardPaste}
                            onChange={(e) => setWizardPaste(e.target.value)}
                          />
                          <div className="consult-actions">
                            <button className="settings-secondary-btn" onClick={() => wizardFileRef.current?.click()}>
                              📂 添加本地文件（md/txt，可多选）
                            </button>
                            {wizardFiles.length > 0 && <span className="meta">已附 {wizardFiles.length} 个文件</span>}
                          </div>
                          <input
                            ref={wizardFileRef}
                            type="file"
                            accept=".md,.txt,.markdown"
                            multiple
                            hidden
                            onChange={async (e) => {
                              const files = e.target.files;
                              if (!files) return;
                              const loaded: { filename: string; content: string }[] = [];
                              for (const f of Array.from(files)) loaded.push({ filename: f.name, content: await f.text() });
                              setWizardFiles([...wizardFiles, ...loaded]);
                              if (wizardFileRef.current) wizardFileRef.current.value = "";
                            }}
                          />
                          <div className="consult-actions">
                            <button
                              className="settings-primary-btn"
                              disabled={wizardBusy}
                              onClick={async () => {
                                const materials = [
                                  ...(wizardPaste.trim() ? [{ content: wizardPaste.trim() }] : []),
                                  ...wizardFiles.filter((f) => f.content.trim()),
                                ];
                                if (materials.length === 0) return;
                                setWizardBusy(true);
                                try {
                                  const r = await window.nutrition.avatarsDraft({ name: wizardName, materials });
                                  if (r.ok && r.draft) {
                                    setWizardDraft(r.draft);
                                    setWizardEngine(r.engine);
                                  } else {
                                    alert(r.error || "提炼失败");
                                  }
                                } finally {
                                  setWizardBusy(false);
                                }
                              }}
                            >
                              {wizardBusy ? "提炼中…（约 10-30 秒）" : "② AI 提炼草稿"}
                            </button>
                            <button className="settings-secondary-btn" onClick={() => setWizardOpen(false)}>收起</button>
                          </div>
                        </div>
                      ) : (
                        <div className="profile-edit-form">
                          <div className="avatar-tip">
                            起草方式：{wizardEngine === "llm" ? "AI 提炼" : "离线模板（未配 Key 也可走完向导）"} · 下方草稿可直接编辑，校准确认后保存
                          </div>
                          <textarea rows={12} value={wizardDraft} onChange={(e) => setWizardDraft(e.target.value)} />
                          <div className="consult-actions">
                            <button
                              className="settings-primary-btn"
                              onClick={async () => {
                                const name = wizardName.trim() || wizardDraft.split("\n")[0].replace(/^#\s*专家分身[：:]\s*/, "").trim() || "未命名分身";
                                await window.nutrition.avatarsCreate({ name, content: wizardDraft });
                                setAvatars(await window.nutrition.avatarsList());
                                setWizardOpen(false);
                                setWizardDraft(null);
                                setWizardName("");
                                setWizardPaste("");
                                setWizardFiles([]);
                              }}
                            >
                              ③ 校准确认并保存分身
                            </button>
                            <button className="settings-secondary-btn" onClick={() => setWizardDraft(null)}>← 重新提炼</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* 校准补丁（长生状态机：proposed→reviewed→applied/rejected） */}
                  {patches.length > 0 && (
                    <div className="patch-list">
                      <div className="avatar-tip">校准回流补丁（须本人确认，永不自动改写分身）：</div>
                      {patches.slice(-6).reverse().map((p) => (
                        <div key={p.patch_id} className="patch-item">
                          <div className="patch-content">
                            <span className={`patch-status ${p.status}`}>{p.status}</span>
                            {p.experience.slice(0, 60)}
                          </div>
                          {p.status === "proposed" && (
                            <div className="patch-actions">
                              <button
                                className="settings-inline-btn"
                                onClick={async () => {
                                  await window.nutrition.patchesAdvance(p.patch_id, "review");
                                  setPatches(await window.nutrition.patchesList());
                                }}
                              >
                                进入复核
                              </button>
                              <button
                                className="settings-inline-btn danger"
                                onClick={async () => {
                                  await window.nutrition.patchesAdvance(p.patch_id, "reject");
                                  setPatches(await window.nutrition.patchesList());
                                }}
                              >
                                驳回
                              </button>
                            </div>
                          )}
                          {p.status === "reviewed" && (
                            <div className="patch-actions">
                              <button
                                className="settings-inline-btn"
                                onClick={async () => {
                                  await window.nutrition.patchesAdvance(p.patch_id, "apply");
                                  setPatches(await window.nutrition.patchesList());
                                  setAvatar(await window.nutrition.getExpertAvatar());
                                }}
                              >
                                ✔ 采纳并写入分身
                              </button>
                              <button
                                className="settings-inline-btn danger"
                                onClick={async () => {
                                  await window.nutrition.patchesAdvance(p.patch_id, "reject");
                                  setPatches(await window.nutrition.patchesList());
                                }}
                              >
                                驳回
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="avatar-tip">
                    分身文件在 data/avatars/*.md，修改即时生效；会诊终审的经验补丁在此采纳
                  </div>
                </div>
              </div>

              {/* 多模型路由（会诊引擎用，长生五路契约） */}
              <div className="settings-field avatar-card">
                <span className="settings-label">多模型路由（会诊用，可选）</span>
                <div className="avatar-body">
                  <div className="avatar-tip">
                    为不同专科顾问绑定不同模型。未配置 key 的 provider 自动回退主模型，绝不外呼失败。
                  </div>
                  {EXTRA_PROVIDERS.map((p) => (
                    <div key={p.id} className="provider-row">
                      <span className="provider-label">{p.label}</span>
                      <input
                        type="password"
                        className="provider-key"
                        placeholder="API Key（可空）"
                        value={settings.providers?.[p.id]?.apiKey || ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            providers: {
                              ...(s.providers || {}),
                              [p.id]: {
                                apiKey: e.target.value,
                                baseURL: s.providers?.[p.id]?.baseURL || "",
                                model: s.providers?.[p.id]?.model || p.model,
                              },
                            },
                          }))
                        }
                        autoComplete="off"
                      />
                      <input
                        className="provider-model"
                        placeholder={p.model}
                        value={settings.providers?.[p.id]?.model || ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            providers: {
                              ...(s.providers || {}),
                              [p.id]: {
                                apiKey: s.providers?.[p.id]?.apiKey || "",
                                baseURL: s.providers?.[p.id]?.baseURL || "",
                                model: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 微信 Bot 连接（M6）：企业微信群机器人 / Server酱 */}
              <div className="settings-field avatar-card">
                <span className="settings-label">微信 Bot 连接（推送通知，可选）</span>
                <div className="avatar-body">
                  <div className="avatar-tip">
                    用于把会诊提醒、测试消息推送到微信。企业微信群机器人：群里右键「添加群机器人」即得 Webhook
                    地址；Server酱：sct.ftqq.com 领取 SendKey。地址与 Key 只存本机主进程。
                  </div>
                  <div className="provider-row">
                    <span className="provider-label">启用</span>
                    <input
                      type="checkbox"
                      checked={!!settings.wechatBot?.enabled}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          wechatBot: {
                            enabled: e.target.checked,
                            type: s.wechatBot?.type || "wecom_webhook",
                            webhook: s.wechatBot?.webhook || "",
                            sendkey: s.wechatBot?.sendkey || "",
                          },
                        }))
                      }
                    />
                    <select
                      className="provider-model"
                      value={settings.wechatBot?.type || "wecom_webhook"}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          wechatBot: {
                            enabled: s.wechatBot?.enabled ?? false,
                            type: e.target.value as "wecom_webhook" | "serverchan",
                            webhook: s.wechatBot?.webhook || "",
                            sendkey: s.wechatBot?.sendkey || "",
                          },
                        }))
                      }
                    >
                      <option value="wecom_webhook">企业微信群机器人</option>
                      <option value="serverchan">Server酱（个人微信）</option>
                    </select>
                  </div>
                  {settings.wechatBot?.type === "serverchan" ? (
                    <div className="provider-row">
                      <span className="provider-label">SendKey</span>
                      <input
                        type="password"
                        className="provider-key"
                        placeholder="SCT…（sct.ftqq.com 获取）"
                        value={settings.wechatBot?.sendkey || ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            wechatBot: {
                              enabled: s.wechatBot?.enabled ?? false,
                              type: s.wechatBot?.type || "serverchan",
                              webhook: s.wechatBot?.webhook || "",
                              sendkey: e.target.value,
                            },
                          }))
                        }
                        autoComplete="off"
                      />
                    </div>
                  ) : (
                    <div className="provider-row">
                      <span className="provider-label">Webhook</span>
                      <input
                        className="provider-key"
                        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
                        value={settings.wechatBot?.webhook || ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            wechatBot: {
                              enabled: s.wechatBot?.enabled ?? false,
                              type: s.wechatBot?.type || "wecom_webhook",
                              webhook: e.target.value,
                              sendkey: s.wechatBot?.sendkey || "",
                            },
                          }))
                        }
                        autoComplete="off"
                      />
                    </div>
                  )}
                  <div className="wechat-test-row">
                    <button className="settings-inline-btn" onClick={handleWechatTest} disabled={wechatStatus === "testing"}>
                      {wechatStatus === "testing" ? "发送中…" : "发送测试消息"}
                    </button>
                    {wechatStatus === "ok" && <span className="settings-saved">✅ {wechatMsg}</span>}
                    {wechatStatus === "fail" && <span className="settings-saved" style={{ background: "rgba(160,64,64,0.12)", color: "#a04040" }}>❌ {wechatMsg}</span>}
                  </div>
                </div>
              </div>

              {/* 图像生成（M7b 宣教图工作台） */}
              <div className="settings-field avatar-card">
                <span className="settings-label">图像生成（宣教图工作台用，可选）</span>
                <div className="avatar-body">
                  <div className="avatar-tip">
                    供「宣教图工作台」生成食谱卡片/科普海报。推荐智谱 CogView（国内直连），也支持任意
                    OpenAI 兼容 /images/generations 端点。Key 只存本机主进程。
                  </div>
                  <div className="provider-row">
                    <span className="provider-label">服务商</span>
                    <select
                      className="provider-model"
                      value={settings.imageGen?.provider || "zhipu"}
                      onChange={(e) => {
                        const p = IMAGE_PRESETS.find((x) => x.id === e.target.value)!;
                        setSettings((s) => ({
                          ...s,
                          imageGen: {
                            provider: p.id,
                            apiKey: s.imageGen?.apiKey || "",
                            baseURL: p.baseURL,
                            model: p.model,
                            size: s.imageGen?.size || "1024x1024",
                          },
                        }));
                      }}
                    >
                      {IMAGE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="provider-row">
                    <span className="provider-label">API Key</span>
                    <input
                      type="password"
                      className="provider-key"
                      placeholder={settings.imageGen?.provider === "zhipu" ? "智谱开放平台 API Key" : "对应服务的 API Key"}
                      value={settings.imageGen?.apiKey || ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          imageGen: { ...(s.imageGen || { provider: "zhipu" as const, baseURL: "", model: "", size: "1024x1024" }), apiKey: e.target.value },
                        }))
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="provider-row">
                    <span className="provider-label">BaseURL</span>
                    <input
                      className="provider-key"
                      placeholder="https://…/v1"
                      value={settings.imageGen?.baseURL || ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          imageGen: { ...(s.imageGen || { provider: "zhipu" as const, apiKey: "", model: "", size: "1024x1024" }), baseURL: e.target.value },
                        }))
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="provider-row">
                    <span className="provider-label">模型</span>
                    <input
                      className="provider-key"
                      placeholder="cogview-4 / dall-e-3 / …"
                      value={settings.imageGen?.model || ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          imageGen: { ...(s.imageGen || { provider: "zhipu" as const, apiKey: "", baseURL: "", size: "1024x1024" }), model: e.target.value },
                        }))
                      }
                      autoComplete="off"
                    />
                    <select
                      className="provider-model"
                      value={settings.imageGen?.size || "1024x1024"}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          imageGen: { ...(s.imageGen || { provider: "zhipu" as const, apiKey: "", baseURL: "", model: "" }), size: e.target.value },
                        }))
                      }
                    >
                      <option value="1024x1024">1024×1024 方形</option>
                      <option value="768x1344">768×1344 竖版</option>
                      <option value="864x1152">864×1152 竖版</option>
                      <option value="1344x768">1344×768 横版</option>
                      <option value="1152x864">1152×864 横版</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 预设模型 */}
              <label className="settings-field">
                <span className="settings-label">{t("presetLabel")}</span>
                <select
                  className="settings-select"
                  defaultValue=""
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="" disabled>
                    {t("presetPlaceholder")}
                  </option>
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="settings-help">{t("presetHint")}</span>
              </label>

              {/* API Key */}
              <label className="settings-field">
                <span className="settings-label">{t("apiKeyLabel")}</span>
                <div className="settings-key-row">
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.apiKey}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, apiKey: e.target.value }))
                    }
                    placeholder={t("apiKeyPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="settings-inline-btn"
                    onClick={() => setShowKey((v) => !v)}
                    type="button"
                  >
                    {showKey ? t("hideKey") : t("showKey")}
                  </button>
                </div>
                <span className="settings-help">{t("apiKeyHelp")}</span>
              </label>

              {/* Base URL */}
              <label className="settings-field">
                <span className="settings-label">{t("baseUrlLabel")}</span>
                <input
                  type="text"
                  value={settings.baseURL}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, baseURL: e.target.value }))
                  }
                  placeholder={t("baseUrlPlaceholder")}
                  spellCheck={false}
                />
              </label>

              {/* Model */}
              <label className="settings-field">
                <span className="settings-label">{t("modelLabel")}</span>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, model: e.target.value }))
                  }
                  placeholder={t("modelPlaceholder")}
                  spellCheck={false}
                />
                <span className="settings-help">{t("modelHelp")}</span>
              </label>

              {/* 操作按钮 */}
              <div className="settings-actions">
                <button
                  className="settings-primary-btn"
                  onClick={handleSaveSettings}
                  disabled={!settingsLoaded}
                >
                  {t("saveSettings")}
                </button>
                <button
                  className="settings-secondary-btn"
                  onClick={handleTestConnection}
                  disabled={!settingsLoaded || testStatus === "testing"}
                >
                  {testStatus === "testing" ? t("testing") : t("testConnection")}
                </button>
              </div>

              {/* 状态提示 */}
              {saveStatus === "ok" && (
                <div className="settings-status ok">{t("savedOk")}</div>
              )}
              {saveStatus === "fail" && (
                <div className="settings-status fail">{t("savedFail")}</div>
              )}
              {testStatus === "ok" && (
                <div className="settings-status ok">{testMsg}</div>
              )}
              {testStatus === "fail" && (
                <div className="settings-status fail">{testMsg}</div>
              )}

              <div className="settings-note">{t("settingsNote")}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
