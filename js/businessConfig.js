import { supabase } from "./supabaseClient.js?v=85";
import { getWorkspaceOwnerId } from "./workspace.js?v=85";

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

// Aplica um nicho: tipo de negócio, abas, quadros do Dashboard e colunas do Kanban recomendados
// (usado em Configurações e no primeiro acesso de quem escolheu o nicho no cadastro)
export async function aplicarNicho(tipo) {
  const { getBusinessTypeInfo } = await import("./businessTypes.js?v=85");
  const info = getBusinessTypeInfo(tipo);
  const r = await saveBusinessConfig({
    business_type: info.key,
    disabled_tabs: info.disabledTabs,
    disabled_dashboard_cards: info.disabledDashboardCards,
    disabled_stages: info.disabledStages || [],
  });
  return { ...r, info };
}
