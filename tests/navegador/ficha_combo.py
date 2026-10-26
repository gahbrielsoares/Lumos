import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0].replace("?v=87","?v=87"))
STUBS["supabaseClient.js"]=r'''
const DB={products:[
  {id:"ln",is_insumo:false,name:"Cerveja long neck",unit:"unidade",estoque:60,custo:5.2,price:14,active:true},
  {id:"balde",is_insumo:false,name:"Balde de Long Neck (6 un.)",unit:"unidade",estoque:null,price:69,active:true},
  {id:"arg",is_insumo:false,name:"Argamassa AC-III",unit:"saco",estoque:30,segmento:"materiais_construcao",active:true},
  {id:"far",name:"Farinha de trigo",unit:"kg",estoque:8,custo:4.9,is_insumo:true,active:true}], product_recipes:[]};
window.__up=[];
function q(t){let rows=[...(DB[t]||[])];const o={select(){return o},order(){return o},eq(){return o},in(){return o},delete(){return o},
 upsert(r){window.__up.push(r);return Promise.resolve({error:null})},then(r,j){return Promise.resolve({data:rows,error:null}).then(r,j)}};return o}
export const supabase={from:q,auth:{getUser:async()=>({data:{user:{id:'o1'}}})}};'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1300,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/ficha-tecnica.html"); await pg.wait_for_selector("#pratos tr[data-id]")
    print("pratos:",await pg.eval_on_selector_all("#pratos tr[data-id] strong","e=>e.map(x=>x.innerText)"))
    await pg.click('#pratos tr[data-id="balde"]'); await pg.click("#m-add")
    print("opções:",await pg.eval_on_selector_all('[data-f="insumo"] optgroup',"e=>e.map(g=>g.label+': '+[...g.children].map(o=>o.textContent).join(', '))"))
    await pg.select_option('[data-f="insumo"]',"ln"); await pg.fill('[data-f="qtd"]',"6"); await pg.wait_for_timeout(200)
    print("custo do balde:",await pg.inner_text("#s-custo"),"| CMV:",await pg.inner_text("#s-cmv"))
    await pg.click("#m-save"); await pg.wait_for_timeout(300); print("gravado:",await pg.evaluate("JSON.stringify(window.__up)"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
