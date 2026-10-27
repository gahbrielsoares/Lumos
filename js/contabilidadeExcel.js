// =====================================================================
// Contabilidade: Excel completo para o escritório de contabilidade (separado da tela)
// Recebe o fechamento já calculado (R) e monta uma planilha com uma aba por assunto.
// =====================================================================
import * as T from "./tributos.js?v=95";
import { fmtDate } from "./erp.js?v=95";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

async function carregarXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, erro) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
  return window.XLSX;
}

export async function baixarExcelContador({ R, cfg, produtos, fiscalMap, botao }) {
  if (!R) return;
  const btn = botao; const txt = btn.textContent; btn.disabled = true; btn.textContent = "Gerando...";
  try {
    const X = await carregarXlsx();
    const wb = X.utils.book_new();
    const add = (nome, linhas, larg) => { const ws = X.utils.aoa_to_sheet(linhas); ws["!cols"] = (larg || []).map((w) => ({ wch: w })); X.utils.book_append_sheet(wb, ws, nome.slice(0, 31)); };
    const s = R.resumo, ap = R.apuracao;
    const cab = [[`Fechamento fiscal e contábil: ${nomeMes(R.competencia)}`], [`Empresa: ${cfg.razao_social || cfg.nome_fantasia || ""}`, `CNPJ: ${cfg.cnpj || ""}`, `IE: ${cfg.inscricao_estadual || ""}`], [`Regime: ${T.REGIMES[cfg.regime] || ""}`, `UF: ${cfg.uf || ""}`, `Gerado em: ${new Date(R.geradoEm).toLocaleString("pt-BR")}`, `Regras Lumos ${R.versaoRegras}`], []];
    add("Resumo", [...cab, ["Indicador", "Valor"], ["Receita bruta", s.bruto], ["Taxa de serviço", s.taxaServico], ["Couvert", s.couvert], ["Taxa de entrega", s.frete], ["Descontos", s.descontos], ["Receita tributável", s.receitaTributavel],
      ["Quantidade de vendas", s.vendas], ["Ticket médio", s.ticket], ["Tributos estimados", ap.total], ["CMV", s.cmv], ["Compras recebidas", s.compras], ["Despesas pagas", s.despesas], ["Estoque final (custo)", R.inventarioTotal]], [34, 18, 18, 22]);
    const apl = [...cab, ["Tributo", "Valor", "Observação"], ...ap.linhas.map((l) => [l.tributo, l.valor, l.obs]), ["Total", ap.total]];
    if (ap.regime === "simples") apl.push([], ["RBT12", ap.rbt12.valor, ap.rbt12.origem], ["Faixa", ap.simples.faixa], ["Alíquota nominal (%)", ap.simples.aliqNominal], ["Parcela a deduzir", ap.simples.deduzir], ["Alíquota efetiva (%)", ap.simples.aliqEfetiva], ["DAS sem segregar", ap.simples.dasSemSegregar], ["Economia com segregação", ap.simples.economiaSegregacao]);
    add("Apuração", apl, [42, 16, 70]);
    if (ap.regime === "simples") add("Segregação PGDAS", [...cab, ["Tipo de receita", "Receita", "Alíquota aplicada (%)", "DAS"], ...Object.entries(ap.simples.detalhe).map(([k, d]) => [{ normal: "Normal", monofasico: "PIS/Cofins monofásico", st: "ICMS-ST", monofasico_st: "Monofásico e ICMS-ST" }[k], d.receita, d.aliquota, d.das])], [30, 16, 20, 14]);
    const agr = (rows, rot) => [...cab, [rot, "Quantidade", "Base", "ICMS", "PIS", "Cofins", "CBS (teste)", "IBS (teste)"], ...rows.map((r) => [r.chave, r.qtd, r.base, r.icms, r.pis, r.cofins, r.cbs, r.ibs])];
    add("Por NCM", agr(R.porNcm, "NCM"), [26, 12, 14, 12, 12, 12, 12, 12]);
    add("Por CFOP", agr(R.porCfop, "CFOP"), [20, 12, 14, 12, 12, 12, 12, 12]);
    add("Por CST-CSOSN", agr(R.porCst, "Situação tributária"), [36, 12, 14, 12, 12, 12, 12, 12]);
    add("Pagamentos", [...cab, ["Forma", "Vendas", "Total"], ...R.porPagamento.map((p) => [p.forma, p.vendas, p.valor])], [24, 10, 14]);
    add("Canais", [...cab, ["Canal", "Vendas", "Total"], ...R.porCanal.map((p) => [p.canal, p.vendas, p.valor])], [24, 10, 14]);
    add("Por dia", [...cab, ["Data", "Vendas", "Total"], ...R.porDia.map((d) => [fmtDate(d.data), d.vendas, d.valor])], [14, 10, 14]);
    add("Vendas", [...cab, ["Número", "Data", "Hora", "Cliente", "CPF/CNPJ", "Canal", "Forma de pagamento", "Nota fiscal", "Valor"], ...R.vendas.map((v) => [v.numero, fmtDate(v.data), v.hora, v.cliente, v.documento, v.canal, v.forma, v.nf, v.valor])], [10, 12, 8, 26, 18, 16, 20, 12, 12]);
    add("Itens vendidos", [...cab, ["Venda", "Data", "Item", "Tipo", "NCM", "NCM conferido", "CFOP", "CSOSN", "CST ICMS", "CST PIS/Cofins", "Monofásico", "ICMS-ST", "cClassTrib", "Qtd", "Unitário", "Base", "ICMS", "PIS", "Cofins", "CBS (teste)", "IBS (teste)", "Custo"],
      ...R.linhas.map((l) => [l.venda, fmtDate(l.data), l.nome, l.tipo, T.fmtNcm(l.fiscal.ncm), l.fiscal.cadastrado ? "sim" : "sugerido", l.fiscal.cfop, l.fiscal.csosn, l.fiscal.cst_icms, l.fiscal.cst_pis, l.fiscal.monofasico ? "sim" : "não", l.fiscal.icms_st ? "sim" : "não", l.fiscal.cclass_trib || "", l.quantidade, l.unitario, l.base, l.trib.icms, l.trib.pis, l.trib.cofins, l.trib.cbs, l.trib.ibs, l.custo])],
      [8, 11, 28, 12, 12, 12, 7, 7, 8, 12, 10, 8, 10, 7, 10, 10, 9, 9, 9, 10, 10, 10]);
    add("Produtos e CMV", [...cab, ["Produto", "NCM", "Quantidade", "Receita", "Custo (CMV)", "Margem (%)"], ...R.produtosVendidos.map((p) => [p.nome, T.fmtNcm(p.ncm), p.qtd, p.receita, p.custo, p.margem])], [30, 12, 12, 14, 14, 12]);
    add("Entradas (compras)", [...cab, ["Compra", "Data", "Fornecedor", "CNPJ", "Itens", "Valor"], ...R.entradas.map((c) => [c.numero, fmtDate(c.data), c.fornecedor, c.cnpj, c.itens, c.valor])], [10, 12, 30, 20, 8, 14]);
    add("Despesas", [...cab, ["Categoria", "Valor"], ...R.despesasPorCategoria.map((d) => [d.categoria, d.valor])], [30, 14]);
    add("DRE", [...cab, ["Conta", "Valor"], ...R.dre.map((d) => [d.conta, d.valor])], [52, 16]);
    if (R.cmvReal?.temDados) add("CMV teórico x real", [...cab, ["Item", "Valor"], ["CMV teórico (vendas e fichas)", R.cmvReal.teorico], ["Perdas e ajustes de estoque", R.cmvReal.perdas], ["CMV real", R.cmvReal.real], ["CMV real sobre a receita (%)", R.cmvReal.pctReceita], [], ["Onde mais se perdeu", ""], ...R.cmvReal.maioresPerdas.map((x) => [x.nome, x.valor])], [36, 16]);
    add("Inventário", [...cab, ["Produto", "NCM", "Unidade", "Saldo", "Custo unitário", "Valor"], ...R.inventario.map((i) => [i.nome, T.fmtNcm(i.ncm), i.unidade, i.saldo, i.custo, i.valor]), ["Total", "", "", "", "", R.inventarioTotal]], [30, 12, 10, 10, 14, 14]);
    add("Cadastro fiscal", [...cab, ["Produto", "NCM", "Conferido", "CFOP", "Origem", "Tipo", "CSOSN", "CST ICMS", "Alíq. ICMS", "ICMS-ST", "Monofásico", "CST PIS/Cofins", "CEST", "cClassTrib"],
      ...produtos.map((p) => { const f = T.fiscalEfetivo(fiscalMap[p.id], p, cfg); return [p.name, T.fmtNcm(f.ncm), f.cadastrado ? "sim" : "sugerido", f.cfop, f.origem, f.tipo, f.csosn, f.cst_icms, f.icms_aliq || "", f.icms_st ? "sim" : "não", f.monofasico ? "sim" : "não", f.cst_pis, f.cest || "", f.cclass_trib || ""]; })],
      [30, 12, 10, 7, 7, 10, 7, 8, 10, 8, 10, 13, 10, 11]);
    add("Notas fiscais (NFC-e)", [...cab, ["Data", "Venda", "Número", "Série", "Chave de acesso", "Situação", "Ambiente", "Valor", "XML", "Cupom (DANFE)", "Motivo/retorno"],
      ...(R.notas || []).map((n) => { const v = R.vendas.find((x) => x.nf === n.numero); return [new Date(n.created_at).toLocaleString("pt-BR"), v ? v.numero : "", n.numero || "", n.serie || "", n.chave || "", { autorizado: "Autorizada", cancelado: "Cancelada", erro: "Erro", processando: "Processando" }[n.status] || n.status, n.ambiente === "producao" ? "Produção" : "Homologação", Number(n.valor || 0), n.xml_url || "", n.danfe_url || "", n.cancelamento_motivo || n.mensagem || ""]; })],
      [17, 8, 9, 6, 46, 12, 12, 10, 50, 50, 50]);
    add("Pendências", [...cab, ["Prioridade", "Pendência"], ...R.pendencias.map((p) => [p.nivel, p.texto])], [12, 120]);
    const nome = (cfg.nome_fantasia || cfg.razao_social || "empresa").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_");
    X.writeFile(wb, `Lumos_Contabil_${nome}_${R.competencia}.xlsx`);
  } catch (e) {
    await lumosAlert("Não foi possível gerar o Excel agora. Confira a internet e tente de novo.");
  } finally { btn.disabled = false; btn.textContent = txt; }
}
