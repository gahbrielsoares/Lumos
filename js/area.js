// =====================================================================
// Área de trabalho do Lumos (inicio.html)
// Barra no estilo dock (Lumos, CRM, ERP e as páginas abertas), painéis com os ícones de cada grupo,
// páginas abertas como janelas (alternar sem perder o que estava na tela) e favoritos na área de trabalho.
// =====================================================================
import { requireSession, signOut } from "./auth.js?v=91";
import { alternarTema } from "./theme.js?v=91";
import { itensDoMenu, barraModoDemo, prepararModoOffline } from "./sidebar.js?v=91";
import { supabase } from "./supabaseClient.js?v=91";

const MAX_JANELAS = 8;
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const $ = (id) => document.getElementById(id);

await requireSession();
prepararModoOffline();
const { data: sessao } = await supabase.auth.getUser();
const uid = sessao?.user?.id || "anon";
const { items, access } = await itensDoMenu();
if (access.demo) barraModoDemo(access.modo);

// ---------- Grupos ----------
const GRUPOS = {
  crm: { nome: "CRM", itens: items.filter((i) => i.key === "dashboard" || i.group === "crm") },
  erp: { nome: "ERP", itens: items.filter((i) => i.group === "erp") },
  lumos: { nome: "Lumos", itens: items.filter((i) => !i.group && i.key !== "dashboard") },
};
const porKey = Object.fromEntries(items.map((i) => [i.key, i]));
const grupoDe = (i) => (i.key === "dashboard" || i.group === "crm" ? "crm" : i.group === "erp" ? "erp" : "lumos");
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const tile = (i, extra = "") => `<span class="ad-tile ad-${grupoDe(i)} ${extra}">${svg(i.icon)}</span>`;
const itemDoArquivo = (href) => { const arq = String(href).split(/[?#]/)[0]; return items.find((i) => i.href === arq) || (arq === "caixa.html" ? porKey.pdv : null); };

// ---------- Janelas ----------
const janelas = [];   // { key, el, iframe, usado }
let ativa = null;
const chaveSessao = `lumos:janelas:${uid}`;
function salvarSessao() { try { sessionStorage.setItem(chaveSessao, JSON.stringify({ abertas: janelas.map((j) => j.key), ativa: ativa?.key || null })); } catch (_) { /* sem storage */ } }

function abrir(item, href) {
  if (!item) return;
  fecharPainel();
  let j = janelas.find((x) => x.key === item.key);
  if (!j) {
    if (janelas.length >= MAX_JANELAS) {
      const velha = [...janelas].filter((x) => x !== ativa).sort((a, b) => a.usado - b.usado)[0];
      if (velha) fechar(velha);
    }
    const el = document.createElement("section");
    el.className = "ad-janela"; el.dataset.key = item.key;
    el.innerHTML = `<header class="ad-janela-barra">
        <div class="ad-semaforo"><button class="vermelho" data-acao="fechar" title="Fechar" aria-label="Fechar"></button><button class="amarelo" data-acao="minimizar" title="Minimizar" aria-label="Minimizar"></button></div>
        <span class="ad-janela-titulo">${tile(item, "mini")}${esc(item.label)}</span><span class="ad-janela-espaco"></span></header>
      <iframe title="${esc(item.label)}" src="${esc(href || item.href)}"></iframe>`;
    $("ad-janelas").appendChild(el);
    j = { key: item.key, item, el, iframe: el.querySelector("iframe"), usado: Date.now() };
    janelas.push(j);
    el.querySelector('[data-acao="fechar"]').addEventListener("click", () => fechar(j));
    el.querySelector('[data-acao="minimizar"]').addEventListener("click", () => mostrar(null));
    // Se a página dentro da janela sair do painel (login, assinatura), a área de trabalho inteira acompanha
    j.iframe.addEventListener("load", () => {
      try {
        const arq = j.iframe.contentWindow.location.pathname.split("/").pop();
        if (/^(login|signup|plans|index)\.html$/.test(arq)) location.href = arq + j.iframe.contentWindow.location.search;
      } catch (_) { /* outra origem: ignora */ }
    });
  } else if (href && href !== item.href) {
    j.iframe.src = href;
  }
  mostrar(j);
}
function mostrar(j) {
  ativa = j;
  janelas.forEach((x) => x.el.classList.toggle("ativa", x === j));
  document.body.classList.toggle("ad-com-janela", !!j);
  if (j) { j.usado = Date.now(); document.title = `${j.item.label} | Lumos`; } else document.title = "Lumos";
  pintarDock(); salvarSessao();
}
function fechar(j) {
  j.el.remove();
  janelas.splice(janelas.indexOf(j), 1);
  if (ativa === j) mostrar([...janelas].sort((a, b) => b.usado - a.usado)[0] || null);
  else { pintarDock(); salvarSessao(); }
}
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.lumos !== "abrir") return;
  const it = itemDoArquivo(e.data.href);
  if (it) abrir(it, e.data.href); else location.href = e.data.href;
});

