"""Delivery: quadro por etapa, ações no cartão (aprovar, item indisponível com sugestões, entregador), entregador e rastreio."""
import asyncio, json
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0])
STUBS["supabaseClient.js"] = r'''
const agora = Date.now(), min = (m) => new Date(agora - m * 60000).toISOString();
const SO = (id, numero, status, extra = {}) => ({ id, numero, owner_id: "o1", status, created_at: min(extra.ha || 5), total: 64.79, frete: 5.9,
  itens: [{ nome: "Pizza Margherita", product_id: "p1", quantidade: 1, subtotal: 58.89 }], cliente: { nome: "Alessandro Lima", telefone: "5516988887777" },
  entrega: { tipo: "delivery", cozinha: true, endereco: { rua: "Rua A", numero: "10", bairro: "Centro" } }, pagamento: {}, ...extra });
const DB = {
  sales_orders: [SO("a", 1101, "aguardando_aprovacao", { ha: 3 }), SO("b", 1102, "aguardando_pagamento"), SO("c", 1103, "pago"), SO("d", 1104, "pago"),
    SO("e", 1105, "pago", { ha: 70 }), SO("f", 1106, "aguardando_pagamento", { pagamento: { preferencia: "na_entrega" } }), SO("m", 1200, "pago", { entrega: { tipo: "mesa", cozinha: true } })],
  orders: [{ id: "t1", sales_order_id: "d", status: "em_preparo" }, { id: "t2", sales_order_id: "e", status: "pronto" }],
  entregas: [], entregadores: [{ id: "e1", owner_id: "o1", nome: "João Moto", telefone: "16999990000", taxa_entrega: 7, ativo: true }], entregador_links: [],
  delivery_config: [], product_categories: [{ product_id: "p1", categories: { name: "Pizzas" } }, { product_id: "p2", categories: { name: "Pizzas" } }, { product_id: "p3", categories: { name: "Pizzas" } }],
  produtos_venda: [{ id: "p1", name: "Pizza Margherita", price: 50, active: true }, { id: "p2", name: "Pizza Calabresa", price: 50, active: true }, { id: "p3", name: "Pizza Portuguesa", price: 55, active: true }],
};
window.__fn = [];
function q(t) { let rows = [...(DB[t] || [])]; let single = false; const o = { select() { return o; }, order() { return o; }, limit() { return o; }, gte() { return o; }, gt() { return o; },
  eq(k, v) { if (k !== "owner_id") rows = rows.filter((r) => r[k] === v); return o; }, neq(k, v) { rows = rows.filter((r) => r[k] !== v); return o; }, in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return o; },
  maybeSingle() { single = true; return o; }, upsert(x) { DB[t] = [x]; return Promise.resolve({ error: null }); }, insert(x) { DB[t].push({ id: "n" + DB[t].length, ...x }); return Promise.resolve({ error: null }); },
  then(r, j) { return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(r, j); } }; return o; }
export const supabase = { from: q, rpc: async () => ({ data: null }), auth: { getUser: async () => ({ data: { user: { id: "o1" } } }) },
  functions: { invoke: async (n, { body }) => { window.__fn.push([n, body]);
    if (body.action === "motoboy_estado") return { data: { entregador: { nome: "João Moto" }, expira_em: new Date(agora + 8 * 3600e3).toISOString(), autorizado: false,
      entregas: [{ id: "x1", etapa: "oferecida", numero: 1105, cliente: "Alessandro", endereco: "Rua A, 10 - Centro", mapa: "https://www.google.com/maps/dir/?api=1&destination=x", itens: ["1x Pizza"], cobrar: 64.79, troco: "100" }] } };
    if (body.action === "rastreio") return { data: { numero: 1105, etapa: "em_rota", entregador: { nome: "João" }, posicao: null } };
    if (body.action === "atribuir") return { data: { ok: true, enviado: true } };
    return { data: { ok: true } }; } } };'''
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg = await b.new_page(viewport={"width": 1500, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    async def route(r):
      name = r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name], content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*", route)
    await pg.route("**/cdnjs.cloudflare.com/**", lambda r: r.fulfill(body="", content_type="text/plain"))
    ok = lambda c, m: print(("ok: " if c else "FALHOU: ") + m)
    await pg.goto("http://localhost:8765/delivery.html"); await pg.wait_for_selector(".dl-col")
    cols = await pg.eval_on_selector_all(".dl-col h4", "e=>e.map(x=>x.innerText.replace(/\\s+/g,' '))")
    ok(cols[0].endswith("1") and cols[1].endswith("1") and cols[2].endswith("2") and cols[3].endswith("1") and cols[4].endswith("1"), "cada pedido na sua coluna (e o da mesa fica de fora): " + " | ".join(cols))
    ok(await pg.locator('.dl-card.atraso[data-so="e"]').count() == 1, "pedido de 70 min fica vermelho (atrasado)")
    ok(await pg.locator('[data-so="f"] .tag.warn').count() == 1, "pedido a pagar na entrega mostra o valor a cobrar")
    await pg.screenshot(path="tests/saida/delivery1.png")
    await pg.click('[data-so="a"]'); await pg.wait_for_selector('[data-a="indisponivel"]')
    await pg.click('[data-a="indisponivel"]'); await pg.wait_for_selector("#m-falta")
    await pg.check("#m-falta input"); await pg.wait_for_timeout(200)
    sug = await pg.eval_on_selector_all("#m-sug label", "e=>e.map(x=>x.innerText.trim())")
    txt = await pg.input_value("#m-texto")
    ok("Pizza Calabresa" in sug and "Pizza Portuguesa" in sug and "Pizza Margherita" not in sug, "sugestões da mesma categoria: " + ", ".join(sug))
    ok("*Pizza Margherita* está indisponível" in txt and "*Pizza Calabresa*" in txt, "mensagem pronta com o item e as sugestões")
    await pg.screenshot(path="tests/saida/delivery2.png")
    await pg.click("#m-enviar"); await pg.wait_for_timeout(300)
    ok(any(c[0] == "entregas" and c[1]["action"] == "recusar" and "indisponível" in c[1]["texto"] for c in await pg.evaluate("window.__fn")), "enviar: a mensagem vai para o cliente e o pedido é encerrado")
    await pg.click('[data-so="c"]'); await pg.click('[data-a="cozinha"]'); await pg.wait_for_timeout(300)
    ok(any(c[0] == "orders" and c[1]["action"] == "send_kitchen" for c in await pg.evaluate("window.__fn")), "pedido pago: Enviar para a cozinha")
    await pg.click('[data-so="e"]'); await pg.wait_for_selector("#m-ent"); await pg.click('[data-a="atribuir"]'); await pg.wait_for_timeout(300)
    ok(any(c[1].get("action") == "atribuir" and c[1].get("entregador_id") == "e1" for c in await pg.evaluate("window.__fn")), "pedido pronto: selecionar entregador e enviar")
    await pg.click('[data-aba="config"]'); await pg.select_option("#cf-aprov", "automatica"); await pg.fill("#cf-min", "30"); await pg.click("#cf-salvar"); await pg.wait_for_timeout(200)
    ok("salva" in await pg.inner_text("#cf-msg-salvo"), "configuração salva")
    await pg.click('[data-pausa="30"]'); await pg.wait_for_timeout(200)
    ok("Pausado até" in await pg.inner_text("#dl-status"), "pausar 30 min mostra o horário de volta")
    # Entregador e rastreio
    e = await b.new_page(viewport={"width": 390, "height": 844}); await e.route("**/js/*.js*", route)
    await e.goto("http://localhost:8765/entregador.html?t=" + "a" * 40); await e.wait_for_selector("[data-a='aceitar']")
    ok("64,79" in await e.inner_text("#mb-lista") and "Troco para 100" in await e.inner_text("#mb-lista"), "tela do entregador: valor a cobrar e troco")
    await e.screenshot(path="tests/saida/entregador.png")
    rs = await b.new_page(viewport={"width": 390, "height": 844}); await rs.route("**/js/*.js*", route); await rs.route("**/cdnjs.cloudflare.com/**", lambda r: r.fulfill(body="", content_type="text/plain"))
    await rs.goto("http://localhost:8765/rastreio.html?r=" + "b" * 40); await rs.wait_for_timeout(800)
    ok("João está a caminho" in await rs.inner_text("#rs-card"), "rastreio do cliente mostra quem está a caminho")
    await rs.screenshot(path="tests/saida/rastreio.png")
    print("ERROS", errs); await b.close()
asyncio.run(main())
