// Edge Function: whatsapp-webhook
// Recebe mensagens da UAZAPI, descobre qual AGENTE é dono do número que
// recebeu a mensagem (cada agente tem seu próprio número, prompt e
// provedores), aplica as regras desse agente (ativo, telefones permitidos),
// consulta o catálogo, chama o provedor de IA ativo (paga ou grátis) e
// responde via provedor de WhatsApp configurado (com fallback pros dados que
// a própria UAZAPI manda no payload, caso nada tenha sido configurado ainda).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Fallback: usado só se o slot ativo de IA não tiver chave própria salva.
const FALLBACK_OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function sanitizeReply(text: string): string {
  return text
    .replace(/<\/?[A-Za-z_][A-Za-z0-9_]*>/g, "") // remove tags tipo <CPA_DONE>, <|end|> etc.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Detecta quando o modelo vazou o "raciocínio interno" em vez da resposta final.
// Isso acontece com modelos de "reasoning" quando a API não separa esse
// conteúdo automaticamente. Nesses casos é mais seguro usar uma resposta
// de reserva do que arriscar mandar isso pro cliente.
function looksLikeLeakedReasoning(text: string): boolean {
  const markers = [
    "here's a thinking process",
    "let me think",
    "let's think",
    "analyze user input",
    "identify context",
    "step 1",
    "1.  **",
    "1. **",
    "wait, the rule",
    "revisão final",
  ];
  const lower = text.toLowerCase();
  return markers.some((m) => lower.includes(m)) || text.length > 900;
}

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
    if (!res.ok) console.error("Erro na chamada Gemini:", res.status, JSON.stringify(data));
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!out) console.error("Gemini respondeu vazio. Payload completo:", JSON.stringify(data));
    return out;
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
  if (!res.ok) console.error(`Erro na chamada ${vendor}:`, res.status, JSON.stringify(data));
  const out = data.choices?.[0]?.message?.content?.trim() || "";
  if (!out) console.error(`${vendor} respondeu vazio. Payload completo:`, JSON.stringify(data));
  return out;
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
    const res = await fetch(`${fallbackBaseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: fallbackToken },
      body: JSON.stringify({ number: toNumber, text }),
    });
    if (!res.ok) console.error("Falha ao enviar (fallback payload):", res.status, await res.text());
    return res;
  }

  if (waConfig.vendor === "evolution") {
    const res = await fetch(`${waConfig.base_url}/message/sendText/${waConfig.instance_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: waConfig.api_key },
      body: JSON.stringify({ number: toNumber, text }),
    });
    if (!res.ok) console.error("Falha ao enviar (evolution):", res.status, await res.text());
    return res;
  }

  // uazapi (ou qualquer outro compatível)
  const res = await fetch(`${waConfig.base_url}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: waConfig.api_key },
    body: JSON.stringify({ number: toNumber, text }),
  });
  if (!res.ok) console.error("Falha ao enviar (uazapi):", res.status, await res.text());
  return res;
}

// ---------- Envio de foto de produto ----------
async function sendWhatsAppPhoto(
  waConfig: { vendor: string; base_url: string; api_key: string; instance_id?: string } | null,
  fallbackBaseUrl: string,
  fallbackToken: string,
  toNumber: string,
  photoUrl: string,
  caption: string
) {
  const baseUrl = waConfig?.base_url || fallbackBaseUrl;
  const token = waConfig?.api_key || fallbackToken;
  const vendor = waConfig?.vendor || "uazapi";

  if (vendor === "evolution") {
    const res = await fetch(`${baseUrl}/message/sendMedia/${waConfig?.instance_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify({ number: toNumber, mediatype: "image", media: photoUrl, caption }),
    });
    if (!res.ok) console.error("Falha ao enviar foto (evolution):", res.status, await res.text());
    return res;
  }

  // uazapi
  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ number: toNumber, type: "image", file: photoUrl, text: caption }),
  });
  if (!res.ok) console.error("Falha ao enviar foto (uazapi):", res.status, await res.text());
  return res;
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

    // Ignora mensagens de grupo — só atende conversa individual
    if (msg.isGroup || payload.chat?.wa_isGroup) {
      console.log("Mensagem de grupo, ignorando.");
      return new Response("ignored group", { status: 200 });
    }

    const businessNumber = onlyDigits(payload.owner);
    const customerNumber = onlyDigits(msg.sender_pn);
    const customerName = payload.chat?.wa_name || payload.chat?.name || "";
    const text = msg.text as string;

    console.log("Mensagem recebida. De:", customerNumber, "Para (business):", businessNumber, "Texto:", text);

    // 1. Descobrir qual agente é dono desse número
    const { data: agents } = await supabase
      .from("agents")
      .select("*")
      .not("phone_number", "is", null);

    console.log("Agentes cadastrados:", JSON.stringify((agents || []).map((a) => ({ id: a.id, phone_number: a.phone_number }))));

    const agent = agents?.find((a) => onlyDigits(a.phone_number) === businessNumber);

    if (!agent) {
      console.error("Nenhum agente encontrado para o número:", businessNumber);
      return new Response("no agent", { status: 200 });
    }

    const owner_id = agent.owner_id;
    const agent_id = agent.id;
    console.log("Agente encontrado:", agent_id, "Owner:", owner_id);

    if (agent.enabled === false) {
      console.log("Agente desativado, ignorando.");
      return new Response("agent disabled", { status: 200 });
    }

    if (agent.allowed_phones) {
      const allowList = agent.allowed_phones.split(",").map((p: string) => onlyDigits(p)).filter(Boolean);
      if (allowList.length && !allowList.includes(customerNumber)) {
        console.log("Telefone não está na lista permitida:", customerNumber, "Lista:", allowList);
        return new Response("phone not allowed", { status: 200 });
      }
    }

    // 3. Encontrar ou criar o lead dessa conversa (por agente, já que cada agente é uma linha separada)
    let { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("agent_id", agent_id)
      .eq("phone", customerNumber)
      .maybeSingle();

    if (!lead) {
      const { data: newLead } = await supabase
        .from("leads")
        .insert({ owner_id, agent_id, phone: customerNumber, name: customerName, stage: "novo_contato" })
        .select()
        .single();
      lead = newLead;
    }

    // 4. Salvar a mensagem recebida
    await supabase.from("messages").insert({ lead_id: lead.id, direction: "in", text });

    // 5. Buscar o catálogo de produtos do dono
    const { data: products } = await supabase
      .from("products")
      .select("id, name, description, price, unit, photo_urls")
      .eq("owner_id", owner_id)
      .eq("active", true)
      .limit(40);

    const catalogText = (products || [])
      .map((p) => `- ${p.name}: R$ ${p.price} / ${p.unit}${p.description ? " — " + p.description : ""}`)
      .join("\n");

    // 6. Buscar o histórico recente dessa conversa
    const historyLimit = agent?.history_limit || 10;
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
      agent?.system_prompt ||
      "Você é a assistente de atendimento via WhatsApp de uma loja de materiais de construção e acabamento. Responda em português, de forma direta e simpática.";

    const { data: bizConfig } = await supabase
      .from("business_config")
      .select("business_type")
      .eq("owner_id", owner_id)
      .maybeSingle();

    const restaurantInstructions = bizConfig?.business_type === "restaurante" ? `

Você atende um restaurante. Siga estas regras à risca:
1. Se ainda não sabe em qual mesa o cliente está NESTA conversa, sua PRIMEIRA pergunta deve ser "Qual é o número da sua mesa?" — não fale de cardápio antes disso.
2. Assim que o cliente informar o número da mesa, confirme normalmente e adicione no final da mensagem, em uma linha própria: [MESA: número]
3. Quando o cliente confirmar um pedido de itens do catálogo, adicione no final da mensagem, um item por linha: [PEDIDO: Nome Exato do Item | quantidade]
4. Quando o cliente pedir a conta / fechar a mesa, adicione no final: [CONTA]
Nunca explique essas marcações pro cliente — elas são removidas automaticamente antes de chegar até ele.` : "";

    const systemPrompt = `${basePrompt}

Use SOMENTE os produtos do catálogo abaixo para falar de preços e disponibilidade — nunca invente produto ou preço.
Se o cliente perguntar algo fora do catálogo ou que exija um humano, diga que vai chamar alguém da equipe.

Se o cliente pedir pra ver uma foto de um produto específico que existe no catálogo abaixo, responda normalmente
e adicione, em uma linha separada no FINAL da mensagem, exatamente: [FOTO: Nome Exato do Produto]
Use o nome EXATO como aparece no catálogo. Só use essa marcação quando o produto existir e tiver o pedido claro de foto.
Nunca explique essa marcação pro cliente, ela é removida automaticamente antes de chegar até ele.
${restaurantInstructions}

Catálogo:
${catalogText || "(nenhum produto cadastrado ainda)"}`;

    const { data: aiProviders } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("agent_id", agent_id);

    const activeSlot = agent?.active_ai_slot || "gratis";
    const activeProvider = aiProviders?.find((p) => p.slot === activeSlot) || null;

    let reply = await callAiProvider(
      activeProvider,
      systemPrompt,
      `Histórico da conversa:\n${conversation}\n\nNova mensagem do cliente: ${text}`,
      agent?.temperature ?? 0.7,
      agent?.max_tokens ?? 1024
    );

    if (!reply) reply = "Desculpa, tive um probleminha aqui — já te respondo.";
    reply = sanitizeReply(reply);

    if (looksLikeLeakedReasoning(reply)) {
      console.error("Resposta descartada por parecer raciocínio interno vazado:", reply.slice(0, 300));
      reply = "Oi! Deixa eu confirmar uma informação aqui e já te respondo certinho.";
    }

    // Extrai TODAS as marcações [FOTO: nome do produto] — o cliente pode pedir mais de uma foto de uma vez
    const photoMatches = [...reply.matchAll(/\[FOTO:\s*(.+?)\]/gi)];
    const photoProductNames = photoMatches.map((m) => m[1].trim());

    // Marcações do fluxo de restaurante
    const mesaMatch = reply.match(/\[MESA:\s*(.+?)\]/i);
    const pedidoMatches = [...reply.matchAll(/\[PEDIDO:\s*(.+?)\s*\|\s*(\d+)\s*\]/gi)];
    const contaMatch = /\[CONTA\]/i.test(reply);

    reply = reply
      .replace(/\[FOTO:\s*(.+?)\]/gi, "")
      .replace(/\[MESA:\s*(.+?)\]/gi, "")
      .replace(/\[PEDIDO:\s*(.+?)\s*\|\s*(\d+)\s*\]/gi, "")
      .replace(/\[CONTA\]/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    console.log("Resposta da IA:", reply, "| Fotos pedidas:", JSON.stringify(photoProductNames), "| Mesa:", mesaMatch?.[1], "| Pedido:", pedidoMatches.length, "| Conta:", contaMatch);

    // 8. Salvar a resposta e atualizar o lead
    await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", text: reply });
    await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", lead.id);

    // 9. Enviar a resposta pelo provedor de WhatsApp configurado (ou fallback do payload)
    const { data: waConfig } = await supabase
      .from("whatsapp_provider_config")
      .select("*")
      .eq("agent_id", agent_id)
      .maybeSingle();

    console.log("Config de WhatsApp usada:", JSON.stringify({ ...waConfig, api_key: waConfig?.api_key ? "(definida)" : null }));

    await sendWhatsAppReply(waConfig, payload.BaseUrl, payload.token, customerNumber, reply);

    // 10.b Fluxo de restaurante: vincular à mesa, criar pedido, ou marcar aguardando pagamento
    if (bizConfig?.business_type === "restaurante") {
      // [MESA: N] — vincula o lead a uma sessão ativa daquela mesa (cria a sessão se for a primeira pessoa)
      if (mesaMatch) {
        const mesaDigits = onlyDigits(mesaMatch[1]);
        const { data: tables } = await supabase
          .from("restaurant_tables")
          .select("*")
          .eq("owner_id", owner_id);

        const table = (tables || []).find((t) => onlyDigits(t.label) === mesaDigits);

        if (table) {
          let { data: session } = await supabase
            .from("table_sessions")
            .select("*")
            .eq("table_id", table.id)
            .eq("status", "ativa")
            .maybeSingle();

          if (!session) {
            const { data: newSession } = await supabase
              .from("table_sessions")
              .insert({ table_id: table.id, owner_id, status: "ativa" })
              .select()
              .single();
            session = newSession;
            await supabase.from("restaurant_tables").update({ status: "ocupada" }).eq("id", table.id);
          }

          await supabase
            .from("leads")
            .update({ table_session_id: session.id, visit_status: "conversando" })
            .eq("id", lead.id);
          lead.table_session_id = session.id;

          console.log("Lead vinculado à mesa:", table.label, "sessão:", session.id);
        } else {
          console.log("Nenhuma mesa encontrada com o número:", mesaMatch[1]);
        }
      }

      // [PEDIDO: item | qtd] — cria um novo pedido com os itens pedidos
      if (pedidoMatches.length && lead.table_session_id) {
        const items = pedidoMatches.map((m) => {
          const itemName = m[1].trim();
          const quantity = parseInt(m[2]) || 1;
          const product = (products || []).find(
            (p) => p.name.toLowerCase().trim() === itemName.toLowerCase().trim()
          ) || (products || []).find((p) =>
            p.name.toLowerCase().includes(itemName.toLowerCase()) ||
            itemName.toLowerCase().includes(p.name.toLowerCase())
          );
          return {
            product_id: product?.id || null,
            product_name: product?.name || itemName,
            quantity,
            unit_price: product?.price || 0,
          };
        });

        const total = items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

        const { data: order } = await supabase
          .from("orders")
          .insert({ owner_id, table_session_id: lead.table_session_id, lead_id: lead.id, total })
          .select()
          .single();

        if (order) {
          await supabase.from("order_items").insert(
            items.map((it) => ({ order_id: order.id, ...it }))
          );
          console.log("Pedido criado:", order.id, "Total:", total);
        }
      }

      // [CONTA] — cliente pediu a conta
      if (contaMatch) {
        await supabase.from("leads").update({ visit_status: "aguardando_pagamento" }).eq("id", lead.id);
        console.log("Lead marcado como aguardando pagamento.");
      }
    }

    // 10.c Se a IA pediu pra mostrar uma ou mais fotos, busca cada produto e envia as imagens
    for (const photoProductName of photoProductNames) {
      const product = (products || []).find(
        (p) => p.name.toLowerCase().trim() === photoProductName.toLowerCase().trim()
      ) || (products || []).find((p) =>
        p.name.toLowerCase().includes(photoProductName.toLowerCase()) ||
        photoProductName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (product?.photo_urls?.length) {
        console.log("Enviando foto do produto:", product.name, product.photo_urls[0]);
        await sendWhatsAppPhoto(waConfig, payload.BaseUrl, payload.token, customerNumber, product.photo_urls[0], product.name);
      } else {
        console.log("Produto pedido na foto não encontrado ou sem foto cadastrada:", photoProductName);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 200 });
  }
});
