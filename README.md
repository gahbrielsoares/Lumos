# Lumos CRM

Frontend estático (HTML/CSS/JS puro) pronto para GitHub Pages, com autenticação via Supabase.

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
