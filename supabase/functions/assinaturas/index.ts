// Edge Function: assinaturas (mensalidade da Lumos e cupons)
// Deploy com "Enforce JWT verification" DESLIGADO: o Mercado Pago chama o aviso sem login.
// Quem está logado é conferido aqui dentro, ação por ação.
// Secrets: LUMOS_MP_TOKEN (Access Token da conta Mercado Pago da Lumos), SITE_URL,
//          LUMOS_PLANO_VALOR (opcional, padrão 1794.90).
// Segurança: nenhum aviso é aceito como verdade; todo pagamento é conferido direto no Mercado Pago.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_TOKEN = Deno.env.get("LUMOS_MP_TOKEN") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://www.lumos.tec.br").replace(/\/$/, "");
const VALOR_PLANO = Number(Deno.env.get("LUMOS_PLANO_VALOR") || 1794.9);
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const ORIGEM_LOG = "assinaturas";
// ---------- Histórico do sistema (Painel Admin): o essencial de cada passo, nunca chaves ou conversas ----------
// deno-lint-ignore no-explicit-any
async function registrarEvento(e: { owner?: string | null; tipo?: "info" | "aviso" | "erro"; acao: string; msg?: string; dados?: any; ref?: string | null }) {
  try {
    await supabase.from("eventos_sistema").insert({ owner_id: e.owner || null, origem: ORIGEM_LOG, tipo: e.tipo || "info", acao: e.acao,
      mensagem: e.msg ? String(e.msg).slice(0, 500) : null, dados: e.dados ?? null, ref_id: e.ref ? String(e.ref) : null });
  } catch (_) { /* o histórico nunca pode derrubar o fluxo principal */ }
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somarMes = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); const dia = d.getUTCDate(); d.setUTCMonth(d.getUTCMonth() + 1); if (d.getUTCDate() < dia) d.setUTCDate(0); return d.toISOString().slice(0, 10); };

