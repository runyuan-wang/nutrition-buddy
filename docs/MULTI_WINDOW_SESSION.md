# 多窗口与跨Session对话 — 架构设计

> 营养Buddy v0.2 补充设计
> 日期：2026-06-30

---

## 一、多窗口架构

### 1.1 窗口类型定义

| 窗口类型 | 用途 | 数量限制 | 持久化 |
|----------|------|----------|--------|
| `chat` | 对话主窗口 | 多开（最多8） | 状态保存 |
| `knowledge` | 知识库浏览 | 多开（最多4） | 位置保存 |
| `patient` | 患者档案管理 | 单例 | - |
| `report` | 报告查看/导出 | 多开（最多4） | - |
| `settings` | 设置面板 | 单例 | - |

### 1.2 窗口管理器设计

```typescript
// packages/desktop/src/window/WindowManager.ts

import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

export type WindowType = 'chat' | 'knowledge' | 'patient' | 'report' | 'settings';

export interface WindowMeta {
  id: string;                    // 窗口唯一ID
  type: WindowType;              // 窗口类型
  sessionId?: string;            // 绑定的会话ID（chat窗口）
  title: string;                 // 窗口标题
  bounds: { x: number; y: number; width: number; height: number };
  isFocused: boolean;
  splitFrom?: string;            // 从哪个窗口分裂出来
}

export class WindowManager {
  private windows: Map<string, { win: BrowserWindow; meta: WindowMeta }> = new Map();
  private stateFile: string;

  // 创建新窗口
  async createWindow(type: WindowType, opts?: {
    sessionId?: string;
    splitFrom?: string;
    title?: string;
  }): Promise<string> {
    const id = `win_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const meta: WindowMeta = {
      id,
      type,
      sessionId: opts?.sessionId,
      title: opts?.title ?? this.getDefaultTitle(type),
      bounds: this.calculateBounds(type, opts?.splitFrom),
      isFocused: true,
      splitFrom: opts?.splitFrom,
    };

    const win = new BrowserWindow({
      ...meta.bounds,
      title: meta.title,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });

    // 加载对应路由
    const route = this.getRoute(type, opts?.sessionId);
    await win.loadURL(this.getUrl(route));

    // 窗口事件
    win.on('closed', () => this.handleClose(id));
    win.on('focus', () => this.handleFocus(id));
    win.on('move', () => this.updateBounds(id, win.getBounds()));
    win.on('resize', () => this.updateBounds(id, win.getBounds()));

    this.windows.set(id, { win, meta });
    this.broadcastWindowList();
    this.persistState();

    return id;
  }

  // 分裂窗口（从现有窗口分裂出新窗口，继承上下文）
  async splitWindow(sourceId: string, mode: 'duplicate' | 'blank' | 'branch'): Promise<string> {
    const source = this.windows.get(sourceId);
    if (!source) throw new Error('Source window not found');

    if (mode === 'duplicate') {
      // 复制：完全相同的session
      return this.createWindow(source.meta.type, {
        sessionId: source.meta.sessionId,
        splitFrom: sourceId,
        title: source.meta.title + ' (副本)',
      });
    }

    if (mode === 'branch') {
      // 分支：基于当前session创建新session，继承历史
      const newSessionId = await this.sessionManager.branchSession(source.meta.sessionId!);
      return this.createWindow(source.meta.type, {
        sessionId: newSessionId,
        splitFrom: sourceId,
        title: source.meta.title + ' (分支)',
      });
    }

    // blank：新空白窗口
    return this.createWindow(source.meta.type, { splitFrom: sourceId });
  }

  // 窗口间通信
  setupIPC() {
    // 窗口列表更新
    ipcMain.handle('window:list', () => this.getWindowList());
    ipcMain.handle('window:create', (_, type, opts) => this.createWindow(type, opts));
    ipcMain.handle('window:split', (_, sourceId, mode) => this.splitWindow(sourceId, mode));
    ipcMain.handle('window:close', (_, id) => this.closeWindow(id));
    ipcMain.handle('window:focus', (_, id) => this.focusWindow(id));

    // 跨窗口消息传递
    ipcMain.handle('window:broadcast', (_, event, data) => {
      this.broadcast(event, data);
    });

    // 跨窗口拖拽内容传递
    ipcMain.handle('window:send-to', (_, targetId, event, data) => {
      const target = this.windows.get(targetId);
      if (target) target.win.webContents.send(event, data);
    });
  }

  private broadcast(event: string, data: any) {
    for (const { win } of this.windows.values()) {
      win.webContents.send(event, data);
    }
  }
}
```

### 1.3 窗口布局策略

```
┌─────────────────────────────────────────────────┐
│  窗口A (chat: 营养评估)    │  窗口B (chat: 食养)  │
│  Session: sess_001        │  Session: sess_002  │
│  ┌─────────────────────┐  │  ┌────────────────┐ │
│  │ 对话内容            │  │  │ 对话内容       │ │
│  │ ...                 │  │  │ ...            │ │
│  └─────────────────────┘  │  └────────────────┘ │
│  [输入框]                  │  [输入框]           │
├───────────────────────────┼─────────────────────┤
│  窗口C (knowledge: 食物成分表)                    │
│  [搜索框] [分类浏览] [营养对比]                   │
└─────────────────────────────────────────────────┘
```

**智能布局算法**：
```typescript
private calculateBounds(type: WindowType, splitFrom?: string): Electron.Rectangle {
  if (splitFrom) {
    const source = this.windows.get(splitFrom);
    if (source) {
      const { bounds } = source.meta;
      // 从右侧分裂，各占一半
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y,
        width: bounds.width / 2,
        height: bounds.height,
      };
    }
  }

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  const presets: Record<WindowType, Electron.Rectangle> = {
    chat:     { x: 0, y: 0, width: width * 0.5, height },
    knowledge:{ x: width * 0.5, y: 0, width: width * 0.5, height },
    patient:  { x: width * 0.25, y: height * 0.1, width: width * 0.5, height: height * 0.8 },
    report:   { x: width * 0.15, y: height * 0.1, width: width * 0.7, height: height * 0.8 },
    settings: { x: width * 0.3, y: height * 0.2, width: width * 0.4, height: height * 0.6 },
  };

  return presets[type];
}
```

---

## 二、跨Session对话系统

### 2.1 Session 数据模型

```typescript
// packages/agent-core/src/session/model.ts