// ---------- Dock ----------
function pintarDock() {
  $("ad-abertas").innerHTML = janelas.map((j) => `<button class="ad-dock-app ${j === ativa ? "ativa" : ""}" data-janela="${j.key}" title="${esc(j.item.label)}">
      ${tile(j.item)}<span class="ad-ponto"></span><span class="ad-fechar" data-fechar="${j.key}" title="Fechar">×</span></button>`).join("");
  $("ad-sep").style.display = janelas.length ? "" : "none";
  document.querySelectorAll(".ad-dock-grupo").forEach((b) => b.classList.toggle("aberto", b.dataset.grupo === painelAberto));
}
$("ad-abertas").addEventListener("click", (e) => {
  const x = e.target.closest("[data-fechar]");
  if (x) { e.stopPropagation(); return fechar(janelas.find((j) => j.key === x.dataset.fechar)); }
  const b = e.target.closest("[data-janela]"); if (!b) return;
  const j = janelas.find((x) => x.key === b.dataset.janela);
  fecharPainel();
  mostrar(j === ativa ? null : j);   // clicar na janela que está na frente minimiza
});
$("ad-abertas").addEventListener("auxclick", (e) => { const b = e.target.closest("[data-janela]"); if (b && e.button === 1) fechar(janelas.find((j) => j.key === b.dataset.janela)); });

