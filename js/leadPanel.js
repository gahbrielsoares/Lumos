import { supabase } from "./supabaseClient.js?v=34";
import {
  STAGES, STAGE_LABELS, getLeadById, updateLeadStage, updateLeadFields, listMessages, whatsappLink,
} from "./leads.js?v=34";
import { getIntegration } from "./integrations.js?v=34";

// =====================================================================
// Painel lateral do lead (usado no Kanban e na ficha do lead).
// Mostra resumo, orçamento montado pela IA, conversa completa, botão pra
// abrir no WhatsApp e o interruptor de IA ligada/desligada pro contato.
// =====================================================================

const CSS = `
.lp-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 900; display: none; }
.lp-backdrop.open { display: block; }
.lp { position: fixed; top: 0; right: 0; height: 100%; width: min(520px, 100%); z-index: 901;
  background: #FFFFFF; color: var(--panel-text); box-shadow: -12px 0 40px rgba(0,0,0,.25);
  transform: translateX(100%); transition: transform .25s ease; display: flex; flex-direction: column;
  font-family: var(--panel-font-body); }
:root.dark .lp { background: #0D0D12; border-left: 1px solid var(--panel-border); }
.lp.open { transform: translateX(0); }
.lp-head { padding: 20px 22px 14px; border-bottom: 1px solid var(--panel-border); }
.lp-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.lp-name { font-family: var(--panel-font-display); font-size: 20px; font-weight: 700; }
.lp-phone { font-size: 13px; color: var(--panel-text-muted); margin-top: 2px; }
.lp-close { background: none; border: none; font-size: 26px; line-height: 1; cursor: pointer; color: var(--panel-text-muted); }
.lp-tabs { display: flex; gap: 8px; margin-top: 14px; }
.lp-body { flex: 1; overflow-y: auto; padding: 18px 22px 24px; }
.lp-section { margin-bottom: 20px; }
.lp-k { font-size: 12px; color: var(--panel-text-muted); margin-bottom: 4px; }
.lp-v { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.lp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-actions .btn { padding: 9px 14px; font-size: 13.5px; }
.lp-ai { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; border: 1px solid var(--panel-border); border-radius: 12px; }
.lp-ai.off { border-color: #D4834A; background: rgba(212,131,74,.08); }
.lp-ai-title { font-weight: 600; font-size: 14px; }
.lp-ai-sub { font-size: 12.5px; color: var(--panel-text-muted); margin-top: 2px; }
.lp-quote { border: 1px solid var(--panel-accent); border-radius: 12px; padding: 14px; background: var(--panel-accent-light); }
.lp-quote table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.lp-quote th { text-align: left; font-weight: 500; color: var(--panel-text-muted); font-size: 12px; padding-bottom: 6px; }
.lp-quote td { padding: 5px 0; border-top: 1px solid var(--panel-border); }
.lp-quote td.num, .lp-quote th.num { text-align: right; }
.lp-quote .total { font-weight: 700; font-size: 15px; }
.lp-warn { font-size: 12.5px; color: #D4834A; margin-top: 8px; }
.lp-chat { display: flex; flex-direction: column; gap: 8px; }
.lp-msg { max-width: 82%; padding: 9px 12px; border-radius: 12px; font-size: 13.5px; line-height: 1.45; word-wrap: break-word; }
.lp-text { white-space: pre-wrap; }
.lp-msg.in { align-self: flex-start; background: rgba(127,127,127,.12); border-bottom-left-radius: 4px; }
.lp-msg.out { align-self: flex-end; background: rgba(74,124,89,.16); border-bottom-right-radius: 4px; }
.lp-msg time { display: block; font-size: 11px; color: var(--panel-text-muted); margin-top: 4px; }
.lp-msg.out.vendedor { background: rgba(74,111,165,.18); }
.lp-who { display: block; font-size: 11px; font-weight: 600; color: var(--panel-text-muted); margin-bottom: 2px; }
.lp-composer { border-top: 1px solid var(--panel-border); padding: 12px 16px 16px; display: none; gap: 8px; align-items: flex-end; }
.lp-composer.show { display: flex; }
.lp-composer textarea { flex: 1; resize: none; min-height: 44px; max-height: 140px; padding: 11px 12px; border-radius: 12px;
  border: 1px solid var(--panel-border); background: var(--panel-bg); color: var(--panel-text); font-family: var(--panel-font-body); font-size: 14px; }
.lp-composer textarea:focus { outline: none; border-color: var(--panel-accent); }
.lp-composer .btn { padding: 11px 16px; }
.lp-send-msg { font-size: 12.5px; padding: 0 16px 10px; display: none; }
.lp-send-msg.show { display: block; }
.lp-send-msg.error { color: #B94040; }
.lp-send-msg.ok { color: #4A7C59; }
.lp-empty { color: var(--panel-text-muted); font-size: 13.5px; }
.lp .panel-select { width: 100%; }
.lp .btn-ghost { color: var(--panel-text); border-color: var(--panel-border); font-family: var(--panel-font-body); text-decoration: none; }
.lp .btn-ghost:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
.lp .btn-primary { background: var(--panel-accent); font-family: var(--panel-font-body); }
.lp .pill-tab { background: var(--panel-card); border-color: var(--panel-border); color: var(--panel-text-muted); font-family: var(--panel-font-body); }
.lp .pill-tab.active { background: var(--panel-accent-light); border-color: var(--panel-accent); color: var(--panel-accent); animation: none; box-shadow: none; }
.lp .toggle-input { background: var(--panel-border); }
.lp .toggle-input:checked { background: var(--panel-accent); }
`;

