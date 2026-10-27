# Lumos CRM

Frontend estático (HTML/CSS/JS puro) pronto para GitHub Pages, com autenticação via Supabase.

> **Conferir o que falta aplicar:** rode `docs/verificar-instalacao.sql` no SQL Editor. Ele só lê o banco e lista,
> por seção, tudo o que ainda não foi aplicado (ou responde "Tudo aplicado"). Ao criar uma seção nova, gere a
> consulta de novo com `python3 docs/gerar-verificacao.py`.

## 1. Criar o projeto no Supabase (gratuito)

1. Acesse [supabase.com](https://supabase.com) e crie um projeto novo (plano Free).
2. Vá em **Project Settings → API** e copie:
   - `Project URL`
   - `anon public key`
3. Abra `js/supabaseClient.js` neste repositório e cole os dois valores no lugar de
   `COLOQUE_AQUI_A_URL_DO_SEU_PROJETO` e `COLOQUE_AQUI_A_ANON_KEY_DO_SEU_PROJETO`.

   > A `anon key` é pública por design — pode ficar no código do frontend sem
   > problema. A `service_role key` (que aparece na mesma tela) é secreta e
   > **nunca** deve entrar neste repositório.

## 2. Criar a tabela de perfis (papel admin/usuário)

No Supabase, vá em **SQL Editor** e rode:

```sql
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'user',
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

create policy "Usuarios veem o proprio perfil"
on public.profiles for select
using (auth.uid() = id);

create policy "Usuarios atualizam o proprio perfil"
on public.profiles for update
using (auth.uid() = id);

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Isso faz com que, toda vez que alguém se cadastra pelo site, um perfil seja
criado automaticamente com `role = 'user'`.

## 3. Criar a conta admin (case de demonstração)

1. No Supabase, vá em **Authentication → Users → Add user** e crie a conta com
   `soaresgahbriel@gmail.com` e uma senha forte definida **por você direto
   ali** (não fica em nenhum arquivo deste repositório).
2. Depois, no **SQL Editor**, rode para dar acesso total a essa conta:

```sql
update public.profiles
set role = 'admin'
where email = 'soaresgahbriel@gmail.com';
```

Com isso, ao logar com essa conta, o sistema redireciona direto para
`dashboard.html` (acesso completo), pulando a tela de planos.

## 4. Rodar localmente

Como o projeto usa `type="module"`, não dá pra abrir os `.html` direto no
navegador (`file://`) — precisa de um servidor local simples:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## 5. Publicar no GitHub Pages

1. Suba os arquivos para o repositório `lumos-crm`.
2. No GitHub, vá em **Settings → Pages**.
3. Em **Source**, selecione a branch `main` e a pasta `/ (root)`.
4. Salve — o site fica disponível em
   `https://SEU-USUARIO.github.io/lumos-crm/`.

## Estrutura

```
lumos-crm/
├── index.html        → landing page
├── login.html        → login
├── signup.html       → cadastro
├── plans.html        → tela dos 2 serviços (Agente de IA / CRM)
├── dashboard.html     → acesso completo (admin/demonstração)
├── css/styles.css     → design system
└── js/
    ├── supabaseClient.js  → config do Supabase (preencher)
    └── auth.js            → login, cadastro e redirecionamento por papel
```

## 6. Números do WhatsApp e roteamento

No **SQL Editor** do Supabase, rode:

```sql
create table public.whatsapp_numbers (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  type text check (type in ('principal','sub')) not null,
  label text,
  phone_number text not null,
  routing_description text,
  active boolean default true,
  created_at timestamp with time zone default now()
);

alter table public.whatsapp_numbers enable row level security;

create policy "Usuarios veem seus proprios numeros"
on public.whatsapp_numbers for select
using (auth.uid() = owner_id);

create policy "Usuarios gerenciam seus proprios numeros"
on public.whatsapp_numbers for insert
with check (auth.uid() = owner_id);

create policy "Usuarios atualizam seus proprios numeros"
on public.whatsapp_numbers for update
using (auth.uid() = owner_id);

create policy "Usuarios excluem seus proprios numeros"
on public.whatsapp_numbers for delete
using (auth.uid() = owner_id);
```

O campo `owner_id` já deixa a estrutura pronta pra quando houver mais de uma
loja/cliente usando o sistema — cada um só vê e edita os próprios números.

## 7. Catálogo de produtos (categorias, produtos e fotos)

No **SQL Editor**, rode:

```sql
create table public.categories (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  name text not null,
  created_at timestamp with time zone default now()
);

create table public.products (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  name text not null,
  description text,
  price numeric(12,2),
  unit text check (unit in ('unidade','litro','m2','metro','kg','saco','caixa','rolo')),
  photo_urls text[] default '{}',
  active boolean default true,
  created_at timestamp with time zone default now()
);

create table public.product_categories (
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;

create policy "Dono ve suas categorias" on public.categories for select using (auth.uid() = owner_id);
create policy "Dono cria categorias" on public.categories for insert with check (auth.uid() = owner_id);
create policy "Dono atualiza categorias" on public.categories for update using (auth.uid() = owner_id);
create policy "Dono exclui categorias" on public.categories for delete using (auth.uid() = owner_id);

create policy "Dono ve seus produtos" on public.products for select using (auth.uid() = owner_id);
create policy "Dono cria produtos" on public.products for insert with check (auth.uid() = owner_id);
create policy "Dono atualiza produtos" on public.products for update using (auth.uid() = owner_id);
create policy "Dono exclui produtos" on public.products for delete using (auth.uid() = owner_id);

create policy "Dono ve vinculos" on public.product_categories for select
  using (exists (select 1 from public.products p where p.id = product_id and p.owner_id = auth.uid()));
create policy "Dono cria vinculos" on public.product_categories for insert
  with check (exists (select 1 from public.products p where p.id = product_id and p.owner_id = auth.uid()));
create policy "Dono exclui vinculos" on public.product_categories for delete
  using (exists (select 1 from public.products p where p.id = product_id and p.owner_id = auth.uid()));
```

### Bucket de fotos

1. No Supabase, vá em **Storage → New bucket**.
2. Nome: `product-photos`. Marque **Public bucket**.
3. Volte ao **SQL Editor** e rode:

```sql
create policy "Upload autenticado" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos');
create policy "Update autenticado" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos');
create policy "Delete autenticado" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos');
create policy "Leitura publica" on storage.objects for select to public
  using (bucket_id = 'product-photos');
```

## 8. Leads, mensagens e o agente de IA (Edge Function)

### 8.1 Tabelas de leads e mensagens

No **SQL Editor**:

```sql
create table public.leads (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  name text,
  phone text not null,
  stage text default 'novo' check (stage in ('novo','em_andamento','qualificado','visita','proposta','vendido','descartado')),
  last_message_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table public.messages (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  direction text check (direction in ('in','out')) not null,
  text text,
  created_at timestamp with time zone default now()
);

alter table public.leads enable row level security;
alter table public.messages enable row level security;

create policy "Dono ve seus leads" on public.leads for select using (auth.uid() = owner_id);
create policy "Dono cria leads" on public.leads for insert with check (auth.uid() = owner_id);
create policy "Dono atualiza leads" on public.leads for update using (auth.uid() = owner_id);

create policy "Dono ve mensagens" on public.messages for select
  using (exists (select 1 from public.leads l where l.id = lead_id and l.owner_id = auth.uid()));
```

A Edge Function (abaixo) usa a `service_role key` internamente, então ela
ignora essas políticas — só o painel (usuário logado) fica restrito a ver os
próprios leads.

### 8.2 Criar a Edge Function

1. No Supabase, vá em **Edge Functions → Deploy a new function → Via Editor**.
2. Nome da função: `whatsapp-webhook`.
3. Cole o código de `supabase/functions/whatsapp-webhook/index.ts` (está neste
   repositório).
4. **Importante**: desative a opção **"Enforce JWT verification"** — a UAZAPI
   não manda token de autenticação do Supabase, só o token dela mesma dentro
   do payload. Com o JWT ligado, toda chamada da UAZAPI vai receber 401.
5. Clique em **Deploy**.

### 8.3 Configurar a chave da IA

Em **Project Settings → Edge Functions → Secrets**, adicione:
- `OPENAI_API_KEY`: sua chave da [platform.openai.com](https://platform.openai.com).

(`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já ficam disponíveis
automaticamente dentro de toda Edge Function, não precisa cadastrar.)

### 8.4 Trocar o webhook

No painel da UAZAPI, troque a URL do webhook (que hoje aponta pro
webhook.site) pela URL da sua função, algo como:

```
https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook
```

## 9. Configurações do Agente, Provedores de IA e de WhatsApp

No **SQL Editor**:

```sql
create table public.agent_config (
  owner_id uuid references auth.users(id) primary key,
  name text default 'Assistente Lumos',
  system_prompt text default 'Você é a assistente de atendimento via WhatsApp de uma loja de materiais de construção e acabamento. Responda em português, de forma direta e simpática, como um bom vendedor de balcão.',
  temperature numeric(3,2) default 0.7,
  max_tokens integer default 1024,
  history_limit integer default 10,
  enabled boolean default true,
  allowed_phones text default '',
  active_ai_slot text default 'gratis' check (active_ai_slot in ('paga','gratis')),
  updated_at timestamp with time zone default now()
);

create table public.ai_providers (
  owner_id uuid references auth.users(id) not null,
  slot text check (slot in ('paga','gratis')) not null,
  vendor text check (vendor in ('openai','groq','openrouter','gemini')) not null,
  api_key text default '',
  model text default '',
  primary key (owner_id, slot)
);

create table public.whatsapp_provider_config (
  owner_id uuid references auth.users(id) primary key,
  vendor text check (vendor in ('uazapi','evolution')) default 'uazapi',
  base_url text default '',
  api_key text default '',
  instance_id text default ''
);

alter table public.agent_config enable row level security;
alter table public.ai_providers enable row level security;
alter table public.whatsapp_provider_config enable row level security;

create policy "Dono ve/edita agent_config" on public.agent_config for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Dono ve/edita ai_providers" on public.ai_providers for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Dono ve/edita whatsapp_provider_config" on public.whatsapp_provider_config for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

## 10. Painel estilo SaaS (baseado no prompt do escritório de advocacia)

Adapta o modelo de dados do escritório de advocacia pro nosso negócio. Rode tudo de uma vez no **SQL Editor**:

```sql
-- Novas colunas na tabela leads (equivalente ao leads_adv deles)
alter table public.leads add column if not exists motivo_contato text;
alter table public.leads add column if not exists resumo_conversa text;
alter table public.leads add column if not exists follow_up_1 timestamptz;
alter table public.leads add column if not exists follow_up_2 timestamptz;
alter table public.leads add column if not exists follow_up_3 timestamptz;
alter table public.leads add column if not exists anotacoes text;
alter table public.leads add column if not exists data_agendamento timestamptz;
alter table public.leads add column if not exists is_client boolean default false;

-- Agendamentos (equivalente ao agendamentos_adv deles)
create table if not exists public.agendamentos (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  lead_id uuid references public.leads(id) not null,
  data_hora_inicio timestamptz not null,
  status text check (status in ('agendado','confirmado','compareceu','faltou','cancelado')) default 'agendado',
  created_at timestamptz default now()
);

alter table public.agendamentos enable row level security;
create policy "Dono ve/edita agendamentos" on public.agendamentos for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Configuração da loja (equivalente ao office_config deles — mas por owner_id, já que somos multi-loja)
create table if not exists public.business_config (
  owner_id uuid references auth.users(id) primary key,
  business_name text,
  logo_url text,
  favicon_url text
);

alter table public.business_config enable row level security;
create policy "Dono ve/edita business_config" on public.business_config for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Horário de funcionamento (equivalente ao office_hours deles)
create table if not exists public.business_hours (
  owner_id uuid references auth.users(id) not null,
  weekday int check (weekday between 0 and 6) not null,
  is_open boolean default true,
  hora_inicio time,
  hora_fim time,
  primary key (owner_id, weekday)
);

alter table public.business_hours enable row level security;
create policy "Dono ve/edita business_hours" on public.business_hours for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

## 11. Migração do funil de estágios (Kanban)

Rode no **SQL Editor** — troca o funil antigo pelo novo, mais específico:

```sql
-- Remove a restrição antiga primeiro (ela bloquearia os updates abaixo)
alter table public.leads drop constraint if exists leads_stage_check;

-- Remapeia os estágios existentes pro novo funil
update public.leads set stage = 'novo_contato' where stage = 'novo';
update public.leads set stage = 'conversando' where stage in ('em_andamento','qualificado');
update public.leads set stage = 'consulta_agendada' where stage in ('visita','proposta');
update public.leads set stage = 'fechado' where stage = 'vendido';
update public.leads set stage = 'perdido' where stage = 'descartado';

-- Adiciona a nova restrição de valores permitidos
alter table public.leads add constraint leads_stage_check
  check (stage in ('novo_contato','conversando','consulta_agendada','compareceu','follow_up','fechado','perdido'));
alter table public.leads alter column stage set default 'novo_contato';
```

**Importante**: depois de rodar isso, atualize também a Edge Function (`supabase/functions/whatsapp-webhook/index.ts`) — o valor `stage: "novo"` no código precisa virar `stage: "novo_contato"`. Já venho com esse arquivo corrigido nesta entrega.

## 12. Colunas do Kanban ativas/desativadas por loja

Rode no **SQL Editor**:

```sql
alter table public.business_config add column if not exists disabled_stages text[] default '{}';
```

## 13. Múltiplos Agentes de IA (elimina número principal/sub-números)

Cada agente agora é uma unidade completa e independente: nome, número de
WhatsApp próprio, prompt, provedor de IA e provedor de WhatsApp. Rode tudo de
uma vez no **SQL Editor**:

```sql
-- 1. Nova tabela agents, substituindo agent_config e whatsapp_numbers
create table public.agents (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  name text default 'Assistente Lumos',
  phone_number text,
  system_prompt text default 'Você é a assistente de atendimento via WhatsApp de uma loja de materiais de construção e acabamento. Responda em português, de forma direta e simpática, como um bom vendedor de balcão.',
  temperature numeric(3,2) default 0.7,
  max_tokens integer default 1024,
  history_limit integer default 10,
  enabled boolean default true,
  allowed_phones text default '',
  active_ai_slot text default 'gratis' check (active_ai_slot in ('paga','gratis')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.agents enable row level security;
create policy "Dono ve/edita seus agentes" on public.agents for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 2. Migra o que já existe: 1 agente por dono, juntando config + número principal
insert into public.agents (owner_id, name, phone_number, system_prompt, temperature, max_tokens, history_limit, enabled, allowed_phones, active_ai_slot)
select
  ac.owner_id,
  coalesce(ac.name, 'Assistente Lumos'),
  (select phone_number from public.whatsapp_numbers wn where wn.owner_id = ac.owner_id and wn.type = 'principal' limit 1),
  ac.system_prompt, ac.temperature, ac.max_tokens, ac.history_limit, ac.enabled, ac.allowed_phones, ac.active_ai_slot
from public.agent_config ac;

-- 3. Reestrutura ai_providers: de owner_id+slot pra agent_id+slot
drop policy if exists "Dono ve/edita ai_providers" on public.ai_providers;

alter table public.ai_providers add column if not exists agent_id uuid references public.agents(id);
update public.ai_providers p set agent_id = a.id from public.agents a where a.owner_id = p.owner_id;

alter table public.ai_providers drop constraint if exists ai_providers_pkey;
alter table public.ai_providers alter column agent_id set not null;
alter table public.ai_providers drop column owner_id;
alter table public.ai_providers add primary key (agent_id, slot);

create policy "Dono ve/edita ai_providers via agente" on public.ai_providers for all
  using (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()));

-- 4. Reestrutura whatsapp_provider_config: de owner_id pra agent_id
drop policy if exists "Dono ve/edita whatsapp_provider_config" on public.whatsapp_provider_config;

alter table public.whatsapp_provider_config add column if not exists agent_id uuid references public.agents(id);
update public.whatsapp_provider_config w set agent_id = a.id from public.agents a where a.owner_id = w.owner_id;

alter table public.whatsapp_provider_config drop constraint if exists whatsapp_provider_config_pkey;
alter table public.whatsapp_provider_config alter column agent_id set not null;
alter table public.whatsapp_provider_config drop column owner_id;
alter table public.whatsapp_provider_config add primary key (agent_id);

create policy "Dono ve/edita whatsapp_provider_config via agente" on public.whatsapp_provider_config for all
  using (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()));

-- 5. Marca de qual agente cada lead veio
alter table public.leads add column if not exists agent_id uuid references public.agents(id);
update public.leads l set agent_id = a.id from public.agents a where a.owner_id = l.owner_id;

-- 6. Remove as tabelas antigas
drop table if exists public.whatsapp_numbers;
drop table if exists public.agent_config;
```

## 14. Gerenciar Abas (módulo restaurante, fase A)

Rode no **SQL Editor**:

```sql
alter table public.business_config add column if not exists disabled_tabs text[] default '{}';
```

## 15. Módulo Restaurante — Mesas, Cozinha e pedidos (fases B, C, D)

Rode tudo de uma vez no **SQL Editor**:

```sql
-- Tipo de negócio do agente (controla se ele usa o fluxo de restaurante)
alter table public.agents add column if not exists business_type text default 'geral' check (business_type in ('geral','restaurante'));

-- Mesas
create table public.restaurant_tables (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  agent_id uuid references public.agents(id),
  label text not null,
  status text check (status in ('livre','ocupada')) default 'livre',
  created_at timestamptz default now()
);

alter table public.restaurant_tables enable row level security;
create policy "Dono ve/edita suas mesas" on public.restaurant_tables for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Sessões de mesa (abre quando o 1º cliente informa a mesa, fecha quando a conta é paga)
create table public.table_sessions (
  id uuid default gen_random_uuid() primary key,
  table_id uuid references public.restaurant_tables(id) not null,
  owner_id uuid references auth.users(id) not null,
  status text check (status in ('ativa','aguardando_pagamento','fechada')) default 'ativa',
  opened_at timestamptz default now(),
  closed_at timestamptz
);

alter table public.table_sessions enable row level security;
create policy "Dono ve/edita suas sessoes" on public.table_sessions for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Liga o lead à sessão de mesa e à jornada dele (chegou / conversando / aguardando pagamento)
alter table public.leads add column if not exists table_session_id uuid references public.table_sessions(id);
alter table public.leads add column if not exists visit_status text check (visit_status in ('iniciado','conversando','aguardando_pagamento')) default 'iniciado';

-- Pedidos (podem ser vários por visita) e itens (puxados do Cardápio = tabela products)
create table public.orders (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) not null,
  table_session_id uuid references public.table_sessions(id) not null,
  lead_id uuid references public.leads(id) not null,
  status text check (status in ('novo_pedido','entregue')) default 'novo_pedido',
  total numeric(12,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.orders enable row level security;
create policy "Dono ve/edita seus pedidos" on public.orders for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table public.order_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer default 1,
  unit_price numeric(12,2) not null
);

alter table public.order_items enable row level security;
create policy "Dono ve/edita itens via pedido" on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.orders o where o.id = order_id and o.owner_id = auth.uid()));
```

## 16. Tipo de negócio vira propriedade da loja (não do agente)

Rode no **SQL Editor**:

```sql
-- Tipo de negócio agora fica na loja (business_config), não no agente
alter table public.business_config add column if not exists business_type text default 'geral'
  check (business_type in ('geral','restaurante','clinica','salao','imobiliaria'));

-- Remove o campo antigo, que estava no lugar errado
alter table public.agents drop column if exists business_type;
```

## 17. Cards do Dashboard configuráveis por nicho

Rode no **SQL Editor**:

```sql
alter table public.business_config add column if not exists disabled_dashboard_cards text[] default '{}';
```

## 18. Novo tipo de negócio: Materiais de Construção

Rode no **SQL Editor**:

```sql
alter table public.business_config drop constraint if exists business_config_business_type_check;
alter table public.business_config add constraint business_config_business_type_check
  check (business_type in ('geral','materiais_construcao','restaurante','clinica','salao','imobiliaria'));
```

## 19. Integrações (pagamento, frete, estoque, nota fiscal, regras de venda)

No **SQL Editor**:

```sql
create table if not exists public.integrations (
  owner_id uuid references auth.users(id) on delete cascade not null,
  kind text not null check (kind in ('vendas','pagamento','frete','estoque','nota_fiscal','api_personalizada')),
  provider text,
  enabled boolean default false,
  config jsonb default '{}'::jsonb,
  secrets jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default now(),
  primary key (owner_id, kind)
);

alter table public.integrations enable row level security;

create policy "Dono ve/edita integracoes" on public.integrations for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

A tela fica em **Integrações** (menu lateral). Os campos são gerados a partir de
`js/integrations.js` — pra adicionar um fornecedor ou campo novo, basta editar o
esquema ali. Chaves e tokens ficam na coluna `secrets` e nunca são mostrados de
volta na tela.

## 20. Funil automático, orçamento para aprovação e IA por contato

No **SQL Editor**:

```sql
-- IA ligada/desligada por contato e orçamento montado pela IA
alter table public.leads add column if not exists ai_enabled boolean default true;
alter table public.leads add column if not exists orcamento jsonb;

-- Nova etapa do Kanban: "Aguardando link de pagamento"
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check
  check (stage in ('novo_contato','conversando','consulta_agendada','aguardando_link','compareceu','follow_up','fechado','perdido'));
```

Como funciona:
- A IA marca a etapa com `[ETAPA: ...]` e o código só deixa o lead **avançar**
  (novo contato → conversando → consulta agendada → aguardando link), nunca voltar.
  Etapas desativadas no Kanban são respeitadas. Fechado/perdido são sempre manuais.
- Quando o cliente confirma a compra, a IA lista os itens com `[ORCAMENTO: produto | qtd]`
  e o **código** calcula preços e total a partir do catálogo.
- Se "Regras de venda" tiver o WhatsApp do vendedor, ele recebe um aviso na hora.
- Com a IA desativada no contato, as mensagens continuam salvas, mas ninguém responde automaticamente.

## 21. Mensagens do vendedor e resposta pelo Lumos

No **SQL Editor**:

```sql
-- Quem mandou cada mensagem: cliente, ia ou vendedor
alter table public.messages add column if not exists sender text;
update public.messages set sender = case when direction = 'in' then 'cliente' else 'ia' end where sender is null;

-- Pausar a IA quando um vendedor responde (liga/desliga na página do agente)
alter table public.agents add column if not exists pause_on_human boolean default true;
```

### Edge Function `send-message`
1. **Edge Functions → Deploy a new function → Via Editor**, nome `send-message`.
2. Cole o código de `supabase/functions/send-message/index.ts`.
3. Deixe **"Enforce JWT verification" LIGADO** (diferente do webhook).
4. Deploy.

### UAZAPI
No painel da UAZAPI, no webhook da instância, as mensagens enviadas pelo próprio
número (`fromMe`) precisam chegar: **não** marque o filtro `fromMeYes` em
"excluir mensagens". Pode (e deve) manter `wasSentByApi` e `isGroupYes` excluídos.

## 22. Agente simulador, pedidos de venda e produtos por agente

No **SQL Editor**:

```sql
-- Produtos: em quais agentes aparecem (vazio = todos), m² por caixa e estoque
alter table public.products add column if not exists agent_ids uuid[] default '{}';
alter table public.products add column if not exists m2_por_caixa numeric(10,3);
alter table public.products add column if not exists estoque numeric(12,2);

-- Agente simulador
alter table public.agents add column if not exists is_simulator boolean default false;
alter table public.agents add column if not exists sim_business_type text default 'materiais_construcao';
alter table public.agents add column if not exists sim_auto_approve boolean default false;

-- Pedidos de venda (número sequencial a partir de 1001)
create table if not exists public.sales_orders (
  id uuid default gen_random_uuid() primary key,
  numero bigint generated always as identity (start with 1001) unique,
  owner_id uuid references auth.users(id) on delete cascade not null,
  agent_id uuid references public.agents(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade not null,
  itens jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) default 0,
  frete numeric(12,2),
  total numeric(12,2) default 0,
  entrega jsonb default '{}'::jsonb,
  status text default 'aguardando_aprovacao'
    check (status in ('aguardando_aprovacao','aguardando_pagamento','pago','cancelado')),
  pagamento jsonb default '{}'::jsonb,
  nf_numero text,
  simulado boolean default false,
  created_at timestamptz default now(),
  approved_at timestamptz,
  paid_at timestamptz
);

alter table public.sales_orders enable row level security;
drop policy if exists "Dono ve seus pedidos" on public.sales_orders;
create policy "Dono ve seus pedidos" on public.sales_orders for select using (auth.uid() = owner_id);
```

### Edge Function `orders`
1. Crie a função `orders` e cole `supabase/functions/orders/index.ts`.
2. **"Enforce JWT verification" DESLIGADO** (a página de pagamento é pública; a função confere o token do link, o login do dono ou a chave interna).
3. Opcional: secret `SITE_URL` com o endereço do site (padrão: `https://gahbrielsoares.github.io/Lumos`).

### Como funciona
- A IA fecha o pedido com `[ORCAMENTO: produto | qtd]`, `[ENTREGA: bairro/CEP ou retirada]` e `[ETAPA: aguardando_link]`.
- O **código** calcula preço, arredonda pisos para caixas fechadas, confere estoque e calcula o frete pela tabela.
- O pedido aparece no Kanban em "Aguardando link de pagamento". Ao aprovar, o cliente recebe o resumo e o link.
- Pago (simulado pela página `pagamento-simulado.html` ou confirmado pelo vendedor): o cliente recebe
  confirmação, número do pedido, nota fiscal (no simulador), entrega/retirada e o agradecimento.
- Agentes que usam o mesmo número: responde o que estiver ativo ("Ativar neste número" na lista de agentes).

## 23. Dados do cliente e endereço de entrega

No **SQL Editor**:

```sql
alter table public.leads add column if not exists dados_cliente jsonb default '{}'::jsonb;
alter table public.sales_orders add column if not exists cliente jsonb default '{}'::jsonb;
```

A IA registra o que o cliente informa com `[DADOS: campo=valor; ...]` (nome, CPF/CNPJ, e-mail, rua,
número, complemento, tipo de imóvel, bairro, cidade, CEP, referência, quem recebe). O CEP preenche
rua/bairro/cidade automaticamente (ViaCEP). O código só deixa fechar o pedido de entrega com nome,
rua, número, tipo de imóvel e bairro (e complemento, se for apartamento/condomínio).

## 24. Pós-venda (saiu para entrega, pronto para retirada, entregue)

No **SQL Editor**:

```sql
alter table public.sales_orders add column if not exists logistica jsonb default '{}'::jsonb;
```

No painel do lead (pedido pago) aparecem os botões **Saiu para entrega / Pronto para retirada / Entregue**;
cada um avisa o cliente no WhatsApp. A IA também coleta o período de entrega (manhã/tarde) e, em nota no
CNPJ, a razão social (obrigatória) e a inscrição estadual.

## 25. Restaurante e bar: delivery, retirada, reservas, conta da mesa e cozinha

No **SQL Editor**:

```sql
-- Cozinha: pedidos da mesa, do delivery e da retirada, com etapas e observações
alter table public.orders alter column table_session_id drop not null;
alter table public.orders add column if not exists tipo text default 'mesa';
alter table public.orders add column if not exists numero bigint generated by default as identity;
alter table public.orders add column if not exists observacao text;
alter table public.orders add column if not exists sales_order_id uuid references public.sales_orders(id) on delete set null;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('novo_pedido','em_preparo','pronto','saiu_entrega','entregue','cancelado'));
alter table public.order_items add column if not exists observacao text;

-- Conta da mesa vira um pedido de venda (link de pagamento)
alter table public.sales_orders add column if not exists table_session_id uuid references public.table_sessions(id) on delete set null;

-- Reservas entram em Agendamentos
alter table public.agendamentos add column if not exists tipo text default 'agendamento';
alter table public.agendamentos add column if not exists pessoas integer;
alter table public.agendamentos add column if not exists nome text;
alter table public.agendamentos add column if not exists ocasiao text;
alter table public.agendamentos add column if not exists observacao text;

-- Cardápio do simulador separado por nicho
alter table public.products add column if not exists segmento text;

-- Nova integração "Restaurante e bar"
alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('vendas','pagamento','frete','estoque','nota_fiscal','api_personalizada','restaurante'));
```

Como funciona:
- **Mesa**: `[MESA: n]` e `[PEDIDO: item | qtd | obs]` vão pra Cozinha. `[CONTA]` monta o fechamento
  (itens + taxa de serviço + couvert) e envia o link; pago, a mesa é liberada.
- **Delivery/retirada**: mesmo fluxo de venda das lojas (itens, dados, pagamento), com taxa de entrega pela
  tabela de frete. Pagamento online (link) ou na entrega (dinheiro com troco/maquininha). Vai pra Cozinha.
- **Cozinha**: Novo → Em preparo → Pronto → Saiu p/ entrega → Entregue. No delivery/retirada, cada etapa
  avisa o cliente no WhatsApp.
- **Reservas**: `[RESERVA: data=...; hora=...; pessoas=...]`, validadas (antecedência, lotação) e salvas em Agendamentos.

## 26. Follow-up automático

No **SQL Editor**:

```sql
-- Cards de follow-up (1, 2, 3...) de cada loja
create table if not exists public.follow_up_rules (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  ordem integer not null default 1,
  ativo boolean default true,
  espera_valor integer not null default 2,
  espera_unidade text not null default 'horas' check (espera_unidade in ('minutos','horas','dias')),
  gatilho text not null default 'sem_resposta' check (gatilho in ('sem_resposta','horario_fixo')),
  horario_fixo text,                         -- "10:00" quando o gatilho é horário fixo
  repeticao text not null default 'unica' check (repeticao in ('unica','constante')),
  max_repeticoes integer default 3,
  objetivo_tipo text not null default 'retomar',
  objetivo_texto text,
  desconto_pct numeric(5,2),
  created_at timestamptz default now()
);
alter table public.follow_up_rules enable row level security;
drop policy if exists "Dono ve/edita follow-ups" on public.follow_up_rules;
create policy "Dono ve/edita follow-ups" on public.follow_up_rules for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Configuração geral (liga/desliga, janela de horário, dias e intervalo entre envios)
create table if not exists public.follow_up_config (
  owner_id uuid references auth.users(id) on delete cascade primary key,
  ativo boolean default false,
  hora_inicio text default '08:00',
  hora_fim text default '20:00',
  dias integer[] default '{1,2,3,4,5,6}',   -- 0 = domingo ... 6 = sábado
  intervalo_seg integer default 60,
  ultimo_envio_at timestamptz
);
alter table public.follow_up_config enable row level security;
drop policy if exists "Dono ve/edita config de follow-up" on public.follow_up_config;
create policy "Dono ve/edita config de follow-up" on public.follow_up_config for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Histórico do que foi enviado
create table if not exists public.follow_up_log (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete cascade not null,
  rule_id uuid references public.follow_up_rules(id) on delete set null,
  ordem integer,
  objetivo text,
  texto text,
  created_at timestamptz default now()
);
alter table public.follow_up_log enable row level security;
drop policy if exists "Dono ve seu historico de follow-up" on public.follow_up_log;
create policy "Dono ve seu historico de follow-up" on public.follow_up_log for select using (auth.uid() = owner_id);

-- Estado do follow-up em cada lead
alter table public.leads add column if not exists fu_step integer default 0;
alter table public.leads add column if not exists fu_rep integer default 0;
alter table public.leads add column if not exists fu_optout boolean default false;
alter table public.leads add column if not exists desconto_pct numeric(5,2);
alter table public.leads add column if not exists desconto_ate timestamptz;
```

### Edge Function `follow-up`
1. Crie a função `follow-up` com o código de `supabase/functions/follow-up/index.ts`, **JWT desligado**.
2. Em **Edge Functions → Secrets**, crie `FOLLOWUP_SECRET` com uma senha longa qualquer.
3. Agende pra rodar a cada minuto (**SQL Editor**, troque SUA_SENHA pela senha do passo 2):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('lumos-follow-up', '* * * * *', $$
  select net.http_post(
    url := 'https://nkmyunxjoeqpmwolefbj.supabase.co/functions/v1/follow-up',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'SUA_SENHA'),
    body := '{}'::jsonb
  );
$$);
```

Cada loja recebe no máximo 1 envio por intervalo (padrão: 1 por minuto), só dentro da janela de horário.
O follow-up para quando o cliente responde, quando a IA está pausada no contato, quando o pedido é
fechado/perdido ou quando o cliente pede pra não receber mais mensagens.

## 27. Cardápio digital da mesa e QR Codes

No **SQL Editor**:

```sql
alter table public.leads add column if not exists menu_token text;
create index if not exists leads_menu_token_idx on public.leads(menu_token);
alter table public.leads drop constraint if exists leads_visit_status_check;
alter table public.leads add constraint leads_visit_status_check
  check (visit_status in ('iniciado','aguardando_mesa','conversando','aguardando_pagamento'));
