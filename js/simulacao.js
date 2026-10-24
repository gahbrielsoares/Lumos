// =====================================================================
// Simulação guiada para apresentações (só administrador, suporte e modo suporte)
// 1) Janela com 3 blocos: de onde vêm os dados, o que a página faz, para onde os dados vão.
// 2) "Simular": passo a passo com uma historinha e dados FICTÍCIOS, montados só na tela.
//    Nada é gravado no banco: relatórios, financeiro e notas nunca recebem dados de simulação.
// =====================================================================
import { getAccess } from "./sidebar.js?v=79";
import { barraFerramentas } from "./ajuda.js?v=79";

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
    const sair = async () => {
      document.getElementById("sim-painel")?.remove();
      document.body.classList.remove("sim-on");
      ativa = null;
      try { await cfg.limpar?.(); } catch (e) { console.error(e); }
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
