// Delivery: entregador recebe, recusa, aceita, chega e entrega; cliente acompanha; proteções do link
let handler = null;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "SRV", SITE_URL: "https://www.lumos.tec.br" }[k]) }, serve: (h) => { handler = h; } };
const DONO = "dono1";
const DB = {
  sales_orders: [{ id: "so1", owner_id: DONO, numero: 1050, agent_id: "ag1", status: "aguardando_pagamento", total: 64.79, itens: [{ nome: "Isca de Peixe", quantidade: 1 }],
    cliente: { nome: "Alessandro Lima", telefone: "5516988887777" }, entrega: { tipo: "delivery", cozinha: true, endereco: { rua: "Rua A", numero: "10", bairro: "Centro", cidade: "São Carlos" } },
    pagamento: { preferencia: "na_entrega", troco: "100" } }],
  entregadores: [{ id: "e3", owner_id: DONO, nome: "Zé Logado", telefone: "16999992222", taxa_entrega: 7, ativo: true, user_id: "uZe" }, { id: "e1", owner_id: DONO, nome: "João Moto", telefone: "16999990000", taxa_entrega: 7, ativo: true }, { id: "e2", owner_id: DONO, nome: "Pedro", telefone: "16999991111", taxa_entrega: 7, ativo: true }],
  entregador_links: [], entregas: [], orders: [{ id: "t1", sales_order_id: "so1", status: "pronto" }],
  team_members: [{ user_id: "uZe", owner_id: DONO, allowed_tabs: ["entregas"], ativo: true }, { user_id: "uGarcom", owner_id: DONO, allowed_tabs: ["mesas"], ativo: true }], agents: [{ id: "ag1", owner_id: DONO }],
  whatsapp_provider_config: [{ agent_id: "ag1", base_url: "https://wa", api_key: "k" }], eventos_sistema: [],
};
globalThis.__sb = {
  auth: { getUser: async (jwt) => ({ data: { user: jwt === "JWT-DONO" ? { id: DONO } : jwt === "a.JWT-ZE.c" ? { id: "uZe" } : jwt === "a.JWT-GARCOM.c" ? { id: "uGarcom" } : null } }) },
  from: (t) => { let rows = [...(DB[t] || [])]; let single = false, upd = null; const o = {
    select() { return o; }, order() { return o; }, limit() { return o; }, not(k) { rows = rows.filter((r) => r[k] != null); return o; },
    gt(k, v) { rows = rows.filter((r) => r[k] > v); return o; }, in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return o; },
    eq(k, v) { if (upd) { DB[t].filter((r) => r[k] === v).forEach((r) => Object.assign(r, upd)); return o; } rows = rows.filter((r) => r[k] === v); return o; },
    maybeSingle() { single = true; return o; }, single() { single = true; return o; },
    insert(x) { const it = { ...x }; DB[t].push(it); rows = [it]; return o; },
    upsert(x, op) { let r = DB[t].find((y) => y.sales_order_id === x.sales_order_id); if (r) Object.assign(r, x); else { r = { id: "en" + DB[t].length, recusas: [], ...x }; DB[t].push(r); } rows = [r]; return o; },
    update(x) { upd = x; return o; },
    then(res) { return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(res); } }; return o; },
};
const zap = [], chamadasOrders = [];
globalThis.fetch = async (url, o) => {
  const b = o?.body ? JSON.parse(o.body) : {};
  if (url.includes("/functions/v1/orders")) { chamadasOrders.push(b); if (b.action === "kitchen_status") DB.orders[0].status = b.status; if (b.action === "provider_paid") DB.sales_orders[0].status = "pago"; return { ok: true, json: async () => ({ ok: true }) }; }
  if (url.includes("/send/text")) { zap.push(b); return { ok: true, json: async () => ({}) }; }
  return { ok: true, json: async () => ({}) };
};
await import(new URL("../.build/entregas_t.mjs", import.meta.url).href);
const call = (body, jwt) => handler(new Request("https://proj.supabase.co/functions/v1/entregas", { method: "POST", body: JSON.stringify(body), headers: jwt ? { Authorization: "Bearer " + jwt } : {} })).then((r) => r.json().then((d) => ({ s: r.status, d })));
const ok = (c, m) => console.log(c ? "ok:" : "FALHOU:", m);

