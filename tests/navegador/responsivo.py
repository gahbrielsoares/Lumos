"""Responsividade: abre cada página na largura de um celular e lista o que passa da borda da tela.
Áreas feitas para rolar de lado (tabelas largas com overflow-x) não contam."""
import asyncio, sys
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_menu_real.py').read().split("async def main():")[0])
# Contatos de exemplo para os gráficos terem o que desenhar
STUBS["supabaseClient.js"] = STUBS["supabaseClient.js"].replace('const rows=t==="profiles"?[PERFIL]:', 'const LEADS=Array.from({length:40},(_,i)=>({id:"l"+i,name:"Cliente "+i,phone:"55169999"+i,stage:"novo_contato",created_at:new Date(Date.now()-(i%7)*86400000-(i%12)*3600000).toISOString(),last_message_at:new Date(Date.now()-(i%7)*86400000).toISOString()}));const rows=t==="leads"?LEADS:t==="profiles"?[PERFIL]:')
PAGES = sys.argv[1:] or ["dashboard","kanban","clientes","agendamentos","products","mesas","cozinha","ficha-tecnica","estoque","compras","pdv","financeiro","relatorios","contabilidade","fiscal","agents","integracoes","equipe","settings","admin","leads","follow-up"]
VERIFICA = r"""() => {
  const W = document.documentElement.clientWidth, ruins = [];
  const rola = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  for (const el of document.querySelectorAll('main *, .dash-main *')) {
    const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).position === 'fixed') continue;
    if (r.right > W + 2 && !rola(el)) ruins.push(el);
  }
  // só o mais externo de cada grupo
  const topo = ruins.filter((el) => !ruins.some((o) => o !== el && o.contains(el)));
  return { pagina: document.documentElement.scrollWidth > W + 2, itens: topo.slice(0, 6).map((el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.')) + ' (' + Math.round(el.getBoundingClientRect().right - W) + 'px)') };
}"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", is_mobile=True, has_touch=True)
    problemas = 0
    for pag in PAGES:
      pg = await ctx.new_page()
      async def route(r):
        name = r.request.url.split("/js/")[-1].split("?")[0]
        if name in STUBS: await r.fulfill(body=STUBS[name], content_type="application/javascript")
        else: await r.continue_()
      await pg.route("**/js/*.js*", route)
      await pg.route("**/cdn.jsdelivr.net/npm/chart.js*", lambda r: r.fulfill(path="tests/.libs/chart.umd.js", content_type="application/javascript"))
      # Abre larga (computador) e depois estreita (janela diminuída, celular girado): os gráficos têm de acompanhar
      await pg.set_viewport_size({"width": 1300, "height": 900})
      await pg.goto(f"http://localhost:8765/{pag}.html"); await pg.wait_for_timeout(1500)
      await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(900)
      r = await pg.evaluate(VERIFICA)
      if __import__("os").environ.get("FOTOS"): await pg.screenshot(path=f"tests/saida/cel_{pag}.png", full_page=True)
      if r["pagina"] or r["itens"]:
        problemas += 1; print(f"  {pag}: rolagem lateral da página={r['pagina']} | {r['itens']}")
        await pg.screenshot(path=f"tests/saida/resp_{pag}.png", full_page=True)
      await pg.close()
    print(f"FALHOU: {problemas} página(s) com conteúdo saindo da tela" if problemas else "ok: nenhuma página com conteúdo saindo da tela")
    await b.close()
asyncio.run(main())