```

### Edge Function `menu`
Crie a função `menu` com `supabase/functions/menu/index.ts`, **JWT desligado** (o cardápio é uma página pública;
o acesso é pelo token do link, que vale enquanto o cliente estiver na mesa).

### Como funciona
1. **QR Codes** (aba Mesas → "QR Codes"): um QR igual pra todas as mesas ("Olá! Estou no salão 🍽️")
   ou um por mesa ("Olá! Estou na Mesa 5 🍽️"). Dá pra imprimir direto.
2. QR padrão: boas-vindas e, na mensagem seguinte, "me fale o número da sua MESA". QR da mesa: já vincula a mesa.
3. "Quer ver nosso cardápio?" com botões **Sim / Não** (se o aparelho não mostrar botões, vai como texto).
4. **Sim** → link do cardápio digital (`cardapio.html`, ~19 KB, sem bibliotecas, fotos leves e carregamento sob demanda).
5. No cardápio: toque na foto pra adicionar/tirar, + e − pra quantidade, observação por item, lista do pedido,
   **Enviar pedido** → "Confirma que conferiu seu pedido e enviar para a cozinha?" (Sim volta pro WhatsApp; Não volta pra lista),
   **Cancelar pedido** limpa a lista.
6. O pedido cai na Cozinha e o cliente recebe a confirmação no WhatsApp. "Cardápio" a qualquer momento reenvia o link.

## 28. Pedido pela conversa com confirmação (salão)

No **SQL Editor**:

```sql
alter table public.leads add column if not exists pedido_pendente jsonb;
```

Na mesa, quando o cliente pede pela conversa ("mais um chopp"), a IA marca `[CONFIRMAR: item | qtd | obs]`,
o sistema mostra o item com o preço e pergunta "Posso confirmar?" (Sim/Não). Só o **Sim** manda pra cozinha
(o pedido pendente vale 30 minutos). Pedido genérico ("uma porção") recebe a lista de opções da categoria.

## 29. ERP: financeiro, estoque, compras, relatórios e notas fiscais

No **SQL Editor**:

```sql
-- Financeiro: contas a receber (receitas) e a pagar (despesas)
create table if not exists public.fin_lancamentos (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  tipo text not null check (tipo in ('receita','despesa')),
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor >= 0),
  vencimento date not null default current_date,
  pago_em date,
  forma text,
  origem text default 'manual',          -- manual | venda | compra
  ref_id uuid,
  observacao text,
  created_at timestamptz default now()
);
alter table public.fin_lancamentos enable row level security;
drop policy if exists "Dono ve/edita financeiro" on public.fin_lancamentos;
create policy "Dono ve/edita financeiro" on public.fin_lancamentos for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Estoque: custo, mínimo e histórico de movimentações
alter table public.products add column if not exists custo numeric(12,2);
alter table public.products add column if not exists estoque_minimo numeric(12,2);
create table if not exists public.estoque_mov (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  tipo text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade numeric(12,3) not null,
  saldo_apos numeric(12,3),
  motivo text,
  origem text default 'manual',          -- manual | venda | compra
  ref_id uuid,
  created_at timestamptz default now()
);
alter table public.estoque_mov enable row level security;
drop policy if exists "Dono ve/edita estoque" on public.estoque_mov;
create policy "Dono ve/edita estoque" on public.estoque_mov for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Compras: fornecedores e pedidos de compra
create table if not exists public.fornecedores (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  nome text not null, contato text, telefone text, email text, cnpj text, observacao text,
  created_at timestamptz default now()
);
alter table public.fornecedores enable row level security;
drop policy if exists "Dono ve/edita fornecedores" on public.fornecedores;
create policy "Dono ve/edita fornecedores" on public.fornecedores for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists public.compras (
  id uuid default gen_random_uuid() primary key,
  numero bigint generated by default as identity,
  owner_id uuid references auth.users(id) on delete cascade not null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  itens jsonb not null default '[]'::jsonb,   -- [{product_id, nome, quantidade, custo_unitario}]
  total numeric(12,2) default 0,
  status text default 'aberta' check (status in ('aberta','recebida','cancelada')),
  previsao date,
  vencimento_pagamento date,
  recebida_em timestamptz,
  observacao text,
  created_at timestamptz default now()
);
alter table public.compras enable row level security;
drop policy if exists "Dono ve/edita compras" on public.compras;
create policy "Dono ve/edita compras" on public.compras for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

