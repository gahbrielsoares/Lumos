// Edge Function: orders
// Ciclo do pedido de venda depois que a IA fecha com o cliente:
//   approve      -> vendedor (ou aprovação automática) confere; cliente recebe resumo + link de pagamento
//   mark_paid    -> vendedor confirma que recebeu (Pix manual, maquininha...)
//   cancel       -> encerra o pedido
//   get_public   -> página de pagamento (simulado) lê o resumo do pedido pelo token do link
//   pay_simulated-> página de pagamento simulado "paga" o pedido
// Ao ser pago: pedido vira "pago", lead vai pra "Fechado"/cliente e o cliente recebe
// confirmação, número do pedido, nota fiscal, entrega/retirada e o agradecimento.
//
// Deploy com "Enforce JWT verification" DESLIGADO: a página de pagamento é pública.
// A função confere sozinha quem pode fazer o quê (login do dono, chave interna ou token do link).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") || "https://gahbrielsoares.github.io/Lumos").replace(/\/$/, "");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const onlyDigits = (s: unknown) => String(s || "").replace(/\D/g, "");
const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtyTxt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UNIT: Record<string, string> = { m2: "m²", saco: "saco(s)", unidade: "un.", caixa: "cx", metro: "m", kg: "kg", litro: "L", rolo: "rolo(s)" };
const METODO: Record<string, string> = { pix: "Pix", cartao: "Cartão de crédito", boleto: "Boleto", manual: "Pagamento confirmado pela loja" };

const SIM_PAGAMENTO = { provider: "simulado", config: { metodos: ["pix", "cartao", "boleto"], max_parcelas: 10, parcelas_sem_juros: 3, validade_link_horas: 24 } };
const DEFAULT_THANKS = "Obrigado pela preferência! 💛 Qualquer dúvida sobre o pedido ou a instalação, é só chamar aqui. Boa obra!";

