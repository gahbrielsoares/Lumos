// Edge Function: pagamentos
// Recebe os avisos (webhooks) do Mercado Pago e do Asaas e confirma o pagamento do pedido.
// Segurança: o aviso nunca é aceito como verdade. A função consulta o pagamento direto no provedor,
// com a chave da própria loja, e só dá baixa se estiver aprovado e for do pedido certo, com o valor certo.
// Deploy com "Enforce JWT verification" DESLIGADO (o provedor chama sem login).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const ORIGEM_LOG = "pagamentos";
// ---------- Histórico do sistema (Painel Admin): o essencial de cada passo, nunca chaves ou conversas ----------
// deno-lint-ignore no-explicit-any
async function registrarEvento(e: { owner?: string | null; tipo?: "info" | "aviso" | "erro"; acao: string; msg?: string; dados?: any; ref?: string | null }) {
  try {
    await supabase.from("eventos_sistema").insert({ owner_id: e.owner || null, origem: ORIGEM_LOG, tipo: e.tipo || "info", acao: e.acao,
      mensagem: e.msg ? String(e.msg).slice(0, 500) : null, dados: e.dados ?? null, ref_id: e.ref ? String(e.ref) : null });
  } catch (_) { /* o histórico nunca pode derrubar o fluxo principal */ }
}
const ok = (b: unknown = { ok: true }, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function chaveDaLoja(ownerId: string) {
  const { data } = await supabase.from("integrations").select("provider, config, secrets").eq("owner_id", ownerId).eq("kind", "pagamento").maybeSingle();
  return data;
}
// Dá baixa pelo mesmo caminho das outras vendas (financeiro, estoque, cozinha, nota, mensagem ao cliente)
async function confirmar(orderId: string, metodo: string, parcelas: number | null) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/orders`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({ action: "provider_paid", order_id: orderId, metodo, parcelas }),
  });
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 200);
    console.error("pagamentos: falha ao confirmar o pedido", orderId, r.status, txt);
    const { data: o } = await supabase.from("sales_orders").select("owner_id, numero").eq("id", orderId).maybeSingle();
    await registrarEvento({ owner: o?.owner_id, tipo: "erro", acao: "confirmacao_falhou", msg: `Pagamento aprovado no provedor, mas o pedido #${o?.numero} não foi baixado: ${txt}`, ref: orderId });
  }
  return r.ok;
}
const valorConfere = (pago: number, pedido: number) => Math.abs(Number(pago) - Number(pedido)) < 0.02 || Number(pago) >= Number(pedido);

