/**
 * 预加载脚本 v2 — 安全的IPC桥
 *
 * 暴露给渲染进程的API：
 *   chatStream(messages, onToken, onDone, onError)
 *   searchFood(keyword)
 *   queryGI(foodName)
 *   getCategories(classCode?)
 *   getNutrients(keyword?)
 *   getStats()
 *   getSettings()
 *   saveSettings(settings)
 *   testConnection(settings)
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nutrition", {
  chatStream: (
    messages: unknown[],
    onToken: (token: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: string) => void
  ) => {
    // 使用全局 crypto.randomUUID，避免 require("crypto") 在沙箱中不可用
    const requestId = crypto.randomUUID();

    const tokenHandler = (_event: unknown, token: string) => onToken(token);
    const doneHandler = (_event: unknown, fullText: string) => { onDone(fullText); cleanup(); };
    const errorHandler = (_event: unknown, err: string) => { onError(err); cleanup(); };

    const cleanup = () => {
      ipcRenderer.removeListener(`nutrition:token:${requestId}`, tokenHandler);
      ipcRenderer.removeListener(`nutrition:done:${requestId}`, doneHandler);
      ipcRenderer.removeListener(`nutrition:error:${requestId}`, errorHandler);
    };

    ipcRenderer.on(`nutrition:token:${requestId}`, tokenHandler);
    ipcRenderer.on(`nutrition:done:${requestId}`, doneHandler);
    ipcRenderer.on(`nutrition:error:${requestId}`, errorHandler);
    ipcRenderer.invoke("nutrition:chatStream", messages, requestId);
  },

  searchFood: (keyword: string) => ipcRenderer.invoke("nutrition:searchFood", keyword),
  queryGI: (foodName: string) => ipcRenderer.invoke("nutrition:queryGI", foodName),
  getCategories: (classCode?: string) => ipcRenderer.invoke("nutrition:getCategories", classCode),
  getNutrients: (keyword?: string) => ipcRenderer.invoke("nutrition:getNutrients", keyword),
  getStats: () => ipcRenderer.invoke("nutrition:getStats"),
  getFoodsByGILevel: (level: "低GI" | "中GI" | "高GI") => ipcRenderer.invoke("nutrition:getFoodsByGILevel", level),
  getFoodsByClass: (classCode: string) => ipcRenderer.invoke("nutrition:getFoodsByClass", classCode),
  getGIStats: () => ipcRenderer.invoke("nutrition:getGIStats"),
  getSettings: () => ipcRenderer.invoke("nutrition:getSettings"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("nutrition:saveSettings", settings),
  testConnection: (settings: unknown) => ipcRenderer.invoke("nutrition:testConnection", settings),
  getExpertAvatar: () => ipcRenderer.invoke("nutrition:getExpertAvatar"),

  // 多智能体会诊（M1）
  agentsList: () => ipcRenderer.invoke("nutrition:agents:list"),
  agentsSave: (agent: unknown) => ipcRenderer.invoke("nutrition:agents:save", agent),
  agentsDelete: (agentId: string) => ipcRenderer.invoke("nutrition:agents:delete", agentId),
  agentsReset: () => ipcRenderer.invoke("nutrition:agents:reset"),
  providersCatalog: () => ipcRenderer.invoke("nutrition:providers:catalog"),
  consultRun: (req: unknown) => ipcRenderer.invoke("nutrition:consult:run", req),
  consultList: () => ipcRenderer.invoke("nutrition:consult:list"),
  consultGet: (id: string) => ipcRenderer.invoke("nutrition:consult:get", id),
  consultReview: (id: string, review: unknown) => ipcRenderer.invoke("nutrition:consult:review", id, review),

  // 记忆系统（M2）
  profilesList: () => ipcRenderer.invoke("nutrition:profiles:list"),
  profilesSave: (p: unknown) => ipcRenderer.invoke("nutrition:profiles:save", p),
  profilesDelete: (id: string) => ipcRenderer.invoke("nutrition:profiles:delete", id),
  memoryList: (profileId?: string) => ipcRenderer.invoke("nutrition:memory:list", profileId),
  memoryAdd: (m: unknown) => ipcRenderer.invoke("nutrition:memory:add", m),
  memoryDelete: (id: string) => ipcRenderer.invoke("nutrition:memory:delete", id),

  // Skill 生态（M3 + M5b 全生命周期）
  skillsList: () => ipcRenderer.invoke("nutrition:skills:list"),
  skillsToggle: (id: string, enabled: boolean) => ipcRenderer.invoke("nutrition:skills:toggle", id, enabled),
  skillsImport: (s: unknown) => ipcRenderer.invoke("nutrition:skills:import", s),
  skillsContent: (id: string) => ipcRenderer.invoke("nutrition:skills:content", id),
  skillsUpdate: (id: string, s: unknown) => ipcRenderer.invoke("nutrition:skills:update", id, s),
  skillsDelete: (id: string) => ipcRenderer.invoke("nutrition:skills:delete", id),
  skillsExport: (id: string) => ipcRenderer.invoke("nutrition:skills:export", id),
  skillsImportBundle: (b: unknown, overwriteId?: string) => ipcRenderer.invoke("nutrition:skills:importBundle", b, overwriteId),

  // 专家分身（M4 + M5a 创建向导）
  avatarsList: () => ipcRenderer.invoke("nutrition:avatars:list"),
  avatarsCatalog: () => ipcRenderer.invoke("nutrition:avatars:catalog"),
  avatarsActivate: (id: string) => ipcRenderer.invoke("nutrition:avatars:activate", id),
  avatarsCreate: (a: unknown) => ipcRenderer.invoke("nutrition:avatars:create", a),
  avatarsDraft: (input: unknown) => ipcRenderer.invoke("nutrition:avatars:draft", input),
  patchesList: (avatarId?: string) => ipcRenderer.invoke("nutrition:patches:list", avatarId),
  patchesAdvance: (id: string, action: "review" | "apply" | "reject") => ipcRenderer.invoke("nutrition:patches:advance", id, action),

  // 多对话会话（M6）
  chatsList: () => ipcRenderer.invoke("nutrition:chats:list"),
  chatsCreate: (title?: string) => ipcRenderer.invoke("nutrition:chats:create", title),
  chatsGet: (id: string) => ipcRenderer.invoke("nutrition:chats:get", id),
  chatsRename: (id: string, title: string) => ipcRenderer.invoke("nutrition:chats:rename", id, title),
  chatsDelete: (id: string) => ipcRenderer.invoke("nutrition:chats:delete", id),
  chatsAppend: (id: string, msgs: unknown) => ipcRenderer.invoke("nutrition:chats:append", id, msgs),
  /** 菜单「新建对话」事件（主进程 → 渲染端） */
  onMenuNewChat: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("nutrition:menu:new-chat", handler);
    return () => ipcRenderer.removeListener("nutrition:menu:new-chat", handler);
  },

  // 微信 Bot 连接（M6）
  wechatTest: () => ipcRenderer.invoke("nutrition:wechat:test"),
  wechatSend: (title: string, markdown: string) => ipcRenderer.invoke("nutrition:wechat:send", title, markdown),

  // 宣教图工作台（M7b）
  posterGenerate: (input: unknown) => ipcRenderer.invoke("nutrition:image:poster", input),
  posterList: (limit?: number) => ipcRenderer.invoke("nutrition:image:list", limit),
  posterDraft: (topic: string, audience?: string, template?: string) =>
    ipcRenderer.invoke("nutrition:image:draft", topic, audience, template),
});
