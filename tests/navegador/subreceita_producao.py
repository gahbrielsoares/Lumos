import asyncio
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0].replace("?v=96","?v=96").replace("?v=96","?v=96"))
STUBS["supabaseClient.js"]=r'''
const DB={products:[
 {id:"tom",name:"Tomate",unit:"kg",custo:8,estoque:10,is_insumo:true,active:true},{id:"ceb",name:"Cebola",unit:"kg",custo:5.5,estoque:5,is_insumo:true,active:true},
 {id:"oleo",name:"Óleo de soja",unit:"litro",custo:8.5,estoque:18,is_insumo:true,active:true},{id:"molho",name:"Molho de tomate da casa",unit:"kg",custo:14,estoque:1,is_insumo:true,active:true}],
 product_recipes:[{id:"r1",product_id:"molho",insumo_id:"tom",quantidade:1.2,perda_pct:0},{id:"r2",product_id:"molho",insumo_id:"ceb",quantidade:0.1,perda_pct:0},{id:"r3",product_id:"molho",insumo_id:"oleo",quantidade:0.05,perda_pct:0}],estoque_mov:[]};
window.DB=DB;
function q(t){let rows=DB[t]||[];let mode="sel",payload=null;const o={select(){return o},order(){return o},limit(){return o},
 eq(k,v){if(k==="owner_id")return o;if(mode==="upd"){DB[t].filter(r=>r[k]===v).forEach(r=>Object.assign(r,payload));return o}rows=rows.filter(r=>r[k]===v);return o},
 insert(x){DB[t].push(x);return o},update(x){mode="upd";payload=x;return o},
 then(r,j){return Promise.resolve({data:rows,error:null}).then(r,j)}};return o}
export const supabase={from:q,rpc:async()=>({data:null}),auth:{getUser:async()=>({data:{user:{id:'o1'}}})}};'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1300,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/ficha-tecnica.html"); await pg.wait_for_timeout(1200)
    await pg.click('.ft-tab[data-tab="insumos"]')
    print("botões do molho:",await pg.eval_on_selector_all('tr[data-ins="molho"] button',"e=>e.map(b=>b.textContent.trim())"),"| tomate:",await pg.eval_on_selector_all('tr[data-ins="tom"] button',"e=>e.map(b=>b.textContent.trim())"))
    await pg.screenshot(path="tests/saida/item16a.png")
    await pg.click('[data-produzir="molho"]'); await pg.fill("#m-q","3"); await pg.dispatch_event("#m-q","input")
    print("prévia:",await pg.inner_text("#m-prev"))
    await pg.click("#m-ok"); await pg.wait_for_timeout(800)
    print("estoques:",await pg.evaluate("DB.products.map(p=>p.name+' '+p.estoque).join(' | ')"))
    print("movimentos:",await pg.evaluate("DB.estoque_mov.map(m=>m.tipo+' '+m.quantidade+' '+m.origem).join(' | ')"))
    print("ERROS",errs); await b.close()
asyncio.run(main())
