import asyncio, sys
from playwright.async_api import async_playwright
W="window.__w=(window.__w||0)+1"
SB="function q(t){let single=false;const o={select(){return o},order(){return o},limit(){return o},range(){return o},eq(){return o},neq(){return o},gte(){return o},lte(){return o},lt(){return o},gt(){return o},in(){return o},or(){return o},not(){return o},is(){return o},ilike(){return o},contains(){return o},maybeSingle(){single=true;return o},single(){single=true;return o},insert(){"+W+";return o},update(){"+W+";return o},delete(){"+W+";return o},upsert(){"+W+";return Promise.resolve({})},then(r,j){return Promise.resolve({data:single?null:[],error:null,count:0}).then(r,j)}};return o} export const supabase={from:q,rpc:async()=>({data:null}),storage:{from:()=>({upload:async()=>({}),getPublicUrl:()=>({data:{publicUrl:''}})})},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},auth:{getSession:async()=>({data:{session:{user:{id:'o1'}}}}),getUser:async()=>({data:{user:{id:'o1',email:'d@x.com'}}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},functions:{invoke:async(n,o)=>{if(o?.body?.action!=='status'&&o?.body?.action!=='list'){"+W+"};return {data:{}}}}};"
import re as _re
_sb=open('js/sidebar.js').read()
_fora=_re.search(r'const ESQUELETO_FORA = `(.*?)`;', _sb, _re.S).group(1)
_menu=_re.search(r'const ESQUELETO_MENU = `(.*?)`;', _sb, _re.S).group(1)
ESQ="(function(){const s=document.querySelector('.dash-shell');if(s&&!s.querySelector('.dash-side')){s.insertAdjacentHTML('beforebegin',"+repr(_fora).replace("\\n"," ")+");s.insertAdjacentHTML('afterbegin',"+repr(_menu).replace("\\n"," ")+");}})();"
STUBS={"auth.js":"export async function requireSession(){return {user:{id:'o1'}}} export function signOut(){} export async function getSession(){return {user:{id:'o1'}}}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":ESQ+"export async function renderSidebar(){document.body.dataset.nicho='restaurante';document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">x</a>'} export async function getAccess(){return {isStaff:true,can:()=>true}} export async function getDisabledTabs(){return []} export async function saveDisabledTabs(){} export const NAV_ITEMS=[{key:'kanban',label:'Kanban'},{key:'mesas',label:'Mesas'}];",
 "workspace.js":"export async function getMyAccess(){return {member:null}} export async function getWorkspaceOwnerId(){return 'o1'} export async function isTeamMember(){return false}",
 "supabaseClient.js":SB}
async def run(page):
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1366,"height":820}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route); await pg.route("**/cdn.jsdelivr.net/**",lambda r: r.fulfill(body="window.Chart=function(){return {destroy(){},update(){}}};",content_type="application/javascript"))
    await pg.goto(f"http://localhost:8765/{page}.html")
    try: await pg.wait_for_selector('[data-tool="simular"]',timeout=8000)
    except Exception: print("  SEM BOTÃO. erros:",errs); await b.close(); return
    await pg.click('[data-tool="simular"]'); await pg.wait_for_selector(".sim-intro"); await pg.click('[data-s="go"]')
    i=0
    while True:
      await pg.wait_for_selector("#sim-painel"); await pg.wait_for_timeout(350); i+=1
      d=await pg.evaluate("!!document.querySelector('.sim-destaque')")
      print(f"  {i}. {await pg.inner_text('#sim-painel h4')} | destaque={'sim' if d else 'NÃO'} | fictícios={await pg.evaluate('document.querySelectorAll(\"[data-sim-tmp]\").length')}")
      await pg.screenshot(path=f"tests/saida/x_{page}{i}.png")
      last=(await pg.inner_text('#sim-painel [data-s="ok"]'))=="Concluir"
      await pg.click('#sim-painel [data-s="ok"]')
      if last: break
    await pg.wait_for_timeout(400)
    print(f"  fim: restos={await pg.evaluate('document.querySelectorAll(\"[data-sim-tmp],.sim-mark\").length')} | gravações={await pg.evaluate('window.__w||0')} | cliques liberados={await pg.evaluate('document.querySelector(\".dash-main\").style.pointerEvents!==\"none\"')} | erros={errs}")
    await b.close()
for page in sys.argv[1:]:
  print("==",page); asyncio.run(run(page))
