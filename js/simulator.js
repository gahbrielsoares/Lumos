import { supabase } from "./supabaseClient.js?v=36";

// =====================================================================
// Agente simulador: um agente normal (número de WhatsApp, IA, Kanban...)
// que finge estar integrado com tudo — pagamento, frete, estoque e nota
// fiscal — pra demonstrar o atendimento do "oi" até o "obrigado".
// =====================================================================

export const SIM_BUSINESS_TYPES = [
  { value: "materiais_construcao", label: "Materiais de construção e acabamentos (pisos)", available: true },
  { value: "roupas", label: "Loja de roupas", available: false },
  { value: "restaurante", label: "Restaurante e bar (mesa, delivery, retirada e reservas)", available: true },
  { value: "clinica", label: "Clínica / consultório", available: false },
];

const STORE_NAME = "Lumos Pisos & Acabamentos";
const BAR_NAME = "Lumos Bar & Cozinha";

export const SIM_PROMPTS = {
  restaurante: `Você é a Luma, do ${BAR_NAME} — bar e restaurante com cozinha de boteco caprichada, drinks autorais, chope gelado e música ao vivo no fim de semana. Você atende pelo WhatsApp com o jeito de quem trabalha no salão: animada, acolhedora, rápida e sem enrolação. Mensagens curtas, uma pergunta por vez, emojis com moderação.

Como atender:
1. Na primeira mensagem, cumprimente e pergunte como pode ajudar, citando só o que a casa oferece (pedido na mesa, delivery, retirada ou reserva).
2. Na MESA: descubra o número da mesa, anote os pedidos e confirme cada rodada. Sugira acompanhamentos e bebidas de forma natural (ex.: "vai uma porção de batata pra acompanhar o chope?"). Quando pedirem a conta, feche a conta.
3. No DELIVERY ou RETIRADA: ajude a escolher, anote itens e observações (sem cebola, ponto da carne, gelo e limão...), sugira bebida e sobremesa, colete os dados de entrega e a forma de pagamento, recapitule e feche.
4. Na RESERVA: pegue data, horário, número de pessoas, nome e se é alguma comemoração (aniversário ganha sobremesa cortesia). Avise a tolerância de atraso.
5. Informe horários, promoções e eventos quando fizer sentido — sem forçar.
6. Tempo de preparo e de entrega vêm das informações da casa: use os valores de lá.

Se pedirem algo que não está no cardápio, diga com simpatia que não tem hoje e sugira a opção mais parecida.
Nunca invente item, preço, horário ou promoção além do que está nas informações abaixo.`,
  materiais_construcao: `Você é a Luma, vendedora da ${STORE_NAME}, loja especializada em pisos, porcelanatos, revestimentos e materiais de assentamento. Você atende pelo WhatsApp como uma vendedora experiente de balcão: simpática, objetiva e consultiva. Mensagens curtas, uma pergunta por vez, linguagem natural (nada de parecer formulário).

Como conduzir o atendimento, do "oi" até o fechamento:
1. Na primeira mensagem, cumprimente e se apresente. Depois disso, não repita "Oi" nem a apresentação.
2. Entenda a necessidade: qual ambiente (sala, cozinha, banheiro, área externa), se é piso, parede ou os dois, as medidas e o estilo desejado. Se ainda não souber o nome do cliente, pergunte em algum momento de forma natural.
3. Recomende 1 a 3 opções do catálogo que combinem com o ambiente e explique o porquê (área externa pede antiderrapante; banheiro pede algo fácil de limpar e não escorregadio no piso). Ofereça mandar foto.
4. Calcule a metragem: área + margem de perda. Para paredes, se o cliente disser "pé-direito padrão", use 2,60 m e desconte cerca de 1,6 m² por porta. Informe a metragem em m² — NÃO informe número de caixas nem valores totais (o resumo oficial calcula as caixas fechadas e os valores).
5. Ofereça os complementos que fazem a obra dar certo: argamassa AC-III (porcelanatos grandes), rejunte e kit nivelador. Estimativas práticas: 1 saco de argamassa de 20 kg a cada 4 m² de porcelanato; 1 kg de rejunte a cada 6 m²; 1 kit nivelador a cada 10 m². Rodapé: perímetro do cômodo dividido por 2,4 m (barras).
6. Pergunte se é entrega ou retirada na loja. Se for entrega, peça o CEP (o sistema descobre rua, bairro e frete) e depois confirme o número, o complemento, se é casa, apartamento ou condomínio, um ponto de referência, quem vai receber e o melhor período (manhã ou tarde). Peça também o nome completo e, para a nota fiscal, CPF ou CNPJ e e-mail (se for CNPJ, peça também a razão social e a inscrição estadual). Faça isso aos poucos, 2 ou 3 dados por mensagem, sem parecer formulário. O frete aparece nas informações da loja — use exatamente o valor informado lá.
7. Recapitule o pedido em poucas linhas (itens e metragens) e pergunte se pode fechar. Quando o cliente confirmar, feche na mesma mensagem.
8. Depois do pagamento o sistema confirma sozinho; se o cliente voltar a falar, agradeça pela preferência e ajude no que precisar.

Se o cliente pedir algo que a loja não vende (roupas, comida, eletrônicos...), explique com simpatia que a ${STORE_NAME} trabalha com pisos e acabamentos e puxe a conversa de volta para o catálogo.
Nunca invente produto, preço, prazo ou estoque além do que está nas informações abaixo.`,
};

