-- Rode DEPOIS de criar o seu usuário em Authentication > Users > Add user.
-- Troque o e-mail abaixo se for outro.
update public.profiles set role = 'admin' where email = 'luisverbo@gmail.com';

-- Confere (deve mostrar uma linha com role = admin):
select email, role from public.profiles where role = 'admin';
