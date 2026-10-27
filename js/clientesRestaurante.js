// =====================================================================
// Clientes (restaurante): quem já veio, quantas vezes, quanto gasta,
// quem sumiu e quem aceita receber promoções. Base para campanhas.
// Visita = dia com conta paga ligada ao cliente (vendas do simulador não contam).
// =====================================================================
import { supabase } from "./supabaseClient.js?v=93";
import { getRange } from "./dateRange.js?v=93";
import { esc, brl, onlyDigits, buscarTodos as todos } from "./erp.js?v=93";

const TZ = "America/Sao_Paulo";
const diaBR = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtDia = (d) => (d ? d.split("-").reverse().join("/") : "-");
export const fmtFone = (p) => {
  let d = onlyDigits(p);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || "-";
};
const nomeDe = (l) => String(l.dados_cliente?.nome || l.name || "").trim() || "Sem nome";

// ---------- Cálculo (sem banco, testável) ----------
export function montarBase({ leads = [], vendas = [], hoje = diaBR(new Date()) }) {
  const porLead = {};
  for (const v of vendas) {
    if (!v.lead_id || v.simulado) continue;
    const d = diaBR(v.paid_at || v.created_at);
    const p = (porLead[v.lead_id] ||= { dias: {}, gasto: 0 });
    p.dias[d] = (p.dias[d] || 0) + Number(v.pagamento?.valor_cobrado ?? v.total ?? 0);
    p.gasto += Number(v.pagamento?.valor_cobrado ?? v.total ?? 0);
  }
  const msDia = 86400000;
  return leads.map((l) => {
    const p = porLead[l.id] || { dias: {}, gasto: 0 };
    const dias = Object.keys(p.dias).sort();
    const ultima = dias[dias.length - 1] || null;
    return {
      id: l.id, nome: nomeDe(l), phone: l.phone, fone: fmtFone(l.phone),
      primeiroContato: l.created_at ? diaBR(l.created_at) : null,
      ultimoContato: l.last_message_at ? diaBR(l.last_message_at) : null,
      dias, diasValor: p.dias, visitas: dias.length,
      primeiraVisita: dias[0] || null, ultimaVisita: ultima,
      diasSemVir: ultima ? Math.round((new Date(hoje) - new Date(ultima)) / msDia) : null,
      gasto: r2(p.gasto), ticket: dias.length ? r2(p.gasto / dias.length) : 0,
      optout: l.fu_optout === true,
      optin: l.fu_optout === true ? false : (l.marketing_optin ?? null),
      aniversario: l.aniversario || l.dados_cliente?.aniversario || null,
      sim: !!l.sim,
    };
  });
}

// Está no período? (chegou, conversou ou veio no período)
const noPeriodo = (c, ini, fim) => !ini || [c.primeiroContato, c.ultimoContato, ...c.dias].some((d) => d && d >= ini && d < fim);
const visitasNoPeriodo = (c, ini, fim) => (!ini ? c.dias : c.dias.filter((d) => d >= ini && d < fim));

export const SEGMENTOS = {
  todos: { label: "Todos", f: () => true },
  consumiram: { label: "Consumiram", f: (c, ini, fim) => visitasNoPeriodo(c, ini, fim).length > 0, dica: "Pagaram pelo menos uma conta no período." },
  novos: { label: "Novos", f: (c, ini, fim, hoje) => !!c.primeiroContato && (ini ? (c.primeiroContato >= ini && c.primeiroContato < fim) : (new Date(hoje) - new Date(c.primeiroContato)) / 86400000 <= 30), dica: "Falaram com o restaurante pela primeira vez no período (em Todo o período: nos últimos 30 dias)." },
  voltaram: { label: "Voltaram", f: (c, ini, fim) => c.visitas >= 2 && visitasNoPeriodo(c, ini, fim).length > 0, dica: "Já vieram mais de uma vez e voltaram no período." },
  frequentes: { label: "Frequentes (3+ visitas)", f: (c) => c.visitas >= 3, dica: "Os clientes fiéis da casa." },
  sumidos: { label: "Sumidos (30+ dias)", f: (c) => c.visitas > 0 && c.diasSemVir >= 30, dica: "Já vieram, mas não voltam há mais de 30 dias. Bom público para uma campanha de retorno." },
  so_oi: { label: "Só mandaram oi", f: (c) => c.visitas === 0, dica: "Falaram com o restaurante, mas ainda não consumiram." },
  aniversario: { label: "Aniversariantes do mês", f: (c, ini, fim, hoje) => !!c.aniversario && String(c.aniversario).slice(5, 7) === hoje.slice(5, 7) },
  aceitam: { label: "Aceitam promoções", f: (c) => c.optin === true, dica: "Só estes podem receber campanhas." },
};

