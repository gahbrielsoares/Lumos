import asyncio
from playwright.async_api import async_playwright
FAKE = r'''
const d=(n)=>new Date(Date.now()-n*3600000).toISOString();
const LEADS=[{id:"a",name:"Carla",phone:"1",stage:"novo_contato",created_at:d(1),last_message_at:d(1)},{id:"b",name:"Bruno",phone:"2",stage:"conversando",created_at:d(2),last_message_at:d(2)}];
window.__writes=0;
function q(){const o={select(){return o},order(){return o},eq(){return o},or(){return o},update(){window.__writes++;return o},then(r){r({data:LEADS})}};return o}
export const supabase={from:()=>q()};
'''
import re as _re
_sb=open('js/sidebar.js').read()
_fora=_re.search(r'const ESQUELETO_FORA = `(.*?)`;', _sb, _re.S).group(1)
_menu=_re.search(r'const ESQUELETO_MENU = `(.*?)`;', _sb, _re.S).group(1)
ESQ="(function(){const s=document.querySelector('.dash-shell');if(s&&!s.querySelector('.dash-side')){s.insertAdjacentHTML('beforebegin',"+repr(_fora).replace("\\n"," ")+");s.insertAdjacentHTML('afterbegin',"+repr(_menu).replace("\\n"," ")+");}})();"
STUBS={"auth.js":"export async function requireSession(){} export function signOut(){}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":ESQ+"export async function renderSidebar(){document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">x</a>'} export async function getAccess(){return {isStaff:true}}",
 "agents.js":"export async function listAgents(){return []}",
 "businessConfig.js":"export async function getBusinessConfig(){return {business_type:'restaurante'}} export async function getDisabledStages(){return ['consulta_agendada','compareceu','follow_up','perdido']} export async function saveDisabledStages(){}",
 "leadPanel.js":"export function openLeadPanel(){}","supabaseClient.js":FAKE}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1366,"height":800}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/kanban.html"); await pg.wait_for_selector('[data-tool="simular"]')
    print("colunas:",await pg.eval_on_selector_all(".kanban-col-header h4","e=>e.map(x=>x.innerText.replace(/\\s+\\d+$/,''))"))
    await pg.click('[data-tool="simular"]'); await pg.wait_for_selector(".sim-intro")
    print("intro:",await pg.eval_on_selector_all(".sim-bloco b","e=>e.map(x=>x.innerText)"))
    await pg.screenshot(path="tests/saida/s0.png")
    await pg.click('[data-s="go"]')
    for i in range(4):
      await pg.wait_for_selector("#sim-painel"); await pg.wait_for_timeout(500)
      col=await pg.evaluate("document.querySelector('.sim-card')?.closest('.kanban-col')?.dataset.stage")
      txt=await pg.inner_text("#sim-painel p")
      print(f"passo {i+1}: card em {col} | {txt[:80]}")
      await pg.screenshot(path=f"tests/saida/s{i+1}.png")
      await pg.click('#sim-painel [data-s="ok"]')
    await pg.wait_for_timeout(300)
    print("depois:",await pg.evaluate("!!document.querySelector('.sim-card')"),"painel:",await pg.evaluate("!!document.getElementById('sim-painel')"),"gravações no banco:",await pg.evaluate("window.__writes"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