async function mp(method: string, path: string, body?: unknown) {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    method, headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", ...(method === "POST" ? { "X-Idempotency-Key": crypto.randomUUID() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}

// ---------- Cupom ----------
// deno-lint-ignore no-explicit-any
export function aplicarCupom(cupom: any, base: number, dataHoje: string) {
  if (!cupom || !cupom.ativo) return { erro: "Cupom inválido." };
  if (cupom.validade && cupom.validade < dataHoje) return { erro: "Este cupom expirou." };
  if (cupom.limite_usos && cupom.usos >= cupom.limite_usos) return { erro: "Este cupom já atingiu o limite de usos." };
  const desconto = cupom.tipo === "percentual" ? base * Math.min(100, Number(cupom.valor)) / 100 : Number(cupom.valor);
  const valor = r2(Math.max(0, base - desconto));
  if (valor < 1) return { erro: "Este cupom não pode zerar a mensalidade." };
  const quanto = cupom.tipo === "percentual" ? `${Number(cupom.valor).toLocaleString("pt-BR")}% de desconto` : `R$ ${Number(cupom.valor).toFixed(2).replace(".", ",")} de desconto`;
  const quando = cupom.meses ? (cupom.meses === 1 ? "na primeira mensalidade" : `nas ${cupom.meses} primeiras mensalidades`) : "em todas as mensalidades";
  return { valor, meses: cupom.meses ?? null, texto: `${quanto} ${quando}` };
}
async function buscarCupom(codigo: string) {
  const c = String(codigo || "").trim().toUpperCase();
  if (!c) return null;
  const { data } = await supabase.from("cupons").select("*").eq("codigo", c).maybeSingle();
  return data;
}

// ---------- Registrar um pagamento aprovado ----------
// deno-lint-ignore no-explicit-any
async function registrar(assin: any, pag: { id: string; valor: number; forma: string; data: string }) {
  const { error } = await supabase.from("assinatura_pagamentos").insert({ assinatura_id: assin.id, mp_payment_id: pag.id, valor: pag.valor, forma: pag.forma, pago_em: pag.data });
  if (error) return false;   // já registrado (o mesmo pagamento não conta duas vezes)
  const { count } = await supabase.from("assinatura_pagamentos").select("id", { count: "exact", head: true }).eq("assinatura_id", assin.id);
  const base = assin.proximo_vencimento && assin.proximo_vencimento > hoje() ? assin.proximo_vencimento : hoje();
  const campos: Record<string, unknown> = { status: "ativa", ultimo_pagamento: pag.data, proximo_vencimento: somarMes(base), updated_at: new Date().toISOString() };
  // Cupom: conta o uso no primeiro pagamento e acaba o desconto depois dos meses combinados
  if (assin.cupom_codigo && count === 1) {
    const c = await buscarCupom(assin.cupom_codigo);
    if (c) await supabase.from("cupons").update({ usos: (c.usos || 0) + 1 }).eq("id", c.id);
  }
  if (assin.cupom_codigo && assin.meses_desconto_restantes != null) {
    const restam = Math.max(0, assin.meses_desconto_restantes - 1);
    campos.meses_desconto_restantes = restam;
    if (restam === 0 && Number(assin.valor_mensal) !== Number(assin.valor_base)) {
      campos.valor_mensal = assin.valor_base;
      if (assin.forma === "cartao" && assin.mp_preapproval_id) await mp("PUT", `/preapproval/${assin.mp_preapproval_id}`, { auto_recurring: { transaction_amount: Number(assin.valor_base), currency_id: "BRL" } });
    }
  }
  await supabase.from("assinaturas").update(campos).eq("id", assin.id);
  await registrarEvento({ owner: assin.user_id, acao: "mensalidade_paga", msg: `Mensalidade paga: R$ ${Number(pag.valor).toFixed(2)} (${pag.forma}). Próximo vencimento: ${campos.proximo_vencimento}`, dados: { valor: pag.valor, forma: pag.forma, pagamento: pag.id }, ref: assin.id });
  // Libera a conta do cliente (sem mexer em quem é da equipe Lumos)
  const { data: perfil } = await supabase.from("profiles").select("role").eq("id", assin.user_id).maybeSingle();
  if (!perfil || ["user", "cliente"].includes(perfil.role)) await supabase.from("profiles").update({ status: "ativo", role: "cliente" }).eq("id", assin.user_id);
  return true;
}
const formaMP = (p: any) => p.payment_type_id === "credit_card" ? "cartao" : p.payment_type_id === "ticket" ? "boleto" : p.payment_type_id === "debit_card" ? "debito" : "pix";

// Confere no Mercado Pago os pagamentos de uma assinatura (para o aviso que se perdeu, ou o retorno do checkout)
// deno-lint-ignore no-explicit-any
async function conferir(assin: any) {
  let novos = 0;
  for (const ref of [assin.id, `assin:${assin.id}`]) {
    const r = await mp("GET", `/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc&limit=30`);
    for (const p of r.d?.results || []) {
      if (p.status !== "approved" || Number(p.transaction_amount) + 0.02 < Number(assin.valor_mensal) * 0.5) continue;
      if (await registrar(assin, { id: String(p.id), valor: Number(p.transaction_amount), forma: formaMP(p), data: p.date_approved || new Date().toISOString() })) novos++;
      const { data } = await supabase.from("assinaturas").select("*").eq("id", assin.id).maybeSingle(); if (data) assin = data;
    }
  }
  if (assin.forma === "cartao" && assin.mp_preapproval_id) {
    // Faturas da assinatura no cartão (cobranças mensais automáticas)
    const f = await mp("GET", `/authorized_payments/search?preapproval_id=${encodeURIComponent(assin.mp_preapproval_id)}`);
    for (const fat of f.d?.results || []) {
      const pid = fat.payment?.id; if (!pid || fat.payment?.status !== "approved") continue;
      if (await registrar(assin, { id: String(pid), valor: Number(fat.transaction_amount || assin.valor_mensal), forma: "cartao", data: fat.debit_date || fat.date_created || new Date().toISOString() })) novos++;
      const { data } = await supabase.from("assinaturas").select("*").eq("id", assin.id).maybeSingle(); if (data) assin = data;
    }
    const r = await mp("GET", `/preapproval/${assin.mp_preapproval_id}`);
    if (r.ok && r.d?.status === "cancelled" && assin.status !== "cancelada") await supabase.from("assinaturas").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", assin.id);
  }
  // Mensalidade vencida há mais de 3 dias: atrasada (a conta continua ativa; a equipe Lumos decide)
  const { data: atual } = await supabase.from("assinaturas").select("*").eq("id", assin.id).maybeSingle();
  if (atual?.status === "ativa" && atual.proximo_vencimento && atual.proximo_vencimento < new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10)) {
    await supabase.from("assinaturas").update({ status: "atrasada" }).eq("id", assin.id); atual.status = "atrasada";
  }
  return { novos, assinatura: atual };
}

