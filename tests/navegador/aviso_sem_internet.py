import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_menu_real.py').read().split("async def main():")[0].replace("?v=86","?v=87").replace("?v=85","?v=87"))
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1300,"height":850}); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/caixa.html"); await pg.wait_for_selector(".nav-grupo"); await pg.wait_for_timeout(1500)
    print("cópia das páginas registrada:",await pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)"))
    await ctx.set_offline(True); await pg.evaluate("window.dispatchEvent(new Event('offline'))"); await pg.wait_for_timeout(300)
    print("aviso:",await pg.evaluate("document.getElementById('aviso-offline')?.textContent||'-'"))
    await pg.screenshot(path="tests/saida/off.png")
    await ctx.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(300)
    print("internet voltou, aviso some:",await pg.evaluate("!document.getElementById('aviso-offline')"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
