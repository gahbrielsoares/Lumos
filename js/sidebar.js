import { supabase } from "./supabaseClient.js?v=31";

// Itens fixos (sempre visíveis, não desativáveis): dashboard, agents, settings, logout.
// Os demais podem ser desativados via Configurações → Gerenciar Abas.
export const NAV_ITEMS = [
  {
    key: "dashboard", href: "dashboard.html", label: "Dashboard", core: true,
    icon: `<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
  },
  {
    key: "kanban", href: "kanban.html", label: "Kanban",
    icon: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>`,
  },
  {
    key: "leads", href: "leads.html", label: "Leads",
    icon: `<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><circle cx="18" cy="8.5" r="2.5"/><path d="M16 20v-1a5 5 0 0 1 6.5-4.8"/>`,
  },
  {
    key: "clientes", href: "clientes.html", label: "Clientes",
    icon: `<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M16.5 9l1.7 1.7L21.5 7"/>`,
  },
  {
    key: "follow_up", href: "follow-up.html", label: "Follow Up",
    icon: `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>`,
  },
  {
    key: "agendamentos", href: "agendamentos.html", label: "Agendamentos",
    icon: `<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>`,
  },
  {
    key: "produtos", href: "products.html", label: "Produtos",
    icon: `<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>`,
  },
  {
    key: "mesas", href: "mesas.html", label: "Mesas",
    icon: `<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v6M19 13v6"/>`,
  },
  {
    key: "cozinha", href: "cozinha.html", label: "Cozinha",
    icon: `<path d="M6 3v6a2 2 0 0 0 4 0V3M8 9v12M16 3v18"/>`,
  },
  {
    key: "integracoes", href: "integracoes.html", label: "Integrações", core: true,
    icon: `<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>`,
  },
  {
    key: "agents", href: "agents.html", label: "Agentes", core: true,
    icon: `<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>`,
  },
  {
    key: "settings", href: "settings.html", label: "Configurações", core: true,
    icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  },
];

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

  const disabled = await getDisabledTabs();
  const items = NAV_ITEMS.filter((item) => item.core || !disabled.includes(item.key));

  nav.innerHTML = items.map((item) => `
    <a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${item.icon}</svg>
      ${item.label}
    </a>
  `).join("") + `
    <a href="#" id="logout-link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
      Sair
    </a>
  `;
}
