// =====================================================================
// Ajuda das páginas de conexão: o que a loja precisa passar para a Lumos
// Botão flutuante no canto da tela. A lista pode ser copiada ou enviada no WhatsApp.
// =====================================================================

export const AJUDA = {
  nota_fiscal: {
    titulo: "Nota fiscal (NFC-e)",
    intro: "Para conectar e começar a emitir as notas fiscais corretamente, a Lumos liga o sistema ao emissor de notas que a loja já usa. Precisamos das seguintes informações:",
    grupos: [
      { nome: "Emissor de notas", itens: [
        ["Qual emissor a loja usa", "Hoje conectamos o Focus NFe. Se a loja usa outro, a Lumos avalia a integração."],
        ["Token de acesso do emissor", "No painel do Focus NFe: empresa > tokens. Precisamos do de homologação (teste) e do de produção."],
      ] },
      { nome: "Já cadastrado no painel do emissor (a loja ou o contador faz uma vez)", itens: [
        ["Certificado digital A1", "Arquivo .pfx ou .p12 do CNPJ da loja, dentro da validade, e a senha dele."],
        ["CSC da Sefaz (ID e código)", "Gerado no portal da Sefaz do estado. Em SP: portal da NFC-e. Um para homologação e um para produção."],
        ["Credenciamento para NFC-e", "A loja precisa estar habilitada a emitir NFC-e na Sefaz (o contador confirma)."],
      ] },
      { nome: "Dados da empresa", itens: [
        ["CNPJ, razão social e nome fantasia", ""],
        ["Inscrição estadual", "Em SP são 12 números."],
        ["Regime tributário", "Simples Nacional, MEI, Lucro Presumido ou Lucro Real."],
        ["Endereço completo com CEP", ""],
      ] },
    ],
    depois: "Com isso, a Lumos conecta, emite uma nota de teste em homologação e só depois passa para produção.",
  },
  pagamento: {
    titulo: "Pagamento",
    intro: "Para o cliente pagar pelo link ou por Pix e a venda ser confirmada sozinha, precisamos de:",
    grupos: [
      { nome: "Forma de receber", itens: [
        ["Quais formas a loja aceita", "Pix, cartão de crédito (até quantas parcelas e quantas sem juros), débito, dinheiro."],
        ["Pix manual: chave Pix e nome do favorecido", "Para mostrar ao cliente na hora de pagar."],
      ] },
      { nome: "Link de pagamento (opcional)", itens: [
        ["Provedor", "Mercado Pago, Asaas ou Pagar.me, com conta aberta no CNPJ da loja."],
        ["Chave de API (token) da conta", "Gerada no painel do provedor. A Lumos usa para criar o link com o valor exato e confirmar o pagamento."],
      ] },
    ],
    depois: "Enquanto o link não estiver ativo, dá para usar Pix manual ou pagamento na hora (mesa, retirada ou entrega).",
  },
  frete: {
    titulo: "Frete e entrega",
    intro: "Para a IA informar o valor da entrega e o prazo certo, precisamos de:",
    grupos: [{ nome: "Regras de entrega", itens: [
      ["Bairros ou CEPs atendidos e o valor de cada um", "Ou uma regra por distância (até 3 km, até 5 km...)."],
      ["Pedido mínimo e frete grátis", "Se houver."],
      ["Prazo de entrega", "Ex.: 40 a 60 minutos; ou entrega no dia seguinte."],
      ["Se a loja oferece retirada no local", "E o endereço de retirada."],
    ] }],
  },
  estoque: {
    titulo: "Estoque e sistema atual (ERP)",
    intro: "Para trazer produtos, preços e estoque do sistema que a loja já usa, precisamos de:",
    grupos: [{ nome: "Sistema atual", itens: [
      ["Nome do sistema (ERP) que a loja usa", "Ex.: Bling, Tiny, Omie, outro."],
      ["Se tem API: endereço e token de acesso", "O fornecedor do sistema informa."],
      ["Se não tem API: planilha de produtos", "Colunas: nome, código, preço de venda, custo, estoque atual, unidade."],
    ] }],
  },
  vendas: {
    titulo: "Regras de venda",
    intro: "Para a IA fechar pedidos do jeito da loja, precisamos de:",
    grupos: [{ nome: "Regras", itens: [
      ["Telefone do responsável", "Recebe os avisos de pedido e aprova os orçamentos."],
      ["Se o pedido precisa de aprovação humana", "Ou se a IA pode fechar sozinha."],
      ["Descontos permitidos", "Até quanto a IA pode oferecer."],
      ["Mensagem depois do pagamento", "Agradecimento e orientações."],
    ] }],
  },
  restaurante: {
    titulo: "Restaurante",
    intro: "Para configurar o salão, o cardápio digital e a conta, precisamos de:",
    grupos: [{ nome: "Salão e conta", itens: [
      ["Quantidade de mesas e como são chamadas", "Ex.: Mesa 1 a 20, Varanda 1 a 5. Cada uma ganha um QR Code."],
      ["Taxa de serviço (%) e couvert", "Se cobra, quanto, e em quais dias."],
      ["Quando o cliente pede a conta", "Enviar link de pagamento ou o garçom leva a conta na mesa."],
      ["Modalidades", "Só salão, ou também delivery e retirada."],
      ["Horário de funcionamento da cozinha", ""],
    ] }],
  },
  api_personalizada: {
    titulo: "API personalizada",
    intro: "Para conectar um sistema próprio da loja, precisamos de:",
    grupos: [{ nome: "Dados técnicos (o responsável pelo sistema informa)", itens: [
      ["Endereço (URL) da API e o método", ""],
      ["Token ou chave de acesso", ""],
      ["Um exemplo de resposta", "Para a IA saber ler as informações."],
    ] }],
  },
  agents: {
    titulo: "WhatsApp e atendimento por IA",
    intro: "Para o atendimento por IA começar a funcionar no WhatsApp da loja, precisamos de:",
    grupos: [
      { nome: "WhatsApp", itens: [
        ["Um número exclusivo para o atendimento", "Chip ativo, de preferência com WhatsApp Business. Não pode ser usado em outro sistema ao mesmo tempo."],
        ["O celular desse número em mãos no dia da conexão", "Para ler o QR Code (leva 1 minuto)."],
      ] },
      { nome: "Informações para a IA", itens: [
        ["Nome da loja, endereço e horários", ""],
        ["Cardápio ou catálogo com preços", "Fotos ajudam muito na venda."],
        ["Jeito de atender", "Mais formal ou mais descontraído, o que nunca dizer, promoções da casa."],
      ] },
    ],
    depois: "A inteligência artificial já vem incluída no Lumos. Não é preciso contratar nada à parte.",
  },
  contabilidade: {
    titulo: "Contabilidade",
    intro: "Para os impostos saírem calculados certo e o relatório do contador ficar completo, precisamos de:",
    grupos: [{ nome: "Dados fiscais", itens: [
      ["CNPJ, inscrição estadual e CNAE principal", ""],
      ["Regime tributário", "Simples Nacional, MEI, Lucro Presumido ou Lucro Real."],
      ["Receita dos últimos 12 meses (RBT12)", "Está no último PGDAS (o contador envia)."],
      ["Contato do contador", "Nome, CRC e e-mail, para receber o fechamento do mês e ter acesso próprio."],
      ["Como tratar taxa de serviço e couvert", "O contador confirma se entram na receita."],
    ] }],
  },
};
AJUDA.integracoes = {
  titulo: "Integrações",
  intro: "Cada integração tem a sua lista. Resumo do que pedir para a loja:",
  grupos: ["nota_fiscal", "pagamento", "frete", "estoque", "restaurante"].map((k) => ({ nome: AJUDA[k].titulo, itens: AJUDA[k].grupos.flatMap((g) => g.itens) })),
  depois: "Abra cada integração para ver a lista completa dela.",
};

