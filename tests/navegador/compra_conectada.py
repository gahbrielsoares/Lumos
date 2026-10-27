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
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1300,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150])); pg.on("console",lambda m: errs.append("console:"+m.text[:150]) if m.type in ("error","warning") else None)
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    await pg.goto("http://localhost:8765/compras.html"); await pg.wait_for_selector("#new-compra"); await pg.wait_for_timeout(500)
    await pg.click("#new-compra"); await pg.wait_for_selector("#m-items .p")
    print("lista:",await pg.eval_on_selector_all("#m-items .p option","e=>e.map(o=>o.textContent)"))
    print("dica:",await pg.inner_text("#m-items .erp-item-hint"))
    await pg.fill("#m-items .q","5"); await pg.fill("#m-items .c","46")
    await pg.click("#m-save"); await pg.wait_for_timeout(900)
    carne=await pg.evaluate("DB.products.find(p=>p.id==='carne')")
    print("carne depois: estoque",carne["estoque"],"custo",carne["custo"])
    print("compra:",await pg.evaluate("DB.compras.map(c=>c.status)"),"| financeiro:",await pg.evaluate("DB.fin_lancamentos.map(l=>l.descricao+' '+l.valor)"),"| movimento:",await pg.evaluate("DB.estoque_mov.map(m=>m.tipo+' '+m.quantidade+' saldo '+m.saldo_apos)"))
    print("resumo:",(await pg.inner_text(".erp-modal")).replace("\n"," | ")[:400])
    await pg.screenshot(path="tests/saida/cp2.png")
    print("ERROS",errs); await b.close()
asyncio.run(main())
