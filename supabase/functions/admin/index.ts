// Edge Function: admin
// Painel Admin da Lumos. Atende a equipe da Lumos:
//   - administrador principal (OWNER_EMAIL): tudo, e é o único que define quem é administrador ou equipe de suporte
//   - administrador: situação, plano, abas, notas e acesso de suporte das contas de clientes
//   - equipe de suporte: abas, notas e acesso de suporte das contas de clientes (não muda situação, plano nem papéis)
// Ninguém gera acesso de suporte para contas da equipe (evita entrar como administrador).
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
const OWNER_EMAIL = (Deno.env.get("OWNER_EMAIL") || "soaresgahbriel@gmail.com").toLowerCase();
const STAFF = ["admin", "suporte"];
// Papel: função na equipe (admin/suporte) ou, para clientes, a situação define o acesso
const roleFor = (status: string, funcao: string) => (funcao === "admin" ? "admin" : funcao === "suporte" ? "suporte" : status === "ativo" ? "cliente" : "user");

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
    const { data: myProfile } = await supabase.from("profiles").select("role, email").eq("id", me.user.id).maybeSingle();
    const myRole = myProfile?.role || "";
    if (!STAFF.includes(myRole)) return json({ error: "Acesso restrito à equipe da Lumos." }, 403);
    const isOwner = String(myProfile?.email || me.user.email || "").toLowerCase() === OWNER_EMAIL;
    const isAdmin = myRole === "admin";

    const body = await req.json();

    if (body.action === "list") {
      const [{ data: profilesAll }, { data: biz }, { data: agents }, users, { data: team }] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("business_config").select("owner_id, business_name, business_type"),
        supabase.from("agents").select("owner_id, enabled, is_simulator"),
        allAuthUsers(),
        supabase.from("team_members").select("owner_id, user_id"),
      ]);
      // Funcionários dos estabelecimentos não entram na lista de contas (aparecem como "equipe" do cliente)
      const membros = new Set((team || []).map((t) => t.user_id));
      const profiles = (profilesAll || []).filter((p) => p.role !== "equipe" && !membros.has(p.id));
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
          principal: String(p.email || u.email || "").toLowerCase() === OWNER_EMAIL,
          negocio: bizById[p.id]?.business_name || "", nicho: bizById[p.id]?.business_type || "",
          agentes: (agents || []).filter((a) => a.owner_id === p.id && !a.is_simulator).length,
          leads_30d: count(leads, p.id),
          equipe: (team || []).filter((t) => t.owner_id === p.id).length,
          limite_equipe: p.limite_equipe ?? null,
        };
      }).sort((a, b) => String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
      return json({ accounts, me: me.user.id, my_role: myRole, is_owner: isOwner });
    }

    if (body.action === "update") {
      const id = String(body.user_id || "");
      const { data: target } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      if (!target) return json({ error: "Conta não encontrada." }, 404);
      const targetIsOwner = String(target.email || "").toLowerCase() === OWNER_EMAIL;
      const targetIsStaff = STAFF.includes(target.role);

      // Contas da equipe só o administrador principal altera; a conta principal ninguém rebaixa
      if (targetIsStaff && !isOwner) return json({ error: "Contas da equipe só podem ser alteradas pelo administrador principal." }, 403);

      const update: Record<string, unknown> = {};
      // Função na equipe: só o principal define (e a dele não muda)
      let funcao = target.role === "admin" ? "admin" : target.role === "suporte" ? "suporte" : "cliente";
      if (body.funcao !== undefined && body.funcao !== funcao) {
        if (!isOwner) return json({ error: "Só o administrador principal define quem é administrador ou equipe de suporte." }, 403);
        if (targetIsOwner) return json({ error: "A função do administrador principal não pode ser alterada." }, 400);
        if (!["cliente", "suporte", "admin"].includes(String(body.funcao))) return json({ error: "Função inválida." }, 400);
        funcao = String(body.funcao);
      }
      // Situação e plano: só administradores (a equipe de suporte não mexe no comercial)
      let status = target.status || "cadastrado";
      if (body.status !== undefined && body.status !== status) {
        if (!isAdmin) return json({ error: "Só administradores mudam a situação da conta." }, 403);
        if (!STATUS.includes(String(body.status))) return json({ error: "Situação inválida." }, 400);
        status = String(body.status);
      }
      if (body.plano !== undefined && (body.plano || null) !== (target.plano || null)) {
        if (!isAdmin) return json({ error: "Só administradores mudam o plano." }, 403);
        update.plano = String(body.plano || "").slice(0, 80) || null;
      }
      update.status = status;
      update.role = targetIsOwner ? "admin" : roleFor(status, funcao);
      // Abas e notas: administradores e equipe de suporte
      if (body.allowed_tabs !== undefined) {
        update.allowed_tabs = Array.isArray(body.allowed_tabs) ? body.allowed_tabs.map(String).slice(0, 60) : null;
      }
      if (body.notas !== undefined) update.notas = String(body.notas || "").slice(0, 2000) || null;

      const { error } = await supabase.from("profiles").update(update).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      console.log("Conta atualizada por", myRole, me.user.id, ":", id, JSON.stringify(update));
      return json({ ok: true, role: update.role });
    }

    if (body.action === "support_link") {
      const id = String(body.user_id || "");
      const { data: target } = await supabase.from("profiles").select("id, email, role").eq("id", id).maybeSingle();
      if (!target?.email) return json({ error: "Conta sem e-mail." }, 400);
      // Nunca entrar como alguém da equipe: isso daria os poderes dessa pessoa
      if (STAFF.includes(target.role)) return json({ error: "Acesso de suporte só é permitido em contas de clientes." }, 403);
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