// ---------- Painéis (Lumos, CRM, ERP) ----------
let painelAberto = null;
function abrirPainel(grupo) {
  if (painelAberto === grupo) return fecharPainel();
  painelAberto = grupo;
  const g = GRUPOS[grupo], p = $("ad-painel");
  const lista = (filtro) => {
    const fonte = filtro ? items.filter((i) => i.label.toLowerCase().includes(filtro)) : g.itens;
    return fonte.map((i) => `<div class="ad-icone" data-abrir="${i.key}" tabindex="0" role="button">${tile(i)}<span>${esc(i.label)}</span>
        <button class="ad-fixar ${favoritos.some((f) => f.key === i.key) ? "fixo" : ""}" data-fixar="${i.key}" title="${favoritos.some((f) => f.key === i.key) ? "Tirar da área de trabalho" : "Fixar na área de trabalho"}">${svg('<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>')}</button></div>`).join("")
      || `<p class="ad-vazio">Nada encontrado.</p>`;
  };
  p.innerHTML = `<div class="ad-painel-topo"><b>${grupo === "lumos" ? "Lumos" : g.nome}</b>
      <label class="ad-busca">${svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')}<input id="ad-busca" placeholder="Buscar em todo o sistema" autocomplete="off" /></label></div>
    <div class="ad-grade" id="ad-grade">${lista("")}</div>
    ${grupo === "lumos" ? `<div class="ad-painel-rodape"><span class="ad-usuario">${svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>')}${esc(sessao?.user?.email || "")}</span>
      <span style="flex:1"></span>
      <button class="ad-acao" id="ad-tema">${svg('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>')}<span>${document.documentElement.classList.contains("dark") ? "Modo claro" : "Modo escuro"}</span></button>
      <button class="ad-acao" id="ad-area">${svg('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/>')}<span>Área de trabalho</span></button>
      <button class="ad-acao sair" id="ad-sair">${svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')}<span>Sair</span></button></div>` : ""}`;
  p.className = `ad-painel aberto ad-painel-${grupo}`;
  $("ad-busca").addEventListener("input", (e) => { $("ad-grade").innerHTML = lista(e.target.value.trim().toLowerCase()); });
  $("ad-tema")?.addEventListener("click", (e) => { const t = alternarTema(); e.currentTarget.querySelector("span").textContent = t === "dark" ? "Modo claro" : "Modo escuro"; });
  $("ad-area")?.addEventListener("click", () => { fecharPainel(); mostrar(null); });
  $("ad-sair")?.addEventListener("click", () => signOut());
  setTimeout(() => $("ad-busca")?.focus({ preventScroll: true }), 30);
  pintarDock();
}
function fecharPainel() { painelAberto = null; $("ad-painel").className = "ad-painel"; pintarDock(); }
$("ad-painel").addEventListener("click", (e) => {
  const f = e.target.closest("[data-fixar]");
  if (f) { e.stopPropagation(); alternarFavorito(f.dataset.fixar); f.classList.toggle("fixo"); return; }
  const a = e.target.closest("[data-abrir]"); if (a) abrir(porKey[a.dataset.abrir]);
});
$("ad-painel").addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = e.target.closest("[data-abrir]"); if (a) abrir(porKey[a.dataset.abrir]); } });
document.querySelectorAll(".ad-dock-grupo").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); abrirPainel(b.dataset.grupo); }));
document.addEventListener("click", (e) => { if (painelAberto && !e.target.closest("#ad-painel, .ad-dock-grupo")) fecharPainel(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharPainel(); });

// ---------- Favoritos na área de trabalho (arrastar e organizar) ----------
const chaveFav = `lumos:area:${uid}`;
let favoritos = (() => { try { return JSON.parse(localStorage.getItem(chaveFav) || "null"); } catch (_) { return null; } })();
if (!Array.isArray(favoritos)) favoritos = ["dashboard", "kanban", "pdv", "financeiro"].filter((k) => porKey[k]).map((key, n) => ({ key, x: 32, y: 32 + n * 112 }));
favoritos = favoritos.filter((f) => porKey[f.key]);
const salvarFav = () => { try { localStorage.setItem(chaveFav, JSON.stringify(favoritos)); } catch (_) { /* sem storage */ } };
function alternarFavorito(key) {
  const i = favoritos.findIndex((f) => f.key === key);
  if (i >= 0) favoritos.splice(i, 1);
  else { const livre = vagaLivre(); favoritos.push({ key, ...livre }); }
  salvarFav(); pintarArea();
}
const GRADE = { w: 104, h: 112 };
function vagaLivre() {
  const alt = Math.max(1, Math.floor((window.innerHeight - 140) / GRADE.h));
  for (let c = 0; c < 30; c++) for (let l = 0; l < alt; l++) {
    const x = 32 + c * GRADE.w, y = 32 + l * GRADE.h;
    if (!favoritos.some((f) => Math.abs(f.x - x) < 10 && Math.abs(f.y - y) < 10)) return { x, y };
  }
  return { x: 32, y: 32 };
}
// Na tela menor (celular, janela estreita), quem não cabe vai para a próxima vaga livre (sem mudar o que foi salvo)
function posicoesNaTela() {
  const W = $("ad-area").clientWidth || window.innerWidth, H = $("ad-area").clientHeight || window.innerHeight;
  const cabe = (p) => p.x + GRADE.w - 12 <= W && p.y + GRADE.h - 12 <= H;
  const usadas = [], pos = {};
  for (const f of favoritos) if (cabe(f)) { pos[f.key] = { x: f.x, y: f.y }; usadas.push(pos[f.key]); }
  const linhas = Math.max(1, Math.floor((H - 32) / GRADE.h)), colunas = Math.max(1, Math.floor((W - 32) / GRADE.w));
  for (const f of favoritos) if (!pos[f.key]) {
    achou: for (let c = 0; c < colunas; c++) for (let l = 0; l < linhas; l++) {
      const v = { x: 32 + c * GRADE.w, y: 32 + l * GRADE.h };
      if (!usadas.some((u) => Math.abs(u.x - v.x) < GRADE.w - 10 && Math.abs(u.y - v.y) < GRADE.h - 10)) { pos[f.key] = v; usadas.push(v); break achou; }
    }
    pos[f.key] ||= { x: 32, y: 32 };
  }
  return pos;
}
function pintarArea() {
  const pos = posicoesNaTela();
  $("ad-area").innerHTML = favoritos.map((f) => { const i = porKey[f.key];
    return `<div class="ad-icone ad-na-area" data-fav="${f.key}" style="left:${pos[f.key].x}px; top:${pos[f.key].y}px;" tabindex="0" role="button" title="${esc(i.label)}">${tile(i)}<span>${esc(i.label)}</span></div>`; }).join("")
    + (favoritos.length ? "" : `<p class="ad-dica">Abra o CRM ou o ERP na barra abaixo e toque no alfinete de um ícone para deixá-lo aqui.</p>`);
}
// Arrastar: segura e move; solta encaixando na grade. Toque rápido abre.
let arrasto = null;
$("ad-area").addEventListener("pointerdown", (e) => {
  const el = e.target.closest("[data-fav]"); if (!el) return;
  const f = favoritos.find((x) => x.key === el.dataset.fav);
  arrasto = { el, f, x0: e.clientX, y0: e.clientY, fx: parseFloat(el.style.left), fy: parseFloat(el.style.top), moveu: false };
  el.setPointerCapture(e.pointerId);
});
$("ad-area").addEventListener("pointermove", (e) => {
  if (!arrasto) return;
  const dx = e.clientX - arrasto.x0, dy = e.clientY - arrasto.y0;
  if (!arrasto.moveu && Math.hypot(dx, dy) < 6) return;
  arrasto.moveu = true; arrasto.el.classList.add("arrastando");
  arrasto.el.style.left = `${Math.max(0, arrasto.fx + dx)}px`; arrasto.el.style.top = `${Math.max(0, arrasto.fy + dy)}px`;
});
$("ad-area").addEventListener("pointerup", (e) => {
  if (!arrasto) return;
  const { el, f, moveu } = arrasto; arrasto = null;
  if (!moveu) return abrir(porKey[f.key]);
  const area = $("ad-area").getBoundingClientRect();
  const x = Math.min(Math.max(0, Math.round((parseFloat(el.style.left) - 32) / GRADE.w) * GRADE.w + 32), Math.max(32, area.width - GRADE.w));
  const y = Math.min(Math.max(0, Math.round((parseFloat(el.style.top) - 32) / GRADE.h) * GRADE.h + 32), Math.max(32, area.height - GRADE.h));
  const outro = favoritos.find((o) => o !== f && o.x === x && o.y === y);
  if (outro) { outro.x = f.x; outro.y = f.y; }   // troca de lugar com quem estava lá
  f.x = x; f.y = y; salvarFav(); pintarArea();
});
$("ad-area").addEventListener("keydown", (e) => { if (e.key === "Enter") { const el = e.target.closest("[data-fav]"); if (el) abrir(porKey[el.dataset.fav]); } });
$("ad-area").addEventListener("contextmenu", async (e) => {
  const el = e.target.closest("[data-fav]"); if (!el) return;
  e.preventDefault();
  if (await lumosConfirm(`Tirar "${porKey[el.dataset.fav].label}" da área de trabalho?`)) alternarFavorito(el.dataset.fav);
});

// ---------- Começo ----------
pintarArea();
let tRes = null; window.addEventListener("resize", () => { clearTimeout(tRes); tRes = setTimeout(pintarArea, 150); });
pintarDock();
// Página pedida pelo endereço (link direto ou favorito do navegador) ou janelas que estavam abertas
const pedida = new URLSearchParams(location.search).get("abrir");
let anteriores = null; try { anteriores = JSON.parse(sessionStorage.getItem(chaveSessao) || "null"); } catch (_) { /* sem storage */ }
if (anteriores?.abertas?.length) {
  for (const k of anteriores.abertas) if (porKey[k]) abrir(porKey[k]);
  mostrar(janelas.find((j) => j.key === anteriores.ativa) || null);
}
if (pedida) { const it = itemDoArquivo(pedida); if (it) abrir(it, pedida); history.replaceState(null, "", "inicio.html"); }
document.body.classList.add("ad-pronta");
