const { generateKeyPairSync } = require("crypto");
const k = generateKeyPairSync("ed25519");
console.log(
  "RECEITA_PRIVATE_KEY=" +
    k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")
);