### Automático
- **Venda paga** (link, confirmação do vendedor ou conta da mesa): lança a receita no Financeiro e dá baixa no
  estoque dos produtos que têm estoque controlado.
- **Compra recebida**: entrada no estoque, custo do produto atualizado e conta a pagar criada.

## 30. Painel Admin (contas, situação, abas liberadas e acesso de suporte)

No **SQL Editor**:

```sql
-- Situação da conta e o que cada cliente pode ver
alter table public.profiles add column if not exists status text default 'cadastrado';
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('cadastrado','ativo','inativo'));
alter table public.profiles add column if not exists allowed_tabs text[];      -- vazio/nulo = todas as abas
alter table public.profiles add column if not exists plano text;
alter table public.profiles add column if not exists notas text;
alter table public.profiles add column if not exists suporte_ate timestamptz;  -- acesso de suporte do admin

-- Quem já tinha acesso vira "cliente ativo"
update public.profiles set status = 'ativo' where role in ('cliente','admin') and coalesce(status,'cadastrado') = 'cadastrado';

-- Nenhum usuário consegue alterar papel, situação, abas ou acesso de suporte pelo navegador
-- (só o Painel Admin, pela função "admin", que usa a chave de serviço)
create or replace function public.protect_profile_role()
returns trigger as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and (
       new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.allowed_tabs is distinct from old.allowed_tabs
    or new.suporte_ate is distinct from old.suporte_ate
    or new.plano is distinct from old.plano
    or new.notas is distinct from old.notas
  ) then
    raise exception 'Somente o administrador pode alterar esses dados';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- A política antiga que deixava o usuário editar o próprio perfil não é usada
drop policy if exists "Usuarios atualizam o proprio perfil" on public.profiles;
```

### Edge Function `admin`
Crie a função `admin` com `supabase/functions/admin/index.ts`, com **JWT ligado**. Ela só atende quem tem papel `admin`.

### Acesso de suporte ("Acessar como cliente")
Em **Authentication → URL Configuration**, adicione em **Redirect URLs**:
`https://gahbrielsoares.github.io/Lumos/*`

## 31. Administrador principal e Equipe de suporte

- **Administrador principal**: `soaresgahbriel@gmail.com` (pode trocar pelo secret `OWNER_EMAIL` da função `admin`).
  É o único que define quem é **Administrador** ou **Equipe de suporte**, e ninguém rebaixa essa conta.
- **Administrador**: muda situação, plano, abas e observações das contas de clientes e usa o acesso de suporte.
- **Equipe de suporte** (papel `suporte`): vê o Painel Admin, muda abas e observações das lojas e usa o acesso de suporte.
  Não muda situação, plano nem funções.
- Ninguém gera acesso de suporte para contas da equipe (isso daria os poderes daquela pessoa).

Para transformar alguém em equipe de suporte, use o Painel Admin (logado como principal) ou, no SQL Editor:
```sql
update public.profiles set role = 'suporte' where email = 'email@da.pessoa';
```

## 32. Configurações também é liberada pelo admin

A aba **Configurações** passou a ser controlada no Painel Admin (como Agentes e Integrações).
Para quem já tinha abas escolhidas não perder o acesso a Configurações, rode uma vez no **SQL Editor**:

```sql
update public.profiles
set allowed_tabs = array_append(allowed_tabs, 'settings')
where allowed_tabs is not null and cardinality(allowed_tabs) > 0 and not ('settings' = any(allowed_tabs));
```

No acesso de suporte, a faixa no rodapé tem o botão **"Ver como o cliente vê"**, que mostra só as abas liberadas.

## 33. Equipe do estabelecimento (contas internas de funcionários)

No **SQL Editor** (rode tudo de uma vez):

```sql
-- Funcionários de cada estabelecimento (login por usuário simples, sem e-mail)
create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade not null,
  username text unique not null,
  nome text not null,
  funcao text not null default 'personalizado',
  allowed_tabs text[] not null default '{}',
  perms jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz default now()
);
alter table public.team_members enable row level security;
drop policy if exists "Dono e o proprio funcionario veem" on public.team_members;
create policy "Dono e o proprio funcionario veem" on public.team_members for select
  using (auth.uid() = owner_id or auth.uid() = user_id);
-- (criar, editar e excluir só pela função "team", com a chave de serviço)

-- Limite de funcionários por conta (o admin da Lumos define; vazio = sem limite)
alter table public.profiles add column if not exists limite_equipe integer;

-- ---------- Funções usadas nas regras de acesso ----------
create or replace function public.is_team_of(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m where m.user_id = auth.uid() and m.owner_id = owner and m.ativo);
$$;

create or replace function public.team_has_tab(owner uuid, tab text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m
                 where m.user_id = auth.uid() and m.owner_id = owner and m.ativo and tab = any(m.allowed_tabs));
$$;

-- O que o funcionário logado pode ver (usado pelo painel)
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member', (select jsonb_build_object('owner_id', m.owner_id, 'nome', m.nome, 'username', m.username, 'funcao', m.funcao,
                                         'allowed_tabs', m.allowed_tabs, 'perms', m.perms, 'ativo', m.ativo)
               from public.team_members m where m.user_id = auth.uid()),
    'owner', (select jsonb_build_object('status', p.status, 'role', p.role, 'allowed_tabs', p.allowed_tabs)
              from public.profiles p where p.id = (select owner_id from public.team_members where user_id = auth.uid()))
  );
$$;

-- ---------- Regras extras para a equipe (as regras do dono continuam iguais) ----------
-- Operacional: toda a equipe ativa do estabelecimento
drop policy if exists "Equipe: leads" on public.leads;
create policy "Equipe: leads" on public.leads for all using (public.is_team_of(owner_id)) with check (public.is_team_of(owner_id));
drop policy if exists "Equipe: mensagens" on public.messages;
create policy "Equipe: mensagens" on public.messages for select
  using (exists (select 1 from public.leads l where l.id = lead_id and public.is_team_of(l.owner_id)));
drop policy if exists "Equipe: agendamentos" on public.agendamentos;
create policy "Equipe: agendamentos" on public.agendamentos for all using (public.is_team_of(owner_id)) with check (public.is_team_of(owner_id));
drop policy if exists "Equipe: sessoes" on public.table_sessions;
create policy "Equipe: sessoes" on public.table_sessions for all using (public.is_team_of(owner_id)) with check (public.is_team_of(owner_id));
drop policy if exists "Equipe: pedidos cozinha" on public.orders;
create policy "Equipe: pedidos cozinha" on public.orders for all using (public.is_team_of(owner_id)) with check (public.is_team_of(owner_id));
drop policy if exists "Equipe: itens" on public.order_items;
create policy "Equipe: itens" on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_team_of(o.owner_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id and public.is_team_of(o.owner_id)));
drop policy if exists "Equipe: pedidos de venda" on public.sales_orders;
create policy "Equipe: pedidos de venda" on public.sales_orders for select using (public.is_team_of(owner_id));

-- Cardápio, mesas e configurações: todos leem; só altera quem tem a aba
drop policy if exists "Equipe: le produtos" on public.products;
create policy "Equipe: le produtos" on public.products for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita produtos" on public.products;
create policy "Equipe: edita produtos" on public.products for update
  using (public.team_has_tab(owner_id, 'produtos') or public.team_has_tab(owner_id, 'estoque'));
drop policy if exists "Equipe: cria produtos" on public.products;
create policy "Equipe: cria produtos" on public.products for insert with check (public.team_has_tab(owner_id, 'produtos'));
drop policy if exists "Equipe: exclui produtos" on public.products;
create policy "Equipe: exclui produtos" on public.products for delete using (public.team_has_tab(owner_id, 'produtos'));
drop policy if exists "Equipe: le categorias" on public.categories;
create policy "Equipe: le categorias" on public.categories for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita categorias" on public.categories;
create policy "Equipe: edita categorias" on public.categories for all
  using (public.team_has_tab(owner_id, 'produtos')) with check (public.team_has_tab(owner_id, 'produtos'));
drop policy if exists "Equipe: le vinculos" on public.product_categories;
create policy "Equipe: le vinculos" on public.product_categories for select
  using (exists (select 1 from public.products p where p.id = product_id and public.is_team_of(p.owner_id)));
drop policy if exists "Equipe: edita vinculos" on public.product_categories;
create policy "Equipe: edita vinculos" on public.product_categories for all
  using (exists (select 1 from public.products p where p.id = product_id and public.team_has_tab(p.owner_id, 'produtos')))
  with check (exists (select 1 from public.products p where p.id = product_id and public.team_has_tab(p.owner_id, 'produtos')));
drop policy if exists "Equipe: le mesas" on public.restaurant_tables;
create policy "Equipe: le mesas" on public.restaurant_tables for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita mesas" on public.restaurant_tables;
create policy "Equipe: edita mesas" on public.restaurant_tables for all
  using (public.team_has_tab(owner_id, 'mesas')) with check (public.team_has_tab(owner_id, 'mesas'));
drop policy if exists "Equipe: le config" on public.business_config;
create policy "Equipe: le config" on public.business_config for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita config" on public.business_config;
create policy "Equipe: edita config" on public.business_config for update using (public.team_has_tab(owner_id, 'settings'));
drop policy if exists "Equipe: le horarios" on public.business_hours;
create policy "Equipe: le horarios" on public.business_hours for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita horarios" on public.business_hours;
create policy "Equipe: edita horarios" on public.business_hours for all
  using (public.team_has_tab(owner_id, 'settings')) with check (public.team_has_tab(owner_id, 'settings'));
drop policy if exists "Equipe: le agentes" on public.agents;
create policy "Equipe: le agentes" on public.agents for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita agentes" on public.agents;
create policy "Equipe: edita agentes" on public.agents for update using (public.team_has_tab(owner_id, 'agents'));

-- Sensível: só com a aba correspondente (chaves de IA e de integrações, financeiro, compras, estoque, follow-up)
drop policy if exists "Equipe: provedores de IA" on public.ai_providers;
create policy "Equipe: provedores de IA" on public.ai_providers for all
  using (exists (select 1 from public.agents a where a.id = agent_id and public.team_has_tab(a.owner_id, 'agents')))
  with check (exists (select 1 from public.agents a where a.id = agent_id and public.team_has_tab(a.owner_id, 'agents')));
drop policy if exists "Equipe: provedor de WhatsApp" on public.whatsapp_provider_config;
create policy "Equipe: provedor de WhatsApp" on public.whatsapp_provider_config for all
  using (exists (select 1 from public.agents a where a.id = agent_id and public.team_has_tab(a.owner_id, 'agents')))
  with check (exists (select 1 from public.agents a where a.id = agent_id and public.team_has_tab(a.owner_id, 'agents')));
drop policy if exists "Equipe: integracoes" on public.integrations;
create policy "Equipe: integracoes" on public.integrations for all
  using (public.team_has_tab(owner_id, 'integracoes')) with check (public.team_has_tab(owner_id, 'integracoes'));
drop policy if exists "Equipe: financeiro" on public.fin_lancamentos;
create policy "Equipe: financeiro" on public.fin_lancamentos for all
  using (public.team_has_tab(owner_id, 'financeiro')) with check (public.team_has_tab(owner_id, 'financeiro'));
drop policy if exists "Equipe: compras" on public.compras;
create policy "Equipe: compras" on public.compras for all
  using (public.team_has_tab(owner_id, 'compras')) with check (public.team_has_tab(owner_id, 'compras'));
drop policy if exists "Equipe: fornecedores" on public.fornecedores;
create policy "Equipe: fornecedores" on public.fornecedores for all
  using (public.team_has_tab(owner_id, 'compras')) with check (public.team_has_tab(owner_id, 'compras'));
drop policy if exists "Equipe: estoque" on public.estoque_mov;
create policy "Equipe: estoque" on public.estoque_mov for all
  using (public.team_has_tab(owner_id, 'estoque') or public.team_has_tab(owner_id, 'compras'))
  with check (public.team_has_tab(owner_id, 'estoque') or public.team_has_tab(owner_id, 'compras'));
drop policy if exists "Equipe: follow-up regras" on public.follow_up_rules;
create policy "Equipe: follow-up regras" on public.follow_up_rules for all
  using (public.team_has_tab(owner_id, 'follow_up')) with check (public.team_has_tab(owner_id, 'follow_up'));
drop policy if exists "Equipe: follow-up config" on public.follow_up_config;
create policy "Equipe: follow-up config" on public.follow_up_config for all
  using (public.team_has_tab(owner_id, 'follow_up')) with check (public.team_has_tab(owner_id, 'follow_up'));
drop policy if exists "Equipe: follow-up historico" on public.follow_up_log;
create policy "Equipe: follow-up historico" on public.follow_up_log for select using (public.team_has_tab(owner_id, 'follow_up'));
```

