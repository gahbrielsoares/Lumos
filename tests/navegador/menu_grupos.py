import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_menu_real.py').read().split("async def main():")[0].replace("?v=92","?v=92"))
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1300,"height":850}, service_workers="block"); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    await pg.add_init_script("localStorage.setItem('lumos:modo-demo','dev')")
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/caixa.html"); await pg.wait_for_selector(".nav-grupo"); await pg.wait_for_timeout(800)
    est=lambda: pg.eval_on_selector_all(".nav-grupo","e=>e.map(g=>g.querySelector('.nav-grupo-btn span').textContent+(g.classList.contains('aberto')?' (aberto: '+[...g.querySelectorAll('.nav-grupo-itens a')].map(a=>a.textContent.trim()).join(', ')+')':''))")
    print("na página Caixa:",await est())
    await pg.screenshot(path="tests/saida/menu1.png")
    await pg.click('[data-grupo="config"] .nav-grupo-btn'); print("abrindo Configuração:",await est())
    await pg.screenshot(path="tests/saida/menu2.png")
    m=await ctx.new_page(); await m.set_viewport_size({"width":390,"height":844}); await m.route("**/js/*.js*",route)
    await m.goto("http://localhost:8765/kanban.html"); await m.wait_for_selector(".nav-grupo"); await m.click("#mobile-nav-toggle"); await m.wait_for_timeout(500); await m.screenshot(path="tests/saida/menu3.png")
    print("ERROS",errs); await b.close()
asyncio.run(main())
