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
  return toWhatsAppFormat(
    text.replace(/<\/?[A-Za-z_][A-Za-z0-9_]*>/g, "") // remove tags tipo <CPA_DONE>, <|end|> etc.
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Converte a formatação Markdown que os modelos costumam usar pro formato do WhatsApp.
// No WhatsApp: *negrito*, _itálico_, ~tachado~. Markdown usa **negrito**, que no
// WhatsApp aparece com asteriscos sobrando.
function toWhatsAppFormat(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "*$1*")          // ***negrito itálico*** -> *negrito*
    .replace(/\*\*(.+?)\*\*/g, "*$1*")                // **negrito** -> *negrito*
    .replace(/__(.+?)__/g, "_$1_")                   // __itálico__ -> _itálico_
    .replace(/~~(.+?)~~/g, "~$1~")                   // ~~tachado~~ -> ~tachado~
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")            // # Título -> *Título*
    .replace(/^(\s*)[*+]\s+/gm, "$1• ")              // "* item" (lista Markdown) -> "• item"
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2") // [texto](link) -> texto: link
    .replace(/\*{2,}/g, "");                         // sobra de asteriscos duplos
}

// Detecta quando o modelo vazou o "raciocínio interno" em vez da resposta final.
// Isso acontece com modelos de "reasoning" quando a API não separa esse
// conteúdo automaticamente. Nesses casos é mais seguro usar uma resposta
// de reserva do que arriscar mandar isso pro cliente.
function looksLikeLeakedReasoning(text: string): boolean {
  // Avalia só o texto que vai pro cliente (sem as marcações internas, que podem ser longas num fechamento)
  const visible = text.replace(/\[(FOTO|MESA|PEDIDO|CONTA|CONTEXTO|IMAGEM|ETAPA|ORCAMENTO|ENTREGA)[^\]]*\]?/gi, "").trim();
  const markers = [
    "here's a thinking process",
    "let me think",
    "let's think",
    "analyze user input",
    "identify context",
    "wait, the rule",
    "the user is asking",
    "we need to respond",
    "revisão final",
  ];
  const lower = visible.toLowerCase();
  return markers.some((m) => lower.includes(m)) || visible.length > 2200;
}

// Resposta que "enrola" (promete voltar depois) em vez de resolver — a IA não tem como voltar depois
function looksLikeStall(text: string): boolean {
  const visible = text.replace(/\[[^\]]*\]?/g, " ").toLowerCase();
  if (/\[orcamento:/i.test(text)) return false;
  return /(j[áa] te (respondo|retorno|confirmo|falo)|deixa eu (confirmar|verificar|checar|consultar)|vou (verificar|confirmar|checar|consultar)[^.!?\n]{0,40}(equipe|pessoal|setor|j[áa] te)|s[óo] um (instante|minuto|momento)|aguarde (um|só)|recebi (aqui )?a confirma[çc][ãa]o da (nossa )?equipe)/.test(visible);
}

function onlyDigits(s: string | undefined | null) {
  return (s || "").replace(/\D/g, "");
}