### Edge Function `team`
Crie a função `team` com `supabase/functions/team/index.ts`, **JWT ligado**.
Atualize também `send-message` e `orders` (passam a aceitar funcionários da loja).

O funcionário entra com **usuário e senha** na mesma tela de login (o campo aceita e-mail ou usuário).

## 34. Dashboard também é liberado pelo admin

Todas as abas, inclusive o **Dashboard**, agora são liberadas ou não (Painel Admin para a loja; Equipe para os funcionários).
Ao entrar, a pessoa cai na **primeira aba liberada**. Para ninguém perder o Dashboard que já tinha, rode uma vez no **SQL Editor**:

```sql
update public.profiles
set allowed_tabs = array_prepend('dashboard', allowed_tabs)
where allowed_tabs is not null and cardinality(allowed_tabs) > 0 and not ('dashboard' = any(allowed_tabs));

update public.team_members
set allowed_tabs = array_prepend('dashboard', allowed_tabs)
where not ('dashboard' = any(allowed_tabs));
```

Atualize também a função **`team`** (passa a aceitar o Dashboard como aba do funcionário).

## 35. Garçom: comanda, pedido e conta no salão

Na aba **Mesas**, cada mesa tem **+ Abrir comanda** (nome e telefone obrigatórios), **Lançar pedido** (vai para a Cozinha),
**Conta** (por pessoa) e **Fechar conta da mesa**: taxa de serviço e couvert opcionais, forma de pagamento
(Pix, crédito, débito, dinheiro com troco). Ao fechar: a venda entra no Financeiro e nos Relatórios, a mesa é liberada
e o cliente recebe o agradecimento no WhatsApp.

Atualize a função **`orders`** (novas ações `mesa_conta` e `mesa_fechar`). Não há SQL novo.

## 36. Mesas: garçom cria, só o gerente exclui

No **SQL Editor**:

```sql
create or replace function public.team_is_gerente(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m
                 where m.user_id = auth.uid() and m.owner_id = owner and m.ativo and m.funcao = 'gerente');
$$;

drop policy if exists "Equipe: edita mesas" on public.restaurant_tables;
drop policy if exists "Equipe: cria mesas" on public.restaurant_tables;
drop policy if exists "Equipe: atualiza mesas" on public.restaurant_tables;
drop policy if exists "Equipe: exclui mesas" on public.restaurant_tables;
create policy "Equipe: cria mesas" on public.restaurant_tables for insert
  with check (public.team_has_tab(owner_id, 'mesas'));
create policy "Equipe: atualiza mesas" on public.restaurant_tables for update
  using (public.team_has_tab(owner_id, 'mesas'));
create policy "Equipe: exclui mesas" on public.restaurant_tables for delete
  using (public.team_has_tab(owner_id, 'mesas') and public.team_is_gerente(owner_id));
```

Garçom/atendente: cria mesa (digitando só o número, ex.: 17) e já abre a comanda. Excluir mesa e QR Codes: dono e gerente.
A exclusão é bloqueada se a mesa tiver comanda ou pedido em aberto.

## 37. Exemplo do nicho para lojas novas

Ao escolher o nicho em **Configurações** (Restaurante ou Materiais de construção), a Lumos oferece carregar o
**cardápio/catálogo de exemplo** como produtos normais da loja (com fotos, categorias e descrições; no restaurante,
também as mesas 1 a 12). Vem marcado quando a loja ainda não tem produtos e nunca duplica o que já existe.
Em **Produtos**, uma loja sem nenhum produto também vê o botão para carregar o exemplo.
Não há SQL nem função para atualizar.

## 38. Garçom lança o pedido pelo mesmo cardápio do cliente

Na aba **Mesas**, "Lançar pedido" abre o **cardápio digital** (o mesmo que o cliente usa pelo QR Code), já ligado à
comanda. Ao confirmar, o pedido vai para a Cozinha, a janela fecha e a mesa atualiza. Pedido lançado pelo garçom
**não** manda mensagem no WhatsApp do cliente. O botão "Lista rápida" abre o formulário simples.
O cardápio passou a mostrar os produtos de restaurante da casa, não importa por qual agente o cliente chegou.

Atualize a função **`menu`**. Não há SQL novo.

## 39. Histórico de ações (auditoria) e proteção contra cobrança em dobro

Registro imutável de tudo o que acontece com clientes, comandas, mesas, pedidos, itens e contas: data, hora,
quem fez (dono, funcionário, equipe Lumos ou sistema) e por onde (WhatsApp, cardápio do cliente, cardápio do garçom,
garçom ou painel). Ninguém altera nem apaga pelo sistema (só os gatilhos do banco gravam). Se o histórico falhar,
a operação principal continua normalmente. Na aba **Mesas**, o dono vê o botão **Histórico** em cada cliente.

**Ordem:** rode este SQL **antes** de atualizar as funções `whatsapp-webhook`, `menu` e `orders`.

