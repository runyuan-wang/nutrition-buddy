/**
 * 数据目录助手 — 所有运行时可写数据的根定位
 *
 * 营养Buddy 数据布局（全部本地文件，无数据库，长生原则）：
 *   data/agents.json          多智能体注册表（M1）
 *   data/skills/registry.jsonl 技能注册表（M3，两态）
 *   data/skills/custom/*.md   自定义技能知识态
 *   data/memory/profiles/*.json 用户档案（M2）
 *   data/memory/memory.jsonl  跨会话记忆（M2）
 *   data/avatars/*.md         专家分身（M4，多分身）
 *   data/avatars/patches.jsonl 分身校准回流补丁（M4）
 *   data/consults/*.json      会诊记录（M1）
 *   data/guides/*.json        食养指南（既有）
 */
import path from "path";

export function dataDir(...segments: string[]): string {
  return path.join(__dirname, "..", "..", "data", ...segments);
}

/** 生成短 id：时间戳 + 随机后缀 */
export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 确保目录存在 */
export function ensureDir(dir: string): void {
  const fs = require("fs") as typeof import("fs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
