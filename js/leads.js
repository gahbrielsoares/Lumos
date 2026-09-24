import { supabase } from "./supabaseClient.js?v=26";

export const STAGES = [
  "novo_contato",
  "conversando",
  "consulta_agendada",
  "compareceu",
  "follow_up",
  "fechado",
  "perdido",
];

export const STAGE_LABELS = {
  novo_contato: "Novo Contato",
  conversando: "Conversando",
  consulta_agendada: "Consulta Agendada",
  compareceu: "Compareceu",
  follow_up: "Follow Up",
  fechado: "Fechado",
  perdido: "Perdido",
};

export const STAGE_DESCRIPTIONS = {
  novo_contato: "Lead acabou de entrar em contato",
  conversando: "Em conversa, coletando informações",
  consulta_agendada: "Visita/consulta marcada, aguardando comparecimento",
  compareceu: "Compareceu e virou cliente",
  follow_up: "O Agente de IA fará o follow up automaticamente",
  fechado: "Negócio fechado, cliente ativo",
  perdido: "Desistiu ou sem retorno",
};

export async function getLeadsStats() {
  const { data } = await supabase.from("leads").select("stage");
  const stats = { total: data?.length || 0 };
  STAGES.forEach((s) => (stats[s] = 0));
  (data || []).forEach((l) => {
    if (stats[l.stage] !== undefined) stats[l.stage]++;
  });
  return stats;
}

export async function listLeads() {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(50);
  return data || [];
}

export async function listLeadsInRange(start, end, { isClient, agentId } = {}) {
  let query = supabase
    .from("leads")
    .select("*")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false });

  if (isClient !== undefined) query = query.eq("is_client", isClient);
  if (agentId) query = query.eq("agent_id", agentId);

  const { data } = await query;
  return data || [];
}

export async function getLeadById(id) {
  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function updateLeadStage(id, stage) {
  const fields = { stage };
  if (stage === "compareceu") fields.is_client = true;
  return supabase.from("leads").update(fields).eq("id", id);
}

export async function updateLeadFields(id, fields) {
  return supabase.from("leads").update(fields).eq("id", id);
}

export async function getLatestMessage(leadId) {
  const { data } = await supabase
    .from("messages")
    .select("text, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export function timeAgo(dateString) {
  if (!dateString) return "";
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
