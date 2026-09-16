import { supabase } from "./supabaseClient.js";

export async function countTodayAppointments() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data } = await supabase
    .from("agendamentos")
    .select("id, status")
    .gte("data_hora_inicio", start.toISOString())
    .lt("data_hora_inicio", end.toISOString());

  return (data || []).filter((a) => a.status !== "cancelado").length;
}

export async function getBusinessHours() {
  const { data } = await supabase.from("business_hours").select("*").order("weekday");
  return data || [];
}
