import { supabase } from "./supabaseClient.js?v=33";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

// ---------- Categorias ----------
export async function listCategories() {
  return supabase.from("categories").select("*").order("name");
}

export async function addCategory(name) {
  const owner_id = await getUserId();
  return supabase.from("categories").insert({ owner_id, name });
}

export async function deleteCategory(id) {
  return supabase.from("categories").delete().eq("id", id);
}

// ---------- Fotos ----------
export async function uploadPhotos(files) {
  const owner_id = await getUserId();
  const urls = [];

  for (const file of files) {
    const path = `${owner_id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-photos").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

// ---------- Produtos ----------
export async function listProducts() {
  return supabase
    .from("products")
    .select("*, product_categories(category_id, categories(id, name))")
    .order("created_at", { ascending: false });
}

export async function addProduct({ category_ids, ...fields }) {
  const owner_id = await getUserId();

  const { data: product, error } = await supabase
    .from("products")
    .insert({ owner_id, ...fields })
    .select()
    .single();

  if (error) return { error };

  if (category_ids?.length) {
    await supabase
      .from("product_categories")
      .insert(category_ids.map((category_id) => ({ product_id: product.id, category_id })));
  }

  return { data: product };
}

export async function updateProduct(id, fields, category_ids) {
  const { error } = await supabase.from("products").update(fields).eq("id", id);
  if (error) return { error };

  if (category_ids) {
    await supabase.from("product_categories").delete().eq("product_id", id);
    if (category_ids.length) {
      await supabase
        .from("product_categories")
        .insert(category_ids.map((category_id) => ({ product_id: id, category_id })));
    }
  }
  return { data: true };
}

export async function deleteProduct(id) {
  return supabase.from("products").delete().eq("id", id);
}

export const UNIT_LABELS = {
  unidade: "Unidade",
  litro: "Litro",
  m2: "m²",
  metro: "Metro linear",
  kg: "Kg",
  saco: "Saco",
  caixa: "Caixa",
  rolo: "Rolo",
};
