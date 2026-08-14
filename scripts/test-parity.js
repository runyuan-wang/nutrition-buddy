/**
 * M1–M4 运行时端到端验证（离线 mock，不调外网、不用真实 key）
 * 运行：node scripts/test-parity.js
 */
const Module = require("module");
const originalLoad = Module._load;
// 注入 fake electron（settings.ts 依赖 app.getPath）
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { getPath: () => process.cwd() + "\\.test-userdata" } };
  }
  return originalLoad.apply(this, arguments);
};

const assert = (cond, msg) => {
  if (!cond) { console.error("❌ FAIL:", msg); process.exitCode = 1; }
  else console.log("✅", msg);
};

(async () => {
  const agentDb = require("../dist-main/main/agent-db.js");
  const skillDb = require("../dist-main/main/skill-db.js");
  const memoryDb = require("../dist-main/main/memory-db.js");
  const avatarDb = require("../dist-main/main/avatar-db.js");
  const consult = require("../dist-main/main/consult-engine.js");
  const router = require("../dist-main/main/model-router.js");

  console.log("=== M1b Agent 注册表 ===");
  let agents = agentDb.listAgents();
  assert(agents.length >= 8, `预置专科顾问 >= 8（实际 ${agents.length}）`);
  const custom = agentDb.saveAgent({ name: "测试顾问", persona: "测试", guides: ["diabetes"] });
  assert(!!custom.agent_id, "自建 agent 成功");
  assert(agentDb.deleteAgent(custom.agent_id).ok, "自建 agent 可删除");
  assert(!agentDb.deleteAgent("agent_lipid").ok, "内置 agent 拒绝删除");

  console.log("=== M3 Skill 注册表（两态）===");
  let skills = skillDb.listSkills();
  const guides = skills.filter((s) => s.type === "guide");
  const tools = skills.filter((s) => s.type === "tool");
  assert(guides.length >= 10, `指南技能 >= 10（实际 ${guides.length}）`);
  assert(tools.length >= 8, `工具技能 >= 8（实际 ${tools.length}）`);
  assert(skills.some((s) => s.source === "consult"), "consult 工具已注册");
  const disabled = skillDb.setSkillEnabled("tool_list_gi_by_level", false);
  assert(disabled && disabled.enabled === false, "技能可停用");
  assert(!skillDb.getEnabledToolNames().includes("list_gi_by_level"), "停用后不再调度");
  skillDb.setSkillEnabled("tool_list_gi_by_level", true);
  const imported = skillDb.importCustomSkill({ name: "测试技能", content: "测试内容", population: ["测试"] });
  assert(!!imported.skill_id, "自定义技能导入成功");

  console.log("=== M2 记忆系统 ===");
  const profile = memoryDb.saveProfile({
    name: "测试用户",
    age: 58, sex: "男", height: 170, weight: 85,
    conditions: ["2型糖尿病", "高血压", "慢性肾脏病CKD3期", "妊娠"],  // 故意带高危信号
    labs: { "HbA1c": "7.8%" },
    goals: ["控糖", "护肾"],
  });
  assert(!!profile.id && profile.is_default, "档案创建并默认");
  const mem = memoryDb.addMemory({ content: "测试用户乳糖不耐受，用无糖酸奶替代" });
  const ctx = memoryDb.buildChatMemoryContext("糖尿病怎么吃");
  assert(ctx.includes("测试用户") && ctx.includes("BMI"), "档案摘要含 BMI 注入上下文");
  assert(ctx.includes("乳糖不耐受"), "长期记忆注入上下文");
  assert(memoryDb.deleteMemory(mem.id).ok, "记忆可删除");

  console.log("=== M4 专家分身 + 校准回流 ===");
  const avatars = avatarDb.listAvatars();
  assert(avatars.length >= 1 && avatars[0].active, "默认分身存在且激活（含旧文件迁移）");
  const patch = avatarDb.addPatch({ source: "manual", experience: "测试经验补丁：CKD3期蛋白0.8g/kg" });
  assert(patch.status === "proposed", "补丁落库为 proposed");
  const bad = avatarDb.advancePatch(patch.patch_id, "apply");
  assert(!bad.ok, "非法跃迁 proposed→apply 被拒绝（无自动升格）");
  assert(avatarDb.advancePatch(patch.patch_id, "review").ok, "proposed→reviewed 合法");
  assert(avatarDb.advancePatch(patch.patch_id, "apply").ok, "reviewed→applied 合法");
  const av = avatarDb.getActiveAvatar();
  assert(av.content.includes("测试经验补丁"), "applied 后经验写入分身 md（留痕）");

  console.log("=== M1a 模型路由 ===");
  const catalog = router.getProviderCatalog();
  assert(catalog.length >= 6 && !JSON.stringify(catalog).includes("apiKey"), "provider 目录 ≥6 路且不泄露 key");
  const resolved = router.resolveProvider("deepseek");
  assert(resolved.status === "missing_key" || resolved.id === "deepseek", "未配 key 的 provider 状态正确");

  console.log("=== M1c 会诊引擎（离线 mock）===");
  const result = await consult.runConsult({
    profile_id: profile.id,
    question: "糖尿病合并CKD3期高血压，饮食怎么安排？",
    engine: "mock",
  });
  assert(result.engine === "mock", "mock 引擎生效");
  assert(result.opinions.length >= 3, `多 agent 意见 ≥3（实际 ${result.opinions.length}）`);
  assert(result.opinions.every((o) => o.status === "mock"), "离线意见全部标注 mock（诚实降级）");
  assert(result.matched_population.some((p) => p.includes("糖尿病")), "人群信号检出：糖尿病");
  assert(result.matched_population.some((p) => p.includes("肾脏")), "人群信号检出：CKD");
  assert(result.high_risk_items.some((h) => h.risk_key === "pregnancy" || h.risk_key === "renal_impairment"), "高危复核项检出（review_required）");
  assert(result.high_risk_items.every((h) => h.severity === "review_required"), "高危项恒为 review_required 非阻断");
  assert(result.sheet_md.includes("营养多智能体会诊单") && result.sheet_md.includes("候选，须终审"), "会诊单渲染含长生铁律声明");
  assert(result.matched_agents.length > 0 && result.matched_agents.length < agentDb.listAgents().length + 1, "自动匹配顾问");

  console.log("=== 终审回流 → 分身补丁 ===");
  const reviewRes = consult.reviewConsult(result.consult_id, {
    decision: "adopt_with_modification",
    rationale: "综合可行，蛋白量按CKD调整",
    experience: "CKD3期+糖尿病：蛋白0.8g/kg起步，优先大豆蛋白",
  });
  assert(reviewRes.ok && reviewRes.patch_id, "终审落盘且生成经验补丁（proposed）");
  const patches = avatarDb.listPatches();
  assert(patches.some((p) => p.patch_id === reviewRes.patch_id && p.status === "proposed"), "补丁候审可见");
  const reReview = consult.reviewConsult(result.consult_id, { decision: "adopt", rationale: "再次" });
  assert(!reReview.ok, "重复终审被拒绝");

  console.log("=== 会诊历史 ===");
  const metas = consult.listConsults();
  assert(metas.length >= 1 && metas[0].has_review, "会诊历史可列出且带终审标记");

  console.log("=== M5a 分身创建向导（AI 提炼，离线模板降级）===");
  const draft = await avatarDb.draftAvatarFromMaterials({
    name: "测试专家",
    materials: [{ filename: "方法论.txt", content: "先评估再干预，随访闭环。" }],
  });
  assert(draft.ok && draft.engine === "template", "无 key 时向导降级为模板草稿（诚实标注）");
  assert(draft.draft.includes("待本人校准") && draft.draft.includes("素材来源"), "草稿含校准声明与素材溯源");

  console.log("=== M5b 技能全生命周期 ===");
  const s1 = skillDb.importCustomSkill({ name: "M5测试技能", content: "初版内容" });
  const upd = skillDb.updateCustomSkill(s1.skill_id, { name: "M5测试技能v2", content: "更新后的内容" });
  assert(!!upd && upd.name === "M5测试技能v2", "自定义技能可更新覆盖（名称）");
  const got = skillDb.getCustomSkillContent(s1.skill_id);
  assert(!!got && got.content.includes("更新后的内容"), "知识态内容已覆盖");
  const ex = skillDb.exportSkill(s1.skill_id);
  assert(ex.ok && ex.bundle.skill.content.includes("更新后的内容") && ex.bundle.bundle_version === 1, "技能可导出分享包（v1 契约）");
  assert(!skillDb.exportSkill("tool_search_food").ok, "内置工具无知识态，拒绝导出");
  const s2 = skillDb.importSkillBundle(ex.bundle);
  assert(s2.ok && s2.entry.skill_id !== s1.skill_id, "分享包可导入为新技能");
  const s3 = skillDb.importSkillBundle(ex.bundle, { overwriteId: s2.entry.skill_id });
  assert(s3.ok, "分享包可覆盖更新已有技能");
  assert(skillDb.deleteCustomSkill(s1.skill_id).ok && skillDb.deleteCustomSkill(s2.entry.skill_id).ok, "自定义技能可删除");
  assert(!skillDb.listSkills().some((x) => x.name === "M5测试技能v2"), "删除后注册表不再列出");

  console.log("=== M6 多对话会话 ===");
  const chatDb = require("../dist-main/main/chat-db.js");
  const c1 = chatDb.createChat();
  assert(c1.id.startsWith("chat_") && c1.title === "新对话", "会话创建（默认标题）");
  const appended = chatDb.appendMessages(c1.id, [
    { role: "user", content: "痛风急性期怎么吃" },
    { role: "assistant", content: "低嘌呤…" },
  ]);
  assert(appended.title === "痛风急性期怎么吃", "首条用户消息自动成为标题");
  assert(appended.messages.length === 2, "消息追加落盘");
  const c2 = chatDb.createChat("手工命名会话");
  chatDb.appendMessages(c2.id, [{ role: "user", content: "第二条会话" }]);
  const chatMetas = chatDb.listChats();
  assert(chatMetas.length >= 2 && chatMetas[0].id === c2.id, "列表按更新时间倒序");
  assert(chatDb.renameChat(c2.id, "改名后").title === "改名后", "会话改名");
  assert(chatDb.deleteChat(c1.id).ok, "会话删除出列");
  assert(!chatDb.listChats().some((c) => c.id === c1.id), "删除后不再列出");
  assert(chatDb.deleteChat(c2.id).ok, "清理第二会话");

  console.log("=== M6 微信 Bot 配置 ===");
  const settingsMod = require("../dist-main/main/settings.js");
  const wechat = require("../dist-main/main/wechat-bot.js");
  const before = settingsMod.getSettings();
  const test1 = await wechat.testWeChatBot();
  assert(!test1.ok, "未配置/未启用时拒绝外呼（fail-closed）");
  settingsMod.saveSettings({ ...before, wechatBot: { enabled: true, type: "wecom_webhook", webhook: "", sendkey: "" } });
  const test2 = await wechat.testWeChatBot();
  assert(!test2.ok && /企业微信/.test(test2.message), "启用但缺 Webhook 明确报错（不静默）");
  settingsMod.saveSettings({ ...before, wechatBot: { enabled: true, type: "serverchan", webhook: "", sendkey: "" } });
  const test3 = await wechat.testWeChatBot();
  assert(!test3.ok && test3.message.includes("SendKey"), "Server酱缺 Key 明确报错");
  settingsMod.saveSettings(before); // 还原

  console.log("=== M7 宣教图（image-gen） ===");
  const imageGen = require("../dist-main/main/image-gen.js");

  // 模板 prompt 确定性
  const p1 = imageGen.buildPosterPrompt({ template: "recipe_card", title: "控糖一日三餐", points: "早餐：燕麦\n午餐：杂粮饭", audience: "糖尿病中老年", style: "" });
  const p2 = imageGen.buildPosterPrompt({ template: "recipe_card", title: "控糖一日三餐", points: "早餐：燕麦\n午餐：杂粮饭", audience: "糖尿病中老年", style: "" });
  assert(p1 === p2, "模板 prompt 确定性（同输入同输出，可审计）");
  assert(p1.includes("控糖一日三餐") && p1.includes("1. 早餐：燕麦") && p1.includes("目标人群"), "prompt 含标题/要点/人群");
  const freeP = imageGen.buildPosterPrompt({ template: "free", title: "一张蔬菜拼盘", points: "", audience: "", style: "" });
  assert(freeP.includes("一张蔬菜拼盘"), "自由创作以描述为主体");
  assert(imageGen.POSTER_TEMPLATES.length === 5, "5 类宣教模板齐全");

  // fail-closed：未配置图像服务绝不外呼
  const g1 = await imageGen.generateImage("测试提示词");
  assert(!g1.ok && /未配置/.test(g1.message), "图像服务未配置时明确报错（不外呼）");
  assert(!g1.dataUrl, "失败时无图片返回");

  // listImages 安全（目录可能为空）
  assert(Array.isArray(imageGen.listImages(5)), "最近生成列表可读（空目录不抛错）");

  // AI 起草 fail-closed（清空主模型 key，保证离线确定性）
  settingsMod.saveSettings({ ...before, apiKey: "", providers: {} });
  const d1 = await imageGen.draftPosterCopy("控糖饮食", "中老年", "science_poster");
  assert(!d1.ok && /起草失败/.test(d1.message), "无主模型 Key 时起草明确失败（不外呼）");

  // settings.imageGen 归一化回环
  settingsMod.saveSettings({ ...before, imageGen: { provider: "zhipu", apiKey: "", baseURL: "", model: "", size: "" } });
  assert(settingsMod.getSettings().imageGen.baseURL.includes("bigmodel") && settingsMod.getSettings().imageGen.model === "cogview-4", "图像配置按预设补全 baseURL/model");
  settingsMod.saveSettings(before); // 还原

  // 清理测试数据（保留真实数据）
  memoryDb.deleteProfile(profile.id);
  console.log("\n" + (process.exitCode ? "存在失败项 ❌" : "全部通过 🎉"));
})().catch((err) => {
  console.error("测试脚本异常:", err);
  process.exitCode = 1;
});
