// =====================================================================
// Lumos: motor fiscal (TODAS as regras, alíquotas e cálculos ficam aqui)
// ---------------------------------------------------------------------
// Este arquivo não fala com o banco: recebe dados e devolve cálculos.
// Assim ele pode ser testado sozinho e reaproveitado (tela, Excel, PDF,
// e no futuro na emissão da NFC-e).
//
// IMPORTANTE: os valores são ESTIMATIVAS GERENCIAIS para conferência.
// A apuração oficial (DAS, DCTFWeb, SPED, GIA etc.) é do contador.
// Fontes e vigências estão anotadas em cada tabela. Revisar todo ano.
// =====================================================================

export const VERSAO_REGRAS = "2026-10";

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

// ---------------------------------------------------------------------
// Regimes tributários
// ---------------------------------------------------------------------
export const REGIMES = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
  mei: "MEI",
};

// ---------------------------------------------------------------------
// Simples Nacional, Anexo I (comércio). LC 123/2006, redação da LC 155/2016.
// Restaurantes, bares e lojas de materiais de construção ficam no Anexo I.
// rep = repartição do DAS entre os tributos (em % do total da faixa).
// ---------------------------------------------------------------------
export const SIMPLES_ANEXO_I = [
  { faixa: 1, ate: 180000,  aliq: 4.00,  deduzir: 0,      rep: { irpj: 5.50,  csll: 3.50,  cofins: 12.74, pis: 2.76, cpp: 41.50, icms: 34.00 } },
  { faixa: 2, ate: 360000,  aliq: 7.30,  deduzir: 5940,   rep: { irpj: 5.50,  csll: 3.50,  cofins: 12.74, pis: 2.76, cpp: 41.50, icms: 34.00 } },
  { faixa: 3, ate: 720000,  aliq: 9.50,  deduzir: 13860,  rep: { irpj: 5.50,  csll: 3.50,  cofins: 12.74, pis: 2.76, cpp: 42.00, icms: 33.50 } },
  { faixa: 4, ate: 1800000, aliq: 10.70, deduzir: 22500,  rep: { irpj: 5.50,  csll: 3.50,  cofins: 12.74, pis: 2.76, cpp: 42.00, icms: 33.50 } },
  { faixa: 5, ate: 3600000, aliq: 14.30, deduzir: 87300,  rep: { irpj: 5.50,  csll: 3.50,  cofins: 12.74, pis: 2.76, cpp: 42.00, icms: 33.50 } },
  { faixa: 6, ate: 4800000, aliq: 19.00, deduzir: 378000, rep: { irpj: 13.50, csll: 10.00, cofins: 28.27, pis: 6.13, cpp: 42.10, icms: 0 } },
];
export const SIMPLES_SUBLIMITE_ICMS = 3600000;
export const SIMPLES_LIMITE = 4800000;
export const MEI_LIMITE_ANUAL = 81000;
export const TRIBUTO_NOME = { irpj: "IRPJ", csll: "CSLL", cofins: "Cofins", pis: "PIS/Pasep", cpp: "CPP (INSS patronal)", icms: "ICMS" };

// ---------------------------------------------------------------------
// Lucro Presumido e Lucro Real (federais sobre a receita)
// ---------------------------------------------------------------------
export const PRESUMIDO = {
  pis: 0.65, cofins: 3.00,                // cumulativos
  presuncao_irpj: 8, presuncao_csll: 12,  // comércio (venda de mercadorias e refeições)
  irpj: 15, irpj_adicional: 10, adicional_limite_mes: 20000,
  csll: 9,
  // LC 224/2025: +10% nos percentuais de presunção sobre a receita do ano que passar de R$ 5 milhões
  lc224_limite_ano: 5000000, lc224_acrescimo: 0.10,
};
export const REAL = { pis: 1.65, cofins: 7.60, irpj: 15, irpj_adicional: 10, adicional_limite_mes: 20000, csll: 9 };

// ---------------------------------------------------------------------
// Reforma tributária (LC 214/2025)
// 2026: CBS 0,9% e IBS 0,1% destacados em caráter de teste (sem cobrança para quem cumpre as obrigações).
// Simples Nacional: obrigatório a partir de 01/01/2027. Em 2027 a CBS vale de verdade e PIS/Cofins acabam.
// ---------------------------------------------------------------------
export const REFORMA = {
  2026: { cbs: 0.9, ibs: 0.1, cobranca: false, nota: "Ano de teste: destaque na nota, sem recolhimento para quem cumpre as obrigações acessórias." },
  2027: { cbs: null, ibs: 0.1, cobranca: true, nota: "CBS passa a ser cobrada e PIS/Cofins são extintos. Alíquota da CBS definida pelo Senado." },
};
export const CST_IBSCBS_PADRAO = "000";
export const CCLASSTRIB_PADRAO = "000001";

// ---------------------------------------------------------------------
// ICMS
// SP: regime especial de bares e restaurantes (RET), opcional, 4% sobre a receita bruta mensal,
// Decreto 69.314/2025, vigente até 31/12/2026. Só para quem NÃO é do Simples.
// ---------------------------------------------------------------------
export const ICMS_INTERNA_PADRAO = { SP: 18 };   // demais estados: informar na Configuração fiscal
export const RET_SP_RESTAURANTE = { aliq: 4.0, vigencia_ate: "2026-12-31" };
export const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

