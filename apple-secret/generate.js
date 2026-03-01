const jwt = require("jsonwebtoken");
const fs = require("fs");

const teamId = "BXRV75LQRW";
const clientId = "com.chamo.app.web";
const keyId = "6P7Q6UT6M2";

const privateKey = fs.readFileSync("./AuthKey.p8");

const token = jwt.sign(
  {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15777000, // 6 meses
    aud: "https://appleid.apple.com",
    sub: clientId,
  },
  privateKey,
  {
    algorithm: "ES256",
    keyid: keyId,
  }
);

console.log(token);
