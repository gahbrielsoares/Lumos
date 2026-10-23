// Edge Function: fiscal
// Liga o Lumos ao emissor de notas (Focus NFe) e emite a NFC-e das vendas.
//   status          -> situação da conexão (sem segredos)
//   conferir        -> confere os dados (CNPJ, IE, CSC, certificado) e simula o cadastro no emissor (dry_run)
//   conectar        -> confere + cadastra/atualiza a empresa no emissor + guarda os tokens + testa
//   conectar_token  -> a loja já tem conta no emissor: só testa e guarda o token
//   desconectar     -> desliga a emissão (não apaga as notas)
//   emitir          -> emite a NFC-e de uma venda paga (também chamada pela função "orders" após o pagamento)
//   emitir_teste    -> NFC-e de teste em homologação (sem valor fiscal)
//   consultar       -> atualiza a situação de uma nota
//   cancelar        -> cancela uma nota autorizada (justificativa de 15 a 255 caracteres)
//
// Deploy com "Enforce JWT verification" LIGADO.
// Secret opcional FOCUS_TOKEN_CONTA: token principal da conta Lumos no Focus NFe (permite cadastrar a empresa
// do cliente pela API, com certificado e CSC). Sem ele, só o modo "a loja já tem conta" fica disponível.
// O certificado digital e a senha NUNCA são guardados no Lumos: vão direto para o emissor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FOCUS_TOKEN_CONTA = Deno.env.get("FOCUS_TOKEN_CONTA") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ---------------------------------------------------------------------
// Validações (as mesmas do navegador, repetidas aqui por segurança)
// ---------------------------------------------------------------------
export function cnpjValido(v: unknown) {
  const c = onlyDigits(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const d of base) { soma += Number(d) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}
// IE de São Paulo (comércio/indústria): 12 dígitos com 2 dígitos verificadores
export function ieValida(v: unknown, uf: string) {
  const d = onlyDigits(v);
  if (uf !== "SP") return d.length >= 8 && d.length <= 14;
  if (d.length !== 12) return false;
  const n = d.split("").map(Number);
  const p1 = [1, 3, 4, 5, 6, 7, 8, 10];
  const d9 = (p1.reduce((t, p, i) => t + p * n[i], 0) % 11) % 10;
  const p2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const d12 = (p2.reduce((t, p, i) => t + p * n[i], 0) % 11) % 10;
  return d9 === n[8] && d12 === n[11];
}
export const cscValido = (id: unknown, csc: unknown) => /^\d{1,6}$/.test(String(id ?? "").trim()) && /^[A-Za-z0-9]{16,36}$/.test(String(csc ?? "").trim());

// ---------------------------------------------------------------------
// Focus NFe
// ---------------------------------------------------------------------
const FOCUS_BASE = { producao: "https://api.focusnfe.com.br", homologacao: "https://homologacao.focusnfe.com.br" };
const basic = (token: string) => "Basic " + btoa(`${token}:`);
async function focus(method: string, url: string, token: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: basic(token), "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { mensagem: txt.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data };
}
// Junta a mensagem principal e a lista de erros do emissor numa frase só
function erroFocus(r: { status: number; data: any }) {
  if (r.status === 401 || r.status === 403) return "O emissor recusou o acesso: token inválido ou sem permissão.";
  const d = r.data || {};
  const lista = Array.isArray(d.erros) ? d.erros.map((e: any) => [e.campo, e.mensagem].filter(Boolean).join(": ")).join("; ") : "";
  return [d.mensagem || d.mensagem_sefaz || d.codigo, lista].filter(Boolean).join(" ") || `Erro ${r.status} no emissor.`;
}

const REGIME_FOCUS: Record<string, number> = { simples: 1, mei: 4, presumido: 3, real: 3 };

// Monta o cadastro da empresa no emissor
export function montarEmpresa(d: any) {
  const e: Record<string, unknown> = {
    nome: d.razao_social, nome_fantasia: d.nome_fantasia || d.razao_social,
    cnpj: onlyDigits(d.cnpj), inscricao_estadual: onlyDigits(d.inscricao_estadual),
    regime_tributario: REGIME_FOCUS[d.regime] || 1,
    logradouro: d.logradouro, numero: d.numero || "SN", complemento: d.complemento || undefined,
    bairro: d.bairro, municipio: d.municipio, uf: d.uf, cep: onlyDigits(d.cep),
    telefone: onlyDigits(d.telefone) || undefined, email: d.email || undefined,
    habilita_nfce: true, habilita_nfe: false,
    discrimina_impostos: true,                                   // Lei da Transparência (valor aproximado dos tributos)
    habilita_contingencia_offline_nfce: d.contingencia !== false, // se a Sefaz cair, a nota sai em contingência
    enviar_email_destinatario: false,
    serie_nfce_producao: String(d.serie || "1"), serie_nfce_homologacao: String(d.serie || "1"),
  };
  if (d.cpf_cnpj_contabilidade) e.cpf_cnpj_contabilidade = onlyDigits(d.cpf_cnpj_contabilidade);
  if (d.certificado_base64) { e.arquivo_certificado_base64 = d.certificado_base64; e.senha_certificado = d.certificado_senha; }
  if (d.csc_producao) { e.csc_nfce_producao = String(d.csc_producao).trim(); e.id_token_nfce_producao = Number(d.csc_id_producao); }
  if (d.csc_homologacao) { e.csc_nfce_homologacao = String(d.csc_homologacao).trim(); e.id_token_nfce_homologacao = Number(d.csc_id_homologacao); }
  for (const k of Object.keys(e)) if (e[k] === undefined || e[k] === "") delete e[k];
  return e;
}

// Confere tudo antes de falar com o emissor. Devolve a lista de problemas (vazia = tudo certo).
export function conferirDados(d: any, { exigeCertificado = true } = {}) {
  const p: string[] = [];
  if (!String(d.razao_social || "").trim()) p.push("Informe a razão social.");
  if (!cnpjValido(d.cnpj)) p.push("CNPJ inválido (confira os 14 números).");
  if (!d.uf) p.push("Informe o estado (UF).");
  if (!ieValida(d.inscricao_estadual, d.uf)) p.push(d.uf === "SP" ? "Inscrição estadual inválida para SP (são 12 números e os dígitos não conferem)." : "Inscrição estadual inválida.");
  for (const [k, l] of [["logradouro", "rua"], ["bairro", "bairro"], ["municipio", "município"]]) if (!String(d[k] || "").trim()) p.push(`Informe o endereço: ${l}.`);
  if (onlyDigits(d.cep).length !== 8) p.push("CEP inválido (8 números).");
  if (exigeCertificado) {
    if (!d.certificado_base64) p.push("Envie o certificado digital A1 (arquivo .pfx ou .p12).");
    if (!d.certificado_senha) p.push("Informe a senha do certificado.");
    if (d.certificado_info?.cnpj && onlyDigits(d.certificado_info.cnpj) !== onlyDigits(d.cnpj)) p.push("O certificado é de outro CNPJ.");
    if (d.certificado_info?.validade && new Date(d.certificado_info.validade).getTime() < Date.now()) p.push("O certificado está vencido.");
  }
  const amb = d.ambiente === "producao" ? "producao" : "homologacao";
  if (amb === "producao" && !cscValido(d.csc_id_producao, d.csc_producao)) p.push("CSC de produção inválido: o ID tem até 6 números e o código tem de 16 a 36 letras e números.");
  if (d.csc_homologacao && !cscValido(d.csc_id_homologacao, d.csc_homologacao)) p.push("CSC de homologação inválido.");
  if (amb === "homologacao" && !d.csc_homologacao && !d.csc_producao) p.push("Informe ao menos um CSC (o de homologação serve para os testes).");
  return p;
}

// ---------------------------------------------------------------------
// NFC-e: monta a nota a partir da venda do Lumos
// ---------------------------------------------------------------------
const UNIDADE: Record<string, string> = { unidade: "UN", kg: "KG", litro: "L", m2: "M2", metro: "M", saco: "SC", caixa: "CX", rolo: "RL", pacote: "PCT", fardo: "FD", duzia: "DZ" };
const PAGAMENTO: Record<string, string> = { dinheiro: "01", cheque: "02", credito: "03", cartao: "03", debito: "04", boleto: "15", pix: "17" };
const HOMOLOG_DESC = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function agoraBR() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 19) + "-03:00";
}

