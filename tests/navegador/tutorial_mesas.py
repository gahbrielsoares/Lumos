import asyncio
from playwright.async_api import async_playwright
import re as _re
_sb=open('js/sidebar.js').read()
_fora=_re.search(r'const ESQUELETO_FORA = `(.*?)`;', _sb, _re.S).group(1)
_menu=_re.search(r'const ESQUELETO_MENU = `(.*?)`;', _sb, _re.S).group(1)
ESQ="(function(){const s=document.querySelector('.dash-shell');if(s&&!s.querySelector('.dash-side')){s.insertAdjacentHTML('beforebegin',"+repr(_fora).replace("\\n"," ")+");s.insertAdjacentHTML('afterbegin',"+repr(_menu).replace("\\n"," ")+");}})();"
STUBS={"auth.js":"export async function requireSession(){} export function signOut(){}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":ESQ+"export async function renderSidebar(){document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">x</a>'} export async function getAccess(){return {isStaff:true}}",
 "tables.js":"export async function listTables(){return [{id:'t1',label:'Mesa 1',status:'ocupada'},{id:'t2',label:'Mesa 2',status:'livre'}]} export async function createTable(){} export async function deleteTable(){} export async function getActiveSession(id){return id==='t1'?{id:'s1'}:null} export async function listSessionLeads(){return [{id:'l1',name:'Joana',phone:'5516911112222',visit_status:'iniciado'}]} export async function closeSession(){}",
 "orders.js":"export async function listOrdersBySession(){return []} export async function createOrder(){window.__writes=(window.__writes||0)+1}",
 "supabaseClient.js":"function q(){const o={select(){return o},eq(){return o},order(){return o},limit(){return o},maybeSingle(){return o},insert(){window.__writes=(window.__writes||0)+1;return o},update(){window.__writes=(window.__writes||0)+1;return o},then(r){r({data:[]})}};return o} export const supabase={from:q,functions:{invoke:async()=>{window.__writes=(window.__writes||0)+1;return {data:{}}}}};",
 "workspace.js":"export async function getMyAccess(){return {member:null}} export async function getWorkspaceOwnerId(){return 'o1'}",
 "agents.js":"export async function listAgents(){return []}"}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1366,"height":820}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/mesas.html"); await pg.wait_for_selector('[data-tool="simular"]')
    print("mesas reais:",await pg.eval_on_selector_all(".kanban-col h4","e=>e.map(x=>x.innerText.replace(/\\s+/g,' '))"))
    await pg.click('[data-tool="simular"]'); await pg.wait_for_selector(".sim-intro"); await pg.click('[data-s="go"]')
    for i in range(6):
      await pg.wait_for_selector("#sim-painel"); await pg.wait_for_timeout(450)
      col=await pg.evaluate("(()=>{const c=document.querySelector('[data-sim-mesa]');return c?c.innerText.replace(/\\s+/g,' ').slice(0,110):'-'})()")
      print(f"{i+1}. {await pg.inner_text('#sim-painel h4')} | conta aberta={await pg.evaluate('!!document.getElementById(\"sim-conta\")')} | {col}")
      await pg.screenshot(path=f"tests/saida/m{i+1}.png")
      await pg.click('#sim-painel [data-s="ok"]')
    await pg.wait_for_timeout(400)
    print("depois: mesa fictícia some:",await pg.evaluate("!document.querySelector('[data-sim-mesa]')"),"| reais:",await pg.eval_on_selector_all(".kanban-col h4","e=>e.length"),"| gravações:",await pg.evaluate("window.__writes||0"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