const IMG = (file) => new URL(`img/simulador/${file}.jpg`, window.location.href).href;

const IMG_R = (file) => new URL(`img/simulador/restaurante/${file}.jpg`, window.location.href).href;

// Produtos de demonstração por nicho
export const SIM_PRODUCTS = {
  restaurante: [
    { name: "Batata Frita com Cheddar e Bacon", categoria: "Petiscos", price: 42.9, img: "batata-cheddar-bacon", description: "Porção generosa (serve 2 a 3 pessoas) com cheddar cremoso e bacon crocante." },
    { name: "Isca de Peixe", categoria: "Petiscos", price: 58.9, img: "isca-de-peixe", description: "Tilápia empanada, crocante, com molho tártaro e limão. Serve 2 a 3 pessoas." },
    { name: "Bolinho de Costela (6 un.)", categoria: "Petiscos", price: 39.9, img: "bolinho-de-costela", description: "Costela desfiada com catupiry, acompanha maionese da casa." },
    { name: "Tábua de Frios", categoria: "Petiscos", price: 69.9, img: "tabua-de-frios", description: "Queijos, salame, presunto parma, azeitonas e torradinhas. Serve 3 a 4 pessoas." },
    { name: "Picanha na Chapa", categoria: "Pratos", price: 119.9, img: "picanha-na-chapa", description: "500 g de picanha fatiada na chapa com arroz, farofa, vinagrete e fritas. Serve 2 pessoas." },
    { name: "Filé à Parmegiana", categoria: "Pratos", price: 64.9, img: "parmegiana", description: "Filé empanado com molho de tomate e muçarela gratinada, arroz e fritas. Individual." },
    { name: "Risoto de Cogumelos", categoria: "Pratos", price: 58.9, img: "risoto-de-cogumelos", description: "Arroz arbóreo, mix de cogumelos e parmesão. Opção vegetariana." },
    { name: "Burger Lumos", categoria: "Lanches", price: 39.9, img: "burger-lumos", description: "Blend de 180 g, cheddar, bacon, cebola caramelizada e maionese da casa, com fritas." },
    { name: "Pizza Margherita (8 fatias)", categoria: "Lanches", price: 62.9, img: "pizza-margherita", description: "Molho de tomate, muçarela de búfala e manjericão fresco." },
    { name: "Salada Caesar", categoria: "Pratos", price: 36.9, img: "salada-caesar", description: "Alface americana, frango grelhado, croutons, parmesão e molho caesar." },
    { name: "Chope Pilsen 500 ml", categoria: "Cervejas e chope", price: 14.9, img: "chope-pilsen", description: "Chope artesanal estilo pilsen, bem gelado. Happy hour: em dobro." },
    { name: "Balde de Long Neck (6 un.)", categoria: "Cervejas e chope", price: 59.9, img: "balde-long-neck", description: "6 long necks geladas no balde com gelo." },
    { name: "Caipirinha de Limão", categoria: "Drinks", price: 24.9, img: "caipirinha", description: "Cachaça artesanal, limão e açúcar. Também com vodka (+R$ 4)." },
    { name: "Gin Tônica", categoria: "Drinks", price: 32.9, img: "gin-tonica", description: "Gin, água tônica, pepino e zimbro." },
    { name: "Drink da Casa — Luz Vermelha", categoria: "Drinks", price: 34.9, img: "drink-da-casa", description: "Vodka, morango, limão siciliano e espuma de gengibre. O mais pedido da casa." },
    { name: "Refrigerante Lata", categoria: "Sem álcool", price: 7.9, img: "refrigerante", description: "Coca-Cola, Coca Zero, Guaraná ou Sprite." },
    { name: "Água Mineral 500 ml", categoria: "Sem álcool", price: 5.9, img: "agua-mineral", description: "Com ou sem gás." },
    { name: "Suco Natural 400 ml", categoria: "Sem álcool", price: 12.9, img: "suco-natural", description: "Laranja, limão, maracujá ou abacaxi com hortelã." },
    { name: "Petit Gâteau", categoria: "Sobremesas", price: 29.9, img: "petit-gateau", description: "Bolinho de chocolate com recheio cremoso e sorvete de creme." },
    { name: "Pudim da Casa", categoria: "Sobremesas", price: 16.9, img: "pudim", description: "Pudim de leite condensado, receita da vó." },
  ],
  materiais_construcao: [
    { name: "Porcelanato Calacata Branco Polido 90x90", categoria: "Pisos e porcelanatos", price: 139.9, unit: "m2", m2_por_caixa: 1.62, estoque: 380, img: "porcelanato-calacata",
      description: "Porcelanato retificado, efeito mármore branco com veios cinza. Brilho polido, ideal para salas e ambientes internos sofisticados. PEI 4." },
    { name: "Porcelanato Cimento Queimado Acetinado 60x120", categoria: "Pisos e porcelanatos", price: 119.9, unit: "m2", m2_por_caixa: 1.44, estoque: 520, img: "porcelanato-cimento-queimado",
      description: "Visual de cimento queimado com acabamento acetinado (não escorrega fácil e não marca). Salas, cozinhas e áreas integradas." },
    { name: "Porcelanato Madeira Carvalho Natural 20x120", categoria: "Pisos e porcelanatos", price: 99.9, unit: "m2", m2_por_caixa: 1.44, estoque: 610, img: "porcelanato-madeira-carvalho",
      description: "Réguas com aparência de madeira de carvalho, sem a manutenção da madeira. Quartos, salas e varandas cobertas." },
    { name: "Porcelanato Travertino Bege 60x60", categoria: "Pisos e porcelanatos", price: 84.9, unit: "m2", m2_por_caixa: 1.44, estoque: 300, img: "porcelanato-travertino",
      description: "Efeito pedra travertino em tons de bege, acabamento natural. Clássico e fácil de combinar." },
    { name: "Porcelanato Externo Antiderrapante Pedra Cinza 60x60", categoria: "Pisos e porcelanatos", price: 79.9, unit: "m2", m2_por_caixa: 1.44, estoque: 450, img: "porcelanato-externo-pedra",
      description: "Superfície antiderrapante para áreas externas, garagens, quintais e bordas de piscina. Alta resistência." },
    { name: "Piso Cerâmico Ardósia Grafite 60x60", categoria: "Pisos e porcelanatos", price: 42.9, unit: "m2", m2_por_caixa: 2.16, estoque: 900, img: "ceramico-ardosia-grafite",
      description: "Cerâmica com aparência de ardósia grafite. Ótimo custo-benefício para áreas de serviço e externas cobertas." },
    { name: "Piso Cerâmico Bege Acetinado 45x45", categoria: "Pisos e porcelanatos", price: 29.9, unit: "m2", m2_por_caixa: 2.43, estoque: 1200, img: "ceramico-bege",
      description: "Piso cerâmico econômico em bege claro, acabamento acetinado. Indicado para reformas com orçamento enxuto." },
    { name: "Piso Vinílico Click Carvalho Rústico", categoria: "Pisos e porcelanatos", price: 119.0, unit: "m2", m2_por_caixa: 2.23, estoque: 260, img: "vinilico-carvalho-rustico",
      description: "Piso vinílico de encaixe (click), instalação rápida sem quebra-quebra, pode ir sobre o piso antigo. Confortável e silencioso." },
    { name: "Revestimento Subway Branco Brilhante 7,5x15", categoria: "Revestimentos de parede", price: 69.9, unit: "m2", m2_por_caixa: 1.0, estoque: 180, img: "subway-branco",
      description: "Revestimento estilo metrô para paredes de cozinha, lavanderia e banheiro. Brilhante e fácil de limpar." },
    { name: "Argamassa AC-III Cinza 20 kg", categoria: "Argamassas e rejuntes", price: 38.9, unit: "saco", estoque: 700, img: "argamassa-ac3",
      description: "Argamassa colante de alta aderência, indicada para porcelanatos e peças grandes, áreas internas e externas. Rende cerca de 4 m² por saco (dupla colagem)." },
    { name: "Rejunte Flexível Cinza Platina 1 kg", categoria: "Argamassas e rejuntes", price: 16.9, unit: "unidade", estoque: 800, img: "rejunte-cinza-platina",
      description: "Rejunte flexível antimofo, para juntas de 1 a 3 mm. Rende cerca de 6 m² por kg." },
    { name: "Kit Nivelador de Piso 100 clipes + 50 cunhas", categoria: "Acessórios", price: 39.9, unit: "unidade", estoque: 350, img: "kit-nivelador",
      description: "Sistema de nivelamento que evita desníveis entre as peças. Um kit atende cerca de 10 m²." },
    { name: "Rodapé Poliestireno Branco 10 cm (barra 2,4 m)", categoria: "Acessórios", price: 34.9, unit: "unidade", estoque: 500, img: "rodape-poliestireno",
      description: "Rodapé branco que não empena nem absorve água. Barra de 2,40 m." },
  ],
};

