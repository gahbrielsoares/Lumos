import { supabase } from "./supabaseClient.js?v=63";
import { getWorkspaceOwnerId } from "./workspace.js?v=63";

// Dono dos dados: o próprio usuário ou, se for da equipe, o dono do estabelecimento
async function getUserId() {
  return getWorkspaceOwnerId();
}

export async function getBusinessConfig() {
  const owner_id = await getUserId();
  const { data } = await supabase.from("business_config").select("*").eq("owner_id", owner_id).maybeSingle();
  return data;
}

export async function saveBusinessConfig(fields) {
  const owner_id = await getUserId();
  return supabase.from("business_config").upsert({ owner_id, ...fields }, { onConflict: "owner_id" });
}

export async function getBusinessHoursFull() {
  const owner_id = await getUserId();
  const { data } = await supabase.from("business_hours").select("*").eq("owner_id", owner_id).order("weekday");
  return data || [];
}

export async function saveBusinessHours(rows) {
  const owner_id = await getUserId();
  return supabase
    .from("business_hours")
    .upsert(rows.map((r) => ({ owner_id, ...r })), { onConflict: "owner_id,weekday" });
}

export async function getDisabledStages() {
  const cfg = await getBusinessConfig();
  return cfg?.disabled_stages || [];
}

export async function saveDisabledStages(stages) {
  return saveBusinessConfig({ disabled_stages: stages });
}

export async function getDisabledDashboardCards() {
  const cfg = await getBusinessConfig();
  return cfg?.disabled_dashboard_cards || [];
}

export async function saveDisabledDashboardCards(cards) {
  return saveBusinessConfig({ disabled_dashboard_cards: cards });
}

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
