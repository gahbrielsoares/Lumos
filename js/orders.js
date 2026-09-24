import { supabase } from "./supabaseClient.js?v=23";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

export async function listOrders() {
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*), leads(name, phone, table_session_id, restaurant_tables:table_session_id(table_id))")
    .order("created_at", { ascending: true });
  return data || [];
}

export async function listOrdersBySession(table_session_id) {
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("table_session_id", table_session_id)
    .order("created_at");
  return data || [];
}

export async function updateOrderStatus(id, status) {
  return supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
}

// Cria um pedido manual (usado no teste manual e, futuramente, pela Edge Function)
export async function createOrder({ table_session_id, lead_id, items }) {
  const owner_id = await getUserId();
  const total = items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({ owner_id, table_session_id, lead_id, total })
    .select()
    .single();

  if (error) return { error };

  await supabase.from("order_items").insert(
    items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id || null,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
    }))
  );

  return { data: order };
}

export const ORDER_STATUS_LABELS = {
  novo_pedido: "Novo pedido",
  entregue: "Entregue",
};
