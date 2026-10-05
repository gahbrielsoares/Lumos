// Edge Function: team
// Equipe do estabelecimento: o dono cria, edita, desativa e exclui contas internas dos funcionários.
//   list   -> funcionários do estabelecimento (com último acesso)
//   create -> nome, usuário, senha, função, abas e permissões
//   update -> nome, função, abas, permissões, ativo/desativado e nova senha
//   delete -> exclui a conta do funcionário
// Só o dono do estabelecimento (cliente ativo ou equipe da Lumos) usa. Funcionário não gerencia equipe.
// As abas do funcionário ficam sempre dentro das abas liberadas para o estabelecimento.
// Deploy com "Enforce JWT verification" LIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const DOMAIN = "equipe.lumos.app";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Abas que um funcionário pode receber (Equipe e Painel Admin nunca)
const TAB_KEYS = ["kanban", "leads", "clientes", "follow_up", "agendamentos", "produtos", "mesas", "cozinha", "estoque",
  "compras", "financeiro", "relatorios", "fiscal", "integracoes", "agents", "settings"];
const FUNCOES = ["garcom", "cozinha", "atendente", "gerente", "personalizado"];
const USER_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function cleanTabs(tabs: unknown, ownerTabs: string[] | null) {
  const list = Array.isArray(tabs) ? tabs.map(String) : [];
  return [...new Set(list)].filter((k) => TAB_KEYS.includes(k) && (!ownerTabs || ownerTabs.includes(k)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    // Quem está chamando precisa ser o dono do estabelecimento
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: me } = await supabase.auth.getUser(jwt);
    if (!me?.user) return json({ error: "Sessão expirada. Entre de novo." }, 401);
    const { data: owner } = await supabase.from("profiles").select("id, role, status, allowed_tabs, limite_equipe").eq("id", me.user.id).maybeSingle();
    const { data: souFuncionario } = await supabase.from("team_members").select("user_id").eq("user_id", me.user.id).maybeSingle();
    const ownerOk = !souFuncionario && (["admin", "suporte"].includes(owner?.role) || (owner?.role === "cliente" && owner?.status === "ativo"));
    if (!ownerOk) return json({ error: "Só o responsável pelo estabelecimento gerencia a equipe." }, 403);
    const ownerTabs: string[] | null = Array.isArray(owner?.allowed_tabs) && owner.allowed_tabs.length ? owner.allowed_tabs : null;
    if (ownerTabs && !ownerTabs.includes("equipe") && !["admin", "suporte"].includes(owner?.role)) {
      return json({ error: "A aba Equipe não está liberada no seu plano." }, 403);
    }

    const body = await req.json();

    // Funcionário precisa ser deste estabelecimento
    const loadMember = async (id: string) => {
      const { data: m } = await supabase.from("team_members").select("*").eq("user_id", String(id || "")).maybeSingle();
      return m && m.owner_id === me.user.id ? m : null;
    };

    if (body.action === "list") {
      const { data: members } = await supabase.from("team_members").select("*").eq("owner_id", me.user.id).order("created_at");
      const out = [];
      for (const m of members || []) {
        const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
        out.push({ ...m, ultimo_acesso: u?.user?.last_sign_in_at || null });
      }
      return json({ members: out, owner_tabs: ownerTabs, limite: owner?.limite_equipe ?? null, dominio: DOMAIN });
    }

    if (body.action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      const nome = String(body.nome || "").trim().slice(0, 80);
      const senha = String(body.senha || "");
      const funcao = FUNCOES.includes(body.funcao) ? body.funcao : "personalizado";
      if (!nome) return json({ error: "Informe o nome do funcionário." }, 400);
      if (!USER_RE.test(username)) return json({ error: "Usuário inválido: use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaços." }, 400);
      if (senha.length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      const tabs = cleanTabs(body.allowed_tabs, ownerTabs);
      if (!tabs.length) return json({ error: "Escolha pelo menos uma aba para o funcionário." }, 400);

      if (owner?.limite_equipe != null) {
        const { count } = await supabase.from("team_members").select("user_id", { count: "exact", head: true }).eq("owner_id", me.user.id);
        if ((count || 0) >= owner.limite_equipe) return json({ error: `Seu plano permite até ${owner.limite_equipe} funcionário(s).` }, 400);
      }
      const { data: existe } = await supabase.from("team_members").select("user_id").eq("username", username).maybeSingle();
      if (existe) return json({ error: "Esse usuário já existe. Tente outro (ex.: com o nome da loja no final)." }, 409);

      const { data: created, error } = await supabase.auth.admin.createUser({
        email: `${username}@${DOMAIN}`, password: senha, email_confirm: true,
        user_metadata: { name: nome, equipe: true },
      });
      if (error || !created?.user) {
        const msg = /already|registered|exists/i.test(error?.message || "") ? "Esse usuário já existe. Tente outro." : (error?.message || "Não foi possível criar a conta.");
        return json({ error: msg }, 400);
      }
      const uid = created.user.id;
      const { error: e2 } = await supabase.from("team_members").insert({
        user_id: uid, owner_id: me.user.id, username, nome, funcao, allowed_tabs: tabs,
        perms: { ver_custos: !!body.perms?.ver_custos }, ativo: true,
      });
      if (e2) { await supabase.auth.admin.deleteUser(uid); return json({ error: e2.message }, 500); }
      // Perfil do funcionário (criado pelo cadastro): papel "equipe"
      await supabase.from("profiles").upsert({ id: uid, email: `${username}@${DOMAIN}`, role: "equipe", status: "ativo" }, { onConflict: "id" });
      console.log("Funcionário criado:", username, "por", me.user.id);
      return json({ ok: true, user_id: uid });
    }

    if (body.action === "update") {
      const m = await loadMember(body.user_id);
      if (!m) return json({ error: "Funcionário não encontrado." }, 404);
      const update: Record<string, unknown> = {};
      if (body.nome !== undefined) update.nome = String(body.nome || "").trim().slice(0, 80) || m.nome;
      if (body.funcao !== undefined) update.funcao = FUNCOES.includes(body.funcao) ? body.funcao : "personalizado";
      if (body.allowed_tabs !== undefined) {
        const tabs = cleanTabs(body.allowed_tabs, ownerTabs);
        if (!tabs.length) return json({ error: "Escolha pelo menos uma aba para o funcionário." }, 400);
        update.allowed_tabs = tabs;
      }
      if (body.perms !== undefined) update.perms = { ver_custos: !!body.perms?.ver_custos };
      if (body.ativo !== undefined) {
        update.ativo = !!body.ativo;
        // Desativado: não consegue entrar (bloqueio no login) e perde o acesso aos dados na hora
        await supabase.auth.admin.updateUserById(m.user_id, { ban_duration: body.ativo ? "none" : "876000h" });
      }
      if (body.senha) {
        if (String(body.senha).length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
        const { error } = await supabase.auth.admin.updateUserById(m.user_id, { password: String(body.senha) });
        if (error) return json({ error: error.message }, 500);
      }
      if (Object.keys(update).length) {
        const { error } = await supabase.from("team_members").update(update).eq("user_id", m.user_id);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    if (body.action === "delete") {
      const m = await loadMember(body.user_id);
      if (!m) return json({ error: "Funcionário não encontrado." }, 404);
      const { error } = await supabase.auth.admin.deleteUser(m.user_id);
      if (error) return json({ error: error.message }, 500);
      console.log("Funcionário excluído:", m.username, "por", me.user.id);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado." }, 500);
  }
});
