/**
 * Electron主进程 v2 — 窗口管理 + IPC桥
 *
 * IPC通道：
 *   nutrition:chatStream       — 流式对话
 *   nutrition:searchFood       — 搜索食物
 *   nutrition:queryGI          — 查询GI
 *   nutrition:getCategories    — 查询食物分类
 *   nutrition:getNutrients     — 查询营养素定义
 *   nutrition:getStats         — 获取统计
 */
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, Menu, dialog } from "electron";
import path from "path";
import dotenv from "dotenv";import {
  initDatabase, searchFood, queryFood, getStats,
  getFoodCategories, getNutrientDefinitions,
  getFoodsByGILevel, getFoodsByClass, getGIStats,
} from "./food-db";
import { chatStream, testConnection, ChatMessage } from "./llm";
import { getSettings, saveSettings, AppSettings } from "./settings";
import { getExpertAvatar, getAvatarCatalog } from "./expert-avatar";
import { listAgents, saveAgent, deleteAgent, resetAgents, AgentDef } from "./agent-db";
import { runConsult, listConsults, getConsult, reviewConsult, ConsultRequest } from "./consult-engine";
import { getProviderCatalog } from "./model-router";
import {
  listProfiles, saveProfile, deleteProfile,
  listMemories, addMemory, deleteMemory,
} from "./memory-db";
import {
  listSkills, setSkillEnabled, importCustomSkill, CustomSkillInput,
  getCustomSkillContent, updateCustomSkill, deleteCustomSkill,
  exportSkill, importSkillBundle, SkillBundle,
} from "./skill-db";
import { listAvatars, setActiveAvatar, createAvatar, listPatches, advancePatch, draftAvatarFromMaterials } from "./avatar-db";
import { listChats, createChat, getChat, renameChat, deleteChat, appendMessages, StoredMessage } from "./chat-db";
import { testWeChatBot, sendWeChatMessage } from "./wechat-bot";
import { generatePoster, listImages, draftPosterCopy, PosterInput } from "./image-gen";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

// GPU 进程异常（无独显/驱动受限环境）会导致窗口致命退出，禁用硬件加速保稳定
app.disableHardwareAcceleration();

/**
 * 中文应用菜单（Electron 默认菜单为英文 File/Edit/View，用户看不懂）
 * 保留 role 以继承系统行为与快捷键，仅覆盖中文标签。
 */