// Sugestão mínima quando o produto ainda não tem cadastro fiscal (o mesmo critério do motor do Lumos)
function fiscalPadrao(nome: string, regime: string) {
  const n = nome.toLowerCase();
  const bebida = /(refrigerante|coca|guaran|fanta|sprite|pepsi|água|agua|cerveja|chopp|chope|energ|suco)/.test(n);
  const ncm = /(cerveja|chopp|chope)/.test(n) ? "22030000" : /(água|agua)/.test(n) ? "22011000" : bebida ? "22021000" : "21069090";
  const st = bebida;
  return { ncm, cfop: st ? "5405" : bebida ? "5102" : "5101", csosn: st ? "500" : "102", cst_icms: st ? "60" : "00", cst_pis: regime === "simples" || regime === "mei" ? "49" : (bebida ? "04" : "01"), origem: "0", icms_st: st, monofasico: bebida, sugerido: true };
}

export function montarNfce(order: any, ctx: { fiscalPorProduto: Record<string, any>; produtos: Record<string, any>; cfg: any; ambiente: string; cnpj: string }) {
  const { cfg, ambiente } = ctx;
  const regime = cfg.regime || "simples";
  const simples = regime === "simples" || regime === "mei";
  const taxaTributavel = cfg.taxa_servico_tributavel === true;
  const snap = order.fiscal || {};
  const avisos: string[] = [];

  const produtos = (order.itens || []).filter((i: any) => !i.taxa && Number(i.quantidade) > 0);
  const taxas = (order.itens || []).filter((i: any) => i.taxa);
  // Taxa de serviço (gorjeta) e couvert não são mercadoria: ficam fora da NFC-e, a não ser que o contador peça
  if (taxas.length && !taxaTributavel) avisos.push("Taxa de serviço/couvert fora da nota (não são mercadoria).");

  const items = produtos.map((it: any, idx: number) => {
    const prod = ctx.produtos[it.product_id] || {};
    const f = { ...fiscalPadrao(String(it.nome || prod.name || ""), regime), ...(snap[it.product_id] || ctx.fiscalPorProduto[it.product_id] || {}) };
    if (f.sugerido && !(snap[it.product_id] || ctx.fiscalPorProduto[it.product_id])) avisos.push(`${it.nome}: sem cadastro fiscal, usada a sugestão automática.`);
    const qtd = Number(it.quantidade);
    const unit = r2(Number(it.preco_unitario ?? Number(it.subtotal) / qtd));
    const bruto = r2(Number(it.subtotal ?? unit * qtd));
    const un = UNIDADE[prod.unit] || "UN";
    const cst = simples ? String(f.csosn || "102") : String(f.cst_icms || "00");
    const item: Record<string, unknown> = {
      numero_item: idx + 1,
      codigo_produto: String(it.product_id || `item${idx + 1}`).replace(/-/g, "").slice(0, 60),
      descricao: ambiente === "homologacao" && idx === 0 ? HOMOLOG_DESC : String(it.nome || prod.name || "Produto").slice(0, 120),
      codigo_ncm: onlyDigits(f.ncm) || "21069090",
      cfop: onlyDigits(f.cfop) || "5102",
      unidade_comercial: un, unidade_tributavel: un,
      quantidade_comercial: qtd, quantidade_tributavel: qtd,
      valor_unitario_comercial: unit, valor_unitario_tributavel: unit,
      valor_bruto: bruto,
      icms_origem: Number(f.origem || 0),
      icms_situacao_tributaria: cst,
      pis_situacao_tributaria: String(f.cst_pis || (simples ? "49" : "01")),
      cofins_situacao_tributaria: String(f.cst_pis || (simples ? "49" : "01")),
    };
    if (f.cest) item.codigo_cest = onlyDigits(f.cest);
    // Regime normal com ICMS próprio: base, alíquota e valor
    if (!simples && cst === "00") {
      const aliq = Number(f.icms_aliq || cfg.icms_interna || (cfg.uf === "SP" ? 18 : 0));
      item.icms_modalidade_base_calculo = 3; item.icms_base_calculo = bruto; item.icms_aliquota = aliq; item.icms_valor = r2(bruto * aliq / 100);
    }
    if (!simples && ["01", "02"].includes(String(item.pis_situacao_tributaria))) {
      const cum = regime === "presumido";
      item.pis_base_calculo = bruto; item.pis_aliquota_porcentual = cum ? 0.65 : 1.65; item.pis_valor = r2(bruto * (cum ? 0.0065 : 0.0165));
      item.cofins_base_calculo = bruto; item.cofins_aliquota_porcentual = cum ? 3 : 7.6; item.cofins_valor = r2(bruto * (cum ? 0.03 : 0.076));
    }
    return item;
  });

  // Desconto: a diferença entre o que foi cobrado e a soma dos itens (nunca aumenta o valor)
  const somaItens = r2(items.reduce((t: number, i: any) => t + Number(i.valor_bruto), 0));
  const frete = r2(Number(order.frete || 0));
  const freteNaNota = frete > 0 && cfg.frete_tributavel !== false;
  const taxaNaNota = taxaTributavel ? r2(taxas.reduce((t: number, i: any) => t + Number(i.subtotal || 0), 0)) : 0;
  const cobrado = r2(Number(order.pagamento?.valor_cobrado ?? order.total ?? 0));
  const esperado = r2(somaItens + (freteNaNota ? frete : 0) + taxaNaNota + (taxaTributavel ? 0 : r2(taxas.reduce((t: number, i: any) => t + Number(i.subtotal || 0), 0))));
  let desconto = r2(Math.max(0, esperado - cobrado));
  if (desconto > 0 && somaItens > 0) {
    let resto = desconto;
    items.forEach((i: any, k: number) => {
      const parte = k === items.length - 1 ? resto : r2(desconto * Number(i.valor_bruto) / somaItens);
      i.valor_desconto = Math.min(parte, Number(i.valor_bruto)); resto = r2(resto - Number(i.valor_desconto));
    });
  }
  const totalNota = r2(somaItens + (freteNaNota ? frete : 0) + taxaNaNota - desconto);

  const presencial = order.entrega?.tipo === "entrega" ? "4" : "1";
  const nota: Record<string, unknown> = {
    cnpj_emitente: onlyDigits(ctx.cnpj),
    data_emissao: agoraBR(),
    natureza_operacao: "VENDA AO CONSUMIDOR",
    presenca_comprador: presencial,
    modalidade_frete: freteNaNota ? "0" : "9",
    local_destino: "1",
    items,
    formas_pagamento: [{
      forma_pagamento: PAGAMENTO[order.pagamento?.metodo] || "99",
      valor_pagamento: totalNota,
      ...(["03", "04"].includes(PAGAMENTO[order.pagamento?.metodo] || "") ? { tipo_integracao: "2" } : {}),
    }],
    informacoes_adicionais_contribuinte: `Venda #${order.numero}${order.entrega?.local ? ` - ${order.entrega.local}` : ""}`.slice(0, 500),
  };
  if (freteNaNota) nota.valor_frete = frete;
  if (taxaNaNota) nota.valor_outras_despesas = taxaNaNota;
  const doc = onlyDigits(order.cliente?.cpf || order.cliente?.cpf_cnpj || "");
  if (doc.length === 11) nota.cpf_destinatario = doc;
  if (doc.length === 14) nota.cnpj_destinatario = doc;
  if ((doc.length === 11 || doc.length === 14) && order.cliente?.nome) nota.nome_destinatario = ambiente === "homologacao" ? HOMOLOG_DESC : String(order.cliente.nome).slice(0, 60);
  return { nota, totalNota, avisos, vazia: !items.length };
}

