const jwt = require('jsonwebtoken');
const fs = require('fs');

// 👇 SUBSTITUA COM OS SEUS DADOS REAIS:
const TEAM_ID = 'BXRV75LQRW'; // Seu Team ID da Apple (10 letras/números)
const CLIENT_ID = 'com.seuapp.login'; // O Identifier que você criou no Passo 2
const KEY_ID = 'TS2WKLLW48'; // O Key ID que a Apple te deu na hora de baixar a chave
const ARQUIVO_P8 = './AuthKey_TS2WKLLW48.p8'; // O nome exato do arquivo que está na sua pasta

try {
  const privateKey = fs.readFileSync(ARQUIVO_P8);
  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d', // Validade máxima de 6 meses exigida pela Apple
    issuer: TEAM_ID,
    audience: 'https://appleid.apple.com',
    subject: CLIENT_ID,
    keyid: KEY_ID
  });
  console.log("\n✅ DEU CERTO! COPIE O TEXTO ABAIXO E COLE NO SUPABASE:\n");
  console.log(token);
  console.log("\n");
} catch (e) {
  console.error("Erro: Verifique se o nome do arquivo .p8 está correto e na mesma pasta!", e.message);
}