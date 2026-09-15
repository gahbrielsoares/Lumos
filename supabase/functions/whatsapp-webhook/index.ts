// Edge Function: whatsapp-webhook
// Recebe mensagens da UAZAPI, aplica as regras do agent_config (ativo,
// telefones permitidos, prompt, temperatura), consulta o catálogo, chama
// o provedor de IA ativo (paga ou grátis) e responde via provedor de
// WhatsApp configurado (com fallback pros dados que a própria UAZAPI
// manda no payload, caso nada tenha sido configurado ainda).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Fallback: usado só se o slot ativo de IA não tiver chave própria salva.
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function onlyDigits(s: string | undefined | null) {
  return (s || "").replace(/\D/g, "");
}

// ---------- Provedores de IA (todos compatíveis com o formato OpenAI, exceto Gemini) ----------
async function callAiProvider(
  provider: { vendor: string; api_key: string; model: string } | null,
  systemPrompt: string,
  userContent: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const vendor = provider?.vendor || "openrouter";
  const apiKey = provider?.api_key || FALLBACK_OPENROUTER_KEY;
  const model = provider?.model || "meta-llama/llama-3.1-8b-instruct:free";

  if (vendor === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }

  const endpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
  };

  const res = await fetch(endpoints[vendor] || endpoints.openrouter, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(vendor === "openrouter"
        ? { "HTTP-Referer": "https://lumos-crm.com", "X-Title": "Lumos CRM" }
        : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ---------- Envio da resposta pelo provedor de WhatsApp configurado ----------
async function sendWhatsAppReply(
  waConfig: { vendor: string; base_url: string; api_key: string; instance_id?: string } | null,
  fallbackBaseUrl: string,
  fallbackToken: string,
  toNumber: string,
  text: string
) {
  // Sem configuração salva ainda: usa os dados que a própria UAZAPI mandou no payload (comportamento atual)
  if (!waConfig || !waConfig.base_url) {
    return fetch(`${fallbackBaseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: fallbackToken },
      body: JSON.stringify({ number: toNumber, text }),
    });
  }

  if (waConfig.vendor === "evolution") {
    return fetch(`${waConfig.base_url}/message/sendText/${waConfig.instance_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: waConfig.api_key },
      body: JSON.stringify({ number: toNumber, text }),
    });
  }

  // uazapi (ou qualquer outro compatível)
  return fetch(`${waConfig.base_url}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: waConfig.api_key },
    body: JSON.stringify({ number: toNumber, text }),
  });
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    if (payload.EventType !== "messages") {
      return new Response("ignored", { status: 200 });
    }

    const msg = payload.message;
    if (!msg || msg.fromMe || msg.type !== "text") {
      return new Response("ignored", { status: 200 });
    }

    const businessNumber = onlyDigits(payload.owner);
    const customerNumber = onlyDigits(msg.sender_pn);
    const customerName = payload.chat?.wa_name || payload.chat?.name || "";
    const text = msg.text as string;

    // 1. Descobrir o dono da conta pelo número principal cadastrado
    const { data: numbers } = await supabase
      .from("whatsapp_numbers")
      .select("owner_id, phone_number")
      .eq("type", "principal");

    const principal = numbers?.find((n) => onlyDigits(n.phone_number) === businessNumber);

    if (!principal) {
      console.error("Número principal não encontrado para:", businessNumber);
      return new Response("no owner", { status: 200 });
    }

    const owner_id = principal.owner_id;

    // 2. Carregar as configurações do agente
    const { data: agentConfig } = await supabase
      .from("agent_config")
      .select("*")
      .eq("owner_id", owner_id)
      .maybeSingle();

    if (agentConfig && agentConfig.enabled === false) {
      return new Response("agent disabled", { status: 200 });
    }

    if (agentConfig?.allowed_phones) {
      const allowList = agentConfig.allowed_phones.split(",").map((p: string) => onlyDigits(p)).filter(Boolean);
      if (allowList.length && !allowList.includes(customerNumber)) {
        return new Response("phone not allowed", { status: 200 });
      }
    }

    // 3. Encontrar ou criar o lead dessa conversa
    let { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("owner_id", owner_id)
      .eq("phone", customerNumber)
      .maybeSingle();

    if (!lead) {
      const { data: newLead } = await supabase
        .from("leads")
        .insert({ owner_id, phone: customerNumber, name: customerName, stage: "novo" })
        .select()
        .single();
      lead = newLead;
    }

    // 4. Salvar a mensagem recebida
    await supabase.from("messages").insert({ lead_id: lead.id, direction: "in", text });

    // 5. Buscar o catálogo de produtos do dono
    const { data: products } = await supabase
      .from("products")
      .select("name, description, price, unit")
      .eq("owner_id", owner_id)
      .eq("active", true)
      .limit(40);

    const catalogText = (products || [])
      .map((p) => `- ${p.name}: R$ ${p.price} / ${p.unit}${p.description ? " — " + p.description : ""}`)
      .join("\n");

    // 6. Buscar o histórico recente dessa conversa
    const historyLimit = agentConfig?.history_limit || 10;
    const { data: history } = await supabase
      .from("messages")
      .select("direction, text")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(historyLimit);

    const conversation = (history || [])
      .reverse()
      .map((m) => `${m.direction === "in" ? "Cliente" : "Atendente"}: ${m.text}`)
      .join("\n");

    // 7. Montar o prompt e chamar o provedor de IA ativo
    const basePrompt =
      agentConfig?.system_prompt ||
      "Você é a assistente de atendimento via WhatsApp de uma loja de materiais de construção e acabamento. Responda em português, de forma direta e simpática.";

    const systemPrompt = `${basePrompt}

Use SOMENTE os produtos do catálogo abaixo para falar de preços e disponibilidade — nunca invente produto ou preço.
Se o cliente perguntar algo fora do catálogo ou que exija um humano, diga que vai chamar alguém da equipe.

Catálogo:
${catalogText || "(nenhum produto cadastrado ainda)"}`;

    const { data: aiProviders } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("owner_id", owner_id);

    const activeSlot = agentConfig?.active_ai_slot || "gratis";
    const activeProvider = aiProviders?.find((p) => p.slot === activeSlot) || null;

    let reply = await callAiProvider(
      activeProvider,
      systemPrompt,
      `Histórico da conversa:\n${conversation}\n\nNova mensagem do cliente: ${text}`,
      agentConfig?.temperature ?? 0.7,
      agentConfig?.max_tokens ?? 1024
    );

    if (!reply) reply = "Desculpa, tive um probleminha aqui — já te respondo.";

    // 8. Salvar a resposta e atualizar o lead
    await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", text: reply });
    await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", lead.id);

    // 9. Enviar a resposta pelo provedor de WhatsApp configurado (ou fallback do payload)
    const { data: waConfig } = await supabase
      .from("whatsapp_provider_config")
      .select("*")
      .eq("owner_id", owner_id)
      .maybeSingle();

    await sendWhatsAppReply(waConfig, payload.BaseUrl, payload.token, customerNumber, reply);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 200 });
  }
});