// Link de pagamento de uma mensalidade (Pix ou boleto, ou cartão sem recorrência)
// deno-lint-ignore no-explicit-any
async function linkMensalidade(assin: any) {
  const r = await mp("POST", "/checkout/preferences", {
    items: [{ id: "lumos_mensal", title: "Lumos: mensalidade do sistema", quantity: 1, currency_id: "BRL", unit_price: Number(assin.valor_mensal) }],
    external_reference: `assin:${assin.id}`,
    notification_url: `${SUPABASE_URL}/functions/v1/assinaturas?aviso=1`,
    back_urls: { success: `${SITE_URL}/plans.html?assinatura=retorno`, pending: `${SITE_URL}/plans.html?assinatura=retorno`, failure: `${SITE_URL}/plans.html` },
    auto_return: "approved",
    payment_methods: { installments: 1 },
    expires: true, expiration_date_to: new Date(Date.now() + 5 * 86400e3).toISOString(),
  });
  if (!r.ok) return { erro: `O Mercado Pago recusou: ${r.d?.message || r.status}.` };
  return { link: MP_TOKEN.startsWith("TEST-") ? (r.d.sandbox_init_point || r.d.init_point) : r.d.init_point };
}

async function usuario(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await supabase.auth.getUser(jwt);
  return data?.user || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // ---------- Aviso do Mercado Pago (pagamento ou assinatura) ----------
    if (url.searchParams.get("aviso") || body?.type || body?.topic) {
      if (!MP_TOKEN) return json({ ok: true });
      const tipo = body?.type || body?.topic || url.searchParams.get("topic") || url.searchParams.get("type") || "";
      const id = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
      let assin = null;
      if (tipo === "payment" && id) {
        const r = await mp("GET", `/v1/payments/${encodeURIComponent(id)}`);
        const ref = String(r.d?.external_reference || "").replace(/^assin:/, "");
        if (ref) ({ data: assin } = await supabase.from("assinaturas").select("*").eq("id", ref).maybeSingle());
        if (!assin && r.d?.metadata?.preapproval_id) ({ data: assin } = await supabase.from("assinaturas").select("*").eq("mp_preapproval_id", r.d.metadata.preapproval_id).maybeSingle());
        // Pagamento conferido no Mercado Pago: registra direto (aprovado e com valor compatível)
        if (assin && r.d?.status === "approved" && Number(r.d.transaction_amount) + 0.02 >= Number(assin.valor_mensal) * 0.5)
          await registrar(assin, { id: String(r.d.id), valor: Number(r.d.transaction_amount), forma: formaMP(r.d), data: r.d.date_approved || new Date().toISOString() });
        if (assin) ({ data: assin } = await supabase.from("assinaturas").select("*").eq("id", assin.id).maybeSingle());
      } else if (tipo.startsWith("subscription") && id) {
        ({ data: assin } = await supabase.from("assinaturas").select("*").eq("mp_preapproval_id", id).maybeSingle());
        if (!assin && tipo === "subscription_authorized_payment") {
          const a = await mp("GET", `/authorized_payments/${encodeURIComponent(id)}`);
          if (a.d?.preapproval_id) ({ data: assin } = await supabase.from("assinaturas").select("*").eq("mp_preapproval_id", a.d.preapproval_id).maybeSingle());
        }
      }
      if (assin) await conferir(assin);
      return json({ ok: true });
    }

    const acao = String(body.action || "");

    // ---------- Público: plano e cupom ----------
    if (acao === "plano") return json({ valor: VALOR_PLANO, nome: "Lumos completo", configurado: !!MP_TOKEN });
    if (acao === "cupom") {
      const r: any = aplicarCupom(await buscarCupom(body.codigo), VALOR_PLANO, hoje());
      return r.erro ? json({ error: r.erro }, 400) : json(r);
    }

    const user = await usuario(req);
    if (!user) return json({ error: "Entre na sua conta para continuar." }, 401);
    const { data: perfil } = await supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
    const staff = ["admin", "suporte"].includes(perfil?.role || "");

    // ---------- Cliente ----------
    if (acao === "minha") {
      let { data: a } = await supabase.from("assinaturas").select("*").eq("user_id", user.id).maybeSingle();
      if (a && MP_TOKEN && body.conferir) a = (await conferir(a)).assinatura;
      return json({ assinatura: a || null, valor_plano: VALOR_PLANO, configurado: !!MP_TOKEN });
    }
    if (acao === "assinar") {
      if (!MP_TOKEN) return json({ error: "A assinatura ainda não está disponível. Fale com a Lumos." }, 503);
      if (!body.aceite) return json({ error: "É preciso aceitar os Termos de Uso e a Política de Privacidade." }, 400);
      const doc = digitos(body.cpf_cnpj);
      if (doc.length !== 11 && doc.length !== 14) return json({ error: "Informe um CPF (11 números) ou CNPJ (14 números)." }, 400);
      const forma = body.forma === "cartao" ? "cartao" : "pix_boleto";
      let valor = VALOR_PLANO, meses: number | null = null, cupom: string | null = null;
      if (body.cupom) {
        const c = await buscarCupom(body.cupom); const r: any = aplicarCupom(c, VALOR_PLANO, hoje());
        if (r.erro) return json({ error: r.erro }, 400);
        valor = r.valor; meses = r.meses; cupom = c.codigo;
      }
      const { data: atual } = await supabase.from("assinaturas").select("*").eq("user_id", user.id).maybeSingle();
      if (atual && ["ativa", "atrasada"].includes(atual.status) && atual.forma === "cartao" && forma === "cartao") return json({ error: "Sua assinatura no cartão já está ativa." }, 400);
      const dados = { negocio: String(body.negocio || "").slice(0, 120), cpf_cnpj: doc, telefone: digitos(body.telefone).slice(0, 13), aceite_termos_em: new Date().toISOString() };
      const linha = { user_id: user.id, valor_base: VALOR_PLANO, valor_mensal: valor, cupom_codigo: cupom, meses_desconto_restantes: meses, forma, status: atual?.status === "ativa" ? "ativa" : "pendente", dados, updated_at: new Date().toISOString() };
      const { data: assin, error } = await supabase.from("assinaturas").upsert(linha, { onConflict: "user_id" }).select().single();
      if (error) return json({ error: error.message }, 500);
      if (forma === "cartao") {
        const r = await mp("POST", "/preapproval", {
          reason: "Lumos: assinatura mensal do sistema", external_reference: assin.id,
          payer_email: String(body.email_mp || user.email || "").trim(),
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: valor, currency_id: "BRL" },
          back_url: `${SITE_URL}/plans.html?assinatura=retorno`, status: "pending",
        });
        if (!r.ok) { await registrarEvento({ owner: user.id, tipo: "erro", acao: "assinatura_falhou", msg: `Mercado Pago recusou a assinatura no cartão: ${r.d?.message || r.status}`, ref: assin.id }); return json({ error: `O Mercado Pago recusou a assinatura: ${r.d?.message || r.status}.` }, 502); }
        await registrarEvento({ owner: user.id, acao: "assinatura_iniciada", msg: `Assinatura no cartão iniciada: R$ ${valor.toFixed(2)}/mês${cupom ? ` (cupom ${cupom})` : ""}`, ref: assin.id });
        await supabase.from("assinaturas").update({ mp_preapproval_id: r.d.id }).eq("id", assin.id);
        return json({ link: r.d.init_point });
      }
      const l = await linkMensalidade(assin);
      await registrarEvento({ owner: user.id, tipo: l.erro ? "erro" : "info", acao: l.erro ? "assinatura_falhou" : "assinatura_iniciada", msg: l.erro || `Assinatura no Pix/boleto iniciada: R$ ${valor.toFixed(2)}/mês${cupom ? ` (cupom ${cupom})` : ""}`, ref: assin.id });
      return l.erro ? json({ error: l.erro }, 502) : json(l);
    }
    if (acao === "pagar_mes") {
      const { data: a } = await supabase.from("assinaturas").select("*").eq("user_id", user.id).maybeSingle();
      if (!a) return json({ error: "Assinatura não encontrada." }, 404);
      const l = await linkMensalidade(a);
      return l.erro ? json({ error: l.erro }, 502) : json(l);
    }

    // ---------- Equipe Lumos (Painel Admin) ----------
    if (!staff) return json({ error: "Sem permissão." }, 403);
    if (acao === "admin_listar") {
      const [{ data: cupons }, { data: assins }, { data: perfis }] = await Promise.all([
        supabase.from("cupons").select("*").order("created_at", { ascending: false }),
        supabase.from("assinaturas").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, email, nome"),
      ]);
      const mapa = Object.fromEntries((perfis || []).map((p) => [p.id, p]));
      return json({ cupons: cupons || [], assinaturas: (assins || []).map((a) => ({ ...a, email: mapa[a.user_id]?.email || "", nome: mapa[a.user_id]?.nome || "" })), valor_plano: VALOR_PLANO, configurado: !!MP_TOKEN });
    }
    if (acao === "cupom_salvar") {
      const c = body.cupom || {};
      const codigo = String(c.codigo || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (codigo.length < 3) return json({ error: "O código precisa ter ao menos 3 letras ou números." }, 400);
      if (!["percentual", "valor"].includes(c.tipo) || !(Number(c.valor) > 0)) return json({ error: "Informe o tipo e o valor do desconto." }, 400);
      if (c.tipo === "percentual" && Number(c.valor) >= 100) return json({ error: "O desconto em % precisa ser menor que 100." }, 400);
      const linha = { codigo, tipo: c.tipo, valor: r2(c.valor), meses: c.meses ? Math.max(1, Math.round(c.meses)) : null, validade: c.validade || null,
        limite_usos: c.limite_usos ? Math.max(1, Math.round(c.limite_usos)) : null, ativo: c.ativo !== false, descricao: String(c.descricao || "").slice(0, 200) || null };
      const q = c.id ? supabase.from("cupons").update(linha).eq("id", c.id) : supabase.from("cupons").insert(linha);
      const { error } = await q;
      if (error) return json({ error: /duplicate|unique/.test(error.message) ? "Já existe um cupom com esse código." : error.message }, 400);
      return json({ ok: true });
    }
    if (acao === "cupom_ativo") {
      await supabase.from("cupons").update({ ativo: !!body.ativo }).eq("id", String(body.id || ""));
      return json({ ok: true });
    }
    if (acao === "assinatura_conferir" || acao === "assinatura_cancelar") {
      const { data: a } = await supabase.from("assinaturas").select("*").eq("id", String(body.id || "")).maybeSingle();
      if (!a) return json({ error: "Assinatura não encontrada." }, 404);
      if (acao === "assinatura_cancelar") {
        if (a.mp_preapproval_id) await mp("PUT", `/preapproval/${a.mp_preapproval_id}`, { status: "cancelled" });
        await supabase.from("assinaturas").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", a.id);
        return json({ ok: true });
      }
      return json(await conferir(a));
    }
    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("assinaturas:", e);
    await registrarEvento({ tipo: "erro", acao: "erro_inesperado", msg: String((e as Error)?.stack || e).slice(0, 500) });
    return json({ error: "Erro inesperado. Tente de novo em instantes." }, 500);
  }
});