function buildChineseMenu(): void {
  const isMac = process.platform === "darwin";
  const mod = isMac ? "Cmd" : "Ctrl";

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建对话",
          accelerator: `${mod}+N`,
          click: () => mainWindow?.webContents.send("nutrition:menu:new-chat"),
        },
        { type: "separator" },
        { label: "关闭窗口", role: "close", accelerator: `${mod}+W` },
        { label: "退出", role: "quit", accelerator: `${mod}+Q` },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo", accelerator: `${mod}+Z` },
        { label: "重做", role: "redo", accelerator: `${mod}+Shift+Z` },
        { type: "separator" },
        { label: "剪切", role: "cut", accelerator: `${mod}+X` },
        { label: "复制", role: "copy", accelerator: `${mod}+C` },
        { label: "粘贴", role: "paste", accelerator: `${mod}+V` },
        { label: "全选", role: "selectAll", accelerator: `${mod}+A` },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload", accelerator: `${mod}+R` },
        { label: "强制重新加载", role: "forceReload", accelerator: `${mod}+Shift+R` },
        { type: "separator" },
        { label: "放大", role: "zoomIn", accelerator: `${mod}+=` },
        { label: "缩小", role: "zoomOut", accelerator: `${mod}+-` },
        { label: "重置缩放", role: "resetZoom", accelerator: `${mod}+0` },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen", accelerator: "F11" },
        { label: "开发者工具", role: "toggleDevTools", accelerator: `${mod}+Shift+I` },
      ],
    },
    {
      label: "窗口",
      submenu: [{ label: "最小化", role: "minimize" }],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于 营养Buddy",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "关于 营养Buddy",
              message: "营养Buddy（营小养）",
              detail: [
                "临床营养师的 AI 工作台",
                "",
                "多智能体会诊 · 专家分身 · 记忆系统 · Skill 生态",
                `版本：${app.getVersion()}`,
              ].join("\n"),
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "营养Buddy",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 里 require("crypto") 在默认 sandbox 下不可用，会导致 IPC 桥注入失败
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5174");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist-renderer", "index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  initDatabase();

  // 流式对话
  ipcMain.handle(
    "nutrition:chatStream",
    (_event: IpcMainInvokeEvent, messages: ChatMessage[], requestId: string) => {
      chatStream(messages, {
        onToken: (token) => mainWindow?.webContents.send(`nutrition:token:${requestId}`, token),
        onDone: (fullText) => mainWindow?.webContents.send(`nutrition:done:${requestId}`, fullText),
        onError: (err) => mainWindow?.webContents.send(`nutrition:error:${requestId}`, err.message),
      });
      return { ok: true };
    }
  );

  ipcMain.handle("nutrition:searchFood", (_event, keyword: string) => searchFood(keyword));
  ipcMain.handle("nutrition:queryGI", (_event, foodName: string) => queryFood(foodName));
  ipcMain.handle("nutrition:getCategories", (_event, classCode?: string) => getFoodCategories(classCode));
  ipcMain.handle("nutrition:getNutrients", (_event, keyword?: string) => getNutrientDefinitions(keyword));
  ipcMain.handle("nutrition:getStats", () => getStats());
  ipcMain.handle("nutrition:getFoodsByGILevel", (_event, level: "低GI" | "中GI" | "高GI") => getFoodsByGILevel(level));
  ipcMain.handle("nutrition:getFoodsByClass", (_event, classCode: string) => getFoodsByClass(classCode));
  ipcMain.handle("nutrition:getGIStats", () => getGIStats());

  // 设置读写（API Key / BaseURL / Model）
  ipcMain.handle("nutrition:getSettings", () => getSettings());
  ipcMain.handle("nutrition:saveSettings", (_event, settings: AppSettings) => saveSettings(settings));
  ipcMain.handle("nutrition:testConnection", (_event, settings?: AppSettings) => testConnection(settings));
  ipcMain.handle("nutrition:getExpertAvatar", () => getExpertAvatar());

  // === 多智能体会诊（M1）===
  ipcMain.handle("nutrition:agents:list", () => listAgents());
  ipcMain.handle("nutrition:agents:save", (_e, agent: Partial<AgentDef>) => saveAgent(agent));
  ipcMain.handle("nutrition:agents:delete", (_e, agentId: string) => deleteAgent(agentId));
  ipcMain.handle("nutrition:agents:reset", () => resetAgents());
  ipcMain.handle("nutrition:providers:catalog", () => getProviderCatalog());
  ipcMain.handle("nutrition:consult:run", (_e, req: ConsultRequest) => runConsult(req));
  ipcMain.handle("nutrition:consult:list", () => listConsults());
  ipcMain.handle("nutrition:consult:get", (_e, id: string) => getConsult(id));
  ipcMain.handle(
    "nutrition:consult:review",
    (_e, id: string, review: { decision: "adopt" | "reject" | "adopt_with_modification"; rationale: string; experience?: string }) =>
      reviewConsult(id, review)
  );

  // === 记忆系统（M2）===
  ipcMain.handle("nutrition:profiles:list", () => listProfiles());
  ipcMain.handle("nutrition:profiles:save", (_e, p: Parameters<typeof saveProfile>[0]) => saveProfile(p));
  ipcMain.handle("nutrition:profiles:delete", (_e, id: string) => deleteProfile(id));
  ipcMain.handle("nutrition:memory:list", (_e, profileId?: string) => listMemories(profileId));
  ipcMain.handle("nutrition:memory:add", (_e, m: { content: string; profile_id?: string | null }) => addMemory(m));
  ipcMain.handle("nutrition:memory:delete", (_e, id: string) => deleteMemory(id));

  // === Skill 生态（M3）===
  ipcMain.handle("nutrition:skills:list", () => listSkills());
  ipcMain.handle("nutrition:skills:toggle", (_e, id: string, enabled: boolean) => setSkillEnabled(id, enabled));
  ipcMain.handle("nutrition:skills:import", (_e, s: CustomSkillInput) => importCustomSkill(s));
  ipcMain.handle("nutrition:skills:content", (_e, id: string) => getCustomSkillContent(id));
  ipcMain.handle("nutrition:skills:update", (_e, id: string, s: CustomSkillInput) => updateCustomSkill(id, s));
  ipcMain.handle("nutrition:skills:delete", (_e, id: string) => deleteCustomSkill(id));
  ipcMain.handle("nutrition:skills:export", (_e, id: string) => exportSkill(id));
  ipcMain.handle(
    "nutrition:skills:importBundle",
    (_e, b: SkillBundle, overwriteId?: string) => importSkillBundle(b, overwriteId ? { overwriteId } : undefined)
  );

  // === 专家分身（M4）===
  ipcMain.handle("nutrition:avatars:list", () => listAvatars());
  ipcMain.handle("nutrition:avatars:catalog", () => getAvatarCatalog());
  ipcMain.handle("nutrition:avatars:activate", (_e, id: string) => setActiveAvatar(id));
  ipcMain.handle("nutrition:avatars:create", (_e, a: { name: string; title?: string; content?: string }) => createAvatar(a));
  ipcMain.handle(
    "nutrition:avatars:draft",
    (_e, input: { name?: string; materials: { filename?: string; content: string }[] }) => draftAvatarFromMaterials(input)
  );
  ipcMain.handle("nutrition:patches:list", (_e, avatarId?: string) => listPatches(avatarId));
  ipcMain.handle(
    "nutrition:patches:advance",
    (_e, id: string, action: "review" | "apply" | "reject") => advancePatch(id, action)
  );

  // === 多对话会话（M6）===
  ipcMain.handle("nutrition:chats:list", () => listChats());
  ipcMain.handle("nutrition:chats:create", (_e, title?: string) => createChat(title));
  ipcMain.handle("nutrition:chats:get", (_e, id: string) => getChat(id));
  ipcMain.handle("nutrition:chats:rename", (_e, id: string, title: string) => renameChat(id, title));
  ipcMain.handle("nutrition:chats:delete", (_e, id: string) => deleteChat(id));
  ipcMain.handle(
    "nutrition:chats:append",
    (_e, id: string, msgs: StoredMessage[]) => appendMessages(id, msgs)
  );

  // === 微信 Bot 连接（M6）===
  ipcMain.handle("nutrition:wechat:test", () => testWeChatBot());
  ipcMain.handle("nutrition:wechat:send", (_e, title: string, markdown: string) => sendWeChatMessage(title, markdown));

  // === 宣教图工作台（M7b） ===
  ipcMain.handle("nutrition:image:poster", (_e, input: PosterInput) => generatePoster(input));
  ipcMain.handle("nutrition:image:list", (_e, limit?: number) => listImages(limit ?? 12));
  ipcMain.handle("nutrition:image:draft", (_e, topic: string, audience?: string, template?: string) =>
    draftPosterCopy(topic, audience, template as PosterInput["template"])
  );

  // 中文菜单 + 主窗口
  buildChineseMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
