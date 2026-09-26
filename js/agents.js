import { supabase } from "./supabaseClient.js?v=39";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

// ---------- Agentes ----------
export async function listAgents() {
  const { data } = await supabase.from("agents").select("*").order("created_at");
  return data || [];
}

export async function getAgent(id) {
  const { data } = await supabase.from("agents").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function createAgent(fields = {}) {
  const owner_id = await getUserId();
  return supabase.from("agents").insert({ owner_id, ...fields }).select().single();
}

export async function saveAgent(id, fields) {
  return supabase.from("agents").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function deleteAgent(id) {
  return supabase.from("agents").delete().eq("id", id);
}

// ---------- Provedores de IA (por agente, slots: paga / gratis) ----------
export async function getAiProviders(agent_id) {
  const { data } = await supabase.from("ai_providers").select("*").eq("agent_id", agent_id);
  return data || [];
}

export async function saveAiProvider(agent_id, slot, fields) {
  return supabase
    .from("ai_providers")
    .upsert({ agent_id, slot, ...fields }, { onConflict: "agent_id,slot" });
}

// ---------- Provedor de WhatsApp (por agente) ----------
export async function getWhatsappProviderConfig(agent_id) {
  const { data } = await supabase
    .from("whatsapp_provider_config")
    .select("*")
    .eq("agent_id", agent_id)
    .maybeSingle();
  return data;
}

export async function saveWhatsappProviderConfig(agent_id, fields) {
  return supabase
    .from("whatsapp_provider_config")
    .upsert({ agent_id, ...fields }, { onConflict: "agent_id" });
}