export interface Session {
  id: string;                       // sess_开头
  title: string;                    // 会话标题
  type: SessionType;                // 会话类型
  status: 'active' | 'archived' | 'pinned';
  createdAt: number;
  updatedAt: number;

  // 关系
  parentSessionId?: string;         // 分支来源
  childSessionIds: string[];        // 分支出去的子session
  linkedSessionIds: string[];       // 手动关联的其他session

  // 上下文
  messages: AbstractMessage[];      // 完整消息历史
  context: SessionContext;          // 会话上下文
  sharedMemory: SharedMemoryRef[];  // 引用的共享记忆

  // 元数据
  tags: string[];                   // 标签
  patientId?: string;               // 关联的患者ID
  mode: ConversationMode;           // clinical/patient/food/research/taibai
}

export type SessionType =
  | 'chat'           // 普通对话
  | 'clinical'       // 临床病例讨论
  | 'food_plan'      // 食养方案
  | 'research'       // 科研辅助
  | 'patient_edu';   // 患者教育

export interface SessionContext {
  // 系统提示词快照（创建时的状态）
  systemPromptSnapshot: string;

  // 激活的知识库
  activeSkills: string[];

  // 患者上下文（如有）
  patientContext?: {
    patientId: string;
    name: string;           // 脱敏后的代号
    age: number;
    diagnosis: string[];
    currentPlan?: string;
  };

  // 会话级记忆（不跨session，除非显式共享）
  localNotes: string;

  // 继承的上下文（从父session）
  inheritedSummary?: string;  // 父session的摘要
}