let r = await call({ action: "atribuir", order_id: "so1", entregador_id: "e1" }, "JWT-NINGUEM"); ok(r.s === 403, "sem login a equipe não oferece entrega");
r = await call({ action: "atribuir", order_id: "so1", entregador_id: "e1" }, "JWT-DONO");
const tokenJoao = DB.entregador_links[0]?.token;
ok(r.d.ok && r.d.enviado && DB.entregas[0].etapa === "oferecida" && /^[a-f0-9]{40}$/.test(tokenJoao), "pedido oferecido ao João, com link de 8 horas");
ok(zap[0]?.number === "5516999990000" && /Cobrar na entrega: \*R\$\s?64,79\*/.test(zap[0].text) && zap[0].text.includes("entregador.html?t=" + tokenJoao), "João recebeu no WhatsApp o endereço, o valor a cobrar e o link");
r = await call({ action: "motoboy_estado", t: tokenJoao }); ok(r.d.entregas.length === 1 && r.d.entregas[0].cobrar === 64.79 && r.d.entregas[0].troco === "100" && r.d.entregas[0].mapa.includes("google.com/maps"), "tela do João mostra a entrega, o valor, o troco e o mapa");
r = await call({ action: "motoboy_recusar", t: tokenJoao, entrega_id: DB.entregas[0].id }); ok(DB.entregas[0].etapa === "aguardando_entregador" && DB.entregas[0].entregador_id === null && DB.entregas[0].recusas.length === 1, "João recusou: volta para a equipe escolher outro");
r = await call({ action: "atribuir", order_id: "so1", entregador_id: "e2" }, "JWT-DONO");
const tokenPedro = DB.entregador_links.find((l) => l.entregador_id === "e2").token;
r = await call({ action: "motoboy_aceitar", t: tokenJoao, entrega_id: DB.entregas[0].id }); ok(r.s === 404, "João não consegue aceitar a entrega que agora é do Pedro");
r = await call({ action: "motoboy_aceitar", t: tokenPedro, entrega_id: DB.entregas[0].id });
const ks = chamadasOrders.find((c) => c.action === "kitchen_status" && c.status === "saiu_entrega");
ok(DB.entregas[0].etapa === "em_rota" && ks && ks.texto.includes("rastreio.html?r=" + DB.entregas[0].rastreio_token), "Pedro aceitou: saiu para entrega e o cliente recebe o link de rastreio");
await call({ action: "motoboy_posicao", t: tokenPedro, lat: -22.01, lng: -47.89, precisao: 12 });
r = await call({ action: "rastreio", r: DB.entregas[0].rastreio_token });
ok(r.d.etapa === "em_rota" && r.d.posicao?.lat === -22.01 && r.d.entregador.nome === "Pedro", "o cliente vê o Pedro no mapa");
await call({ action: "motoboy_cheguei", t: tokenPedro, entrega_id: DB.entregas[0].id });
ok(DB.entregas[0].etapa === "chegou" && chamadasOrders.some((c) => c.action === "notify_customer" && /chegou/.test(c.texto)), "Cheguei: o cliente é avisado");
r = await call({ action: "motoboy_entregue", t: tokenPedro, entrega_id: DB.entregas[0].id, forma: "dinheiro" }); ok(r.s === 400, "não dá baixa sem confirmar que recebeu o pagamento");
r = await call({ action: "motoboy_entregue", t: tokenPedro, entrega_id: DB.entregas[0].id, forma: "dinheiro", recebido: true });
ok(DB.entregas[0].etapa === "entregue" && DB.entregas[0].recebido_na_entrega === 64.79 && chamadasOrders.some((c) => c.action === "provider_paid" && c.metodo === "dinheiro") && DB.orders[0].status === "entregue", "entregue: pagamento em dinheiro registrado e a cozinha concluída");
DB.entregador_links.find((l) => l.token === tokenPedro).expira_em = "2020-01-01T00:00:00Z";
r = await call({ action: "motoboy_estado", t: tokenPedro }); ok(r.s === 401, "link expirado não abre mais");
r = await call({ action: "motoboy_estado", t: "naoexiste" }); ok(r.s === 401, "link inventado não abre");
r = await call({ action: "rastreio", r: "x" }); ok(r.s === 404, "rastreio com código inválido não mostra nada");

// ---------- Entregador com login (aba Minhas entregas) ----------
DB.sales_orders.push({ ...DB.sales_orders[0], id: "so2", numero: 1051, status: "pago", pagamento: {} });
DB.orders.push({ id: "t2", sales_order_id: "so2", status: "pronto" });
const zapAntes = zap.length;
r = await call({ action: "atribuir", order_id: "so2", entregador_id: "e3" }, "JWT-DONO");
ok(r.d.na_tela && zap.length === zapAntes, "entregador com login: a entrega aparece na tela dele, sem mensagem no WhatsApp");
r = await call({ action: "motoboy_estado" }, "a.JWT-ZE.c");
ok(r.s === 200 && r.d.logado && r.d.entregas.some((e) => e.numero === 1051) && r.d.rastreio_ativo === false, "Zé vê a entrega na tela Minhas entregas (rastreio ainda desligado)");
r = await call({ action: "motoboy_posicao", lat: -22, lng: -47 }, "a.JWT-ZE.c"); ok(r.d.sem_link === true, "sem o link de rastreio do dia, a localização não é guardada");
r = await call({ action: "link_entregador", entregador_id: "e3", enviar: true }, "JWT-DONO");
ok(zap.at(-1)?.number === "5516999992222" && /link de rastreio/.test(zap.at(-1).text) && !/Nova entrega/.test(zap.at(-1).text), "pelo WhatsApp ele recebe só o link de rastreio");
r = await call({ action: "motoboy_posicao", lat: -22, lng: -47 }, "a.JWT-ZE.c"); ok(r.d.ok === true, "com o link do dia, a localização da tela Minhas entregas é guardada");
const enZe = DB.entregas.find((e) => e.sales_order_id === "so2");
r = await call({ action: "motoboy_aceitar", entrega_id: enZe.id }, "a.JWT-ZE.c"); ok(enZe.etapa === "em_rota", "Zé aceita pela tela dele");
r = await call({ action: "motoboy_estado" }, "a.JWT-GARCOM.c"); ok(r.s === 401, "funcionário sem a função Entregador não usa a tela de entregas");
