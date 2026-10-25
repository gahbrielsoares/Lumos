-- =====================================================================
-- Conta de demonstração "Lumos" (Modo Cliente / Modo Desenvolvedor)
-- Antes: Supabase > Authentication > Users > Add user > Create new user
--   E-mail: lumos@equipe.lumos.app   Senha: 12345679   (marque "Auto Confirm User")
--   No login do Lumos, basta digitar o usuário "Lumos" e a senha.
-- Depois rode este SQL (e a seção 49 do guia, se ainda não aplicou).
-- =====================================================================
update public.profiles
   set role = 'suporte',   -- no Modo Desenvolvedor, vê o que a equipe Lumos vê
       status = 'ativo',
       demo = true          -- mostra os botões Modo Cliente / Modo Desenvolvedor no topo
 where lower(email) = 'lumos@equipe.lumos.app';

-- Confere: deve aparecer 1 linha com demo = true
select email, role, status, demo from public.profiles where lower(email) = 'lumos@equipe.lumos.app';