// ---------- WhatsApp ----------
// deno-lint-ignore no-explicit-any
async function sendText(wa: any, to: string, text: string) {
  if (!wa?.base_url || !wa?.api_key) { console.error("Agente sem provedor de WhatsApp configurado"); return false; }
  const res = wa.vendor === "evolution"
    ? await fetch(`${wa.base_url}/message/sendText/${wa.instance_id}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: wa.api_key }, body: JSON.stringify({ number: to, text }),
      })
    : await fetch(`${wa.base_url}/send/text`, {
        method: "POST", headers: { "Content-Type": "application/json", token: wa.api_key }, body: JSON.stringify({ number: to, text }),
      });
  if (!res.ok) console.error("Falha ao enviar:", res.status, await res.text());
  return res.ok;
}

// Salva no histórico (antes de enviar, pro eco do webhook não duplicar) e envia
// deno-lint-ignore no-explicit-any
async function sendToCustomer(ctx: any, text: string) {
  await supabase.from("messages").insert({ lead_id: ctx.lead.id, direction: "out", sender: "sistema", text });
  await sendText(ctx.wa, onlyDigits(ctx.lead.phone), text);
}

// ---------- Contexto do pedido ----------
async function loadContext(orderId: string) {
  const { data: order } = await supabase.from("sales_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const [{ data: lead }, { data: agent }, { data: wa }, { data: integrations }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", order.lead_id).maybeSingle(),
    supabase.from("agents").select("*").eq("id", order.agent_id).maybeSingle(),
    supabase.from("whatsapp_provider_config").select("*").eq("agent_id", order.agent_id).maybeSingle(),
    supabase.from("integrations").select("kind, provider, enabled, config").eq("owner_id", order.owner_id),
  ]);
  // deno-lint-ignore no-explicit-any
  const get = (k: string) => (integrations || []).find((i: any) => i.kind === k && i.enabled);
  const simulated = !!(order.simulado || agent?.is_simulator);
  return {
    order, lead, agent, wa, simulated,
    vendas: get("vendas")?.config || {},
    pagamento: simulated ? SIM_PAGAMENTO : get("pagamento") || null,
    notaFiscal: simulated ? { provider: "simulado" } : get("nota_fiscal") || null,
  };
}

// deno-lint-ignore no-explicit-any
function orderSummary(order: any) {
  const linhas = (order.itens || []).map((i: any) => {
    const qtd = i.caixas ? `${i.caixas} cx (${qtyTxt(i.quantidade)} m²)` : `${qtyTxt(i.quantidade)} ${UNIT[i.unidade] || i.unidade}`;
    return `• ${qtd} — ${i.nome} — ${brl(i.subtotal)}`;
  });
  const e = order.entrega || {};
  const freteLinha = e.tipo === "retirada"
    ? "Retirada na loja: sem custo"
    : `Frete${e.local ? ` (${e.local})` : ""}: ${Number(order.frete) === 0 ? "grátis 🎉" : brl(order.frete)}${e.prazo ? ` — ${e.prazo}` : ""}`;
  return `${linhas.join("\n")}\n\nSubtotal: ${brl(order.subtotal)}\n${freteLinha}\n*Total: ${brl(order.total)}*`;
}

// ---------- Ações ----------
// deno-lint-ignore no-explicit-any
async function approve(ctx: any, freteManual: number | null) {
  const { order } = ctx;
  if (order.status !== "aguardando_aprovacao") return json({ error: "Este pedido já foi aprovado ou encerrado." }, 409);

  let frete = order.frete;
  if (freteManual != null && !isNaN(freteManual)) frete = Math.max(0, Number(freteManual));
  if (frete == null) {
    if (order.entrega?.tipo === "retirada") frete = 0;
    else return json({ error: "Informe o valor do frete antes de aprovar." }, 400);
  }
  const total = Math.round((Number(order.subtotal) + Number(frete)) * 100) / 100;

  const pag = ctx.pagamento;
  const token = crypto.randomUUID().replace(/-/g, "");
  let pagamento: Record<string, unknown> = { provider: pag?.provider || null };
  let payText = "";

  if (pag?.provider === "simulado") {
    const link = `${SITE_URL}/pagamento-simulado.html?p=${order.id}&t=${token}`;
    const c = pag.config;
    pagamento = { provider: "simulado", token, link };
    payText = `💳 Pague com Pix, cartão (até ${c.max_parcelas}x, ${c.parcelas_sem_juros}x sem juros) ou boleto:\n${link}\n\nO link vale ${c.validade_link_horas} horas.`;
  } else if (pag?.provider === "pix_manual") {
    pagamento = { provider: "pix_manual" };
    payText = `💠 Pagamento via Pix:\nChave: *${pag.config?.pix_chave || "—"}*${pag.config?.pix_titular ? `\nTitular: ${pag.config.pix_titular}` : ""}\n\nAssim que fizer o Pix, é só mandar o comprovante aqui que a gente confirma. 😉`;
  } else if (pag?.provider) {
    return json({ error: `O envio automático de link pelo ${pag.provider} ainda não foi implementado. Envie o link manualmente e use "Confirmar pagamento" quando cair.` }, 501);
  } else {
    payText = "Em seguida nossa equipe te envia a forma de pagamento. 😉";
  }

  await supabase.from("sales_orders").update({
    frete, total, status: "aguardando_pagamento", approved_at: new Date().toISOString(), pagamento,
  }).eq("id", order.id);
  const updated = { ...order, frete, total };

  await sendToCustomer(ctx, `🧾 *Pedido #${order.numero}* conferido e aprovado!\n\n${orderSummary(updated)}\n\n${payText}`);
  await supabase.from("leads").update({
    last_message_at: new Date().toISOString(),
    orcamento: { ...(ctx.lead.orcamento || {}), frete, aprovado_em: new Date().toISOString(), status: "aguardando_pagamento" },
  }).eq("id", ctx.lead.id);

  return json({ ok: true, status: "aguardando_pagamento", link: pagamento.link || null });
}

// deno-lint-ignore no-explicit-any
async function finalizePaid(ctx: any, metodo: string, parcelas: number | null) {
  const { order } = ctx;
  if (order.status === "pago") return json({ ok: true, already: true, numero: order.numero });
  if (order.status !== "aguardando_pagamento") return json({ error: "Este pedido não está aguardando pagamento." }, 409);

  const nf = ctx.notaFiscal?.provider && ctx.notaFiscal.provider !== "nenhum"
    ? String(order.numero).padStart(6, "0").replace(/(\d{3})(\d{3})$/, "$1.$2")
    : null;
  const paidAt = new Date().toISOString();

  await supabase.from("sales_orders").update({
    status: "pago", paid_at: paidAt, nf_numero: ctx.simulated ? nf : null,
    pagamento: { ...(order.pagamento || {}), metodo, parcelas },
  }).eq("id", order.id);

  await supabase.from("leads").update({
    stage: "fechado", is_client: true, last_message_at: paidAt,
    orcamento: { ...(ctx.lead.orcamento || {}), status: "pago", pago_em: paidAt },
  }).eq("id", ctx.lead.id);

  const formaTxt = metodo === "cartao" && parcelas ? `${METODO.cartao} em ${parcelas}x` : METODO[metodo] || metodo;
  await sendToCustomer(ctx, `✅ *Pagamento confirmado!*\n\nPedido *#${order.numero}*\nValor: *${brl(order.total)}*\nForma: ${formaTxt}\n\nJá estamos separando seus produtos. 📦`);

  if (ctx.simulated && nf) {
    await sleep(1200);
    await sendToCustomer(ctx, `🧾 Nota fiscal emitida: *NF-e nº ${nf}*\nEla também vai para o seu e-mail cadastrado.\n_(ambiente de demonstração — nota sem valor fiscal)_`);
  }

  await sleep(1200);
  const e = order.entrega || {};
  const entregaTxt = e.tipo === "retirada"
    ? `📍 *Retirada na loja*${e.local ? `\n${e.local}` : ""}\nAvisamos por aqui assim que o pedido estiver separado. É só informar o número *#${order.numero}* no balcão.`
    : `🚚 *Entrega*${e.local ? `: ${e.local}` : ""}${e.prazo ? `\nPrevisão: ${e.prazo}` : ""}\nAvisamos por aqui quando o pedido sair para entrega.`;
  await sendToCustomer(ctx, entregaTxt);

  await sleep(1200);
  await sendToCustomer(ctx, ctx.vendas?.mensagem_pos_pagamento || DEFAULT_THANKS);

  const seller = onlyDigits(ctx.vendas?.telefone_aprovacao);
  if (seller) await sendText(ctx.wa, seller, `💰 *Pagamento confirmado* — pedido #${order.numero}\nCliente: ${ctx.lead.name || ctx.lead.phone}\nValor: ${brl(order.total)} (${formaTxt})`);

  return json({ ok: true, numero: order.numero, nf });
}

// ---------- Entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const { action, order_id } = body;
    if (!order_id) return json({ error: "Pedido não informado." }, 400);

    const ctx = await loadContext(order_id);
    if (!ctx || !ctx.lead) return json({ error: "Pedido não encontrado." }, 404);

    // Ações públicas (página de pagamento): exigem o token do link
    if (action === "get_public" || action === "pay_simulated") {
      if (!body.token || body.token !== ctx.order.pagamento?.token) return json({ error: "Link inválido ou expirado." }, 403);

      if (action === "get_public") {
        const o = ctx.order;
        return json({
          numero: o.numero, status: o.status, itens: o.itens, subtotal: o.subtotal, frete: o.frete, total: o.total,
          entrega: o.entrega, loja: ctx.agent?.name || "Loja", cliente: ctx.lead.name || "",
          pagamento: ctx.pagamento?.config || {}, simulado: ctx.simulated,
        });
      }
      if (!ctx.simulated) return json({ error: "Este pedido não é de demonstração." }, 400);
      const metodo = ["pix", "cartao", "boleto"].includes(body.metodo) ? body.metodo : "pix";
      return await finalizePaid(ctx, metodo, metodo === "cartao" ? Math.max(1, Number(body.parcelas) || 1) : null);
    }

    // Ações internas: chave de serviço (aprovação automática) ou o dono logado
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let allowed = jwt === SERVICE_KEY;
    if (!allowed) {
      const { data } = await supabase.auth.getUser(jwt);
      allowed = !!data?.user && data.user.id === ctx.order.owner_id;
    }
    if (!allowed) return json({ error: "Sem permissão para este pedido." }, 403);

    if (action === "approve") return await approve(ctx, body.frete != null && body.frete !== "" ? Number(body.frete) : null);
    if (action === "mark_paid") return await finalizePaid(ctx, "manual", null);
    if (action === "cancel") {
      await supabase.from("sales_orders").update({ status: "cancelado" }).eq("id", ctx.order.id);
      await supabase.from("leads").update({ stage: "perdido", orcamento: { ...(ctx.lead.orcamento || {}), status: "cancelado" } }).eq("id", ctx.lead.id);
      return json({ ok: true });
    }
    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado." }, 500);
  }
});
