/**
 * 微信 Bot 连接通道（M6）— 主进程外呼，key/地址不回显渲染端
 *
 * 支持两种通道：
 *   wecom_webhook  企业微信群机器人 webhook（群里右键添加机器人即得 URL）
 *   serverchan     Server酱（SendKey 推送到个人微信服务号）
 *
 * 铁律：未启用/未配置时返回明确错误，绝不外呼；发送失败如实返回，不静默。
 */
import { getSettings } from "./settings";

export interface WeChatSendResult {
  ok: boolean;
  message: string;
}

function config(): { enabled: boolean; type: string; webhook: string; sendkey: string } | null {
  const s = getSettings();
  const w = s.wechatBot;
  if (!w) return null;
  return {
    enabled: !!w.enabled,
    type: w.type || "wecom_webhook",
    webhook: (w.webhook || "").trim(),
    sendkey: (w.sendkey || "").trim(),
  };
}

/** 发送 markdown 消息到微信通道 */
export async function sendWeChatMessage(title: string, markdown: string): Promise<WeChatSendResult> {
  const cfg = config();
  if (!cfg) return { ok: false, message: "尚未配置微信 Bot（设置页 → 微信 Bot 连接）" };
  if (!cfg.enabled) return { ok: false, message: "微信 Bot 未启用" };

  const content = `**${title}**\n\n${markdown}`.slice(0, 4000); // 企业微信 markdown 上限 4096 字节

  try {
    if (cfg.type === "serverchan") {
      if (!cfg.sendkey) return { ok: false, message: "Server酱 SendKey 未填写" };
      const resp = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(cfg.sendkey)}.send`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ title: title.slice(0, 32), desp: markdown.slice(0, 30000) }).toString(),
      });
      const data = (await resp.json().catch(() => ({}))) as { code?: number; message?: string };
      if (resp.ok && data.code === 0) return { ok: true, message: "已通过 Server酱 推送到微信" };
      return { ok: false, message: `Server酱返回错误：${data.message || resp.status}` };
    }

    // 默认：企业微信群机器人 webhook
    if (!cfg.webhook) return { ok: false, message: "企业微信机器人 Webhook 地址未填写" };
    const resp = await fetch(cfg.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "markdown", markdown: { content } }),
    });
    const data = (await resp.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
    if (resp.ok && data.errcode === 0) return { ok: true, message: "已推送到企业微信群" };
    return { ok: false, message: `企业微信返回错误：${data.errmsg || resp.status}` };
  } catch (err) {
    return { ok: false, message: `发送失败：${err instanceof Error ? err.message : String(err)}` };
  }
}

/** 测试连接：发一条轻量测试消息 */
export function testWeChatBot(): Promise<WeChatSendResult> {
  return sendWeChatMessage(
    "营养Buddy 连接测试",
    `这是一条测试消息 —— 微信 Bot 通道配置成功 ✅\n\n时间：${new Date().toLocaleString("zh-CN")}`
  );
}
