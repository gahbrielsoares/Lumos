// =====================================================================
// Simulação guiada para apresentações (só administrador, suporte e modo suporte)
// 1) Janela com 3 blocos: de onde vêm os dados, o que a página faz, para onde os dados vão.
// 2) "Simular": passo a passo com uma historinha e dados FICTÍCIOS, montados só na tela.
//    Nada é gravado no banco: relatórios, financeiro e notas nunca recebem dados de simulação.
// =====================================================================
import { getAccess } from "./sidebar.js?v=81";
import { barraFerramentas } from "./ajuda.js?v=81";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function podeSimular() {
  try { const a = await getAccess(); return !!(a.isStaff || a.suporte); } catch (_) { return false; }
}

// Destaca um elemento por alguns segundos
export function destacar(el) {
  if (!el) return;
  el.classList.remove("sim-destaque");
  void el.offsetWidth;
  el.classList.add("sim-destaque");
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  setTimeout(() => el.classList.remove("sim-destaque"), 2600);
}

let ativa = null;

// ---------- Ferramentas para montar tutoriais (tudo é desfeito ao sair) ----------
const trocas = [];
// Insere HTML fictício (linhas, cartões) marcado para ser removido no fim
export function ficticio(alvo, html, pos = "afterbegin") {
  const el = typeof alvo === "string" ? document.querySelector(alvo) : alvo;
  if (!el) return null;
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  const nos = [...t.content.children];
  nos.forEach((n) => (n.dataset.simTmp = "1"));
  if (pos === "afterbegin") el.prepend(...nos); else el.append(...nos);
  return nos[0] || null;
}
// Troca o texto de um elemento (ex.: um número de um quadro) e guarda o original
export function trocar(alvo, texto) {
  const el = typeof alvo === "string" ? document.querySelector(alvo) : alvo;
  if (!el) return null;
  if (!trocas.some((t) => t.el === el)) trocas.push({ el, html: el.innerHTML, display: null });
  el.textContent = texto;
  return el;
}
// Esconde um elemento (ex.: aviso de "nenhum item") durante o tutorial
export function esconder(alvo) {
  const el = typeof alvo === "string" ? document.querySelector(alvo) : alvo;
  if (!el) return;
  if (!trocas.some((t) => t.el === el && t.display !== null)) trocas.push({ el, html: null, display: el.style.display });
  el.style.display = "none";
}
function desfazerTudo() {
  document.querySelectorAll("[data-sim-tmp]").forEach((n) => n.remove());
  while (trocas.length) { const t = trocas.pop(); if (t.html !== null) t.el.innerHTML = t.html; if (t.display !== null) t.el.style.display = t.display; }
  const main = document.querySelector(".dash-main"); if (main) main.style.pointerEvents = "";
}

// ---------- Ferramentas para montar tutoriais (tudo é desfeito ao sair) ----------
const trocas = [];
// Insere HTML fictício (linhas, cartões) marcado para ser removido no fim
export function ficticio(alvo, html, pos = "afterbegin") {
  const el = typeof alvo === "string" ? document.querySelector(alvo) : alvo;
  if (!el) return null;
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  const nos = [...t.content.children];
  nos.forEach((n) => (n.dataset.simTmp = "1"));
  if (pos === "afterbegin") el.prepend(...nos); else el.append(...nos);
  return nos[0] || null;
}
// Troca o texto de um elemento (ex.: um número de um quadro) e guarda o original
export function trocar(alvo, texto) {
  const el = typeof alvo === "string" ? document.querySelector(alvo) : alvo;
  if (!el) return null;
  if (!trocas.some((t) => t.el === el)) trocas.push({ el, html: el.innerHTML, display: null });
  el.textContent = texto;
  return el;
}
// Esconde um elemento (ex.: aviso de "nenhum item") durante o tutorial
export function esconder(alvo) {
  const el = typeof alvo === "string" ? document.querySelector(alvo) : alvo;
  if (!el) return;
  if (!trocas.some((t) => t.el === el && t.display !== null)) trocas.push({ el, html: null, display: el.style.display });
  el.style.display = "none";
}
function desfazerTudo() {
  document.querySelectorAll("[data-sim-tmp]").forEach((n) => n.remove());
  while (trocas.length) { const t = trocas.pop(); if (t.html !== null) t.el.innerHTML = t.html; if (t.display !== null) t.el.style.display = t.display; }
  const main = document.querySelector(".dash-main"); if (main) main.style.pointerEvents = "";
}

