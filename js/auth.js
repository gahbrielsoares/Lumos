import { supabase } from "./supabaseClient.js";

// ---------- Cadastro ----------
export async function signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  return { data, error };
}

// ---------- Login ----------
export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

// ---------- Depois do login: descobre o papel e redireciona ----------
export async function redirectAfterLogin() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = "plans.html";
  }
}

// ---------- Protege páginas que exigem login ----------
export async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = "login.html";
  }
  return data?.session ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}
