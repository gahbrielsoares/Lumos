import { supabase } from "./supabaseClient.js";

export async function getLeadsStats() {
  const { data } = await supabase.from("leads").select("stage");
  const stats = { total: data?.length || 0, novo: 0, em_andamento: 0, qualificado: 0, visita: 0, proposta: 0, vendido: 0 };
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

export async function listLeadsInRange(start, end) {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false });
  return data || [];
}

export const STAGE_LABELS = {
  novo: "Novo",
  em_andamento: "Em andamento",
  qualificado: "Qualificado",
  visita: "Visita",
  proposta: "Proposta",
  vendido: "Vendido",
  descartado: "Descartado",
};

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
