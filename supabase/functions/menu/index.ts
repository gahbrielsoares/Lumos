// Edge Function: menu
// Serve o cardápio digital da mesa (cardapio.html) e recebe o pedido.
//   get    -> dados da casa, da mesa e o cardápio (produtos por categoria, com foto leve)
//   submit -> cria o pedido na Cozinha e confirma no WhatsApp do cliente
// O acesso é pelo token do link enviado no WhatsApp (vale enquanto o cliente estiver na mesa).
// Deploy com "Enforce JWT verification" DESLIGADO (a página é pública).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const onlyDigits = (s: unknown) => String(s || "").replace(/\D/g, "");
const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Fotos do simulador têm versão leve (thumb) pra abrir rápido em internet fraca
const thumb = (url: string) => url?.includes("/img/simulador/restaurante/") && !url.includes("/thumb/")
  ? url.replace("/img/simulador/restaurante/", "/img/simulador/restaurante/thumb/")
  : url;

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
  if (!res.ok) console.error("Falha ao enviar:", res.status, await res.text());
  return res.ok;
}

async function loadByToken(token: string) {
  if (!token || token.length < 16) return null;
  const { data: lead } = await supabase.from("leads").select("*").eq("menu_token", token).maybeSingle();
  if (!lead) return null;
  const { data: agent } = await supabase.from("agents").select("*").eq("id", lead.agent_id).maybeSingle();
  return { lead, agent };
}

// deno-lint-ignore no-explicit-any
async function loadMenu(lead: any, agent: any) {
  const { data: raw } = await supabase
    .from("products")
    .select("id, name, description, price, photo_urls, agent_ids, segmento, product_categories(categories(name))")
    .eq("owner_id", lead.owner_id).eq("active", true)
    .order("created_at", { ascending: true });
  const products = (raw || []).filter((p) => {
    const ids: string[] = p.agent_ids || [];
    if (agent?.is_simulator) return ids.includes(agent.id) && (p.segmento || "materiais_construcao") === "restaurante";
    return !ids.length || ids.includes(lead.agent_id);
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || "",
    price: Number(p.price || 0),
    img: thumb((p.photo_urls || [])[0] || ""),
    // deno-lint-ignore no-explicit-any
    category: (p.product_categories || []).map((pc: any) => pc.categories?.name).filter(Boolean)[0] || "Cardápio",
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const ctx = await loadByToken(String(body.t || ""));
    if (!ctx) return json({ error: "Este cardápio expirou. Peça um novo no WhatsApp. 😊" }, 404);
    const { lead, agent } = ctx;
    if (!lead.table_session_id) return json({ error: "Sua mesa já foi encerrada. Se quiser pedir de novo, é só chamar no WhatsApp. 😊" }, 409);

    const { data: session } = await supabase.from("table_sessions").select("table_id, status").eq("id", lead.table_session_id).maybeSingle();
    const { data: table } = session ? await supabase.from("restaurant_tables").select("label").eq("id", session.table_id).maybeSingle() : { data: null };
    const { data: biz } = await supabase.from("business_config").select("business_name").eq("owner_id", lead.owner_id).maybeSingle();
    const loja = agent?.is_simulator ? "Lumos Bar & Cozinha" : biz?.business_name || agent?.name || "Cardápio";
    const whatsapp = onlyDigits(agent?.phone_number);

    if (body.action === "get") {
      return json({
        loja, mesa: table?.label || "Mesa", cliente: String(lead.dados_cliente?.nome || lead.name || "").split(" ")[0],
        whatsapp, products: await loadMenu(lead, agent),
      });
    }

    if (body.action === "submit") {
      const menu = await loadMenu(lead, agent);
      const byId = Object.fromEntries(menu.map((p) => [p.id, p]));
      // deno-lint-ignore no-explicit-any
      const items = (Array.isArray(body.items) ? body.items : []).map((i: any) => ({
        product: byId[i.id],
        qty: Math.min(50, Math.max(1, Math.round(Number(i.qty) || 1))),
        obs: String(i.obs || "").trim().slice(0, 140),
      })).filter((i: { product: unknown }) => i.product);
      if (!items.length) return json({ error: "Seu pedido está vazio." }, 400);
      if (items.length > 40) return json({ error: "Pedido grande demais para enviar de uma vez." }, 400);

      const total = Math.round(items.reduce((s: number, i: { product: { price: number }; qty: number }) => s + i.product.price * i.qty, 0) * 100) / 100;
      const { data: order, error } = await supabase.from("orders").insert({
        owner_id: lead.owner_id, table_session_id: lead.table_session_id, lead_id: lead.id, total, tipo: "mesa", status: "novo_pedido",
      }).select().single();
      if (error) { console.error("Erro ao criar pedido:", error.message); return json({ error: "Não consegui enviar agora. Tente de novo." }, 500); }

      await supabase.from("order_items").insert(items.map((i: { product: { id: string; name: string; price: number }; qty: number; obs: string }) => ({
        order_id: order.id, product_id: i.product.id, product_name: i.product.name, quantity: i.qty, unit_price: i.product.price, observacao: i.obs || null,
      })));

      const lista = items.map((i: { product: { name: string }; qty: number; obs: string }) => `• ${i.qty}x ${i.product.name}${i.obs ? ` _(${i.obs})_` : ""}`).join("\n");
      const msg = `✅ *Pedido enviado para a cozinha!*\n${table?.label || "Mesa"}\n\n${lista}\n\nSubtotal: ${brl(total)}\nEm breve o atendente leva até você. 🍽️\nQuer mais alguma coisa? É só pedir o *cardápio* de novo.`;
      await supabase.from("messages").insert({ lead_id: lead.id, direction: "out", sender: "sistema", text: msg });
      const { data: wa } = await supabase.from("whatsapp_provider_config").select("*").eq("agent_id", lead.agent_id).maybeSingle();
      await sendText(wa, onlyDigits(lead.phone), msg);
      await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", lead.id);

      console.log("Pedido pelo cardápio:", table?.label, "total", total);
      return json({ ok: true, total, whatsapp });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado. Tente de novo." }, 500);
  }
});
