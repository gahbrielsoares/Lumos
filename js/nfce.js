// =====================================================================
// NFC-e: validações e leitura do certificado digital A1 no navegador
// (as mesmas regras são conferidas de novo na função "fiscal")
// =====================================================================

export const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

export function cnpjValido(v) {
  const c = onlyDigits(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0, peso = base.length - 7;
    for (const d of base) { soma += Number(d) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

// IE de São Paulo: 12 dígitos com 2 verificadores. Outros estados: só o tamanho.
export function ieValida(v, uf) {
  const d = onlyDigits(v);
  if (uf !== "SP") return d.length >= 8 && d.length <= 14;
  if (d.length !== 12) return false;
  const n = d.split("").map(Number);
  const d9 = ([1, 3, 4, 5, 6, 7, 8, 10].reduce((t, p, i) => t + p * n[i], 0) % 11) % 10;
  const d12 = ([3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2].reduce((t, p, i) => t + p * n[i], 0) % 11) % 10;
  return d9 === n[8] && d12 === n[11];
}

export const cscValido = (id, csc) => /^\d{1,6}$/.test(String(id ?? "").trim()) && /^[A-Za-z0-9]{16,36}$/.test(String(csc ?? "").trim());

async function carregarForge() {
  if (window.forge) return window.forge;
  await new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/forge/1.3.1/forge.min.js";
    s.onload = ok; s.onerror = erro;
    document.head.appendChild(s);
  });
  return window.forge;
}

const paraBase64 = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// Lê o .pfx/.p12: confere a senha e mostra titular, CNPJ e validade.
// Retorna { base64, info } (ok), { erro } (senha ou arquivo errado) ou { base64, erro } (não deu para ler aqui,
// mas o emissor confere ao conectar).
export async function lerCertificado(file, senha) {
  if (!file) return { erro: "Escolha o arquivo do certificado." };
  if (file.size > 200 * 1024) return { erro: "Arquivo grande demais para um certificado A1. Confira se é o .pfx ou .p12." };
  if (!/\.(pfx|p12)$/i.test(file.name)) return { erro: "O certificado A1 é um arquivo .pfx ou .p12." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = paraBase64(bytes);
  let forge;
  try { forge = await carregarForge(); } catch (_) {
    return { base64, info: null, erro: "Não foi possível conferir o certificado nesta tela (sem acesso à biblioteca). O emissor confere ao conectar." };
  }
  try {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), false, senha);
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const certs = bags.map((b) => b.cert).filter(Boolean);
    if (!certs.length) return { erro: "O arquivo não tem certificado dentro." };
    // O certificado da empresa é o que não é de autoridade certificadora
    const folha = certs.find((c) => { const bc = c.getExtension && c.getExtension("basicConstraints"); return !bc || !bc.cA; }) || certs[0];
    const cn = folha.subject.getField("CN")?.value || "";
    let cnpj = (cn.match(/(\d{14})/) || [])[1] || "";
    if (!cnpj) {
      // ICP-Brasil: CNPJ também fica no nome alternativo (OID 2.16.76.1.3.3)
      const der = forge.asn1.toDer(forge.pki.certificateToAsn1(folha)).getBytes();
      const i = der.indexOf("\u0006\u0005\u0060\u004c\u0001\u0003\u0003");
      if (i >= 0) cnpj = (der.slice(i, i + 40).match(/(\d{14})/) || [])[1] || "";
    }
    return {
      base64,
      info: { titular: cn.replace(/:\d{14}$/, ""), cnpj, validade: folha.validity.notAfter.toISOString(), emissor: folha.issuer.getField("CN")?.value || "" },
    };
  } catch (e) {
    const msg = String(e?.message || e);
    if (/password|MAC could not be verified|Invalid/i.test(msg)) return { erro: "Senha do certificado incorreta." };
    if (/Too few bytes|ASN\.1|parse|DER/i.test(msg)) return { erro: "Este arquivo não parece ser um certificado A1 válido." };
    return { base64, info: null, erro: "Não foi possível ler os detalhes do certificado aqui. Ao conectar, o emissor confere a senha, a validade e o CNPJ." };
  }
}