// ---------------------------------------------------------------------
// Acesso: dono da loja, equipe com a aba "fiscal"/"caixa", ou chamada interna (função orders)
// ---------------------------------------------------------------------
async function quemChama(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (jwt && jwt === SERVICE_KEY) return { interno: true, userId: null, ownerId: null, dono: true };
  const { data: me } = await supabase.auth.getUser(jwt);
  if (!me?.user) return null;
  const { data: m } = await supabase.from("team_members").select("owner_id, allowed_tabs, ativo").eq("user_id", me.user.id).maybeSingle();
  if (m) {
    if (!m.ativo) return null;
    const tabs: string[] = m.allowed_tabs || [];
    return { interno: false, userId: me.user.id, ownerId: m.owner_id, dono: false, podeEmitir: tabs.includes("fiscal") || tabs.includes("caixa") || tabs.includes("mesas") };
  }
  return { interno: false, userId: me.user.id, ownerId: me.user.id, dono: true, podeEmitir: true };
}

async function lerIntegracao(ownerId: string) {
  const { data } = await supabase.from("integrations").select("*").eq("owner_id", ownerId).eq("kind", "nota_fiscal").maybeSingle();
  return data;
}
async function salvarIntegracao(ownerId: string, campos: Record<string, unknown>) {
  const atual = await lerIntegracao(ownerId);
  const row = {
    owner_id: ownerId, kind: "nota_fiscal", provider: "focusnfe",
    enabled: campos.enabled ?? atual?.enabled ?? false,
    config: { ...(atual?.config || {}), ...((campos.config as object) || {}) },
    secrets: { ...(atual?.secrets || {}), ...((campos.secrets as object) || {}) },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("integrations").upsert(row, { onConflict: "owner_id,kind" });
  if (error) throw new Error(error.message);
  return row;
}
const tokenDo = (integ: any, ambiente: string) => ambiente === "producao" ? integ?.secrets?.token_producao : integ?.secrets?.token_homologacao || integ?.secrets?.token_producao;

// Grava/atualiza a nota no Lumos a partir da resposta do emissor
async function registrarResposta(docId: string, r: { ok: boolean; status: number; data: any }, base: string, salesOrderId: string | null) {
  const d = r.data || {};
  const st = d.status === "autorizado" ? "autorizado" : d.status === "cancelado" ? "cancelado" : d.status === "processando_autorizacao" ? "processando" : "erro";
  const abs = (p: string | undefined) => (p ? (p.startsWith("http") ? p : `${base}${p}`) : null);
  const campos: Record<string, unknown> = {
    status: st, resposta: d, updated_at: new Date().toISOString(),
    numero: d.numero || null, serie: d.serie || null, chave: d.chave_nfe || null,
    mensagem: st === "erro" ? erroFocus(r) : d.mensagem_sefaz || null,
    xml_url: abs(d.caminho_xml_nota_fiscal), danfe_url: abs(d.caminho_danfe), qrcode_url: d.qrcode_url || d.url_consulta_nf || null,
  };
  await supabase.from("fiscal_docs").update(campos).eq("id", docId);
  if (st === "autorizado" && salesOrderId) await supabase.from("sales_orders").update({ nf_numero: String(d.numero || "") }).eq("id", salesOrderId);
  return { status: st, ...campos };
}

// Emite a NFC-e de uma venda
async function emitirVenda(ownerId: string, salesOrderId: string, userId: string | null) {
  const integ = await lerIntegracao(ownerId);
  if (!integ?.enabled || integ.provider !== "focusnfe") return { error: "A emissão de NFC-e não está conectada. Configure em Notas fiscais." };
  const amb = integ.config?.ambiente === "producao" ? "producao" : "homologacao";
  const token = tokenDo(integ, amb);
  if (!token) return { error: `Falta o token de ${amb === "producao" ? "produção" : "homologação"} do emissor. Reconecte em Notas fiscais.` };
  const { data: order } = await supabase.from("sales_orders").select("*").eq("id", salesOrderId).eq("owner_id", ownerId).maybeSingle();
  if (!order) return { error: "Venda não encontrada." };
  if (order.status !== "pago") return { error: "Só vendas pagas recebem nota." };
  if (order.simulado) return { error: "Venda do simulador não recebe nota de verdade." };
  const { data: ja } = await supabase.from("fiscal_docs").select("id, status").eq("sales_order_id", salesOrderId).in("status", ["autorizado", "processando"]).limit(1);
  if (ja?.length) return { error: ja[0].status === "autorizado" ? "Esta venda já tem nota autorizada." : "A nota desta venda já está sendo processada." };

  const ids = (order.itens || []).map((i: any) => i.product_id).filter(Boolean);
  const [{ data: fis }, { data: prods }, { data: fc }] = await Promise.all([
    ids.length ? supabase.from("product_fiscal").select("*").in("product_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("products").select("id, name, unit").in("id", ids) : Promise.resolve({ data: [] }),
    supabase.from("fiscal_config").select("dados").eq("owner_id", ownerId).maybeSingle(),
  ]);
  const cfg = { ...(fc?.dados || {}), ...(integ.config?.regime ? { regime: integ.config.regime } : {}) };
  const m = montarNfce(order, {
    fiscalPorProduto: Object.fromEntries((fis || []).map((f: any) => [f.product_id, f])),
    produtos: Object.fromEntries((prods || []).map((p: any) => [p.id, p])),
    cfg, ambiente: amb, cnpj: integ.config?.cnpj || cfg.cnpj,
  });
  if (m.vazia) return { error: "A venda não tem produtos para a nota (só taxas)." };

  const { count } = await supabase.from("fiscal_docs").select("id", { count: "exact", head: true }).eq("sales_order_id", salesOrderId);
  const ref = `so${String(order.id).replace(/-/g, "")}${count ? `t${count}` : ""}`;
  const { data: doc, error } = await supabase.from("fiscal_docs").insert({
    owner_id: ownerId, sales_order_id: salesOrderId, ambiente: amb, ref, status: "processando", valor: m.totalNota, emitido_por: userId,
  }).select().single();
  if (error) return { error: error.message };
  const base = FOCUS_BASE[amb];
  const r = await focus("POST", `${base}/v2/nfce?ref=${encodeURIComponent(ref)}`, token, m.nota);
  const res = await registrarResposta(doc.id, r, base, salesOrderId);
  return { ok: res.status === "autorizado", doc_id: doc.id, ...res, avisos: m.avisos, enviar_cliente: integ.config?.enviar_cliente !== false };
}

// Manda o link do cupom para o cliente no WhatsApp (mesmo número do atendimento)
async function enviarCupom(salesOrderId: string, danfe: string, numero: string) {
  try {
    const { data: o } = await supabase.from("sales_orders").select("lead_id, agent_id").eq("id", salesOrderId).maybeSingle();
    if (!o?.lead_id) return;
    const [{ data: lead }, { data: wa }] = await Promise.all([
      supabase.from("leads").select("id, phone").eq("id", o.lead_id).maybeSingle(),
      supabase.from("whatsapp_provider_config").select("*").eq("agent_id", o.agent_id).maybeSingle(),
    ]);
    const to = onlyDigits(lead?.phone);
    if (!to || to.length < 10 || !wa?.base_url || !wa?.api_key) return;
    const text = `🧾 Seu cupom fiscal (NFC-e nº ${numero}) já está disponível:\n${danfe}`;
    await supabase.from("messages").insert({ lead_id: lead!.id, direction: "out", sender: "sistema", text });
    await (wa.vendor === "evolution"
      ? fetch(`${wa.base_url}/message/sendText/${wa.instance_id}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: wa.api_key }, body: JSON.stringify({ number: to, text }) })
      : fetch(`${wa.base_url}/send/text`, { method: "POST", headers: { "Content-Type": "application/json", token: wa.api_key }, body: JSON.stringify({ number: to, text }) }));
  } catch (e) { console.error("Falha ao enviar cupom:", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const quem = await quemChama(req);
    if (!quem) return json({ error: "Sessão expirada. Entre de novo." }, 401);
    const body = await req.json().catch(() => ({}));
    const ownerId = quem.interno ? String(body.owner_id || "") : quem.ownerId!;
    if (!ownerId) return json({ error: "Loja não identificada." }, 400);
    const acao = String(body.action || "");
    const soDono = ["conferir", "conectar", "conectar_token", "desconectar"];
    if (soDono.includes(acao) && (!quem.dono || quem.interno)) return json({ error: "Só o responsável pelo estabelecimento configura a emissão." }, 403);
    if (!quem.dono && !quem.podeEmitir) return json({ error: "Sem permissão para notas fiscais." }, 403);

    // ---------- situação ----------
    if (acao === "status") {
      const integ = await lerIntegracao(ownerId);
      return json({
        conectado: !!integ?.enabled && integ.provider === "focusnfe", provider: integ?.provider || null,
        config: integ?.config || {}, tem_token_producao: !!integ?.secrets?.token_producao, tem_token_homologacao: !!integ?.secrets?.token_homologacao,
        cadastro_pela_lumos: !!FOCUS_TOKEN_CONTA,
      });
    }

    // ---------- conferir / conectar (cadastro da empresa pela Lumos) ----------
    if (acao === "conferir" || acao === "conectar") {
      const d = body.dados || {};
      const passos: { passo: string; ok: boolean; detalhe?: string }[] = [];
      const problemas = conferirDados(d);
      passos.push({ passo: "Dados conferidos (CNPJ, inscrição estadual, endereço, CSC)", ok: !problemas.length, detalhe: problemas.join(" ") || undefined });
      if (problemas.length) return json({ ok: false, passos });
      if (!FOCUS_TOKEN_CONTA) {
        passos.push({ passo: "Conta Lumos no emissor", ok: false, detalhe: "A Lumos ainda não configurou o token da conta no emissor (secret FOCUS_TOKEN_CONTA). Use a opção \"A loja já tem conta no emissor\" ou fale com o suporte Lumos." });
        return json({ ok: false, passos });
      }
      const empresa = montarEmpresa(d);
      const cnpj = onlyDigits(d.cnpj);
      const existente = await focus("GET", `${FOCUS_BASE.producao}/v2/empresas?cnpj=${cnpj}`, FOCUS_TOKEN_CONTA);
      const atual = existente.ok && Array.isArray(existente.data) ? existente.data[0] : null;
      // Simulação: o emissor confere o certificado (senha, validade, CNPJ) sem gravar nada
      const sim = atual
        ? await focus("PUT", `${FOCUS_BASE.producao}/v2/empresas/${atual.id}?dry_run=1`, FOCUS_TOKEN_CONTA, empresa)
        : await focus("POST", `${FOCUS_BASE.producao}/v2/empresas?dry_run=1`, FOCUS_TOKEN_CONTA, empresa);
      passos.push({ passo: "Certificado digital e cadastro conferidos pelo emissor", ok: sim.ok, detalhe: sim.ok ? undefined : erroFocus(sim) });
      if (!sim.ok || acao === "conferir") return json({ ok: sim.ok, passos });

      const real = atual
        ? await focus("PUT", `${FOCUS_BASE.producao}/v2/empresas/${atual.id}`, FOCUS_TOKEN_CONTA, empresa)
        : await focus("POST", `${FOCUS_BASE.producao}/v2/empresas`, FOCUS_TOKEN_CONTA, empresa);
      passos.push({ passo: atual ? "Empresa atualizada no emissor" : "Empresa cadastrada no emissor", ok: real.ok, detalhe: real.ok ? undefined : erroFocus(real) });
      if (!real.ok) return json({ ok: false, passos });
      let emp = real.data || {};
      if (!emp.token_producao && !emp.token_homologacao && (emp.id || atual?.id)) {
        const c = await focus("GET", `${FOCUS_BASE.producao}/v2/empresas/${emp.id || atual.id}`, FOCUS_TOKEN_CONTA);
        if (c.ok) emp = { ...emp, ...c.data };
      }
      const tokens = { token_producao: emp.token_producao || null, token_homologacao: emp.token_homologacao || null };
      passos.push({ passo: "Chaves de emissão recebidas", ok: !!(tokens.token_producao || tokens.token_homologacao), detalhe: tokens.token_producao || tokens.token_homologacao ? undefined : "O emissor não devolveu os tokens. Abra um chamado com o suporte do emissor." });
      if (!tokens.token_producao && !tokens.token_homologacao) return json({ ok: false, passos });

      const amb = d.ambiente === "producao" ? "producao" : "homologacao";
      const teste = await focus("GET", `${FOCUS_BASE[amb]}/v2/nfce/lumos-teste-conexao`, amb === "producao" ? tokens.token_producao : tokens.token_homologacao || tokens.token_producao);
      const conexaoOk = teste.status === 404 || teste.ok;
      passos.push({ passo: `Conexão testada (${amb === "producao" ? "produção" : "homologação"})`, ok: conexaoOk, detalhe: conexaoOk ? undefined : erroFocus(teste) });
      await salvarIntegracao(ownerId, {
        enabled: conexaoOk,
        config: {
          modo: "lumos", empresa_id: emp.id || atual?.id || null, cnpj, ambiente: amb, regime: d.regime || "simples",
          serie: String(d.serie || "1"), emitir_quando: d.emitir_quando || "apos_pagamento", enviar_cliente: d.enviar_cliente !== false,
          contingencia: d.contingencia !== false, uf: d.uf,
          certificado: d.certificado_info || null, csc_id_producao: d.csc_id_producao || null, csc_homologacao: !!d.csc_homologacao,
          conectado_em: new Date().toISOString(),
        },
        secrets: tokens,
      });
      // Os dados da empresa também alimentam a Contabilidade
      const { data: fc } = await supabase.from("fiscal_config").select("dados").eq("owner_id", ownerId).maybeSingle();
      await supabase.from("fiscal_config").upsert({ owner_id: ownerId, dados: {
        ...(fc?.dados || {}), razao_social: d.razao_social, nome_fantasia: d.nome_fantasia, cnpj: d.cnpj, inscricao_estadual: d.inscricao_estadual,
        regime: d.regime || fc?.dados?.regime || "simples", uf: d.uf, municipio: d.municipio,
        endereco: { logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cep: d.cep, telefone: d.telefone, email: d.email },
      }, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
      return json({ ok: conexaoOk, passos });
    }

    // ---------- a loja já tem conta: só o token ----------
    if (acao === "conectar_token") {
      const d = body.dados || {};
      const amb = d.ambiente === "producao" ? "producao" : "homologacao";
      const passos: { passo: string; ok: boolean; detalhe?: string }[] = [];
      const token = String(d.token || "").trim();
      const cnpjOk = cnpjValido(d.cnpj);
      passos.push({ passo: "Dados conferidos", ok: !!token && cnpjOk, detalhe: !token ? "Informe o token do emissor." : !cnpjOk ? "CNPJ inválido." : undefined });
      if (!token || !cnpjOk) return json({ ok: false, passos });
      const teste = await focus("GET", `${FOCUS_BASE[amb]}/v2/nfce/lumos-teste-conexao`, token);
      const ok = teste.status === 404 || teste.ok;
      passos.push({ passo: `Token testado no emissor (${amb === "producao" ? "produção" : "homologação"})`, ok, detalhe: ok ? undefined : erroFocus(teste) });
      if (ok) await salvarIntegracao(ownerId, {
        enabled: true,
        config: { modo: "token", cnpj: onlyDigits(d.cnpj), ambiente: amb, regime: d.regime || "simples", serie: String(d.serie || "1"),
          emitir_quando: d.emitir_quando || "apos_pagamento", enviar_cliente: d.enviar_cliente !== false, uf: d.uf || "SP", conectado_em: new Date().toISOString() },
        secrets: amb === "producao" ? { token_producao: token } : { token_homologacao: token },
      });
      return json({ ok, passos });
    }

    if (acao === "desconectar") {
      await salvarIntegracao(ownerId, { enabled: false, config: { desconectado_em: new Date().toISOString() } });
      return json({ ok: true });
    }

    // ---------- emitir ----------
    if (acao === "emitir") {
      const r = await emitirVenda(ownerId, String(body.sales_order_id || ""), quem.userId);
      if ((r as any).ok && (r as any).enviar_cliente && (r as any).danfe_url && body.enviar_cliente !== false) await enviarCupom(String(body.sales_order_id), (r as any).danfe_url, String((r as any).numero || ""));
      return json(r, (r as any).error ? 400 : 200);
    }

    if (acao === "emitir_teste") {
      const integ = await lerIntegracao(ownerId);
      const token = integ?.secrets?.token_homologacao || (integ?.config?.ambiente !== "producao" ? integ?.secrets?.token_producao : null);
      if (!integ?.enabled || !token) return json({ error: "Conecte o emissor em homologação para emitir a nota de teste." }, 400);
      const { data: fc } = await supabase.from("fiscal_config").select("dados").eq("owner_id", ownerId).maybeSingle();
      const venda = { id: crypto.randomUUID(), numero: "TESTE", itens: [{ product_id: null, nome: "Produto de teste", quantidade: 1, preco_unitario: 1, subtotal: 1 }], pagamento: { metodo: "dinheiro", valor_cobrado: 1 }, entrega: { tipo: "retirada" } };
      const m = montarNfce(venda, { fiscalPorProduto: {}, produtos: {}, cfg: { ...(fc?.dados || {}), regime: integ.config?.regime || fc?.dados?.regime }, ambiente: "homologacao", cnpj: integ.config?.cnpj });
      const ref = `teste${Date.now()}`;
      const { data: doc } = await supabase.from("fiscal_docs").insert({ owner_id: ownerId, ambiente: "homologacao", ref, status: "processando", valor: 1, teste: true, emitido_por: quem.userId }).select().single();
      const r = await focus("POST", `${FOCUS_BASE.homologacao}/v2/nfce?ref=${ref}`, token, m.nota);
      const res = await registrarResposta(doc.id, r, FOCUS_BASE.homologacao, null);
      return json({ ok: res.status === "autorizado", ...res });
    }

    // ---------- consultar / cancelar ----------
    if (acao === "consultar" || acao === "cancelar") {
      const { data: doc } = await supabase.from("fiscal_docs").select("*").eq("id", String(body.doc_id || "")).eq("owner_id", ownerId).maybeSingle();
      if (!doc) return json({ error: "Nota não encontrada." }, 404);
      const integ = await lerIntegracao(ownerId);
      const token = tokenDo(integ, doc.ambiente);
      if (!token) return json({ error: "Emissor desconectado." }, 400);
      const base = FOCUS_BASE[doc.ambiente as "producao" | "homologacao"];
      if (acao === "consultar") {
        const r = await focus("GET", `${base}/v2/nfce/${encodeURIComponent(doc.ref)}`, token);
        return json(await registrarResposta(doc.id, r, base, doc.sales_order_id));
      }
      const just = String(body.justificativa || "").trim();
      if (just.length < 15 || just.length > 255) return json({ error: "A justificativa do cancelamento precisa ter de 15 a 255 caracteres." }, 400);
      if (doc.status !== "autorizado") return json({ error: "Só notas autorizadas podem ser canceladas." }, 400);
      const r = await focus("DELETE", `${base}/v2/nfce/${encodeURIComponent(doc.ref)}`, token, { justificativa: just });
      if (!r.ok || (r.data?.status && r.data.status !== "cancelado")) return json({ error: erroFocus(r) }, 400);
      await supabase.from("fiscal_docs").update({ status: "cancelado", cancelado_em: new Date().toISOString(), cancelamento_motivo: just, resposta: r.data, updated_at: new Date().toISOString() }).eq("id", doc.id);
      if (doc.sales_order_id) await supabase.from("sales_orders").update({ nf_numero: null }).eq("id", doc.sales_order_id);
      return json({ ok: true, status: "cancelado" });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error("fiscal:", err);
    return json({ error: "Erro inesperado na emissão. Tente de novo em instantes." }, 500);
  }
});
