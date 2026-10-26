import asyncio, json
from playwright.async_api import async_playwright
FAKE = r'''
const OWNER="o1";
const iso=(d)=>new Date(d).toISOString();
const DB={
 products:[{id:"p1",owner_id:OWNER,name:"Picanha na chapa",custo:35,estoque:10,unit:"unidade",active:true},
           {id:"p2",owner_id:OWNER,name:"Coca-Cola lata",custo:3,estoque:48,unit:"unidade",active:true},
           {id:"p3",owner_id:OWNER,name:"Cerveja Heineken",custo:null,estoque:null,unit:"unidade",active:true}],
 product_fiscal:[{product_id:"p1",owner_id:OWNER,ncm:"21069090",cfop:"5101",tipo:"producao",csosn:"102",cst_pis:"49"}],
 fiscal_config:[{owner_id:OWNER,dados:{regime:"simples",uf:"SP",razao_social:"Bar do Teste LTDA",nome_fantasia:"Bar do Teste",cnpj:"12.345.678/0001-99",inscricao_estadual:"123",contador_nome:"Maria Contadora",contador_crc:"SP-1"}}],
 sales_orders:[],
 compras:[{id:"c1",owner_id:OWNER,numero:7,status:"recebida",total:300,recebida_em:"2026-09-03T12:00:00Z",fornecedor_id:"f1",itens:[{}]}],
 fornecedores:[{id:"f1",owner_id:OWNER,nome:"Atacadão",cnpj:""}],
 fin_lancamentos:[{owner_id:OWNER,tipo:"despesa",valor:2000,categoria:"Aluguel",pago_em:"2026-09-05",origem:"manual"},{owner_id:OWNER,tipo:"despesa",valor:300,categoria:"Compras",pago_em:"2026-09-10",origem:"compra"}],
 estoque_mov:[{owner_id:OWNER,product_id:"p1",tipo:"saida",quantidade:2,created_at:"2026-10-02T12:00:00Z"}],
 business_config:[{owner_id:OWNER,business_type:"restaurante"}],
 integrations:[],
};
// 1200 vendas em setembro (testa a paginação) + histórico
let n=1000;
for(let i=0;i<1200;i++){const dia=1+(i%30);const t=`2026-09-${String(dia).padStart(2,"0")}T2${i%3}:00:00Z`;
 DB.sales_orders.push({id:"s"+i,numero:++n,owner_id:OWNER,status:"pago",simulado:i===0?true:false,paid_at:t,total:122,frete:0,entrega:{tipo:i%2?"mesa":"entrega"},
  pagamento:{metodo:["pix","credito","debito","dinheiro"][i%4],valor_cobrado:122},cliente:{nome:"Cliente "+i},nf_numero:i%5?null:String(i),
  itens:[{product_id:"p1",nome:"Picanha na chapa",quantidade:1,preco_unitario:90,subtotal:90},{product_id:"p2",nome:"Coca-Cola lata",quantidade:2,preco_unitario:7,subtotal:14},
   {product_id:null,taxa:true,nome:"Taxa de serviço (10%)",quantidade:1,preco_unitario:10.4,subtotal:10.4},{product_id:"p3",nome:"Cerveja Heineken",quantidade:1,preco_unitario:7.6,subtotal:7.6}]});}
for(let m=1;m<=8;m++) DB.sales_orders.push({id:"h"+m,numero:++n,owner_id:OWNER,status:"pago",paid_at:`2026-0${m}-15T15:00:00Z`,total:100000,pagamento:{valor_cobrado:100000},itens:[]});
window.__DB=DB; window.__upserts=[];
function q(t){let rows=[...(DB[t]||[])];let single=false,rng=null;const o={
 select(){return o},order(){return o},
 eq(k,v){rows=rows.filter(r=>r[k]===v);return o},
 gte(k,v){rows=rows.filter(r=>r[k]!=null&&String(r[k])>=v);return o},
 lt(k,v){rows=rows.filter(r=>r[k]!=null&&String(r[k])<v);return o},
 or(s){if(s.includes("simulado"))rows=rows.filter(r=>!r.simulado);return o},
 range(a,b){rng=[a,b];return o},limit(){return o},maybeSingle(){single=true;return o},
 upsert(r){window.__upserts.push([t,r]);(Array.isArray(r)?r:[r]).forEach(x=>{const key=t==="product_fiscal"?"product_id":"owner_id";const i=DB[t].findIndex(y=>y[key]===x[key]);if(i>=0)DB[t][i]=x;else DB[t].push(x)});return Promise.resolve({error:null})},
 then(res,rej){const d=rng?rows.slice(rng[0],rng[1]+1):rows;res({data:single?(d[0]||null):d,error:null})}};return o}
export const supabase={from:q,auth:{getSession:async()=>({data:{session:{user:{id:OWNER}}}}),getUser:async()=>({data:{user:{id:OWNER}}})}};
'''
import re as _re
_sb=open('js/sidebar.js').read()
_fora=_re.search(r'const ESQUELETO_FORA = `(.*?)`;', _sb, _re.S).group(1)
_menu=_re.search(r'const ESQUELETO_MENU = `(.*?)`;', _sb, _re.S).group(1)
ESQ="(function(){const s=document.querySelector('.dash-shell');if(s&&!s.querySelector('.dash-side')){s.insertAdjacentHTML('beforebegin',"+repr(_fora).replace("\\n"," ")+");s.insertAdjacentHTML('afterbegin',"+repr(_menu).replace("\\n"," ")+");}})();"
STUBS={"auth.js":"export async function requireSession(){} export function signOut(){}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":ESQ+"export async function renderSidebar(){document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">Sair</a>'}",
 "workspace.js":"export async function getWorkspaceOwnerId(){return 'o1'}","supabaseClient.js":FAKE}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1350,"height":1000},accept_downloads=True, timezone_id="America/Sao_Paulo")
    await ctx.add_init_script(" const _D=Date; window.Date=class extends _D{constructor(...a){if(!a.length)super(_D.now());else super(...a)}static now(){return _D.now()}};")
    pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    async def xl(r): await r.fulfill(path="tests/.libs/xlsx.full.min.js",content_type="application/javascript")
    await pg.route("**/cdnjs.cloudflare.com/**",xl)
    await pg.goto("http://localhost:8765/contabilidade.html"); await pg.wait_for_selector(".cb-sec",timeout=15000)
    print("mes:",await pg.eval_on_selector("#f-mes","e=>e.value"))
    cards=await pg.eval_on_selector_all(".panel-stat-card","e=>e.map(x=>x.innerText.replace(/\\n/g,': '))"); print(cards)
    pend=await pg.eval_on_selector_all(".cb-pend","e=>e.map(x=>x.innerText)"); print("PEND",pend)
    secs=await pg.eval_on_selector_all(".cb-sec h3","e=>e.map(x=>x.innerText)"); print("SECOES",secs)
    await pg.screenshot(path="tests/saida/c1.png",full_page=False)
    await pg.screenshot(path="tests/saida/c1full.png",full_page=True)
    async with pg.expect_download() as d: await pg.click("#b-excel")
    dl=await d.value; await dl.save_as("tests/saida/teste.xlsx"); print("excel:",dl.suggested_filename)
    await pg.emulate_media(media="print"); await pg.pdf(path="tests/saida/teste.pdf",format="A4"); await pg.emulate_media(media="screen")
    await pg.click('[data-tab="fiscal"]'); await pg.wait_for_selector("#fs-body tr[data-id]")
    await pg.screenshot(path="tests/saida/c2.png")
    await pg.fill('#fs-body tr[data-id="p3"] [data-k="ncm"]',"22030000"); await pg.press('#fs-body tr[data-id="p3"] [data-k="ncm"]',"Tab")
    await pg.click("#fs-salvar"); await pg.wait_for_timeout(400); await pg.click(".lumos-dialog button, [data-v='1']") if await pg.query_selector("[data-v='1']") else None
    up=await pg.evaluate("window.__upserts.map(x=>[x[0],x[1]])"); print("UPSERT",json.dumps(up)[:400])
    await pg.click('[data-tab="config"]'); await pg.wait_for_timeout(300); await pg.select_option("#c-regime","presumido"); await pg.wait_for_timeout(200)
    print("RET visivel:",await pg.is_visible("#c-ret-wrap"), "rbt12 visivel:",await pg.is_visible("#c-rbt12"))
    await pg.check("#c-ret"); await pg.click("#c-salvar"); await pg.wait_for_timeout(300)
    if await pg.query_selector("[data-v='1']"): await pg.click("[data-v='1']")
    await pg.click('[data-tab="fechamento"]'); await pg.wait_for_timeout(1500)
    ap=await pg.eval_on_selector_all(".cb-sec:nth-of-type(3) tbody tr","e=>e.map(x=>x.innerText.replace(/\\t/g,' | '))"); print("PRESUMIDO",ap)
    await pg.screenshot(path="tests/saida/c3.png")
    m=await ctx.new_page(); await m.set_viewport_size({"width":390,"height":844}); await m.route("**/js/*.js*",route)
    await m.goto("http://localhost:8765/contabilidade.html"); await m.wait_for_selector(".cb-sec",timeout=15000); await m.screenshot(path="tests/saida/c4.png")
    print("ERROS",errs); await b.close()
asyncio.run(main())
