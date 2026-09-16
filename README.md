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

## Próximos passos sugeridos

- Trocar o link `wa.me/5500000000000` em `plans.html` pelo número real do WhatsApp da Lumos.
- Substituir o conteúdo do `dashboard.html` pelo pipeline de leads de verdade (tabela `leads` no Supabase).
- Conectar a API de WhatsApp (UAZAPI) para popular essa tabela automaticamente.
