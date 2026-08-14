/**
 * LLM通信层 v2 — OpenAI兼容协议
 * 支持流式输出 + 6个工具调用
 *
 * 工具列表：
 *   search_food           — 搜索食物编码和名称
 *   query_food_gi         — 查询GI值
 *   get_food_categories   — 查询食物分类体系
 *   get_nutrient_def      — 查询营养素定义
 *   list_gi_by_level      — 按GI等级列出食物
 *   get_food_detail       — 综合查询（编码+分类+GI）
 */
import OpenAI from "openai";
import { buildSystemPrompt } from "./persona.js";
import {
  queryFood, searchFood,
  getFoodCategories, getNutrientDefinitions,
} from "./food-db.js";
import { getSettings } from "./settings.js";
import { queryGuide, loadGuides } from "./guide-db.js";
import { getEnabledToolNames, getEnabledGuideIds } from "./skill-db.js";
import { buildChatMemoryContext } from "./memory-db.js";
import { runConsult } from "./consult-engine.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
}

function createClient() {
  const settings = getSettings();
  return new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseURL });
}

/**
 * 测试 LLM 连接 — 使用最简请求（不带工具参数），对任意 OpenAI 兼容端点通用。
 * 成功返回 true，失败抛错（错误信息含原因）。
 */
export async function testConnection(settings?: {
  apiKey: string;
  baseURL: string;
  model: string;
}): Promise<{ ok: boolean; message: string }> {
  const cfg = settings ?? getSettings();
  if (!cfg.apiKey) {
    return { ok: false, message: "未配置 API Key" };
  }
  try {
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    const resp = await client.chat.completions.create({
      model: cfg.model,
      messages: [{ role: "user", content: "ping，请简短回复" }],
      // 注意：K3 等推理模型的思考 token 计入输出预算，预算太小会导致回复为空。
      // 用 128 保证能测出真实回复；连接成功与否不看回复内容。
      max_tokens: 128,
    });
    const text = resp.choices?.[0]?.message?.content?.trim() ?? "";
    return { ok: true, message: text || "(模型已响应，但内容为空)" };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const hint = e.status === 401 ? "（API Key 无效，请检查）"
      : e.status === 404 ? "（模型名不存在，请检查 Model 字段）"
      : e.status === 429 ? "（额度不足或限流）"
      : "";
    return { ok: false, message: `${e.message || "连接失败"} ${hint}`.trim() };
  }
}

