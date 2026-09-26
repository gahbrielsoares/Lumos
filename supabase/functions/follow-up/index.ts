// Edge Function: follow-up
// Roda a cada minuto (agendada no Supabase). Pra cada loja com follow-up ligado:
//  - respeita a janela de horário, os dias da semana e o intervalo entre envios (padrão: 1 por minuto)
//  - acha o lead mais "atrasado" cujo próximo card (1, 2, 3...) já venceu
//  - a IA escreve a mensagem com base na conversa e no objetivo do card, e o sistema envia
// Para quando: o cliente responde, a IA está pausada no contato, o lead foi fechado/perdido
// ou o cliente pediu pra não receber mais mensagens.
//
// Deploy com "Enforce JWT verification" DESLIGADO. Quem chama:
//  - o agendador (cabeçalho x-cron-secret = secret FOLLOWUP_SECRET), processando todas as lojas
//  - o dono logado, pelo botão "Rodar agora" (processa só a loja dele)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("FOLLOWUP_SECRET") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const onlyDigits = (s: unknown) => String(s || "").replace(/\D/g, "");
const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const UNIT_MS: Record<string, number> = { minutos: 60e3, horas: 3600e3, dias: 86400e3 };
const MAX_REP_CAP = 10;
const STOP_STAGES = ["fechado", "perdido"];

// Objetivos prontos: o que a IA deve fazer em cada card
const OBJETIVOS: Record<string, string> = {
  retomar: "Retome a conversa de forma leve e natural: relembre em poucas palavras o que o cliente procurava e pergunte se ainda pode ajudar.",
  duvidas: "Pergunte se ficou alguma dúvida sobre o que foi conversado (produtos, medidas, prazos, formas de pagamento) e se ofereça para ajudar a decidir.",
  orcamento: "Relembre o orçamento ou os itens que o cliente estava vendo e pergunte se pode fechar o pedido ou se quer ajustar alguma coisa.",
  pagamento: "Lembre com gentileza que o pedido está aguardando pagamento e que o link continua valendo; pergunte se precisa de ajuda para pagar.",
  desconto: "Ofereça um desconto especial para fechar agora (o percentual e a validade estão abaixo). Seja direto e amigável, sem parecer desesperado.",
  encerrar: "Último contato: diga que vai encerrar o atendimento por aqui para não incomodar, mas que continua à disposição quando o cliente quiser.",
};

// ---------- Horário de Brasília ----------
function nowBR() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hhmm = `${get("hour").replace("24", "00")}:${get("minute")}`;
  return { dia, hhmm };
}
const toMin = (hhmm: string) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
// deno-lint-ignore no-explicit-any
function insideWindow(cfg: any) {
  const { dia, hhmm } = nowBR();
  const dias: number[] = cfg.dias?.length ? cfg.dias : [1, 2, 3, 4, 5, 6];
  if (!dias.includes(dia)) return false;
  const n = toMin(hhmm), a = toMin(cfg.hora_inicio || "08:00"), b = toMin(cfg.hora_fim || "20:00");
  return a <= b ? n >= a && n < b : n >= a || n < b;
}

// Primeiro horário fixo (HH:MM em Brasília) igual ou depois de `from`
function nextFixedTime(from: Date, hhmm: string): Date {
  const [h, m] = String(hhmm || "10:00").split(":").map(Number);
  const d = new Date(from.getTime());
  // meia-noite de Brasília do dia de `from`
  const br = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const offset = d.getTime() - br.getTime();
  const candidate = new Date(br.getFullYear(), br.getMonth(), br.getDate(), h || 0, m || 0, 0).getTime() + offset;
  return new Date(candidate >= from.getTime() ? candidate : candidate + 86400e3);
}

// deno-lint-ignore no-explicit-any
function dueAt(rule: any, lastOut: Date): Date {
  const wait = Math.max(1, Number(rule.espera_valor || 1)) * (UNIT_MS[rule.espera_unidade] || UNIT_MS.horas);
  const after = new Date(lastOut.getTime() + wait);
  return rule.gatilho === "horario_fixo" && rule.horario_fixo ? nextFixedTime(after, rule.horario_fixo) : after;
}

