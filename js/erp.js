import { supabase } from "./supabaseClient.js?v=54";
import { getWorkspaceOwnerId } from "./workspace.js?v=54";

// =====================================================================
// Funções comuns das abas de ERP (Financeiro, Estoque, Compras, Relatórios)
// =====================================================================

export const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
export const num = (n, d = 2) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });

// Datas "AAAA-MM-DD" no fuso de Brasília (sem o dia "pular" por causa do UTC)
export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const fmtDate = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
export const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export function monthRange(offset = 0) {
  const [y, m] = todayISO().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

// Dono dos dados (o próprio usuário ou, se for da equipe, o dono do estabelecimento)
export async function ownerId() {
  return getWorkspaceOwnerId();
}

// Movimenta o estoque de um produto e registra no histórico
// tipo: "entrada" soma, "saida" subtrai, "ajuste" define o saldo exato
export async function moverEstoque({ product, tipo, quantidade, motivo, origem = "manual", ref_id = null }) {
  const owner_id = await ownerId();
  const atual = Number(product.estoque || 0);
  const q = Number(quantidade || 0);
  const saldo = tipo === "ajuste" ? q : tipo === "entrada" ? atual + q : atual - q;
  const saldoR = Math.round(saldo * 1000) / 1000;
  const { error } = await supabase.from("products").update({ estoque: saldoR }).eq("id", product.id);
  if (error) return { error };
  await supabase.from("estoque_mov").insert({
    owner_id, product_id: product.id, tipo, quantidade: tipo === "ajuste" ? saldoR - atual : q,
    saldo_apos: saldoR, motivo: motivo || null, origem, ref_id,
  });
  return { saldo: saldoR };
}

// Modal simples reaproveitável
export function modal(html, { width = 520 } = {}) {
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.style.display = "flex";
  back.innerHTML = `<div class="modal-box erp-modal" style="max-width:${width}px;">${html}</div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  return { el: back.querySelector(".modal-box"), close };
}
