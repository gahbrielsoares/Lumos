import asyncio, json
from playwright.async_api import async_playwright
exec(open('tests/navegador/pdv_venda.py').read().split("async def main():")[0].replace("?v=89","?v=89").replace("?v=89","?v=89"))
STUBS["supabaseClient.js"]=STUBS["supabaseClient.js"].replace("functions:{invoke:async(n,{body})=>{window.__inv=body;","functions:{invoke:async(n,{body})=>{(window.__envios=window.__envios||[]).push(body);window.__inv=body;")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1300,"height":900}); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/pdv.html"); await pg.wait_for_selector(".pdv-prod")
    await ctx.set_offline(True); await pg.wait_for_timeout(300)
    print("aviso sem internet:",await pg.evaluate("document.getElementById('aviso-offline')?.textContent||'-'"))
    await pg.click('.pdv-prod[data-id="burger"]'); await pg.click('#formas [data-f="dinheiro"]'); await pg.fill("#recebido","50"); await pg.click("#finalizar"); await pg.wait_for_selector(".erp-modal")
    print("recibo offline:",(await pg.inner_text(".erp-modal")).replace("\n"," | ")[:160])
    await pg.click("#nova"); await pg.click('.pdv-prod[data-id="refri"]'); await pg.click("#finalizar"); await pg.wait_for_selector(".erp-modal"); await pg.click("#nova")
    print("fila:",await pg.inner_text("#pdv-fila"),"| enviadas até agora:",await pg.evaluate("(window.__envios||[]).length"))
    await ctx.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(800)
    envios=await pg.evaluate("window.__envios||[]")
    print("internet voltou: enviadas",len(envios),"| marcadas sem_internet:",all(e.get("sem_internet") for e in envios),"| ids únicos:",len({e["id_cliente"] for e in envios}),"| fila restante:",await pg.evaluate("document.getElementById('pdv-fila')?.textContent||'vazia'"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