// ---------------------------------------------------------------------
// Roteiro de apresentação: todas as abas, na ordem da história
// ---------------------------------------------------------------------
export const ROTEIRO = [
  ["dashboard.html", "Dashboard"], ["kanban.html", "Kanban"], ["leads.html", "Leads"], ["follow-up.html", "Follow-up"],
  ["clientes.html", "Clientes"], ["agendamentos.html", "Agendamentos"], ["products.html", "Produtos"], ["mesas.html", "Mesas"],
  ["cozinha.html", "Cozinha"], ["ficha-tecnica.html", "Ficha técnica"], ["estoque.html", "Estoque"], ["compras.html", "Compras"],
  ["caixa.html", "Caixa"], ["financeiro.html", "Financeiro"], ["relatorios.html", "Relatórios"], ["fiscal.html", "Notas fiscais"],
  ["contabilidade.html", "Contabilidade"], ["agents.html", "Agentes (IA)"], ["integracoes.html", "Integrações"],
  ["equipe.html", "Equipe"], ["settings.html", "Configurações"],
];
const RKEY = "lumos:roteiro";
const paginaAtual = () => (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
function lerRoteiro() { try { return JSON.parse(sessionStorage.getItem(RKEY) || "null"); } catch (_) { return null; } }
function gravarRoteiro(r) { try { r ? sessionStorage.setItem(RKEY, JSON.stringify(r)) : sessionStorage.removeItem(RKEY); } catch (_) { /* sem storage */ } }
// Só as abas que existem no menu desta conta (o nicho esconde as que não usa)
function abasVisiveis() {
  const links = new Set([...document.querySelectorAll("#dash-nav a[href]")].map((a) => a.getAttribute("href").split("?")[0].toLowerCase()));
  const lista = ROTEIRO.filter(([h]) => links.has(h));
  return lista.length ? lista : ROTEIRO;
}
function irPara(i) {
  const r = lerRoteiro(); if (!r) return;
  r.i = i; gravarRoteiro(r);
  if (r.ordem[i]) location.href = r.ordem[i];
}
function painelProximo() {
  const r = lerRoteiro(); if (!r) return;
  const i = r.ordem.indexOf(paginaAtual());
  if (i >= 0 && !r.feitas.includes(r.ordem[i])) { r.feitas.push(r.ordem[i]); gravarRoteiro(r); }
  document.getElementById("sim-painel")?.remove();
  const prox = r.ordem[i + 1];
  const p = document.createElement("div");
  p.id = "sim-painel"; p.className = "sim-painel";
  p.innerHTML = prox
    ? `<div class="sim-topo"><span class="sim-selo">Roteiro de apresentação</span><span class="sim-conta">${i + 1} de ${r.ordem.length} concluída</span></div>
       <h4>Próxima: ${esc(r.nomes[i + 1])}</h4><p>Quando quiser, siga para a próxima aba. O tutorial dela abre sozinho.</p>
       <div class="sim-acoes"><button class="btn btn-ghost" data-r="fim">Encerrar roteiro</button><button class="btn btn-primary" data-r="ir">Ir para ${esc(r.nomes[i + 1])} →</button></div>`
    : `<div class="sim-topo"><span class="sim-selo">Roteiro de apresentação</span><span class="sim-conta">${r.ordem.length} de ${r.ordem.length}</span></div>
       <h4>Fim da apresentação</h4><p>Todas as abas do sistema foram apresentadas. O Lumos cuida do cliente do primeiro oi até o relatório do contador.</p>
       <div class="sim-acoes"><button class="btn btn-primary" data-r="fim">Concluir</button></div>`;
  p.querySelector('[data-r="fim"]').addEventListener("click", () => { gravarRoteiro(null); p.remove(); });
  p.querySelector('[data-r="ir"]')?.addEventListener("click", () => irPara(i + 1));
  document.body.appendChild(p);
}
export function abrirRoteiro() {
  const r = lerRoteiro();
  const abas = abasVisiveis();
  const fundo = document.createElement("div");
  fundo.className = "lumos-help-overlay";
  fundo.innerHTML = `<div class="lumos-help-box">
    <div class="lumos-help-head"><h3>Roteiro de apresentação</h3><button class="lumos-help-x" aria-label="Fechar">✕</button></div>
    <p class="lumos-help-intro">Apresenta o sistema inteiro, aba por aba, na ordem da história do cliente. Em cada aba o tutorial abre sozinho; no fim dele, é só seguir para a próxima. Tudo com dados fictícios: nada é salvo.</p>
    <ol class="sim-roteiro">${abas.map(([h, n], i) => `<li class="${r?.feitas?.includes(h) ? "ok" : ""} ${h === paginaAtual() ? "aqui" : ""}"><button data-i="${i}">${esc(n)}</button>${r?.feitas?.includes(h) ? " ✓" : ""}</li>`).join("")}</ol>
    <div class="lumos-help-acoes">
      ${r ? `<button class="btn btn-ghost" data-a="fim">Encerrar roteiro</button>` : ""}
      <button class="btn btn-primary" data-a="ini">${r ? "Recomeçar do início" : "Começar do início"}</button>
    </div></div>`;
  const fechar = () => fundo.remove();
  fundo.querySelector(".lumos-help-x").addEventListener("click", fechar);
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  const novo = () => ({ ordem: abas.map(([h]) => h), nomes: abas.map(([, n]) => n), feitas: [], i: 0 });
  fundo.querySelector('[data-a="ini"]').addEventListener("click", () => { gravarRoteiro(novo()); irPara(0); });
  fundo.querySelector('[data-a="fim"]')?.addEventListener("click", () => { gravarRoteiro(null); fechar(); });
  fundo.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => { const atual = lerRoteiro() || novo(); gravarRoteiro(atual); irPara(Number(b.dataset.i)); }));
  document.body.appendChild(fundo);
}

