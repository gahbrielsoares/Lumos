import asyncio, json
from playwright.async_api import async_playwright
exec(open('tests/navegador/base_paginas.py').read().split("async def run(page):")[0].replace("?v=96","?v=96").replace("?v=96","?v=96"))
STUBS["supabaseClient.js"]=r'''
const DB={fornecedores:[{id:"f1",nome:"Covabra"}],compras:[],fin_lancamentos:[],estoque_mov:[],
 products:[
  {id:"carne",name:"Carne moída",unit:"kg",estoque:4,custo:40,is_insumo:true,active:true,segmento:"restaurante"},
  {id:"burger",name:"Burger Lumos",unit:"unidade",estoque:null,price:32,is_insumo:false,active:true,segmento:"restaurante"},
  {id:"agua",name:"Água Mineral 500 ml",unit:"unidade",estoque:10,custo:1.5,is_insumo:false,active:true},
  {id:"arg",name:"Argamassa AC-III",unit:"saco",estoque:30,is_insumo:false,active:true,segmento:"materiais_construcao"}],
 product_recipes:[{product_id:"burger",insumo_id:"carne"}], product_fiscal:[]};
window.DB=DB;
function q(t){let rows=DB[t]||[];let single=false,mode="sel",payload=null,filtros=[];const o={select(){return o},order(){return o},limit(){return o},range(){return o},in(){return o},gte(){return o},lte(){return o},
 eq(k,v){if(k==="owner_id"||k==="active")return o;filtros.push([k,v]);if(mode==="upd"){DB[t].filter(r=>r[k]===v).forEach(r=>Object.assign(r,payload));}else rows=rows.filter(r=>r[k]===v);return o},
 maybeSingle(){single=true;return o},single(){single=true;return o},
 insert(x){const arr=Array.isArray(x)?x:[x];const out=arr.map(it=>({id:t+(DB[t].length+1),numero:101,created_at:new Date().toISOString(),...it}));DB[t].push(...out);rows=out;return o},
 update(x){mode="upd";payload=x;return o},
 then(r,j){return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(r,j)}};return o}
export const supabase={from:q,auth:{getUser:async()=>({data:{user:{id:'o1'}}})},functions:{invoke:async()=>({data:{}})}};'''
STUBS["sidebar.js"]=STUBS["sidebar.js"].replace("dataset.nicho='restaurante'","dataset.nicho='materiais_construcao'")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    for page,sel in [("products","#products-list .hub-title"),("estoque","#rows strong"),("compras","#m-items .p option")]:
      pg=await b.new_page(viewport={"width":1300,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
      async def route(r):
        name=r.request.url.split("/js/")[-1].split("?")[0]
        if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
        else: await r.continue_()
      await pg.route("**/js/*.js*",route)
      await pg.goto(f"http://localhost:8765/{page}.html"); await pg.wait_for_timeout(1500)
      if page=="compras": await pg.click("#new-compra"); await pg.wait_for_timeout(400)
      print(page,":",await pg.eval_on_selector_all(sel,"e=>e.map(x=>x.textContent.trim())"),"| erros:",errs)
      await pg.close()
    await b.close()
asyncio.run(main())