```sql
-- =====================================================================
-- Histórico de ações (auditoria): registro imutável, com data, hora, quem fez e por onde
-- =====================================================================

-- De onde veio cada pedido e quem lançou
alter table public.orders add column if not exists origem text;       -- whatsapp | cardapio_cliente | cardapio_garcom | garcom | painel
alter table public.orders add column if not exists criado_por uuid;   -- quem lançou (quando foi alguém logado)

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  ocorrido_em timestamptz not null default now(),
  autor_id uuid,
  autor_tipo text,          -- dono | funcionario | equipe_lumos | sistema
  autor_nome text,
  entidade text not null,   -- cliente | mesa | comanda | pedido | item | conta
  entidade_id text,
  acao text not null,
  lead_id uuid,
  table_session_id uuid,
  resumo text,
  antes jsonb,
  depois jsonb
);
create index if not exists audit_log_owner_idx on public.audit_log (owner_id, ocorrido_em desc);
create index if not exists audit_log_lead_idx on public.audit_log (lead_id, ocorrido_em desc);
create index if not exists audit_log_sessao_idx on public.audit_log (table_session_id, ocorrido_em desc);
alter table public.audit_log enable row level security;
drop policy if exists "Dono ve o historico" on public.audit_log;
create policy "Dono ve o historico" on public.audit_log for select using (auth.uid() = owner_id);
-- Sem políticas de insert/update/delete: ninguém altera nem apaga pelo sistema (só os gatilhos gravam)

-- Quem fez a ação
create or replace function public.audit_autor(p_owner uuid, p_fallback uuid default null)
returns table (autor_id uuid, autor_tipo text, autor_nome text)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := coalesce(auth.uid(), p_fallback); v_nome text; v_role text;
begin
  if v_uid is null then
    return query select null::uuid, 'sistema'::text, 'Sistema automático'::text; return;
  end if;
  select m.nome into v_nome from public.team_members m where m.user_id = v_uid;
  if v_nome is not null then return query select v_uid, 'funcionario'::text, v_nome; return; end if;
  if v_uid = p_owner then return query select v_uid, 'dono'::text, 'Dono da loja'::text; return; end if;
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role in ('admin', 'suporte') then return query select v_uid, 'equipe_lumos'::text, 'Equipe Lumos (suporte)'::text; return; end if;
  return query select v_uid, 'usuario'::text, 'Usuário'::text;
end; $$;

create or replace function public.audit_brl(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(coalesce(v, 0), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
$$;

create or replace function public.audit_mesa(p_session uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select t.label from public.table_sessions s join public.restaurant_tables t on t.id = s.table_id where s.id = p_session), 'Mesa');
$$;

-- Nome legível das etapas
create or replace function public.audit_etapa(v text) returns text language sql immutable as $$
  select case v when 'novo_pedido' then 'Novo pedido' when 'em_preparo' then 'Em preparo' when 'pronto' then 'Pronto'
    when 'saiu_entrega' then 'Saiu para entrega' when 'entregue' then 'Entregue' when 'cancelado' then 'Cancelado'
    when 'ativa' then 'aberta' when 'fechada' then 'fechada' when 'aguardando_pagamento' then 'aguardando pagamento'
    when 'aguardando_aprovacao' then 'aguardando aprovação' when 'pago' then 'paga' else coalesce(v, '?') end;
$$;

-- Grava uma linha no histórico (nunca bloqueia a operação principal)
create or replace function public.audit_registrar(p_owner uuid, p_fallback uuid, p_entidade text, p_id text, p_acao text,
  p_lead uuid, p_sessao uuid, p_resumo text, p_antes jsonb, p_depois jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.audit_autor(p_owner, p_fallback);
  insert into public.audit_log (owner_id, autor_id, autor_tipo, autor_nome, entidade, entidade_id, acao, lead_id, table_session_id, resumo, antes, depois)
  values (p_owner, a.autor_id, a.autor_tipo, a.autor_nome, p_entidade, p_id, p_acao, p_lead, p_sessao, p_resumo, p_antes, p_depois);
exception when others then
  raise warning 'auditoria: %', sqlerrm;
end; $$;

-- ---------- Pedidos (cozinha) ----------
create or replace function public.audit_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_origem text;
begin
  if tg_op = 'INSERT' then
    v_origem := case coalesce(new.origem, '') when 'whatsapp' then 'pelo WhatsApp (IA)' when 'cardapio_cliente' then 'pelo cardápio digital (cliente)'
      when 'cardapio_garcom' then 'pelo cardápio (garçom)' when 'garcom' then 'pelo garçom' when 'painel' then 'pelo painel' else '' end;
    perform public.audit_registrar(new.owner_id, new.criado_por, 'pedido', new.id::text, 'pedido_criado', new.lead_id, new.table_session_id,
      format('Pedido #%s lançado %s, %s', coalesce(new.numero::text, '?'), v_origem, public.audit_mesa(new.table_session_id)), null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.audit_registrar(new.owner_id, null, 'pedido', new.id::text, 'status_alterado', new.lead_id, new.table_session_id,
        format('Pedido #%s: de "%s" para "%s"', coalesce(new.numero::text, '?'), public.audit_etapa(old.status), public.audit_etapa(new.status)), jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
    end if;
    if new.sales_order_id is distinct from old.sales_order_id then
      perform public.audit_registrar(new.owner_id, null, 'pedido', new.id::text, case when new.sales_order_id is null then 'retirado_da_conta' else 'incluido_na_conta' end,
        new.lead_id, new.table_session_id,
        format('Pedido #%s %s', coalesce(new.numero::text, '?'), case when new.sales_order_id is null then 'voltou a ficar em aberto' else 'incluído na conta paga' end),
        jsonb_build_object('sales_order_id', old.sales_order_id), jsonb_build_object('sales_order_id', new.sales_order_id));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.audit_registrar(old.owner_id, null, 'pedido', old.id::text, 'pedido_excluido', old.lead_id, old.table_session_id,
      format('Pedido #%s excluído (%s)', coalesce(old.numero::text, '?'), public.audit_brl(old.total)), to_jsonb(old), null);
    return old;
  end if;
  return new;
exception when others then raise warning 'auditoria pedidos: %', sqlerrm; return coalesce(new, old);
end; $$;

-- Quem lançou: preenchido sozinho quando é alguém logado
create or replace function public.orders_set_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.criado_por := coalesce(new.criado_por, auth.uid());
  -- Lançado por alguém logado no painel: garçom/funcionário ou o próprio dono
  if new.origem is null and auth.uid() is not null then
    new.origem := case when exists (select 1 from public.team_members m where m.user_id = auth.uid()) then 'garcom' else 'painel' end;
  end if;
  return new;
end; $$;

drop trigger if exists orders_set_autor on public.orders;
create trigger orders_set_autor before insert on public.orders for each row execute procedure public.orders_set_autor();
drop trigger if exists audit_orders on public.orders;
create trigger audit_orders after insert or update or delete on public.orders for each row execute procedure public.audit_orders();

-- ---------- Itens dos pedidos ----------
create or replace function public.audit_order_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record; r record;
begin
  r := coalesce(new, old);
  select owner_id, lead_id, table_session_id, numero, criado_por into o from public.orders where id = r.order_id;
  if o.owner_id is null then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    perform public.audit_registrar(o.owner_id, o.criado_por, 'item', new.id::text, 'item_adicionado', o.lead_id, o.table_session_id,
      format('Pedido #%s: %sx %s (%s cada)%s', coalesce(o.numero::text, '?'), new.quantity, new.product_name, public.audit_brl(new.unit_price),
        case when coalesce(new.observacao, '') <> '' then ', obs.: ' || new.observacao else '' end), null, to_jsonb(new));
  elsif tg_op = 'UPDATE' and (new.quantity is distinct from old.quantity or new.unit_price is distinct from old.unit_price) then
    perform public.audit_registrar(o.owner_id, null, 'item', new.id::text, 'item_alterado', o.lead_id, o.table_session_id,
      format('Pedido #%s: %s alterado de %sx %s para %sx %s', coalesce(o.numero::text, '?'), new.product_name, old.quantity, public.audit_brl(old.unit_price), new.quantity, public.audit_brl(new.unit_price)),
      to_jsonb(old), to_jsonb(new));
  elsif tg_op = 'DELETE' then
    perform public.audit_registrar(o.owner_id, null, 'item', old.id::text, 'item_removido', o.lead_id, o.table_session_id,
      format('Pedido #%s: removido %sx %s', coalesce(o.numero::text, '?'), old.quantity, old.product_name), to_jsonb(old), null);
  end if;
  return coalesce(new, old);
exception when others then raise warning 'auditoria itens: %', sqlerrm; return coalesce(new, old);
end; $$;
drop trigger if exists audit_order_items on public.order_items;
create trigger audit_order_items after insert or update or delete on public.order_items for each row execute procedure public.audit_order_items();

-- ---------- Contas e pagamentos ----------
create or replace function public.audit_sales_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reg uuid; v_metodo text;
begin
  if tg_op = 'INSERT' then
    v_reg := nullif(new.pagamento ->> 'registrado_por', '')::uuid;
    v_metodo := coalesce(new.pagamento ->> 'metodo', '');
    perform public.audit_registrar(new.owner_id, v_reg, 'conta', new.id::text, case when new.status = 'pago' then 'conta_paga' else 'pedido_de_venda_criado' end,
      new.lead_id, new.table_session_id,
      case when new.status = 'pago'
        then format('Conta #%s paga: %s (%s)%s', new.numero, public.audit_brl(new.total), coalesce(nullif(v_metodo, ''), 'forma não informada'),
               case when new.entrega ->> 'tipo' = 'mesa' then ', ' || coalesce(new.entrega ->> 'local', 'mesa') else '' end)
        else format('Pedido de venda #%s criado: %s (%s)', new.numero, public.audit_brl(new.total), new.status) end,
      null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status or new.total is distinct from old.total then
      perform public.audit_registrar(new.owner_id, null, 'conta', new.id::text, 'conta_alterada', new.lead_id, new.table_session_id,
        format('Venda #%s: %s (%s) para %s (%s)', new.numero, public.audit_etapa(old.status), public.audit_brl(old.total), public.audit_etapa(new.status), public.audit_brl(new.total)),
        jsonb_build_object('status', old.status, 'total', old.total, 'pagamento', old.pagamento),
        jsonb_build_object('status', new.status, 'total', new.total, 'pagamento', new.pagamento));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.audit_registrar(old.owner_id, null, 'conta', old.id::text, 'conta_excluida', old.lead_id, old.table_session_id,
      format('Venda #%s excluída (%s, %s)', old.numero, public.audit_brl(old.total), old.status), to_jsonb(old), null);
    return old;
  end if;
  return new;
exception when others then raise warning 'auditoria contas: %', sqlerrm; return coalesce(new, old);
end; $$;
drop trigger if exists audit_sales_orders on public.sales_orders;
create trigger audit_sales_orders after insert or update or delete on public.sales_orders for each row execute procedure public.audit_sales_orders();

-- ---------- Mesas (abertura e fechamento) ----------
create or replace function public.audit_table_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_registrar(new.owner_id, null, 'mesa', new.id::text, 'mesa_aberta', null, new.id,
      format('%s aberta', public.audit_mesa(new.id)), null, to_jsonb(new));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.audit_registrar(new.owner_id, null, 'mesa', new.id::text, 'mesa_' || new.status, null, new.id,
      format('%s %s', public.audit_mesa(new.id), public.audit_etapa(new.status)), jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
exception when others then raise warning 'auditoria mesas: %', sqlerrm; return new;
end; $$;
drop trigger if exists audit_table_sessions on public.table_sessions;
create trigger audit_table_sessions after insert or update on public.table_sessions for each row execute procedure public.audit_table_sessions();

-- ---------- Cliente entrando e saindo da mesa (comanda) ----------
create or replace function public.audit_leads_mesa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.table_session_id is distinct from old.table_session_id then
    if new.table_session_id is not null then
      perform public.audit_registrar(new.owner_id, null, 'comanda', new.id::text, 'comanda_aberta', new.id, new.table_session_id,
        format('Comanda aberta para %s (%s) na %s', coalesce(new.dados_cliente ->> 'nome', new.name, 'cliente'), coalesce(new.phone, 'sem telefone'), public.audit_mesa(new.table_session_id)),
        null, jsonb_build_object('nome', coalesce(new.dados_cliente ->> 'nome', new.name), 'telefone', new.phone));
    else
      perform public.audit_registrar(new.owner_id, null, 'comanda', new.id::text, 'comanda_encerrada', new.id, old.table_session_id,
        format('Comanda de %s encerrada (%s)', coalesce(new.dados_cliente ->> 'nome', new.name, 'cliente'), public.audit_mesa(old.table_session_id)), null, null);
    end if;
  end if;
  return new;
exception when others then raise warning 'auditoria comanda: %', sqlerrm; return new;
end; $$;
drop trigger if exists audit_leads_mesa on public.leads;
create trigger audit_leads_mesa after update on public.leads for each row execute procedure public.audit_leads_mesa();

create or replace function public.audit_leads_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_registrar(new.owner_id, null, 'cliente', new.id::text, 'cliente_cadastrado', new.id, new.table_session_id,
    format('Cliente cadastrado: %s (%s)%s', coalesce(new.dados_cliente ->> 'nome', new.name, 'sem nome'), coalesce(new.phone, 'sem telefone'),
      case when new.table_session_id is not null then ', comanda aberta na ' || public.audit_mesa(new.table_session_id) else '' end),
    null, jsonb_build_object('nome', coalesce(new.dados_cliente ->> 'nome', new.name), 'telefone', new.phone));
  return new;
exception when others then raise warning 'auditoria cliente: %', sqlerrm; return new;
end; $$;
drop trigger if exists audit_leads_novo on public.leads;
create trigger audit_leads_novo after insert on public.leads for each row execute procedure public.audit_leads_novo();
```

## 40. Limite de funcionários e equipe de cada cliente no Painel Admin

Em **Gerenciar conta**, a seção **Equipe do estabelecimento** mostra os funcionários do cliente (nome, usuário,
função, situação e último acesso) e o campo **Limite de funcionários** (vazio = sem limite; só administradores mudam).
Atualize a função **`admin`**. Não há SQL novo (a coluna `limite_equipe` veio na seção 33).

## 41. Pagamento presencial, conta levada pelo atendente e janelas do Lumos

- **Pagamento presencial** (Integrações → Pagamento → "Presencial: na loja ou na entrega"): sem link. Ao aprovar,
  o cliente recebe o resumo com "pagamento na entrega/na retirada" e as formas aceitas; o vendedor clica em
  "Confirmar pagamento recebido" quando receber. A IA não promete link nem pede dados de cartão.
- **Restaurante: quando o cliente pede a conta** (Integrações → Restaurante e bar): "Enviar a conta com o link" ou
  "Avisar que o atendente vai levar a conta". No segundo modo, o cliente fica destacado como "Pediu a conta" na
  aba Mesas e o responsável (telefone das Regras de venda) recebe um aviso no WhatsApp.
- Avisos e confirmações agora usam janelas próprias do Lumos (sem "site.com diz...").

Atualize as funções **`orders`** e **`whatsapp-webhook`**. Não há SQL novo.

## 42. Sem travessões no sistema

As telas, as mensagens automáticas e as descrições geradas pelo sistema não usam mais travessão; a IA foi orientada a
não usar, e qualquer travessão que ela escreva vira vírgula antes de ir para o WhatsApp.
Para corrigir o que já estava gravado, rode uma vez no **SQL Editor**:

```sql
update public.fin_lancamentos set descricao = replace(descricao, ' — ', ', ') where descricao like '%—%';
update public.estoque_mov set motivo = replace(motivo, ' — ', ', ') where motivo like '%—%';
update public.products set name = replace(name, 'Drink da Casa — Luz Vermelha', 'Drink da Casa (Luz Vermelha)') where name like '%—%';
update public.agents set name = replace(name, 'Simulador — ', 'Simulador: ') where name like 'Simulador — %';
update public.sales_orders set itens = replace(itens::text, ' — ', ', ')::jsonb where itens::text like '%—%';
```

Atualize as funções **`whatsapp-webhook`**, **`orders`**, **`follow-up`** e **`menu`**.

## 43. Contabilidade: cálculo de impostos, cadastro fiscal e fechamento para o contador

No **SQL Editor**:

```sql
-- Configuração fiscal da empresa (regime, CNPJ, UF, RBT12, tratamento da taxa de serviço etc.)
create table if not exists public.fiscal_config (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.fiscal_config enable row level security;
drop policy if exists "Dono: configuracao fiscal" on public.fiscal_config;
create policy "Dono: configuracao fiscal" on public.fiscal_config for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Equipe: configuracao fiscal" on public.fiscal_config;
create policy "Equipe: configuracao fiscal" on public.fiscal_config for all
  using (public.team_has_tab(owner_id, 'contabilidade')) with check (public.team_has_tab(owner_id, 'contabilidade'));

-- Cadastro fiscal de cada produto (separado do produto: quem cuida do fiscal não mexe em preço)
create table if not exists public.product_fiscal (
  product_id uuid primary key references public.products(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade not null,
  ncm text, cest text, cfop text, origem text default '0',
  tipo text default 'revenda',            -- revenda | producao
  csosn text, cst_icms text, icms_aliq numeric(6,2),
  icms_st boolean default false, monofasico boolean default false,
  cst_pis text, cclass_trib text,
  extra jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.product_fiscal enable row level security;
drop policy if exists "Dono: fiscal dos produtos" on public.product_fiscal;
create policy "Dono: fiscal dos produtos" on public.product_fiscal for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Equipe: le fiscal dos produtos" on public.product_fiscal;
create policy "Equipe: le fiscal dos produtos" on public.product_fiscal for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita fiscal dos produtos" on public.product_fiscal;
create policy "Equipe: edita fiscal dos produtos" on public.product_fiscal for all
  using (public.team_has_tab(owner_id, 'contabilidade') or public.team_has_tab(owner_id, 'produtos'))
  with check (public.team_has_tab(owner_id, 'contabilidade') or public.team_has_tab(owner_id, 'produtos'));

-- Quem tem a aba Contabilidade (ex.: o contador) LÊ financeiro, compras, fornecedores e estoque
drop policy if exists "Equipe contabilidade: le financeiro" on public.fin_lancamentos;
create policy "Equipe contabilidade: le financeiro" on public.fin_lancamentos for select using (public.team_has_tab(owner_id, 'contabilidade'));
drop policy if exists "Equipe contabilidade: le compras" on public.compras;
create policy "Equipe contabilidade: le compras" on public.compras for select using (public.team_has_tab(owner_id, 'contabilidade'));
drop policy if exists "Equipe contabilidade: le fornecedores" on public.fornecedores;
create policy "Equipe contabilidade: le fornecedores" on public.fornecedores for select using (public.team_has_tab(owner_id, 'contabilidade'));
drop policy if exists "Equipe contabilidade: le estoque" on public.estoque_mov;
create policy "Equipe contabilidade: le estoque" on public.estoque_mov for select using (public.team_has_tab(owner_id, 'contabilidade'));

-- Fotografia fiscal da venda: no momento do pagamento, guarda o cadastro fiscal de cada produto vendido.
-- Assim, se o NCM de um produto mudar depois, o relatório dos meses passados não muda.
alter table public.sales_orders add column if not exists fiscal jsonb;

create or replace function public.sales_orders_fiscal_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' and new.fiscal is null then
    begin
      select coalesce(jsonb_object_agg(pf.product_id::text, to_jsonb(pf) - 'owner_id' - 'updated_at'), '{}'::jsonb)
        into new.fiscal
        from public.product_fiscal pf
       where pf.owner_id = new.owner_id
         and pf.product_id in (
           select (i->>'product_id')::uuid from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) i
            where coalesce(i->>'product_id', '') ~ '^[0-9a-f-]{36}$');
    exception when others then
      new.fiscal := null;   -- nunca trava a venda
    end;
  end if;
  return new;
end $$;
drop trigger if exists trg_sales_orders_fiscal on public.sales_orders;
create trigger trg_sales_orders_fiscal before insert or update on public.sales_orders
  for each row execute function public.sales_orders_fiscal_snapshot();
```

Depois, atualize a Edge Function **`team`** (cole de novo `supabase/functions/team/index.ts`): ela passa a aceitar a aba
`contabilidade` e a função **Contador**.

### Como funciona
- Todas as regras e alíquotas ficam num arquivo só: `js/tributos.js` (Simples Nacional Anexo I com segregação de
  monofásico e ICMS-ST, Lucro Presumido com a LC 224/2025, Lucro Real, MEI, regime especial de ICMS de SP para
  restaurantes, IBS/CBS da reforma). Revisar esse arquivo todo ano (`VERSAO_REGRAS`).
- A aba **Contabilidade** tem três partes: Fechamento do mês (com Excel para o contador e impressão em PDF),
  Cadastro fiscal dos produtos (NCM, CFOP, CSOSN/CST, monofásico, ICMS-ST, CEST) e Configuração fiscal.
- Quando a venda é paga, o banco guarda a "fotografia fiscal" dos produtos (`sales_orders.fiscal`). Assim, mudar o
  NCM de um produto depois não altera os meses já fechados.
