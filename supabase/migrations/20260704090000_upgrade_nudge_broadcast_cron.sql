-- upgrade-nudge virou broadcast pra todos os pros FREE (cadastro +3d), a cada 2 dias.
select cron.schedule('upgrade-nudge', '0 13 */2 * *', 'SELECT net.http_post(...)');  -- ver painel
