import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0].replace("?v=96","?v=96"))
STUBS["supabaseClient.js"]=r'''
const DB={fornecedores:[{id:"f1",nome:"Covabra"}],compras:[],
 products:[
  {id:"agua",name:"Água Mineral 500 ml",unit:"unidade",estoque:20,custo:1.5,active:true},
  {id:"balde",name:"Balde de Long Neck (6 un.)",unit:"unidade",estoque:null,active:true},
  {id:"bolinho",name:"Bolinho de Costela (6 un.)",unit:"unidade",estoque:null,active:true},
  {id:"burger",name:"Burger Lumos",unit:"unidade",estoque:null,active:true},
  {id:"caipi",name:"Caipirinha de Limão",unit:"unidade",estoque:null,active:true},
  {id:"arg",name:"Argamassa AC-III Cinza 20 kg",unit:"saco",estoque:30,segmento:"materiais_construcao",active:true},
  {id:"farinha",name:"Farinha de trigo",unit:"kg",estoque:8,custo:4.9,is_insumo:true,active:true}],
 product_recipes:[{product_id:"bolinho"},{product_id:"burger"}], product_fiscal:[{product_id:"balde",tipo:"revenda"}]};
window.__ins=[];
function q(t){let rows=[...(DB[t]||[])];let single=false,ins=null;const o={select(){return o},order(){return o},limit(){return o},range(){return o},eq(){return o},gte(){return o},lte(){return o},in(){return o},
 maybeSingle(){single=true;return o},single(){single=true;return o},
 insert(x){ins={id:"novo1",...x};window.__ins.push([t,x]);rows=[ins];return o},update(){return o},
 then(r,j){return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(r,j)}};return o}
export const supabase={from:q,auth:{getUser:async()=>({data:{user:{id:'o1'}}})},functions:{invoke:async()=>({data:{}})}};'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1300,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/compras.html"); await pg.wait_for_selector("#new-compra"); await pg.wait_for_timeout(500)
    await pg.click("#new-compra"); await pg.wait_for_selector("#m-items .p")
    grupos=await pg.eval_on_selector_all("#m-items .p optgroup","e=>e.map(g=>g.label+': '+[...g.children].map(o=>o.textContent).join(', '))")
    print("LISTA:"); [print("  ",g) for g in grupos]
    print("placeholders:",await pg.get_attribute("#m-items .q","placeholder"),"|",await pg.get_attribute("#m-items .c","placeholder"))
    await pg.check("#m-todos"); print("com 'mostrar outros':",await pg.eval_on_selector_all("#m-items .p optgroup","e=>e.map(g=>g.label)"))
    await pg.uncheck("#m-todos")
    await pg.fill("#m-items .q","2"); await pg.click("#m-novo-ins"); await pg.fill("#m-ins-nome","Costela bovina"); await pg.select_option("#m-ins-un","kg"); await pg.click("#m-ins-save"); await pg.wait_for_timeout(300)
    linhas=await pg.eval_on_selector_all("#m-items .erp-item","e=>e.map(r=>r.querySelector('.p').selectedOptions[0]?.textContent+' | '+r.querySelector('.q').placeholder)")
    print("após novo insumo:",linhas, "| gravado:",await pg.evaluate("JSON.stringify(window.__ins)"))
    await pg.screenshot(path="tests/saida/cp1.png")
    print("ERROS",errs); await b.close()
asyncio.run(main())