// Normaliza texto pra comparar nomes de produto com segurança: minúsculas,
// espaços únicos, e trata qualquer tipo de traço/hífen "chique" que a IA
// às vezes gera (—, –, ‑, −) como um hífen comum.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Converte bytes pra base64 sem estourar a pilha em arquivos maiores
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------- Baixa mídia (imagem/áudio) já descriptografada via UAZAPI ----------
async function downloadUazapiMedia(baseUrl: string, token: string, messageid: string) {
  const res = await fetch(`${baseUrl}/message/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ id: messageid }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) console.error("Erro ao baixar mídia da UAZAPI:", res.status, JSON.stringify(data));
  if (!data?.fileURL) console.error("Download de mídia não retornou fileURL. Resposta completa:", JSON.stringify(data));
  return data;
}

// ---------- Transcreve áudio usando o mesmo provedor de IA configurado ----------
async function transcribeAudio(
  fileUrl: string,
  provider: { vendor: string; api_key: string; model?: string } | null,
  fallbackKey: string
): Promise<string> {
  const vendor = provider?.vendor;
  const apiKey = provider?.api_key || fallbackKey;
  if (!apiKey) {
    console.error("Sem chave de API disponível pra transcrever áudio.");
    return "";
  }

  try {
    const audioRes = await fetch(fileUrl);
    const audioBuffer = new Uint8Array(await audioRes.arrayBuffer());

    if (vendor === "groq" || vendor === "openai") {
      const endpoint = vendor === "groq"
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "https://api.openai.com/v1/audio/transcriptions";
      const model = vendor === "groq" ? "whisper-large-v3-turbo" : "whisper-1";

      const form = new FormData();
      form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "audio.ogg");
      form.append("model", model);
      form.append("language", "pt");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) console.error(`Erro ao transcrever áudio (${vendor}):`, res.status, JSON.stringify(data));
      return data.text?.trim() || "";
    }

    if (vendor === "gemini") {
      // Usa o mesmo modelo configurado no slot (mais barato e respeita a cota do plano)
      const geminiModel = provider?.model || "gemini-3.1-flash-lite";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: "Transcreva o áudio a seguir. Responda SOMENTE com o texto falado, em português, sem comentários." },
                { inlineData: { mimeType: "audio/ogg", data: bytesToBase64(audioBuffer) } },
              ],
            }],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) console.error("Erro ao transcrever áudio (gemini):", res.status, JSON.stringify(data));
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    }

    console.log("Provedor sem suporte a transcrição de áudio implementado ainda:", vendor);
    return "";
  } catch (err) {
    console.error("Erro inesperado ao transcrever áudio:", err);
    return "";
  }
}

// ---------- Provedores de IA (todos compatíveis com o formato OpenAI, exceto Gemini) ----------
// ---------- Funil (Kanban): a IA só avança o lead, nunca volta ----------
const AUTO_STAGE_RANK: Record<string, number> = {
  novo_contato: 0,
  conversando: 1,
  consulta_agendada: 2,
  aguardando_link: 3,
};

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseQty(s: string) {
  let t = String(s).trim();
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");   // 1.250,5 -> 1250.5
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");  // 1.250 -> 1250
  const n = parseFloat(t);                                             // 35.5 -> 35.5
  return isFinite(n) && n > 0 ? n : 1;
}

// Monta o bloco de informações da loja a partir das integrações ativas em que
// o dono marcou "a IA consulta estas informações". Nunca inclui chaves/tokens.
// deno-lint-ignore no-explicit-any
function buildStoreInfo(integrations: any[]): string {
  // deno-lint-ignore no-explicit-any
  const get = (kind: string) => integrations.find((i: any) => i.kind === kind && i.enabled && i.config?.ia_consulta !== false);
  const out: string[] = [];

  const vendas = get("vendas");
  if (vendas) {
    const c = vendas.config || {};
    const r: string[] = [];
    if (c.perda_padrao > 0) r.push(`ao calcular a quantidade de materiais (pisos, revestimentos etc.), acrescente ${c.perda_padrao}% de margem de perda e explique isso ao cliente`);
    r.push(c.desconto_max > 0 ? `você pode oferecer no máximo ${c.desconto_max}% de desconto` : "não ofereça descontos");
    if (c.validade_orcamento_dias) r.push(`orçamentos valem ${c.validade_orcamento_dias} dia(s)`);
    if (c.pedido_minimo > 0) r.push(`o pedido mínimo é ${brl(c.pedido_minimo)}`);
    out.push(`Regras de venda: ${r.join("; ")}.`);
  }

  const pag = get("pagamento");
  if (pag) {
    const c = pag.config || {};
    if (pag.provider === "pix_manual") {
      out.push("Pagamento: via Pix. A chave é enviada pela equipe depois que o pedido é conferido.");
    } else {
      const nomes: Record<string, string> = { pix: "Pix", cartao: "cartão de crédito", boleto: "boleto" };
      const metodos = (c.metodos || []).map((m: string) => nomes[m] || m);
      let t = `Pagamento: ${metodos.join(", ") || "consulte a equipe"}`;
      if ((c.metodos || []).includes("cartao") && c.max_parcelas > 1) {
        t += ` (cartão em até ${c.max_parcelas}x${c.parcelas_sem_juros > 1 ? `, sem juros até ${c.parcelas_sem_juros}x` : ""})`;
      }
      out.push(`${t}. O link de pagamento é enviado depois que a equipe confere o pedido.`);
    }
  }

  const frete = get("frete");
  if (frete) {
    const c = frete.config || {};
    const linhas: string[] = [];
    if (frete.provider === "retirada") {
      linhas.push("A loja NÃO faz entregas: somente retirada na loja.");
    } else if (frete.provider === "proprio") {
      // deno-lint-ignore no-explicit-any
      const faixas = (c.faixas || []).map((f: any) => {
        const onde = f.regiao || (f.cep_inicio ? `CEP ${f.cep_inicio} a ${f.cep_fim || f.cep_inicio}` : "");
        const cep = f.regiao && f.cep_inicio ? ` (CEP ${f.cep_inicio} a ${f.cep_fim || f.cep_inicio})` : "";
        return `- ${onde}${cep}: ${brl(f.valor)}${f.prazo ? `, prazo ${f.prazo}` : ""}`;
      });
      linhas.push(`Entrega própria. Tabela de frete (use SOMENTE estes valores):
${faixas.join("\n") || "(tabela vazia)"}`);
      linhas.push(c.fora_da_tabela === "recusar"
        ? "Endereço fora da tabela: informe com educação que a loja não entrega nessa região."
        : "Endereço fora da tabela: diga que vai verificar com a equipe (não invente valor).");
      linhas.push("Para saber o frete, pergunte o bairro ou o CEP do cliente.");
    } else if (frete.provider === "melhorenvio") {
      linhas.push("Entregas por transportadora: o valor do frete é calculado pela equipe com base no CEP (peça o CEP ao cliente).");
    }
    if (c.frete_gratis_acima > 0 && frete.provider !== "retirada") linhas.push(`Frete grátis para compras acima de ${brl(c.frete_gratis_acima)}.`);
    if (frete.provider === "retirada" || c.permite_retirada) linhas.push(`Retirada na loja${c.endereco_retirada ? `: ${c.endereco_retirada}` : " disponível"}.`);
    out.push(`Frete e entrega:
${linhas.join("\n")}`);
  }

  const estoque = get("estoque");
  if (estoque && estoque.config?.bloquear_sem_estoque) {
    out.push("Estoque: só ofereça o que está no catálogo abaixo. Se o cliente pedir algo que não está listado, diga que vai confirmar a disponibilidade com a equipe.");
  }

  const nf = get("nota_fiscal");
  if (nf && nf.provider && nf.provider !== "nenhum") {
    out.push("Nota fiscal: a loja emite NF-e para as compras. Se o cliente quiser nota no CNPJ, peça o CNPJ e a razão social.");
  }

  return out.length ? `\n\nInformações da loja (use para responder o cliente):\n${out.join("\n\n")}` : "";
}

// Se o modelo não conseguiu receber a imagem, avisa pra ele não inventar uma descrição
const NO_IMAGE_NOTICE = `

ATENÇÃO: a imagem enviada pelo cliente NÃO pôde ser carregada nesta resposta. Não descreva a imagem e não inclua a
marcação [IMAGEM: ...]. Peça gentilmente para o cliente contar o que mostra a foto.`;

async function callAiProvider(
  provider: { vendor: string; api_key: string; model: string } | null,
  systemPrompt: string,
  userContent: string,
  temperature: number,
  maxTokens: number,
  imageUrl?: string | null,
  geminiThinking = true,
): Promise<string> {
  const vendor = provider?.vendor || "openrouter";
  const apiKey = provider?.api_key || FALLBACK_OPENROUTER_KEY;
  const model = provider?.model || "meta-llama/llama-3.1-8b-instruct:free";

  if (vendor === "gemini") {
    const parts: Record<string, unknown>[] = [{ text: userContent }];
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
        parts.push({ inlineData: { mimeType: "image/jpeg", data: bytesToBase64(imgBytes) } });
      } catch (err) {
        console.error("Erro ao baixar imagem pro Gemini:", err);
      }
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature,
            // Os modelos Gemini 3 "pensam" antes de responder e isso consome o limite de saída
            maxOutputTokens: Math.max(maxTokens, 2048),
            ...(geminiThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
          },
        }),
      }
    );
    const data = await res.json();
    // Modelo que não aceita thinkingConfig: tenta de novo sem
    if (!res.ok && geminiThinking && res.status === 400 && /thinking/i.test(JSON.stringify(data))) {
      return callAiProvider(provider, systemPrompt, userContent, temperature, maxTokens, imageUrl, false);
    }
    if (!res.ok && imageUrl) {
      console.error("Erro na chamada Gemini com imagem, tentando de novo só com texto:", res.status, JSON.stringify(data));
      return callAiProvider(provider, systemPrompt + NO_IMAGE_NOTICE, userContent, temperature, maxTokens, null);
    }
    if (!res.ok) console.error("Erro na chamada Gemini:", res.status, JSON.stringify(data));
    // Junta as partes de texto (ignorando partes de "pensamento", se vierem)
    const out = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
      .map((p: { text: string }) => p.text).join("").trim();
    if (!out) console.error("Gemini respondeu vazio. Payload completo:", JSON.stringify(data));
    return out;
  }

  const endpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
  };

  const reasoningExtras = geminiThinking && vendor === "groq" && /gpt-oss/i.test(model);

  const userMessageContent = imageUrl
    ? [
        { type: "text", text: userContent },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : userContent;

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
      // Modelos de raciocínio (ex.: gpt-oss no Groq) gastam tokens pensando: dá folga e pede raciocínio curto
      max_tokens: Math.max(maxTokens, 2048),
      ...(reasoningExtras ? { reasoning_effort: "low", include_reasoning: false } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent },
      ],
    }),
  });

  const data = await res.json();

  // Provedor não aceitou os parâmetros de raciocínio: tenta de novo sem eles
  if (!res.ok && reasoningExtras && res.status === 400) {
    console.error(`${vendor} recusou parâmetros de raciocínio, tentando sem:`, JSON.stringify(data));
    return callAiProvider(provider, systemPrompt, userContent, temperature, maxTokens, imageUrl, false);
  }

  // Se mandamos imagem e o modelo não aceitou (não tem visão), tenta de novo só com texto
  if (!res.ok && imageUrl) {
    console.error(`Erro na chamada ${vendor} com imagem (modelo provavelmente sem visão), tentando de novo só com texto:`, res.status, JSON.stringify(data));
    return callAiProvider(provider, systemPrompt + NO_IMAGE_NOTICE, userContent, temperature, maxTokens, null);
  }

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

// Vários agentes podem usar o mesmo número (ex.: simulador x agente real): vale o que estiver ativo
// deno-lint-ignore no-explicit-any
function pickAgent(agents: any[] | null, businessNumber: string) {
  const matches = (agents || []).filter((a) => onlyDigits(a.phone_number) === businessNumber);
  return matches.find((a) => a.enabled !== false) || matches[0] || null;
}

// ---------- Integrações simuladas (agente simulador) ----------
const SIM_DEFAULTS: Record<string, { kind: string; provider: string | null; enabled: boolean; config: Record<string, unknown> }> = {
  vendas: { kind: "vendas", provider: null, enabled: true, config: {
    ia_consulta: true, aprovacao_humana: true, perda_padrao: 10, desconto_max: 5, validade_orcamento_dias: 3, pedido_minimo: 0,
    mensagem_pos_pagamento: "Obrigado pela preferência! 💛 Qualquer dúvida sobre o pedido ou a instalação, é só chamar aqui. Boa obra!",
  } },
  pagamento: { kind: "pagamento", provider: "simulado", enabled: true, config: {
    ia_consulta: true, metodos: ["pix", "cartao", "boleto"], max_parcelas: 10, parcelas_sem_juros: 3, validade_link_horas: 24,
  } },
  frete: { kind: "frete", provider: "proprio", enabled: true, config: {
    ia_consulta: true, permite_retirada: true, endereco_retirada: "Av. das Indústrias, 1500 — loja de demonstração",
    frete_gratis_acima: 3000, fora_da_tabela: "humano",
    faixas: [
      { regiao: "Centro", valor: 25, prazo: "1 dia útil" },
      { regiao: "Demais bairros da cidade", valor: 45, prazo: "2 dias úteis" },
      { regiao: "Cidades vizinhas (até 30 km)", valor: 90, prazo: "3 dias úteis" },
    ],
  } },
  estoque: { kind: "estoque", provider: "manual", enabled: true, config: { ia_consulta: true, bloquear_sem_estoque: true } },
  nota_fiscal: { kind: "nota_fiscal", provider: "simulado", enabled: true, config: { ia_consulta: true, emitir_quando: "apos_pagamento" } },
};

// No simulador tudo está "integrado": usa as regras de venda/frete do dono se estiverem ativas,
// e pagamento + nota fiscal sempre simulados.
// deno-lint-ignore no-explicit-any
function effectiveIntegrations(agent: any, integrations: any[]): any[] {
  if (!agent?.is_simulator) return integrations;
  // deno-lint-ignore no-explicit-any
  const own = (kind: string) => integrations.find((i: any) => i.kind === kind && i.enabled);
  const vendas = own("vendas") ? { ...own("vendas"), config: { ...own("vendas").config } } : structuredClone(SIM_DEFAULTS.vendas);
  if (agent.sim_auto_approve) vendas.config.aprovacao_humana = false;
  return [
    vendas,
    SIM_DEFAULTS.pagamento,
    own("frete") || SIM_DEFAULTS.frete,
    SIM_DEFAULTS.estoque,
    SIM_DEFAULTS.nota_fiscal,
  ];
}

function norm(s: string) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Frete calculado pelo código a partir da tabela (nunca pela IA)
type Place = { cep?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null };
// deno-lint-ignore no-explicit-any
function computeFreight(entrega: string | null, frete: any, subtotal: number, place: Place = {}) {
  if (!entrega && !place.cep && !place.bairro) return { tipo: null, valor: null, prazo: null, local: null };
  const txt = norm(entrega || "");
  if (/\bretir|\bbusco\b|buscar na loja|pego na loja|pegar na loja/.test(txt)) {
    return { tipo: "retirada", valor: 0, prazo: null, local: frete?.config?.endereco_retirada || null };
  }
  const cepDigits = place.cep || (entrega?.match(/\d{5}-?\d{3}/)?.[0] || "").replace(/\D/g, "") || null;
  const local = [place.bairro, place.cidade && `${place.cidade}${place.uf ? "/" + place.uf : ""}`].filter(Boolean).join(", ")
    || entrega || (cepDigits ? `CEP ${cepDigits}` : null);
  if (!frete || frete.provider !== "proprio") return { tipo: "entrega", valor: null, prazo: null, local, cep: cepDigits };

  const faixas = frete.config?.faixas || [];
  // deno-lint-ignore no-explicit-any
  const named = faixas.filter((f: any) => f.regiao && !/^demais|vizinh|outras cidades/i.test(f.regiao));
  const lojaCidade = norm(frete.config?.cidade || "");
  const outraCidade = !!(lojaCidade && place.cidade && norm(place.cidade) !== lojaCidade);

  // deno-lint-ignore no-explicit-any
  let hit: any = null;
  if (!outraCidade) {
    const candidates = [norm(place.bairro || ""), txt].filter(Boolean);
    // deno-lint-ignore no-explicit-any
    hit = named.find((f: any) => candidates.some((c) => c === norm(f.regiao) || c.includes(norm(f.regiao))));
    const cep = Number(cepDigits || 0);
    // deno-lint-ignore no-explicit-any
    if (!hit && cep) hit = faixas.find((f: any) => {
      const a = Number(String(f.cep_inicio || "").replace(/\D/g, "")), b = Number(String(f.cep_fim || f.cep_inicio || "").replace(/\D/g, ""));
      return a && b && cep >= a && cep <= b;
    });
    // deno-lint-ignore no-explicit-any
    if (!hit) hit = faixas.find((f: any) => /^demais/i.test(f.regiao || ""));
  } else {
    // deno-lint-ignore no-explicit-any
    hit = faixas.find((f: any) => /vizinh|outras cidades/i.test(f.regiao || ""));
  }
  if (!hit) return { tipo: "entrega", valor: null, prazo: null, local, cep: cepDigits };

  const gratis = frete.config?.frete_gratis_acima > 0 && subtotal >= frete.config.frete_gratis_acima;
  return { tipo: "entrega", valor: gratis ? 0 : Number(hit.valor || 0), prazo: hit.prazo || null, local, cep: cepDigits, faixa: hit.regiao || null, gratis };
}

async function lookupCep(cep: string): Promise<Place | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(3500) });
    const d = await res.json();
    if (!res.ok || d.erro) return null;
    return { cep, bairro: d.bairro || null, cidade: d.localidade || null, uf: d.uf || null };
  } catch (_) {
    return null;
  }
}

// Procura, nas mensagens do cliente (mais recente primeiro), onde ele quer receber ou se vai retirar
// deno-lint-ignore no-explicit-any
async function resolveDelivery(customerTexts: string[], frete: any, subtotal = 0) {
  if (!frete) return null;
  for (const raw of customerTexts) {
    const t = String(raw || "");
    const n = norm(t);
    if (!n) continue;
    if (/\bretir|\bbusco\b|buscar na loja|pego na loja|pegar na loja/.test(n)) return computeFreight("retirada", frete, subtotal);
    const cepMatch = t.match(/\b\d{5}-?\d{3}\b/);
    if (cepMatch) {
      const cep = cepMatch[0].replace(/\D/g, "");
      const place = (await lookupCep(cep)) || { cep };
      return computeFreight(t, frete, subtotal, place);
    }
    // deno-lint-ignore no-explicit-any
    const faixa = (frete.config?.faixas || []).find((f: any) => f.regiao && !/^demais|vizinh|outras cidades/i.test(f.regiao) && new RegExp(`\\b${norm(f.regiao)}\\b`).test(n));
    if (faixa) return computeFreight(t, frete, subtotal, { bairro: faixa.regiao });
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function describeDelivery(d: any, frete: any): string {
  if (!d) return "";
  const gratisTxt = frete?.config?.frete_gratis_acima > 0 ? ` (frete grátis se a compra passar de ${brl(frete.config.frete_gratis_acima)})` : "";
  if (d.tipo === "retirada") return `\n\nEntrega já definida nesta conversa: o cliente vai RETIRAR na loja${d.local ? ` (${d.local})` : ""}. Sem frete.`;
  if (d.valor != null) {
    return `\n\nEntrega já identificada nesta conversa (calculada pelo sistema — use exatamente estes dados, não recalcule):
${d.local ? `Endereço: ${d.local}${d.cep ? ` (CEP ${d.cep})` : ""}` : ""}
Frete: ${brl(d.valor)}${d.prazo ? ` — prazo ${d.prazo}` : ""}${gratisTxt}.`;
  }
  return `\n\nEntrega: o cliente informou ${d.local || "um endereço"}${d.cep ? ` (CEP ${d.cep})` : ""}, que está FORA da tabela de frete.
Isso é uma pendência da equipe e NÃO trava a venda: diga com naturalidade que o valor do frete para esse endereço vem junto no resumo do pedido, e siga coletando o que falta.`;
}

// Itens do orçamento: preço do catálogo, pisos arredondados para caixas fechadas, aviso de estoque
// deno-lint-ignore no-explicit-any
function buildOrderItems(matches: RegExpMatchArray[], products: any[]) {
  return matches.map((m) => {
    const itemName = m[1].trim();
    let quantidade = parseQty(m[2]);
    const product = products.find((p) => normalizeForMatch(p.name) === normalizeForMatch(itemName))
      || products.find((p) =>
        normalizeForMatch(p.name).includes(normalizeForMatch(itemName)) ||
        normalizeForMatch(itemName).includes(normalizeForMatch(p.name)));
    let caixas: number | null = null;
    if (product?.unit === "m2" && product.m2_por_caixa > 0) {
      caixas = Math.ceil(quantidade / Number(product.m2_por_caixa) - 1e-9);
      quantidade = Math.round(caixas * Number(product.m2_por_caixa) * 1000) / 1000;
    } else if (product && product.unit !== "m2") {
      quantidade = Math.ceil(quantidade);
    }
    const preco = product?.price != null ? Number(product.price) : null;
    return {
      product_id: product?.id || null,
      nome: product?.name || itemName,
      quantidade,
      caixas,
      unidade: product?.unit || "",
      preco_unitario: preco,
      subtotal: preco != null ? Math.round(preco * quantidade * 100) / 100 : 0,
      sem_estoque: product?.estoque != null && quantidade > Number(product.estoque),
    };
  });
}

// ---------- Mensagens que o vendedor manda pelo celular ----------
// fromMe + wasSentByApi = eco de algo que a IA ou o próprio Lumos enviou (já está salvo).
// fromMe SEM wasSentByApi = alguém digitou direto no WhatsApp da loja: registramos
// como mensagem do vendedor e, se o agente estiver configurado assim, pausamos a IA.
// deno-lint-ignore no-explicit-any
function extractChatNumber(payload: any, msg: any): string {
  const candidates = [msg?.chatid, payload?.chat?.wa_chatid, payload?.chat?.id, msg?.recipient];
  for (const c of candidates) {
    if (typeof c === "string" && c.endsWith("@s.whatsapp.net")) return onlyDigits(c.split("@")[0]);
  }
  const phone = onlyDigits(payload?.chat?.phone);
  return phone || "";
}

// deno-lint-ignore no-explicit-any
function describeOwnerMedia(msg: any): string {
  const caption = msg?.text ? ` ${msg.text}` : "";
  switch (msg?.messageType) {
    case "ImageMessage": return `[Vendedor enviou uma imagem]${caption}`;
    case "AudioMessage": return "[Vendedor enviou um áudio]";
    case "VideoMessage": return `[Vendedor enviou um vídeo]${caption}`;
    case "DocumentMessage": return `[Vendedor enviou um documento]${caption}`;
    case "StickerMessage": return "[Vendedor enviou uma figurinha]";
    default: return msg?.text || "";
  }
}

// deno-lint-ignore no-explicit-any
async function handleOwnerMessage(payload: any, msg: any): Promise<Response> {
  if (msg.wasSentByApi) return new Response("echo from api", { status: 200 });
  if (msg.isGroup || payload.chat?.wa_isGroup) return new Response("ignored group", { status: 200 });

  const businessNumber = onlyDigits(payload.owner);
  const customerNumber = extractChatNumber(payload, msg);
  const text = describeOwnerMedia(msg).trim();

  if (!customerNumber || !text) {
    console.log("Mensagem do vendedor sem número/texto reconhecível. Payload:", JSON.stringify(payload));
    return new Response("ignored", { status: 200 });
  }
  if (customerNumber === businessNumber) return new Response("self", { status: 200 });

  const { data: agents } = await supabase.from("agents").select("*").not("phone_number", "is", null);
  const agent = pickAgent(agents, businessNumber);
  if (!agent) return new Response("no agent", { status: 200 });

  // Não registra os avisos de "pedido aguardando aprovação" que o sistema manda pro vendedor
  const { data: vendas } = await supabase
    .from("integrations").select("config").eq("owner_id", agent.owner_id).eq("kind", "vendas").maybeSingle();
  if (onlyDigits(vendas?.config?.telefone_aprovacao) === customerNumber) return new Response("seller notice", { status: 200 });

  let { data: lead } = await supabase
    .from("leads").select("*").eq("agent_id", agent.id).eq("phone", customerNumber).maybeSingle();

  if (!lead) {
    const { data: newLead } = await supabase
      .from("leads")
      .insert({ owner_id: agent.owner_id, agent_id: agent.id, phone: customerNumber, name: payload.chat?.wa_name || payload.chat?.name || "", stage: "novo_contato" })
      .select().single();
    lead = newLead;
  }
  if (!lead) return new Response("no lead", { status: 200 });

  // Anti-duplicata: mesma mensagem de saída nos últimos 2 minutos = eco do que já salvamos
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("messages").select("id").eq("lead_id", lead.id).eq("direction", "out").eq("text", text).gte("created_at", since).limit(1);
  if (recent?.length) return new Response("duplicate", { status: 200 });

  await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", sender: "vendedor", text });

  const leadUpdate: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  if (agent.pause_on_human !== false && lead.ai_enabled !== false) {
    leadUpdate.ai_enabled = false;
    console.log("Vendedor respondeu pelo celular — IA pausada para o lead:", lead.id);
  }
  await supabase.from("leads").update(leadUpdate).eq("id", lead.id);

  return new Response("owner message saved", { status: 200 });
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    if (payload.EventType !== "messages") {
      return new Response("ignored", { status: 200 });
    }

    const msg = payload.message;

    // Log temporário: mostra o tipo e o payload completo de QUALQUER mensagem,
    // pra descobrirmos o formato real de áudio/imagem antes de programar em cima disso.
    if (msg && !msg.fromMe && msg.type !== "text") {
      console.log("Mensagem não-texto recebida. Tipo:", msg.type, "| messageType:", msg.messageType, "| Payload completo:", JSON.stringify(payload));
    }

    // Mensagem enviada PELO número da loja (vendedor no celular / WhatsApp Web)
    if (msg?.fromMe) {
      return await handleOwnerMessage(payload, msg);
    }

    const isImage = msg?.messageType === "ImageMessage";
    const isAudio = msg?.messageType === "AudioMessage";

    if (!msg || msg.fromMe || (msg.type !== "text" && !isImage && !isAudio)) {
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
    let text = msg.text as string;
    let imageUrlForAi: string | null = null;

    // 1. Descobrir qual agente é dono desse número
    const { data: agents } = await supabase
      .from("agents")
      .select("*")
      .not("phone_number", "is", null);

    console.log("Agentes cadastrados:", JSON.stringify((agents || []).map((a) => ({ id: a.id, phone_number: a.phone_number }))));

    const agent = pickAgent(agents, businessNumber);

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

    // Busca o provedor de IA ativo já aqui, porque precisamos dele pra transcrever áudio
    const { data: aiProviders } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("agent_id", agent_id);

    const activeSlot = agent?.active_ai_slot || "gratis";
    const activeProvider = aiProviders?.find((p) => p.slot === activeSlot) || null;

    // 2.b Processa imagem ou áudio, se for o caso, antes de seguir o fluxo normal de texto
    if (isImage || isAudio) {
      const media = await downloadUazapiMedia(payload.BaseUrl, payload.token, msg.messageid);

      if (!media?.fileURL) {
        text = isImage ? (msg.text || "[cliente enviou uma imagem que não consegui abrir]") : "[cliente enviou um áudio que não consegui abrir]";
      } else if (isImage) {
        imageUrlForAi = media.fileURL;
        text = msg.text ? `[Imagem enviada] ${msg.text}` : "[Cliente enviou uma imagem, sem legenda]";
        console.log("Imagem baixada:", media.fileURL);
      } else if (isAudio) {
        const transcription = await transcribeAudio(media.fileURL, activeProvider, FALLBACK_OPENROUTER_KEY);
        text = transcription || "[cliente enviou um áudio que não consegui transcrever]";
        console.log("Áudio transcrito:", text);
      }
    }

    console.log("Mensagem recebida. De:", customerNumber, "Para (business):", businessNumber, "Texto:", text);

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
    const { data: incomingMsg } = await supabase
      .from("messages")
      .insert({ lead_id: lead.id, direction: "in", sender: "cliente", text })
      .select("id")
      .single();

    // 4.b IA desativada pra esse contato: a mensagem fica salva, mas ninguém responde automaticamente
    if (lead.ai_enabled === false) {
      await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", lead.id);
      console.log("IA desativada para este contato, mensagem só registrada:", lead.id);
      return new Response("ai disabled for lead", { status: 200 });
    }

    // 5. Buscar o catálogo de produtos do dono
    const { data: products } = await supabase
      .from("products")
      .select("id, name, description, price, unit, photo_urls, m2_por_caixa, estoque")
      .eq("owner_id", owner_id)
      .eq("active", true)
      .or(`agent_ids.is.null,agent_ids.eq.{},agent_ids.cs.{${agent_id}}`)
      .limit(120);

    const catalogText = (products || [])
      .map((p) => {
        const extras = [
          p.m2_por_caixa ? `caixa com ${String(p.m2_por_caixa).replace(".", ",")} m²` : "",
          p.estoque != null ? (Number(p.estoque) > 0 ? `estoque: ${String(p.estoque).replace(".", ",")} ${p.unit === "m2" ? "m²" : p.unit}` : "SEM ESTOQUE") : "",
        ].filter(Boolean).join("; ");
        return `- ${p.name}: R$ ${p.price} / ${p.unit}${extras ? ` (${extras})` : ""}${p.description ? " — " + p.description : ""}`;
      })
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
      .select("business_type, disabled_stages")
      .eq("owner_id", owner_id)
      .maybeSingle();

    const { data: integrations } = await supabase
      .from("integrations")
      .select("kind, provider, enabled, config")
      .eq("owner_id", owner_id);

    const effIntegrations = effectiveIntegrations(agent, integrations || []);
    const storeInfo = buildStoreInfo(effIntegrations);
    const disabledStages: string[] = bizConfig?.disabled_stages || [];
    const businessType = agent.is_simulator ? (agent.sim_business_type || "materiais_construcao") : bizConfig?.business_type;
    const isRestaurant = businessType === "restaurante";
    // deno-lint-ignore no-explicit-any
    const vendasCfg = effIntegrations.find((i: any) => i.kind === "vendas" && i.enabled)?.config || {};
    // deno-lint-ignore no-explicit-any
    const freteInt = effIntegrations.find((i: any) => i.kind === "frete" && i.enabled && i.config?.ia_consulta !== false);
    const autoApprove = vendasCfg.aprovacao_humana === false;

    // Entrega/frete: o código descobre na conversa (CEP -> bairro pelo ViaCEP) e passa pronto pra IA
    // (o histórico já foi invertido pra ordem cronológica; aqui queremos o mais recente primeiro)
    const customerTexts = [...(history || [])].reverse().filter((m) => m.direction === "in").map((m) => m.text);
    const knownDelivery = !isRestaurant && freteInt ? await resolveDelivery(customerTexts, freteInt) : null;
    const deliveryInfo = describeDelivery(knownDelivery, freteInt);
    const isFirstReply = !(history || []).some((m) => m.direction === "out");
    const canStage = (st: string) => !disabledStages.includes(st);

    const stageInstructions = isRestaurant ? "" : `

Condução da venda:
- Colete tudo o que VOCÊ consegue resolver: produtos, quantidades${freteInt ? ", entrega ou retirada (e o bairro ou CEP)" : ""} e a confirmação do cliente.
- Pendências que só a equipe resolve (frete fora da tabela, produto sem cadastro, desconto acima do permitido) NÃO travam a venda:
  avise com naturalidade que isso vem confirmado no resumo do pedido e continue coletando o resto.
- Você não consegue consultar ninguém nem "voltar depois". Nunca diga "vou verificar com a equipe", "já te respondo",
  "só um instante", e nunca diga que recebeu confirmação da equipe. Resolva sempre na própria mensagem.
- Nunca invente preço, frete, prazo ou estoque. Use só o catálogo e as informações da loja.
- Pisos são vendidos em caixas fechadas: fale da metragem em m², mas NÃO informe número de caixas nem valores totais —
  o resumo oficial, com caixas, valores e frete calculados pelo sistema, chega logo depois do fechamento.

Etapas do atendimento (marcações internas, removidas antes de chegar ao cliente, uma por linha no FINAL):
${canStage("conversando") ? "- Quando o cliente começar a falar do que precisa (além de um simples oi), inclua: [ETAPA: conversando]\n" : ""}${canStage("consulta_agendada") ? "- Quando uma visita, consulta ou horário for CONFIRMADO pelo cliente, inclua: [ETAPA: consulta_agendada]\n" : ""}- FECHAMENTO: assim que o cliente confirmar a compra ("pode fechar", "sim", "ok", "fechado", "pode mandar"), feche NESSA MESMA
  resposta. Inclua uma linha por item: [ORCAMENTO: Nome Exato do Produto do catálogo | quantidade]
${freteInt ? "  e a entrega: [ENTREGA: retirada] ou [ENTREGA: bairro e/ou CEP que o cliente informou]\n" : ""}  e também: [ETAPA: aguardando_link]
  ${autoApprove ? "Diga que o pedido foi registrado e que o resumo com o link de pagamento chega em instantes." : "Diga que vai passar o pedido para a equipe conferir e que o resumo com o link de pagamento chega em seguida."}
  Exemplo de fechamento:
  Perfeito, pedido fechado! ${autoApprove ? "Já te mando o resumo com o link de pagamento." : "Vou passar para a equipe conferir e já te envio o resumo com o link de pagamento."}
  [ORCAMENTO: Porcelanato X | 7,7]
  [ORCAMENTO: Argamassa Y | 2]
${freteInt ? "  [ENTREGA: Centro]\n" : ""}  [ETAPA: aguardando_link]
- Se o cliente ainda não confirmou, recapitule o pedido em poucas linhas e pergunte se pode fechar.
- Depois que o pedido foi pago, agradeça e ajude no que precisar (instalação, prazo, dúvidas).${deliveryInfo}`;

    const restaurantInstructions = isRestaurant ? `

Você atende um restaurante. Siga estas regras à risca:
1. Se ainda não sabe em qual mesa o cliente está NESTA conversa, sua PRIMEIRA pergunta deve ser "Qual é o número da sua mesa?" — não fale de cardápio antes disso.
2. Assim que o cliente informar o número da mesa, confirme normalmente e adicione no final da mensagem, em uma linha própria: [MESA: número]
3. Quando o cliente confirmar um pedido de itens do catálogo, adicione no final da mensagem, um item por linha: [PEDIDO: Nome Exato do Item | quantidade]
4. Quando o cliente pedir a conta / fechar a mesa, adicione no final: [CONTA]
Nunca explique essas marcações pro cliente — elas são removidas automaticamente antes de chegar até ele.` : "";

    const imageInstructions = imageUrlForAi ? `
A mensagem atual do cliente veio com uma IMAGEM anexada, que você consegue ver. Responda com base no que aparece nela
(ex.: identificar o produto, o ambiente, o problema mostrado). Se a imagem não tiver relação com o atendimento,
comente de forma natural e leve, sem supor que foi engano.
Ao final da resposta, em uma linha separada, inclua SEMPRE: [IMAGEM: descrição objetiva do que aparece na imagem, em 1 frase]
Essa marcação é interna, nunca a explique pro cliente — ela é removida automaticamente e serve pra você lembrar da
imagem nas próximas mensagens. No histórico, imagens anteriores aparecem como "[Imagem: descrição]".
` : "";

    const systemPrompt = `${basePrompt}

Use SOMENTE os produtos do catálogo abaixo para falar de preços e disponibilidade — nunca invente produto ou preço.
Se o cliente perguntar algo fora do catálogo ou que exija um humano, diga que vai chamar alguém da equipe.

Se o cliente pedir pra ver uma foto de um produto específico que existe no catálogo abaixo, responda normalmente
e adicione, em uma linha separada no FINAL da mensagem, exatamente: [FOTO: Nome Exato do Produto]
Use o nome EXATO como aparece no catálogo. Só use essa marcação quando o produto existir e tiver o pedido claro de foto.
Nunca explique essa marcação pro cliente, ela é removida automaticamente antes de chegar até ele.
IMPORTANTE: a foto só é enviada de verdade através dessa marcação. Nunca escreva "segue a foto", "aqui está" ou
qualquer frase parecida SEM incluir a marcação [FOTO: ...] correspondente — isso engana o cliente, que não recebe nada.
Se você já enviou a foto de um produto antes NESTA MESMA conversa (veja o histórico) e o cliente não pediu de novo
explicitamente, não repita a marcação — só avise em texto que já mandou antes e pergunte se quer que envie de novo.
Se o cliente pedir de novo (algo como "manda de novo", "não recebi", "envia outra vez"), inclua a marcação normalmente.

Além disso, ao final de TODA resposta (mesmo em conversas curtas), inclua em uma linha separada, sempre:
[CONTEXTO: motivo do contato em 3 a 6 palavras (ex.: "Orçamento piso e parede banheiro") | resumo curto do que já foi conversado até agora, 1-2 frases]
Atualize esse resumo a cada mensagem, refletindo o estado mais recente da conversa. Essa marcação é interna,
nunca a explique pro cliente — ela é removida automaticamente antes de chegar até ele.

Formatação: você está no WhatsApp. Para negrito use UM asterisco de cada lado (*assim*), nunca dois (**assim**).
Não use títulos com #, tabelas nem links no formato [texto](link).

Tom: converse como uma pessoa no WhatsApp — frases curtas, naturais, uma pergunta por vez, sem repetir as mesmas aberturas.
${isFirstReply ? "Esta é a sua PRIMEIRA resposta nesta conversa: cumprimente e se apresente." : "Você JÁ cumprimentou o cliente nesta conversa: NÃO comece com \"Oi\", \"Olá\" nem se apresente de novo. Vá direto ao assunto, com naturalidade."}
Se errar alguma informação, corrija com leveza, sem pedir desculpas em excesso.

Nunca diga espontaneamente que você é um sistema automatizado, um robô ou que "não consegue ver" algo que está no
histórico. Se faltar alguma informação, peça gentilmente para o cliente explicar. Se o cliente perguntar diretamente
se está falando com um robô ou uma IA, não negue.
${imageInstructions}${restaurantInstructions}${stageInstructions}${storeInfo}

Catálogo:
${catalogText || "(nenhum produto cadastrado ainda)"}`;

    const userContent = `Histórico da conversa:\n${conversation}\n\nNova mensagem do cliente: ${text}`;
    const temperature = agent?.temperature ?? 0.7;
    const maxTokens = agent?.max_tokens ?? 1024;
    const otherProvider = aiProviders?.find((p) => p.slot !== activeSlot && p.api_key) || null;

    // Gera a resposta com redes de segurança:
    // vazia/erro -> tenta a outra IA configurada; raciocínio vazado ou "enrolação" -> uma nova tentativa corrigida
    // deno-lint-ignore no-explicit-any
    const generate = async (provider: any, extraNote = "") =>
      sanitizeReply(await callAiProvider(provider, systemPrompt + extraNote, userContent, temperature, maxTokens, imageUrlForAi));

    let reply = await generate(activeProvider);
    if (!reply && otherProvider) {
      console.error("IA ativa não respondeu, tentando a do outro slot:", otherProvider.vendor);
      reply = await generate(otherProvider);
    }
    if (reply && looksLikeLeakedReasoning(reply)) {
      console.error("Resposta parecia raciocínio interno, gerando de novo:", reply.slice(0, 300));
      reply = await generate(activeProvider, "\n\nIMPORTANTE: escreva SOMENTE a mensagem final para o cliente, sem explicar seu raciocínio.");
      if (looksLikeLeakedReasoning(reply) && otherProvider) reply = await generate(otherProvider);
    }
    if (reply && looksLikeStall(reply)) {
      console.log("Resposta prometia retorno em vez de resolver, gerando de novo:", reply.slice(0, 200));
      const retry = await generate(activeProvider, `\n\nCORREÇÃO: sua resposta anterior prometia verificar algo e voltar depois ("${reply.replace(/\[[^\]]*\]?/g, "").slice(0, 160)}").
Você não tem como fazer isso. Resolva nesta mensagem com as informações disponíveis. Se algo depende da equipe, trate como pendência que vem no resumo do pedido e siga coletando o que falta. Se o cliente já confirmou a compra, feche agora com as marcações.`);
      if (retry && !looksLikeLeakedReasoning(retry)) reply = retry;
    }
    if (!reply || looksLikeLeakedReasoning(reply)) {
      reply = "Só um segundinho que minha conexão falhou aqui — pode repetir sua última mensagem, por favor?";
    }

    // Extrai TODAS as marcações [FOTO: nome do produto] — o cliente pode pedir mais de uma foto de uma vez
    const photoMatches = [...reply.matchAll(/\[FOTO:\s*(.+?)\]/gi)];
    const photoProductNames = photoMatches.map((m) => m[1].trim());

    // Etapa do funil e itens do orçamento
    const etapaMatch = reply.match(/\[ETAPA:\s*([a-z_]+)\s*\]/i);
    const entregaMatch = reply.match(/\[ENTREGA:\s*([^\]]+?)\s*\]/i);
    const orcamentoMatches = [...reply.matchAll(/\[ORCAMENTO:\s*(.+?)\s*\|\s*([\d.,]+)[^\]]*\]/gi)];

    // Descrição da imagem recebida (salva no histórico no lugar do texto genérico)
    const imagemMatch = reply.match(/\[IMAGEM:\s*([^\]]+?)\s*\]/i);

    // Marcações do fluxo de restaurante
    const mesaMatch = reply.match(/\[MESA:\s*(.+?)\]/i);
    const pedidoMatches = [...reply.matchAll(/\[PEDIDO:\s*(.+?)\s*\|\s*(\d+)\s*\]/gi)];
    const contaMatch = /\[CONTA\]/i.test(reply);

    // Motivo do contato + resumo da conversa (usado em qualquer tipo de negócio)
    const contextoMatch = reply.match(/\[CONTEXTO:\s*(.+?)\s*\|\s*(.+?)\]/i);
    // Fallback: às vezes a IA esquece o "|" e escreve só uma frase — ainda aproveitamos como motivo
    const contextoSimpleMatch = !contextoMatch ? (reply.match(/\[CONTEXTO:\s*(.+?)\]/i) || reply.match(/\[CONTEXTO:\s*([^\]\n]+)$/im)) : null;

    reply = reply
      .replace(/\[FOTO:\s*(.+?)\]/gi, "")
      .replace(/\[MESA:\s*(.+?)\]/gi, "")
      .replace(/\[PEDIDO:\s*(.+?)\s*\|\s*(\d+)\s*\]/gi, "")
      .replace(/\[CONTA\]/gi, "")
      // Remoção tolerante: apaga QUALQUER [CONTEXTO: ...], com ou sem "|", formatado certo ou não
      .replace(/\[CONTEXTO:[^\]]*\]/gi, "")
      .replace(/\[IMAGEM:[^\]]*\]/gi, "")
      .replace(/\[ETAPA:[^\]]*\]/gi, "")
      .replace(/\[ORCAMENTO:[^\]]*\]/gi, "")
      .replace(/\[ENTREGA:[^\]]*\]/gi, "")
      // Rede de segurança final: qualquer marcação nossa que sobrou por algum motivo
      .replace(/\[(FOTO|MESA|PEDIDO|CONTA|CONTEXTO|IMAGEM|ETAPA|ORCAMENTO|ENTREGA)[^\]]*\]/gi, "")
      // Marcação cortada (a resposta terminou antes do "]"): remove até o fim da linha
      .replace(/\[(FOTO|MESA|PEDIDO|CONTA|CONTEXTO|IMAGEM|ETAPA|ORCAMENTO|ENTREGA)\b[^\]\n]*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    console.log("Resposta da IA:", reply, "| Fotos pedidas:", JSON.stringify(photoProductNames), "| Mesa:", mesaMatch?.[1], "| Pedido:", pedidoMatches.length, "| Conta:", contaMatch, "| Contexto:", contextoMatch ? `${contextoMatch[1]} / ${contextoMatch[2]}` : contextoSimpleMatch ? `(sem separador) ${contextoSimpleMatch[1]}` : null);

    // Alerta: a IA prometeu foto em texto mas esqueceu a marcação [FOTO: ...]
    if (!photoProductNames.length && /segue\s+a[s]?\s+foto|aqui\s+est[áa]\s+a\s+foto|envio\s+a\s+foto/i.test(reply)) {
      console.error("ALERTA: resposta parece prometer foto mas não incluiu a marcação [FOTO: ...]. Resposta:", reply);
    }

    if (imageUrlForAi && incomingMsg?.id) {
      const caption = msg.text ? ` Legenda do cliente: ${msg.text}` : "";
      const description = imagemMatch?.[1]?.trim();
      const newText = description
        ? `[Imagem: ${description}]${caption}`
        : `[Imagem enviada pelo cliente, sem descrição disponível]${caption}`;
      await supabase.from("messages").update({ text: newText }).eq("id", incomingMsg.id);
      console.log("Descrição da imagem salva no histórico:", newText);
    }

    // 8. Salvar a resposta e atualizar o lead
    await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", sender: "ia", text: reply });

    const leadUpdate: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    // O motivo do contato é definido uma vez (o primeiro); o resumo acompanha a conversa
    const motivoAtual = String(lead.motivo_contato || "").trim();
    if (contextoMatch) {
      if (!motivoAtual) leadUpdate.motivo_contato = contextoMatch[1].trim().slice(0, 80);
      leadUpdate.resumo_conversa = contextoMatch[2].trim();
    } else if (contextoSimpleMatch && !motivoAtual) {
      leadUpdate.motivo_contato = contextoSimpleMatch[1].trim().slice(0, 80);
    }
    // Pedido: a IA só diz itens, quantidades e entrega — preço, caixas e frete são calculados pelo código
    let enteredAwaiting = false;
    // deno-lint-ignore no-explicit-any
    let newOrder: any = null;
    const closing = !isRestaurant && orcamentoMatches.length > 0 && etapaMatch?.[1]?.toLowerCase() === "aguardando_link";
    if (!isRestaurant && orcamentoMatches.length) {
      const itens = buildOrderItems(orcamentoMatches, products || []);
      const subtotal = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
      const fromMarker = entregaMatch?.[1] ? await resolveDelivery([entregaMatch[1]], freteInt, subtotal) : null;
      const entrega = fromMarker || (knownDelivery
        ? (knownDelivery.tipo === "retirada" ? knownDelivery : computeFreight(knownDelivery.local, freteInt, subtotal, { cep: knownDelivery.cep, bairro: knownDelivery.faixa || null }))
        : computeFreight(entregaMatch?.[1] || null, freteInt, subtotal));
      leadUpdate.orcamento = { itens, total: subtotal, frete: entrega.valor, entrega, criado_em: new Date().toISOString() };

      if (closing) {
        const orderRow = {
          owner_id, agent_id, lead_id: lead.id, itens, subtotal,
          frete: entrega.valor,
          total: Math.round((subtotal + (entrega.valor || 0)) * 100) / 100,
          entrega, simulado: !!agent.is_simulator, status: "aguardando_aprovacao",
        };
        // Se o cliente mudou o pedido antes da aprovação, atualiza o mesmo pedido em vez de criar outro
        const { data: open } = await supabase
          .from("sales_orders").select("id").eq("lead_id", lead.id).eq("status", "aguardando_aprovacao")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const { data: saved, error: orderErr } = open
          ? await supabase.from("sales_orders").update(orderRow).eq("id", open.id).select().single()
          : await supabase.from("sales_orders").insert(orderRow).select().single();
        if (orderErr) console.error("Erro ao salvar pedido:", orderErr.message);
        newOrder = saved;
        if (newOrder) {
          leadUpdate.orcamento = { ...(leadUpdate.orcamento as object), order_id: newOrder.id, numero: newOrder.numero };
          if (canStage("aguardando_link")) leadUpdate.stage = "aguardando_link";
          enteredAwaiting = true;
          console.log("Pedido registrado:", newOrder.numero, "total", newOrder.total);
        }
      }
    }

    // Etapa: só avança (nunca volta) e só entre as etapas automáticas e ativas
    if (!isRestaurant && etapaMatch && !leadUpdate.stage) {
      const target = etapaMatch[1].toLowerCase();
      const currentRank = AUTO_STAGE_RANK[lead.stage];
      const targetRank = AUTO_STAGE_RANK[target];
      if (currentRank !== undefined && targetRank !== undefined && targetRank > currentRank && canStage(target)) {
        leadUpdate.stage = target;
        console.log("Lead avançou de etapa:", lead.stage, "->", target);
      }
    }

    await supabase.from("leads").update(leadUpdate).eq("id", lead.id);

    // 9. Enviar a resposta pelo provedor de WhatsApp configurado (ou fallback do payload)
    const { data: waConfig } = await supabase
      .from("whatsapp_provider_config")
      .select("*")
      .eq("agent_id", agent_id)
      .maybeSingle();

    console.log("Config de WhatsApp usada:", JSON.stringify({ ...waConfig, api_key: waConfig?.api_key ? "(definida)" : null }));

    await sendWhatsAppReply(waConfig, payload.BaseUrl, payload.token, customerNumber, reply);

    if (enteredAwaiting && newOrder) {
      const freteDefinido = newOrder.frete != null || newOrder.entrega?.tipo === "retirada";
      if (autoApprove && !freteDefinido) {
        await sendWhatsAppReply(waConfig, payload.BaseUrl, payload.token, customerNumber,
          `Seu pedido *#${newOrder.numero}* está registrado! ✅ Só falta a equipe confirmar o frete para ${newOrder.entrega?.local || "o seu endereço"} — assim que confirmar, te mando o resumo com o link de pagamento.`);
      }
      if (autoApprove && freteDefinido) {
        // Aprovação automática: a função de pedidos envia o resumo e o link de pagamento
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ action: "approve", order_id: newOrder.id }),
        });
        if (!res.ok) console.error("Falha na aprovação automática:", res.status, await res.text());
      } else {
        // Vai pro vendedor (aprovação manual, ou frete que só ele define)
        // Avisa o vendedor que tem pedido esperando aprovação
        const sellerPhone = onlyDigits(vendasCfg.telefone_aprovacao);
        if (sellerPhone) {
          const itensTxt = (newOrder.itens || [])
            .map((i: { nome: string; quantidade: number; unidade: string }) => `• ${i.nome} — ${String(i.quantidade).replace(".", ",")} ${i.unidade}`).join("\n");
          const aviso = `🟡 *Pedido #${newOrder.numero} aguardando aprovação*\nCliente: ${lead.name || customerNumber} (${customerNumber})\n${itensTxt}\nTotal: ${brl(newOrder.total)}${newOrder.frete == null ? " + frete a calcular" : ""}\n\nAbra o Kanban do Lumos para conferir e aprovar.`;
          await sendWhatsAppReply(waConfig, payload.BaseUrl, payload.token, sellerPhone, aviso);
        }
      }
    }

    // 10.b Fluxo de restaurante: vincular à mesa, criar pedido, ou marcar aguardando pagamento
    if (isRestaurant) {
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
            (p) => normalizeForMatch(p.name) === normalizeForMatch(itemName)
          ) || (products || []).find((p) =>
            normalizeForMatch(p.name).includes(normalizeForMatch(itemName)) ||
            normalizeForMatch(itemName).includes(normalizeForMatch(p.name))
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
        (p) => normalizeForMatch(p.name) === normalizeForMatch(photoProductName)
      ) || (products || []).find((p) =>
        normalizeForMatch(p.name).includes(normalizeForMatch(photoProductName)) ||
        normalizeForMatch(photoProductName).includes(normalizeForMatch(p.name))
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
