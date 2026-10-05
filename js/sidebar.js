import { supabase } from "./supabaseClient.js?v=58";

// Itens fixos (sempre visíveis, não desativáveis): dashboard, integrações, agents, settings, logout.
// group: "crm" (atendimento e vendas) ou "erp" (gestão da loja) — o menu e as Configurações agrupam por isso.
// Os demais podem ser desativados via Configurações → Gerenciar Abas.
export const NAV_ITEMS = [
  {
    key: "dashboard", href: "dashboard.html", label: "Dashboard", core: true, adminControl: true,
    icon: `<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
  },
  {
    key: "kanban", group: "crm", href: "kanban.html", label: "Kanban",
    icon: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>`,
  },
  {
    key: "leads", group: "crm", href: "leads.html", label: "Leads",
    icon: `<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><circle cx="18" cy="8.5" r="2.5"/><path d="M16 20v-1a5 5 0 0 1 6.5-4.8"/>`,
  },
  {
    key: "clientes", group: "crm", href: "clientes.html", label: "Clientes",
    icon: `<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M16.5 9l1.7 1.7L21.5 7"/>`,
  },
  {
    key: "follow_up", group: "crm", href: "follow-up.html", label: "Follow Up",
    icon: `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>`,
  },
  {
    key: "agendamentos", group: "crm", href: "agendamentos.html", label: "Agendamentos",
    icon: `<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>`,
  },
  {
    key: "produtos", group: "erp", href: "products.html", label: "Produtos",
    icon: `<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>`,
  },
  {
    key: "mesas", group: "erp", href: "mesas.html", label: "Mesas",
    icon: `<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v6M19 13v6"/>`,
  },
  {
    key: "cozinha", group: "erp", href: "cozinha.html", label: "Cozinha",
    icon: `<path d="M6 3v6a2 2 0 0 0 4 0V3M8 9v12M16 3v18"/>`,
  },
  {
    key: "estoque", group: "erp", href: "estoque.html", label: "Estoque",
    icon: `<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>`,
  },
  {
    key: "compras", group: "erp", href: "compras.html", label: "Compras",
    icon: `<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h8.7a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/>`,
  },
  {
    key: "financeiro", group: "erp", href: "financeiro.html", label: "Financeiro",
    icon: `<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>`,
  },
  {
    key: "relatorios", group: "erp", href: "relatorios.html", label: "Relatórios",
    icon: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  },
  {
    key: "fiscal", group: "erp", href: "fiscal.html", label: "Notas fiscais",
    icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>`,
  },
  {
    key: "equipe", href: "equipe.html", label: "Equipe", core: true, adminControl: true, ownerOnly: true,
    icon: `<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M17 11a3 3 0 1 0 0-6M21.5 20v-1a6.5 6.5 0 0 0-4-6"/>`,
  },
  {
    key: "integracoes", href: "integracoes.html", label: "Integrações", core: true, adminControl: true,
    icon: `<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>`,
  },
  {
    key: "agents", href: "agents.html", label: "Agentes (IA)", core: true, adminControl: true,
    icon: `<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>`,
  },
  {
    key: "settings", href: "settings.html", label: "Configurações", core: true, adminControl: true,
    icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  },
];

// Painel Admin: só aparece para administradores
export const ADMIN_ITEM = {
  key: "admin", href: "admin.html", label: "Painel Admin",
  icon: `<path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>`,
};

// ---------- Acesso da conta (definido pelo administrador no Painel Admin) ----------
// allowed_tabs nulo/vazio = todas as abas. Admin e modo suporte veem tudo.
let accessCache = null;
export async function getAccess() {
  if (accessCache) return accessCache;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  const { data: p } = uid ? await supabase.from("profiles").select("role, status, allowed_tabs, suporte_ate").eq("id", uid).maybeSingle() : { data: null };
  const params = new URLSearchParams(location.search);
  try { if (params.get("suporte") === "1") sessionStorage.setItem("lumos_suporte", "1"); } catch (_) { /* sem sessionStorage */ }
  let suporteFlag = false;
  try { suporteFlag = sessionStorage.getItem("lumos_suporte") === "1"; } catch (_) { /* sem sessionStorage */ }
  const suporteValido = suporteFlag && p?.suporte_ate && new Date(p.suporte_ate).getTime() > Date.now();
  let preview = false;
  try { preview = sessionStorage.getItem("lumos_suporte_preview") === "1"; } catch (_) { /* sem sessionStorage */ }
  // No modo suporte, "ver como o cliente vê" aplica as mesmas restrições do cliente
  const suporte = suporteValido && !preview;
  const isAdmin = p?.role === "admin";
  const isStaff = isAdmin || p?.role === "suporte";

  // Funcionário do estabelecimento: só as abas da função dele (e que o estabelecimento tem liberadas)
  if (p?.role === "equipe") {
    const { getMyAccess } = await import("./workspace.js?v=58");
    const me = await getMyAccess();
    const ownerTabs = Array.isArray(me.owner?.allowed_tabs) && me.owner.allowed_tabs.length ? me.owner.allowed_tabs : null;
    const tabs = (me.member?.allowed_tabs || []).filter((k) => !ownerTabs || ownerTabs.includes(k));
    accessCache = {
      isAdmin: false, isStaff: false, isMember: true, member: me.member, role: "equipe", suporte: false, suporteValido: false,
      preview: false, allowed: tabs, status: "ativo",
      can: (key) => tabs.includes(key),
    };
    return accessCache;
  }
  const allowed = Array.isArray(p?.allowed_tabs) && p.allowed_tabs.length ? p.allowed_tabs : null;
  accessCache = {
    isAdmin, isStaff, role: p?.role || null, suporte, suporteValido, preview, allowed, status: p?.status || null,
    // A aba pode aparecer para esta conta?
    can: (key) => isStaff || suporte || !allowed || allowed.includes(key),
  };
  return accessCache;
}