// ---------------------------------------------------------------------
// Sugestões de NCM mais comuns (o contador confirma)
// ---------------------------------------------------------------------
export const NCM_SUGESTOES = [
  { ncm: "21069090", desc: "Refeições, pratos e preparações alimentícias" },
  { ncm: "19059090", desc: "Pães, pizzas, salgados assados" },
  { ncm: "21050010", desc: "Sorvetes" },
  { ncm: "22011000", desc: "Água mineral" },
  { ncm: "22021000", desc: "Refrigerantes e águas saborizadas" },
  { ncm: "22029900", desc: "Energéticos, isotônicos, chás prontos" },
  { ncm: "20098990", desc: "Sucos industrializados" },
  { ncm: "22030000", desc: "Cerveja de malte" },
  { ncm: "22042100", desc: "Vinhos (garrafa até 2 litros)" },
  { ncm: "22084000", desc: "Cachaça" },
  { ncm: "22086000", desc: "Vodca" },
  { ncm: "22083020", desc: "Uísque (até 2 litros)" },
  { ncm: "25232910", desc: "Cimento Portland comum" },
  { ncm: "38245000", desc: "Argamassas e concretos" },
  { ncm: "69072100", desc: "Porcelanato e pisos (absorção até 0,5%)" },
  { ncm: "69072300", desc: "Pisos e revestimentos cerâmicos (absorção acima de 10%)" },
  { ncm: "32091010", desc: "Tintas acrílicas e látex (base água)" },
  { ncm: "39172300", desc: "Tubos de PVC" },
  { ncm: "72142000", desc: "Vergalhões de aço" },
  { ncm: "69051000", desc: "Telhas cerâmicas" },
  { ncm: "25059000", desc: "Areia" },
  { ncm: "25171000", desc: "Pedra britada" },
];

// PIS/Cofins monofásico (bebidas frias: água, refrigerante, cerveja, energético).
// Na revenda, alíquota zero (CST 04) e, no Simples, a receita sai da base de PIS/Cofins do DAS.
const MONOFASICO_PREFIXOS = ["2201", "2202", "2203"];
// Itens normalmente sujeitos a ICMS-ST em SP (sugestão; listas mudam, o contador confirma)
const ST_SP_PREFIXOS = ["2201", "2202", "2203", "2105", "2523", "3208", "3209", "3210"];

export function ncmValido(ncm) { return /^\d{8}$/.test(onlyDigits(ncm)); }
export function fmtNcm(ncm) {
  const d = onlyDigits(ncm);
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d;
}

// Sugere o cadastro fiscal de um produto (nunca sobrescreve o que já foi preenchido)
export function sugerirFiscal(produto, { uf = "SP", regime = "simples", nicho = "restaurante" } = {}) {
  const nome = String(produto?.name || produto?.nome || "").toLowerCase();
  let ncm = "";
  const tem = (...w) => w.some((x) => nome.includes(x));
  if (tem("refrigerante", "coca", "guaraná", "guarana", "fanta", "sprite", "pepsi", "soda")) ncm = "22021000";
  else if (tem("água", "agua")) ncm = "22011000";
  else if (tem("cerveja", "chopp", "chope", "heineken", "brahma", "skol", "budweiser", "stella", "corona", "original", "amstel")) ncm = "22030000";
  else if (tem("energético", "energetico", "red bull", "monster", "isotônico", "isotonico", "gatorade")) ncm = "22029900";
  else if (tem("vinho")) ncm = "22042100";
  else if (tem("cachaça", "cachaca", "caipirinha")) ncm = tem("caipirinha") ? "22089000" : "22084000";
  else if (tem("vodka", "vodca")) ncm = "22086000";
  else if (tem("whisky", "uísque", "uisque")) ncm = "22083020";
  else if (tem("suco")) ncm = "20098990";
  else if (tem("sorvete", "picolé", "picole")) ncm = "21050010";
  else if (tem("pizza", "pão", "pao", "esfiha", "esfirra")) ncm = "19059090";
  else if (tem("cimento")) ncm = "25232910";
  else if (tem("argamassa", "rejunte", "concreto")) ncm = "38245000";
  else if (tem("porcelanato")) ncm = "69072100";
  else if (tem("piso", "revestimento", "cerâmica", "ceramica")) ncm = "69072300";
  else if (tem("tinta", "látex", "latex")) ncm = "32091010";
  else if (tem("tubo", "cano", "pvc")) ncm = "39172300";
  else if (tem("vergalhão", "vergalhao")) ncm = "72142000";
  else if (tem("telha")) ncm = "69051000";
  else if (tem("areia")) ncm = "25059000";
  else if (tem("brita", "pedra")) ncm = "25171000";
  else if (nicho === "restaurante") ncm = "21069090";

  const pref4 = ncm.slice(0, 4);
  const monofasico = MONOFASICO_PREFIXOS.includes(pref4);
  const icms_st = uf === "SP" && ST_SP_PREFIXOS.includes(pref4);
  const revenda = nicho !== "restaurante" || pref4.startsWith("22") || pref4 === "2009";
  return {
    ncm, monofasico, icms_st,
    tipo: revenda ? "revenda" : "producao",
    origem: "0",
    cfop: icms_st ? "5405" : revenda ? "5102" : "5101",
    csosn: icms_st ? "500" : "102",
    cst_icms: icms_st ? "60" : "00",
    cst_pis: regime === "simples" ? "49" : monofasico ? "04" : "01",
    cclass_trib: CCLASSTRIB_PADRAO,
  };
}