// ---------- IA ----------
function toWhatsApp(text: string) {
  return String(text || "")
    .replace(/<\/?[A-Za-z_][A-Za-z0-9_]*>/g, "")
    .replace(/\[[A-Z]+:[^\]]*\]?/g, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// deno-lint-ignore no-explicit-any
async function callAi(provider: any, system: string, user: string): Promise<string> {
  if (!provider?.api_key) return "";
  const vendor = provider.vendor || "openrouter";
  try {
    if (vendor === "gemini") {
      const model = provider.model || "gemini-3.1-flash-lite";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.api_key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      });
      const data = await res.json();
      if (!res.ok) { console.error("Gemini:", JSON.stringify(data)); return ""; }
      return (data.candidates?.[0]?.content?.parts || []).filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
        .map((p: { text: string }) => p.text).join("").trim();
    }
    const endpoints: Record<string, string> = {
      openai: "https://api.openai.com/v1/chat/completions",
      groq: "https://api.groq.com/openai/v1/chat/completions",
      openrouter: "https://openrouter.ai/api/v1/chat/completions",
    };
    const model = provider.model || "openai/gpt-oss-20b";
    const res = await fetch(endpoints[vendor] || endpoints.openrouter, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model, temperature: 0.7, max_tokens: 2048,
        ...(vendor === "groq" && /gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const data = await res.json();
    if (!res.ok) { console.error(`${vendor}:`, JSON.stringify(data)); return ""; }
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("Falha na IA do follow-up:", err);
    return "";
  }
}

// deno-lint-ignore no-explicit-any
async function sendText(wa: any, to: string, text: string) {
  if (!wa?.base_url || !wa?.api_key) return false;
  const res = wa.vendor === "evolution"
    ? await fetch(`${wa.base_url}/message/sendText/${wa.instance_id}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: wa.api_key }, body: JSON.stringify({ number: to, text }),
      })
    : await fetch(`${wa.base_url}/send/text`, {
        method: "POST", headers: { "Content-Type": "application/json", token: wa.api_key }, body: JSON.stringify({ number: to, text }),
      });
  if (!res.ok) console.error("Falha ao enviar follow-up:", res.status, await res.text());
  return res.ok;
}

// ---------- Uma loja por vez: no máximo 1 envio por execução ----------
// deno-lint-ignore no-explicit-any
async function processOwner(cfg: any, force = false) {
  const owner_id = cfg.owner_id;
  if (!force) {
    if (!cfg.ativo) return { skipped: "desligado" };
    if (!insideWindow(cfg)) return { skipped: "fora da janela de horário" };
    const gap = Math.max(30, Number(cfg.intervalo_seg || 60)) * 1000;
    if (cfg.ultimo_envio_at && Date.now() - new Date(cfg.ultimo_envio_at).getTime() < gap) return { skipped: "aguardando intervalo" };
  }

  const { data: rules } = await supabase.from("follow_up_rules").select("*")
    .eq("owner_id", owner_id).eq("ativo", true).order("ordem");
  if (!rules?.length) return { skipped: "nenhum card ativo" };

  // Leads que conversaram nos últimos 30 dias e podem receber follow-up
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const { data: leads } = await supabase.from("leads").select("*")
    .eq("owner_id", owner_id).gte("last_message_at", since)
    .not("stage", "in", `(${STOP_STAGES.join(",")})`)
    .order("last_message_at", { ascending: true }).limit(300);

  // deno-lint-ignore no-explicit-any
  let best: { lead: any; rule: any; due: Date; lastOut: Date } | null = null;
  for (const lead of leads || []) {
    if (lead.fu_optout || lead.ai_enabled === false) continue;
    const step = Number(lead.fu_step || 0);
    if (step >= rules.length) continue;
    const rule = rules[step];

    // A última mensagem precisa ser nossa (estamos esperando o cliente) e o cliente já precisa ter falado com a loja
    const { data: last } = await supabase.from("messages").select("direction, created_at")
      .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!last || last.direction !== "out") continue;
    const lastOut = new Date(last.created_at);
    const due = dueAt(rule, lastOut);
    if (due.getTime() > Date.now()) continue;
    if (!best || due < best.due) best = { lead, rule, due, lastOut };
  }
  if (!best) return { skipped: "ninguém na fila agora" };

  const { lead, rule } = best;
  const { data: agent } = await supabase.from("agents").select("*").eq("id", lead.agent_id).maybeSingle();
  const { data: wa } = await supabase.from("whatsapp_provider_config").select("*").eq("agent_id", lead.agent_id).maybeSingle();
  const { data: providers } = await supabase.from("ai_providers").select("*").eq("agent_id", lead.agent_id);
  const active = (providers || []).find((p) => p.slot === (agent?.active_ai_slot || "gratis"));
  const other = (providers || []).find((p) => p !== active && p.api_key);

  // Contexto: conversa recente e pedido pendente
  const { data: hist } = await supabase.from("messages").select("direction, text")
    .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(14);
  const conversa = (hist || []).reverse().map((m) => `${m.direction === "in" ? "Cliente" : "Atendente"}: ${m.text}`).join("\n");
  const { data: pedido } = await supabase.from("sales_orders").select("numero, total, status, pagamento")
    .eq("lead_id", lead.id).in("status", ["aguardando_aprovacao", "aguardando_pagamento"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let objetivo = rule.objetivo_tipo === "personalizado" ? (rule.objetivo_texto || OBJETIVOS.retomar) : OBJETIVOS[rule.objetivo_tipo] || OBJETIVOS.retomar;
  // "Lembrar pagamento" sem pedido pendente vira "retomar"
  if (rule.objetivo_tipo === "pagamento" && pedido?.status !== "aguardando_pagamento") objetivo = OBJETIVOS.retomar;

  const desconto = Number(rule.desconto_pct || 0);
  const validade = new Date(Date.now() + 48 * 3600e3);
  const extras = [
    rule.objetivo_tipo === "desconto" && desconto > 0
      ? `Desconto autorizado: ${desconto}% sobre os produtos, válido por 48 horas (até ${validade.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}).`
      : "",
    pedido?.status === "aguardando_pagamento" && pedido.pagamento?.link ? `Pedido #${pedido.numero} aguardando pagamento (${brl(pedido.total)}). Link: ${pedido.pagamento.link}` : "",
    pedido?.status === "aguardando_aprovacao" ? `Pedido #${pedido.numero} registrado, aguardando a equipe conferir.` : "",
  ].filter(Boolean).join("\n");

  const system = `${agent?.system_prompt || "Você é a atendente desta loja no WhatsApp."}

TAREFA AGORA: o cliente parou de responder. Escreva UMA mensagem curta de follow-up (este é o follow-up nº ${rule.ordem}).
Objetivo desta mensagem: ${objetivo}
${extras ? `\n${extras}\n` : ""}
Regras: soe humano e natural, no máximo 3 frases curtas, chame o cliente pelo primeiro nome se souber, não repita mensagens que já estão na conversa,
não invente preço, produto ou condição que não esteja acima. Escreva só a mensagem, sem marcações e sem explicar nada.
Formatação do WhatsApp: negrito com UM asterisco (*assim*).`;
  const user = `Conversa até aqui:\n${conversa}\n\nEscreva agora a mensagem de follow-up.`;

  let texto = toWhatsApp(await callAi(active, system, user));
  if (!texto && other) texto = toWhatsApp(await callAi(other, system, user));
  if (!texto || texto.length > 900) return { error: "A IA não gerou a mensagem" };

  // Grava antes de enviar (o eco do WhatsApp não duplica) e envia
  await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", sender: "sistema", text: texto });
  const ok = await sendText(wa, onlyDigits(lead.phone), texto);
  if (!ok) return { error: "Falha no envio pelo WhatsApp" };

  // Avança a sequência: card único passa pro próximo; constante repete até o limite
  const maxRep = Math.min(MAX_REP_CAP, Math.max(1, Number(rule.max_repeticoes || 3)));
  const rep = Number(lead.fu_rep || 0) + 1;
  const nextStep = rule.repeticao === "constante" && rep < maxRep ? Number(lead.fu_step || 0) : Number(lead.fu_step || 0) + 1;
  const update: Record<string, unknown> = {
    fu_step: nextStep, fu_rep: nextStep === Number(lead.fu_step || 0) ? rep : 0, last_message_at: new Date().toISOString(),
  };
  if (["novo_contato", "conversando"].includes(lead.stage)) update.stage = "follow_up";
  if (rule.objetivo_tipo === "desconto" && desconto > 0) { update.desconto_pct = desconto; update.desconto_ate = validade.toISOString(); }
  await supabase.from("leads").update(update).eq("id", lead.id);

  await supabase.from("follow_up_log").insert({
    owner_id, lead_id: lead.id, rule_id: rule.id, ordem: rule.ordem, objetivo: rule.objetivo_tipo, texto,
  });
  await supabase.from("follow_up_config").update({ ultimo_envio_at: new Date().toISOString() }).eq("owner_id", owner_id);
  console.log("Follow-up enviado:", lead.phone, "card", rule.ordem, rule.objetivo_tipo);
  return { sent: { lead: lead.name || lead.phone, card: rule.ordem, texto } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Agendador: todas as lojas com follow-up ligado
    if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
      const { data: configs } = await supabase.from("follow_up_config").select("*").eq("ativo", true);
      const results = [];
      for (const cfg of configs || []) results.push({ owner: cfg.owner_id, ...(await processOwner(cfg)) });
      return json({ ok: true, results });
    }

    // Botão "Rodar agora": só a loja de quem está logado (ignora janela e intervalo)
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data } = await supabase.auth.getUser(jwt);
    if (!data?.user) return json({ error: "Não autorizado." }, 401);
    const { data: cfg } = await supabase.from("follow_up_config").select("*").eq("owner_id", data.user.id).maybeSingle();
    return json(await processOwner(cfg || { owner_id: data.user.id }, true));
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado." }, 500);
  }
});
