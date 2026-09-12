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

## Próximos passos sugeridos

- Trocar o link `wa.me/5500000000000` em `plans.html` pelo número real do WhatsApp da Lumos.
- Substituir o conteúdo do `dashboard.html` pelo pipeline de leads de verdade (tabela `leads` no Supabase).
- Conectar a API de WhatsApp (UAZAPI) para popular essa tabela automaticamente.