export function filtrar(base, { seg = "todos", periodo = "todos", busca = "", hoje = diaBR(new Date()) }) {
  let ini = null, fim = null;
  if (periodo !== "todos") { const [a, b] = getRange(periodo); ini = diaBR(a); fim = diaBR(b); }
  const q = busca.trim().toLowerCase(), qd = onlyDigits(busca);
  const s = SEGMENTOS[seg] || SEGMENTOS.todos;
  // Segmentos que olham o histórico inteiro não dependem do período
  const usaPeriodo = !["frequentes", "sumidos", "aniversario", "aceitam", "so_oi"].includes(seg);
  return base.filter((c) => (!usaPeriodo || noPeriodo(c, ini, fim)) && s.f(c, ini, fim, hoje)
    && (!q || c.nome.toLowerCase().includes(q) || (qd.length >= 3 && onlyDigits(c.phone).includes(qd))))
    .map((c) => ({ ...c, _ini: ini, _fim: fim }));
}

export function resumo(base) {
  const consumiram = base.filter((c) => c.visitas > 0);
  const gasto = consumiram.reduce((t, c) => t + c.gasto, 0), visitas = consumiram.reduce((t, c) => t + c.visitas, 0);
  const voltaram = consumiram.filter((c) => c.visitas >= 2).length;
  return {
    contatos: base.length, consumiram: consumiram.length, voltaram,
    retorno: consumiram.length ? Math.round(voltaram / consumiram.length * 100) : 0,
    ticket: visitas ? r2(gasto / visitas) : 0, aceitam: base.filter((c) => c.optin === true).length,
  };
}

// ---------- Tela ----------

