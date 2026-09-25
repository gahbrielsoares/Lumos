// Edge Function: send-message
// O vendedor responde o cliente pelo próprio Lumos. A função confere quem
// está logado, se o lead é dessa loja e se a conta tem acesso liberado;
// salva a mensagem, envia pelo provedor de WhatsApp do agente e, se o agente
// estiver configurado assim, pausa a IA pra aquele contato.
//
// Deixe "Enforce JWT verification" LIGADO nesta função (é o padrão).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function onlyDigits(s: string | undefined | null) {
  return String(s || "").replace(/\D/g, "");
}

async function sendText(
  wa: { vendor: string; base_url: string; api_key: string; instance_id?: string },
  to: string,
  text: string,
) {
  if (wa.vendor === "evolution") {
    return fetch(`${wa.base_url}/message/sendText/${wa.instance_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: wa.api_key },
      body: JSON.stringify({ number: to, text }),
    });
  }
  return fetch(`${wa.base_url}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: wa.api_key },
    body: JSON.stringify({ number: to, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    // 1. Quem está enviando
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return json({ error: "Sessão expirada. Entre de novo no Lumos." }, 401);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin" && profile?.role !== "cliente") {
      return json({ error: "Sua conta não tem acesso a essa função." }, 403);
    }

    // 2. O que enviar
    const { lead_id, text } = await req.json();
    const clean = String(text || "").trim();
    if (!lead_id || !clean) return json({ error: "Mensagem vazia." }, 400);
    if (clean.length > 4000) return json({ error: "Mensagem muito longa (máx. 4000 caracteres)." }, 400);

    // 3. O lead precisa ser desta loja
    const { data: lead } = await supabase
      .from("leads").select("id, owner_id, agent_id, phone, ai_enabled").eq("id", lead_id).maybeSingle();
    if (!lead || lead.owner_id !== user.id) return json({ error: "Contato não encontrado." }, 404);

    const { data: agent } = await supabase.from("agents").select("id, pause_on_human").eq("id", lead.agent_id).maybeSingle();
    const { data: wa } = await supabase
      .from("whatsapp_provider_config").select("*").eq("agent_id", lead.agent_id).maybeSingle();
    if (!wa?.base_url || !wa?.api_key) {
      return json({ error: "Configure o Provedor de WhatsApp (URL e token) na página do agente." }, 400);
    }

    // 4. Salva antes de enviar (evita duplicar quando o eco do WhatsApp chegar no webhook)
    const { data: saved } = await supabase
      .from("messages")
      .insert({ lead_id: lead.id, direction: "out", sender: "vendedor", text: clean })
      .select("id, created_at").single();

    const res = await sendText(wa, onlyDigits(lead.phone), clean);
    if (!res.ok) {
      const detail = await res.text();
      console.error("Falha ao enviar pelo Lumos:", res.status, detail);
      if (saved?.id) await supabase.from("messages").delete().eq("id", saved.id);
      return json({ error: "O WhatsApp recusou o envio. Confira se a instância está conectada." }, 502);
    }

    // 5. Atualiza o lead e pausa a IA se o agente estiver configurado pra isso
    const update: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if (agent?.pause_on_human !== false && lead.ai_enabled !== false) update.ai_enabled = false;
    await supabase.from("leads").update(update).eq("id", lead.id);

    return json({ ok: true, message: saved, ai_paused: update.ai_enabled === false });
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado ao enviar." }, 500);
  }
});
