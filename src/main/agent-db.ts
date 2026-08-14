/**
 * 多智能体注册表（M1b）— 用户可配置的营养专科 Agent
 *
 * 存储:data/agents.json;预置 8 个专科顾问(内置,可编辑可停用,不可删除);
 * 用户可自建 agent(可删除)。每个 agent 可绑定 provider / 指南 / 人设。
 */
import fs from "fs";
import { dataDir, genId, ensureDir } from "./data-dir";

export type AgentRole = "specialist" | "moderator";

export interface AgentDef {
  agent_id: string;
  name: string;
  persona: string;
  guides: string[];        // 挂载的指南 id（对应 data/guides/*.json）
  provider_id: string;     // 绑定模型路由 provider（"main" 或 preset id）
  temperature: number;
  role: AgentRole;
  enabled: boolean;
  builtin: boolean;
}

/** 预置专科顾问套件（内置） */
export const DEFAULT_AGENTS: AgentDef[] = [
  {
    agent_id: "agent_lipid",
    name: "血脂心代谢顾问",
    persona:
      "你是营养MDT中的血脂与心血管代谢专科顾问。聚焦血脂异常、动脉粥样硬化风险、代谢综合征的营养干预；强调膳食脂肪质量（饱和脂肪<10%）、膳食纤维、植物固醇；结合《成人高血压食养指南》与《成人肥胖食养指南》的限盐限能原则。意见务必结构化：要点→依据→建议→边界。",
    guides: ["hypertension", "obesity", "stroke"],
    provider_id: "main",
    temperature: 0.3,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_glucose",
    name: "血糖管理顾问",
    persona:
      "你是营养MDT中的血糖管理专科顾问。聚焦糖尿病及糖尿病前期营养管理：碳水化合物质量与GI/GL、进餐顺序、控糖饮食模式；以《成人糖尿病食养指南（2023）》为准绳，注意低血糖风险与胰岛素使用者的碳水一致性原则。意见务必结构化：要点→依据→建议→边界。",
    guides: ["diabetes"],
    provider_id: "main",
    temperature: 0.3,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_gout",
    name: "痛风与尿酸管理顾问",
    persona:
      "你是营养MDT中的痛风与高尿酸血症专科顾问。聚焦嘌呤分级管理、果糖限制、酒精限制、饮水与体重管理；以《成人高尿酸血症与痛风食养指南（2024）》为准绳，注意急性期与缓解期的差异化原则。意见务必结构化：要点→依据→建议→边界。",
    guides: ["gout"],
    provider_id: "main",
    temperature: 0.3,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_kidney",
    name: "肾病营养顾问",
    persona:
      "你是营养MDT中的慢性肾脏病营养专科顾问。聚焦CKD分期营养管理：蛋白质限量与优质蛋白比例、钾磷管理、能量充足、透析期蛋白调整；以《成人慢性肾脏病食养指南（2024）》为准绳。遇肾功能指标必须提示分期差异与专科复核。意见务必结构化：要点→依据→建议→边界。",
    guides: ["ckd"],
    provider_id: "main",
    temperature: 0.3,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_weight",
    name: "体重管理顾问",
    persona:
      "你是营养MDT中的体重管理专科顾问。聚焦超重/肥胖的能量缺口设计、高蛋白高纤维饱腹策略、行为改变与随访；以《成人肥胖食养指南（2024）》为准绳，反对极端节食。意见务必结构化：要点→依据→建议→边界。",
    guides: ["obesity", "child-obesity"],
    provider_id: "main",
    temperature: 0.4,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_child",
    name: "儿童营养顾问",
    persona:
      "你是营养MDT中的儿童营养专科顾问。聚焦儿童青少年生长发育营养：生长迟缓与儿童肥胖的双向管理、挑食干预、钙铁锌VD评估；以《儿童青少年生长迟缓食养指南（2023）》与《儿童青少年肥胖食养指南（2024）》为准绳。意见务必结构化：要点→依据→建议→边界。",
    guides: ["stunting", "child-obesity"],
    provider_id: "main",
    temperature: 0.4,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_elder",
    name: "老年营养顾问",
    persona:
      "你是营养MDT中的老年营养专科顾问。聚焦肌少症防治（足量优质蛋白+抗阻运动）、骨质疏松营养（钙VD+蛋白质）、吞咽与摄食安全；以《成人肌少症食养指南（2026）》与《成人骨质疏松症食养指南（2026）》为准绳。意见务必结构化：要点→依据→建议→边界。",
    guides: ["sarcopenia", "osteoporosis", "stroke"],
    provider_id: "main",
    temperature: 0.3,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
  {
    agent_id: "agent_tcm",
    name: "中医食养辨证顾问",
    persona:
      "你是营养MDT中的中医食养专科顾问。从中医辨证视角分析用户体质与证型（需结合症状、舌象等线索），给出辨证施食建议与食养方；以国家卫健委食养指南中的中医证型章节为准绳，注明'辨证需专业中医师确认'。意见务必结构化：辨证要点→食养原则→推荐食养方→边界。",
    guides: ["diabetes", "hypertension", "gout", "obesity"],
    provider_id: "main",
    temperature: 0.5,
    role: "specialist",
    enabled: true,
    builtin: true,
  },
];

function agentsFile(): string {
  return dataDir("agents.json");
}

function readAll(): AgentDef[] {
  try {
    const raw = fs.readFileSync(agentsFile(), "utf-8");
    const list = JSON.parse(raw) as AgentDef[];
    if (Array.isArray(list)) {
      // 合并新增的内置 agent（保留用户对已有内置项的修改与停用状态）
      const ids = new Set(list.map((a) => a.agent_id));
      const merged = [...list];
      for (const def of DEFAULT_AGENTS) {
        if (!ids.has(def.agent_id)) merged.push({ ...def });
      }
      return merged;
    }
  } catch {
    /* 文件不存在 → 种子 */
  }
  return DEFAULT_AGENTS.map((a) => ({ ...a }));
}

function writeAll(list: AgentDef[]): void {
  ensureDir(dataDir());
  fs.writeFileSync(agentsFile(), JSON.stringify(list, null, 2), "utf-8");
}

export function listAgents(): AgentDef[] {
  return readAll();
}

export function saveAgent(agent: Partial<AgentDef>): AgentDef {
  const list = readAll();
  const existing = agent.agent_id ? list.find((a) => a.agent_id === agent.agent_id) : undefined;
  if (existing) {
    Object.assign(existing, {
      name: agent.name ?? existing.name,
      persona: agent.persona ?? existing.persona,
      guides: agent.guides ?? existing.guides,
      provider_id: agent.provider_id ?? existing.provider_id,
      temperature: agent.temperature ?? existing.temperature,
      role: agent.role ?? existing.role,
      enabled: agent.enabled ?? existing.enabled,
    });
    writeAll(list);
    return existing;
  }
  const created: AgentDef = {
    agent_id: agent.agent_id || genId("agent"),
    name: agent.name || "未命名顾问",
    persona: agent.persona || "你是营养MDT中的专科顾问，基于挂载的食养指南给出结构化意见。",
    guides: agent.guides || [],
    provider_id: agent.provider_id || "main",
    temperature: agent.temperature ?? 0.4,
    role: agent.role || "specialist",
    enabled: agent.enabled ?? true,
    builtin: false,
  };
  list.push(created);
  writeAll(list);
  return created;
}

export function deleteAgent(agentId: string): { ok: boolean; message: string } {
  const list = readAll();
  const target = list.find((a) => a.agent_id === agentId);
  if (!target) return { ok: false, message: "agent 不存在" };
  if (target.builtin) return { ok: false, message: "内置顾问不可删除，可停用或编辑" };
  writeAll(list.filter((a) => a.agent_id !== agentId));
  return { ok: true, message: "已删除" };
}

export function resetAgents(): AgentDef[] {
  writeAll(DEFAULT_AGENTS.map((a) => ({ ...a })));
  return listAgents();
}
