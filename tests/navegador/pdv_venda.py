import asyncio, json
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0].replace("?v=93","?v=93").replace("?v=93","?v=93").replace("?v=93","?v=93"))
STUBS["supabaseClient.js"]=r'''
const P=[{id:"burger",name:"Burger Lumos",price:39.9,unit:"unidade",active:true,is_insumo:false,segmento:"restaurante",photo_urls:[],product_categories:[{categories:{name:"Lanches"}}]},
 {id:"refri",name:"Refrigerante Lata",price:7.9,unit:"unidade",active:true,is_insumo:false,product_categories:[{categories:{name:"Sem álcool"}}]},
 {id:"carne",name:"Carne moída",price:null,is_insumo:true,active:true},{id:"arg",name:"Argamassa",price:39,is_insumo:false,active:true,segmento:"materiais_construcao",product_categories:[]}];
window.__inv=null;
function q(t){let single=false;const _g=1;const CX=[{id:"cx1",numero:3,status:"aberto",aberto_em:new Date(Date.now()-3600e3).toISOString(),aberto_por_nome:"Carla",valor_inicial:100}];const rows=(t==="products"||t==="produtos_venda")?P:t==="caixas"?CX:[];const o={select(){return o},eq(){return o},order(){return o},limit(){return o},in(){return o},gte(){return o},lte(){return o},range(){return o},maybeSingle(){single=true;return o},
 then(r,j){return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(r,j)}};return o}
export const supabase={from:q,rpc:async()=>({data:null}),auth:{getUser:async()=>({data:{user:{id:'o1'}}})},
 functions:{invoke:async(n,{body})=>{window.__inv=body;return {data:{ok:true,numero:1045,total:95.6,troco:4.4,nota:{status:"autorizado",numero:"1534",danfe_url:"#"}}}}}};'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1300,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/pdv.html"); await pg.wait_for_selector(".pdv-prod")
    print("produtos:",await pg.eval_on_selector_all(".pdv-prod .n","e=>e.map(x=>x.textContent)"),"| categorias:",await pg.eval_on_selector_all("#cats button","e=>e.map(x=>x.textContent)"))
    print("aviso de caixa:",(await pg.inner_text("#aviso-caixa"))[:60])
    await pg.click('.pdv-prod[data-id="burger"]'); await pg.click('.pdv-prod[data-id="burger"]')
    await pg.fill("#busca","refri"); await pg.press("#busca","Enter"); await pg.press("#busca","Enter"); await pg.fill("#busca","")
    print("carrinho:",await pg.eval_on_selector_all(".pdv-it","e=>e.map(x=>x.innerText.replace(/\\s+/g,' '))"),"| total:",await pg.inner_text("#total"))
    await pg.click('#formas [data-f="dinheiro"]'); await pg.fill("#recebido","100"); await pg.wait_for_timeout(100)
    print("troco:",await pg.inner_text("#troco"),"| botão:",await pg.inner_text("#finalizar"))
    await pg.fill("#cpf","123.456.789-09"); await pg.check("#cozinha")
    await pg.screenshot(path="tests/saida/pdv1.png")
    await pg.click("#finalizar"); await pg.wait_for_selector(".erp-modal")
    print("enviado:",json.dumps(await pg.evaluate("window.__inv")))
    print("recibo:",(await pg.inner_text(".erp-modal")).replace("\n"," | "))
    await pg.screenshot(path="tests/saida/pdv2.png")
    await pg.click("#nova"); print("depois: carrinho vazio?",await pg.evaluate("!document.querySelector('.pdv-it')"))
    await pg.fill("#desconto","200"); await pg.click('.pdv-prod[data-id="refri"]'); await pg.click("#finalizar"); await pg.wait_for_timeout(200)
    print("desconto grande:",await pg.inner_text("#msg"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
