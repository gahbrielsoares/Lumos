// Edge Function: entregas (Delivery)
// Deploy com "Enforce JWT verification" DESLIGADO: o entregador e o cliente (rastreio) usam links com código, sem login.
// A equipe é conferida aqui dentro pelo login (dono ou funcionário com a aba Delivery).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") || "https://www.lumos.tec.br").replace(/\/$/, "");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const ORIGEM_LOG = "entregas";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const novoToken = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
const HORAS_LINK = 8;

// deno-lint-ignore no-explicit-any
async function registrarEvento(e: { owner?: string | null; tipo?: "info" | "aviso" | "erro"; acao: string; msg?: string; dados?: any; ref?: string | null }) {
  try { await supabase.from("eventos_sistema").insert({ owner_id: e.owner || null, origem: ORIGEM_LOG, tipo: e.tipo || "info", acao: e.acao, mensagem: e.msg?.slice(0, 500) || null, dados: e.dados ?? null, ref_id: e.ref || null }); } catch (_) { /* nunca derruba o fluxo */ }
}
// Chama a função de pedidos com a chave de serviço (mensagens ao cliente, etapas da cozinha, pagamento)
async function orders(body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/orders`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) console.error("entregas -> orders:", body.action, r.status, JSON.stringify(d).slice(0, 200));
  return { ok: r.ok, d };
}
// WhatsApp da loja (mesmo número do atendimento) para falar com o entregador
// deno-lint-ignore no-explicit-any
async function enviarWhatsApp(ownerId: string, agentId: string | null, para: string, texto: string) {
  // deno-lint-ignore no-explicit-any
  let wa: any = null;
  if (agentId) ({ data: wa } = await supabase.from("whatsapp_provider_config").select("*").eq("agent_id", agentId).maybeSingle());
  if (!wa) {
    const { data: ags } = await supabase.from("agents").select("id").eq("owner_id", ownerId);
    for (const a of ags || []) { const { data } = await supabase.from("whatsapp_provider_config").select("*").eq("agent_id", a.id).maybeSingle(); if (data?.base_url && data?.api_key) { wa = data; break; } }
  }
  if (!wa?.base_url || !wa?.api_key) return false;
  const numero = digitos(para).length <= 11 ? `55${digitos(para)}` : digitos(para);
  const r = wa.vendor === "evolution"
    ? await fetch(`${wa.base_url}/message/sendText/${wa.instance_id}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: wa.api_key }, body: JSON.stringify({ number: numero, text: texto }) })
    : await fetch(`${wa.base_url}/send/text`, { method: "POST", headers: { "Content-Type": "application/json", token: wa.api_key }, body: JSON.stringify({ number: numero, text: texto }) });
  return r.ok;
}
const enderecoTexto = (e: any) => [e?.rua && `${e.rua}${e.numero ? `, ${e.numero}` : ""}`, e?.complemento, e?.bairro, e?.cidade].filter(Boolean).join(" - ");
const linkMapa = (e: any) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([e?.rua && `${e.rua} ${e.numero || ""}`, e?.bairro, e?.cidade, e?.cep].filter(Boolean).join(", "))}`;

// Link ativo do entregador (cria um novo de 8 horas se não houver)
async function linkAtivo(ownerId: string, entregadorId: string, forcarNovo = false) {
  if (!forcarNovo) {
    const { data } = await supabase.from("entregador_links").select("*").eq("entregador_id", entregadorId).gt("expira_em", new Date().toISOString()).order("expira_em", { ascending: false }).limit(1).maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase.from("entregador_links").insert({ token: novoToken(), owner_id: ownerId, entregador_id: entregadorId, expira_em: new Date(Date.now() + HORAS_LINK * 3600e3).toISOString() }).select().single();
  return data;
}
const urlEntregador = (token: string) => `${SITE_URL}/entregador.html?t=${token}`;

// ---------- Equipe ----------
async function equipe(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data } = await supabase.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: m } = await supabase.from("team_members").select("owner_id, allowed_tabs, ativo").eq("user_id", data.user.id).maybeSingle();
  if (m) return m.ativo !== false && (m.allowed_tabs || []).includes("delivery") ? { owner: m.owner_id, user: data.user.id } : null;
  return { owner: data.user.id, user: data.user.id };
}

// ---------- Entregador (link com código) ----------
async function entregadorDoLink(token: string) {
  if (!/^[a-f0-9]{40}$/.test(token || "")) return null;
  const { data: l } = await supabase.from("entregador_links").select("*").eq("token", token).maybeSingle();
  if (!l || new Date(l.expira_em) < new Date()) return null;
  const { data: e } = await supabase.from("entregadores").select("*").eq("id", l.entregador_id).maybeSingle();
  return e && e.ativo !== false ? { link: l, entregador: e } : null;
}
// deno-lint-ignore no-explicit-any
async function entregaDoEntregador(ent: any, entregaId: string) {
  const { data } = await supabase.from("entregas").select("*").eq("id", entregaId).eq("entregador_id", ent.id).maybeSingle();
  return data;
}
async function pedido(id: string) {
  const { data } = await supabase.from("sales_orders").select("*").eq("id", id).maybeSingle();
  return data;
}
async function ticketCozinha(salesOrderId: string) {
  const { data } = await supabase.from("orders").select("id, status").eq("sales_order_id", salesOrderId).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const acao = String(body.action || "");

    // ================= Cliente: rastreio do pedido =================
    if (acao === "rastreio") {
      if (!/^[a-f0-9]{40}$/.test(String(body.r || ""))) return json({ error: "Link inválido." }, 404);
      const { data: en } = await supabase.from("entregas").select("*").eq("rastreio_token", body.r).maybeSingle();
      if (!en) return json({ error: "Link inválido." }, 404);
      if (en.entregue_em && Date.now() - new Date(en.entregue_em).getTime() > 2 * 3600e3) return json({ error: "Este acompanhamento já foi encerrado." }, 410);
      const so = await pedido(en.sales_order_id);
      const { data: ent } = en.entregador_id ? await supabase.from("entregadores").select("nome, veiculo").eq("id", en.entregador_id).maybeSingle() : { data: null };
      let posicao = null;
      if (en.entregador_id && ["em_rota", "chegou"].includes(en.etapa)) {
        const { data: l } = await supabase.from("entregador_links").select("lat, lng, posicao_em").eq("entregador_id", en.entregador_id).gt("expira_em", new Date().toISOString()).not("lat", "is", null).order("posicao_em", { ascending: false }).limit(1).maybeSingle();
        if (l?.lat) posicao = l;
      }
      return json({ numero: so?.numero, etapa: en.etapa, entregador: ent ? { nome: String(ent.nome).split(" ")[0], veiculo: ent.veiculo } : null, posicao, saiu_em: en.saiu_em, entregue_em: en.entregue_em });
    }

    // ================= Entregador =================
    if (acao.startsWith("motoboy_")) {
      const ctx = await entregadorDoLink(String(body.t || ""));
      if (!ctx) return json({ error: "Este link expirou. Peça um novo ao estabelecimento." }, 401);
      const { link, entregador: ent } = ctx;

      if (acao === "motoboy_posicao") {
        const lat = Number(body.lat), lng = Number(body.lng);
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "Posição inválida." }, 400);
        await supabase.from("entregador_links").update({ lat, lng, precisao: Number(body.precisao) || null, posicao_em: new Date().toISOString(), ...(link.autorizado_em ? {} : { autorizado_em: new Date().toISOString() }) }).eq("token", link.token);
        return json({ ok: true });
      }
      if (acao === "motoboy_estado") {
        const { data: ens } = await supabase.from("entregas").select("*").eq("entregador_id", ent.id).in("etapa", ["oferecida", "em_rota", "chegou"]).order("oferecida_em");
        const lista = [];
        for (const en of ens || []) {
          const so = await pedido(en.sales_order_id); if (!so) continue;
          const naEntrega = so.pagamento?.preferencia === "na_entrega" && so.status !== "pago";
          lista.push({ id: en.id, etapa: en.etapa, numero: so.numero, cliente: so.cliente?.nome || "Cliente", telefone: so.cliente?.telefone || null,
            endereco: enderecoTexto(so.entrega?.endereco), referencia: so.entrega?.endereco?.referencia || null, mapa: linkMapa(so.entrega?.endereco),
            itens: (so.itens || []).filter((i: any) => !i.taxa).map((i: any) => `${i.quantidade}x ${i.nome}`),
            cobrar: naEntrega ? Number(so.total) : 0, troco: naEntrega ? so.pagamento?.troco || null : null, forma: naEntrega ? so.pagamento?.detalhe || null : null });
        }
        return json({ entregador: { nome: ent.nome }, expira_em: link.expira_em, autorizado: !!link.autorizado_em, entregas: lista });
      }
      const en = await entregaDoEntregador(ent, String(body.entrega_id || ""));
      if (!en) return json({ error: "Entrega não encontrada." }, 404);
      const so = await pedido(en.sales_order_id);
      const agora = new Date().toISOString();

      if (acao === "motoboy_aceitar") {
        if (en.etapa !== "oferecida") return json({ ok: true });
        if (!en.rastreio_token) en.rastreio_token = novoToken();
        await supabase.from("entregas").update({ etapa: "em_rota", saiu_em: agora, rastreio_token: en.rastreio_token, updated_at: agora }).eq("id", en.id);
        const t = await ticketCozinha(en.sales_order_id);
        const aPagar = so?.pagamento?.preferencia === "na_entrega" && so.status !== "pago" ? `\n💵 Valor a pagar na entrega: *${brl(so.total)}*` : "";
        const texto = `🛵 Seu pedido #${so?.numero} saiu para entrega com ${String(ent.nome).split(" ")[0]}!${aPagar}\n\n📍 Acompanhe no mapa: ${SITE_URL}/rastreio.html?r=${en.rastreio_token}`;
        if (t) await orders({ action: "kitchen_status", ticket_id: t.id, status: "saiu_entrega", texto });
        else await orders({ action: "notify_customer", order_id: en.sales_order_id, texto });
        await registrarEvento({ owner: en.owner_id, acao: "saiu_entrega", msg: `Pedido #${so?.numero} saiu para entrega com ${ent.nome}`, ref: en.sales_order_id });
        return json({ ok: true });
      }
      if (acao === "motoboy_recusar") {
        if (!["oferecida"].includes(en.etapa)) return json({ error: "Esta entrega já foi aceita." }, 409);
        await supabase.from("entregas").update({ etapa: "aguardando_entregador", entregador_id: null, recusas: [...(en.recusas || []), { entregador: ent.nome, em: agora }], updated_at: agora }).eq("id", en.id);
        await registrarEvento({ owner: en.owner_id, tipo: "aviso", acao: "entrega_recusada", msg: `${ent.nome} recusou a entrega do pedido #${so?.numero}. Escolha outro entregador.`, ref: en.sales_order_id });
        return json({ ok: true });
      }
      if (acao === "motoboy_cheguei") {
        await supabase.from("entregas").update({ etapa: "chegou", chegou_em: agora, updated_at: agora }).eq("id", en.id);
        await orders({ action: "notify_customer", order_id: en.sales_order_id, texto: `📍 ${String(ent.nome).split(" ")[0]} chegou com o seu pedido #${so?.numero}! Pode ir recebê-lo. 😊` });
        return json({ ok: true });
      }
      if (acao === "motoboy_entregue") {
        const naEntrega = so?.pagamento?.preferencia === "na_entrega" && so.status === "aguardando_pagamento";
        const forma = ["dinheiro", "pix", "cartao", "debito"].includes(body.forma) ? body.forma : "dinheiro";
        if (naEntrega && !body.recebido) return json({ error: "Confirme que recebeu o pagamento do cliente." }, 400);
        await supabase.from("entregas").update({ etapa: "entregue", entregue_em: agora, updated_at: agora,
          ...(naEntrega ? { recebido_na_entrega: Number(so.total), forma_na_entrega: forma } : {}) }).eq("id", en.id);
        if (naEntrega) await orders({ action: "provider_paid", order_id: en.sales_order_id, metodo: forma });
        const t = await ticketCozinha(en.sales_order_id);
        if (t) await orders({ action: "kitchen_status", ticket_id: t.id, status: "entregue" });
        await registrarEvento({ owner: en.owner_id, acao: "entregue", msg: `Pedido #${so?.numero} entregue por ${ent.nome}${naEntrega ? `, recebeu ${brl(so.total)} (${forma})` : ""}`, ref: en.sales_order_id });
        return json({ ok: true });
      }
      return json({ error: "Ação desconhecida." }, 400);
    }

    // ================= Equipe (painel Delivery) =================
    const eq = await equipe(req);
    if (!eq) return json({ error: "Sem permissão." }, 403);
    const meuPedido = async (id: string) => { const so = await pedido(id); return so && so.owner_id === eq.owner ? so : null; };

    if (acao === "recusar") {
      const so = await meuPedido(String(body.order_id || "")); if (!so) return json({ error: "Pedido não encontrado." }, 404);
      const texto = String(body.texto || "").trim().slice(0, 1500);
      if (!texto) return json({ error: "Escreva a mensagem para o cliente." }, 400);
      if (!["aguardando_aprovacao", "aguardando_pagamento"].includes(so.status)) return json({ error: "Este pedido já foi pago ou encerrado." }, 409);
      await orders({ action: "notify_customer", order_id: so.id, texto });
      await supabase.from("sales_orders").update({ status: "cancelado" }).eq("id", so.id);
      if (so.lead_id) await supabase.from("leads").update({ orcamento: null }).eq("id", so.lead_id);
      await registrarEvento({ owner: eq.owner, tipo: "aviso", acao: "pedido_recusado", msg: `Pedido #${so.numero} não aceito: ${texto.slice(0, 160)}`, ref: so.id });
      return json({ ok: true });
    }
    if (acao === "atribuir") {
      const so = await meuPedido(String(body.order_id || "")); if (!so) return json({ error: "Pedido não encontrado." }, 404);
      const { data: ent } = await supabase.from("entregadores").select("*").eq("id", String(body.entregador_id || "")).eq("owner_id", eq.owner).maybeSingle();
      if (!ent || ent.ativo === false) return json({ error: "Entregador não encontrado." }, 404);
      const { data: atual } = await supabase.from("entregas").select("*").eq("sales_order_id", so.id).maybeSingle();
      if (atual && ["em_rota", "chegou", "entregue"].includes(atual.etapa)) return json({ error: "Esta entrega já saiu." }, 409);
      const agora = new Date().toISOString();
      const linha = { owner_id: eq.owner, sales_order_id: so.id, entregador_id: ent.id, etapa: "oferecida", oferecida_em: agora, taxa_entregador: Number(ent.taxa_entrega || 0), rastreio_token: atual?.rastreio_token || novoToken(), updated_at: agora };
      await supabase.from("entregas").upsert(linha, { onConflict: "sales_order_id" });
      const l = await linkAtivo(eq.owner, ent.id);
      const naEntrega = so.pagamento?.preferencia === "na_entrega" && so.status !== "pago";
      const msg = `🛵 *Nova entrega: pedido #${so.numero}*\n${so.cliente?.nome || "Cliente"}\n📍 ${enderecoTexto(so.entrega?.endereco) || so.entrega?.local || ""}${so.entrega?.endereco?.referencia ? `\nReferência: ${so.entrega.endereco.referencia}` : ""}${naEntrega ? `\n💵 Cobrar na entrega: *${brl(so.total)}*${so.pagamento?.troco ? ` (troco para ${so.pagamento.troco})` : ""}` : "\n✅ Já está pago"}\n\nAceite ou recuse aqui: ${urlEntregador(l.token)}`;
      const enviado = await enviarWhatsApp(eq.owner, so.agent_id, ent.telefone, msg);
      await registrarEvento({ owner: eq.owner, acao: "entrega_oferecida", msg: `Pedido #${so.numero} oferecido a ${ent.nome}${enviado ? "" : " (o WhatsApp não enviou: confira a conexão)"}`, ref: so.id });
      return json({ ok: true, enviado, link: urlEntregador(l.token) });
    }
    if (acao === "link_entregador") {
      const { data: ent } = await supabase.from("entregadores").select("*").eq("id", String(body.entregador_id || "")).eq("owner_id", eq.owner).maybeSingle();
      if (!ent) return json({ error: "Entregador não encontrado." }, 404);
      const l = await linkAtivo(eq.owner, ent.id, !!body.novo);
      let enviado = false;
      if (body.enviar) enviado = await enviarWhatsApp(eq.owner, null, ent.telefone,
        `Olá, ${String(ent.nome).split(" ")[0]}! 🛵 Este é o seu link de entregas de hoje (vale ${HORAS_LINK} horas):\n${urlEntregador(l.token)}\n\nAbra e permita a localização para o restaurante acompanhar as entregas.`);
      return json({ ok: true, link: urlEntregador(l.token), expira_em: l.expira_em, enviado });
    }
    if (acao === "finalizar") {   // retirada no balcão ou entrega sem entregador cadastrado
      const so = await meuPedido(String(body.order_id || "")); if (!so) return json({ error: "Pedido não encontrado." }, 404);
      const agora = new Date().toISOString();
      const retirada = so.entrega?.tipo === "retirada";
      await supabase.from("entregas").upsert({ owner_id: eq.owner, sales_order_id: so.id, etapa: retirada ? "retirado" : "entregue", entregue_em: agora, updated_at: agora }, { onConflict: "sales_order_id" });
      const t = await ticketCozinha(so.id);
      if (t) await orders({ action: "kitchen_status", ticket_id: t.id, status: "entregue" });
      return json({ ok: true });
    }
    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("entregas:", e);
    await registrarEvento({ tipo: "erro", acao: "erro_inesperado", msg: String((e as Error)?.stack || e).slice(0, 500) });
    return json({ error: "Erro inesperado." }, 500);
  }
});