- Clientes que já têm abas liberadas pelo Painel Admin precisam receber a aba **Contabilidade** lá.

## 44. Ficha técnica com baixa automática de insumos (CMV real por prato)

No **SQL Editor**:

```sql
-- Insumos: produtos que não são vendidos (carne crua, pão, queijo, embalagem). Não aparecem no cardápio nem para a IA.
alter table public.products add column if not exists is_insumo boolean not null default false;
-- Mais unidades para insumos
alter table public.products drop constraint if exists products_unit_check;
alter table public.products add constraint products_unit_check
  check (unit in ('unidade','litro','m2','metro','kg','saco','caixa','rolo','pacote','fardo','duzia'));

-- Ficha técnica: quanto de cada insumo vai em 1 unidade do prato
create table if not exists public.product_recipes (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,   -- o prato
  insumo_id uuid references public.products(id) on delete cascade not null,    -- o insumo
  quantidade numeric(14,4) not null check (quantidade > 0),                   -- na unidade do insumo
  perda_pct numeric(6,2) not null default 0 check (perda_pct >= 0 and perda_pct < 100), -- perda no preparo
  created_at timestamptz default now(),
  unique (product_id, insumo_id)
);
alter table public.product_recipes enable row level security;
drop policy if exists "Dono: fichas tecnicas" on public.product_recipes;
create policy "Dono: fichas tecnicas" on public.product_recipes for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Equipe: le fichas tecnicas" on public.product_recipes;
create policy "Equipe: le fichas tecnicas" on public.product_recipes for select using (public.is_team_of(owner_id));
drop policy if exists "Equipe: edita fichas tecnicas" on public.product_recipes;
create policy "Equipe: edita fichas tecnicas" on public.product_recipes for all
  using (public.team_has_tab(owner_id, 'ficha_tecnica')) with check (public.team_has_tab(owner_id, 'ficha_tecnica'));
-- Quem tem a aba Ficha técnica cadastra e edita insumos
drop policy if exists "Equipe: cria insumos" on public.products;
create policy "Equipe: cria insumos" on public.products for insert
  with check (is_insumo and public.team_has_tab(owner_id, 'ficha_tecnica'));
drop policy if exists "Equipe: edita insumos" on public.products;
create policy "Equipe: edita insumos" on public.products for update
  using (public.team_has_tab(owner_id, 'ficha_tecnica'));

-- Custo do prato = soma dos insumos (com a perda). Recalcula sozinho quando a ficha ou o custo do insumo muda.
create or replace function public.recalc_custo_prato(p_prato uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v numeric; n int;
begin
  select count(*), sum(r.quantidade / (1 - r.perda_pct / 100) * coalesce(i.custo, 0))
    into n, v
    from public.product_recipes r join public.products i on i.id = r.insumo_id
   where r.product_id = p_prato;
  if n > 0 then
    update public.products set custo = round(v, 2) where id = p_prato and custo is distinct from round(v, 2);
  end if;
exception when others then null;   -- nunca trava a operação principal
end $$;

create or replace function public.trg_recipes_custo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_custo_prato(coalesce(new.product_id, old.product_id));
  if tg_op = 'UPDATE' and new.product_id <> old.product_id then perform public.recalc_custo_prato(old.product_id); end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists trg_recipes_custo on public.product_recipes;
create trigger trg_recipes_custo after insert or update or delete on public.product_recipes
  for each row execute function public.trg_recipes_custo();

create or replace function public.trg_insumo_custo() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.custo is distinct from old.custo then
    for r in select distinct product_id from public.product_recipes where insumo_id = new.id loop
      perform public.recalc_custo_prato(r.product_id);
    end loop;
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists trg_insumo_custo on public.products;
create trigger trg_insumo_custo after update of custo on public.products
  for each row execute function public.trg_insumo_custo();
```

Depois, atualize as Edge Functions **na ordem**: `orders` (baixa dos insumos na venda), `menu` e `whatsapp-webhook`
(insumos não aparecem no cardápio nem para a IA) e `team` (aceita a aba `ficha_tecnica`).

### Como funciona
- **Insumos** são produtos marcados como `is_insumo` (carne, pão, queijo): ficam no Estoque, nas Compras e na Ficha
  técnica, mas nunca no cardápio, no garçom ou na IA.
- A **ficha técnica** diz quanto de cada insumo vai em 1 porção pronta, com a perda do preparo. Quando a venda é paga,
  a função `orders` baixa do estoque a quantidade bruta de cada insumo (porção / (1 - perda)).
- O **custo do prato** é recalculado pelo banco sempre que a ficha muda ou o custo de um insumo muda (por exemplo, ao
  receber uma compra). Relatórios, Contabilidade e CMV usam esse custo automaticamente.
- Produto sem ficha (bebida, item de revenda) continua com a baixa do próprio estoque, como antes.

## 45. NFC-e conectada ao emissor (Focus NFe) e Caixa

No **SQL Editor**:

```sql
-- Notas fiscais emitidas (NFC-e) pelo emissor conectado. Só a função "fiscal" grava aqui.
create table if not exists public.fiscal_docs (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  modelo text not null default 'nfce',
  ambiente text not null default 'homologacao',      -- homologacao | producao
  ref text not null unique,                          -- referência enviada ao emissor
  status text not null default 'processando',        -- processando | autorizado | erro | cancelado
  numero text, serie text, chave text,
  valor numeric(12,2),
  mensagem text,                                     -- retorno da Sefaz/emissor (erro ou motivo)
  xml_url text, danfe_url text, qrcode_url text,
  teste boolean not null default false,
  resposta jsonb,
  emitido_por uuid,
  cancelado_em timestamptz, cancelamento_motivo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists fiscal_docs_owner_data on public.fiscal_docs (owner_id, created_at desc);
create index if not exists fiscal_docs_venda on public.fiscal_docs (sales_order_id);
alter table public.fiscal_docs enable row level security;
drop policy if exists "Dono: notas fiscais" on public.fiscal_docs;
create policy "Dono: notas fiscais" on public.fiscal_docs for select using (auth.uid() = owner_id);
drop policy if exists "Equipe: notas fiscais" on public.fiscal_docs;
create policy "Equipe: notas fiscais" on public.fiscal_docs for select
  using (public.team_has_tab(owner_id, 'fiscal') or public.team_has_tab(owner_id, 'contabilidade') or public.team_has_tab(owner_id, 'caixa'));

-- Caixa: abertura, sangria/suprimento e fechamento com conferência por forma de pagamento
create table if not exists public.caixas (
  id uuid default gen_random_uuid() primary key,
  numero bigint generated by default as identity,
  owner_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  aberto_em timestamptz not null default now(),
  aberto_por uuid, aberto_por_nome text,
  valor_inicial numeric(12,2) not null default 0 check (valor_inicial >= 0),
  fechado_em timestamptz, fechado_por uuid, fechado_por_nome text,
  esperado jsonb,           -- o que o sistema calculou por forma de pagamento
  contado jsonb,            -- o que o operador contou/conferiu
  diferenca numeric(12,2),  -- contado - esperado (total)
  observacao text,
  created_at timestamptz default now()
);
-- Só um caixa aberto por estabelecimento
create unique index if not exists caixas_um_aberto on public.caixas (owner_id) where status = 'aberto';
alter table public.caixas enable row level security;
drop policy if exists "Dono: caixas" on public.caixas;
create policy "Dono: caixas" on public.caixas for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Equipe: caixas" on public.caixas;
create policy "Equipe: caixas" on public.caixas for all
  using (public.team_has_tab(owner_id, 'caixa')) with check (public.team_has_tab(owner_id, 'caixa'));

create table if not exists public.caixa_movs (
  id uuid default gen_random_uuid() primary key,
  caixa_id uuid references public.caixas(id) on delete cascade not null,
  owner_id uuid references auth.users(id) on delete cascade not null,
  tipo text not null check (tipo in ('sangria','suprimento')),
  valor numeric(12,2) not null check (valor > 0),
  motivo text,
  por uuid, por_nome text,
  created_at timestamptz default now()
);
alter table public.caixa_movs enable row level security;
drop policy if exists "Dono: movimentos do caixa" on public.caixa_movs;
create policy "Dono: movimentos do caixa" on public.caixa_movs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Equipe: movimentos do caixa" on public.caixa_movs;
create policy "Equipe: movimentos do caixa" on public.caixa_movs for all
  using (public.team_has_tab(owner_id, 'caixa')) with check (public.team_has_tab(owner_id, 'caixa'));

-- Caixa fechado não muda mais (nem o dono): fica como registro
create or replace function public.caixa_imutavel() returns trigger
language plpgsql as $$
begin
  if old.status = 'fechado' then raise exception 'Caixa já fechado não pode ser alterado.'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_caixa_imutavel on public.caixas;
create trigger trg_caixa_imutavel before update or delete on public.caixas
  for each row execute function public.caixa_imutavel();
create or replace function public.caixa_mov_aberto() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.caixas c where c.id = coalesce(new.caixa_id, old.caixa_id) and c.status = 'aberto') then
    raise exception 'Este caixa já foi fechado.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_caixa_mov_aberto on public.caixa_movs;
create trigger trg_caixa_mov_aberto before insert or update or delete on public.caixa_movs
  for each row execute function public.caixa_mov_aberto();
```

### Edge Functions
1. Crie a função **`fiscal`** (nova) com `supabase/functions/fiscal/index.ts`, **"Enforce JWT verification" LIGADO**.
2. Atualize **`orders`** (emite a NFC-e sozinha depois do pagamento) e **`team`** (abas `caixa` e `fiscal`).

### Secret da conta Lumos no emissor (opcional, mas é o que permite o "preencher e conectar")
Em **Edge Functions → Secrets**, crie `FOCUS_TOKEN_CONTA` com o **token principal da conta Lumos no Focus NFe**
(no painel do Focus: Minha conta → Token de acesso). Com ele, a tela de Notas fiscais cadastra a empresa do cliente
no emissor com o certificado e o CSC. Sem ele, só funciona a opção "A loja já tem conta no Focus NFe" (colar o token).

### Como funciona
- **Notas fiscais**: assistente em 5 passos (modo de conexão, dados da empresa, certificado A1, CSC, como emitir).
  "Conferir dados" valida tudo e pede ao emissor uma simulação (certificado, senha, validade e CNPJ) sem gravar nada.
  "Conectar API" cadastra a empresa, recebe os tokens, testa a conexão e liga a emissão.
- O certificado e a senha **não ficam guardados no Lumos**: vão direto para o emissor. O Lumos guarda só os tokens
  de emissão (na coluna `secrets`, nunca mostrada na tela) e os dados públicos (CNPJ, validade do certificado).
- Comece em **homologação** (notas de teste, sem valor fiscal) e use "Emitir nota de teste". Depois, "Passar para produção".
- Com "emitir automaticamente", toda venda paga (mesa, delivery, retirada, WhatsApp) recebe a NFC-e e o cliente
  recebe o link do cupom no WhatsApp. Se a nota falhar, a venda não trava: a nota aparece com erro e o botão "Tentar de novo".
- **Caixa**: abertura com fundo de troco, sangria, suprimento e fechamento conferindo cada forma de pagamento,
  com relatório para imprimir. Caixa fechado não pode mais ser alterado.

## 46. Kanban automático do restaurante, Ajuda e Simulação nas páginas

No **SQL Editor**:

```sql
-- Kanban do restaurante: o card anda sozinho conforme o que acontece de verdade
-- 1) Pedido criado (pelo celular do cliente, pelo cardápio ou lançado pelo garçom) -> "Pedido feito" (etapa conversando)
create or replace function public.kanban_pedido_feito() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    update public.leads set stage = 'conversando'
     where id = new.lead_id and stage in ('novo_contato', 'follow_up');
  end if;
  return null;
exception when others then return null;   -- nunca trava o pedido
end $$;
drop trigger if exists trg_kanban_pedido_feito on public.orders;
create trigger trg_kanban_pedido_feito after insert on public.orders
  for each row execute function public.kanban_pedido_feito();

-- 2) Cliente pediu a conta pelo celular -> "Aguardando pagamento" (etapa aguardando_link)
create or replace function public.kanban_pediu_conta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.visit_status = 'aguardando_pagamento' and old.visit_status is distinct from 'aguardando_pagamento'
       and coalesce(new.stage, '') not in ('fechado', 'perdido') then
      new.stage := 'aguardando_link';
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_kanban_pediu_conta on public.leads;
create trigger trg_kanban_pediu_conta before update of visit_status on public.leads
  for each row execute function public.kanban_pediu_conta();
```

Depois, atualize a Edge Function **`whatsapp-webhook`** (no restaurante, informar a mesa não move mais o card;
só um pedido de verdade move para "Pedido feito").

### Como funciona
- Em **Configurações → Tipo de negócio**, escolher **Restaurante e bar** e salvar esconde Follow-up e Leads e deixa o
  Kanban com as colunas do salão: Novo contato, Pedido feito, Aguardando pagamento e Fechado.
- O card anda sozinho: pedido criado (celular, cardápio ou garçom) vai para **Pedido feito**; cliente pede a conta
  pelo celular vai para **Aguardando pagamento**; conta paga vai para **Fechado**.
- **Ajuda** (canto inferior direito) nas páginas de conexão: lista do que a loja precisa passar, com "Copiar lista"
  e "Enviar no WhatsApp".
- **Simular** (só administrador e suporte): apresentação guiada com dados fictícios montados só na tela. Nada é
  gravado no banco. Todas as abas têm simulação.
- **Contabilidade → "O que é cada imposto?"**: explicação simples de cada tributo do regime da empresa, com o valor do
  mês e o porte (ME, EPP) calculado pelo faturamento. O porte é só classificação; o que muda o cálculo é o regime.
- No nicho restaurante, Agendamentos aparece como **Reservas** e o Dashboard fala de contatos, clientes e reservas.

## 47. Clientes do restaurante (visitas, sumidos e autorização para promoções)

No **SQL Editor**:

```sql
-- Clientes do restaurante: autorização para receber promoções (base para campanhas, LGPD)
-- null = ainda não perguntado; true = aceitou; false = não aceitou
alter table public.leads add column if not exists marketing_optin boolean;
alter table public.leads add column if not exists marketing_optin_em timestamptz;
alter table public.leads add column if not exists aniversario date;

-- Quem pediu para não receber mensagens (fu_optout) nunca aparece como "aceita promoções"
create or replace function public.leads_optin_coerente() returns trigger
language plpgsql as $$
begin
  if new.fu_optout is true and new.marketing_optin is true then
    new.marketing_optin := false;
  end if;
  if new.marketing_optin is distinct from old.marketing_optin then
    new.marketing_optin_em := now();
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists trg_leads_optin on public.leads;
create trigger trg_leads_optin before update of marketing_optin, fu_optout on public.leads
  for each row execute function public.leads_optin_coerente();
```

Nenhuma Edge Function muda.

### Como funciona
- No nicho **Restaurante e bar**, a aba Clientes mostra todo mundo que falou com a casa, com visitas (dias com conta
  paga), última visita, total gasto, ticket médio e a autorização para promoções.
- Grupos: Consumiram, Novos, Voltaram, Frequentes (3+ visitas), Sumidos (30+ dias sem vir), Só mandaram oi,
  Aniversariantes do mês e Aceitam promoções. Visão por nome (A a Z) ou por dia.