// Completa o fiscal salvo com padrões coerentes (o que falta vira sugestão, marcado como tal)
export function fiscalEfetivo(salvo, produto, ctx) {
  const sug = sugerirFiscal(produto, ctx);
  const f = { ...sug, ...(salvo || {}) };
  for (const k of Object.keys(sug)) if (f[k] === null || f[k] === undefined || f[k] === "") f[k] = sug[k];
  f.ncm = onlyDigits(f.ncm);
  f.cadastrado = !!(salvo && onlyDigits(salvo.ncm));
  return f;
}

// ---------------------------------------------------------------------
// Simples Nacional: faixa, alíquota efetiva e DAS com segregação de receitas
// ---------------------------------------------------------------------
export function simplesFaixa(rbt12) {
  const r = Number(rbt12) || 0;
  return SIMPLES_ANEXO_I.find((f) => r <= f.ate) || SIMPLES_ANEXO_I[SIMPLES_ANEXO_I.length - 1];
}

export function simplesAliquotaEfetiva(rbt12) {
  const r = Number(rbt12) || 0;
  const f = simplesFaixa(r);
  if (r <= 0 || f.faixa === 1) return { faixa: f, efetiva: f.aliq };
  return { faixa: f, efetiva: ((r * f.aliq) / 100 - f.deduzir) / r * 100 };
}

// RBT12: soma dos 12 meses anteriores à competência. Empresa com menos de 12 meses:
// média dos meses anteriores x 12 (no 1º mês, a própria receita do mês x 12). LC 123, art. 18, §§ 1º e 2º.
export function calcRbt12({ mesesAnteriores = [], receitaMes = 0, manual = null }) {
  if (manual !== null && manual !== undefined && manual !== "" && Number(manual) > 0) return { valor: Number(manual), origem: "informado" };
  const meses = mesesAnteriores.slice(-12);
  const ativos = meses.filter((v) => Number(v) > 0);
  if (ativos.length >= 12) return { valor: r2(meses.reduce((t, v) => t + Number(v || 0), 0)), origem: "historico" };
  if (ativos.length > 0) {
    // conta a partir do primeiro mês com faturamento
    const i0 = meses.findIndex((v) => Number(v) > 0);
    const periodo = meses.slice(i0);
    const media = periodo.reduce((t, v) => t + Number(v || 0), 0) / periodo.length;
    return { valor: r2(media * 12), origem: "proporcional", meses: periodo.length };
  }
  return { valor: r2(Number(receitaMes || 0) * 12), origem: "inicio_atividade" };
}

// seg = { normal, monofasico, st, monofasico_st } (receitas do mês por tipo)
export function calcSimples({ rbt12, seg }) {
  const { faixa, efetiva } = simplesAliquotaEfetiva(rbt12);
  const aliq = efetiva / 100;
  const grupos = {
    normal: { receita: Number(seg.normal || 0), exclui: [] },
    monofasico: { receita: Number(seg.monofasico || 0), exclui: ["pis", "cofins"] },
    st: { receita: Number(seg.st || 0), exclui: ["icms"] },
    monofasico_st: { receita: Number(seg.monofasico_st || 0), exclui: ["pis", "cofins", "icms"] },
  };
  const porTributo = Object.fromEntries(Object.keys(faixa.rep).map((k) => [k, 0]));
  let semSegregar = 0;
  const detalhe = {};
  for (const [g, d] of Object.entries(grupos)) {
    semSegregar += d.receita * aliq;
    let das = 0;
    for (const [t, pct] of Object.entries(faixa.rep)) {
      if (d.exclui.includes(t)) continue;
      const v = d.receita * aliq * pct / 100;
      porTributo[t] += v; das += v;
    }
    const excluido = d.exclui.reduce((s, t) => s + (faixa.rep[t] || 0), 0);
    detalhe[g] = { receita: r2(d.receita), aliquota: Math.round(efetiva * (1 - excluido / 100) * 10000) / 10000, das: r2(das) };
  }
  const total = Object.values(porTributo).reduce((a, b) => a + b, 0);
  return {
    faixa: faixa.faixa, aliqNominal: faixa.aliq, deduzir: faixa.deduzir,
    aliqEfetiva: Math.round(efetiva * 10000) / 10000,
    das: r2(total), dasSemSegregar: r2(semSegregar), economiaSegregacao: r2(semSegregar - total),
    porTributo: Object.fromEntries(Object.entries(porTributo).map(([k, v]) => [k, r2(v)])),
    detalhe,
    acimaSublimite: Number(rbt12) > SIMPLES_SUBLIMITE_ICMS,
    acimaLimite: Number(rbt12) > SIMPLES_LIMITE,
  };
}

// ---------------------------------------------------------------------
// ICMS fora do Simples (Presumido/Real): RET de SP ou por item
// ---------------------------------------------------------------------
export function calcIcmsRegimeNormal({ itens, cfg }) {
  if (cfg.uf === "SP" && cfg.ret_sp_restaurante) {
    const base = itens.reduce((t, i) => t + i.base, 0);
    return { modo: "ret_sp", aliq: RET_SP_RESTAURANTE.aliq, base: r2(base), valor: r2(base * RET_SP_RESTAURANTE.aliq / 100) };
  }
  const padrao = Number(cfg.icms_interna ?? ICMS_INTERNA_PADRAO[cfg.uf] ?? 0);
  let base = 0, valor = 0, baseSt = 0;
  for (const i of itens) {
    if (i.fiscal.icms_st) { baseSt += i.base; continue; }
    const a = Number(i.fiscal.icms_aliq || padrao);
    base += i.base; valor += i.base * a / 100;
  }
  return { modo: "por_item", aliq: padrao, base: r2(base), baseSt: r2(baseSt), valor: r2(valor) };
}

