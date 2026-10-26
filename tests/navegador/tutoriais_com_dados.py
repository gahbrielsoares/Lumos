import asyncio, sys
from playwright.async_api import async_playwright
W="window.__w=(window.__w||0)+1"
BASE={"auth.js":"export async function requireSession(){} export function signOut(){}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":"export async function renderSidebar(){document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">x</a>'} export async function getAccess(){return {isStaff:true}}",
 "workspace.js":"export async function getMyAccess(){return {member:null}} export async function getWorkspaceOwnerId(){return 'o1'} export async function isTeamMember(){return false}"}
def sb(data):
  return "const DATA="+data+";function q(t){let rows=DATA[t]||[];let single=false;const o={select(){return o},order(){return o},limit(){return o},range(){return o},eq(){return o},gte(){return o},lte(){return o},lt(){return o},in(){return o},or(){return o},maybeSingle(){single=true;return o},single(){single=true;return o},insert(){"+W+";return o},update(){"+W+";return o},delete(){"+W+";return o},upsert(){"+W+";return Promise.resolve({})},then(r){r({data:single?(rows[0]||null):rows,error:null})}};return o} export const supabase={from:q,auth:{getUser:async()=>({data:{user:{id:'o1',email:'d@x.com'}}})},functions:{invoke:async(n,o)=>{if(o?.body?.action!=='status'){"+W+"};return {data:{conectado:false,config:{}}}}}};"
PAGES={
 "cozinha":dict(BASE,**{"supabaseClient.js":sb("{}"),
   "orders.js":"export async function listOrders(){return [{id:'o9',status:'novo_pedido',tipo:'mesa',created_at:new Date().toISOString(),total:30,order_items:[{quantity:1,product_name:'Suco'}],leads:{name:'Real'}}]} export async function updateOrderStatus(){"+W+"} export async function createOrder(){"+W+"} export const ORDER_STATUS_LABELS={novo_pedido:'Novo pedido',em_preparo:'Em preparo',pronto:'Pronto',saiu_entrega:'Saiu p/ entrega',entregue:'Entregue'}; export async function setKitchenStatus(){"+W+"}",
   "businessConfig.js":"export async function getDisabledStages(){return []} export async function saveDisabledStages(){}",
   "tables.js":"export async function listTables(){return []} export async function getActiveSession(){return null} export async function listSessionLeads(){return []}"}),
 "caixa":dict(BASE,**{"supabaseClient.js":sb("{caixas:[],caixa_movs:[],sales_orders:[]}")}),
 "financeiro":dict(BASE,**{"supabaseClient.js":sb("{fin_lancamentos:[{id:'real1',tipo:'despesa',descricao:'Real',valor:10,vencimento:'2026-10-01'}]}")}),
 "contabilidade":dict(BASE,**{"supabaseClient.js":sb("{fiscal_config:[{dados:{regime:'simples',uf:'SP'}}]}"),"businessConfig.js":"export async function getBusinessConfig(){return {business_type:'restaurante'}}"}),
 "fiscal":dict(BASE,**{"supabaseClient.js":sb("{}")}),
 "ficha-tecnica":dict(BASE,**{"supabaseClient.js":sb("{products:[{id:'r1',name:'Batata real',price:20,is_insumo:false,active:true}],product_recipes:[]}")}),
}
async def run(page):
  stubs=PAGES[page]
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1366,"height":820}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in stubs: await r.fulfill(body=stubs[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto(f"http://localhost:8765/{page}.html"); 
    try: await pg.wait_for_selector('[data-tool="simular"]',timeout=8000)
    except Exception: print("  ERROS DA PÁGINA:",errs); await b.close(); return
    await pg.click('[data-tool="simular"]'); await pg.wait_for_selector(".sim-intro"); await pg.click('[data-s="go"]')
    i=0
    while True:
      await pg.wait_for_selector("#sim-painel"); await pg.wait_for_timeout(450); i+=1
      extra=""
      if page=="ficha-tecnica": extra=await pg.evaluate("(()=>{const r=document.querySelector('tr[data-id=\"sim-prato\"]')||document.querySelector('tr[data-ins=\"sim-carne\"]');return r?r.innerText.replace(/\\s+/g,' ').slice(0,90):''})()")
      if page=="cozinha": extra=await pg.evaluate("[...document.querySelectorAll('[data-sim-ped]')].map(c=>c.dataset.simPed+'@'+c.closest('.kanban-col').dataset.status).join(', ')")
      if page=="financeiro": extra=await pg.evaluate("[...document.querySelectorAll('.panel-stat-card .value')].map(x=>x.innerText).join(' / ')+' | linhas='+document.querySelectorAll('#rows tr').length")
      if page=="contabilidade": extra=await pg.evaluate("[...document.querySelectorAll('#relatorio .panel-stat-card .value')].map(x=>x.innerText).join(' / ')")
      if page=="fiscal": extra=await pg.evaluate("[...document.querySelectorAll('#rows tr')].map(t=>t.innerText.replace(/\\s+/g,' ').slice(0,60)).join(' || ')")
      if page=="caixa": extra=await pg.evaluate("(()=>{const v=[...document.querySelectorAll('#atual .panel-stat-card .value')].map(x=>x.innerText);return v.join(' / ')||(document.getElementById('sim-fecha')?'janela de fechamento':'caixa fechado')})()")
      print(f"  {i}. {await pg.inner_text('#sim-painel h4')} | {extra}")
      await pg.screenshot(path=f"tests/saida/{page}{i}.png")
      last=(await pg.inner_text('#sim-painel [data-s="ok"]'))=="Concluir"
      await pg.click('#sim-painel [data-s="ok"]')
      if last: break
    await pg.wait_for_timeout(500)
    sobra=await pg.evaluate("document.querySelectorAll('.sim-card,.sim-mark,[data-sim],#sim-fecha,.cr-simrow').length")
    print(f"  fim: restos de simulação na tela={sobra} | gravações no banco={await pg.evaluate('window.__w||0')} | erros={errs}")
    await b.close()
for page in sys.argv[1:]:
  print("==",page); asyncio.run(run(page))
