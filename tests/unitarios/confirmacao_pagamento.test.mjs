let handler=null; globalThis.Deno={env:{get:(k)=>({SUPABASE_URL:"https://proj.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"SRV"}[k])},serve:(h)=>{handler=h}};
const DB={sales_orders:[{id:"so-1",owner_id:"own1",total:94.6,status:"aguardando_pagamento",pagamento:{link_id:"lnk_1"}},{id:"so-2",owner_id:"own2",total:50,status:"aguardando_pagamento",pagamento:{}}],
 integrations:[{owner_id:"own1",kind:"pagamento",provider:"mercadopago",config:{ambiente:"teste"},secrets:{access_token:"TOK1",webhook_token:"WT"}},{owner_id:"own2",kind:"pagamento",config:{},secrets:{access_token:"TOK2"}}]};
globalThis.__sb={from:(t)=>{let rows=[...DB[t]];let single=false,upd=null;const o={select(){return o},limit(){return o},
 eq(k,v){if(upd){rows.filter(r=>r[k]===v).forEach(r=>Object.assign(r,upd));return o}rows=rows.filter(r=>k==="pagamento->>link_id"?r.pagamento?.link_id===v:r[k]===v);return o},
 maybeSingle(){single=true;return o},update(x){upd=x;return o},then(r){return Promise.resolve({data:single?(rows[0]||null):rows}).then(r)}};return o}};
let PAG={}; const confirmados=[];
globalThis.fetch=async(url,o)=>{
  if(url.includes("/functions/v1/orders")){const b=JSON.parse(o.body);confirmados.push(b);DB.sales_orders.find(s=>s.id===b.order_id).status="pago";return {ok:true,text:async()=>""}}
  if(url.includes("api.mercadopago.com/v1/payments/")){if(o.headers.Authorization!=="Bearer TOK1")return {ok:false,status:401};return {ok:true,json:async()=>PAG}}
  if(url.includes("/payments/")){return {ok:true,json:async()=>PAG}}
  return {ok:true,json:async()=>({})}};
await import(new URL('../.build/pag_t.mjs', import.meta.url).href);
const call=(qs,body,headers={})=>handler(new Request("https://proj.supabase.co/functions/v1/pagamentos?"+qs,{method:"POST",body:JSON.stringify(body),headers}));
const ok=(c,m)=>console.log(c?"ok:":"FALHOU:",m);
PAG={id:9,status:"pending",external_reference:"so-1",transaction_amount:94.6,payment_type_id:"bank_transfer"};
await call("p=mercadopago&o=so-1",{type:"payment",data:{id:"9"}}); ok(confirmados.length===0,"pagamento pendente não dá baixa");
PAG={...PAG,status:"approved",transaction_amount:10}; await call("p=mercadopago&o=so-1",{type:"payment",data:{id:"9"}}); ok(confirmados.length===0,"valor menor que o pedido não dá baixa");
PAG={...PAG,transaction_amount:94.6,external_reference:"so-2"}; await call("p=mercadopago&o=so-1",{type:"payment",data:{id:"9"}}); ok(confirmados.length===0,"pagamento de outro pedido não dá baixa");
PAG={...PAG,external_reference:"so-1"}; await call("p=mercadopago&o=so-1",{type:"payment",data:{id:"9"}});
ok(confirmados.length===1&&confirmados[0].metodo==="pix"&&confirmados[0].order_id==="so-1","aprovado no Mercado Pago: baixa como Pix");
await call("p=mercadopago&o=so-1",{type:"payment",data:{id:"9"}}); ok(confirmados.length===1,"aviso repetido não dá baixa duas vezes");
// Asaas
DB.sales_orders[0].status="aguardando_pagamento"; confirmados.length=0;
PAG={id:"pay_1",status:"RECEIVED",paymentLink:"lnk_1",value:94.6,billingType:"CREDIT_CARD",installmentCount:3};
await call("p=asaas&owner=own1",{event:"PAYMENT_RECEIVED",payment:{id:"pay_1"}},{"asaas-access-token":"ERRADO"}); ok(confirmados.length===0,"aviso Asaas com código errado é ignorado");
await call("p=asaas&owner=own2",{event:"PAYMENT_RECEIVED",payment:{id:"pay_1"}}); ok(confirmados.length===0,"link de uma loja não confirma pedido de outra loja");
await call("p=asaas&owner=own1",{event:"PAYMENT_RECEIVED",payment:{id:"pay_1"}},{"asaas-access-token":"WT"});
ok(confirmados.length===1&&confirmados[0].metodo==="cartao"&&confirmados[0].parcelas===3,"Asaas recebido: baixa como cartão em 3x");
const r=await call("p=desconhecido",{}); ok(r.status===200,"aviso desconhecido responde sem erro");