async function userId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

// Cadastra (ou completa) os produtos de demonstração, vinculados só ao simulador
export async function seedSimulatorProducts(agentId, businessType = "materiais_construcao") {
  const owner_id = await userId();
  const items = SIM_PRODUCTS[businessType] || [];

  const { data: existing } = await supabase.from("products").select("id, name, agent_ids, segmento").eq("owner_id", owner_id);
  const { data: cats } = await supabase.from("categories").select("id, name").eq("owner_id", owner_id);
  const catId = {};
  for (const c of cats || []) catId[c.name] = c.id;

  let created = 0;
  for (const it of items) {
    const already = (existing || []).find((p) => p.name === it.name && (p.agent_ids || []).includes(agentId) && (p.segmento || "materiais_construcao") === businessType);
    if (already) continue;

    if (!catId[it.categoria]) {
      const { data: c } = await supabase.from("categories").insert({ owner_id, name: it.categoria }).select().single();
      if (c) catId[it.categoria] = c.id;
    }
    const { data: prod, error } = await supabase.from("products").insert({
      owner_id, name: it.name, description: it.description, price: it.price, unit: it.unit || "unidade",
      m2_por_caixa: it.m2_por_caixa ?? null, estoque: it.estoque ?? null,
      photo_urls: [businessType === "restaurante" ? IMG_R(it.img) : IMG(it.img)], active: true, agent_ids: [agentId],
      segmento: businessType,
    }).select().single();
    if (error) throw error;
    if (catId[it.categoria]) await supabase.from("product_categories").insert({ product_id: prod.id, category_id: catId[it.categoria] });
    created++;
  }
  return created;
}