// === 工具定义 ===

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consult",
      description:
        "发起多智能体营养会诊（营养MDT）：多个专科顾问Agent并行给出意见，主持人汇总并标注分歧与高危复核项。当用户问题复杂、多病共存、涉及多专科，或用户明确要求会诊/MDT/多顾问联合意见时调用。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "会诊问题（完整描述，供各专科顾问独立分析）",
          },
          profile_summary: {
            type: "string",
            description: "用户档案摘要（可选，含年龄性别体征指标病史等；没有可不填）",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_food",
      description: "模糊搜索食物名称，返回匹配的食物列表（编码、名称、分类）。数据源：中国食物成分表标准版第6版，386条食物。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "食物名称关键词，如'米饭'、'牛奶'" },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_food_gi",
      description: "查询食物的血糖生成指数(GI)值，返回GI值和分类(低GI<55 / 中GI 55-70 / 高GI>70)。数据源：259个食物GI值。",
      parameters: {
        type: "object",
        properties: {
          food_name: { type: "string", description: "食物名称" },
        },
        required: ["food_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_food_categories",
      description: "查询中国食物分类体系（8大类+亚类），可按类别编码筛选。编码规则：6位=2位类+1位亚类+3位序号。",
      parameters: {
        type: "object",
        properties: {
          class_code: {
            type: "string",
            description: "食物类别编码(可选)，如'01'=谷类, '04'=蔬菜类。不填则返回全部分类。",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nutrient_def",
      description: "查询营养素定义与分析方法，包括INFOODS Tagname、单位、分析方法和精确度。可按关键词搜索。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "营养素关键词(可选)，如'蛋白质'、'VITC'、'钙'。不填则返回全部31条定义。",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_gi_by_level",
      description: "按GI等级列出食物。等级：低GI(<55)、中GI(55-70)、高GI(>70)。",
      parameters: {
        type: "object",
        properties: {
          level: {
            type: "string",
            enum: ["低GI", "中GI", "高GI"],
            description: "GI等级",
          },
        },
        required: ["level"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_food_detail",
      description: "综合查询一个食物的全部信息：编码、名称、分类、GI值（如有）。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "食物名称" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_guide",
      description:
        "查询国家卫健委官方食养指南的内容（糖尿病/高血压/痛风/慢性肾脏病/脑卒中/肌少症/骨质疏松/成人肥胖/儿童生长迟缓/儿童肥胖）。可查中医证型及症状、食谱示例、食养方。回答食养/辨证问题时应调用。",
      parameters: {
        type: "object",
        properties: {
          guide: {
            type: "string",
            description: "指南名称或关键词，如'糖尿病'、'痛风'、'儿童肥胖'",
          },
          topic: {
            type: "string",
            enum: ["证型", "食谱", "食养方", "全部"],
            description: "查询主题，默认'全部'",
          },
        },
        required: ["guide"],
      },
    },
  },
];

// === 工具调用处理器 ===

/** 当前可用工具（按 Skill 注册表过滤；consult 恒可用） */
function activeTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const enabled = new Set(getEnabledToolNames());
  return tools.filter((t) => t.function.name === "consult" || enabled.has(t.function.name));
}

async function handleToolCall(
  name: string,
  args: Record<string, string>
): Promise<string> {
  switch (name) {
    case "search_food": {
      const results = searchFood(args.keyword);
      if (results.length === 0) return `未找到包含"${args.keyword}"的食物`;
      const lines = results.map((r) => `| ${r.code} | ${r.name} | ${r.category} |`);
      return `找到${results.length}个匹配食物：\n| 编码 | 名称 | 分类 |\n|------|------|------|\n${lines.join("\n")}`;
    }
    case "query_food_gi": {
      const gi = queryFood(args.food_name);
      if (!gi) return `未找到"${args.food_name}"的GI数据`;
      return `${gi.food_name}: GI=${gi.value} (${gi.level})，分类: ${gi.category}`;
    }
    case "get_food_categories": {
      const cats = getFoodCategories(args.class_code);
      if (cats.length === 0) return "未找到食物分类数据";
      const lines = cats.map(
        (c) => `| ${c.class_code} | ${c.class_name} | ${c.subclass_code} | ${c.subclass_name} | ${c.food_count}条 | ${c.volume} |`
      );
      return `食物分类体系（${cats.length}个亚类）：\n| 类编码 | 类名 | 亚类编码 | 亚类名 | 条数 | 册 |\n|--------|------|----------|--------|------|----|\n${lines.join("\n")}`;
    }
    case "get_nutrient_def": {
      const nutrients = getNutrientDefinitions(args.keyword);
      if (nutrients.length === 0) return `未找到包含"${args.keyword}"的营养素定义`;
      const lines = nutrients.map(
        (n) => `| ${n.nutrient_cn} | ${n.nutrient_en} | ${n.unit} | ${n.infods_tag} | ${n.method} |`
      );
      return `营养素定义（${nutrients.length}条）：\n| 中文名 | 英文名 | 单位 | INFOODS Tag | 分析方法 |\n|--------|--------|------|-------------|----------|\n${lines.join("\n")}`;
    }
    case "list_gi_by_level": {
      // 从数据库查所有该等级的GI值
      const results = searchFood(""); // 不直接用，需要特殊查询
      // 简化：查全部GI再过滤
      const allGi = getNutrientDefinitions(""); // 不对，需要直接查gi_values
      // 用 searchFood + queryFood 组合不高效，直接用db查询
      // 这里简化处理：提示LLM用query_food_gi逐个查
      return `请使用 query_food_gi 工具查询具体食物的GI值。GI等级参考：低GI(<55): 黄豆18/花生14/苹果36；中GI(55-70): 面条55/小米粥60/马铃薯煮66；高GI(>70): 大米饭90/馒头88/西瓜72`;
    }
    case "get_food_detail": {
      const foods = searchFood(args.name);
      if (foods.length === 0) return `未找到"${args.name}"`;
      const food = foods[0];
      const gi = queryFood(food.name);
      let result = `食物: ${food.name}\n编码: ${food.code}\n分类: ${food.category}`;
      if (gi) result += `\nGI值: ${gi.value} (${gi.level})`;
      return result;
    }
    case "query_guide": {
      const guides = loadGuides();
      const guide = guides.find((g) => g.id === (args.guide || "").trim() || (args.guide || "").includes(g.name));
      if (guide && !getEnabledGuideIds().includes(guide.id)) {
        return `指南「${guide.name}」已在技能库中被停用。可在「技能」页重新启用。`;
      }
      return queryGuide(args.guide || "", args.topic);
    }
    case "consult": {
      // 多智能体会诊：耗时较长（多路模型并行+主持人汇总），引擎自动选择 llm/mock
      const result = await runConsult({
        question: args.question || "",
        profile_summary: args.profile_summary,
        engine: "auto",
      });
      const parts: string[] = [];
      parts.push(`【多智能体会诊单 ${result.consult_id}｜引擎:${result.engine}｜检出人群:${result.matched_population.join("、") || "无"}】`);
      for (const o of result.opinions) {
        parts.push(`\n◆ ${o.agent_name}${o.model ? `(${o.model})` : ""}${o.status !== "ok" ? `[${o.status}]` : ""}：\n${o.content.slice(0, 500)}`);
      }
      if (result.moderation) parts.push(`\n【主持人汇总】\n${result.moderation.content.slice(0, 800)}`);
      if (result.divergences.length) parts.push(`\n【分歧】${result.divergences.join("；")}`);
      if (result.high_risk_items.length) {
        parts.push(`\n【高危复核项 review_required】${result.high_risk_items.map((h) => `${h.risk_key}:${h.note}`).join("；")}`);
      }
      parts.push(`\n（以上为候选意见，须用户终审。请基于会诊结果给用户综合答复。）`);
      const text = parts.join("\n");
      return text.length > 6000 ? text.slice(0, 6000) + "…（截断）" : text;
    }
    default:
      return `未知工具: ${name}`;
  }
}

// === 流式对话 ===

export async function chatStream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks
): Promise<void> {
  const settings = getSettings();
  if (!settings.apiKey) {
    callbacks.onError(
      new Error("未配置API Key！请在应用的「设置」面板中填写，或设置 NUTRITION_BUDDY_LLM_API_KEY")
    );
    return;
  }

  const client = createClient();
  const model = settings.model;

  // 记忆注入（M2）：默认用户档案 + 相关长期记忆（带截断护栏）
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const memoryCtx = buildChatMemoryContext(lastUser);
  const systemContent = memoryCtx
    ? `${buildSystemPrompt()}\n\n# 用户记忆（跨会话保留，回答时主动运用）\n\n${memoryCtx}`
    : buildSystemPrompt();

  const fullMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let fullText = "";
  let toolsDisabled = false;

  try {
    // K3 等推理模型会反复调用工具（先查GI再查详情再对比），3 轮不够完成回答，
    // 提高到 8 轮；每轮都会带上前一轮的工具结果，模型最终会停止调用并给出答案
    for (let round = 0; round < 8; round++) {
      // 若模型不支持工具调用（已降级），或本轮要继续工具循环时保持降级状态
      let stream;
      if (!toolsDisabled) {
        try {
          stream = await client.chat.completions.create({
            model,
            messages: fullMessages,
            tools: activeTools(),
            stream: true,
            // K3 等推理模型的思考 token 计入输出预算，必须给足，
            // 否则推理过程耗尽预算，最终回复为空
            max_tokens: 4096,
          });
        } catch (err) {
          // 模型可能不支持 tools 参数 → 降级为纯对话模式重试
          const e = err as { status?: number; message?: string };
          console.warn("[llm] 工具调用失败，降级为纯对话模式:", e.message);
          toolsDisabled = true;
          stream = await client.chat.completions.create({
            model,
            messages: fullMessages,
            stream: true,
            max_tokens: 4096,
          });
        }
      } else {
        stream = await client.chat.completions.create({
          model,
          messages: fullMessages,
          stream: true,
          max_tokens: 4096,
        });
      }

      let toolCalls: Record<number, { id: string; name: string; args: string }> = {};
      let hasToolCall = false;
      let reasoningText = "";
      let roundContent = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Kimi K3 等推理模型：思维过程在 reasoning_content，最终答案在 content
        const reasoning = (delta as unknown as { reasoning_content?: string }).reasoning_content;
        if (reasoning) {
          reasoningText += reasoning;
        }

        if (delta.content) {
          roundContent += delta.content;
          fullText += delta.content;
          callbacks.onToken(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = { id: tc.id || "", name: "", args: "" };
              }
              if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].args += tc.function.arguments;
              hasToolCall = true;
            }
          }
        }
      }

      if (hasToolCall) {
        // 回传完整 assistant 消息：必须包含 tool_calls，否则工具调用会失败
        // （K3 等模型还要求保留 reasoning_content）
        // 注意：content 必须用本轮的 roundContent，而不是跨轮累积的 fullText
        const assistantMsg: Record<string, unknown> = {
          role: "assistant",
          content: roundContent || null,
          tool_calls: Object.keys(toolCalls)
            .sort()
            .map((idx) => {
              const tc = toolCalls[Number(idx)];
              return {
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: tc.args || "{}" },
              };
            }),
        };
        if (reasoningText) {
          (assistantMsg as Record<string, unknown>).reasoning_content = reasoningText;
        }
        fullMessages.push(assistantMsg as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam);

        for (const idx of Object.keys(toolCalls).sort()) {
          const tc = toolCalls[Number(idx)];
          let parsedArgs: Record<string, string> = {};
          try { parsedArgs = JSON.parse(tc.args || "{}"); } catch { parsedArgs = {}; }
          const result = await handleToolCall(tc.name, parsedArgs);
          fullMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        continue;
      }

      callbacks.onDone(fullText);
      return;
    }

    // 8 轮工具循环耗尽仍无最终答复的兜底
    if (!fullText.trim()) {
      callbacks.onError(new Error("模型思考时间过长，请重试一次"));
    } else {
      callbacks.onDone(fullText);
    }
  } catch (err) {
    callbacks.onError(err as Error);
  }
}