function textoLista(a) {
  const linhas = [`*${a.titulo}*`, a.intro, ""];
  let n = 1;
  for (const g of a.grupos) {
    linhas.push(`_${g.nome}_`);
    for (const [item, det] of g.itens) linhas.push(`${n++}. ${item}${det ? ` (${det})` : ""}`);
    linhas.push("");
  }
  if (a.depois) linhas.push(a.depois);
  return linhas.join("\n").trim();
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function abrirAjuda(chave) {
  const a = AJUDA[chave];
  if (!a) return;
  const fundo = document.createElement("div");
  fundo.className = "lumos-help-overlay";
  let n = 1;
  fundo.innerHTML = `<div class="lumos-help-box" role="dialog" aria-modal="true">
    <div class="lumos-help-head"><h3>Ajuda: ${esc(a.titulo)}</h3><button class="lumos-help-x" aria-label="Fechar">✕</button></div>
    <p class="lumos-help-intro">${esc(a.intro)}</p>
    ${a.grupos.map((g) => `<div class="lumos-help-grupo"><b>${esc(g.nome)}</b><ol start="${n}">${g.itens.map(([i, d]) => { n++; return `<li><span>${esc(i)}</span>${d ? `<small>${esc(d)}</small>` : ""}</li>`; }).join("")}</ol></div>`).join("")}
    ${a.depois ? `<p class="lumos-help-depois">${esc(a.depois)}</p>` : ""}
    <div class="lumos-help-acoes">
      <button class="btn btn-ghost" data-a="copiar">Copiar lista</button>
      <a class="btn btn-ghost" data-a="whats" target="_blank" rel="noopener">Enviar no WhatsApp</a>
      <button class="btn btn-primary" data-a="ok">Entendi</button>
    </div>
  </div>`;
  const fechar = () => fundo.remove();
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  fundo.querySelector(".lumos-help-x").addEventListener("click", fechar);
  fundo.querySelector('[data-a="ok"]').addEventListener("click", fechar);
  const texto = textoLista(a);
  fundo.querySelector('[data-a="whats"]').href = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  fundo.querySelector('[data-a="copiar"]').addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(texto); e.target.textContent = "Copiado!"; }
    catch (_) { e.target.textContent = "Não foi possível copiar"; }
    setTimeout(() => (e.target.textContent = "Copiar lista"), 1800);
  });
  document.addEventListener("keydown", function esc(ev) { if (ev.key === "Escape") { fechar(); document.removeEventListener("keydown", esc); } });
  document.body.appendChild(fundo);
}

// Barra flutuante do canto (Ajuda e, para administração, Simular)
export function barraFerramentas() {
  let barra = document.getElementById("lumos-tools");
  if (!barra) {
    barra = document.createElement("div");
    barra.id = "lumos-tools";
    barra.className = "lumos-tools";
    document.body.appendChild(barra);
  }
  return barra;
}

export function botaoAjuda(chave) {
  if (!AJUDA[chave]) return;
  const barra = barraFerramentas();
  barra.querySelector('[data-tool="ajuda"]')?.remove();
  const b = document.createElement("button");
  b.className = "lumos-tool-btn";
  b.dataset.tool = "ajuda";
  b.innerHTML = `<span aria-hidden="true">?</span> Ajuda`;
  b.title = "O que a loja precisa passar para a Lumos";
  b.addEventListener("click", () => abrirAjuda(chave));
  barra.appendChild(b);
}
