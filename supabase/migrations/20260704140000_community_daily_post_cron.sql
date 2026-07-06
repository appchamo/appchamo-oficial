-- Post diario na comunidade via IA (perfil Chamo Tecnologia), 10h BRT.
select cron.schedule('community-daily-post', '0 13 * * *', 'SELECT net.http_post(...)'); -- ver painel
