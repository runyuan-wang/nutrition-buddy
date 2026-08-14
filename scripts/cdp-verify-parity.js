/**
 * CDP 端到端 UI 验证（M1-M4 视图与 IPC）
 * 前置：electron . --remote-debugging-port=9222
 * 运行：node scripts/cdp-verify-parity.js
 */
const http = require("http");

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "localhost", port: 9222, path }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

const assert = (cond, msg) => {
  console.log(cond ? "✅" : "❌ FAIL:", msg);
  if (!cond) process.exitCode = 1;
};

async function main() {
  // 等待 CDP 就绪
  let targets;
  for (let i = 0; i < 20; i++) {
    try {
      targets = await getJSON("/json");
      if (targets.length) break;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const page = targets.find((t) => t.type === "page");
  assert(!!page, "CDP 页面目标存在");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++msgId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };

  // 1. preload API 完整性
  const api = await evaluate(`Object.keys(window.nutrition).sort()`);
  const required = ["agentsList", "consultRun", "consultList", "profilesList", "memoryAdd", "skillsList", "skillsToggle", "avatarsList", "patchesList", "patchesAdvance", "providersCatalog", "getExpertAvatar"];
  const missing = required.filter((k) => !api.includes(k));
  assert(missing.length === 0, `preload 暴露全部新 API（缺失: ${missing.join(",") || "无"}）`);

  // 2. 侧边栏新入口
  const navText = await evaluate(`document.querySelector(".sidebar").innerText`);
  assert(navText.includes("多智能体会诊"), "侧边栏：多智能体会诊入口");
  assert(navText.includes("记忆库"), "侧边栏：记忆库入口");
  assert(navText.includes("技能库"), "侧边栏：技能库入口");

  // 3. Agent 注册表
  const agentCount = await evaluate(`window.nutrition.agentsList().then(a => a.length)`);
  assert(agentCount >= 8, `agent 注册表加载（${agentCount} 个）`);

  // 4. 技能注册表
  const skillStats = await evaluate(`window.nutrition.skillsList().then(s => ({ total: s.length, guides: s.filter(x=>x.type==='guide').length, tools: s.filter(x=>x.type==='tool').length }))`);
  assert(skillStats.guides >= 10 && skillStats.tools >= 8, `技能注册表（指南${skillStats.guides} 工具${skillStats.tools} 共${skillStats.total}）`);

  // 5. 会诊视图 UI 渲染
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('多智能体会诊')).click()`);
  await new Promise((r) => setTimeout(r, 600));
  const consultTitle = await evaluate(`document.body.innerText.includes('多智能体会诊') && document.querySelectorAll('.kb-filter-chip').length`);
  assert(consultTitle > 0, `会诊工作台渲染（顾问 chips ${consultTitle} 个）`);

  // 6. UI 发起离线 mock 会诊（全链路 IPC）
  const consultOk = await evaluate(`
    (async () => {
      const r = await window.nutrition.consultRun({ question: '高血压合并肥胖怎么吃？', engine: 'mock' });
      return { engine: r.engine, n: r.opinions.length, sheet: r.sheet_md.includes('会诊单'), pop: r.matched_population.join(',') };
    })()
  `);
  assert(consultOk.engine === "mock" && consultOk.n >= 3 && consultOk.sheet, `UI 侧 mock 会诊全链路（${consultOk.n} 位顾问，人群: ${consultOk.pop}）`);

  // 7. 记忆视图渲染 + 档案 IPC
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('记忆库')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const memoryViewOk = await evaluate(`document.body.innerText.includes('用户档案') && document.body.innerText.includes('长期记忆')`);
  assert(memoryViewOk, "记忆库视图渲染（档案+长期记忆两区）");
  const profileSaved = await evaluate(`window.nutrition.profilesSave({ name: 'CDP测试用户', conditions: ['高血压'] }).then(p => p.id)`);
  const memCtx = await evaluate(`window.nutrition.memoryAdd({ content: 'CDP测试记忆' }).then(() => 'ok')`);
  assert(!!profileSaved && memCtx === "ok", "档案与记忆 IPC 写入");
  const cleaned1 = await evaluate(`window.nutrition.profilesDelete('${profileSaved}').then(r => r.ok)`);
  assert(cleaned1, "测试档案清理");

  // 8. 技能视图渲染
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('技能库')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const skillsViewOk = await evaluate(`document.body.innerText.includes('食养指南技能') && document.querySelectorAll('.skill-switch').length`);
  assert(skillsViewOk >= 20, `技能库视图渲染（开关 ${skillsViewOk} 个）`);

  // 9. 设置页：分身目录 + 补丁状态机
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('设置')).click()`);
  await new Promise((r) => setTimeout(r, 500));
  const settingsOk = await evaluate(`document.body.innerText.includes('多模型路由') && document.body.innerText.includes('专家分身')`);
  assert(settingsOk, "设置页渲染：多分身管理 + 多模型路由卡片");

  const patchFlow = await evaluate(`
    (async () => {
      const r = await window.nutrition.consultReview((await window.nutrition.consultList())[0].consult_id, { decision: 'adopt', rationale: 'CDP验证', experience: 'CDP测试补丁' });
      if (!r.ok || !r.patch_id) return { step: 'review-failed', msg: r.message };
      const pid = r.patch_id;
      const bad = await window.nutrition.patchesAdvance(pid, 'apply'); // 非法跃迁
      const rev = await window.nutrition.patchesAdvance(pid, 'review');
      const ap = await window.nutrition.patchesAdvance(pid, 'apply');
      return { bad: bad.ok, rev: rev.ok, ap: ap.ok };
    })()
  `);
  assert(patchFlow.bad === false && patchFlow.rev === true && patchFlow.ap === true, `补丁状态机（拒绝非法跃迁 ✓ reviewed ✓ applied ✓）`);
  assert((await evaluate(`window.nutrition.getExpertAvatar().then(a => a.content.includes('CDP测试补丁'))`)), "applied 补丁已写入分身");

  // 10. M5a 分身创建向导（设置页 UI + avatarsDraft IPC）
  const wizardBtn = await evaluate(`[...document.querySelectorAll('.kb-filter-chip')].some(el => el.textContent.includes('从素材创建'))`);
  assert(wizardBtn, "设置页：分身创建向导入口（AI 提炼）");
  const draftFlow = await evaluate(`
    window.nutrition.avatarsDraft({ name: 'CDP测试专家', materials: [{ filename: 'sop.md', content: '先评估再干预' }] })
      .then(r => ({ ok: r.ok, engine: r.engine, hasDraft: !!r.draft && r.draft.includes('待本人校准') }))
  `);
  assert(draftFlow.ok && draftFlow.hasDraft, "分身起草 IPC（离线模板降级 + 校准声明）");

  // 11. M5b 技能全生命周期 UI + IPC（含分享包回环）
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('技能库')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const skillM5Ui = await evaluate(`document.body.innerText.includes('从本地文件导入') && document.body.innerText.includes('导入分享包')`);
  assert(skillM5Ui, "技能库：文件导入 + 分享包导入入口");
  const skillBundleFlow = await evaluate(`
    (async () => {
      const imp = await window.nutrition.skillsImport({ name: 'CDP技能', content: '分享包回环内容' });
      const ex = await window.nutrition.skillsExport(imp.skill_id);
      if (!ex.ok) return { step: 'export' };
      const del = await window.nutrition.skillsDelete(imp.skill_id);
      const re = await window.nutrition.skillsImportBundle(ex.bundle);
      const updated = await window.nutrition.skillsContent(re.entry.skill_id);
      const cleanup = await window.nutrition.skillsDelete(re.entry.skill_id);
      return { exported: ex.bundle.skill.content.includes('分享包回环内容'), reimported: !!re.ok, contentOk: !!updated && updated.content.includes('分享包回环内容'), cleanup: !!cleanup.ok };
    })()
  `);
  assert(skillBundleFlow.exported && skillBundleFlow.reimported && skillBundleFlow.contentOk && skillBundleFlow.cleanup, "技能分享包：导出→删→导入→读回→清理 回环");

  // 12. M5c 顾问复制模板按钮
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('多智能体会诊')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent.includes('顾问管理'))?.click()`);
  await new Promise((r) => setTimeout(r, 300));
  const copyBtn = await evaluate(`document.querySelectorAll('.agent-manage-row button[title="复制为自定义顾问"]').length`);
  assert(copyBtn >= 8, `顾问复制模板按钮（${copyBtn} 个）`);

  // 13. M6 多对话：会话栏 UI + 会话 CRUD/切换 IPC 回环
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('对话') || el.textContent.includes('营小养')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const sessionBar = await evaluate(`!!document.querySelector('.chat-sessions') && !!document.querySelector('.chat-new-btn')`);
  assert(sessionBar, "对话视图：会话栏 + 新建对话按钮");
  const chatFlow = await evaluate(`
    (async () => {
      const c = await window.nutrition.chatsCreate();
      const ap = await window.nutrition.chatsAppend(c.id, [
        { role: 'user', content: 'CDP多对话测试：血脂高怎么吃' },
        { role: 'assistant', content: '低脂饮食建议' },
      ]);
      const list = await window.nutrition.chatsList();
      const got = await window.nutrition.chatsGet(c.id);
      const rn = await window.nutrition.chatsRename(c.id, 'CDP改名会话');
      const del = await window.nutrition.chatsDelete(c.id);
      return {
        titleAuto: ap.title === 'CDP多对话测试：血脂高怎么吃',
        inList: list.some(x => x.id === c.id),
        readBack: got.messages.length === 2,
        renamed: !!rn && rn.title === 'CDP改名会话',
        deleted: del.ok,
      };
    })()
  `);
  assert(chatFlow.titleAuto && chatFlow.inList && chatFlow.readBack && chatFlow.renamed && chatFlow.deleted, "会话 IPC：建→追加→自动命名→读回→改名→删 回环");

  // 14. M6 微信 Bot 设置卡 + fail-closed 测试按钮
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('设置')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const wechatCard = await evaluate(`document.body.innerText.includes('微信 Bot 连接') && document.body.innerText.includes('发送测试消息')`);
  assert(wechatCard, "设置页：微信 Bot 连接卡 + 测试按钮");
  const wechatFailClosed = await evaluate(`window.nutrition.wechatTest().then(r => !r.ok)`);
  assert(wechatFailClosed, "微信测试：未配置时如实失败（fail-closed 不外呼）");

  // 15. M7 UI 改版：侧边栏图标 + 深色渐变 + 胶囊导航
  const uiLift = await evaluate(`
    (() => {
      const sb = document.querySelector('.sidebar');
      const style = getComputedStyle(sb);
      const icons = document.querySelectorAll('.sidebar-item .nav-ico').length;
      const tile = !!document.querySelector('.sidebar-logo .logo-tile');
      const active = document.querySelector('.sidebar-item.active');
      const activeRadius = active ? getComputedStyle(active).borderRadius : '0';
      return { gradient: style.backgroundImage.includes('gradient'), icons, tile, activeRadius };
    })()
  `);
  assert(uiLift.gradient && uiLift.icons >= 11 && uiLift.tile && uiLift.activeRadius !== "0px", `UI 改版：渐变侧边栏 + ${uiLift.icons} 个导航图标 + 胶囊激活态`);

  // 16. M7b 宣教图工作台：视图 + 模板 + fail-closed
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('宣教图')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const posterView = await evaluate(`
    (() => {
      const tpls = [...document.querySelectorAll('.poster-tpl button')].map(b => b.textContent.trim());
      const hasForm = !!document.querySelector('.poster-form input');
      const hasGen = [...document.querySelectorAll('button')].some(b => b.textContent.includes('生成宣教图'));
      return { count: tpls.length, labels: tpls.join(','), hasForm, hasGen };
    })()
  `);
  assert(posterView.count === 5 && posterView.hasForm && posterView.hasGen, `宣教图工作台：5 模板 + 表单 + 生成按钮（${posterView.labels}）`);
  const posterFail = await evaluate(`window.nutrition.posterGenerate({ template: 'science_poster', title: 'CDP测试', points: '' })`);
  assert(!posterFail.ok && /未配置/.test(posterFail.message), "宣教图：图像服务未配置时如实失败（不外呼）");
  const draftFail = await evaluate(`window.nutrition.posterDraft('主题', '', 'science_poster').then(r => r)`);
  assert(draftFail && typeof draftFail.message === "string", "AI 起草 IPC 可达（返回结构合法）");

  // 17. M7b 设置页：图像生成配置卡
  await evaluate(`[...document.querySelectorAll('.sidebar-item')].find(el => el.textContent.includes('设置')).click()`);
  await new Promise((r) => setTimeout(r, 400));
  const imageCard = await evaluate(`document.body.innerText.includes('图像生成') && document.body.innerText.includes('CogView')`);
  assert(imageCard, "设置页：图像生成配置卡（智谱/OpenAI/自定义）");

  ws.close();
  console.log(process.exitCode ? "\n存在失败项 ❌" : "\nUI 端到端全部通过 🎉");
}

main().catch((err) => { console.error("CDP 验证异常:", err.message); process.exitCode = 1; });
