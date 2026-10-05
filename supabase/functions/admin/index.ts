// Edge Function: admin
// Painel Admin da Lumos. Só atende quem tem papel "admin".
//   list         -> todas as contas, com situação, nicho, último acesso, agentes e leads
//   update       -> muda situação (cadastrado / ativo / inativo), administrador, plano, notas e abas liberadas
//   support_link -> gera um link de acesso temporário (2h) ao painel do cliente, para configurar por ele
// Deploy com "Enforce JWT verification" LIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE_URL = (Deno.env.get("SITE_URL") || "https://gahbrielsoares.github.io/Lumos").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const STATUS = ["cadastrado", "ativo", "inativo"];
// Papel que dá (ou não) acesso ao painel: admin > cliente ativo > usuário
const roleFor = (status: string, isAdmin: boolean) => (isAdmin ? "admin" : status === "ativo" ? "cliente" : "user");

async function allAuthUsers() {
  const out: { id: string; email?: string; last_sign_in_at?: string; created_at?: string; user_metadata?: Record<string, unknown> }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error(error.message); break; }
    out.push(...(data?.users || []));
    if (!data?.users || data.users.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    // Quem está chamando precisa ser administrador
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: me } = await supabase.auth.getUser(jwt);
    if (!me?.user) return json({ error: "Sessão expirada. Entre de novo." }, 401);
    const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", me.user.id).maybeSingle();
    if (myProfile?.role !== "admin") return json({ error: "Acesso restrito ao administrador." }, 403);

    const body = await req.json();

    if (body.action === "list") {
      const [{ data: profiles }, { data: biz }, { data: agents }, users] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("business_config").select("owner_id, business_name, business_type"),
        supabase.from("agents").select("owner_id, enabled, is_simulator"),
        allAuthUsers(),
      ]);
      const since = new Date(Date.now() - 30 * 86400e3).toISOString();
      const { data: leads } = await supabase.from("leads").select("owner_id").gte("last_message_at", since).limit(50000);
      const count = (arr: { owner_id: string }[] | null, id: string) => (arr || []).filter((x) => x.owner_id === id).length;
      const authById = Object.fromEntries(users.map((u) => [u.id, u]));
      const bizById = Object.fromEntries((biz || []).map((b) => [b.owner_id, b]));
      const accounts = (profiles || []).map((p) => {
        const u = authById[p.id] || {};
        return {
          id: p.id, email: p.email || u.email || "", nome: (u.user_metadata?.name as string) || "",
          role: p.role, status: p.status || (p.role === "cliente" || p.role === "admin" ? "ativo" : "cadastrado"),
          allowed_tabs: p.allowed_tabs, plano: p.plano, notas: p.notas,
          criado_em: p.created_at || u.created_at, ultimo_acesso: u.last_sign_in_at || null,
          negocio: bizById[p.id]?.business_name || "", nicho: bizById[p.id]?.business_type || "",
          agentes: (agents || []).filter((a) => a.owner_id === p.id && !a.is_simulator).length,
          leads_30d: count(leads, p.id),
        };
      }).sort((a, b) => String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
      return json({ accounts, me: me.user.id });
    }

    if (body.action === "update") {
      const id = String(body.user_id || "");
      const { data: target } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      if (!target) return json({ error: "Conta não encontrada." }, 404);

      const status = body.status !== undefined ? String(body.status) : (target.status || "cadastrado");
      if (!STATUS.includes(status)) return json({ error: "Situação inválida." }, 400);
      const isAdmin = body.is_admin !== undefined ? !!body.is_admin : target.role === "admin";
      if (id === me.user.id && !isAdmin) return json({ error: "Você não pode remover o seu próprio acesso de administrador." }, 400);

      const update: Record<string, unknown> = { status, role: roleFor(status, isAdmin) };
      if (body.allowed_tabs !== undefined) {
        update.allowed_tabs = Array.isArray(body.allowed_tabs) ? body.allowed_tabs.map(String).slice(0, 60) : null;
      }
      if (body.plano !== undefined) update.plano = String(body.plano || "").slice(0, 80) || null;
      if (body.notas !== undefined) update.notas = String(body.notas || "").slice(0, 2000) || null;

      const { error } = await supabase.from("profiles").update(update).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      console.log("Conta atualizada pelo admin:", id, JSON.stringify(update));
      return json({ ok: true, role: update.role });
    }

    if (body.action === "support_link") {
      const id = String(body.user_id || "");
      const { data: target } = await supabase.from("profiles").select("id, email").eq("id", id).maybeSingle();
      if (!target?.email) return json({ error: "Conta sem e-mail." }, 400);
      const ate = new Date(Date.now() + 2 * 3600e3).toISOString();
      await supabase.from("profiles").update({ suporte_ate: ate }).eq("id", id);
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "magiclink", email: target.email, options: { redirectTo: `${SITE_URL}/dashboard.html?suporte=1` },
      });
      if (error) return json({ error: error.message }, 500);
      console.log("Link de suporte gerado pelo admin", me.user.id, "para", id);
      return json({ ok: true, link: data?.properties?.action_link, ate });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado." }, 500);
  }
});
