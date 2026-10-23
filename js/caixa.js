// Cálculos do caixa (sem banco): vendas por forma de pagamento e dinheiro esperado na gaveta

export const FORMAS_CAIXA = { dinheiro: "Dinheiro", pix: "Pix", credito: "Cartão de crédito", debito: "Cartão de débito", boleto: "Boleto", outros: "Outras formas" };
const MAPA = { dinheiro: "dinheiro", pix: "pix", credito: "credito", cartao: "credito", debito: "debito", boleto: "boleto" };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function resumoCaixa({ valorInicial = 0, vendas = [], movs = [] }) {
  const formas = Object.fromEntries(Object.keys(FORMAS_CAIXA).map((k) => [k, { qtd: 0, valor: 0 }]));
  for (const v of vendas) {
    const k = MAPA[v.pagamento?.metodo] || "outros";
    formas[k].qtd += 1;
    formas[k].valor = r2(formas[k].valor + Number(v.pagamento?.valor_cobrado ?? v.total ?? 0));
  }
  const sangrias = r2(movs.filter((m) => m.tipo === "sangria").reduce((t, m) => t + Number(m.valor), 0));
  const suprimentos = r2(movs.filter((m) => m.tipo === "suprimento").reduce((t, m) => t + Number(m.valor), 0));
  return {
    formas, sangrias, suprimentos,
    qtdVendas: vendas.length,
    totalVendas: r2(Object.values(formas).reduce((t, f) => t + f.valor, 0)),
    dinheiroGaveta: r2(Number(valorInicial) + formas.dinheiro.valor + suprimentos - sangrias),
  };
}
