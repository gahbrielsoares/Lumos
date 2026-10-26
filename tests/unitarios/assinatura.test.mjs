// Assinatura da Lumos: cupom, checkout no Pix, aviso do Mercado Pago, ativação da conta e fim do desconto
let handler = null;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "SRV", LUMOS_MP_TOKEN: "APP_USR-1", SITE_URL: "https://www.lumos.tec.br" }[k]) }, serve: (h) => { handler = h; } };
const DB = { cupons: [{ id: "c1", codigo: "BEMVINDO", tipo: "percentual", valor: 50, meses: 2, validade: "2099-12-31", limite_usos: 10, usos: 0, ativo: true },
  { id: "c2", codigo: "VENCIDO", tipo: "valor", valor: 100, meses: null, validade: "2020-01-01", limite_usos: null, usos: 0, ativo: true }],
  assinaturas: [], assinatura_pagamentos: [], profiles: [{ id: "u1", role: "user", status: "cadastrado", email: "dona@bar.com" }] };
let seq = 0;
globalThis.__sb = {
  auth: { getUser: async (jwt) => ({ data: { user: jwt === "TOKEN-U1" ? { id: "u1", email: "dona@bar.com" } : null } }) },
  from: (t) => { let rows = [...DB[t]]; let single = false, upd = null, ins = null; const o = {
    select() { return o; }, order() { return o; },
    eq(k, v) { if (upd) { DB[t].filter((r) => r[k] === v).forEach((r) => Object.assign(r, upd)); return o; } rows = rows.filter((r) => r[k] === v); return o; },
    maybeSingle() { single = true; return o; }, single() { single = true; return o; },
    insert(x) { if (t === "assinatura_pagamentos" && DB[t].some((r) => r.mp_payment_id === x.mp_payment_id)) { ins = { error: { message: "duplicate" } }; return o; } const it = { id: t + ++seq, ...x }; DB[t].push(it); rows = [it]; return o; },
    upsert(x) { let r = DB[t].find((y) => y.user_id === x.user_id); if (r) Object.assign(r, x); else { r = { id: "assin" + ++seq, ...x }; DB[t].push(r); } rows = [r]; return o; },
    update(x) { upd = x; return o; },
    then(res) { const cnt = t === "assinatura_pagamentos" ? DB[t].length : rows.length; return Promise.resolve(ins || { data: single ? rows[0] || null : rows, error: null, count: cnt }).then(res); } }; return o; },
};
const chamadas = []; let PAGTO = null;
globalThis.fetch = async (url, o) => { chamadas.push([url, o?.method]);
  if (url.includes("/checkout/preferences")) return { ok: true, json: async () => ({ id: "pref1", init_point: "https://mp/pagar" }) };
  if (url.includes("/v1/payments/search")) return { ok: true, json: async () => ({ results: [] }) };
  if (url.includes("/v1/payments/")) return { ok: true, json: async () => PAGTO };
  return { ok: true, json: async () => ({}) }; };
await import(new URL("../.build/assin_t.mjs", import.meta.url).href);
const call = (body, jwt, qs = "") => handler(new Request("https://proj.supabase.co/functions/v1/assinaturas" + qs, { method: "POST", body: JSON.stringify(body), headers: jwt ? { Authorization: "Bearer " + jwt } : {} })).then((r) => r.json().then((d) => ({ s: r.status, d })));
const ok = (c, m) => console.log(c ? "ok:" : "FALHOU:", m);

let r = await call({ action: "cupom", codigo: "bemvindo" });
ok(r.d.valor === 897.45 && r.d.meses === 2, "cupom de 50% por 2 meses: R$ 897,45 (" + r.d.texto + ")");
r = await call({ action: "cupom", codigo: "VENCIDO" }); ok(r.s === 400 && /expirou/.test(r.d.error), "cupom vencido é recusado");
r = await call({ action: "cupom", codigo: "NAOEXISTE" }); ok(r.s === 400, "cupom inexistente é recusado");
r = await call({ action: "assinar", forma: "pix_boleto", cpf_cnpj: "123", aceite: true }, "TOKEN-U1"); ok(r.s === 400, "CPF/CNPJ inválido é recusado");
r = await call({ action: "assinar", forma: "pix_boleto", cpf_cnpj: "11.222.333/0001-81", cupom: "BEMVINDO" }, "TOKEN-U1"); ok(r.s === 400 && /Termos/.test(r.d.error), "sem aceitar os termos não assina");
r = await call({ action: "assinar", forma: "pix_boleto", cpf_cnpj: "11.222.333/0001-81", cupom: "BEMVINDO", negocio: "Bar da Rosa", aceite: true }, "TOKEN-U1");
const a = DB.assinaturas[0];
ok(r.d.link === "https://mp/pagar" && a.valor_mensal === 897.45 && a.status === "pendente" && a.dados.aceite_termos_em, "assinatura criada com o cupom e o aceite registrado; link de pagamento gerado");
r = await call({ action: "assinar", forma: "pix_boleto", cpf_cnpj: "11222333000181", aceite: true }); ok(r.s === 401, "sem login não assina");
// Aviso do Mercado Pago: pagamento aprovado
PAGTO = { id: 555, status: "approved", external_reference: "assin:" + a.id, transaction_amount: 897.45, payment_type_id: "bank_transfer", date_approved: "2026-10-26T15:00:00Z" };
await call({ type: "payment", data: { id: "555" } }, null, "?aviso=1");
ok(a.status === "ativa" && a.proximo_vencimento && DB.profiles[0].status === "ativo" && DB.profiles[0].role === "cliente", "pagamento aprovado: assinatura ativa e conta do cliente liberada (" + a.proximo_vencimento + ")");
ok(DB.cupons[0].usos === 1 && a.meses_desconto_restantes === 1, "uso do cupom contado e 1 mês de desconto restante");
await call({ type: "payment", data: { id: "555" } }, null, "?aviso=1");
ok(DB.assinatura_pagamentos.length === 1, "o mesmo aviso repetido não registra duas vezes");
PAGTO = { ...PAGTO, id: 556 }; await call({ type: "payment", data: { id: "556" } }, null, "?aviso=1");
ok(a.meses_desconto_restantes === 0 && Number(a.valor_mensal) === 1794.9, "depois dos 2 meses de cupom, volta a mensalidade cheia");
PAGTO = { id: 777, status: "pending", external_reference: "assin:" + a.id, transaction_amount: 1794.9 }; const antes = DB.assinatura_pagamentos.length;
await call({ type: "payment", data: { id: "777" } }, null, "?aviso=1"); ok(DB.assinatura_pagamentos.length === antes, "pagamento pendente não conta");
r = await call({ action: "admin_listar" }, "TOKEN-U1"); ok(r.s === 403, "cliente não acessa a área de cupons do Painel Admin");
