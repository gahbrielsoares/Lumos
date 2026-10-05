import { supabase } from "./supabaseClient.js?v=52";

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
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (["admin", "suporte", "cliente"].includes(profile?.role)) {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = profile?.status === "inativo" ? "plans.html?inativa=1" : "plans.html";
  }
}

// ---------- Protege páginas que só exigem estar logado (ex: plans.html) ----------
export async function requireLogin() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session;
}

// ---------- Protege páginas que exigem login E acesso liberado ----------
export async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = "login.html";
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.session.user.id)
    .single();

  if (!["admin", "suporte", "cliente"].includes(profile?.role)) {
    // Cliente inativo vê o aviso de conta inativa; usuário cadastrado vê os planos
    window.location.href = profile?.status === "inativo" ? "plans.html?inativa=1" : "plans.html";
    return null;
  }

  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}
