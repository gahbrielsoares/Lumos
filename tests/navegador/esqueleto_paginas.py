import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_menu_real.py').read().split("async def main():")[0].replace("?v=89","?v=89").replace("?v=89","?v=89"))
PAGES=["dashboard","kanban","clientes","agendamentos","products","mesas","cozinha","ficha-tecnica","estoque","compras","pdv","financeiro","relatorios","contabilidade","fiscal","agents","integracoes","equipe","settings","admin","leads","follow-up"]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1300,"height":850}, service_workers="block")
    await ctx.add_init_script("localStorage.setItem('lumos:modo-demo','dev')")
    ruins=[]
    for pag in PAGES:
      pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:120]))
      async def route(r):
        name=r.request.url.split("/js/")[-1].split("?")[0]
        if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
        else: await r.continue_()
      await pg.route("**/js/*.js*",route)
      await pg.goto(f"http://localhost:8765/{pag}.html"); await pg.wait_for_timeout(1300)
      st=await pg.evaluate("({menu:!!document.querySelector('.dash-side .nav-grupo, .dash-side #dash-nav a'), logo:!!document.querySelector('.dash-side .logo'), tema:!!document.getElementById('theme-toggle-label')?.textContent, celular:!!document.getElementById('mobile-nav-toggle')})")
      ok=all(st.values()) and not errs
      if not ok: ruins.append((pag,st,errs))
      await pg.close()
    print("páginas conferidas:",len(PAGES),"| com problema:",len(ruins))
    for r in ruins: print("  ",r)
    await b.close()
asyncio.run(main())