export async function iniciarClientesRestaurante({ ownerId, openLeadPanel }) {
  const root = document.getElementById("view-rest");
  root.style.display = "";
  const st = { seg: "todos", periodo: "todos", busca: "", modo: "nome", ordem: "nome", base: [], sim: null };
  try { Object.assign(st, JSON.parse(localStorage.getItem("lumos:clientes-rest") || "{}"), { busca: "", sim: null, base: [] }); } catch (_) { /* sem storage */ }
  const salvarPref = () => { try { localStorage.setItem("lumos:clientes-rest", JSON.stringify({ seg: st.seg, periodo: st.periodo, modo: st.modo, ordem: st.ordem })); } catch (_) { /* sem storage */ } };

  root.innerHTML = `
    <h1 style="font-size: 28px;">Clientes</h1>
    <p style="margin-top: 6px;">Todo mundo que já falou com o restaurante: quantas vezes veio, quanto gasta, quem sumiu e quem aceita receber promoções.</p>
    <div class="panel-stat-grid" id="cr-cards" style="margin-top:18px;"></div>
    <div class="filter-bar" id="cr-periodo">
      ${[["todos", "Todo o período"], ["hoje", "Hoje"], ["7d", "Últimos 7 dias"], ["14d", "Últimos 14 dias"], ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["ano", "Este ano"]].map(([k, l]) => `<button class="filter-btn" data-p="${k}">${l}</button>`).join("")}
    </div>
    <div class="cr-segs" id="cr-segs">${Object.entries(SEGMENTOS).map(([k, s]) => `<button class="cr-seg" data-s="${k}" title="${esc(s.dica || "")}">${s.label} <span></span></button>`).join("")}</div>
    <p class="cr-dica" id="cr-dica"></p>
    <div class="erp-toolbar" style="margin-top:6px;">
      <input id="cr-busca" placeholder="Buscar por nome ou telefone" style="min-width:230px;" />
      <div class="cr-toggle" id="cr-modo"><button data-m="nome">Por nome</button><button data-m="dia">Por dia</button></div>
      <select id="cr-ordem"><option value="nome">Ordem: nome (A a Z)</option><option value="ultima">Ordem: última visita</option><option value="visitas">Ordem: mais visitas</option><option value="gasto">Ordem: maior gasto</option></select>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" id="cr-copiar" style="padding:9px 14px;">Copiar números</button>
      <button class="btn btn-primary" id="cr-excel" style="padding:9px 16px;">Baixar lista (Excel)</button>
    </div>
    <div id="cr-lista" style="margin-top:8px;"><p class="cr-dica">Carregando...</p></div>
    <p class="cr-dica" style="margin-top:12px;">Visita é cada dia em que o cliente pagou uma conta. Para campanhas, use só quem <b>aceita promoções</b>: é o que pedem a LGPD e as regras do WhatsApp, e evita que o número da loja seja bloqueado.</p>`;

  const $ = (s) => root.querySelector(s);
  async function carregar() {
    const [leads, vendas] = await Promise.all([
      todos(() => supabase.from("leads").select("*").eq("owner_id", ownerId).order("created_at")),
      todos(() => supabase.from("sales_orders").select("lead_id, paid_at, created_at, total, pagamento, simulado").eq("owner_id", ownerId).eq("status", "pago")),
    ]);
    st.base = montarBase({ leads, vendas });
    render();
  }

  const lista = () => {
    const base = st.sim ? [...st.sim, ...st.base] : st.base;
    const l = filtrar(base, st);
    const ord = { nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"), ultima: (a, b) => String(b.ultimaVisita || "").localeCompare(String(a.ultimaVisita || "")), visitas: (a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome, "pt-BR"), gasto: (a, b) => b.gasto - a.gasto };
    return l.sort(ord[st.ordem] || ord.nome);
  };

  function linha(c) {
    const opt = c.optout ? `<span class="cr-opt off" title="Pediu para não receber mensagens">Pediu para não receber</span>`
      : `<select class="cr-optsel ${c.optin === true ? "sim" : c.optin === false ? "nao" : ""}" data-opt="${c.id}" ${c.sim ? "disabled" : ""}>
          <option value="" ${c.optin == null ? "selected" : ""}>Não perguntado</option><option value="1" ${c.optin === true ? "selected" : ""}>Aceita</option><option value="0" ${c.optin === false ? "selected" : ""}>Não aceita</option></select>`;
    return `<tr data-id="${c.id}" class="${c.sim ? "cr-simrow" : ""}">
      <td><strong>${esc(c.nome)}</strong>${c.sim ? ` <span class="sim-mark">Simulação</span>` : ""}${c.visitas >= 3 ? ` <span class="cr-tag">frequente</span>` : ""}</td>
      <td>${esc(c.fone)}</td>
      <td class="cr-num">${c.visitas}</td>
      <td>${c.ultimaVisita ? `${fmtDia(c.ultimaVisita)}${c.diasSemVir >= 30 ? ` <span class="cr-tag warn">há ${c.diasSemVir} dias</span>` : ""}` : `<span class="cr-muted">nunca consumiu</span>`}</td>
      <td class="cr-num">${brl(c.gasto)}</td>
      <td class="cr-num">${c.visitas ? brl(c.ticket) : "-"}</td>
      <td>${opt}</td></tr>`;
  }
  const cab = `<thead><tr><th>Nome</th><th>WhatsApp</th><th class="cr-num">Visitas</th><th>Última visita</th><th class="cr-num">Total gasto</th><th class="cr-num">Ticket médio</th><th>Promoções</th></tr></thead>`;

  function render() {
    const base = st.sim ? [...st.sim, ...st.base] : st.base;
    const r = resumo(base);
    $("#cr-cards").innerHTML = [["Contatos na base", r.contatos], ["Já consumiram", r.consumiram], ["Voltaram (2+ visitas)", `${r.voltaram} <small>(${r.retorno}%)</small>`], ["Ticket médio por visita", brl(r.ticket)], ["Aceitam promoções", r.aceitam]]
      .map(([l, v]) => `<div class="panel-stat-card"><div><div class="label">${l}</div><div class="value">${v}</div></div></div>`).join("");
    root.querySelectorAll("#cr-periodo .filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.p === st.periodo));
    root.querySelectorAll(".cr-seg").forEach((b) => {
      b.classList.toggle("active", b.dataset.s === st.seg);
      b.querySelector("span").textContent = filtrar(base, { ...st, seg: b.dataset.s }).length;
    });
    root.querySelectorAll("#cr-modo button").forEach((b) => b.classList.toggle("active", b.dataset.m === st.modo));
    $("#cr-ordem").value = st.ordem; $("#cr-ordem").style.display = st.modo === "nome" ? "" : "none";
    $("#cr-dica").textContent = SEGMENTOS[st.seg]?.dica || "";
    const l = lista();
    if (!l.length) { $("#cr-lista").innerHTML = `<div class="empty-state"><h3>Ninguém neste filtro</h3><p>Troque o período ou o grupo acima.</p></div>`; return; }
    if (st.modo === "nome") {
      const grupos = {};
      for (const c of l) { const k = st.ordem === "nome" ? (c.nome[0] || "#").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "Todos"; (grupos[k] ||= []).push(c); }
      $("#cr-lista").innerHTML = `<div class="panel-table-wrap"><table class="panel-table cr-tab">${cab}<tbody>${Object.entries(grupos).map(([k, cs]) => `${st.ordem === "nome" ? `<tr class="cr-letra"><td colspan="7">${esc(k)}</td></tr>` : ""}${cs.map(linha).join("")}`).join("")}</tbody></table></div>`;
    } else {
      // Por dia: quem veio (ou falou) em cada dia, do mais recente para o mais antigo
      const dias = {};
      for (const c of l) {
        const ds = new Set([...visitasNoPeriodo(c, c._ini, c._fim), ...(c.visitas ? [] : [c.ultimoContato || c.primeiroContato].filter((d) => d && (!c._ini || (d >= c._ini && d < c._fim))))]);
        for (const d of ds) (dias[d] ||= []).push(c);
      }
      const chaves = Object.keys(dias).sort().reverse().slice(0, 120);
      $("#cr-lista").innerHTML = chaves.map((d) => {
        const cs = dias[d].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        const total = cs.reduce((t, c) => t + Number(c.diasValor[d] || 0), 0);
        const dtx = new Date(`${d}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
        const dt = dtx.charAt(0).toUpperCase() + dtx.slice(1);
        return `<div class="cr-dia"><div class="cr-dia-h"><b>${esc(dt)}</b><span>${cs.length} cliente(s)${total ? ` · ${brl(total)}` : ""}</span></div>
          <div class="panel-table-wrap"><table class="panel-table cr-tab">${cab}<tbody>${cs.map(linha).join("")}</tbody></table></div></div>`;
      }).join("") || `<div class="empty-state"><h3>Ninguém neste filtro</h3></div>`;
    }
  }

  // ---------- Eventos ----------
  root.addEventListener("click", (e) => {
    const p = e.target.closest("[data-p]"); if (p) { st.periodo = p.dataset.p; salvarPref(); return render(); }
    const s = e.target.closest("[data-s]"); if (s && s.classList.contains("cr-seg")) { st.seg = s.dataset.s; salvarPref(); return render(); }
    const m = e.target.closest("#cr-modo [data-m]"); if (m) { st.modo = m.dataset.m; salvarPref(); return render(); }
    if (e.target.closest("select, .cr-opt")) return;
    const tr = e.target.closest("tr[data-id]");
    if (tr && !tr.classList.contains("cr-simrow")) openLeadPanel(tr.dataset.id, { onChange: carregar });
  });
  $("#cr-busca").addEventListener("input", (e) => { st.busca = e.target.value; render(); });
  $("#cr-ordem").addEventListener("change", (e) => { st.ordem = e.target.value; salvarPref(); render(); });
  root.addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-opt]"); if (!sel) return;
    const v = sel.value === "" ? null : sel.value === "1";
    sel.disabled = true;
    const { error } = await supabase.from("leads").update({ marketing_optin: v }).eq("id", sel.dataset.opt);
    sel.disabled = false;
    if (error) { lumosAlert(/marketing_optin/.test(error.message) ? "Falta aplicar a seção 47 do guia de instalação no banco." : `Não foi possível salvar: ${error.message}`); return carregar(); }
    const c = st.base.find((x) => x.id === sel.dataset.opt); if (c) c.optin = v;
    render();
  });

  $("#cr-copiar").addEventListener("click", async () => {
    if (st.sim) return lumosAlert("Durante a simulação a lista não é copiada.");
    const l = lista();
    const autorizados = l.filter((c) => c.optin === true);
    if (!autorizados.length) return lumosAlert("Ninguém desta lista aceitou receber promoções ainda. Marque na coluna Promoções quem autorizou.");
    if (autorizados.length < l.length && !(await lumosConfirm(`Desta lista, ${autorizados.length} de ${l.length} aceitam promoções. Só esses números serão copiados. Continuar?`))) return;
    const txt = autorizados.map((c) => onlyDigits(c.phone)).join("\n");
    try { await navigator.clipboard.writeText(txt); lumosAlert(`${autorizados.length} número(s) copiado(s).`); } catch (_) { lumosAlert("Não foi possível copiar."); }
  });

  $("#cr-excel").addEventListener("click", async () => {
    if (st.sim) return lumosAlert("Durante a simulação a lista não é baixada.");
    const btn = $("#cr-excel"); const t = btn.textContent; btn.disabled = true; btn.textContent = "Gerando...";
    try {
      if (!window.XLSX) await new Promise((ok, erro) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
      const l = lista();
      const linhas = [[`Clientes: ${SEGMENTOS[st.seg].label}`, `Período: ${root.querySelector(`#cr-periodo [data-p="${st.periodo}"]`).textContent}`, `Gerado em ${new Date().toLocaleString("pt-BR")}`], [],
        ["Nome", "WhatsApp", "Visitas", "Primeira visita", "Última visita", "Dias sem vir", "Total gasto", "Ticket médio", "Aceita promoções", "Primeiro contato", "Aniversário"],
        ...l.map((c) => [c.nome, onlyDigits(c.phone), c.visitas, fmtDia(c.primeiraVisita), fmtDia(c.ultimaVisita), c.diasSemVir ?? "", c.gasto, c.ticket, c.optout ? "Pediu para não receber" : c.optin === true ? "Sim" : c.optin === false ? "Não" : "Não perguntado", fmtDia(c.primeiroContato), c.aniversario ? fmtDia(String(c.aniversario).slice(0, 10)) : ""])];
      const ws = window.XLSX.utils.aoa_to_sheet(linhas);
      ws["!cols"] = [28, 16, 8, 14, 14, 12, 12, 12, 22, 15, 12].map((w) => ({ wch: w }));
      const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      window.XLSX.writeFile(wb, `Lumos_Clientes_${st.seg}_${diaBR(new Date())}.xlsx`);
    } catch (_) { lumosAlert("Não foi possível gerar a planilha agora. Confira a internet e tente de novo."); }
    btn.disabled = false; btn.textContent = t;
  });

  await carregar();

  // ---------- Simulação (só administração; dados só na tela) ----------
  const { botaoSimular, destacar } = await import("./simulacao.js?v=93");
  const hoje = diaBR(new Date());
  const menos = (n) => diaBR(new Date(Date.now() - n * 86400000));
  const fake = (id, nome, dias, valor, optin, extra = {}) => ({ id, nome, phone: "5516999990000", fone: "(16) 99999-0000", primeiroContato: dias[0] || menos(1), ultimoContato: dias[dias.length - 1] || menos(1),
    dias, diasValor: Object.fromEntries(dias.map((d) => [d, valor])), visitas: dias.length, primeiraVisita: dias[0] || null, ultimaVisita: dias[dias.length - 1] || null,
    diasSemVir: dias.length ? Math.round((new Date(hoje) - new Date(dias[dias.length - 1])) / 86400000) : null, gasto: r2(valor * dias.length), ticket: valor, optout: false, optin, aniversario: null, sim: true, ...extra });
  botaoSimular(() => ({
    titulo: "Clientes: a base do restaurante para trazer o cliente de volta",
    antes: "Cada pessoa que manda oi pelo QR Code da mesa ou pelo WhatsApp entra aqui sozinha. Cada conta paga vira uma visita, com o dia e o valor.",
    faz: "Organiza os clientes por nome ou por dia, mostra quantas vezes cada um veio, quanto gasta, quem sumiu e quem aceita receber promoções.",
    depois: "A lista sai em Excel ou com os números copiados para campanhas, sempre só com quem autorizou. Os mesmos dados alimentam o Dashboard e os Relatórios.",
    preparar: () => { st.periodo = "todos"; st.seg = "todos"; st.modo = "nome"; st.ordem = "nome";
      st.sim = [fake("sim1", "Adalberto Souza", [menos(60), menos(32), menos(12), menos(2)], 94.6, true), fake("sim2", "Beatriz Lima", [menos(45)], 120, null), fake("sim3", "Carlos Mendes", [], 0, null)];
      render(); },
    passos: [
      { titulo: "A base de clientes", acao: () => destacar(root.querySelector("#cr-cards")),
        texto: "Nos números de cima o dono vê, de relance, quantas pessoas já falaram com a casa, quantas consumiram, quantas voltaram e o ticket médio por visita." },
      { titulo: "Cada cliente com o seu histórico", acao: () => destacar(root.querySelector('tr[data-id="sim1"]')),
        texto: "O Adalberto já veio 4 vezes, gasta em média R$ 94,60 por visita e aceita receber promoções. Ele ganha a marca de frequente sozinho, sem ninguém precisar anotar nada." },
      { titulo: "Quem sumiu", acao: () => { st.seg = "sumidos"; render(); destacar(root.querySelector('.cr-seg[data-s="sumidos"]')); },
        texto: "No grupo Sumidos aparecem os clientes que já vieram, mas não voltam há mais de 30 dias. A Beatriz está aqui: é o público ideal para uma campanha de retorno." },
      { titulo: "Organizado por dia", acao: () => { st.seg = "todos"; st.modo = "dia"; render(); destacar(root.querySelector(".cr-dia")); },
        texto: "Na visão Por dia, o dono vê quem veio em cada dia e quanto aquele grupo gastou. Serve para entender o movimento da semana e lembrar de quem esteve na casa." },
      { titulo: "Pronto para a campanha", acao: () => { st.modo = "nome"; render(); destacar(root.querySelector("#cr-excel")); },
        texto: "Com um clique a lista sai em Excel ou com os números copiados. Só entra quem aceitou receber promoções, como pede a LGPD, e isso protege o número da loja de bloqueio no WhatsApp." },
    ],
    limpar: () => { st.sim = null; render(); },
  }));
}
