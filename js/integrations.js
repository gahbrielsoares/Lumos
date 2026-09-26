import { supabase } from "./supabaseClient.js?v=40";

// =====================================================================
// Integrações da loja (pagamento, frete, estoque, nota fiscal, regras de
// venda e API personalizada). A tela é gerada a partir deste esquema:
// pra adicionar um campo ou um fornecedor novo, basta mexer aqui.
//
// Tipos de campo: text, number, password (secreto), select, toggle,
// textarea, multi (várias opções), table (linhas repetíveis).
// showIf: { provider: [...] } mostra o campo só pra esses fornecedores.
// secret: true -> salvo em `secrets` (nunca é exibido de volta na tela).
// =====================================================================

export const INTEGRATIONS = [
  {
    kind: "vendas",
    label: "Regras de venda",
    description: "Como a IA monta orçamentos e fecha pedidos: aprovação, perdas, descontos e validade.",
    icon: `<path d="M3 3h18v4H3zM5 7v14h14V7M9 11h6M9 15h4"/>`,
    providers: null,
    fields: [
      { key: "aprovacao_humana", label: "Vendedor aprova o orçamento antes de enviar o link de pagamento", type: "toggle", default: true,
        hint: "Recomendado no começo: a IA monta o pedido e um humano confirma com um clique." },
      { key: "telefone_aprovacao", label: "WhatsApp do vendedor que recebe os pedidos pra aprovar", type: "text", placeholder: "+55 19 99999-9999" },
      { key: "perda_padrao", label: "Margem de perda padrão (%)", type: "number", default: 0, defaultByBusiness: { materiais_construcao: 10 },
        hint: "Acrescentada no cálculo de quantidade (ex.: 10% em pisos e revestimentos)." },
      { key: "desconto_max", label: "Desconto máximo que a IA pode oferecer (%)", type: "number", default: 0 },
      { key: "validade_orcamento_dias", label: "Validade do orçamento (dias)", type: "number", default: 3 },
      { key: "pedido_minimo", label: "Valor mínimo do pedido (R$)", type: "number", default: 0 },
      { key: "mensagem_pos_pagamento", label: "Mensagem enviada após o pagamento", type: "textarea",
        default: "Pagamento confirmado! ✅ Obrigado pela compra. Já estamos separando seu pedido e avisamos assim que sair para entrega." },
    ],
  },
  {
    kind: "restaurante",
    label: "Restaurante e bar",
    description: "Modalidades (mesa, delivery, retirada, reservas), horários, taxa de serviço, couvert, tempos e eventos.",
    icon: `<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v8M10 3v8a3 3 0 0 1-3 3M17 21V3c-2 1-3 4-3 7h3"/>`,
    providers: null,
    fields: [
      { key: "modalidades", label: "O que a casa oferece pelo WhatsApp", type: "multi", default: ["mesa"],
        hint: "Só \"Pedido na mesa\" = atendimento exclusivo do salão: qualquer mensagem recebe as boas-vindas e o pedido do número da mesa.",
        options: [
          { value: "mesa", label: "Pedido na mesa" }, { value: "delivery", label: "Delivery" },
          { value: "retirada", label: "Retirada no balcão" }, { value: "reservas", label: "Reservas" },
        ] },
      { key: "horarios", label: "Horário de funcionamento", type: "textarea",
        default: "Seg: fechado\nTer a Qui: 18h às 23h30\nSex e Sáb: 18h às 2h\nDom: 12h às 17h (almoço)" },
      { key: "taxa_servico", label: "Taxa de serviço na mesa (%)", type: "number", default: 10 },
      { key: "couvert", label: "Couvert artístico por pessoa (R$) — 0 = sem couvert", type: "number", default: 0 },
      { key: "couvert_info", label: "Quando tem couvert / música ao vivo", type: "text", placeholder: "Ex.: música ao vivo sex e sáb a partir das 21h" },
      { key: "tempo_preparo", label: "Tempo médio de preparo (min)", type: "number", default: 25 },
      { key: "tempo_entrega", label: "Tempo médio de entrega no delivery (min)", type: "number", default: 40 },
      { key: "pedido_minimo_delivery", label: "Pedido mínimo no delivery (R$)", type: "number", default: 0 },
      { key: "pagamento_na_entrega", label: "Aceita pagamento na entrega (dinheiro ou maquininha)", type: "toggle", default: true },
      { key: "reserva_max_pessoas", label: "Reserva: máximo de pessoas", type: "number", default: 20 },
      { key: "reserva_antecedencia_h", label: "Reserva: antecedência mínima (horas)", type: "number", default: 2 },
      { key: "reserva_tolerancia_min", label: "Reserva: tolerância de atraso (min)", type: "number", default: 15 },
      { key: "eventos", label: "Promoções, happy hour e eventos (a IA divulga)", type: "textarea",
        placeholder: "Ex.: Happy hour ter a sex, 18h às 20h: chope em dobro. Quinta: samba ao vivo." },
    ],
  },
  {
    kind: "pagamento",
    label: "Pagamento",
    description: "Gera links de pagamento e Pix direto na conversa, e confirma o pagamento sozinho.",
    icon: `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>`,
    providers: [
      { value: "mercadopago", label: "Mercado Pago" },
      { value: "asaas", label: "Asaas" },
      { value: "pagarme", label: "Pagar.me" },
      { value: "infinitepay", label: "InfinitePay" },
      { value: "stripe", label: "Stripe" },
      { value: "pix_manual", label: "Pix manual (só envia a chave Pix)" },
    ],
    fields: [
      { key: "ambiente", label: "Ambiente", type: "select", default: "teste",
        options: [{ value: "teste", label: "Teste (sandbox)" }, { value: "producao", label: "Produção" }],
        showIf: { provider: ["mercadopago", "asaas", "pagarme", "infinitepay", "stripe"] } },
      { key: "access_token", label: "Access token / Chave de API", type: "password", secret: true,
        showIf: { provider: ["mercadopago", "asaas", "pagarme", "infinitepay", "stripe"] } },
      { key: "public_key", label: "Public key (se o gateway fornecer)", type: "text",
        showIf: { provider: ["mercadopago", "pagarme", "stripe"] } },
      { key: "metodos", label: "Formas de pagamento aceitas", type: "multi", default: ["pix", "cartao"],
        options: [{ value: "pix", label: "Pix" }, { value: "cartao", label: "Cartão de crédito" }, { value: "boleto", label: "Boleto" }],
        showIf: { provider: ["mercadopago", "asaas", "pagarme", "infinitepay", "stripe"] } },
      { key: "max_parcelas", label: "Máximo de parcelas no cartão", type: "number", default: 3,
        showIf: { provider: ["mercadopago", "asaas", "pagarme", "infinitepay", "stripe"] } },
      { key: "parcelas_sem_juros", label: "Parcelas sem juros (até)", type: "number", default: 1,
        showIf: { provider: ["mercadopago", "asaas", "pagarme", "infinitepay", "stripe"] } },
      { key: "validade_link_horas", label: "Validade do link de pagamento (horas)", type: "number", default: 24,
        showIf: { provider: ["mercadopago", "asaas", "pagarme", "infinitepay", "stripe"] } },
      { key: "pix_chave", label: "Chave Pix", type: "text", placeholder: "CNPJ, e-mail, telefone ou chave aleatória",
        showIf: { provider: ["pix_manual"] } },
      { key: "pix_titular", label: "Nome do titular (aparece pro cliente conferir)", type: "text",
        showIf: { provider: ["pix_manual"] } },
    ],
  },
  {
    kind: "frete",
    label: "Frete e entrega",
    description: "Tabela de entrega própria por região, retirada na loja ou cotação por transportadora.",
    icon: `<path d="M1 7h13v10H1zM14 10h4l3 3v4h-7"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>`,
    providers: [
      { value: "proprio", label: "Entrega própria (tabela por região)" },
      { value: "melhorenvio", label: "Melhor Envio (Correios e transportadoras)" },
      { value: "retirada", label: "Somente retirada na loja" },
    ],
    fields: [
      { key: "cep_origem", label: "CEP da loja (origem)", type: "text", placeholder: "13500-000" },
      { key: "cidade", label: "Cidade da loja", type: "text", placeholder: "Ex.: Rio Claro",
        hint: "Usada pra saber se o CEP do cliente é de outra cidade (aí vale a linha \"Cidades vizinhas\" da tabela, se existir). Dica: crie uma linha \"Demais bairros\" para cobrir bairros que não estão na tabela." },
      { key: "endereco_retirada", label: "Endereço para retirada", type: "text" },
      { key: "permite_retirada", label: "Cliente pode retirar na loja", type: "toggle", default: true,
        showIf: { provider: ["proprio", "melhorenvio"] } },
      { key: "faixas", label: "Tabela de entrega", type: "table", showIf: { provider: ["proprio"] },
        hint: "Uma linha por região. Preencha o bairro OU a faixa de CEP.",
        columns: [
          { key: "regiao", label: "Bairro / região", type: "text", placeholder: "Centro" },
          { key: "cep_inicio", label: "CEP inicial", type: "text", placeholder: "13500-000" },
          { key: "cep_fim", label: "CEP final", type: "text", placeholder: "13509-999" },
          { key: "valor", label: "Valor (R$)", type: "number", placeholder: "30" },
          { key: "prazo", label: "Prazo", type: "text", placeholder: "1 dia útil" },
        ] },
      { key: "observacao_entrega", label: "Regras da entrega (enviadas ao cliente na confirmação)", type: "textarea",
        default: "A descarga é feita no térreo, na calçada ou na garagem. Em condomínio, deixe a portaria avisada e confira se o caminhão tem acesso.",
        showIf: { provider: ["proprio", "melhorenvio"] } },
      { key: "fora_da_tabela", label: "Endereço fora da tabela", type: "select", default: "humano",
        options: [{ value: "humano", label: "Chamar um vendedor" }, { value: "recusar", label: "Informar que não entrega na região" }],
        showIf: { provider: ["proprio"] } },
      { key: "frete_gratis_acima", label: "Frete grátis acima de (R$) — 0 = nunca", type: "number", default: 0,
        showIf: { provider: ["proprio", "melhorenvio"] } },
      { key: "melhorenvio_token", label: "Token do Melhor Envio", type: "password", secret: true,
        showIf: { provider: ["melhorenvio"] } },
      { key: "melhorenvio_ambiente", label: "Ambiente", type: "select", default: "teste",
        options: [{ value: "teste", label: "Teste (sandbox)" }, { value: "producao", label: "Produção" }],
        showIf: { provider: ["melhorenvio"] } },
    ],
  },
  {
    kind: "estoque",
    label: "Estoque",
    description: "Evita vender o que acabou: controle manual no catálogo ou sincronizado com o ERP da loja.",
    icon: `<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>`,
    providers: [
      { value: "manual", label: "Manual (marco disponibilidade no catálogo)" },
      { value: "bling", label: "Bling" },
      { value: "tiny", label: "Tiny (Olist)" },
      { value: "omie", label: "Omie" },
      { value: "api_propria", label: "API própria da loja" },
    ],
    fields: [
      { key: "token", label: "Token de API", type: "password", secret: true, showIf: { provider: ["bling", "tiny"] } },
      { key: "omie_app_key", label: "App Key", type: "text", showIf: { provider: ["omie"] } },
      { key: "omie_app_secret", label: "App Secret", type: "password", secret: true, showIf: { provider: ["omie"] } },
      { key: "api_url", label: "URL da API de estoque", type: "text", placeholder: "https://erp.loja.com.br/api/estoque",
        showIf: { provider: ["api_propria"] } },
      { key: "api_token", label: "Token da API", type: "password", secret: true, showIf: { provider: ["api_propria"] } },
      { key: "sync_minutos", label: "Sincronizar a cada", type: "select", default: "15",
        options: [{ value: "5", label: "5 minutos" }, { value: "15", label: "15 minutos" }, { value: "60", label: "1 hora" }, { value: "1440", label: "1 vez por dia" }],
        showIf: { provider: ["bling", "tiny", "omie", "api_propria"] } },
      { key: "bloquear_sem_estoque", label: "IA não oferece produto sem estoque", type: "toggle", default: true },
      { key: "estoque_baixo", label: "Avisar o vendedor quando o estoque ficar abaixo de", type: "number", default: 5 },
    ],
  },
  {
    kind: "nota_fiscal",
    label: "Nota fiscal",
    description: "Emissão de NF-e após a venda, pelo ERP ou emissor que a loja já usa.",
    icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>`,
    providers: [
      { value: "nenhum", label: "Não emitir pelo Lumos" },
      { value: "bling", label: "Bling" },
      { value: "tiny", label: "Tiny (Olist)" },
      { value: "focusnfe", label: "Focus NFe" },
      { value: "enotas", label: "eNotas" },
    ],
    fields: [
      { key: "ambiente", label: "Ambiente", type: "select", default: "homologacao",
        options: [{ value: "homologacao", label: "Homologação (teste, sem valor fiscal)" }, { value: "producao", label: "Produção" }],
        showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "token", label: "Token de API", type: "password", secret: true, showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "cnpj", label: "CNPJ emitente", type: "text", placeholder: "00.000.000/0001-00", showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "inscricao_estadual", label: "Inscrição estadual", type: "text", showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "regime", label: "Regime tributário", type: "select", default: "simples",
        options: [{ value: "simples", label: "Simples Nacional" }, { value: "presumido", label: "Lucro Presumido" }, { value: "real", label: "Lucro Real" }, { value: "mei", label: "MEI" }],
        showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "cfop", label: "CFOP padrão", type: "text", default: "5102", hint: "5102 = venda de mercadoria dentro do estado. Confirme com o contador.",
        showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "natureza_operacao", label: "Natureza da operação", type: "text", default: "Venda de mercadoria",
        showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "emitir_quando", label: "Quando emitir", type: "select", default: "manual",
        options: [{ value: "manual", label: "Manual (vendedor clica pra emitir)" }, { value: "apos_pagamento", label: "Automático após o pagamento" }],
        showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
      { key: "enviar_cliente", label: "Enviar o PDF da nota pro cliente no WhatsApp", type: "toggle", default: true,
        showIf: { provider: ["bling", "tiny", "focusnfe", "enotas"] } },
    ],
  },
  {
    kind: "api_personalizada",
    label: "API personalizada",
    description: "Envia os eventos de venda pro sistema da loja: pedido criado, pagamento confirmado, nota emitida.",
    icon: `<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>`,
    providers: null,
    fields: [
      { key: "url", label: "URL que recebe os eventos", type: "text", placeholder: "https://sistema.loja.com.br/webhooks/lumos" },
      { key: "segredo", label: "Segredo (enviado no cabeçalho X-Lumos-Secret)", type: "password", secret: true, optional: true },
      { key: "eventos", label: "Eventos enviados", type: "multi", default: ["pedido_criado", "pagamento_confirmado"],
        options: [
          { value: "pedido_criado", label: "Pedido criado" },
          { value: "pagamento_confirmado", label: "Pagamento confirmado" },
          { value: "nf_emitida", label: "Nota fiscal emitida" },
          { value: "lead_novo", label: "Novo lead" },
        ] },
    ],
  },
];

export function getIntegrationDef(kind) {
  return INTEGRATIONS.find((i) => i.kind === kind);
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

export async function listIntegrations() {
  const owner_id = await getUserId();
  const { data } = await supabase
    .from("integrations")
    .select("kind, provider, enabled, updated_at")
    .eq("owner_id", owner_id);
  return data || [];
}

export async function getIntegration(kind) {
  const owner_id = await getUserId();
  const { data } = await supabase
    .from("integrations")
    .select("*")
    .eq("owner_id", owner_id)
    .eq("kind", kind)
    .maybeSingle();
  return data;
}

export async function saveIntegration(kind, { provider, enabled, config, secrets }) {
  const owner_id = await getUserId();
  return supabase.from("integrations").upsert(
    { owner_id, kind, provider, enabled, config, secrets, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,kind" }
  );
}

// Toda integração (menos a API personalizada) ganha o interruptor
// "a IA consulta estas informações" como primeiro campo.
INTEGRATIONS.filter((d) => d.kind !== "api_personalizada").forEach((d) =>
  d.fields.unshift({
    key: "ia_consulta",
    label: "A IA consulta estas informações durante o atendimento",
    type: "toggle",
    default: true,
    hint: "Desligado: a configuração fica salva, mas a IA não usa nem menciona nada disso na conversa.",
  })
);
