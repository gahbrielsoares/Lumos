import { supabase } from "./supabaseClient.js";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

// ---------- Configuração geral do agente ----------
export async function getAgentConfig() {
  const owner_id = await getUserId();
  let { data } = await supabase.from("agent_config").select("*").eq("owner_id", owner_id).maybeSingle();
  if (!data) {
    const { data: created } = await supabase
      .from("agent_config")
      .insert({ owner_id })
      .select()
      .single();
    data = created;
  }
  return data;
}

export async function saveAgentConfig(fields) {
  const owner_id = await getUserId();
  return supabase
    .from("agent_config")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("owner_id", owner_id);
}

// ---------- Provedores de IA (slots: paga / gratis) ----------
export async function getAiProviders() {
  const owner_id = await getUserId();
  const { data } = await supabase.from("ai_providers").select("*").eq("owner_id", owner_id);
  return data || [];
}

export async function saveAiProvider(slot, fields) {
  const owner_id = await getUserId();
  return supabase
    .from("ai_providers")
    .upsert({ owner_id, slot, ...fields }, { onConflict: "owner_id,slot" });
}

// ---------- Provedor de WhatsApp ----------
export async function getWhatsappProviderConfig() {
  const owner_id = await getUserId();
  const { data } = await supabase
    .from("whatsapp_provider_config")
    .select("*")
    .eq("owner_id", owner_id)
    .maybeSingle();
  return data;
}

export async function saveWhatsappProviderConfig(fields) {
  const owner_id = await getUserId();
  return supabase
    .from("whatsapp_provider_config")
    .upsert({ owner_id, ...fields }, { onConflict: "owner_id" });
}
