/**
 * 专家分身模块 — 薄委托层
 *
 * v1：单分身 data/expert-avatar.md
 * v2（M4）：多分身 + 校准回流，实现在 avatar-db.ts；
 * 本文件保留兼容接口（persona.ts / 设置页仍调用 getExpertAvatar）。
 */
import { getActiveAvatar, listAvatars } from "./avatar-db";

export interface ExpertAvatar {
  name: string;
  title: string;
  content: string;
  source: string;
  exists: boolean;
}

/** 读取当前激活的专家分身定义（兼容旧接口） */
export function getExpertAvatar(): ExpertAvatar {
  return getActiveAvatar();
}

/** 分身目录（设置页展示用） */
export function getAvatarCatalog(): { id: string; name: string; title: string; active: boolean }[] {
  return listAvatars().map((a) => ({ id: a.id, name: a.name, title: a.title, active: a.active }));
}
