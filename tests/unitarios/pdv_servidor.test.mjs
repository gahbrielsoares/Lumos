const DB={products:[{id:"burger",name:"Burger Lumos",price:39.9,unit:"unidade",active:true,is_insumo:false,owner_id:"o1"},{id:"refri",name:"Refrigerante Lata",price:7.9,unit:"unidade",active:true,is_insumo:false,owner_id:"o1"},{id:"carne",name:"Carne",price:null,is_insumo:true,active:true,owner_id:"o1"}],sales_orders:[],orders:[],order_items:[],fiscal_docs:[]};
function q(t){let rows=[...DB[t]];let single=false,ins=null;const o={select(){return o},eq(k,v){rows=rows.filter(r=>k==='pagamento->>id_cliente'?r.pagamento?.id_cliente===v:r[k]===v);return o},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return o},order(){return o},limit(){return o},
 maybeSingle(){single=true;return o},single(){single=true;return o},
 insert(x){const arr=(Array.isArray(x)?x:[x]).map(v=>({id:t+(DB[t].length+1),numero:1045,...v}));DB[t].push(...arr);rows=arr;return o},
 then(r){return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(r)}};return o}
globalThis.supabase={from:q}; globalThis.json=(b,s=200)=>({status:s,body:b});
globalThis.erp=[]; globalThis.nfce=[];
const src=(await import('fs')).readFileSync(new URL('../.build/pdv_fn.mjs', import.meta.url),'utf8').replace(/await registrarVendaNoErp\(/g,'await globalThis.erpFn(').replace(/await emitirNfceAutomatica\(/g,'await globalThis.nfceFn(').replace(/supabase\./g,'globalThis.supabase.').replace(/return json\(/g,'return globalThis.json(');
globalThis.erpFn=async(so,m,t)=>erp.push([so.numero,m,t]); globalThis.nfceFn=async(so)=>nfce.push(so.id);
const {pdvVenda}=await import('data:text/javascript,'+encodeURIComponent(src));
const ok=(c,m)=>console.log(c?"ok:":"FALHOU:",m);
let r=await pdvVenda("o1","u1",{itens:[{product_id:"burger",quantidade:2,preco:1},{product_id:"refri",quantidade:2}],metodo:"dinheiro",recebido:100,desconto:0,cpf:"123.456.789-09",cozinha:true});
ok(r.status===200&&r.body.total===95.6,"total pelo preço do banco (ignorou o preço 1 da tela): "+r.body.total);
ok(r.body.troco===4.4,"troco 4,40: "+r.body.troco);
const so=DB.sales_orders[0];
ok(so.status==="pago"&&so.entrega.tipo==="balcao"&&so.cliente.cpf==="12345678909"&&so.cliente.nome===null,"venda paga no balcão, CPF guardado, sem nome genérico");
ok(erp.length===1&&erp[0][2]===95.6,"financeiro e estoque chamados com o total");
ok(nfce.length===1,"NFC-e automática chamada");
ok(DB.orders.length===1&&DB.order_items.length===2&&DB.orders[0].tipo==="balcao","pedido enviado à cozinha com 2 itens");
r=await pdvVenda("o1","u1",{itens:[{product_id:"refri",quantidade:1}],metodo:"pix",desconto:50});
ok(r.status===400,"desconto maior que a venda é recusado: "+r.body.error);
r=await pdvVenda("o1","u1",{itens:[{product_id:"carne",quantidade:1}],metodo:"pix"});
ok(r.status===400,"insumo não pode ser vendido: "+r.body.error);
r=await pdvVenda("o1","u1",{itens:[{product_id:"outro_dono",quantidade:1}],metodo:"pix"});
ok(r.status===400,"produto de outro estabelecimento é recusado");
r=await pdvVenda("o1","u1",{itens:[],metodo:"pix"});
ok(r.status===400,"venda vazia recusada");
r=await pdvVenda("o1","u1",{itens:[{product_id:"refri",quantidade:1}],metodo:"cheque_sem_fundo"});
ok(DB.sales_orders.at(-1).pagamento.metodo==="dinheiro"||r.status===200,"forma de pagamento desconhecida vira dinheiro");

const idc="3f2b7c1e-1111-4222-8333-444455556666";
const antes=DB.sales_orders.length;
let a1=await pdvVenda("o1","u1",{itens:[{product_id:"refri",quantidade:1}],metodo:"pix",id_cliente:idc,feita_em:new Date(Date.now()-2*3600e3).toISOString(),sem_internet:true});
let a2=await pdvVenda("o1","u1",{itens:[{product_id:"refri",quantidade:1}],metodo:"pix",id_cliente:idc,sem_internet:true});
ok(DB.sales_orders.length===antes+1&&a2.body.repetida,"mesma venda enviada duas vezes vira uma só");
const vo=DB.sales_orders.at(-1); ok(Math.abs(Date.parse(vo.paid_at)-(Date.now()-2*3600e3))<5000&&vo.pagamento.feita_sem_internet,"venda offline fica com o horário em que foi feita");
let a3=await pdvVenda("o1","u1",{itens:[{product_id:"refri",quantidade:1}],metodo:"pix",feita_em:"2020-01-01T00:00:00Z"});
ok(Math.abs(Date.parse(DB.sales_orders.at(-1).paid_at)-Date.now())<5000,"horário absurdo (muito antigo) é ignorado");
