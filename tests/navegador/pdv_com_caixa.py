import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0].replace("?v=95","?v=95").replace("?v=95","?v=95"))
STUBS["supabaseClient.js"]=r'''
const P=[{id:"burger",name:"Burger Lumos",price:39.9,unit:"unidade",active:true,is_insumo:false,photo_urls:[]},{id:"refri",name:"Refrigerante Lata",price:7.9,unit:"unidade",active:true,is_insumo:false,photo_urls:[]}];
const DB={caixas:[],caixa_movs:[],sales_orders:[],product_categories:[]};
window.DB=DB;
function q(t){let rows=(t==="products"||t==="produtos_venda")?P:(DB[t]||[]);let single=false;const o={select(){return o},order(){return o},limit(){return o},range(){return o},in(){return o},gte(){return o},
 eq(k,v){if(k==="owner_id")return o;rows=rows.filter(r=>r[k]===v);return o},maybeSingle(){single=true;return o},
 insert(x){const it={id:"c"+(DB[t].length+1),numero:7,status:"aberto",aberto_em:new Date().toISOString(),...x};DB[t].push(it);rows=[it];return o},
 then(r,j){return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(r,j)}};return o}
export const supabase={from:q,rpc:async()=>({data:null}),auth:{getUser:async()=>({data:{user:{id:'o1',email:'carla@bar.com'}}})},
 functions:{invoke:async(n,{body})=>{DB.sales_orders.push({status:"pago",paid_at:new Date().toISOString(),total:39.9,pagamento:{metodo:body.metodo,valor_cobrado:39.9}});return {data:{ok:true,numero:1046,total:39.9,troco:0,nota:null}}}}};'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1300,"height":900}, service_workers="block"); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/pdv.html"); await pg.wait_for_selector(".pdv-prod"); await pg.wait_for_timeout(500)
    print("barra:",(await pg.inner_text("#caixa-barra")).replace("\n"," | ")[:120])
    print("venda travada?",await pg.evaluate("document.getElementById('pdv-area').classList.contains('pdv-bloqueado')"))
    await pg.screenshot(path="tests/saida/pc1.png")
    await pg.fill("#cx-ini","150"); await pg.click('[data-cx="abrir"]'); await pg.wait_for_timeout(600)
    print("depois de abrir:",(await pg.inner_text("#caixa-barra")).replace("\n"," | ")[:200])
    print("venda liberada?",not await pg.evaluate("document.getElementById('pdv-area').classList.contains('pdv-bloqueado')"))
    await pg.click('.pdv-prod[data-id="burger"]'); print("botão:",await pg.inner_text("#finalizar"),"| habilitado:",await pg.is_enabled("#finalizar"))
    await pg.click("#finalizar"); await pg.wait_for_selector(".erp-modal"); await pg.click("#nova"); await pg.wait_for_timeout(600)
    print("barra após venda:",(await pg.inner_text("#caixa-barra .cx-nums")).replace("\n"," "))
    await pg.click('[data-cx="resumo"]'); await pg.wait_for_selector(".erp-modal"); print("resumo:",(await pg.inner_text(".erp-modal")).replace("\n"," | ")[:150])
    await pg.screenshot(path="tests/saida/pc2.png")
    print("ERROS",errs)
    pg2=await ctx.new_page(); await pg2.route("**/js/*.js*",route); await pg2.goto("http://localhost:8765/caixa.html"); await pg2.wait_for_timeout(800); print("endereço antigo do Caixa vai para:",pg2.url.split("/")[-1])
    await b.close()
asyncio.run(main())