// Mesas de demonstração (Mesa 1 a 12) pro fluxo de pedido na mesa
export async function seedSimulatorTables(agentId, total = 12) {
  const owner_id = await userId();
  const { data: tables } = await supabase.from("restaurant_tables").select("label").eq("owner_id", owner_id);
  const have = new Set((tables || []).map((t) => String(t.label).replace(/\D/g, "")));
  const rows = [];
  for (let n = 1; n <= total; n++) if (!have.has(String(n))) rows.push({ owner_id, agent_id: agentId, label: `Mesa ${n}`, status: "livre" });
  if (rows.length) await supabase.from("restaurant_tables").insert(rows);
  return rows.length;
}

// Garante tudo o que o nicho precisa (produtos e, no restaurante, as mesas)
export async function prepareSimulator(agentId, businessType) {
  const products = await seedSimulatorProducts(agentId, businessType);
  const tables = businessType === "restaurante" ? await seedSimulatorTables(agentId) : 0;
  return { products, tables };
}

// Cria o simulador copiando o WhatsApp e as chaves de IA de um agente que já funciona.
// Como o número é o mesmo, o agente de origem é desativado (dá pra alternar depois).
export async function createSimulator(baseAgentId, businessType = "materiais_construcao") {
  const owner_id = await userId();
  const { data: base } = await supabase.from("agents").select("*").eq("id", baseAgentId).single();

  const { data: sim, error } = await supabase.from("agents").insert({
    owner_id,
    name: businessType === "restaurante" ? "Simulador — Bar e Restaurante" : "Simulador — Pisos e Acabamentos",
    phone_number: base.phone_number,
    system_prompt: SIM_PROMPTS[businessType],
    temperature: 0.6,
    max_tokens: 1024,
    history_limit: 16,
    enabled: true,
    allowed_phones: base.allowed_phones || "",
    active_ai_slot: "gratis",
    pause_on_human: true,
    is_simulator: true,
    sim_business_type: businessType,
  }).select().single();
  if (error) throw error;

  const { data: wa } = await supabase.from("whatsapp_provider_config").select("*").eq("agent_id", baseAgentId).maybeSingle();
  if (wa) {
    const { agent_id: _a, ...waFields } = wa;
    await supabase.from("whatsapp_provider_config").insert({ ...waFields, agent_id: sim.id });
  }

  const { data: ais } = await supabase.from("ai_providers").select("*").eq("agent_id", baseAgentId);
  for (const ai of ais || []) {
    const { agent_id: _a, ...aiFields } = ai;
    await supabase.from("ai_providers").insert({ ...aiFields, agent_id: sim.id });
  }
  // Simulador usa a IA grátis (Groq) se ela estiver configurada no agente de origem
  if (!(ais || []).some((a) => a.slot === "gratis")) {
    await supabase.from("agents").update({ active_ai_slot: "paga" }).eq("id", sim.id);
  }

  await supabase.from("agents").update({ enabled: false }).eq("id", baseAgentId);
  await prepareSimulator(sim.id, businessType);
  return sim;
}

// Liga um agente e desliga os outros que usam o mesmo número
export async function activateAgentForNumber(agentId) {
  const { data: agent } = await supabase.from("agents").select("id, phone_number").eq("id", agentId).single();
  const digits = String(agent.phone_number || "").replace(/\D/g, "");
  const { data: all } = await supabase.from("agents").select("id, phone_number");
  for (const a of all || []) {
    if (a.id !== agentId && String(a.phone_number || "").replace(/\D/g, "") === digits) {
      await supabase.from("agents").update({ enabled: false }).eq("id", a.id);
    }
  }
  await supabase.from("agents").update({ enabled: true }).eq("id", agentId);
}
