import { supabase } from "./supabaseClient.js?v=31";

// =====================================================================
// Agente simulador: um agente normal (número de WhatsApp, IA, Kanban...)
// que finge estar integrado com tudo — pagamento, frete, estoque e nota
// fiscal — pra demonstrar o atendimento do "oi" até o "obrigado".
// =====================================================================

export const SIM_BUSINESS_TYPES = [
  { value: "materiais_construcao", label: "Materiais de construção e acabamentos (pisos)", available: true },
  { value: "roupas", label: "Loja de roupas", available: false },
  { value: "restaurante", label: "Restaurante", available: false },
  { value: "clinica", label: "Clínica / consultório", available: false },
];

const STORE_NAME = "Lumos Pisos & Acabamentos";

export const SIM_PROMPTS = {
  materiais_construcao: `Você é a Luma, vendedora da ${STORE_NAME}, loja especializada em pisos, porcelanatos, revestimentos e materiais de assentamento. Você atende pelo WhatsApp como uma vendedora experiente de balcão: simpática, objetiva e consultiva. Mensagens curtas, uma pergunta por vez.

Como conduzir o atendimento, do "oi" até o fechamento:
1. Cumprimente, apresente-se e pergunte como pode ajudar.
2. Entenda a necessidade: qual ambiente (sala, cozinha, banheiro, área externa), tamanho em m² (ou as medidas do cômodo pra você calcular), estilo desejado e se é piso ou parede.
3. Recomende 1 a 3 opções do catálogo que combinem com o ambiente, explicando o porquê (ex.: área externa pede antiderrapante; banheiro, algo fácil de limpar). Ofereça mandar foto.
4. Calcule a metragem: área + margem de perda. Pisos são vendidos em caixas fechadas; o sistema arredonda para caixas inteiras no orçamento.
5. Ofereça os complementos que fazem a obra dar certo: argamassa AC-III (porcelanatos grandes), rejunte e kit nivelador. Estimativas práticas: 1 saco de argamassa de 20 kg a cada 4 m² de porcelanato; 1 kg de rejunte a cada 6 m²; 1 kit nivelador a cada 10 m². Rodapé: perímetro do cômodo dividido por 2,4 m (barras).
6. Pergunte se é entrega ou retirada na loja. Se for entrega, peça o bairro ou o CEP.
7. Recapitule o pedido (itens e quantidades) e peça a confirmação do cliente para fechar.
8. Depois do pagamento o sistema confirma sozinho; se o cliente voltar a falar, agradeça pela preferência e ajude no que precisar.

Se o cliente pedir algo que a loja não vende (roupas, comida, eletrônicos...), explique com simpatia que a ${STORE_NAME} trabalha com pisos e acabamentos e puxe a conversa de volta para o catálogo.
Nunca invente produto, preço, prazo ou estoque além do que está nas informações abaixo.`,
};

const IMG = (file) => new URL(`img/simulador/${file}.jpg`, window.location.href).href;

// Produtos de demonstração (nicho: pisos e acabamentos)
export const SIM_PRODUCTS = {
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

  const { data: existing } = await supabase.from("products").select("id, name, agent_ids").eq("owner_id", owner_id);
  const { data: cats } = await supabase.from("categories").select("id, name").eq("owner_id", owner_id);
  const catId = {};
  for (const c of cats || []) catId[c.name] = c.id;

  let created = 0;
  for (const it of items) {
    const already = (existing || []).find((p) => p.name === it.name && (p.agent_ids || []).includes(agentId));
    if (already) continue;

    if (!catId[it.categoria]) {
      const { data: c } = await supabase.from("categories").insert({ owner_id, name: it.categoria }).select().single();
      if (c) catId[it.categoria] = c.id;
    }
    const { data: prod, error } = await supabase.from("products").insert({
      owner_id, name: it.name, description: it.description, price: it.price, unit: it.unit,
      m2_por_caixa: it.m2_por_caixa ?? null, estoque: it.estoque ?? null,
      photo_urls: [IMG(it.img)], active: true, agent_ids: [agentId],
    }).select().single();
    if (error) throw error;
    if (catId[it.categoria]) await supabase.from("product_categories").insert({ product_id: prod.id, category_id: catId[it.categoria] });
    created++;
  }
  return created;
}

// Cria o simulador copiando o WhatsApp e as chaves de IA de um agente que já funciona.
// Como o número é o mesmo, o agente de origem é desativado (dá pra alternar depois).
export async function createSimulator(baseAgentId, businessType = "materiais_construcao") {
  const owner_id = await userId();
  const { data: base } = await supabase.from("agents").select("*").eq("id", baseAgentId).single();

  const { data: sim, error } = await supabase.from("agents").insert({
    owner_id,
    name: "Simulador — Pisos e Acabamentos",
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
  await seedSimulatorProducts(sim.id, businessType);
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
