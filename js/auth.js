import { supabase } from "./supabaseClient.js?v=57";

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
// Funcionários da equipe entram com usuário simples (sem e-mail): por trás, vira um endereço interno
export const TEAM_EMAIL_DOMAIN = "equipe.lumos.app";
export function loginToEmail(login) {
  const v = String(login || "").trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${TEAM_EMAIL_DOMAIN}`;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginToEmail(email),
    password,
  });
  return { data, error };
}

// Funcionário (equipe): entra se a conta dele e a do estabelecimento estiverem ativas
async function teamAccessOk() {
  const { data } = await supabase.rpc("my_access");
  const m = data?.member, o = data?.owner;
  if (!m || !m.ativo) return false;
  return ["admin", "suporte"].includes(o?.role) || (o?.role === "cliente" && o?.status === "ativo");
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
  } else if (profile?.role === "equipe") {
    window.location.href = (await teamAccessOk()) ? "dashboard.html" : "plans.html?inativa=1&equipe=1";
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

  if (profile?.role === "equipe") {
    if (!(await teamAccessOk())) { window.location.href = "plans.html?inativa=1&equipe=1"; return null; }
    return data.session;
  }

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
