import asyncio, json
from playwright.async_api import async_playwright
FAKE = r'''
const D=(n)=>new Date(Date.now()-n*86400000).toISOString();
const L=[
 {id:"l1",owner_id:"o1",name:"Adalberto",phone:"5516991112222",created_at:D(90),last_message_at:D(1),marketing_optin:true},
 {id:"l2",owner_id:"o1",name:"Beatriz",phone:"5516993334444",created_at:D(60),last_message_at:D(45),marketing_optin:null},
 {id:"l3",owner_id:"o1",name:"Carlos",phone:"5516995556666",created_at:D(2),last_message_at:D(2)},
 {id:"l4",owner_id:"o1",name:"Daniela",phone:"5516997778888",created_at:D(3),last_message_at:D(3),fu_optout:true,marketing_optin:true},
 {id:"l5",owner_id:"o1",name:"Ênio",phone:"5516990001111",created_at:D(20),last_message_at:D(5),marketing_optin:false},
 {id:"l6",owner_id:"o1",name:"",dados_cliente:{nome:"Fernanda Rocha"},phone:"5516912345678",created_at:D(1),last_message_at:D(1)}];
const V=[["l1",80,1],["l1",100,1],["l1",90,10],["l1",95,40],["l2",120,45],["l3",60,2],["l5",70,5],["l5",50,25],["l6",999,1,true]]
 .map(([lead_id,t,n,sim],i)=>({lead_id,total:t,paid_at:D(n),pagamento:{valor_cobrado:t},simulado:!!sim,status:"pago",owner_id:"o1"}));
window.__upd=[];
function q(t){let rows=t==="leads"?L:t==="sales_orders"?V:[];let upd=null;const o={select(){return o},order(){return o},range(){return o},
 eq(k,v){if(upd){window.__upd.push([v,upd]);return Promise.resolve({error:null})}rows=rows.filter(r=>r[k]===v);return o},
 update(x){upd=x;return o},then(r){r({data:rows,error:null})}};return o}
export const supabase={from:q};
'''
import re as _re
_sb=open('js/sidebar.js').read()
_fora=_re.search(r'const ESQUELETO_FORA = `(.*?)`;', _sb, _re.S).group(1)
_menu=_re.search(r'const ESQUELETO_MENU = `(.*?)`;', _sb, _re.S).group(1)
ESQ="(function(){const s=document.querySelector('.dash-shell');if(s&&!s.querySelector('.dash-side')){s.insertAdjacentHTML('beforebegin',"+repr(_fora).replace("\\n"," ")+");s.insertAdjacentHTML('afterbegin',"+repr(_menu).replace("\\n"," ")+");}})();"
STUBS={"auth.js":"export async function requireSession(){} export function signOut(){}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":ESQ+"export async function renderSidebar(){document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">x</a>'} export async function getAccess(){return {isStaff:true}}",
 "agents.js":"export async function listAgents(){return []}","workspace.js":"export async function getWorkspaceOwnerId(){return 'o1'}",
 "businessConfig.js":"export async function getBusinessConfig(){return {business_type:'restaurante'}}",
 "leadPanel.js":"export function openLeadPanel(id){window.__aberto=id}","supabaseClient.js":FAKE}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1366,"height":900},accept_downloads=True); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    async def xl(r): await r.fulfill(path="tests/.libs/xlsx.full.min.js",content_type="application/javascript")
    await pg.route("**/cdnjs.cloudflare.com/**",xl)
    await pg.goto("http://localhost:8765/clientes.html"); await pg.wait_for_selector("#cr-lista tr[data-id]")
    print("view-list escondida:",await pg.is_hidden("#view-list"))
    print("cards:",await pg.eval_on_selector_all("#cr-cards .value","e=>e.map(x=>x.innerText)"))
    print("grupos:",await pg.eval_on_selector_all(".cr-seg","e=>e.map(x=>x.innerText.replace(/\\s+/g,' '))"))
    print("linhas:",await pg.eval_on_selector_all("#cr-lista tr","e=>e.map(x=>x.innerText.replace(/\\s+/g,' ')).slice(0,14)"))
    await pg.screenshot(path="tests/saida/c1.png",full_page=True)
    await pg.click('.cr-seg[data-s="sumidos"]'); print("sumidos:",await pg.eval_on_selector_all("#cr-lista tr[data-id] strong","e=>e.map(x=>x.innerText)"))
    await pg.click('.cr-seg[data-s="todos"]'); await pg.click('#cr-modo [data-m="dia"]'); await pg.wait_for_timeout(200)
    print("por dia:",await pg.eval_on_selector_all(".cr-dia-h","e=>e.map(x=>x.innerText.replace(/\\s+/g,' ')).slice(0,4)"))
    await pg.screenshot(path="tests/saida/c2.png",full_page=True)
    await pg.click('#cr-modo [data-m="nome"]')
    await pg.select_option('[data-opt="l2"]',"1"); await pg.wait_for_timeout(200); print("update:",await pg.evaluate("window.__upd"))
    print("aceitam agora:",await pg.inner_text('.cr-seg[data-s="aceitam"] span'))
    async with pg.expect_download() as d: await pg.click("#cr-excel")
    dl=await d.value; await dl.save_as("tests/saida/cli.xlsx"); print("excel:",dl.suggested_filename)
    await pg.click('tr[data-id="l3"] td'); print("abriu painel:",await pg.evaluate("window.__aberto"))
    await pg.click('[data-tool="simular"]'); await pg.click('[data-s="go"]')
    for i in range(5):
      await pg.wait_for_selector("#sim-painel"); await pg.wait_for_timeout(350)
      print(f"sim {i+1}:",(await pg.inner_text("#sim-painel h4")))
      if i==1: await pg.screenshot(path="tests/saida/c3.png")
      await pg.click('#sim-painel [data-s="ok"]')
    await pg.wait_for_timeout(300); print("fakes removidos:",await pg.evaluate("!document.querySelector('.cr-simrow')"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
