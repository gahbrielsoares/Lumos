import { supabase } from "./supabaseClient.js?v=27";

export async function countTodayAppointments(agentId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  let query = supabase
    .from("agendamentos")
    .select("id, status, leads!inner(agent_id)")
    .gte("data_hora_inicio", start.toISOString())
    .lt("data_hora_inicio", end.toISOString());

  if (agentId) query = query.eq("leads.agent_id", agentId);

  const { data } = await query;
  return (data || []).filter((a) => a.status !== "cancelado").length;
}

export async function getBusinessHours() {
  const { data } = await supabase.from("business_hours").select("*").order("weekday");
  return data || [];
}

export async function listAppointmentsInRange(start, end) {
  const { data } = await supabase
    .from("agendamentos")
    .select("*, leads(name, phone, motivo_contato)")
    .gte("data_hora_inicio", start.toISOString())
    .lt("data_hora_inicio", end.toISOString())
    .order("data_hora_inicio", { ascending: true });
  return data || [];
}

export async function createAppointment({ lead_id, data_hora_inicio }) {
  const owner_id = (await supabase.auth.getUser()).data?.user?.id;
  return supabase.from("agendamentos").insert({ owner_id, lead_id, data_hora_inicio });
}

export async function updateAppointmentStatus(id, status) {
  return supabase.from("agendamentos").update({ status }).eq("id", id);
}

export const APPOINTMENT_STATUS_LABELS = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  faltou: "Faltou",
  cancelado: "Cancelado",
};
