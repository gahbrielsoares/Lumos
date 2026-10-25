-- =====================================================================
-- Lumos: dados de um restaurante funcionando no dia a dia
-- Insumos com custo e estoque, fichas técnicas de todo o cardápio, bebidas de revenda com estoque.
-- Pode rodar mais de uma vez: não duplica nada, só completa o que falta.
--
-- COMO USAR: troque o e-mail na linha marcada abaixo e rode no SQL Editor do Supabase.
--   Sua conta:                soaresgahbriel@gmail.com
--   Conta de demonstração:    lumos@equipe.lumos.app
-- Na conta que ainda não tem o cardápio (a de demonstração), ele também cria os pratos, as categorias e 10 mesas.
-- Antes, aplique as seções 44 e 49 do guia de instalação.
-- =====================================================================
do $$
declare
  v_email text := 'soaresgahbriel@gmail.com';   -- <<< TROQUE AQUI
  v_owner uuid;
  v_site text := 'https://www.lumos.tec.br';
  n_pratos int; n_ins int; n_fichas int; n_cat int;
begin
  select id into v_owner from auth.users where lower(email) = lower(v_email);
  if v_owner is null then raise exception 'Conta % não encontrada em Authentication > Users.', v_email; end if;

  -- 1) Cardápio: cria só os itens que ainda não existem nesta conta (com foto, descrição e categoria)
  create temp table _card(nome text, categoria text, preco numeric, img text, descricao text) on commit drop;
  insert into _card values
    ('Batata Frita com Cheddar e Bacon', 'Petiscos', 42.9, 'batata-cheddar-bacon', E'Batata frita crocante coberta com cheddar cremoso e bacon em cubos.\nServe: 2 a 3 pessoas (500 g)\nContém: lactose\nDá para pedir: sem bacon, cheddar à parte'),
    ('Isca de Peixe', 'Petiscos', 58.9, 'isca-de-peixe', E'Tiras de tilápia empanadas e fritas na hora, bem sequinhas.\nServe: 2 a 3 pessoas (400 g)\nAcompanha: molho tártaro e limão\nContém: peixe, glúten, ovo\nDá para pedir: molho à parte'),
    ('Bolinho de Costela (6 un.)', 'Petiscos', 39.9, 'bolinho-de-costela', E'Bolinhos de costela bovina desfiada com recheio de catupiry, crocantes por fora.\nServe: 2 pessoas (6 unidades)\nAcompanha: maionese da casa\nContém: glúten, lactose, ovo'),
    ('Tábua de Frios', 'Petiscos', 69.9, 'tabua-de-frios', E'Seleção de queijos, salame, presunto parma, azeitonas e torradinhas.\nServe: 3 a 4 pessoas\nContém: lactose, glúten (torradas)\nDá para pedir: sem azeitona'),
    ('Picanha na Chapa', 'Pratos', 119.9, 'picanha-na-chapa', E'500 g de picanha fatiada, servida na chapa quente.\nServe: 2 pessoas\nAcompanha: arroz, farofa, vinagrete e fritas\nContém: glúten (farofa)\nDá para pedir: o ponto da carne (mal, ao ponto ou bem passada), sem farofa'),
    ('Filé à Parmegiana', 'Pratos', 64.9, 'parmegiana', E'Filé bovino empanado, coberto com molho de tomate da casa e muçarela gratinada.\nServe: 1 pessoa\nAcompanha: arroz e fritas\nContém: glúten, lactose, ovo\nDá para pedir: trocar fritas por salada'),
    ('Risoto de Cogumelos', 'Pratos', 58.9, 'risoto-de-cogumelos', E'Arroz arbóreo cremoso com mix de cogumelos (paris, shimeji e shiitake) e parmesão.\nServe: 1 pessoa\nVegetariano\nContém: lactose\nDá para pedir: sem parmesão'),
    ('Burger Lumos', 'Lanches', 39.9, 'burger-lumos', E'Blend bovino de 180 g, cheddar, bacon, cebola caramelizada e maionese da casa no pão brioche.\nServe: 1 pessoa\nAcompanha: fritas\nContém: glúten, lactose, ovo\nDá para pedir: o ponto da carne, sem cebola, sem bacon'),
    ('Pizza Margherita (8 fatias)', 'Lanches', 62.9, 'pizza-margherita', E'Molho de tomate, muçarela de búfala, tomate e manjericão fresco.\nServe: 2 a 3 pessoas (8 fatias)\nVegetariana\nContém: glúten, lactose'),
    ('Salada Caesar', 'Pratos', 36.9, 'salada-caesar', E'Alface americana, frango grelhado, croutons, lascas de parmesão e molho caesar.\nServe: 1 pessoa\nContém: glúten, lactose, ovo\nDá para pedir: sem frango (vegetariana), molho à parte'),
    ('Chope Pilsen 500 ml', 'Cervejas e chope', 14.9, 'chope-pilsen', E'Chope artesanal estilo pilsen, leve e bem gelado.\nTamanho: 500 ml\nTeor alcoólico: 4,8%\nHappy hour de ter a sex, 18h às 20h: em dobro\nContém: glúten'),
    ('Balde de Long Neck (6 un.)', 'Cervejas e chope', 59.9, 'balde-long-neck', E'6 cervejas long neck no balde com gelo.\nServe: para dividir\nMarcas: consulte as disponíveis no dia\nContém: glúten'),
    ('Caipirinha de Limão', 'Drinks', 24.9, 'caipirinha', E'Cachaça artesanal, limão taiti e açúcar.\nTamanho: 350 ml\nDá para pedir: com vodka (+R$ 4), com adoçante, pouco gelo'),
    ('Gin Tônica', 'Drinks', 32.9, 'gin-tonica', E'Gin, água tônica, pepino e zimbro, servido na taça com bastante gelo.\nTamanho: 500 ml\nDá para pedir: tônica zero, sem pepino'),
    ('Drink da Casa (Luz Vermelha)', 'Drinks', 34.9, 'drink-da-casa', E'Vodka, morango, limão siciliano e espuma de gengibre. O mais pedido da casa!\nTamanho: 350 ml\nDá para pedir: sem espuma, versão sem álcool (mocktail)'),
    ('Refrigerante Lata', 'Sem álcool', 7.9, 'refrigerante', E'Coca-Cola, Coca-Cola Zero, Guaraná ou Sprite.\nTamanho: 350 ml\nDá para pedir: com gelo e limão (informe o sabor na observação)'),
    ('Água Mineral 500 ml', 'Sem álcool', 5.9, 'agua-mineral', E'Água mineral com ou sem gás.\nTamanho: 500 ml\nDá para pedir: com gás ou sem gás, com gelo e limão'),
    ('Suco Natural 400 ml', 'Sem álcool', 12.9, 'suco-natural', E'Suco da fruta, feito na hora.\nSabores: laranja, limão, maracujá ou abacaxi com hortelã\nTamanho: 400 ml\nDá para pedir: sem açúcar, com adoçante, sem gelo (informe o sabor na observação)'),
    ('Petit Gâteau', 'Sobremesas', 29.9, 'petit-gateau', E'Bolinho de chocolate com recheio cremoso, servido quente com sorvete de creme.\nServe: 1 a 2 pessoas\nContém: glúten, lactose, ovo'),
    ('Pudim da Casa', 'Sobremesas', 16.9, 'pudim', E'Pudim de leite condensado, lisinho e com calda de caramelo. Receita da vó.\nServe: 1 pessoa\nContém: lactose, ovo');
  insert into public.categories(owner_id, name)
    select distinct v_owner, c.categoria from _card c
    where not exists (select 1 from public.categories k where k.owner_id = v_owner and lower(k.name) = lower(c.categoria));
  get diagnostics n_cat = row_count;
  insert into public.products(owner_id, name, description, price, unit, photo_urls, active, segmento)
    select v_owner, c.nome, c.descricao, c.preco, 'unidade', array[v_site || '/img/simulador/restaurante/' || c.img || '.jpg'], true, 'restaurante'
    from _card c where not exists (select 1 from public.products p where p.owner_id = v_owner and lower(p.name) = lower(c.nome));
  get diagnostics n_pratos = row_count;
  insert into public.product_categories(product_id, category_id)
    select p.id, k.id from _card c
    join public.products p on p.owner_id = v_owner and lower(p.name) = lower(c.nome)
    join public.categories k on k.owner_id = v_owner and lower(k.name) = lower(c.categoria)
    where not exists (select 1 from public.product_categories pc where pc.product_id = p.id)
    on conflict do nothing;

  -- 2) Insumos da cozinha e do bar, com custo, estoque inicial e mínimo
  create temp table _ins(nome text, unidade text, custo numeric, estoque numeric, minimo numeric) on commit drop;
  insert into _ins values
    ('Batata congelada palito', 'kg', 14.0, 12, 4),
    ('Cheddar cremoso', 'kg', 38.0, 3, 1),
    ('Bacon em cubos', 'kg', 46.0, 3, 1),
    ('Filé de tilápia', 'kg', 45.0, 5, 2),
    ('Farinha de trigo', 'kg', 5.2, 10, 3),
    ('Farinha panko', 'kg', 24.0, 3, 1),
    ('Costela bovina', 'kg', 39.0, 6, 2),
    ('Óleo de soja', 'litro', 8.5, 18, 6),
    ('Presunto parma', 'kg', 160.0, 1, 0.4),
    ('Queijo muçarela', 'kg', 44.0, 6, 2),
    ('Salame italiano', 'kg', 78.0, 1.5, 0.5),
    ('Azeitona verde', 'kg', 32.0, 1, 0.3),
    ('Torradinhas', 'kg', 30.0, 1, 0.3),
    ('Picanha', 'kg', 75.0, 8, 3),
    ('Arroz branco', 'kg', 6.5, 10, 3),
    ('Farofa pronta', 'kg', 16.0, 2, 0.5),
    ('Tomate', 'kg', 8.0, 5, 2),
    ('Cebola', 'kg', 5.5, 5, 2),
    ('Contrafilé', 'kg', 58.0, 5, 2),
    ('Ovos', 'duzia', 14.0, 4, 1),
    ('Molho de tomate da casa', 'kg', 14.0, 4, 1),
    ('Arroz arbóreo', 'kg', 32.0, 3, 1),
    ('Mix de cogumelos', 'kg', 48.0, 2, 0.5),
    ('Queijo parmesão', 'kg', 98.0, 1.5, 0.5),
    ('Creme de leite', 'kg', 22.0, 2, 0.5),
    ('Manteiga', 'kg', 48.0, 2, 0.5),
    ('Pão de hambúrguer brioche', 'unidade', 1.8, 40, 12),
    ('Blend bovino (carne moída)', 'kg', 42.0, 6, 2),
    ('Maionese da casa', 'kg', 20.0, 2, 0.5),
    ('Disco de massa de pizza', 'unidade', 4.5, 20, 6),
    ('Muçarela de búfala', 'kg', 72.0, 2, 0.5),
    ('Manjericão (maço)', 'unidade', 3.0, 6, 2),
    ('Alface americana', 'unidade', 4.5, 6, 2),
    ('Peito de frango', 'kg', 22.0, 5, 2),
    ('Croutons', 'kg', 28.0, 1, 0.3),
    ('Molho caesar', 'litro', 36.0, 1, 0.3),
    ('Chope pilsen (barril)', 'litro', 9.0, 50, 20),
    ('Cerveja long neck 355 ml', 'unidade', 4.5, 72, 24),
    ('Gelo', 'kg', 2.5, 20, 5),
    ('Cachaça', 'litro', 28.0, 3, 1),
    ('Limão tahiti', 'kg', 6.0, 4, 1),
    ('Açúcar', 'kg', 4.8, 5, 1),
    ('Gin', 'litro', 120.0, 2, 0.5),
    ('Água tônica (lata)', 'unidade', 3.8, 24, 12),
    ('Vodka', 'litro', 60.0, 2, 0.5),
    ('Xarope de frutas vermelhas', 'litro', 40.0, 1, 0.3),
    ('Laranja pera', 'kg', 4.5, 8, 2),
    ('Chocolate meio amargo', 'kg', 55.0, 2, 0.5),
    ('Sorvete de creme', 'litro', 28.0, 3, 1),
    ('Leite condensado (lata)', 'unidade', 7.5, 12, 4),
    ('Leite integral', 'litro', 5.2, 12, 4);
  insert into public.products(owner_id, name, unit, custo, estoque, estoque_minimo, is_insumo, active, price, segmento)
    select v_owner, i.nome, i.unidade, i.custo, i.estoque, i.minimo, true, true, null, 'restaurante' from _ins i
    where not exists (select 1 from public.products p where p.owner_id = v_owner and lower(p.name) = lower(i.nome));
  get diagnostics n_ins = row_count;
  -- Saldo inicial registrado no histórico do estoque (só para os insumos criados agora)
  insert into public.estoque_mov(owner_id, product_id, tipo, quantidade, saldo_apos, motivo, origem)
    select v_owner, p.id, 'ajuste', p.estoque, p.estoque, 'Saldo inicial', 'manual'
    from public.products p join _ins i on lower(i.nome) = lower(p.name)
    where p.owner_id = v_owner and p.is_insumo and not exists (select 1 from public.estoque_mov m where m.product_id = p.id);

  -- 3) Bebidas de revenda: estoque controlado e custo (baixam sozinhas a cada venda, sem ficha)
  create temp table _rev(nome text, custo numeric, estoque numeric, minimo numeric) on commit drop;
  insert into _rev values
    ('Refrigerante Lata', 3.2, 48, 12),
    ('Água Mineral 500 ml', 1.6, 48, 12);
  update public.products p set custo = coalesce(p.custo, r.custo), estoque = coalesce(p.estoque, r.estoque), estoque_minimo = coalesce(p.estoque_minimo, r.minimo)
    from _rev r where p.owner_id = v_owner and lower(p.name) = lower(r.nome) and not p.is_insumo;

  -- 4) Fichas técnicas: quanto de cada insumo vai em 1 porção (o custo do prato é recalculado pelo banco)
  create temp table _ficha(prato text, insumo text, qtd numeric, perda numeric) on commit drop;
  insert into _ficha values
    ('Batata Frita com Cheddar e Bacon', 'Batata congelada palito', 0.5, 0),
    ('Batata Frita com Cheddar e Bacon', 'Cheddar cremoso', 0.08, 0),
    ('Batata Frita com Cheddar e Bacon', 'Bacon em cubos', 0.06, 15),
    ('Batata Frita com Cheddar e Bacon', 'Óleo de soja', 0.1, 0),
    ('Isca de Peixe', 'Filé de tilápia', 0.3, 10),
    ('Isca de Peixe', 'Farinha de trigo', 0.04, 0),
    ('Isca de Peixe', 'Farinha panko', 0.05, 0),
    ('Isca de Peixe', 'Ovos', 0.08, 0),
    ('Isca de Peixe', 'Óleo de soja', 0.1, 0),
    ('Isca de Peixe', 'Limão tahiti', 0.05, 0),
    ('Isca de Peixe', 'Maionese da casa', 0.04, 0),
    ('Bolinho de Costela (6 un.)', 'Costela bovina', 0.16, 35),
    ('Bolinho de Costela (6 un.)', 'Queijo muçarela', 0.04, 0),
    ('Bolinho de Costela (6 un.)', 'Farinha de trigo', 0.05, 0),
    ('Bolinho de Costela (6 un.)', 'Farinha panko', 0.04, 0),
    ('Bolinho de Costela (6 un.)', 'Ovos', 0.08, 0),
    ('Bolinho de Costela (6 un.)', 'Óleo de soja', 0.08, 0),
    ('Bolinho de Costela (6 un.)', 'Maionese da casa', 0.03, 0),
    ('Tábua de Frios', 'Presunto parma', 0.05, 0),
    ('Tábua de Frios', 'Queijo muçarela', 0.1, 0),
    ('Tábua de Frios', 'Queijo parmesão', 0.04, 0),
    ('Tábua de Frios', 'Salame italiano', 0.06, 0),
    ('Tábua de Frios', 'Azeitona verde', 0.04, 0),
    ('Tábua de Frios', 'Torradinhas', 0.05, 0),
    ('Picanha na Chapa', 'Picanha', 0.45, 10),
    ('Picanha na Chapa', 'Arroz branco', 0.15, 0),
    ('Picanha na Chapa', 'Farofa pronta', 0.08, 0),
    ('Picanha na Chapa', 'Tomate', 0.08, 10),
    ('Picanha na Chapa', 'Cebola', 0.04, 10),
    ('Picanha na Chapa', 'Batata congelada palito', 0.25, 0),
    ('Picanha na Chapa', 'Óleo de soja', 0.08, 0),
    ('Filé à Parmegiana', 'Contrafilé', 0.18, 10),
    ('Filé à Parmegiana', 'Farinha de trigo', 0.03, 0),
    ('Filé à Parmegiana', 'Farinha panko', 0.05, 0),
    ('Filé à Parmegiana', 'Ovos', 0.08, 0),
    ('Filé à Parmegiana', 'Molho de tomate da casa', 0.1, 0),
    ('Filé à Parmegiana', 'Queijo muçarela', 0.08, 0),
    ('Filé à Parmegiana', 'Arroz branco', 0.12, 0),
    ('Filé à Parmegiana', 'Batata congelada palito', 0.2, 0),
    ('Filé à Parmegiana', 'Óleo de soja', 0.1, 0),
    ('Risoto de Cogumelos', 'Arroz arbóreo', 0.1, 0),
    ('Risoto de Cogumelos', 'Mix de cogumelos', 0.12, 10),
    ('Risoto de Cogumelos', 'Queijo parmesão', 0.03, 0),
    ('Risoto de Cogumelos', 'Creme de leite', 0.05, 0),
    ('Risoto de Cogumelos', 'Manteiga', 0.02, 0),
    ('Risoto de Cogumelos', 'Cebola', 0.03, 10),
    ('Burger Lumos', 'Pão de hambúrguer brioche', 1, 0),
    ('Burger Lumos', 'Blend bovino (carne moída)', 0.18, 15),
    ('Burger Lumos', 'Cheddar cremoso', 0.03, 0),
    ('Burger Lumos', 'Bacon em cubos', 0.03, 15),
    ('Burger Lumos', 'Cebola', 0.05, 10),
    ('Burger Lumos', 'Maionese da casa', 0.03, 0),
    ('Burger Lumos', 'Batata congelada palito', 0.12, 0),
    ('Burger Lumos', 'Óleo de soja', 0.05, 0),
    ('Pizza Margherita (8 fatias)', 'Disco de massa de pizza', 1, 0),
    ('Pizza Margherita (8 fatias)', 'Molho de tomate da casa', 0.12, 0),
    ('Pizza Margherita (8 fatias)', 'Muçarela de búfala', 0.2, 0),
    ('Pizza Margherita (8 fatias)', 'Tomate', 0.1, 10),
    ('Pizza Margherita (8 fatias)', 'Manjericão (maço)', 0.25, 0),
    ('Salada Caesar', 'Alface americana', 0.5, 10),
    ('Salada Caesar', 'Peito de frango', 0.15, 20),
    ('Salada Caesar', 'Croutons', 0.04, 0),
    ('Salada Caesar', 'Queijo parmesão', 0.02, 0),
    ('Salada Caesar', 'Molho caesar', 0.05, 0),
    ('Chope Pilsen 500 ml', 'Chope pilsen (barril)', 0.5, 8),
    ('Balde de Long Neck (6 un.)', 'Cerveja long neck 355 ml', 6, 0),
    ('Balde de Long Neck (6 un.)', 'Gelo', 1, 0),
    ('Caipirinha de Limão', 'Cachaça', 0.06, 0),
    ('Caipirinha de Limão', 'Limão tahiti', 0.12, 0),
    ('Caipirinha de Limão', 'Açúcar', 0.03, 0),
    ('Caipirinha de Limão', 'Gelo', 0.25, 0),
    ('Gin Tônica', 'Gin', 0.06, 0),
    ('Gin Tônica', 'Água tônica (lata)', 1, 0),
    ('Gin Tônica', 'Limão tahiti', 0.03, 0),
    ('Gin Tônica', 'Gelo', 0.25, 0),
    ('Drink da Casa (Luz Vermelha)', 'Vodka', 0.05, 0),
    ('Drink da Casa (Luz Vermelha)', 'Xarope de frutas vermelhas', 0.04, 0),
    ('Drink da Casa (Luz Vermelha)', 'Limão tahiti', 0.03, 0),
    ('Drink da Casa (Luz Vermelha)', 'Água tônica (lata)', 0.5, 0),
    ('Drink da Casa (Luz Vermelha)', 'Gelo', 0.25, 0),
    ('Suco Natural 400 ml', 'Laranja pera', 0.8, 0),
    ('Suco Natural 400 ml', 'Açúcar', 0.02, 0),
    ('Suco Natural 400 ml', 'Gelo', 0.1, 0),
    ('Petit Gâteau', 'Chocolate meio amargo', 0.05, 0),
    ('Petit Gâteau', 'Manteiga', 0.03, 0),
    ('Petit Gâteau', 'Ovos', 0.17, 0),
    ('Petit Gâteau', 'Açúcar', 0.03, 0),
    ('Petit Gâteau', 'Farinha de trigo', 0.02, 0),
    ('Petit Gâteau', 'Sorvete de creme', 0.08, 0),
    ('Pudim da Casa', 'Leite condensado (lata)', 0.125, 0),
    ('Pudim da Casa', 'Leite integral', 0.06, 0),
    ('Pudim da Casa', 'Ovos', 0.04, 0),
    ('Pudim da Casa', 'Açúcar', 0.015, 0);
  insert into public.product_recipes(owner_id, product_id, insumo_id, quantidade, perda_pct)
    select v_owner, pr.id, ins.id, f.qtd, f.perda from _ficha f
    join public.products pr on pr.owner_id = v_owner and lower(pr.name) = lower(f.prato) and not pr.is_insumo
    join public.products ins on ins.owner_id = v_owner and lower(ins.name) = lower(f.insumo)
    on conflict (product_id, insumo_id) do update set quantidade = excluded.quantidade, perda_pct = excluded.perda_pct;
  get diagnostics n_fichas = row_count;
  -- Prato com ficha não controla estoque próprio: o estoque é dos insumos
  update public.products p set estoque = null
    where p.owner_id = v_owner and not p.is_insumo and exists (select 1 from public.product_recipes r where r.product_id = p.id);

  -- 5) Conta nova: 10 mesas e o tipo de negócio restaurante
  if not exists (select 1 from public.restaurant_tables t where t.owner_id = v_owner) then
    insert into public.restaurant_tables(owner_id, label) select v_owner, 'Mesa ' || g from generate_series(1, 10) g;
  end if;
  insert into public.business_config(owner_id, business_type, disabled_tabs, disabled_stages)
    values (v_owner, 'restaurante', array['follow_up','leads'], array['consulta_agendada','compareceu','follow_up','perdido'])
    on conflict (owner_id) do nothing;

  raise notice 'Pronto em %: % pratos novos, % categorias novas, % insumos novos, % linhas de ficha técnica.', v_email, n_pratos, n_cat, n_ins, n_fichas;
end $$;