// ---------------------------------------------------------------------
// Tributos por item (base de cálculo e destaque estimado)
// ---------------------------------------------------------------------
export function tributosItem(base, fiscal, cfg, ano) {
  const out = { icms: 0, pis: 0, cofins: 0, cbs: 0, ibs: 0, icmsAliq: 0 };
  if (cfg.regime === "presumido" || cfg.regime === "real") {
    const tab = cfg.regime === "real" ? REAL : PRESUMIDO;
    if (!fiscal.monofasico) { out.pis = base * tab.pis / 100; out.cofins = base * tab.cofins / 100; }
    if (!fiscal.icms_st && !(cfg.uf === "SP" && cfg.ret_sp_restaurante)) {
      out.icmsAliq = Number(fiscal.icms_aliq || cfg.icms_interna || ICMS_INTERNA_PADRAO[cfg.uf] || 0);
      out.icms = base * out.icmsAliq / 100;
    } else if (cfg.uf === "SP" && cfg.ret_sp_restaurante) {
      out.icmsAliq = RET_SP_RESTAURANTE.aliq; out.icms = base * out.icmsAliq / 100;
    }
    const rf = REFORMA[ano];
    if (rf && ano === 2026) { out.cbs = base * rf.cbs / 100; out.ibs = base * rf.ibs / 100; }
  }
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

// ---------------------------------------------------------------------
// Classifica as linhas das vendas (produto, taxa de serviço, couvert, frete)
// ---------------------------------------------------------------------
export function tipoLinha(item) {
  const n = String(item?.nome || "").toLowerCase();
  if (item?.taxa && n.startsWith("taxa de serviço")) return "taxa_servico";
  if (item?.taxa && n.startsWith("couvert")) return "couvert";
  if (item?.taxa) return "outra_taxa";
  return "produto";
}

const isoBR = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// =====================================================================
// APURAÇÃO DO MÊS: junta tudo e devolve o relatório completo
// =====================================================================
// entrada:
//   competencia "AAAA-MM", cfg (configuração fiscal), vendas (sales_orders pagas do mês, sem simuladas),
//   vendas12 (receita por mês dos 12 meses anteriores, do mais antigo ao mais recente),
//   receitaAnoAntes (receita do ano antes deste mês, para LC 224 e MEI),
//   produtos [{id, name, custo, estoque, unit}], fiscalPorProduto {id: dados}, compras (recebidas no mês),
//   despesas (fin_lancamentos despesa pagas no mês), movsDepois (estoque_mov depois do fim do mês)
export function apurarMes(dados) {
  const { competencia, cfg = {}, vendas = [], vendas12 = [], receitaAnoAntes = 0, produtos = [], fiscalPorProduto = {},
    compras = [], despesas = [], movsDepois = [], fornecedores = [] } = dados;
  const ano = Number(competencia.slice(0, 4));
  const ctx = { uf: cfg.uf || "SP", regime: cfg.regime || "simples", nicho: cfg.nicho || "restaurante" };
  const prodMap = Object.fromEntries(produtos.map((p) => [p.id, p]));
  const taxaTributavel = cfg.taxa_servico_tributavel === true;
  const couvertTributavel = cfg.couvert_tributavel !== false;
  const freteTributavel = cfg.frete_tributavel !== false;

  const linhas = [];            // cada item vendido, com fiscal e tributos
  const vendasOut = [];
  const porDia = {}, porPagamento = {}, porCanal = {};
  let bruto = 0, taxaServico = 0, couvert = 0, frete = 0, outrasTaxas = 0, descontos = 0;
  const semNcm = new Map(), semCusto = new Map();
  let vendasSemNf = 0;

  for (const v of vendas) {
    const valorCobrado = Number(v.pagamento?.valor_cobrado ?? v.total ?? 0);
    const dia = isoBR(v.paid_at || v.created_at);
    let somaItens = 0;
    const snap = v.fiscal || {};
    for (const it of v.itens || []) {
      const t = tipoLinha(it);
      const sub = Number(it.subtotal ?? Number(it.preco_unitario || 0) * Number(it.quantidade || 0));
      somaItens += sub;
      if (t === "taxa_servico") { taxaServico += sub; if (!taxaTributavel) continue; }
      if (t === "couvert") { couvert += sub; if (!couvertTributavel) continue; }
      if (t === "outra_taxa") { outrasTaxas += sub; }
      const prod = prodMap[it.product_id] || { id: it.product_id, name: it.nome };
      const salvo = snap[it.product_id] || fiscalPorProduto[it.product_id] || null;
      const fiscal = t === "produto" ? fiscalEfetivo(salvo, prod, ctx)
        : { ...sugerirFiscal({ name: "" }, { ...ctx, nicho: "servico" }), ncm: "", tipo: "taxa", cfop: "", monofasico: false, icms_st: false, cadastrado: true };
      if (t === "produto" && !fiscal.cadastrado) semNcm.set(prod.id || it.nome, prod.name || it.nome);
      const custoUnit = t === "produto" && prod.custo != null ? Number(prod.custo) : null;
      if (t === "produto" && custoUnit === null) semCusto.set(prod.id || it.nome, prod.name || it.nome);
      linhas.push({
        venda: v.numero, data: dia, tipo: t, product_id: it.product_id || null, nome: it.nome,
        quantidade: Number(it.quantidade || 0), unitario: Number(it.preco_unitario || 0), base: sub,
        custo: custoUnit === null ? null : r2(custoUnit * Number(it.quantidade || 0)),
        fiscal, trib: tributosItem(sub, fiscal, cfg, ano),
      });
    }
    // Frete/entrega cobrado à parte
    const fr = Number(v.frete || 0);
    if (fr > 0) {
      frete += fr; somaItens += fr;
      if (freteTributavel) {
        const fiscal = { ncm: "", tipo: "frete", cfop: "", monofasico: false, icms_st: false, cadastrado: true, csosn: "102", cst_icms: "00", cst_pis: ctx.regime === "simples" ? "49" : "01" };
        linhas.push({ venda: v.numero, data: dia, tipo: "frete", nome: "Taxa de entrega", quantidade: 1, unitario: fr, base: fr, custo: null, fiscal, trib: tributosItem(fr, fiscal, cfg, ano) });
      }
    }
    // Diferença entre o cobrado e a soma (arredondamentos ou descontos)
    const dif = r2(valorCobrado - somaItens);
    if (dif < 0) descontos += -dif;
    bruto += valorCobrado;
    if (!v.nf_numero) vendasSemNf++;
    porDia[dia] = porDia[dia] || { vendas: 0, valor: 0 };
    porDia[dia].vendas++; porDia[dia].valor += valorCobrado;
    const forma = formaPagamento(v.pagamento);
    porPagamento[forma] = porPagamento[forma] || { vendas: 0, valor: 0 };
    porPagamento[forma].vendas++; porPagamento[forma].valor += valorCobrado;
    const canal = { mesa: "Salão (mesa)", entrega: "Entrega", retirada: "Retirada", delivery: "Delivery" }[v.entrega?.tipo] || "WhatsApp";
    porCanal[canal] = porCanal[canal] || { vendas: 0, valor: 0 };
    porCanal[canal].vendas++; porCanal[canal].valor += valorCobrado;
    vendasOut.push({
      numero: v.numero, data: dia, hora: new Date(v.paid_at || v.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
      cliente: v.cliente?.nome || "", documento: v.cliente?.cpf || v.cliente?.cnpj || v.cliente?.cpf_cnpj || "",
      canal, forma, valor: r2(valorCobrado), nf: v.nf_numero || "",
    });
  }

  // Descontos/diferenças reduzem a base proporcionalmente (nunca deixa a base maior que o cobrado)
  const somaBases = linhas.reduce((t, l) => t + l.base, 0);
  if (descontos > 0 && somaBases > 0) {
    const fator = Math.max(0, (somaBases - descontos) / somaBases);
    for (const l of linhas) { l.base = l.base * fator; l.trib = tributosItem(l.base, l.fiscal, cfg, ano); }
  }
  for (const l of linhas) l.base = r2(l.base);

  const receitaTributavel = r2(linhas.reduce((t, l) => t + l.base, 0));
  const naoTributavel = r2(bruto - receitaTributavel);

  // Segregação (Simples): normal / monofásico / ST / monofásico + ST
  const seg = { normal: 0, monofasico: 0, st: 0, monofasico_st: 0 };
  for (const l of linhas) {
    const k = l.fiscal.monofasico && l.fiscal.icms_st ? "monofasico_st" : l.fiscal.monofasico ? "monofasico" : l.fiscal.icms_st ? "st" : "normal";
    seg[k] += l.base;
  }
  for (const k of Object.keys(seg)) seg[k] = r2(seg[k]);

  // Agrupamentos fiscais
  const agrupar = (chave) => {
    const g = {};
    for (const l of linhas) {
      const k = chave(l);
      g[k] = g[k] || { qtd: 0, base: 0, icms: 0, pis: 0, cofins: 0, cbs: 0, ibs: 0 };
      g[k].qtd += l.quantidade; g[k].base += l.base;
      for (const t of ["icms", "pis", "cofins", "cbs", "ibs"]) g[k][t] += l.trib[t];
    }
    return Object.entries(g).map(([k, v]) => ({ chave: k, ...Object.fromEntries(Object.entries(v).map(([a, b]) => [a, a === "qtd" ? Math.round(b * 1000) / 1000 : r2(b)])) }))
      .sort((a, b) => b.base - a.base);
  };
  const rotuloTipo = { taxa_servico: "Taxa de serviço", couvert: "Couvert artístico", frete: "Taxa de entrega", outra_taxa: "Outras taxas" };
  const porNcm = agrupar((l) => l.tipo === "produto" ? `${fmtNcm(l.fiscal.ncm) || "SEM NCM"}${l.fiscal.cadastrado ? "" : " (sugerido)"}` : rotuloTipo[l.tipo]);
  const porCfop = agrupar((l) => l.tipo === "produto" ? (l.fiscal.cfop || "-") : rotuloTipo[l.tipo]);
  const porCst = agrupar((l) => l.tipo === "produto"
    ? (ctx.regime === "simples" ? `CSOSN ${l.fiscal.csosn}` : `CST ${l.fiscal.cst_icms}`) + ` | PIS/Cofins ${l.fiscal.cst_pis}`
    : rotuloTipo[l.tipo]);

  // Produtos vendidos (com custo e margem)
  const porProduto = {};
  for (const l of linhas.filter((x) => x.tipo === "produto")) {
    const k = l.product_id || l.nome;
    porProduto[k] = porProduto[k] || { nome: l.nome, ncm: l.fiscal.ncm, qtd: 0, receita: 0, custo: 0, temCusto: true };
    porProduto[k].qtd += l.quantidade; porProduto[k].receita += l.base;
    if (l.custo === null) porProduto[k].temCusto = false; else porProduto[k].custo += l.custo;
  }
  const produtosVendidos = Object.values(porProduto).map((p) => ({
    ...p, qtd: Math.round(p.qtd * 1000) / 1000, receita: r2(p.receita), custo: p.temCusto ? r2(p.custo) : null,
    margem: p.temCusto && p.receita > 0 ? r2((p.receita - p.custo) / p.receita * 100) : null,
  })).sort((a, b) => b.receita - a.receita);

  const cmv = r2(linhas.filter((l) => l.tipo === "produto" && l.custo !== null).reduce((t, l) => t + l.custo, 0));
  const receitaProdutos = linhas.filter((l) => l.tipo === "produto").reduce((t, l) => t + l.base, 0);
  const receitaComCusto = linhas.filter((l) => l.tipo === "produto" && l.custo !== null).reduce((t, l) => t + l.base, 0);
  const coberturaCmv = receitaProdutos > 0 ? Math.round(receitaComCusto / receitaProdutos * 100) : 100;

  // ---------- Apuração por regime ----------
  const rbt = calcRbt12({ mesesAnteriores: vendas12, receitaMes: receitaTributavel, manual: cfg.rbt12_manual });
  let apuracao = { regime: ctx.regime, linhas: [], total: 0, avisos: [] };
  const comprasTotal = r2(compras.reduce((t, c) => t + Number(c.total || 0), 0));
  const despesasTotal = r2(despesas.reduce((t, d) => t + Number(d.valor || 0), 0));

  if (ctx.regime === "simples") {
    const s = calcSimples({ rbt12: rbt.valor, seg });
    apuracao = {
      regime: "simples", simples: s, rbt12: rbt,
      linhas: Object.entries(s.porTributo).map(([k, v]) => ({ tributo: TRIBUTO_NOME[k], valor: v, obs: "dentro do DAS" })),
      total: s.das, avisos: [],
    };
    if (s.acimaSublimite) apuracao.avisos.push("Receita dos últimos 12 meses acima do sublimite de R$ 3,6 milhões: ICMS passa a ser recolhido fora do DAS.");
    if (s.acimaLimite) apuracao.avisos.push("Receita dos últimos 12 meses acima de R$ 4,8 milhões: limite do Simples Nacional ultrapassado.");
    if (rbt.origem !== "historico" && rbt.origem !== "informado") apuracao.avisos.push("A receita dos últimos 12 meses (RBT12) foi estimada com o histórico que existe no Lumos. Informe o valor real na Configuração fiscal para o cálculo ficar exato.");
  } else if (ctx.regime === "mei") {
    const das = Number(cfg.mei_das || 0);
    apuracao = { regime: "mei", linhas: [{ tributo: "DAS-MEI (valor fixo)", valor: r2(das), obs: das ? "informado na configuração" : "informe o valor do DAS-MEI" }], total: r2(das), avisos: [] };
    const acumulado = Number(receitaAnoAntes) + bruto;
    if (acumulado > MEI_LIMITE_ANUAL) apuracao.avisos.push(`Faturamento do ano (${acumulado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) passou do limite do MEI de R$ 81 mil.`);
  } else {
    const isReal = ctx.regime === "real";
    const tab = isReal ? REAL : PRESUMIDO;
    const basePisCofins = r2(seg.normal + seg.st);
    const pis = r2(basePisCofins * tab.pis / 100), cofins = r2(basePisCofins * tab.cofins / 100);
    const icms = calcIcmsRegimeNormal({ itens: linhas, cfg: { ...cfg, uf: ctx.uf } });
    const linhasAp = [
      { tributo: `PIS (${tab.pis.toString().replace(".", ",")}%)`, valor: pis, obs: `base ${fmtBRL(basePisCofins)}; monofásicos com alíquota zero` },
      { tributo: `Cofins (${tab.cofins.toString().replace(".", ",")}%)`, valor: cofins, obs: "mesma base do PIS" },
      { tributo: icms.modo === "ret_sp" ? "ICMS (regime especial SP, 4% da receita)" : "ICMS próprio", valor: icms.valor, obs: icms.modo === "ret_sp" ? `vigente até ${fmtData(RET_SP_RESTAURANTE.vigencia_ate)}` : `itens com ST: ${fmtBRL(icms.baseSt || 0)} já recolhido na compra` },
    ];
    let credPisCofins = 0;
    if (isReal) {
      credPisCofins = r2(comprasTotal * (REAL.pis + REAL.cofins) / 100);
      linhasAp.push({ tributo: "(-) Créditos PIS/Cofins estimados", valor: -credPisCofins, obs: "9,25% sobre as compras recebidas; o contador valida o que dá crédito" });
    }
    // IRPJ e CSLL
    let irpj = 0, csll = 0, obsIr = "";
    if (!isReal) {
      const antes = Number(receitaAnoAntes);
      const excedente = Math.max(0, antes + receitaTributavel - PRESUMIDO.lc224_limite_ano) - Math.max(0, antes - PRESUMIDO.lc224_limite_ano);
      const normal = receitaTributavel - excedente;
      const baseIr = normal * PRESUMIDO.presuncao_irpj / 100 + excedente * PRESUMIDO.presuncao_irpj * (1 + PRESUMIDO.lc224_acrescimo) / 100;
      const baseCs = normal * PRESUMIDO.presuncao_csll / 100 + excedente * PRESUMIDO.presuncao_csll * (1 + PRESUMIDO.lc224_acrescimo) / 100;
      irpj = baseIr * PRESUMIDO.irpj / 100 + Math.max(0, baseIr - PRESUMIDO.adicional_limite_mes) * PRESUMIDO.irpj_adicional / 100;
      csll = baseCs * PRESUMIDO.csll / 100;
      obsIr = `presunção ${PRESUMIDO.presuncao_irpj}% (IRPJ) e ${PRESUMIDO.presuncao_csll}% (CSLL); apuração trimestral, valor mensal para provisão` + (excedente > 0 ? "; inclui acréscimo da LC 224/2025" : "");
    } else {
      const impostosReceita = pis + cofins - credPisCofins + icms.valor;
      const lucro = receitaTributavel - impostosReceita - cmv - despesasTotal;
      irpj = Math.max(0, lucro) * REAL.irpj / 100 + Math.max(0, lucro - REAL.adicional_limite_mes) * REAL.irpj_adicional / 100;
      csll = Math.max(0, lucro) * REAL.csll / 100;
      obsIr = "estimativa sobre o resultado gerencial do mês (receita - impostos - CMV - despesas); o lucro real tem ajustes do contador";
    }
    linhasAp.push({ tributo: "IRPJ", valor: r2(irpj), obs: obsIr });
    linhasAp.push({ tributo: "CSLL", valor: r2(csll), obs: isReal ? "9% sobre o resultado estimado" : "9% sobre a base presumida" });
    apuracao = { regime: ctx.regime, icms, linhas: linhasAp, total: r2(linhasAp.reduce((t, l) => t + l.valor, 0)), avisos: [] };
    if (icms.modo === "ret_sp" && competencia > "2026-12") apuracao.avisos.push("O regime especial de SP para restaurantes tinha vigência até 31/12/2026. Confirme se foi prorrogado.");
    if (cfg.uf !== "SP" && !cfg.icms_interna) apuracao.avisos.push("Informe a alíquota interna de ICMS do seu estado na Configuração fiscal.");
  }

  // Reforma tributária (informativo)
  const reforma = { ano, ...(REFORMA[ano] || {}) };
  if (ano === 2026) {
    reforma.cbs_valor = ctx.regime === "simples" || ctx.regime === "mei" ? 0 : r2(receitaTributavel * REFORMA[2026].cbs / 100);
    reforma.ibs_valor = ctx.regime === "simples" || ctx.regime === "mei" ? 0 : r2(receitaTributavel * REFORMA[2026].ibs / 100);
    reforma.texto = ctx.regime === "simples" || ctx.regime === "mei"
      ? "Simples Nacional: destaque de IBS e CBS obrigatório a partir de 01/01/2027. Em 2026 não há recolhimento."
      : "Destaque de teste na nota (CBS 0,9% e IBS 0,1%), sem recolhimento para quem cumpre as obrigações. Valores ao lado são só informativos.";
  }

  // Inventário no fim do mês (saldo atual desfeito das movimentações posteriores)
  const efeito = (m) => (m.tipo === "saida" ? -1 : 1) * Number(m.quantidade || 0);
  const depois = {};
  for (const m of movsDepois) depois[m.product_id] = (depois[m.product_id] || 0) + efeito(m);
  const inventario = produtos.filter((p) => p.estoque !== null && p.estoque !== undefined).map((p) => {
    const saldo = Math.round((Number(p.estoque || 0) - (depois[p.id] || 0)) * 1000) / 1000;
    const fiscal = fiscalEfetivo(fiscalPorProduto[p.id], p, ctx);
    return { nome: p.name, ncm: fiscal.ncm, unidade: p.unit || "unidade", saldo, custo: p.custo == null ? null : Number(p.custo), valor: p.custo == null ? null : r2(saldo * Number(p.custo)) };
  }).sort((a, b) => (b.valor || 0) - (a.valor || 0));
  const inventarioTotal = r2(inventario.reduce((t, i) => t + (i.valor || 0), 0));

  // Despesas por categoria
  const despCat = {};
  for (const d of despesas) { const k = d.categoria || "Sem categoria"; despCat[k] = (despCat[k] || 0) + Number(d.valor || 0); }
  const despesasPorCategoria = Object.entries(despCat).map(([categoria, valor]) => ({ categoria, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);

  // Entradas (compras recebidas)
  const fornMap = Object.fromEntries(fornecedores.map((f) => [f.id, f]));
  const entradas = compras.map((c) => ({
    numero: c.numero, data: isoBR(c.recebida_em || c.created_at), fornecedor: fornMap[c.fornecedor_id]?.nome || "Sem fornecedor",
    cnpj: fornMap[c.fornecedor_id]?.cnpj || "", itens: (c.itens || []).length, valor: r2(c.total),
  })).sort((a, b) => a.data.localeCompare(b.data));

  // DRE gerencial
  const impostosEstimados = apuracao.regime === "real" || apuracao.regime === "presumido"
    ? r2(apuracao.linhas.filter((l) => !/IRPJ|CSLL/.test(l.tributo)).reduce((t, l) => t + l.valor, 0))
    : apuracao.total;
  const irCs = apuracao.regime === "real" || apuracao.regime === "presumido"
    ? r2(apuracao.linhas.filter((l) => /IRPJ|CSLL/.test(l.tributo)).reduce((t, l) => t + l.valor, 0)) : 0;
  const receitaLiquida = r2(bruto - (taxaTributavel ? 0 : taxaServico) - impostosEstimados);
  const lucroBruto = r2(receitaLiquida - cmv);
  const dre = [
    { conta: "Receita bruta de vendas", valor: r2(bruto) },
    ...(taxaTributavel || !taxaServico ? [] : [{ conta: "(-) Taxa de serviço repassada à equipe", valor: -r2(taxaServico) }]),
    { conta: "(-) Impostos sobre a venda (estimados)", valor: -impostosEstimados },
    { conta: "= Receita líquida", valor: receitaLiquida, destaque: true },
    { conta: `(-) CMV (custo dos produtos vendidos)${coberturaCmv < 100 ? `, ${coberturaCmv}% das vendas com custo` : ""}`, valor: -cmv },
    { conta: "= Lucro bruto", valor: lucroBruto, destaque: true },
    { conta: "(-) Despesas pagas no mês", valor: -despesasTotal },
    ...(irCs ? [{ conta: "(-) IRPJ e CSLL (estimados)", valor: -irCs }] : []),
    { conta: "= Resultado do mês", valor: r2(lucroBruto - despesasTotal - irCs), destaque: true },
  ];

  // Pendências (o que falta para o relatório ficar 100%)
  const pend = [];
  if (!onlyDigits(cfg.cnpj)) pend.push({ nivel: "alta", texto: "CNPJ da empresa não informado na Configuração fiscal." });
  if (!cfg.inscricao_estadual && ctx.regime !== "mei") pend.push({ nivel: "media", texto: "Inscrição estadual não informada." });
  if (!cfg.regime) pend.push({ nivel: "alta", texto: "Regime tributário não definido (usando Simples Nacional como padrão)." });
  if (semNcm.size) pend.push({ nivel: "alta", texto: `${semNcm.size} produto(s) vendido(s) sem NCM cadastrado: ${[...semNcm.values()].slice(0, 8).join(", ")}${semNcm.size > 8 ? "..." : ""}. Usamos a sugestão automática.` });
  if (semCusto.size) pend.push({ nivel: "media", texto: `${semCusto.size} produto(s) vendido(s) sem custo cadastrado (o CMV fica incompleto): ${[...semCusto.values()].slice(0, 8).join(", ")}${semCusto.size > 8 ? "..." : ""}.` });
  if (vendasSemNf && vendas.length) pend.push({ nivel: "alta", texto: `${vendasSemNf} de ${vendas.length} venda(s) sem documento fiscal (NFC-e/NF-e) registrado no Lumos. Os XMLs das notas são enviados à parte pelo emissor.` });
  const comprasSemForn = compras.filter((c) => !c.fornecedor_id || !onlyDigits(fornMap[c.fornecedor_id]?.cnpj)).length;
  if (comprasSemForn) pend.push({ nivel: "media", texto: `${comprasSemForn} compra(s) sem fornecedor com CNPJ (o contador precisa da nota de entrada).` });
  if (taxaServico > 0 && cfg.taxa_servico_tributavel === undefined) pend.push({ nivel: "baixa", texto: "Confirme com o contador o tratamento da taxa de serviço (Lei 13.419/2017). Hoje ela está fora da receita tributável." });
  for (const a of apuracao.avisos) pend.push({ nivel: "media", texto: a });

  return {
    competencia, geradoEm: new Date().toISOString(), versaoRegras: VERSAO_REGRAS, cfg,
    resumo: {
      bruto: r2(bruto), vendas: vendas.length, ticket: vendas.length ? r2(bruto / vendas.length) : 0,
      taxaServico: r2(taxaServico), couvert: r2(couvert), frete: r2(frete), outrasTaxas: r2(outrasTaxas), descontos: r2(descontos),
      receitaTributavel, naoTributavel, compras: comprasTotal, despesas: despesasTotal, cmv, coberturaCmv,
      margemBruta: receitaProdutos > 0 && coberturaCmv === 100 ? r2((receitaProdutos - cmv) / receitaProdutos * 100) : null,
    },
    seg, apuracao, reforma, porNcm, porCfop, porCst,
    porPagamento: Object.entries(porPagamento).map(([forma, v]) => ({ forma, vendas: v.vendas, valor: r2(v.valor) })).sort((a, b) => b.valor - a.valor),
    porCanal: Object.entries(porCanal).map(([canal, v]) => ({ canal, vendas: v.vendas, valor: r2(v.valor) })).sort((a, b) => b.valor - a.valor),
    porDia: Object.entries(porDia).map(([data, v]) => ({ data, vendas: v.vendas, valor: r2(v.valor) })).sort((a, b) => a.data.localeCompare(b.data)),
    produtosVendidos, linhas, vendas: vendasOut, entradas, despesasPorCategoria, inventario, inventarioTotal, dre, pendencias: pend,
  };
}

export const FORMAS = { pix: "Pix", credito: "Cartão de crédito", cartao: "Cartão de crédito", debito: "Cartão de débito", dinheiro: "Dinheiro", boleto: "Boleto", manual: "Confirmado pela loja", na_entrega: "Na entrega" };
export function formaPagamento(p) { const m = p?.metodo || p?.preferencia || ""; return FORMAS[m] || (m ? m : "Não informado"); }
export const fmtBRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "-");