export interface SharedMemoryRef {
  id: string;
  type: 'note' | 'decision' | 'patient_finding' | 'recipe' | 'literature';
  sessionId: string;          // 来源session
  content: string;            // 共享内容
  sharedAt: number;
  sharedTo: string[];         // 共享给哪些session（空=全局）
}
```

### 2.2 Session 管理器

```typescript
// packages/agent-core/src/session/manager.ts

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private activeSessionId: string | null = null;
  private db: Database;  // SQLite

  // 创建新session
  async create(opts: {
    type?: SessionType;
    title?: string;
    mode?: ConversationMode;
    patientId?: string;
    inheritFrom?: string;       // 从哪个session继承上下文
    activeSkills?: string[];
  }): Promise<Session> {
    const session: Session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: opts.title ?? '新对话',
      type: opts.type ?? 'chat',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentSessionId: opts.inheritFrom,
      childSessionIds: [],
      linkedSessionIds: [],
      messages: [],
      context: {
        systemPromptSnapshot: await this.buildSystemPrompt(opts),
        activeSkills: opts.activeSkills ?? await this.selectDefaultSkills(opts),
        localNotes: '',
        inheritedSummary: opts.inheritFrom
          ? await this.summarizeSession(opts.inheritFrom)
          : undefined,
        patientContext: opts.patientId
          ? await this.loadPatientContext(opts.patientId)
          : undefined,
      },
      sharedMemory: [],
      tags: [],
      patientId: opts.patientId,
      mode: opts.mode ?? 'clinical',
    };

    // 如果有继承，建立父子关系
    if (opts.inheritFrom) {
      const parent = this.sessions.get(opts.inheritFrom);
      if (parent) parent.childSessionIds.push(session.id);
    }

    this.sessions.set(session.id, session);
    await this.persist(session);
    return session;
  }

  // 分支session（创建新session，继承历史摘要）
  async branchSession(sourceId: string): Promise<string> {
    const source = this.sessions.get(sourceId);
    if (!source) throw new Error('Source session not found');

    // 生成源session的摘要
    const summary = await this.summarizeSession(sourceId);

    const branch = await this.create({
      type: source.type,
      title: `${source.title} (分支)`,
      mode: source.mode,
      patientId: source.patientId,
      inheritFrom: sourceId,
      activeSkills: source.context.activeSkills,
    });

    // 把摘要注入分支的上下文
    branch.context.inheritedSummary = summary;
    branch.context.localNotes = `从会话"${source.title}"分支。前序摘要：\n${summary}`;

    // 复制最近的几条消息作为上下文
    const recentMessages = source.messages.slice(-6);
    branch.messages = recentMessages.map(m => ({
      ...m,
      metadata: { ...m.metadata, branched: true, sourceSession: sourceId },
    }));

    await this.persist(branch);
    return branch.id;
  }

  // 关联两个session（手动建立引用）
  async linkSessions(sessionA: string, sessionB: string): Promise<void> {
    const a = this.sessions.get(sessionA);
    const b = this.sessions.get(sessionB);
    if (!a || !b) throw new Error('Session not found');

    if (!a.linkedSessionIds.includes(sessionB)) {
      a.linkedSessionIds.push(sessionB);
    }
    if (!b.linkedSessionIds.includes(sessionA)) {
      b.linkedSessionIds.push(sessionA);
    }

    await this.persist(a);
    await this.persist(b);
  }

  // 共享记忆（从一个session提取记忆，共享给其他session）
  async shareMemory(from: string, content: string, type: SharedMemoryRef['type'], to?: string[]): Promise<void> {
    const session = this.sessions.get(from);
    if (!session) throw new Error('Session not found');

    const ref: SharedMemoryRef = {
      id: `mem_${Date.now()}`,
      type,
      sessionId: from,
      content,
      sharedAt: Date.now(),
      sharedTo: to ?? [],  // 空=全局共享
    };

    session.sharedMemory.push(ref);

    if (to && to.length > 0) {
      // 定向共享
      for (const targetId of to) {
        const target = this.sessions.get(targetId);
        if (target) {
          target.sharedMemory.push(ref);
          await this.persist(target);
        }
      }
    } else {
      // 全局共享：注入到所有active session
      for (const [id, s] of this.sessions) {
        if (id !== from && s.status === 'active') {
          s.sharedMemory.push(ref);
          await this.persist(s);
        }
      }
    }

    await this.persist(session);
  }

  // 构建对话上下文（合并所有记忆来源）
  async buildContext(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    let context = session.context.systemPromptSnapshot;

    // 1. 注入继承的摘要
    if (session.context.inheritedSummary) {
      context += `\n\n## 前序会话摘要\n${session.context.inheritedSummary}`;
    }

    // 2. 注入本地笔记
    if (session.context.localNotes) {
      context += `\n\n## 本会话笔记\n${session.context.localNotes}`;
    }

    // 3. 注入患者上下文
    if (session.context.patientContext) {
      const p = session.context.patientContext;
      context += `\n\n## 患者信息\n代号：${p.name} | 年龄：${p.age} | 诊断：${p.diagnosis.join(', ')}`;
      if (p.currentPlan) context += `\n当前方案：${p.currentPlan}`;
    }

    // 4. 注入共享记忆
    if (session.sharedMemory.length > 0) {
      context += '\n\n## 跨会话共享记忆';
      for (const mem of session.sharedMemory) {
        context += `\n- [${mem.type}] ${mem.content}`;
      }
    }

    // 5. 注入关联session的最近摘要
    if (session.linkedSessionIds.length > 0) {
      context += '\n\n## 关联会话';
      for (const linkedId of session.linkedSessionIds) {
        const linked = this.sessions.get(linkedId);
        if (linked) {
          context += `\n- "${linked.title}" (最后更新: ${new Date(linked.updatedAt).toLocaleString()})`;
        }
      }
    }

    return context;
  }

  // session摘要（用于跨session上下文传递）
  private async summarizeSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    if (session.messages.length === 0) return '（空会话）';

    // 用LLM生成摘要
    const summaryPrompt = `请将以下对话摘要为关键信息（200字以内）：
${session.messages.slice(-20).map(m => `${m.messageType}: ${m.content.slice(0, 200)}`).join('\n')}`;

    const result = await this.llm.chat([
      { messageType: 'system', content: '你是摘要助手。提取关键决策、发现和待办事项。' },
      { messageType: 'user', content: summaryPrompt },
    ], []);

    return result.content;
  }

  // 搜索历史session
  async search(query: string, filters?: {
    type?: SessionType;
    patientId?: string;
    tags?: string[];
    dateFrom?: number;
    dateTo?: number;
  }): Promise<SessionSearchResult[]> {
    // SQLite全文搜索
    const sql = `
      SELECT id, title, type, mode, patient_id, updated_at,
             snippet(sessions_fts, -1, '<mark>', '</mark>', '...', 20) as preview
      FROM sessions_fts
      WHERE sessions_fts MATCH ?
      ${filters?.type ? 'AND type = ?' : ''}
      ${filters?.patientId ? 'AND patient_id = ?' : ''}
      ORDER BY rank
      LIMIT 20
    `;
    return this.db.query(sql, [query, ...Object.values(filters ?? {})]);
  }
}
```

### 2.3 SQLite 存储结构

```sql
-- Session 主表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'active',
  mode TEXT NOT NULL DEFAULT 'clinical',
  parent_session_id TEXT,
  patient_id TEXT,
  tags TEXT,          -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_session_id) REFERENCES sessions(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

-- 消息表（避免单个session过大）
CREATE TABLE session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  media TEXT,         -- JSON array
  metadata TEXT,      -- JSON object
  timestamp INTEGER NOT NULL,
  seq INTEGER NOT NULL,  -- 消息序号
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Session 上下文（独立存储，避免频繁更新主表）
CREATE TABLE session_context (
  session_id TEXT PRIMARY KEY,
  system_prompt TEXT,
  active_skills TEXT,     -- JSON array
  local_notes TEXT,
  inherited_summary TEXT,
  patient_context TEXT,   -- JSON object
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 共享记忆表
CREATE TABLE shared_memory (
  id TEXT PRIMARY KEY,
  from_session TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  shared_at INTEGER NOT NULL,
  is_global INTEGER DEFAULT 0
);

-- 共享记忆目标表（多对多）
CREATE TABLE shared_memory_targets (
  memory_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (memory_id, session_id),
  FOREIGN KEY (memory_id) REFERENCES shared_memory(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Session 关联表（多对多）
CREATE TABLE session_links (
  session_a TEXT NOT NULL,
  session_b TEXT NOT NULL,
  PRIMARY KEY (session_a, session_b),
  FOREIGN KEY (session_a) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_b) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 窗口状态表
CREATE TABLE window_states (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  session_id TEXT,
  title TEXT,
  x INTEGER, y INTEGER, width INTEGER, height INTEGER,
  is_maximized INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 全文搜索索引
CREATE VIRTUAL TABLE sessions_fts USING fts5(
  title, content, content_type='sessions',
  content_rowid='rowid'
);
```

---

## 三、跨Session上下文流转

### 3.1 上下文层次模型

```
┌──────────────────────────────────────────────────┐
│                 全局记忆池                         │
│  · 长期用户偏好 (MEMORY.md)                       │
│  · 全局共享记忆 (shareMemory to all)              │
│  · 患者档案库                                     │
├──────────────────────────────────────────────────┤
│              Session 组记忆                        │
│  · 同一患者的所有session自动成组                   │
│  · 手动关联的session对                            │
│  · 分支session的父子链                            │
├──────────────────────────────────────────────────┤
│              单 Session 记忆                       │
│  · 消息历史                                       │
│  · 本地笔记 (localNotes)                          │
│  · 会话级临时变量                                  │
├──────────────────────────────────────────────────┤
│              当前消息上下文                        │
│  · 当前用户输入                                   │
│  · 最近N条消息                                    │
│  · 激活的Skill返回的知识                           │
└──────────────────────────────────────────────────┘
```

### 3.2 上下文注入流程

```typescript
// packages/agent-core/src/session/context-builder.ts

export class ContextBuilder {
  /**
   * 为一次LLM调用构建完整上下文
   * 
   * 注入顺序（从外到内）：
   * 1. 全局记忆 → 2. Session组记忆 → 3. Session记忆 → 4. 当前消息
   */
  async build(sessionId: string, userInput: string): Promise<AbstractMessage[]> {
    const session = this.sessionManager.get(sessionId);
    const messages: AbstractMessage[] = [];

    // === Layer 1: 全局记忆 ===
    const globalMemory = await this.memorySystem.getGlobalMemory();
    // → 用户画像、长期偏好、全局共享记忆

    // === Layer 2: Session组记忆 ===
    const groupMemory = await this.sessionManager.getGroupMemory(sessionId);
    // → 同患者其他session的摘要、关联session的最近活动

    // === Layer 3: Session记忆 ===
    const sessionContext = await this.sessionManager.buildContext(sessionId);
    // → 系统提示词、继承摘要、本地笔记、患者信息

    // 组装系统消息
    const systemContent = [
      globalMemory,
      groupMemory,
      sessionContext,
    ].filter(Boolean).join('\n\n---\n\n');

    messages.push({
      id: 'sys',
      messageType: MessageType.System,
      content: systemContent,
      timestamp: Date.now(),
    });

    // === Layer 4: 历史消息（最近N条） ===
    const recentMessages = session.messages.slice(-20);
    messages.push(...recentMessages);

    // === Layer 5: 当前输入 ===
    messages.push({
      id: 'user',
      messageType: MessageType.User,
      content: userInput,
      timestamp: Date.now(),
    });

    return messages;
  }
}
```

### 3.3 跨Session操作

```
操作1: 分支 (Branch)
  Session A ──┬──> Session A (继续)
              └──> Session B (分支，继承A的摘要+最近6条消息)

操作2: 合并 (Merge)  
  Session A ──┐
              ├──> Session C (合并，A和B的摘要都注入C的上下文)
  Session B ──┘

操作3: 关联 (Link)
  Session A ←──→ Session B (手动关联，对话时可互相引用)

操作4: 共享记忆 (Share Memory)
  Session A ──"发现患者对乳糖不耐受"──> 全局共享池
                                          ↓
                              所有active session都能看到

操作5: 上下文切换 (Context Switch)
  窗口1正在讨论患者A的营养评估
  → 拖拽一条消息到窗口2（患者A的食养方案窗口）
  → 窗口2自动接收这条消息作为参考

操作6: 时光回溯 (Time Travel)
  Session A 的消息历史可以回到第5条消息
  → 从第5条重新分支一个新session
  → 探索不同的对话路径
```

---

## 四、前端UI设计

### 4.1 多窗口Tab栏

```
┌──────────────────────────────────────────────────────────┐
│ 🌿 营养Buddy                                    ⚙️ 设置  │
├──────────────────────────────────────────────────────────┤
│ [📊 营养评估] [🥗 食养方案] [📚 知识库] [👤 患者档案] [+]│
│   sess_001      sess_002      knowledge    patient       │
│   ●活跃         ●活跃                                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  当前窗口：📊 营养评估 (sess_001)                         │
│                                                          │
│  ┌─ 对话区 ──────────────────────────────────────────┐  │
│  │ 营小养：您好圆酱，今天要讨论哪个患者？              │  │
│  │ 圆酱：NB-2026-001，刚入院，需要做营养评估           │  │
│  │ 营小养：好的，我调取了患者档案...                   │  │
│  │ [从 📚知识库 窗口拖入食物成分数据]                  │  │
│  │ 营小养：收到，该患者的饮食记录显示...               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ 输入区 ──────────────────────────────────────────┐  │
│  │ [输入消息...]                          [发送] [📎] │  │
│  │ ☑ 引用 sess_002 | ☑ 共享到全局 | 模式: 临床       │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Session面板 ────────────────────────────────────┐   │
│  │ 📊 当前: 营养评估 (sess_001)  ●活跃              │   │
│  │ ├─ 🌿 分支: 补充方案 (sess_003)                  │   │
│  │ └─ 🔗 关联: 食养方案 (sess_002)                  │   │
│  │ 📌 置顶: 上一患者的评估 (sess_000)               │   │
│  │ 📦 归档: (12个历史会话)                          │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 4.2 窗口间拖拽

```typescript
// packages/web-ui/src/components/DraggableMessage.tsx

function DraggableMessage({ message }: { message: AbstractMessage }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-message', JSON.stringify({
      messageId: message.id,
      sessionId: message.sessionId,
      content: message.content,
      messageType: message.messageType,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div draggable onDragStart={handleDragStart}>
      <MessageContent message={message} />
    </div>
  );
}

// 目标窗口接收
function ChatPanel({ sessionId }: { sessionId: string }) {
  const handleDrop = (e: React.DragEvent) => {
    const data = e.dataTransfer.getData('application/x-message');
    if (data) {
      const msg = JSON.parse(data);
      // 将跨窗口的消息作为引用注入当前session
      sendToBackend('session:inject-reference', {
        targetSession: sessionId,
        sourceSession: msg.sessionId,
        content: msg.content,
      });
    }
  };

  return (
    <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* ... */}
    </div>
  );
}
```

### 4.3 Session 树状视图

```
📋 Session 管理器
│
├── 📊 NB-2026-001 营养评估 (sess_001) ●活跃
│   ├── 🌿 补充方案讨论 (sess_003) ●活跃
│   │   └── 📝 方案优化 (sess_005) 归档
│   └── 🔗 食养方案 (sess_002) ●活跃
│
├── 📊 NB-2026-002 营养评估 (sess_004) 归档
│   └── 🌿 出院随访 (sess_006) ●活跃
│
├── 📌 科研: 文献综述99篇 (sess_007) 置顶
│
└── 📦 归档 (23个历史会话) [展开]
```

---

## 五、更新后的架构总览

```
┌──────────────────────────────────────────────────────┐
│              交互层 (Multi-Window Desktop UI)          │
│  Electron多窗口 | Tab切换 | 拖拽传递 | 窗口状态持久化   │
│  窗口类型: chat×8 | knowledge×4 | patient×1 | report×4│
├──────────────────────────────────────────────────────┤
│              会话层 (Session Management)               │
│  Session CRUD | 分支/合并/关联 | 上下文构建器           │
│  全局记忆池 | Session组记忆 | 单Session记忆             │
│  FTS全文搜索 | 时光回溯 | 共享记忆                      │
├──────────────────────────────────────────────────────┤
│              人格层 (Persona Engine)                   │
│  SOUL.md | IDENTITY.md | VOICE.md | VALUES.md         │
│  5场景语气切换 | 情绪感知 | 动态提示词组装              │
├──────────────────────────────────────────────────────┤
│              能力层 (Skill Router)                     │
│  14个营养Skill统一调度 | MCP连接器 | 工具系统          │
├──────────────────────────────────────────────────────┤
│              数据层 (Knowledge & Memory)               │
│  SQLite(会话+消息+共享记忆+窗口状态) | Skill知识文件    │
│  患者档案库 | 食物成分DB | 记忆系统                     │
└──────────────────────────────────────────────────────┘
```

---

## 六、开发任务拆解

| 任务 | 阶段 | 工作量 | 依赖 |
|------|------|--------|------|
| SQLite表结构 + 迁移 | Phase 1 | 0.5天 | 无 |
| Session CRUD API | Phase 1 | 1天 | SQLite |
| Session消息存储 | Phase 1 | 0.5天 | Session CRUD |
| 上下文构建器 | Phase 2 | 1天 | Session管理器 |
| Session摘要(LLM) | Phase 2 | 0.5天 | LLM通信层 |
| 分支/合并/关联 | Phase 2 | 1天 | Session CRUD |
| 共享记忆系统 | Phase 2 | 0.5天 | Session CRUD |
| Electron窗口管理器 | Phase 3 | 1.5天 | Electron壳 |
| 窗口状态持久化 | Phase 3 | 0.5天 | 窗口管理器 |
| 多窗口Tab UI | Phase 3 | 1天 | React前端 |
| 窗口间拖拽 | Phase 3 | 0.5天 | 多窗口UI |
| Session树状视图 | Phase 3 | 0.5天 | Session CRUD |
| FTS全文搜索 | Phase 4 | 0.5天 | SQLite |
| 时光回溯 | Phase 4 | 0.5天 | Session消息 |
| 跨窗口IPC通信 | Phase 3 | 0.5天 | 窗口管理器 |

**总计：约10个工作日，分布在Phase 1-4中。**