- "Baixar lista (Excel)" e "Copiar números". Para campanhas, só entra quem aceitou receber promoções (LGPD e regras
  do WhatsApp). Quem pediu para não receber mensagens nunca aparece como autorizado.

## 48. Compras: só insumos e revenda, com cadastro de insumo na hora

No **SQL Editor**:

```sql
-- Quem tem a aba Compras também pode cadastrar insumo novo direto na compra (ex.: costela, farinha)
drop policy if exists "Equipe: cria insumos" on public.products;
create policy "Equipe: cria insumos" on public.products for insert
  with check (is_insumo and (public.team_has_tab(owner_id, 'ficha_tecnica') or public.team_has_tab(owner_id, 'compras')));
```

Nenhuma Edge Function muda.

### Como funciona
- Na **Nova compra**, a lista mostra só o que se compra: **Insumos da cozinha** (costela, farinha) e **Revenda**
  (água, cerveja, vendidos como chegam). Pratos com ficha técnica ou marcados como produção própria não aparecem.
- Produtos de outro nicho (como os exemplos do simulador de materiais) não aparecem na compra nem na ficha técnica.
- "+ Novo insumo" cadastra o insumo sem sair da compra. A quantidade e o custo mostram a unidade (kg, litro, un).
- Cada linha mostra o estoque atual do item, o custo atual e em quais pratos ele é usado.
- "Já recebi a mercadoria" (marcado por padrão) dá entrada no estoque na hora. Ao receber, o custo do item vira o
  **custo médio ponderado** (estoque antigo + compra nova), o banco recalcula o custo dos pratos da ficha técnica e
  aparece um resumo do que mudou.
- **Separação por nicho** (`js/nicho.js`): Produtos, Estoque, Compras, Ficha técnica e Contabilidade mostram só os
  produtos do nicho da conta e os sem nicho. Nada é apagado: ao trocar o nicho, os do outro nicho voltam. Produto e
  insumo novos já nascem com o nicho da conta.
- Ficha técnica aceita itens de revenda como ingrediente, para combos (ex.: balde com 6 long necks).

## 49. Estoque com 3 casas decimais e conta de demonstração

No **SQL Editor**:

```sql
-- Estoque com 3 casas decimais (a ficha técnica baixa 0,375 kg de carne; com 2 casas o saldo se perdia)
alter table public.products alter column estoque type numeric(14,3);
alter table public.products alter column estoque_minimo type numeric(14,3);

-- Conta de demonstração (usuário "Lumos"): alterna entre o modo Cliente e o modo Desenvolvedor
alter table public.profiles add column if not exists demo boolean not null default false;
```

Nenhuma Edge Function muda.

### Como funciona
- O saldo do estoque passa a ter 3 casas decimais, como as fichas técnicas (ex.: 0,375 kg de carne por venda).
- **Conta de demonstração**: crie o usuário e rode `docs/conta-demonstracao.sql`. Ela entra com o usuário **Lumos** e
  tem no topo os botões **Modo Cliente** (exatamente o que o cliente vê depois do contrato) e **Modo Desenvolvedor**.
- **Dados de exemplo do restaurante**: `docs/dados-restaurante.sql` cria insumos com custo e estoque e as fichas técnicas
  de todo o cardápio (troque o e-mail no topo para rodar na sua conta e na de demonstração).
- **Cadastro com nicho**: quem cria a conta escolhe o tipo de negócio, e o sistema já abre configurado no primeiro acesso.
- **Tutoriais guiados**: liga e desliga em Configurações. Padrão: ligados para a equipe Lumos, desligados para o cliente.

## 50. Pronto para muitos clientes: índices e numeração própria de cada estabelecimento

No **SQL Editor**:

```sql
-- ===== Índices: o banco vai direto aos dados de cada estabelecimento (rápido mesmo com muitos clientes) =====
create index if not exists leads_owner_ultima on public.leads (owner_id, last_message_at desc);
create index if not exists leads_owner_telefone on public.leads (owner_id, phone);
create index if not exists leads_sessao on public.leads (table_session_id);
create index if not exists messages_lead_data on public.messages (lead_id, created_at);
create index if not exists sales_orders_owner_pago on public.sales_orders (owner_id, status, paid_at);
create index if not exists sales_orders_lead on public.sales_orders (lead_id);
create index if not exists sales_orders_sessao on public.sales_orders (table_session_id);
create index if not exists orders_owner_status on public.orders (owner_id, status, created_at);
create index if not exists orders_sessao on public.orders (table_session_id);
create index if not exists orders_lead on public.orders (lead_id);
create index if not exists order_items_pedido on public.order_items (order_id);
create index if not exists estoque_mov_owner_data on public.estoque_mov (owner_id, created_at desc);
create index if not exists estoque_mov_produto on public.estoque_mov (product_id);
create index if not exists fin_owner_vencimento on public.fin_lancamentos (owner_id, vencimento);
create index if not exists fin_owner_pago on public.fin_lancamentos (owner_id, pago_em);
create index if not exists table_sessions_mesa on public.table_sessions (table_id, status);
create index if not exists table_sessions_owner on public.table_sessions (owner_id);
create index if not exists compras_owner on public.compras (owner_id, status);
create index if not exists agents_owner on public.agents (owner_id);
create index if not exists follow_up_log_lead on public.follow_up_log (lead_id, created_at);
create index if not exists team_members_owner on public.team_members (owner_id);
create index if not exists restaurant_tables_owner on public.restaurant_tables (owner_id);
create index if not exists categories_owner on public.categories (owner_id);
create index if not exists products_owner on public.products (owner_id);
create index if not exists product_recipes_prato on public.product_recipes (product_id);
create index if not exists product_recipes_insumo on public.product_recipes (insumo_id);
create index if not exists product_categories_categoria on public.product_categories (category_id);
create index if not exists agendamentos_owner_data on public.agendamentos (owner_id, data_hora_inicio);
create index if not exists caixa_movs_caixa on public.caixa_movs (caixa_id);

-- ===== Numeração própria de cada estabelecimento (vendas, pedidos da cozinha, compras e caixas) =====
-- Antes era uma sequência só para todos os clientes. Cada um continua do maior número que já tem.
create table if not exists public.numeracao (
  owner_id uuid not null references auth.users(id) on delete cascade,
  serie text not null,
  ultimo bigint not null default 0,
  primary key (owner_id, serie)
);
alter table public.numeracao enable row level security;   -- só o gatilho (abaixo) mexe aqui

insert into public.numeracao(owner_id, serie, ultimo)
  select owner_id, 'sales_orders', max(numero) from public.sales_orders where owner_id is not null group by owner_id
  on conflict (owner_id, serie) do update set ultimo = greatest(public.numeracao.ultimo, excluded.ultimo);
insert into public.numeracao(owner_id, serie, ultimo)
  select owner_id, 'orders', max(numero) from public.orders where owner_id is not null and numero is not null group by owner_id
  on conflict (owner_id, serie) do update set ultimo = greatest(public.numeracao.ultimo, excluded.ultimo);
insert into public.numeracao(owner_id, serie, ultimo)
  select owner_id, 'compras', max(numero) from public.compras where owner_id is not null group by owner_id
  on conflict (owner_id, serie) do update set ultimo = greatest(public.numeracao.ultimo, excluded.ultimo);
insert into public.numeracao(owner_id, serie, ultimo)
  select owner_id, 'caixas', max(numero) from public.caixas where owner_id is not null group by owner_id
  on conflict (owner_id, serie) do update set ultimo = greatest(public.numeracao.ultimo, excluded.ultimo);

create or replace function public.proximo_numero() returns trigger
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if new.owner_id is null then return new; end if;
  insert into public.numeracao(owner_id, serie, ultimo)
    values (new.owner_id, tg_table_name, case when tg_table_name = 'sales_orders' then 1000 else 0 end)
    on conflict do nothing;
  update public.numeracao set ultimo = ultimo + 1
   where owner_id = new.owner_id and serie = tg_table_name
   returning ultimo into v;
  new.numero := v;
  return new;
end $$;

alter table public.sales_orders alter column numero drop identity if exists;
alter table public.orders alter column numero drop identity if exists;
alter table public.compras alter column numero drop identity if exists;
alter table public.caixas alter column numero drop identity if exists;
alter table public.sales_orders drop constraint if exists sales_orders_numero_key;
create unique index if not exists sales_orders_owner_numero on public.sales_orders (owner_id, numero);

drop trigger if exists trg_numero on public.sales_orders;
create trigger trg_numero before insert on public.sales_orders for each row execute function public.proximo_numero();
drop trigger if exists trg_numero on public.orders;
create trigger trg_numero before insert on public.orders for each row execute function public.proximo_numero();
drop trigger if exists trg_numero on public.compras;
create trigger trg_numero before insert on public.compras for each row execute function public.proximo_numero();
drop trigger if exists trg_numero on public.caixas;
create trigger trg_numero before insert on public.caixas for each row execute function public.proximo_numero();
```

Depois, atualize as Edge Functions **`orders`** (venda do PDV), **`fiscal`** (quem opera o PDV pode emitir a nota) e
**`team`** (aba `pdv`).

### Como funciona
- **Índices**: o banco vai direto aos dados de cada estabelecimento nas tabelas que mais crescem (mensagens, vendas,
  pedidos, estoque, financeiro). Sem eles, tudo fica mais lento a cada cliente novo.
- **Numeração própria**: vendas, pedidos da cozinha, compras e caixas passam a ter a sequência de cada estabelecimento.
  Cada um continua do maior número que já tinha; cliente novo começa em 1001 (vendas) e 1 (o resto).
- **PDV (balcão)**: aba nova. O preço vem sempre do cadastro (nunca da tela); a venda baixa o estoque (inclusive
  insumos pela ficha técnica), entra no caixa e no financeiro, vai para a cozinha se marcado e emite a NFC-e.

## 51. Custo protegido, código de barras, categorias por nicho, link de pagamento real e modo sem internet

No **SQL Editor**:

```sql
-- ===== Custo dos produtos protegido também no banco =====
-- Quem pode ver custo: o dono e o funcionário com "ver custos" ligado, ou com uma aba que trabalha com custo.
create or replace function public.team_pode_ver_custos(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members m
     where m.user_id = auth.uid() and m.owner_id = owner and m.ativo
       and (coalesce((m.perms->>'ver_custos')::boolean, false)
            or m.allowed_tabs && array['produtos','estoque','compras','ficha_tecnica','financeiro','relatorios','contabilidade']::text[])
  );
$$;
-- A equipe só lê a tabela completa (com custo) se puder ver custos
drop policy if exists "Equipe: le produtos" on public.products;
create policy "Equipe: le produtos" on public.products for select using (public.team_pode_ver_custos(owner_id));

-- Código de barras (leitor no PDV e cadastro do produto)
alter table public.products add column if not exists codigo_barras text;
create index if not exists products_owner_codigo on public.products (owner_id, codigo_barras);

-- Cardápio para quem não vê custo (garçom, cozinha, PDV): tudo, menos o custo
create or replace view public.produtos_venda with (security_invoker = false) as
  select p.id, p.owner_id, p.name, p.description, p.price, p.unit, p.photo_urls, p.active, p.created_at,
         p.agent_ids, p.m2_por_caixa, p.estoque, p.estoque_minimo, p.segmento, p.is_insumo, p.codigo_barras
    from public.products p
   where p.owner_id = auth.uid() or public.is_team_of(p.owner_id);
grant select on public.produtos_venda to authenticated;

-- ===== Categorias também separadas por nicho =====
alter table public.categories add column if not exists segmento text;
-- Categoria cujos produtos são todos de um mesmo nicho recebe esse nicho
update public.categories c set segmento = s.seg
  from (select pc.category_id, min(p.segmento) as seg
          from public.product_categories pc join public.products p on p.id = pc.product_id
         group by pc.category_id
        having count(distinct p.segmento) = 1 and count(*) = count(p.segmento)) s
 where s.category_id = c.id and c.segmento is null;

-- A equipe lê as categorias de cada produto pelo cardápio sem custo (o garçom não lê mais a tabela completa)
drop policy if exists "Equipe: le vinculos" on public.product_categories;
create policy "Equipe: le vinculos" on public.product_categories for select
  using (exists (select 1 from public.produtos_venda p where p.id = product_id));
```

### Edge Functions
1. Crie a função **`pagamentos`** (nova) com `supabase/functions/pagamentos/index.ts`, **"Enforce JWT verification" DESLIGADO**
   (o Mercado Pago e o Asaas chamam sem login; a função confere cada pagamento direto no provedor).
2. Atualize **`orders`** (link real do Mercado Pago e do Asaas, PDV sem duplicidade e com horário da venda offline).

### Como funciona
- **Custo protegido no banco**: funcionário sem "ver custos" (e sem abas de estoque, compras, ficha, financeiro,
  relatórios ou contabilidade) lê o cardápio pela visão `produtos_venda`, que não tem a coluna de custo.
- **Código de barras** no cadastro do produto; no PDV, o leitor lê o código e o produto entra na venda.
- **Categorias por nicho**, como os produtos.
- **Link de pagamento real**: em Integrações > Pagamento, escolha Mercado Pago ou Asaas, cole a chave e comece em
  "Teste". O link sai com o valor exato do pedido; o pagamento é confirmado sozinho (Mercado Pago avisa pelo endereço
  de cada link; no Asaas, o Lumos registra o aviso na conta da loja no primeiro link).
- **CMV teórico x real** na Contabilidade: o real inclui perdas e diferenças de contagem do estoque.
- **Subreceitas**: insumo feito na cozinha (ex.: molho da casa) pode ter receita própria; "Produzir" registra o lote.
- **Sem internet**: as páginas abrem com a última cópia, aparece um aviso, e o PDV guarda as vendas no aparelho e
  envia sozinho quando a conexão volta (a NFC-e dessas vendas sai no envio).
- **Menu** em grupos que abrem e fecham: CRM, ERP e Configuração.

## 52. PDV e Caixa numa tela só

No **SQL Editor**:

```sql
-- PDV e Caixa numa tela só: quem tem a aba "pdv" também abre, movimenta e fecha o caixa
drop policy if exists "Equipe: caixas" on public.caixas;
create policy "Equipe: caixas" on public.caixas for all
  using (public.team_has_tab(owner_id, 'caixa') or public.team_has_tab(owner_id, 'pdv'))
  with check (public.team_has_tab(owner_id, 'caixa') or public.team_has_tab(owner_id, 'pdv'));
drop policy if exists "Equipe: movimentos do caixa" on public.caixa_movs;
create policy "Equipe: movimentos do caixa" on public.caixa_movs for all
  using (public.team_has_tab(owner_id, 'caixa') or public.team_has_tab(owner_id, 'pdv'))
  with check (public.team_has_tab(owner_id, 'caixa') or public.team_has_tab(owner_id, 'pdv'));
drop policy if exists "Equipe: notas fiscais" on public.fiscal_docs;
create policy "Equipe: notas fiscais" on public.fiscal_docs for select
  using (public.team_has_tab(owner_id, 'fiscal') or public.team_has_tab(owner_id, 'contabilidade') or public.team_has_tab(owner_id, 'caixa') or public.team_has_tab(owner_id, 'pdv'));
```

Nenhuma Edge Function muda.

