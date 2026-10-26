const db={products:[{id:"burg",estoque:null},{id:"coca",estoque:10},{id:"carne",estoque:5},{id:"pao",estoque:100},{id:"semest",estoque:null}],
 product_recipes:[{product_id:"burg",insumo_id:"carne",quantidade:0.15,perda_pct:20},{product_id:"burg",insumo_id:"pao",quantidade:1,perda_pct:0},{product_id:"x",insumo_id:"semest",quantidade:1,perda_pct:0}],
 estoque_mov:[],fin_lancamentos:[]};
function q(t){let rows=[...db[t]];let upd=null;const o={select(){return o},eq(k,v){rows=rows.filter(r=>r[k]===v);if(upd){rows.forEach(r=>Object.assign(r,upd))}return o},limit(){return o},
 maybeSingle(){return Promise.resolve({data:rows[0]||null})},insert(x){db[t].push(x);return Promise.resolve({})},update(x){upd=x;rows=db[t];return o},
 then(res){res({data:rows})}};return o}
globalThis.supabase={from:q}; globalThis.METODO={};
const src=(await import('fs')).readFileSync(new URL('../.build/fn.mjs', import.meta.url),'utf8').replace(/supabase\./g,'globalThis.supabase.').replace(/METODO\[/g,'globalThis.METODO[');
const mod=await import('data:text/javascript,'+encodeURIComponent(src));
const order={id:"o1",numero:1001,owner_id:"own",total:80,itens:[{product_id:"burg",nome:"X-Burguer",quantidade:2},{product_id:"coca",nome:"Coca",quantidade:3},{product_id:null,taxa:true,nome:"Taxa"}]};
await mod.registrarVendaNoErp(order,"pix",80);
const g=(id)=>db.products.find(p=>p.id===id).estoque;
const ok=(c,m)=>console.log(c?"ok:":"FALHOU:",m);
ok(g("carne")===4.625,"carne baixada pela ficha com perda: 5 - 2 x 0,1875 = 4,625 ("+g("carne")+")");
ok(g("pao")===98,"pão baixado pela ficha: 100 - 2 = 98");
ok(g("coca")===7,"Coca sem ficha baixa o próprio estoque: 10 - 3 = 7");
ok(g("burg")===null,"o prato não tem estoque próprio");
console.log("movimentos:",db.estoque_mov.map(m=>m.product_id+" -"+m.quantidade+" "+m.motivo).join(" | "));
await mod.registrarVendaNoErp(order,"pix",80);
ok(g("carne")===4.625&&db.estoque_mov.length===3,"a mesma venda registrada duas vezes não baixa em dobro");