let root, state = { lead: null, order: null, tab: "resumo", onChange: null, timer: null };

const ORDER_STATUS = {
  aguardando_aprovacao: "Aguardando aprovação",
  aguardando_pagamento: "Link enviado — aguardando pagamento",
  pago: "Pago",
  cancelado: "Cancelado",
};
const LOG_STATUS = {
  saiu_para_entrega: "Saiu para entrega",
  pronto_para_retirada: "Pronto para retirada",
  entregue: "Entregue",
};
const UNIT = { m2: "m²", saco: "saco(s)", unidade: "un.", caixa: "cx", metro: "m", kg: "kg", litro: "L", rolo: "rolo(s)" };
const qty = (n) => String(Math.round(Number(n) * 1000) / 1000).replace(".", ",");

async function loadOrder(leadId) {
  const { data } = await supabase
    .from("sales_orders").select("*").eq("lead_id", leadId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

async function orderAction(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke("orders", { body: { action, order_id: state.order.id, ...extra } });
  if (error || data?.error) {
    let m = data?.error || error?.message || "Erro";
    try { const b = await error?.context?.json(); if (b?.error) m = b.error; } catch (_) { /* sem JSON */ }
    throw new Error(m);
  }
  return data;
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Mostra a formatação do WhatsApp (*negrito*, ~tachado~) como no celular
const waFormat = (t) => esc(t).replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>").replace(/~([^~\n]+)~/g, "<s>$1</s>");
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ensureDom() {
  if (root) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  root = document.createElement("div");
  root.innerHTML = `
    <div class="lp-backdrop" id="lp-backdrop"></div>
    <aside class="lp" id="lp" aria-hidden="true">
      <div class="lp-head">
        <div class="lp-head-row">
          <div>
            <div class="lp-name" id="lp-name"></div>
            <div class="lp-phone" id="lp-phone"></div>
          </div>
          <button class="lp-close" id="lp-close" aria-label="Fechar">×</button>
        </div>
        <div class="pill-tabs lp-tabs">
          <button type="button" class="pill-tab" data-lp-tab="resumo">Resumo</button>
          <button type="button" class="pill-tab" data-lp-tab="conversa">Conversa</button>
        </div>
      </div>
      <div class="lp-body" id="lp-body"></div>
      <div class="lp-send-msg" id="lp-send-msg"></div>
      <div class="lp-composer" id="lp-composer">
        <textarea id="lp-input" rows="1" placeholder="Escreva uma mensagem para o cliente…"></textarea>
        <button class="btn btn-primary" id="lp-send">Enviar</button>
      </div>
    </aside>`;
  document.body.appendChild(root);

  document.getElementById("lp-close").addEventListener("click", closeLeadPanel);
  document.getElementById("lp-backdrop").addEventListener("click", closeLeadPanel);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeLeadPanel());
  root.querySelectorAll("[data-lp-tab]").forEach((b) =>
    b.addEventListener("click", () => { state.tab = b.dataset.lpTab; render(); })
  );

  const input = document.getElementById("lp-input");
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = `${input.scrollHeight}px`; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById("lp-send").addEventListener("click", sendMessage);
}

function showSendMsg(text, kind) {
  const el = document.getElementById("lp-send-msg");
  el.textContent = text;
  el.className = `lp-send-msg show ${kind}`;
  if (kind === "ok") setTimeout(() => (el.className = "lp-send-msg"), 4000);
}

// Envia pela Edge Function send-message (confere o login e usa o WhatsApp do agente)
async function sendMessage() {
  const input = document.getElementById("lp-input");
  const btn = document.getElementById("lp-send");
  const text = input.value.trim();
  if (!text || btn.disabled) return;

  btn.disabled = true;
  btn.textContent = "Enviando…";
  const { data, error } = await supabase.functions.invoke("send-message", { body: { lead_id: state.lead.id, text } });
  btn.disabled = false;
  btn.textContent = "Enviar";

  if (error || data?.error) {
    let m = data?.error || error?.message || "Não foi possível enviar.";
    try { const b = await error?.context?.json(); if (b?.error) m = b.error; } catch (_) { /* resposta sem JSON */ }
    showSendMsg(m, "error");
    return;
  }

  input.value = "";
  input.style.height = "auto";
  if (data?.ai_paused) {
    showSendMsg("Enviado. A IA foi pausada para este contato — reative no interruptor quando quiser.", "ok");
    state.lead = await getLeadById(state.lead.id);
    state.onChange?.(state.lead);
  } else {
    showSendMsg("Enviado.", "ok");
  }
  render();
}

export async function openLeadPanel(leadId, { tab = "resumo", onChange = null } = {}) {
  ensureDom();
  state.onChange = onChange;
  state.tab = tab;
  const lead = await getLeadById(leadId);
  if (!lead) return;
  state.lead = lead;
  state.order = await loadOrder(leadId);
  document.getElementById("lp-backdrop").classList.add("open");
  document.getElementById("lp").classList.add("open");
  document.getElementById("lp").setAttribute("aria-hidden", "false");
  render();
}

export function closeLeadPanel() {
  if (!root) return;
  clearInterval(state.timer);
  document.getElementById("lp-backdrop").classList.remove("open");
  document.getElementById("lp").classList.remove("open");
  document.getElementById("lp").setAttribute("aria-hidden", "true");
}

async function refreshLead(fields) {
  if (fields) await updateLeadFields(state.lead.id, fields);
  state.lead = await getLeadById(state.lead.id);
  state.order = await loadOrder(state.lead.id);
  state.onChange?.(state.lead);
  render();
}

function render() {
  clearInterval(state.timer);
  const l = state.lead;
  document.getElementById("lp-name").textContent = l.name || l.phone;
  document.getElementById("lp-phone").textContent = l.phone;
  root.querySelectorAll("[data-lp-tab]").forEach((b) => b.classList.toggle("active", b.dataset.lpTab === state.tab));
  document.getElementById("lp-composer").classList.toggle("show", state.tab === "conversa");
  if (state.tab !== "conversa") document.getElementById("lp-send-msg").className = "lp-send-msg";
  if (state.tab === "conversa") renderChat();
  else renderSummary();
}

function aiBlock(l) {
  const on = l.ai_enabled !== false;
  return `
    <div class="lp-ai ${on ? "" : "off"}">
      <div>
        <div class="lp-ai-title">${on ? "IA atendendo este contato" : "IA desativada para este contato"}</div>
        <div class="lp-ai-sub">${on ? "Desative para um vendedor assumir a conversa." : "Um vendedor está no atendimento. As mensagens continuam salvas, mas a IA não responde."}</div>
      </div>
      <input type="checkbox" class="toggle-input" id="lp-ai" ${on ? "checked" : ""} />
    </div>`;
}

// Tabela do pedido (pedido real em sales_orders; se não houver, o orçamento salvo no lead)
function quoteBlock(l) {
  const o = state.order;
  const q = o || l.orcamento;
  if (!q?.itens?.length) {
    return `<div class="lp-empty">Nenhum orçamento montado pela IA ainda.${l.resumo_conversa ? " Veja o resumo acima." : ""}</div>`;
  }
  const subtotal = o ? Number(o.subtotal) : Number(q.total || 0);
  const frete = q.frete;
  const e = q.entrega || {};
  const editableFrete = o?.status === "aguardando_aprovacao";
  const missing = q.itens.some((i) => !i.product_id);
  const noStock = q.itens.some((i) => i.sem_estoque);
  return `
    <div class="lp-quote">
      ${o ? `<div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:8px;"><strong>Pedido #${o.numero}</strong><span class="lp-k" style="margin:0;">${ORDER_STATUS[o.status] || o.status}</span></div>` : ""}
      <table>
        <tr><th>Item</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Subtotal</th></tr>
        ${q.itens.map((i) => `
          <tr>
            <td>${esc(i.nome)}${i.product_id ? "" : " ⚠️"}${i.sem_estoque ? " 📦" : ""}</td>
            <td class="num">${i.caixas ? `${i.caixas} cx<br><span class="lp-k">${qty(i.quantidade)} m²</span>` : `${qty(i.quantidade)} ${UNIT[i.unidade] || i.unidade || ""}`}</td>
            <td class="num">${i.preco_unitario != null ? brl(i.preco_unitario) : "—"}</td>
            <td class="num">${brl(i.subtotal)}</td>
          </tr>`).join("")}
        <tr>
          <td colspan="3">${e.tipo === "retirada" ? "Retirada na loja" : `Frete${e.local ? ` <span class="lp-k">(${esc(e.local)}${e.prazo ? ` · ${esc(e.prazo)}` : ""})</span>` : ""}`}</td>
          <td class="num">${editableFrete && e.tipo !== "retirada"
            ? `<input type="number" id="lp-frete" min="0" step="0.01" value="${frete ?? ""}" placeholder="R$" style="width:90px; text-align:right; padding:4px 6px; border-radius:8px; border:1px solid var(--panel-border); background:var(--panel-bg); color:var(--panel-text);" />`
            : frete != null ? (Number(frete) === 0 ? "Grátis" : brl(frete)) : "a calcular"}</td>
        </tr>
        <tr><td colspan="3" class="total">Total</td><td class="num total">${brl(subtotal + Number(frete || 0))}</td></tr>
      </table>
      ${clienteBlock(o)}
      ${missing ? `<div class="lp-warn">⚠️ Item não encontrado no catálogo — confira o nome e o preço antes de aprovar.</div>` : ""}
      ${noStock ? `<div class="lp-warn">📦 Quantidade maior que o estoque cadastrado — confirme a disponibilidade.</div>` : ""}
      ${o?.pagamento?.link ? `<div class="lp-k" style="margin-top:8px;">Link de pagamento: <a href="${o.pagamento.link}" target="_blank" rel="noopener">abrir</a>${o.simulado ? " (simulado)" : ""}</div>` : ""}
      ${o?.status === "pago" ? `<div class="lp-k" style="margin-top:8px; color:#4A7C59;">✅ Pago em ${new Date(o.paid_at).toLocaleString("pt-BR")}${o.nf_numero ? ` · NF-e nº ${o.nf_numero}` : ""}</div>` : ""}
      <div class="lp-k" style="margin-top:8px;">Montado em ${new Date(o?.created_at || q.criado_em).toLocaleString("pt-BR")}</div>
    </div>`;
}

// Cliente e endereço de entrega do pedido (coletados pela IA)
function clienteBlock(o) {
  if (!o) return "";
  const c = o.cliente || {};
  const a = o.entrega?.endereco;
  const rows = [
    c.razao_social && `🏢 ${esc(c.razao_social)}${c.ie ? ` · IE ${esc(c.ie)}` : ""}`,
    c.nome && `👤 ${esc(c.nome)}${c.cpf ? ` · ${esc(c.cpf)}` : ""}${c.email ? ` · ${esc(c.email)}` : ""}`,
    a && `📍 ${esc([[a.rua, a.numero].filter(Boolean).join(", "), a.complemento, a.bairro, a.cidade, a.cep && `CEP ${a.cep}`].filter(Boolean).join(" · "))}`,
    a?.tipo_imovel && `🏠 ${esc(a.tipo_imovel)}`,
    a?.referencia && `🧭 ${esc(a.referencia)}`,
    a?.recebedor && `🙋 Recebe: ${esc(a.recebedor)}`,
    o.entrega?.janela && `🕘 Período: ${esc(o.entrega.janela)}`,
    o.logistica?.status && `🚦 ${LOG_STATUS[o.logistica.status] || o.logistica.status}`,
    o.entrega?.tipo === "retirada" && "🏬 Retirada na loja",
  ].filter(Boolean);
  const faltando = o.entrega?.tipo !== "retirada" && (!a?.rua || !a?.numero);
  return `<div style="margin-top:10px; font-size:13px; line-height:1.6;">${rows.join("<br>")}</div>
    ${faltando ? `<div class="lp-warn">📍 Endereço incompleto — confirme com o cliente antes de aprovar.</div>` : ""}`;
}

function orderActions() {
  const o = state.order;
  if (!o) return `
    <button class="btn btn-ghost" id="lp-talk">Conversar com o cliente</button>
    <button class="btn btn-ghost" id="lp-close-deal" style="color:#B94040; border-color:#B94040;">Encerrar atendimento</button>`;
  if (o.status === "aguardando_aprovacao") return `
    <button class="btn btn-primary" id="lp-approve">Aprovar e enviar link</button>
    <button class="btn btn-ghost" id="lp-talk">Conversar com o cliente</button>
    <button class="btn btn-ghost" id="lp-close-deal" style="color:#B94040; border-color:#B94040;">Encerrar atendimento</button>`;
  if (o.status === "aguardando_pagamento") return `
    ${o.simulado && o.pagamento?.link ? `<a class="btn btn-primary" href="${o.pagamento.link}" target="_blank" rel="noopener">Abrir pagamento (simular)</a>` : ""}
    <button class="btn ${o.simulado ? "btn-ghost" : "btn-primary"}" id="lp-paid">Confirmar pagamento recebido</button>
    <button class="btn btn-ghost" id="lp-talk">Conversar com o cliente</button>
    <button class="btn btn-ghost" id="lp-close-deal" style="color:#B94040; border-color:#B94040;">Cancelar pedido</button>`;
  if (o.status === "pago") {
    const st = o.logistica?.status;
    if (st === "entregue") return "";
    const retirada = o.entrega?.tipo === "retirada";
    return `
      ${!retirada && st !== "saiu_para_entrega" ? `<button class="btn btn-primary" data-log="dispatch">🚚 Saiu para entrega</button>` : ""}
      ${retirada && st !== "pronto_para_retirada" ? `<button class="btn btn-primary" data-log="ready_pickup">📦 Pronto para retirada</button>` : ""}
      <button class="btn ${st ? "btn-primary" : "btn-ghost"}" data-log="delivered">✅ ${retirada ? "Retirado" : "Entregue"}</button>`;
  }
  return "";
}

async function renderSummary() {
  const l = state.lead;
  const body = document.getElementById("lp-body");
  const o = state.order;
  const waiting = (o && ["aguardando_aprovacao", "aguardando_pagamento"].includes(o.status)) || l.stage === "aguardando_link";

  body.innerHTML = `
    <div class="lp-section">${aiBlock(l)}</div>

    <div class="lp-section lp-actions">
      <button class="btn btn-ghost" id="lp-open-chat">Abrir conversa</button>
      <a class="btn btn-ghost" href="${whatsappLink(l.phone)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
      <a class="btn btn-ghost" href="${l.is_client ? "clientes" : "leads"}.html?id=${l.id}">Ficha completa</a>
    </div>

    ${waiting ? `
      <div class="lp-section">
        <div class="lp-k">${o?.status === "aguardando_pagamento" ? "Pedido aguardando pagamento" : "Orçamento para aprovação"}</div>
        ${quoteBlock(l)}
        <div class="lp-actions" style="margin-top:12px;">${orderActions()}</div>
        <div class="lp-warn" id="lp-approve-msg" style="display:none;"></div>
      </div>` : ""}

    <div class="lp-section">
      <div class="lp-k">Etapa no funil</div>
      <select class="panel-select" id="lp-stage">
        ${STAGES.map((s) => `<option value="${s}" ${s === l.stage ? "selected" : ""}>${STAGE_LABELS[s]}</option>`).join("")}
      </select>
    </div>
    <div class="lp-section"><div class="lp-k">Motivo do contato</div><div class="lp-v">${esc(l.motivo_contato || "—")}</div></div>
    <div class="lp-section"><div class="lp-k">Resumo da conversa</div><div class="lp-v">${esc(l.resumo_conversa || "—")}</div></div>
    ${!waiting && (o?.itens?.length || l.orcamento?.itens?.length) ? `<div class="lp-section"><div class="lp-k">${o?.status === "pago" ? "Último pedido" : "Último orçamento"}</div>${quoteBlock(l)}
      ${o?.status === "pago" ? `<div class="lp-actions" style="margin-top:12px;">${orderActions()}</div><div class="lp-warn" id="lp-log-msg" style="display:none;"></div>` : ""}</div>` : ""}
  `;

  document.getElementById("lp-ai").addEventListener("change", (e) => refreshLead({ ai_enabled: e.target.checked }));
  document.getElementById("lp-open-chat").addEventListener("click", () => { state.tab = "conversa"; render(); });
  document.getElementById("lp-stage").addEventListener("change", async (e) => {
    await updateLeadStage(l.id, e.target.value);
    refreshLead();
  });

  // Pós-venda (pedido pago): avisa o cliente de cada etapa
  body.querySelectorAll("[data-log]").forEach((btn) => btn.addEventListener("click", async () => {
    const labels = { dispatch: "avisar o cliente que o pedido saiu para entrega", ready_pickup: "avisar o cliente que o pedido está pronto para retirada", delivered: "marcar como entregue e avisar o cliente" };
    if (!confirm(`Confirmar: ${labels[btn.dataset.log]}?`)) return;
    const msg = document.getElementById("lp-log-msg");
    btn.disabled = true;
    try { await orderAction(btn.dataset.log); await refreshLead(); }
    catch (err) { btn.disabled = false; msg.textContent = err.message; msg.style.display = "block"; }
  }));

  if (waiting) {
    const on = (id, fn) => document.getElementById(id)?.addEventListener("click", fn);
    const run = async (btnId, fn) => {
      const btn = document.getElementById(btnId);
      const msg = document.getElementById("lp-approve-msg");
      btn.disabled = true;
      msg.style.display = "none";
      try { await fn(); await refreshLead(); }
      catch (err) { btn.disabled = false; msg.textContent = err.message; msg.style.display = "block"; }
    };
    on("lp-approve", () => run("lp-approve", async () => {
      if (!state.order) return approveLegacy();
      const freteEl = document.getElementById("lp-frete");
      await orderAction("approve", freteEl && freteEl.value !== "" ? { frete: Number(freteEl.value) } : {});
    }));
    on("lp-paid", () => {
      if (!confirm("Confirmar que o pagamento deste pedido foi recebido? O cliente vai receber a confirmação no WhatsApp.")) return;
      run("lp-paid", () => orderAction("mark_paid"));
    });
    on("lp-talk", async () => {
      window.open(whatsappLink(l.phone), "_blank", "noopener");
      await refreshLead({ ai_enabled: false });
    });
    on("lp-close-deal", async () => {
      if (!confirm(state.order ? "Cancelar este pedido? O lead vai para \"Perdido\"." : "Encerrar este atendimento? O lead vai para \"Perdido\".")) return;
      if (state.order) await orderAction("cancel");
      else await updateLeadStage(l.id, "perdido");
      refreshLead();
    });
  }
}

// Aprovação: registra quem/quando aprovou. O envio automático do link entra
// quando a integração de pagamento for conectada de verdade.
async function approveLegacy() {
  const msg = document.getElementById("lp-approve-msg");
  const pay = await getIntegration("pagamento");
  const { data: userData } = await supabase.auth.getUser();

  await updateLeadFields(state.lead.id, {
    orcamento: { ...(state.lead.orcamento || {}), aprovado_em: new Date().toISOString(), aprovado_por: userData?.user?.email || null },
  });

  msg.style.display = "block";
  if (!pay?.enabled) {
    msg.textContent = "Orçamento aprovado. Nenhuma integração de pagamento ativa — envie o link ou a chave Pix manualmente pelo WhatsApp.";
  } else {
    msg.textContent = `Orçamento aprovado. O envio automático do link pelo ${pay.provider} ainda está em desenvolvimento — por enquanto, envie o link manualmente.`;
  }
  state.lead = await getLeadById(state.lead.id);
  state.onChange?.(state.lead);
}

async function renderChat() {
  const body = document.getElementById("lp-body");
  const l = state.lead;

  const draw = async () => {
    const msgs = await listMessages(l.id);
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    body.innerHTML = `
      <div class="lp-section">${aiBlock(l)}</div>
      <div class="lp-section lp-actions">
        <a class="btn btn-ghost" href="${whatsappLink(l.phone)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
      </div>
      <div class="lp-chat">
        ${msgs.length ? msgs.map((m) => `
          <div class="lp-msg ${m.direction === "in" ? "in" : `out ${m.sender === "vendedor" ? "vendedor" : ""}`}">${m.direction === "out" ? `<span class="lp-who">${m.sender === "vendedor" ? "Vendedor" : m.sender === "sistema" ? "Sistema" : "IA"}</span>` : ""}<span class="lp-text">${waFormat(m.text)}</span><time>${new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></div>`).join("") : `<div class="lp-empty">Nenhuma mensagem ainda.</div>`}
      </div>`;
    document.getElementById("lp-ai").addEventListener("change", (e) => refreshLead({ ai_enabled: e.target.checked }));
    if (atBottom || !draw.done) body.scrollTop = body.scrollHeight;
    draw.done = true;
  };

  await draw();
  // Atualiza a conversa a cada 8s enquanto o painel está aberto nessa aba
  state.timer = setInterval(() => state.tab === "conversa" && draw(), 8000);
}