### Como funciona
- A aba **PDV e Caixa** reúne a venda no balcão e o caixa do turno: abrir com o fundo de troco, sangria, suprimento,
  resumo do turno, fechamento conferido e caixas anteriores. Com o caixa fechado (e com internet), não dá para vender.
- O endereço antigo `caixa.html` leva para o PDV. Quem tinha só a aba "caixa" continua entrando.
- **Testes automáticos** na pasta `tests/` (veja `tests/LEIA-ME.md`).

## 53. Assinatura da Lumos (mensalidade), cupons, Termos de Uso e Política de Privacidade

No **SQL Editor**:

```sql
-- ===== Assinatura da Lumos (mensalidade) e cupons de desconto =====
create table if not exists public.cupons (
  id uuid default gen_random_uuid() primary key,
  codigo text not null unique,                  -- sempre em maiúsculas
  tipo text not null check (tipo in ('percentual','valor')),
  valor numeric(12,2) not null check (valor > 0),
  meses integer check (meses is null or meses > 0),   -- por quantas mensalidades vale (vazio = todas)
  validade date,                                -- até quando pode ser usado
  limite_usos integer check (limite_usos is null or limite_usos > 0),
  usos integer not null default 0,
  ativo boolean not null default true,
  descricao text,
  created_at timestamptz default now()
);
alter table public.cupons enable row level security;   -- só o servidor (função assinaturas) mexe

create table if not exists public.assinaturas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plano text not null default 'lumos_mensal',
  valor_base numeric(12,2) not null,
  valor_mensal numeric(12,2) not null,          -- valor cobrado agora (com o cupom, se houver)
  cupom_codigo text,
  meses_desconto_restantes integer,             -- null = desconto para sempre (ou sem cupom)
  forma text not null check (forma in ('cartao','pix_boleto')),
  status text not null default 'pendente' check (status in ('pendente','ativa','atrasada','cancelada')),
  mp_preapproval_id text,
  proximo_vencimento date,
  ultimo_pagamento timestamptz,
  dados jsonb default '{}'::jsonb,              -- nome do negócio, CPF/CNPJ, telefone
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.assinaturas enable row level security;
drop policy if exists "Cliente ve a propria assinatura" on public.assinaturas;
create policy "Cliente ve a propria assinatura" on public.assinaturas for select using (auth.uid() = user_id);

create table if not exists public.assinatura_pagamentos (
  id uuid default gen_random_uuid() primary key,
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  mp_payment_id text not null unique,           -- o mesmo pagamento nunca conta duas vezes
  valor numeric(12,2) not null,
  forma text,
  pago_em timestamptz default now()
);
alter table public.assinatura_pagamentos enable row level security;
drop policy if exists "Cliente ve os proprios pagamentos" on public.assinatura_pagamentos;
create policy "Cliente ve os proprios pagamentos" on public.assinatura_pagamentos for select
  using (exists (select 1 from public.assinaturas a where a.id = assinatura_id and a.user_id = auth.uid()));
```

### Edge Function e secrets
1. Crie a função **`assinaturas`** (nova) com `supabase/functions/assinaturas/index.ts`, **"Enforce JWT verification" DESLIGADO**.
2. Em **Edge Functions → Secrets**, crie `LUMOS_MP_TOKEN` com o **Access Token da conta Mercado Pago da Lumos** (para testar,
   o de teste; para valer, o de produção). Opcional: `LUMOS_PLANO_VALOR` (padrão 1794.90).
3. No painel do Mercado Pago (aplicação da Lumos → **Webhooks**), cadastre o endereço
   `https://nkmyunxjoeqpmwolefbj.supabase.co/functions/v1/assinaturas?aviso=1` com os eventos **Pagamentos** e
   **Planos e assinaturas**. Mesmo sem isso, a página confere os pagamentos quando o cliente volta do checkout.

### Como funciona
- `plans.html` vira a página de assinatura: dados do negócio, cartão (cobrança automática mensal) ou Pix/boleto (mês a mês),
  cupom e aceite dos Termos. Pagamento aprovado ativa a conta do cliente sozinho.
- **Painel Admin → Assinaturas e cupons**: lista das assinaturas (conferir pagamentos, cancelar) e cadastro de cupons
  (percentual ou valor, por quantas mensalidades, validade, limite de usos, ativo).
- `termos.html` e `privacidade.html`: textos próprios da Lumos. Preencha os dados marcados entre colchetes e peça a
  revisão de um advogado antes de publicar.

## Área de trabalho (navegação nova)

Sem SQL e sem funções. Depois do login, o sistema abre `inicio.html`: uma área de trabalho com as luzes de fundo e uma barra
no estilo dock (Lumos, CRM, ERP e as páginas abertas). Cada página abre como uma janela; dá para deixar várias abertas e
alternar sem perder o que estava na tela. Favoritos podem ser fixados (alfinete) e arrastados na área de trabalho.
Uma página aberta sozinha (link direto) leva para a área de trabalho com ela já aberta.

## 54. Histórico do sistema (acompanhar cada cliente e investigar problemas)

No **SQL Editor**:

```sql
-- ===== Histórico do sistema (o que aconteceu em cada cliente, para acompanhar e investigar problemas) =====
-- Gravado só pelas Edge Functions. Guarda o essencial (valores, números, situação), nunca chaves ou conversas.
create table if not exists public.eventos_sistema (
  id bigint generated by default as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,   -- cliente (estabelecimento); vazio = da Lumos
  origem text not null,          -- orders, pagamentos, assinaturas, fiscal, whatsapp
  tipo text not null default 'info' check (tipo in ('info','aviso','erro')),
  acao text not null,            -- ex.: link_criado, pagamento_confirmado, nota_erro
  mensagem text,
  dados jsonb,
  ref_id text,                   -- pedido, venda ou assinatura relacionada
  created_at timestamptz default now()
);
create index if not exists eventos_owner_data on public.eventos_sistema (owner_id, created_at desc);
create index if not exists eventos_data on public.eventos_sistema (created_at desc);
create index if not exists eventos_tipo_data on public.eventos_sistema (tipo, created_at desc);
alter table public.eventos_sistema enable row level security;

-- Só a equipe Lumos (administrador e suporte) lê o histórico
create or replace function public.e_equipe_lumos() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'suporte'));
$$;
drop policy if exists "Equipe Lumos le o historico" on public.eventos_sistema;
create policy "Equipe Lumos le o historico" on public.eventos_sistema for select using (public.e_equipe_lumos());

-- Apaga sozinho o que tiver mais de 90 dias (todo dia às 4h)
create extension if not exists pg_cron;
select cron.unschedule('lumos-limpar-historico') where exists (select 1 from cron.job where jobname = 'lumos-limpar-historico');
select cron.schedule('lumos-limpar-historico', '0 7 * * *', $$delete from public.eventos_sistema where created_at < now() - interval '90 days'$$);
```

Depois, atualize as Edge Functions **`orders`**, **`pagamentos`**, **`assinaturas`**, **`fiscal`** e **`whatsapp-webhook`**
(todas passam a registrar o histórico).

### Como funciona
- Cada passo importante fica registrado: link de pagamento criado ou recusado, aviso de pagamento conferido ou ignorado
  (com o motivo), pagamento confirmado, venda no PDV, nota autorizada ou recusada, mensalidade paga e falhas inesperadas.
- **Painel Admin → Histórico do sistema**: filtro por cliente, tipo e período, busca e detalhes de cada evento.
- **Copiar para o suporte**: copia os eventos filtrados num texto para colar na conversa e investigar.
- Só a equipe Lumos lê. Guarda o essencial (valores, números, situação), nunca chaves ou conversas. Apaga sozinho
  depois de 90 dias.

## 55. Delivery: pedidos, entregadores, rastreio e mapa

No **SQL Editor**:

```sql
-- ===================== Delivery =====================
-- Configuração do delivery de cada estabelecimento
create table if not exists public.delivery_config (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  aprovacao text not null default 'manual' check (aprovacao in ('automatica','manual')),   -- manual: a equipe confere antes do link
  cozinha text not null default 'automatica' check (cozinha in ('automatica','manual')),   -- manual: a equipe manda para a cozinha
  tempo_estimado integer not null default 50,          -- minutos, informado ao cliente na aprovação
  pedido_minimo numeric(12,2) not null default 0,
  aberto boolean not null default true,
  pausa_ate timestamptz,                               -- pausado até este horário
  mensagem_pausa text,
  minutos_sem_resposta integer not null default 15,    -- cliente que não responde à sugestão: pedido encerrado
  updated_at timestamptz default now()
);

-- Entregadores (motoboys)
create table if not exists public.entregadores (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null,
  veiculo text,
  placa text,
  taxa_entrega numeric(12,2) not null default 0,       -- quanto o entregador recebe por entrega
  ativo boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists entregadores_owner on public.entregadores (owner_id);

-- Link do entregador (tela dele e rastreio): vale 8 horas
create table if not exists public.entregador_links (
  token text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  expira_em timestamptz not null,
  autorizado_em timestamptz,                           -- quando o entregador permitiu a localização
  lat double precision, lng double precision, precisao double precision,
  posicao_em timestamptz,
  created_at timestamptz default now()
);
create index if not exists entregador_links_entregador on public.entregador_links (entregador_id, expira_em desc);
create index if not exists entregador_links_owner on public.entregador_links (owner_id, expira_em desc);

-- Entrega de cada pedido (depois que fica pronto)
create table if not exists public.entregas (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sales_order_id uuid not null unique references public.sales_orders(id) on delete cascade,
  entregador_id uuid references public.entregadores(id) on delete set null,
  etapa text not null default 'aguardando_entregador'
    check (etapa in ('aguardando_entregador','oferecida','em_rota','chegou','entregue','retirado','cancelada')),
  rastreio_token text unique,                          -- link de acompanhamento do cliente
  taxa_entregador numeric(12,2),
  recebido_na_entrega numeric(12,2),
  forma_na_entrega text,
  recusas jsonb default '[]'::jsonb,                   -- quem recusou e quando
  oferecida_em timestamptz, saiu_em timestamptz, chegou_em timestamptz, entregue_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists entregas_owner on public.entregas (owner_id, created_at desc);
create index if not exists entregas_entregador on public.entregas (entregador_id, etapa);

-- Acesso: o dono e a equipe com a aba Delivery. A tela do entregador e o rastreio usam a função "entregas".
alter table public.delivery_config enable row level security;
alter table public.entregadores enable row level security;
alter table public.entregador_links enable row level security;
alter table public.entregas enable row level security;
do $$ declare t text; begin
  foreach t in array array['delivery_config','entregadores','entregador_links','entregas'] loop
    execute format('drop policy if exists "Dono: %1$s" on public.%1$s', t);
    execute format('create policy "Dono: %1$s" on public.%1$s for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)', t);
    execute format('drop policy if exists "Equipe: %1$s" on public.%1$s', t);
    execute format('create policy "Equipe: %1$s" on public.%1$s for all using (public.team_has_tab(owner_id, ''delivery'')) with check (public.team_has_tab(owner_id, ''delivery''))', t);
  end loop;
end $$;
-- A equipe do Delivery também precisa ver os pedidos e a cozinha (para o painel)
drop policy if exists "Equipe Delivery: le pedidos" on public.sales_orders;
create policy "Equipe Delivery: le pedidos" on public.sales_orders for select using (public.team_has_tab(owner_id, 'delivery'));
drop policy if exists "Equipe Delivery: le cozinha" on public.orders;
create policy "Equipe Delivery: le cozinha" on public.orders for select using (public.team_has_tab(owner_id, 'delivery'));
```

### Edge Functions
1. Crie a função **`entregas`** (nova) com `supabase/functions/entregas/index.ts`, **"Enforce JWT verification" DESLIGADO**
   (o entregador e o cliente abrem links com código, sem login).
2. Atualize **`orders`** (envio manual para a cozinha, aviso ao cliente, pagamento em dinheiro na entrega),
   **`whatsapp-webhook`** (aprovação manual, delivery pausado e pedido mínimo) e **`team`** (aba `delivery`).

### Como funciona
- **Delivery → Pedidos**: quadro por etapa (Aguardando aprovação, Aguardando pagamento, Pago, Na cozinha, Pronto,
  Saiu para entrega, Entregue). Clique no cartão para agir: aprovar e enviar o link, item indisponível (mensagem pronta
  com sugestões da mesma categoria), recusar, enviar para a cozinha, selecionar o entregador. Atraso fica em vermelho.
- **Configuração**: aprovação manual ou automática, envio à cozinha automático ou manual, tempo estimado, pedido mínimo,
  abrir, fechar e pausar (15, 30 ou 60 min). A IA segue essas regras no WhatsApp.
- **Entregadores**: cadastro, link de rastreio de 8 horas (enviado no WhatsApp dele) e acerto do dia.
- **Tela do entregador** (`entregador.html`): aceitar ou recusar, abrir o caminho no mapa, ligar, "Cheguei" e
  "Entreguei" (com o recebimento do pagamento na entrega). Envia a localização enquanto a tela está aberta.
- **Rastreio do cliente** (`rastreio.html`): o cliente recebe o link quando o pedido sai e acompanha no mapa.
- **Mapa**: os entregadores com localização ativa, atualizado a cada 15 segundos (mapas do OpenStreetMap).
- **Cozinha**: clique no cartão para escolher a ação; pedidos de delivery levam o selo "Delivery".

## 56. Entregador com login no Lumos (aba Minhas entregas)

No **SQL Editor**:

```sql
-- Entregador com login no Lumos (aba "Minhas entregas"): liga o cadastro do entregador ao acesso de funcionário
alter table public.entregadores add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists entregadores_user on public.entregadores (user_id) where user_id is not null;
```

Depois, atualize as Edge Functions **`entregas`** e **`team`** (função Entregador e aba `entregas`).

### Como funciona
- Em **Delivery → Entregadores**, ao cadastrar ou editar, preencha **Acesso ao Lumos** (usuário e senha). O sistema cria o
  login de funcionário com a função **Entregador**, que só vê a aba **Minhas entregas**.
- A entrega oferecida aparece na tela **Minhas entregas** (aceitar, recusar, mapa, cheguei, entreguei), sem mensagem no WhatsApp.
- Pelo WhatsApp, o entregador recebe só o **link de rastreio** do dia (8 horas). Depois de abrir e permitir a localização,
  ela segue enquanto a tela Minhas entregas estiver aberta.
- Entregador sem login continua funcionando como antes, tudo pelo link.

## Status atual

Concluído: autenticação e controle de acesso (admin/cliente/user), catálogo de
produtos com fotos, números do WhatsApp e sub-números com rota, agente de IA
conectado à UAZAPI (texto, fotos de produto, múltiplos provedores de IA),
painel completo (Dashboard, Kanban configurável, Leads, Clientes, Follow Up,
Agendamentos, Configurações da loja e horário de funcionamento), tema
claro/escuro e navegação mobile.

Pendente / possíveis próximos passos:
- A IA ainda não usa as rotas dos sub-números pra decidir pra quem encaminhar a conversa.
- A IA ainda não preenche `motivo_contato` / `resumo_conversa` automaticamente nos leads reais.
- Suporte a imagem/áudio recebido do cliente (hoje só texto é processado).
- Formato do webhook da Evolution API ainda não foi testado (só UAZAPI está confirmado).