export async function getDisabledTabs() {
  const { data: userData } = await supabase.auth.getUser();
  const owner_id = userData?.user?.id;
  if (!owner_id) return [];
  const { data } = await supabase
    .from("business_config")
    .select("disabled_tabs")
    .eq("owner_id", owner_id)
    .maybeSingle();
  return data?.disabled_tabs || [];
}

export async function saveDisabledTabs(tabs) {
  const { data: userData } = await supabase.auth.getUser();
  const owner_id = userData?.user?.id;
  return supabase.from("business_config").upsert({ owner_id, disabled_tabs: tabs }, { onConflict: "owner_id" });
}

export async function renderSidebar(activeKey) {
  const nav = document.getElementById("dash-nav");
  if (!nav) return;

  const [disabled, access] = await Promise.all([getDisabledTabs(), getAccess()]);
  // Todas as abas dependem do que o admin liberou (e, nas não fixas, do que o próprio usuário escolheu mostrar)
  const visible = (item) => (item.core && !item.adminControl) || (access.can(item.key) && (item.core || !disabled.includes(item.key)));
  const items = NAV_ITEMS.filter(visible);
  if (access.isStaff) items.push(ADMIN_ITEM);

  // Tela de entrada: a primeira aba liberada (Dashboard, se estiver liberado)
  const home = items[0] || null;

  // Página não liberada para esta conta (link direto): vai para a tela de entrada
  const current = NAV_ITEMS.find((i) => i.key === activeKey);
  const blocked = (current && !visible(current)) || (activeKey === "admin" && !access.isStaff);
  if (blocked) document.querySelector(".dash-main")?.style.setProperty("visibility", "hidden");

  // Modo suporte: alguém da equipe está acessando o painel deste cliente
  if (access.suporteValido && !document.getElementById("suporte-bar")) {
    const bar = document.createElement("div");
    bar.id = "suporte-bar";
    bar.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:999;background:#1C2B3A;color:#fff;padding:8px 8px 8px 16px;border-radius:999px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:94vw;display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;";
    bar.innerHTML = access.preview
      ? `<span>Você está vendo <b>como o cliente vê</b>: só as abas liberadas para ele.</span><button type="button" style="border:0;border-radius:999px;padding:7px 12px;background:#C9A84C;color:#1C2B3A;font-weight:700;cursor:pointer;">Voltar ao modo suporte</button>`
      : `<span>Modo suporte: todas as abas liberadas para você configurar.</span><button type="button" style="border:0;border-radius:999px;padding:7px 12px;background:#C9A84C;color:#1C2B3A;font-weight:700;cursor:pointer;">Ver como o cliente vê</button>`;
    bar.querySelector("button").addEventListener("click", () => {
      try {
        if (access.preview) sessionStorage.removeItem("lumos_suporte_preview");
        else sessionStorage.setItem("lumos_suporte_preview", "1");
      } catch (_) { /* sem sessionStorage */ }
      window.location.href = "dashboard.html";
    });
    document.body.appendChild(bar);
  }

  const link = (item) => `
    <a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${item.icon}</svg>
      ${item.label}
    </a>`;
  const top = items.filter((i) => i.key === "dashboard");
  const crm = items.filter((i) => i.group === "crm");
  const erp = items.filter((i) => i.group === "erp");
  const rest = items.filter((i) => !i.group && i.key !== "dashboard");
  nav.innerHTML = top.map(link).join("")
    + (crm.length ? `<div class="nav-group">CRM</div>${crm.map(link).join("")}` : "")
    + (erp.length ? `<div class="nav-group">ERP</div>${erp.map(link).join("")}` : "")
    + `<div class="nav-group nav-group-sep"></div>${rest.map(link).join("")}`
    + `
    <a href="#" id="logout-link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
      Sair
    </a>
  `;
  if (blocked) {
    if (home) setTimeout(() => window.location.replace(home.href), 0);
    else {
      // Nenhuma aba liberada: avisa em vez de ficar redirecionando
      // (aviso por cima da página, sem apagar nada: o script da página continua funcionando)
      const main = document.querySelector(".dash-main");
      if (main && !document.getElementById("sem-abas")) {
        const box = document.createElement("div");
        box.id = "sem-abas";
        box.className = "empty-state";
        box.style.cssText = "margin:60px 24px; visibility:visible;";
        box.innerHTML = "<h3>Nenhuma aba liberada</h3><p>O seu acesso ainda não tem nenhuma área liberada. Fale com o responsável.</p>";
        main.parentNode.insertBefore(box, main);
        main.style.display = "none";
      }
    }
  }
}
