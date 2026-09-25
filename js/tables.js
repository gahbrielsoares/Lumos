import { supabase } from "./supabaseClient.js?v=31";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

export async function listTables() {
  const { data } = await supabase.from("restaurant_tables").select("*").order("label");
  return data || [];
}

export async function createTable(label) {
  const owner_id = await getUserId();
  return supabase.from("restaurant_tables").insert({ owner_id, label }).select().single();
}

export async function deleteTable(id) {
  return supabase.from("restaurant_tables").delete().eq("id", id);
}

// Sessão ativa de uma mesa (a "ocupação" atual, se houver)
export async function getActiveSession(table_id) {
  const { data } = await supabase
    .from("table_sessions")
    .select("*")
    .eq("table_id", table_id)
    .eq("status", "ativa")
    .maybeSingle();
  return data;
}

export async function listSessionLeads(session_id) {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("table_session_id", session_id)
    .order("created_at");
  return data || [];
}

// Encerra a sessão (mesa fica livre de novo pro próximo grupo de clientes)
export async function closeSession(session_id, table_id) {
  await supabase.from("table_sessions").update({ status: "fechada", closed_at: new Date().toISOString() }).eq("id", session_id);
  return supabase.from("restaurant_tables").update({ status: "livre" }).eq("id", table_id);
}

// Marca todo mundo da mesa como aguardando pagamento (cobrar mesa inteira)
export async function chargeSession(session_id) {
  await supabase.from("table_sessions").update({ status: "aguardando_pagamento" }).eq("id", session_id);
  return supabase.from("leads").update({ visit_status: "aguardando_pagamento" }).eq("table_session_id", session_id);
}

// Cobra só uma pessoa da mesa
export async function chargeLead(lead_id) {
  return supabase.from("leads").update({ visit_status: "aguardando_pagamento" }).eq("id", lead_id);
}

export const VISIT_STATUS_LABELS = {
  iniciado: "Chegou",
  conversando: "Conversando",
  aguardando_pagamento: "Aguardando pagamento",
};
