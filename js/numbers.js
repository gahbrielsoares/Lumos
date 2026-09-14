import { supabase } from "./supabaseClient.js";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

export async function listNumbers() {
  const { data, error } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .order("type", { ascending: false })
    .order("created_at", { ascending: true });
  return { data, error };
}

export async function savePrincipal(phone_number) {
  const owner_id = await getUserId();

  const { data: existing } = await supabase
    .from("whatsapp_numbers")
    .select("id")
    .eq("owner_id", owner_id)
    .eq("type", "principal")
    .maybeSingle();

  if (existing) {
    return supabase
      .from("whatsapp_numbers")
      .update({ phone_number })
      .eq("id", existing.id);
  }

  return supabase
    .from("whatsapp_numbers")
    .insert({ owner_id, type: "principal", phone_number, label: "Número principal" });
}

export async function addSubNumber({ label, phone_number, routing_description }) {
  const owner_id = await getUserId();
  return supabase
    .from("whatsapp_numbers")
    .insert({ owner_id, type: "sub", label, phone_number, routing_description });
}

export async function updateSubNumber(id, fields) {
  return supabase.from("whatsapp_numbers").update(fields).eq("id", id);
}

export async function deleteNumber(id) {
  return supabase.from("whatsapp_numbers").delete().eq("id", id);
}
