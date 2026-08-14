/**
 * 对话会话库 — 多对话支持（M6）
 *
 * 数据布局（长生原则：本地文件、改文件即时生效、无数据库）：
 *   data/chats/*.json   每个会话一个文件：{ id, title, created_at, updated_at, messages: [{role, content}] }
 *
 * 删除采用「改名 .deleted」方式（与档案删除同法）：GUI 进程内 unlink 垫片
 * fail-closed 不可靠，列表只认 .json 后缀，改名即出列。
 */
import fs from "fs";
import path from "path";
import { dataDir, genId, ensureDir } from "./data-dir";

export interface StoredMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: StoredMessage[];
}

export interface ChatMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

function chatsDir(): string {
  return dataDir("chats");
}

function chatFile(id: string): string {
  return path.join(chatsDir(), `${id}.json`);
}

function isChatId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function readChat(id: string): ChatSession | null {
  if (!isChatId(id)) return null;
  try {
    const raw = fs.readFileSync(chatFile(id), "utf-8");
    const c = JSON.parse(raw) as ChatSession;
    if (!c || typeof c !== "object" || !Array.isArray(c.messages)) return null;
    return {
      id: c.id || id,
      title: c.title || "新对话",
      created_at: c.created_at || new Date().toISOString(),
      updated_at: c.updated_at || new Date().toISOString(),
      messages: c.messages.filter(
        (m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string"
      ),
    };
  } catch {
    return null;
  }
}

function writeChat(c: ChatSession): ChatSession {
  ensureDir(chatsDir());
  fs.writeFileSync(chatFile(c.id), JSON.stringify(c, null, 2), "utf-8");
  return c;
}

/** 会话列表（按更新时间倒序，最新的在前） */
export function listChats(): ChatMeta[] {
  ensureDir(chatsDir());
  const metas: ChatMeta[] = [];
  for (const f of fs.readdirSync(chatsDir())) {
    if (!f.endsWith(".json")) continue;
    const c = readChat(path.basename(f, ".json"));
    if (c) {
      metas.push({
        id: c.id,
        title: c.title,
        created_at: c.created_at,
        updated_at: c.updated_at,
        message_count: c.messages.length,
      });
    }
  }
  metas.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return metas;
}

export function createChat(title?: string): ChatSession {
  const now = new Date().toISOString();
  return writeChat({
    id: genId("chat"),
    title: (title || "").trim() || "新对话",
    created_at: now,
    updated_at: now,
    messages: [],
  });
}

export function getChat(id: string): ChatSession | null {
  return readChat(id);
}

export function renameChat(id: string, title: string): ChatMeta | null {
  const c = readChat(id);
  if (!c) return null;
  c.title = title.trim() || c.title;
  c.updated_at = new Date().toISOString();
  writeChat(c);
  return { id: c.id, title: c.title, created_at: c.created_at, updated_at: c.updated_at, message_count: c.messages.length };
}

/** 追加消息（user/assistant 落盘）；首条用户消息自动成为标题 */
export function appendMessages(id: string, msgs: StoredMessage[]): ChatSession | null {
  const c = readChat(id);
  if (!c) return null;
  const valid = msgs.filter(
    (m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string" && m.content.trim()
  );
  if (valid.length) c.messages.push(...valid);
  // 自动命名：尚无有效标题时取第一条用户消息前 20 字
  if ((c.title === "新对话" || !c.title) && !c.messages.some((m) => m.role === "user" && m.content)) {
    /* 无用户消息则保持默认 */
  }
  const firstUser = c.messages.find((m) => m.role === "user" && m.content);
  if (firstUser && (c.title === "新对话" || !c.title)) {
    c.title = firstUser.content.replace(/\s+/g, " ").slice(0, 20) || "新对话";
  }
  c.updated_at = new Date().toISOString();
  writeChat(c);
  return c;
}

/** 删除会话：改名 .deleted 出列（不用 unlink，垫片环境 fail-closed 不可靠） */
export function deleteChat(id: string): { ok: boolean } {
  if (!isChatId(id)) return { ok: false };
  const file = chatFile(id);
  if (fs.existsSync(file)) {
    try {
      fs.writeFileSync(file, "");
      fs.renameSync(file, file + ".deleted");
    } catch {
      /* 以最终列表状态为准 */
    }
  }
  const stillThere = listChats().some((c) => c.id === id);
  return { ok: !stillThere };
}
