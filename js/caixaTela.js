// =====================================================================
// Caixa do turno (usado dentro do PDV): abertura, sangria, suprimento, resumo, fechamento e histórico.
// Fica numa barra no topo do PDV. Os cálculos são de js/caixa.js.
// =====================================================================
import { supabase } from "./supabaseClient.js?v=94";
import { brl, esc, modal, buscarTodos } from "./erp.js?v=94";
import { resumoCaixa, FORMAS_CAIXA } from "./caixa.js?v=94";

const hora = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function criarCaixa({ ownerId, eu, alvo, aoMudar }) {
  let caixa = null, movs = [], vendas = [], resumo = null, historico = [], ficticio = false;

  async function vendasEntre(ini) {
    const out = await buscarTodos(() => supabase.from("sales_orders").select("id, numero, paid_at, total, pagamento, simulado")
      .eq("owner_id", ownerId).eq("status", "pago").gte("paid_at", ini).order("paid_at"));
    return out.filter((v) => !v.simulado);
  }

  async function carregar() {
    ficticio = false;
    const { data: abertos } = await supabase.from("caixas").select("*").eq("owner_id", ownerId).eq("status", "aberto").limit(1);
    caixa = abertos?.[0] || null;
    if (caixa) {
      const [{ data: m }, v] = await Promise.all([supabase.from("caixa_movs").select("*").eq("caixa_id", caixa.id).order("created_at"), vendasEntre(caixa.aberto_em)]);
      movs = m || []; vendas = v;
      resumo = resumoCaixa({ valorInicial: caixa.valor_inicial, vendas, movs });
    } else { movs = []; vendas = []; resumo = null; }
    render();
    aoMudar?.(!!caixa);
  }

  function render() {
    if (!caixa) {
      alvo.className = "cx-barra fechado";
      alvo.innerHTML = `<div class="cx-info"><b>Caixa fechado</b><br>Abra o caixa para começar a vender. Informe o dinheiro que fica na gaveta para troco.</div>
        <div class="cx-bts"><label style="display:flex; align-items:center; gap:6px; font-size:13px;">Fundo de troco R$ <input id="cx-ini" type="number" step="0.01" min="0" value="0" /></label>
        <button class="btn btn-primary" data-cx="abrir">Abrir caixa</button><button class="btn btn-ghost" data-cx="hist">Caixas anteriores</button></div>`;
      return;
    }
    const r = resumo;
    alvo.className = "cx-barra";
    alvo.innerHTML = `<div class="cx-info"><b>Caixa #${caixa.numero} aberto</b> <span class="cx-badge ok">Aberto</span><br>
        <span class="cx-hint">Desde ${hora(caixa.aberto_em)}, por ${esc(caixa.aberto_por_nome || "-")}. Fundo de troco: ${brl(caixa.valor_inicial)}.</span></div>
      <div class="cx-nums"><span>Vendas no turno<strong>${brl(r.totalVendas)}</strong></span><span>Quantidade<strong>${r.qtdVendas}</strong></span><span>Dinheiro na gaveta<strong>${brl(r.dinheiroGaveta)}</strong></span></div>
      <div class="cx-bts"><button class="btn btn-ghost" data-cx="sangria">Sangria</button><button class="btn btn-ghost" data-cx="suprimento">Suprimento</button>
        <button class="btn btn-ghost" data-cx="resumo">Resumo do turno</button><button class="btn btn-ghost" data-cx="hist">Caixas anteriores</button><button class="btn btn-primary" data-cx="fechar">Fechar caixa</button></div>`;
  }

  alvo.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cx]"); if (!b || ficticio) return;
    ({ abrir, sangria: () => movimento("sangria"), suprimento: () => movimento("suprimento"), resumo: verResumo, hist: verHistorico, fechar }[b.dataset.cx])?.();
  });

  async function abrir() {
    const v = Number(alvo.querySelector("#cx-ini")?.value || 0);
    if (v < 0) return lumosAlert("O fundo de troco não pode ser negativo.");
    const { error } = await supabase.from("caixas").insert({ owner_id: ownerId, valor_inicial: v, aberto_por: eu.id, aberto_por_nome: eu.nome });
    if (error) return lumosAlert(/caixas_um_aberto|duplicate/.test(error.message) ? "Já existe um caixa aberto. Atualize a tela." : `Não foi possível abrir: ${error.message}`);
    carregar();
  }

  function movimento(tipo) {
    const m = modal(`<h3 style="font-size:18px;">${tipo === "sangria" ? "Sangria: retirar dinheiro da gaveta" : "Suprimento: colocar dinheiro na gaveta"}</h3>
      <p class="cx-hint" style="margin:4px 0 12px;">${tipo === "sangria" ? "Ex.: levar o excesso para o cofre ou pagar um fornecedor em dinheiro." : "Ex.: reforço de troco no meio do turno."}</p>
      <div class="field"><label>Valor (R$)</label><input id="m-v" type="number" step="0.01" min="0.01" /></div>
      <div class="field"><label>Motivo</label><input id="m-m" placeholder="${tipo === "sangria" ? "Ex.: cofre" : "Ex.: troco"}" /></div>
      <div id="m-msg" class="form-msg"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="m-ok">Registrar</button></div>`, { width: 440 });
    m.el.querySelector("#m-ok").addEventListener("click", async () => {
      const valor = Number(m.el.querySelector("#m-v").value), msg = m.el.querySelector("#m-msg");
      if (!(valor > 0)) { msg.textContent = "Informe o valor."; msg.className = "form-msg error"; return; }
      if (tipo === "sangria" && valor > resumo.dinheiroGaveta + 0.001) { msg.textContent = `A gaveta deveria ter ${brl(resumo.dinheiroGaveta)}. Confira o valor.`; msg.className = "form-msg error"; return; }
      const { error } = await supabase.from("caixa_movs").insert({ caixa_id: caixa.id, owner_id: ownerId, tipo, valor, motivo: m.el.querySelector("#m-m").value.trim() || null, por: eu.id, por_nome: eu.nome });
      if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }
      m.close(); carregar();
    });
  }

  function verResumo() {
    const r = resumo;
    modal(`<h3 style="font-size:18px;">Resumo do turno: caixa #${caixa.numero}</h3>
      <div class="panel-table-wrap" style="margin-top:12px;"><table class="panel-table"><thead><tr><th>Forma de pagamento</th><th class="cx-num">Vendas</th><th class="cx-num">Total</th></tr></thead><tbody>
        ${Object.entries(r.formas).filter(([, f]) => f.qtd).map(([k, f]) => `<tr><td>${FORMAS_CAIXA[k]}</td><td class="cx-num">${f.qtd}</td><td class="cx-num">${brl(f.valor)}</td></tr>`).join("") || `<tr><td colspan="3" style="opacity:.7;">Nenhuma venda desde a abertura.</td></tr>`}
      </tbody></table></div>
      ${movs.length ? `<div class="panel-table-wrap" style="margin-top:12px;"><table class="panel-table"><thead><tr><th>Movimento</th><th>Quando</th><th>Motivo</th><th class="cx-num">Valor</th></tr></thead><tbody>
        ${movs.map((m) => `<tr><td>${m.tipo === "sangria" ? "Sangria" : "Suprimento"}</td><td>${hora(m.created_at)}</td><td>${esc(m.motivo || "")}${m.por_nome ? ` <span class="cx-hint">por ${esc(m.por_nome)}</span>` : ""}</td><td class="cx-num ${m.tipo === "sangria" ? "cx-neg" : "cx-pos"}">${m.tipo === "sangria" ? "-" : "+"}${brl(m.valor)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <p class="cx-hint" style="margin-top:10px;">Dinheiro esperado na gaveta: <b>${brl(r.dinheiroGaveta)}</b> (fundo de troco + dinheiro das vendas + suprimentos − sangrias).</p>
      <div class="modal-actions"><button class="btn btn-primary" data-close>Fechar</button></div>`, { width: 600 });
  }

  async function verHistorico() {
    const { data } = await supabase.from("caixas").select("*").eq("owner_id", ownerId).eq("status", "fechado").order("fechado_em", { ascending: false }).limit(30);
    historico = data || [];
    const m = modal(`<h3 style="font-size:18px;">Caixas anteriores</h3>
      <div class="panel-table-wrap" style="margin-top:12px;"><table class="panel-table"><thead><tr><th>Nº</th><th>Aberto</th><th>Fechado</th><th>Operador</th><th class="cx-num">Vendas</th><th class="cx-num">Diferença</th><th></th></tr></thead><tbody>
        ${historico.map((c) => { const tot = Object.values(c.esperado?.formas || {}).reduce((t, f) => t + Number(f.valor || 0), 0); const dif = Number(c.diferenca || 0);
          return `<tr><td>#${c.numero}</td><td>${hora(c.aberto_em)}</td><td>${hora(c.fechado_em)}</td><td>${esc(c.fechado_por_nome || c.aberto_por_nome || "-")}</td><td class="cx-num">${brl(tot)}</td><td class="cx-num ${dif > 0 ? "cx-pos" : dif < 0 ? "cx-neg" : ""}">${dif === 0 ? "sem diferença" : brl(dif)}</td><td><button class="btn btn-ghost btn-sm" data-rel="${c.id}">Relatório</button></td></tr>`; }).join("") || `<tr><td colspan="7" style="opacity:.7;">Nenhum caixa fechado ainda.</td></tr>`}
      </tbody></table></div><div class="modal-actions"><button class="btn btn-primary" data-close>Fechar</button></div>`, { width: 820 });
    m.el.addEventListener("click", (e) => { const b = e.target.closest("[data-rel]"); if (b) relatorio(historico.find((c) => c.id === b.dataset.rel)); });
  }

  async function fechar() {
    await carregar();
    const r = resumo;
    const linhas = Object.entries(r.formas).filter(([k, f]) => f.qtd || k === "dinheiro");
    const m = modal(`<h3 style="font-size:18px;">Fechar caixa #${caixa.numero}</h3>
      <p class="cx-hint" style="margin:4px 0 12px;">Confira cada forma: conte o dinheiro da gaveta e compare cartão e Pix com o relatório da maquininha e o extrato. Deixe em branco o que não conferiu.</p>
      <div class="cx-fecha" style="margin-bottom:6px;"><span class="h">Forma</span><span class="h d" style="text-align:right;">Esperado</span><span class="h" style="text-align:right;">Conferido</span><span class="h" style="text-align:right;">Diferença</span></div>
      ${linhas.map(([k, f]) => `<div class="cx-fecha" style="margin-bottom:8px;"><span>${k === "dinheiro" ? "Dinheiro na gaveta" : FORMAS_CAIXA[k]}</span>
        <span class="cx-num d">${brl(k === "dinheiro" ? r.dinheiroGaveta : f.valor)}</span>
        <input type="number" step="0.01" min="0" data-f="${k}" placeholder="${(k === "dinheiro" ? r.dinheiroGaveta : f.valor).toFixed(2)}" />
        <span class="cx-num" data-d="${k}">-</span></div>`).join("")}
      <div class="field" style="margin-top:10px;"><label>Observação</label><input id="m-obs" placeholder="Ex.: diferença no troco de uma mesa" /></div>
      <div id="m-msg" class="form-msg"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Voltar</button><button class="btn btn-primary" id="m-ok">Fechar caixa</button></div>`, { width: 600 });
    const esperadoDe = (k) => (k === "dinheiro" ? r.dinheiroGaveta : r.formas[k].valor);
    m.el.addEventListener("input", (e) => {
      const k = e.target.dataset.f; if (!k) return;
      const cel = m.el.querySelector(`[data-d="${k}"]`);
      if (e.target.value === "") { cel.textContent = "-"; cel.className = "cx-num"; return; }
      const d = Math.round((Number(e.target.value) - esperadoDe(k)) * 100) / 100;
      cel.textContent = d === 0 ? "ok" : brl(d); cel.className = `cx-num ${d > 0 ? "cx-pos" : d < 0 ? "cx-neg" : ""}`;
    });
    m.el.querySelector("#m-ok").addEventListener("click", async () => {
      const contado = {};
      m.el.querySelectorAll("[data-f]").forEach((i) => { if (i.value !== "") contado[i.dataset.f] = Number(i.value); });
      if (!("dinheiro" in contado) && !(await lumosConfirm("Você não conferiu o dinheiro da gaveta. Fechar mesmo assim?"))) return;
      const diferenca = Math.round(Object.entries(contado).reduce((t, [k, v]) => t + v - esperadoDe(k), 0) * 100) / 100;
      const esperado = { formas: r.formas, dinheiro_gaveta: r.dinheiroGaveta, sangrias: r.sangrias, suprimentos: r.suprimentos, valor_inicial: Number(caixa.valor_inicial), qtd_vendas: r.qtdVendas, total_vendas: r.totalVendas };
      const fechadoEm = new Date().toISOString(), copia = { ...caixa };
      const { error } = await supabase.from("caixas").update({
        status: "fechado", fechado_em: fechadoEm, fechado_por: eu.id, fechado_por_nome: eu.nome,
        esperado, contado, diferenca, observacao: m.el.querySelector("#m-obs").value.trim() || null,
      }).eq("id", caixa.id).eq("status", "aberto");
      if (error) { m.el.querySelector("#m-msg").textContent = error.message; m.el.querySelector("#m-msg").className = "form-msg error"; return; }
      m.close(); await carregar();
      relatorio({ ...copia, status: "fechado", fechado_em: fechadoEm, fechado_por_nome: eu.nome, esperado, contado, diferenca, observacao: m.el.querySelector("#m-obs").value.trim() || null });
    });
  }

  // Relatório de fechamento (para imprimir ou salvar em PDF)
  function relatorio(c) {
    if (!c) return;
    const e = c.esperado || {}, ct = c.contado || {};
    const linhas = Object.entries(e.formas || {}).filter(([k, f]) => f.qtd || k === "dinheiro").map(([k, f]) => {
      const esp = k === "dinheiro" ? Number(e.dinheiro_gaveta || 0) : Number(f.valor || 0);
      const conf = k in ct ? Number(ct[k]) : null;
      return `<tr><td>${k === "dinheiro" ? "Dinheiro na gaveta" : FORMAS_CAIXA[k]}</td><td class="n">${f.qtd || 0}</td><td class="n">${brl(f.valor)}</td><td class="n">${brl(esp)}</td><td class="n">${conf == null ? "não conferido" : brl(conf)}</td><td class="n">${conf == null ? "-" : brl(conf - esp)}</td></tr>`;
    }).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fechamento do caixa #${c.numero}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:13px}h1{font-size:18px;margin:0 0 4px}p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}.n{text-align:right}.t td{font-weight:700}</style></head><body>
      <h1>Fechamento do caixa #${c.numero}</h1>
      <p>Aberto em ${hora(c.aberto_em)} por ${esc(c.aberto_por_nome || "-")} | Fechado em ${hora(c.fechado_em)} por ${esc(c.fechado_por_nome || "-")}</p>
      <p>Fundo de troco: ${brl(e.valor_inicial)} | Suprimentos: ${brl(e.suprimentos)} | Sangrias: ${brl(e.sangrias)} | Vendas: ${e.qtd_vendas || 0} (${brl(e.total_vendas)})</p>
      <table><thead><tr><th>Forma</th><th class="n">Vendas</th><th class="n">Vendido</th><th class="n">Esperado</th><th class="n">Conferido</th><th class="n">Diferença</th></tr></thead><tbody>${linhas}
      <tr class="t"><td colspan="5">Diferença total</td><td class="n">${brl(c.diferenca || 0)}</td></tr></tbody></table>
      ${c.observacao ? `<p style="margin-top:12px;">Observação: ${esc(c.observacao)}</p>` : ""}
      <p style="margin-top:40px;">______________________________<br>Assinatura do operador</p>
      <script>window.onload=()=>window.print()<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return lumosAlert("O navegador bloqueou a janela do relatório. Permita janelas para este site.");
    w.document.write(html); w.document.close();
  }

  // Para os tutoriais: mostra um caixa fictício na barra, sem gravar nada
  function mostrarFicticio({ aberto, valorInicial = 150, vendasFake = [], movsFake = [], numero = 12, operador = "Carla (caixa)", desde = Date.now() - 4 * 3600e3 }) {
    ficticio = true;
    caixa = aberto ? { id: "sim", numero, status: "aberto", aberto_em: new Date(desde).toISOString(), aberto_por_nome: operador, valor_inicial: valorInicial } : null;
    movs = movsFake; vendas = vendasFake;
    resumo = aberto ? resumoCaixa({ valorInicial, vendas, movs }) : null;
    render();
    if (!aberto) { const i = alvo.querySelector("#cx-ini"); if (i) i.value = String(valorInicial); }
    alvo.insertAdjacentHTML("afterbegin", `<span class="sim-mark">Simulação</span>`);
    return alvo;
  }

  return { carregar, aberto: () => !!caixa, resumo: () => resumo, mostrarFicticio };
}