function painel(passo, i, total, aoContinuar, aoSair) {
  document.getElementById("sim-painel")?.remove();
  const p = document.createElement("div");
  p.id = "sim-painel";
  p.className = "sim-painel";
  p.innerHTML = `
    <div class="sim-topo"><span class="sim-selo">Simulação · dados fictícios, nada é salvo</span><span class="sim-conta">Passo ${i + 1} de ${total}</span></div>
    ${passo.titulo ? `<h4>${esc(passo.titulo)}</h4>` : ""}
    <p>${esc(passo.texto)}</p>
    <div class="sim-acoes">
      <button class="btn btn-ghost" data-s="sair">Sair da simulação</button>
      <button class="btn btn-primary" data-s="ok">${i + 1 === total ? "Concluir" : "Continuar"}</button>
    </div>`;
  p.querySelector('[data-s="ok"]').addEventListener("click", aoContinuar);
  p.querySelector('[data-s="sair"]').addEventListener("click", aoSair);
  document.body.appendChild(p);
  p.querySelector('[data-s="ok"]').focus({ preventScroll: true });
}

export function iniciarSimulacao(cfg) {
  if (ativa) return;
  const fundo = document.createElement("div");
  fundo.className = "lumos-help-overlay";
  fundo.innerHTML = `<div class="lumos-help-box sim-intro" role="dialog" aria-modal="true">
    <div class="lumos-help-head"><h3>${esc(cfg.titulo)}</h3><button class="lumos-help-x" aria-label="Fechar">✕</button></div>
    <div class="sim-blocos">
      <div class="sim-bloco"><b>De onde vem</b><p>${esc(cfg.antes)}</p></div>
      <div class="sim-bloco"><b>O que esta página faz</b><p>${esc(cfg.faz)}</p></div>
      <div class="sim-bloco"><b>Para onde vai</b><p>${esc(cfg.depois)}</p></div>
    </div>
    <div class="lumos-help-acoes"><button class="btn btn-ghost" data-s="x">Fechar</button><button class="btn btn-primary" data-s="go">▶ Simular</button></div>
  </div>`;
  const fechar = () => fundo.remove();
  fundo.querySelector(".lumos-help-x").addEventListener("click", fechar);
  fundo.querySelector('[data-s="x"]').addEventListener("click", fechar);
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  fundo.querySelector('[data-s="go"]').addEventListener("click", async () => {
    fechar();
    ativa = { i: 0 };
    document.body.classList.add("sim-on");
    // Proteção: durante o tutorial nada na página responde ao clique
    const main = document.querySelector(".dash-main"); if (main) main.style.pointerEvents = "none";
    const sair = async () => {
      document.getElementById("sim-painel")?.remove();
      document.body.classList.remove("sim-on");
      ativa = null;
      try { await cfg.limpar?.(); } catch (e) { console.error(e); }
      desfazerTudo();
    };
    const mostrar = async () => {
      const passo = cfg.passos[ativa.i];
      try { await passo.acao?.(); } catch (e) { console.error("Simulação:", e); }
      painel(passo, ativa.i, cfg.passos.length, async () => {
        if (ativa.i + 1 >= cfg.passos.length) return sair();
        ativa.i += 1;
        mostrar();
      }, sair);
    };
    try { await cfg.preparar?.(); } catch (e) { console.error(e); }
    mostrar();
  });
  document.body.appendChild(fundo);
}

// Coloca o botão "Simular" na barra do canto (só para quem pode)
export async function botaoSimular(cfg) {
  if (!(await podeSimular())) return;
  const barra = barraFerramentas();
  barra.querySelector('[data-tool="simular"]')?.remove();
  const b = document.createElement("button");
  b.className = "lumos-tool-btn sim";
  b.dataset.tool = "simular";
  b.innerHTML = `<span aria-hidden="true">▶</span> Simular`;
  b.title = "Apresentação guiada desta página (só administração)";
  b.addEventListener("click", () => iniciarSimulacao(typeof cfg === "function" ? cfg() : cfg));
  barra.prepend(b);
}
