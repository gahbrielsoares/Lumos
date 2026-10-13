import { supabase } from "./supabaseClient.js?v=68";

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
  let data = null, error = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    ({ data, error } = await supabase.rpc("my_access"));
    if (!error) break;
    await new Promise((ok) => setTimeout(ok, 800 * (tentativa + 1)));
  }
  if (error) return "erro"; // instabilidade: não dá para afirmar que o acesso está desativado
  const m = data?.member, o = data?.owner;
  if (!m || !m.ativo) return false;
  return ["admin", "suporte"].includes(o?.role) || (o?.role === "cliente" && o?.status === "ativo");
}

// ---------- Leitura do perfil com nova tentativa ----------
// Numa instabilidade do servidor, a consulta pode falhar: tenta de novo e, se continuar falhando,
// avisa a pessoa (em vez de mandá-la para a tela de planos como se a conta não tivesse acesso).
async function lerPerfil(uid) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data, error } = await supabase.from("profiles").select("role, status").eq("id", uid).maybeSingle();
    if (!error && data) return { profile: data, falhou: false };
    if (!error && !data) return { profile: null, falhou: false }; // conta sem perfil: aí sim é "sem acesso"
    await new Promise((ok) => setTimeout(ok, 800 * (tentativa + 1)));
  }
  return { profile: null, falhou: true };
}

function avisoInstabilidade() {
  if (document.getElementById("aviso-instabilidade")) return;
  const box = document.createElement("div");
  box.id = "aviso-instabilidade";
  box.style.cssText = "position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,12,18,.72);font-family:inherit;";
  box.innerHTML = `<div style="background:#fff;color:#1C2B3A;border-radius:18px;padding:24px;max-width:420px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.35);">
      <div style="font-size:34px;">🔌</div>
      <h3 style="margin:8px 0 6px;font-size:19px;">Não conseguimos confirmar sua conta agora</h3>
      <p style="margin:0 0 16px;font-size:14.5px;line-height:1.5;color:#5E5648;">Parece uma instabilidade momentânea no servidor. Seus dados estão seguros. Tente de novo em alguns instantes.</p>
      <button type="button" style="border:0;border-radius:12px;padding:12px 20px;font-weight:700;font-size:15px;background:#C9A84C;color:#1C2B3A;cursor:pointer;">Tentar de novo</button>
    </div>`;
  box.querySelector("button").addEventListener("click", () => location.reload());
  (document.body || document.documentElement).appendChild(box);
}

// ---------- Depois do login: descobre o papel e redireciona ----------
export async function redirectAfterLogin() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { profile, falhou } = await lerPerfil(user.id);
  if (falhou) { avisoInstabilidade(); return; }

  if (["admin", "suporte", "cliente"].includes(profile?.role)) {
    window.location.href = "dashboard.html";
  } else if (profile?.role === "equipe") {
    const ok = await teamAccessOk();
    if (ok === "erro") { avisoInstabilidade(); return; }
    window.location.href = ok ? "dashboard.html" : "plans.html?inativa=1&equipe=1";
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

  const { profile, falhou } = await lerPerfil(data.session.user.id);
  if (falhou) { avisoInstabilidade(); return null; }

  if (profile?.role === "equipe") {
    const ok = await teamAccessOk();
    if (ok === "erro") { avisoInstabilidade(); return null; }
    if (!ok) { window.location.href = "plans.html?inativa=1&equipe=1"; return null; }
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
