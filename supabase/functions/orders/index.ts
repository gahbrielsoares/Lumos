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
const SIM_OBS_ENTREGA = "A descarga é feita no térreo, na calçada ou na garagem. Em condomínio, deixe a portaria avisada e confira se o caminhão tem acesso.";
const JUROS_MES = 0.0199; // mesma regra da página de pagamento simulado

// Valor cobrado no cartão (com juros acima das parcelas sem juros)
function valorCartao(total: number, parcelas: number, semJuros: number) {
  const t = parcelas > semJuros ? total * (1 + JUROS_MES * parcelas) : total;
  return Math.round(t * 100) / 100;
}

const maskDoc = (doc: string) => {
  const d = onlyDigits(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-**`;
  return ""; // documento incompleto: não exibe
};
const validEmail = (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
const docLabel = (doc: string) => {
  const m = maskDoc(doc);
  return m ? `${onlyDigits(doc).length === 14 ? "CNPJ" : "CPF"} ${m}` : "";
};

// "2 dias úteis" -> data prevista (dias úteis, fuso de Brasília)
function previsao(prazo: string | null): string | null {
  if (!prazo) return null;
  const m = String(prazo).match(/(\d+)\s*dias?\s*(úteis|uteis|útil|util)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const uteis = !!m[2];
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (!uteis || (wd !== 0 && wd !== 6)) left--;
  }
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${dia}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}

// deno-lint-ignore no-explicit-any
function enderecoTxt(e: any): string {
  const a = e?.endereco;
  if (!a) return e?.local || "";
  const linha1 = [a.rua, a.numero].filter(Boolean).join(", ");
  const partes = [
    [linha1, a.complemento].filter(Boolean).join(" — "),
    [a.bairro, a.cidade].filter(Boolean).join(", "),
    a.cep ? `CEP ${String(a.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "",
  ].filter(Boolean);
  const extras = [
    a.tipo_imovel ? `Imóvel: ${a.tipo_imovel}` : "",
    a.referencia ? `Referência: ${a.referencia}` : "",
    a.recebedor ? `Quem recebe: ${a.recebedor}` : "",
    e?.janela ? `Período: ${e.janela}` : "",
  ].filter(Boolean);
  return [partes.join("\n"), extras.join("\n")].filter(Boolean).join("\n") || e?.local || "";
}

// Horário previsto (Brasília) daqui a N minutos
function horaPrevista(min: number) {
  const d = new Date(Date.now() + min * 60000);
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

// Pedido de restaurante (delivery/retirada) vai pra tela da Cozinha
// deno-lint-ignore no-explicit-any
async function sendToKitchen(ctx: any) {
  const { order } = ctx;
  const { data: exists } = await supabase.from("orders").select("id").eq("sales_order_id", order.id).maybeSingle();
  if (exists) return exists.id;
  const tipo = order.entrega?.tipo === "retirada" ? "retirada" : "delivery";
  const itens = (order.itens || []).filter((i: { taxa?: boolean }) => !i.taxa);
  const { data: ticket, error } = await supabase.from("orders").insert({
    owner_id: order.owner_id, lead_id: order.lead_id, table_session_id: null, tipo, sales_order_id: order.id,
    status: "novo_pedido", total: order.subtotal,
    observacao: [order.cliente?.nome, tipo === "delivery" ? order.entrega?.endereco?.bairro || order.entrega?.local : "Retirada"].filter(Boolean).join(" · "),
  }).select().single();
  if (error) { console.error("Erro ao mandar pra cozinha:", error.message); return null; }
  await supabase.from("order_items").insert(itens.map((i: { product_id: string | null; nome: string; quantidade: number; preco_unitario: number; observacao?: string }) => ({
    order_id: ticket.id, product_id: i.product_id, product_name: i.nome, quantity: Math.round(Number(i.quantidade)),
    unit_price: i.preco_unitario ?? 0, observacao: i.observacao || null,
  })));
  return ticket.id;
}

// deno-lint-ignore no-explicit-any
function previsaoCozinha(order: any) {
  const e = order.entrega || {};
  const total = Number(e.tempo_preparo || 25) + (e.tipo === "retirada" ? 0 : Number(e.tempo_entrega || 40));
  return e.tipo === "retirada"
    ? `🥡 Fica pronto por volta das *${horaPrevista(total)}* — é só retirar no balcão informando o pedido *#${order.numero}*.`
    : `🛵 Previsão de entrega: por volta das *${horaPrevista(total)}*. Te aviso por aqui quando sair!`;
}

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
    obsEntrega: get("frete")?.config?.observacao_entrega || (simulated ? SIM_OBS_ENTREGA : ""),
  };
}

// deno-lint-ignore no-explicit-any
function orderSummary(order: any) {
  const linhas = (order.itens || []).map((i: any) => {
    const qtd = i.caixas ? `${i.caixas} cx (${qtyTxt(i.quantidade)} m²)` : `${qtyTxt(i.quantidade)} ${UNIT[i.unidade] || i.unidade}`;
    return `• ${qtd} — ${i.nome} — ${brl(i.subtotal)}${i.observacao ? `\n   _obs.: ${i.observacao}_` : ""}`;
  });
  const e = order.entrega || {};
  if (e.tipo === "mesa") return `${linhas.join("\n")}\n\n*Total: ${brl(order.total)}*`;
  const freteLinha = e.tipo === "retirada"
    ? (e.cozinha ? "Retirada no balcão: sem taxa" : "Retirada na loja: sem custo")
    : e.cozinha ? `Taxa de entrega${e.local ? ` (${e.local})` : ""}: ${Number(order.frete) === 0 ? "grátis 🎉" : brl(order.frete)}`
    : `Frete${e.local ? ` (${e.local})` : ""}: ${Number(order.frete) === 0 ? "grátis 🎉" : brl(order.frete)}${e.prazo ? ` — ${e.prazo}` : ""}`;
  const end = e.tipo === "retirada" ? "" : enderecoTxt(e);
  const c = order.cliente || {};
  const cli = c.nome || c.razao_social
    ? `\n\n👤 ${c.razao_social ? `${c.razao_social} (contato: ${c.nome || "—"})` : c.nome}${docLabel(c.cpf || "") ? ` · ${docLabel(c.cpf)}` : ""}${c.ie ? ` · IE ${c.ie}` : ""}`
    : "";
  return `${linhas.join("\n")}\n\nSubtotal: ${brl(order.subtotal)}\n${freteLinha}\n*Total: ${brl(order.total)}*${cli}${end ? `\n\n📍 *Entrega em:*\n${end}` : ""}\n\nSe algo estiver errado, é só me avisar antes de pagar. 😉`;
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
  const pref = order.pagamento?.preferencia;
  let pagamento: Record<string, unknown> = { ...(order.pagamento || {}), provider: pag?.provider || null };
  let payText = "";
  const isMesa = order.entrega?.tipo === "mesa";

  if (order.entrega?.cozinha && pref === "na_entrega") {
    // Restaurante, pagamento na entrega: sem link; o pedido já vai pra cozinha
    pagamento = { ...pagamento, provider: "na_entrega" };
    const det = order.pagamento?.detalhe ? ` (${order.pagamento.detalhe})` : "";
    const troco = order.pagamento?.troco && !/sem/i.test(order.pagamento.troco) ? `\nTroco para: *${/^\d/.test(order.pagamento.troco) ? brl(Number(String(order.pagamento.troco).replace(",", "."))) : order.pagamento.troco}*` : "";
    payText = `💵 Pagamento na ${order.entrega?.tipo === "retirada" ? "retirada" : "entrega"}${det}.${troco}`;
  } else if (pag?.provider === "simulado") {
    const link = `${SITE_URL}/pagamento-simulado.html?p=${order.id}&t=${token}`;
    const c = pag.config;
    pagamento = { provider: "simulado", token, link };
    pagamento = { ...(order.pagamento || {}), ...pagamento };
    payText = isMesa
      ? `💳 Pague por Pix ou cartão pelo link:\n${link}\n\nSe preferir, é só pedir a maquininha ao garçom. 😉`
      : order.entrega?.cozinha
        ? `💳 Pague com Pix ou cartão pelo link:\n${link}\n\nAssim que o pagamento cair, seu pedido vai direto pra cozinha. 👨‍🍳`
        : `💳 Pague com Pix, cartão (até ${c.max_parcelas}x, ${c.parcelas_sem_juros}x sem juros) ou boleto:\n${link}\n\nO link vale ${c.validade_link_horas} horas.`;
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

  const head = isMesa
    ? `🧾 *Conta — ${order.entrega?.local || "Mesa"}*`
    : order.entrega?.cozinha ? `🧾 *Pedido #${order.numero}* registrado!` : `🧾 *Pedido #${order.numero}* conferido e aprovado!`;
  await sendToCustomer(ctx, `${head}\n\n${orderSummary(updated)}\n\n${payText}`);

  // Pagamento na entrega: o pedido vai pra cozinha agora
  if (order.entrega?.cozinha && pref === "na_entrega") {
    await sendToKitchen({ ...ctx, order: updated });
    await sleep(1000);
    await sendToCustomer(ctx, `👨‍🍳 Seu pedido já foi pra cozinha!\n${previsaoCozinha(updated)}`);
  }
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

  const semJuros = Number(ctx.pagamento?.config?.parcelas_sem_juros || 1);
  const cobrado = metodo === "cartao" && parcelas ? valorCartao(Number(order.total), parcelas, semJuros) : Number(order.total);
  // Conta da mesa: agradece e libera a mesa
  if (order.entrega?.tipo === "mesa") {
    const forma = METODO[metodo] || metodo;
    await supabase.from("sales_orders").update({ pagamento: { ...(order.pagamento || {}), metodo, parcelas, valor_cobrado: order.total } }).eq("id", order.id);
    await sendToCustomer(ctx, `✅ *Pagamento confirmado!*\n${order.entrega.local || "Mesa"} — *${brl(order.total)}* (${forma})${nf && ctx.simulated ? `\n🧾 Cupom fiscal (NFC-e) nº ${nf} _(demonstração)_` : ""}\n\nObrigado pela visita! Foi um prazer receber você. 🍻 Volte sempre!`);
    await releaseTable(order, ctx.lead.id);
    const seller = onlyDigits(ctx.vendas?.telefone_aprovacao);
    if (seller) await sendText(ctx.wa, seller, `💰 Conta paga — ${order.entrega.local}: ${brl(order.total)} (${forma})`);
    return json({ ok: true, numero: order.numero });
  }

  // Restaurante com pagamento na entrega: o pedido já estava na cozinha, só confirma o recebimento
  if (order.entrega?.cozinha && order.pagamento?.preferencia === "na_entrega") {
    await sendToCustomer(ctx, `✅ Pagamento do pedido *#${order.numero}* recebido. Obrigado!`);
    await sleep(1000);
    await sendToCustomer(ctx, ctx.vendas?.mensagem_pos_pagamento || DEFAULT_THANKS);
    return json({ ok: true, numero: order.numero });
  }

  const formaTxt = metodo === "cartao" && parcelas
    ? `${METODO.cartao} em ${parcelas}x de ${brl(cobrado / parcelas)}${cobrado > Number(order.total) ? " (com juros do cartão)" : " sem juros"}`
    : METODO[metodo] || metodo;
  await supabase.from("sales_orders").update({ pagamento: { ...(order.pagamento || {}), metodo, parcelas, valor_cobrado: cobrado } }).eq("id", order.id);
  await sendToCustomer(ctx, `✅ *Pagamento confirmado!*\n\nPedido *#${order.numero}*\nValor: *${brl(cobrado)}*\nForma: ${formaTxt}\n\nJá estamos separando seus produtos. 📦`);

  if (order.entrega?.cozinha) {
    await sendToKitchen(ctx);
    if (ctx.simulated && nf) {
      await sleep(1200);
      await sendToCustomer(ctx, `🧾 Cupom fiscal (NFC-e) nº *${nf}* emitido. _(demonstração)_`);
    }
    await sleep(1200);
    await sendToCustomer(ctx, `👨‍🍳 Seu pedido já está na cozinha!\n${previsaoCozinha(order)}`);
    await sleep(1200);
    await sendToCustomer(ctx, ctx.vendas?.mensagem_pos_pagamento || DEFAULT_THANKS);
    const seller = onlyDigits(ctx.vendas?.telefone_aprovacao);
    if (seller) await sendText(ctx.wa, seller, `💰 Pedido #${order.numero} pago (${formaTxt}) — já na cozinha.`);
    return json({ ok: true, numero: order.numero, nf });
  }

  if (ctx.simulated && nf) {
    await sleep(1200);
    const c = order.cliente || {};
    const emNome = c.razao_social
      ? `\nEm nome de: ${c.razao_social}${docLabel(c.cpf || "") ? ` (${docLabel(c.cpf)}` : " ("}${c.ie ? `${docLabel(c.cpf || "") ? " · " : ""}IE ${c.ie}` : ""})`.replace(" ()", "")
      : c.nome ? `\nEm nome de: ${c.nome}${docLabel(c.cpf || "") ? ` (${docLabel(c.cpf)})` : " (consumidor final, sem CPF)"}` : "";
    const envio = validEmail(c.email) ? `Enviamos o PDF para *${c.email}*.` : "Se quiser o PDF, é só pedir que eu te mando por aqui.";
    await sendToCustomer(ctx, `🧾 Nota fiscal emitida: *NF-e nº ${nf}*${emNome}\n${envio}\n_(ambiente de demonstração — nota sem valor fiscal)_`);
  }

  await sleep(1200);
  const e = order.entrega || {};
  const quando = previsao(e.prazo);
  const entregaTxt = e.tipo === "retirada"
    ? `📍 *Retirada na loja*${e.local ? `\n${e.local}` : ""}\nAvisamos por aqui assim que o pedido estiver separado. É só informar o número *#${order.numero}* no balcão${order.cliente?.nome ? ` e o nome ${order.cliente.nome}` : ""}.`
    : `🚚 *Entrega agendada*\n${enderecoTxt(e)}${e.prazo ? `\n\nPrevisão: ${quando ? `*${quando}*` : e.prazo}${quando ? ` (${e.prazo})` : ""}` : ""}\nAvisamos por aqui quando o pedido sair para entrega.${ctx.obsEntrega ? `\n\nℹ️ ${ctx.obsEntrega}` : ""}`;
  await sendToCustomer(ctx, entregaTxt);

  await sleep(1200);
  await sendToCustomer(ctx, ctx.vendas?.mensagem_pos_pagamento || DEFAULT_THANKS);

  const seller = onlyDigits(ctx.vendas?.telefone_aprovacao);
  if (seller) await sendText(ctx.wa, seller, `💰 *Pagamento confirmado* — pedido #${order.numero}\nCliente: ${ctx.lead.name || ctx.lead.phone}\nValor: ${brl(cobrado)} (${formaTxt})`);

  return json({ ok: true, numero: order.numero, nf });
}

// Conta paga: desvincula o cliente da mesa; se ninguém mais estiver nela, fecha a sessão e libera a mesa
// deno-lint-ignore no-explicit-any
async function releaseTable(order: any, leadId: string) {
  const sessionId = order.table_session_id;
  await supabase.from("leads").update({ table_session_id: null, visit_status: "iniciado" }).eq("id", leadId);
  if (!sessionId) return;
  const { data: others } = await supabase.from("leads").select("id").eq("table_session_id", sessionId);
  if (!others?.length) {
    const { data: sess } = await supabase.from("table_sessions").update({ status: "fechada", closed_at: new Date().toISOString() })
      .eq("id", sessionId).select("table_id").maybeSingle();
    if (sess?.table_id) await supabase.from("restaurant_tables").update({ status: "livre" }).eq("id", sess.table_id);
  }
}

// Cozinha mudou o status do pedido: avisa o cliente (delivery e retirada)
async function kitchenStatus(ticketId: string, status: string, userId: string | null, trusted: boolean) {
  const valid = ["novo_pedido", "em_preparo", "pronto", "saiu_entrega", "entregue", "cancelado"];
  if (!valid.includes(status)) return json({ error: "Status inválido." }, 400);
  const { data: t } = await supabase.from("orders").select("*").eq("id", ticketId).maybeSingle();
  if (!t) return json({ error: "Pedido da cozinha não encontrado." }, 404);
  if (!trusted && t.owner_id !== userId) return json({ error: "Sem permissão." }, 403);
  if (t.status === status) return json({ ok: true });

  await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (t.tipo === "mesa" || !t.lead_id) return json({ ok: true });

  const { data: lead } = await supabase.from("leads").select("*").eq("id", t.lead_id).maybeSingle();
  if (!lead) return json({ ok: true });
  const { data: wa } = await supabase.from("whatsapp_provider_config").select("*").eq("agent_id", lead.agent_id).maybeSingle();
  const { data: so } = t.sales_order_id ? await supabase.from("sales_orders").select("numero, entrega, pagamento, total").eq("id", t.sales_order_id).maybeSingle() : { data: null };
  const num = so?.numero ? `#${so.numero}` : "";
  const nome = String(lead.dados_cliente?.nome || lead.name || "").split(" ")[0];
  const aPagar = so?.pagamento?.preferencia === "na_entrega" ? `\n💵 Valor a pagar na ${t.tipo === "retirada" ? "retirada" : "entrega"}: *${brl(so.total)}*` : "";
  const msgs: Record<string, string> = {
    em_preparo: `👨‍🍳 ${nome ? `${nome}, s` : "S"}eu pedido ${num} já está sendo preparado!`,
    pronto: t.tipo === "retirada" ? `✅ Seu pedido ${num} está pronto! Pode retirar no balcão.${aPagar}` : "",
    saiu_entrega: `🛵 Seu pedido ${num} saiu para entrega! Chega em poucos minutos.${aPagar}`,
    entregue: `😋 Pedido ${num} ${t.tipo === "retirada" ? "retirado" : "entregue"}. Bom apetite${nome ? `, ${nome}` : ""}! Se puder, conta pra gente depois o que achou. 💛`,
    cancelado: `Seu pedido ${num} foi cancelado. Se tiver alguma dúvida, é só chamar aqui.`,
  };
  const text = msgs[status];
  if (text) {
    await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", sender: "sistema", text });
    await sendText(wa, onlyDigits(lead.phone), text);
  }
  if (so && t.sales_order_id) {
    const log = { em_preparo: "em_preparo", pronto: "pronto_para_retirada", saiu_entrega: "saiu_para_entrega", entregue: "entregue" }[status];
    if (log) await supabase.from("sales_orders").update({ logistica: { status: log, em: new Date().toISOString() } }).eq("id", t.sales_order_id);
  }
  return json({ ok: true, notified: !!text });
}

// ---------- Pós-venda: separação, saída para entrega, retirada e entrega ----------
// deno-lint-ignore no-explicit-any
async function logistics(ctx: any, step: "dispatch" | "ready_pickup" | "delivered") {
  const { order } = ctx;
  if (order.status !== "pago") return json({ error: "O pedido precisa estar pago." }, 409);
  const e = order.entrega || {};
  const now = new Date().toISOString();
  const log = { ...(order.logistica || {}) };
  const nome = (order.cliente?.nome || ctx.lead.name || "").split(" ")[0];

  if (step === "dispatch") {
    if (e.tipo === "retirada") return json({ error: "Este pedido é para retirada na loja." }, 400);
    log.status = "saiu_para_entrega"; log.saiu_em = now;
    await sendToCustomer(ctx, `🚚 ${nome ? `${nome}, s` : "S"}eu pedido *#${order.numero}* saiu para entrega!${e.janela ? `\nChegada prevista: ${e.janela} de hoje.` : "\nChega ainda hoje."}${e.endereco?.recebedor ? `\nQuem recebe: ${e.endereco.recebedor}.` : ""}\n\nNosso motorista pode te ligar se precisar de alguma orientação para chegar. ${ctx.obsEntrega ? `\n\nℹ️ ${ctx.obsEntrega}` : ""}`);
  } else if (step === "ready_pickup") {
    if (e.tipo !== "retirada") return json({ error: "Este pedido é para entrega." }, 400);
    log.status = "pronto_para_retirada"; log.pronto_em = now;
    await sendToCustomer(ctx, `📦 ${nome ? `${nome}, s` : "S"}eu pedido *#${order.numero}* está separado e pronto para retirada!${e.local ? `\n📍 ${e.local}` : ""}\nÉ só informar o número *#${order.numero}* no balcão. Se for pesado, venha de carro ou com alguém pra ajudar. 😉`);
  } else {
    log.status = "entregue"; log.entregue_em = now;
    await sendToCustomer(ctx, `✅ Pedido *#${order.numero}* ${e.tipo === "retirada" ? "retirado" : "entregue"}! Obrigado pela confiança${nome ? `, ${nome}` : ""}. 💛\n\nConfere se chegou tudo certinho? Se precisar de algo na instalação ou faltar alguma peça, é só chamar aqui.`);
  }
  await supabase.from("sales_orders").update({ logistica: log }).eq("id", order.id);
  await supabase.from("leads").update({
    last_message_at: now, orcamento: { ...(ctx.lead.orcamento || {}), logistica: log.status },
  }).eq("id", ctx.lead.id);
  return json({ ok: true, logistica: log });
}

// ---------- Entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const { action, order_id } = body;

    if (action === "kitchen_status") {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const trusted = jwt === SERVICE_KEY;
      const { data } = trusted ? { data: null } : await supabase.auth.getUser(jwt);
      if (!trusted && !data?.user) return json({ error: "Sessão expirada." }, 401);
      return await kitchenStatus(body.ticket_id, body.status, data?.user?.id || null, trusted);
    }

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
          entrega: { ...o.entrega, endereco_txt: o.entrega?.tipo === "retirada" ? "" : enderecoTxt(o.entrega) },
          loja: ctx.agent?.name || "Loja", cliente: o.cliente?.nome || ctx.lead.name || "",
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
    if (action === "dispatch" || action === "ready_pickup" || action === "delivered") return await logistics(ctx, action);
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