// ---------- Mercado Pago ----------
// Aviso: corpo { type: "payment", data: { id } } ou parâmetros ?topic=payment&id=...
async function mercadoPago(url: URL, body: any) {
  const orderId = url.searchParams.get("o") || "";
  const tipo = body?.type || body?.topic || url.searchParams.get("topic") || url.searchParams.get("type");
  const pagamentoId = body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");
  if (tipo !== "payment" || !pagamentoId || !orderId) return ok({ ignorado: true });
  const { data: pedido } = await supabase.from("sales_orders").select("id, owner_id, numero, total, status, pagamento").eq("id", orderId).maybeSingle();
  if (!pedido) return ok({ ignorado: "pedido" });
  if (pedido.status === "pago") return ok({ ja: true });
  const integ = await chaveDaLoja(pedido.owner_id);
  const chave = integ?.secrets?.access_token;
  const ev = (tipo: "info" | "aviso" | "erro", acao: string, msg: string, dados?: unknown) => registrarEvento({ owner: pedido.owner_id, tipo, acao, msg: `Mercado Pago, pedido #${pedido.numero}: ${msg}`, dados, ref: pedido.id });
  if (!chave) { await ev("erro", "aviso_sem_chave", "aviso recebido, mas a loja está sem a chave de acesso em Integrações"); return ok({ ignorado: "chave" }); }
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(pagamentoId))}`, { headers: { Authorization: `Bearer ${chave}` } });
  if (!r.ok) { await ev("erro", "consulta_falhou", `não foi possível conferir o pagamento ${pagamentoId} (HTTP ${r.status})`); return ok({ ignorado: `consulta ${r.status}` }); }
  const p = await r.json();
  if (p.external_reference !== pedido.id) { await ev("aviso", "aviso_suspeito", `o pagamento ${pagamentoId} é de outro pedido; ignorado`, { referencia: p.external_reference }); return ok({ ignorado: "referencia" }); }
  if (!valorConfere(p.transaction_amount, pedido.total)) { await ev("aviso", "aviso_suspeito", `valor pago (R$ ${p.transaction_amount}) menor que o do pedido; ignorado`); return ok({ ignorado: "valor" }); }
  if (p.status !== "approved") { await ev("info", "pagamento_nao_aprovado", `situação "${p.status}"${p.status_detail ? ` (${p.status_detail})` : ""}; aguardando`, { status: p.status, detalhe: p.status_detail }); return ok({ ignorado: p.status }); }
  const metodo = p.payment_type_id === "credit_card" ? "cartao" : p.payment_type_id === "debit_card" ? "debito" : p.payment_type_id === "ticket" ? "boleto" : "pix";
  await supabase.from("sales_orders").update({ pagamento: { ...(pedido.pagamento || {}), provedor_pagamento_id: String(p.id) } }).eq("id", pedido.id);
  await confirmar(pedido.id, metodo, p.installments || null);
  return ok();
}

// ---------- Asaas ----------
// Aviso: { event: "PAYMENT_RECEIVED" | "PAYMENT_CONFIRMED", payment: { id, paymentLink, ... } }
async function asaas(url: URL, body: any, req: Request) {
  const ownerId = url.searchParams.get("owner") || "";
  if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(body?.event) || !body?.payment?.id || !ownerId) return ok({ ignorado: true });
  const integ = await chaveDaLoja(ownerId);
  const chave = integ?.secrets?.access_token;
  const ev = (tipo: "info" | "aviso" | "erro", acao: string, msg: string) => registrarEvento({ owner: ownerId, tipo, acao, msg: `Asaas: ${msg}`, ref: body.payment.id });
  if (!chave) { await ev("erro", "aviso_sem_chave", "aviso recebido, mas a loja está sem a chave de API em Integrações"); return ok({ ignorado: "chave" }); }
  // Se o aviso foi registrado pelo Lumos, ele vem com um código próprio: confere
  const esperado = integ?.secrets?.webhook_token;
  if (esperado && req.headers.get("asaas-access-token") !== esperado) { await ev("aviso", "aviso_suspeito", "aviso com código de segurança errado; ignorado"); return ok({ ignorado: true }); }
  const base = (integ?.config?.ambiente || "teste") !== "producao" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  const r = await fetch(`${base}/payments/${encodeURIComponent(body.payment.id)}`, { headers: { access_token: chave, "User-Agent": "Lumos" } });
  if (!r.ok) return ok({ ignorado: `consulta ${r.status}` });
  const p = await r.json();
  if (!["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status) || !p.paymentLink) return ok({ ignorado: p.status });
  const { data: pedidos } = await supabase.from("sales_orders").select("id, total, status, pagamento").eq("owner_id", ownerId).eq("pagamento->>link_id", p.paymentLink).limit(1);
  const pedido = pedidos?.[0];
  if (!pedido) { await ev("aviso", "aviso_sem_pedido", `pagamento ${p.id} sem pedido correspondente nesta loja`); return ok({ ignorado: "pedido" }); }
  if (pedido.status === "pago") return ok({ ja: true });
  if (!valorConfere(p.value, pedido.total)) { await ev("aviso", "aviso_suspeito", `valor pago (R$ ${p.value}) menor que o do pedido; ignorado`); return ok({ ignorado: "valor" }); }
  const metodo = p.billingType === "CREDIT_CARD" ? "cartao" : p.billingType === "DEBIT_CARD" ? "debito" : p.billingType === "BOLETO" ? "boleto" : "pix";
  await supabase.from("sales_orders").update({ pagamento: { ...(pedido.pagamento || {}), provedor_pagamento_id: String(p.id) } }).eq("id", pedido.id);
  await confirmar(pedido.id, metodo, p.installmentCount || null);
  // Link pago: desativa para não receber um segundo pagamento
  await fetch(`${base}/paymentLinks/${encodeURIComponent(p.paymentLink)}`, { method: "DELETE", headers: { access_token: chave, "User-Agent": "Lumos" } }).catch(() => {});
  return ok();
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const p = url.searchParams.get("p");
    if (p === "mercadopago") return await mercadoPago(url, body);
    if (p === "asaas") return await asaas(url, body, req);
    return ok({ ignorado: "provedor" });
  } catch (e) {
    console.error("pagamentos:", e);
    await registrarEvento({ tipo: "erro", acao: "erro_inesperado", msg: String((e as Error)?.stack || e).slice(0, 500) });
    // Responde 200 para o provedor não ficar repetindo um aviso que vai falhar sempre; o erro fica no log
    return ok({ erro: true });
  }
});
