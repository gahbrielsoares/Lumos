const T = await import(new URL("../../js/tributos.js", import.meta.url).href);
const ok=(c,m)=>{ if(!c){console.log("FALHOU:",m);process.exitCode=1;} else console.log("ok:",m); };
// Simples faixa 3: RBT12 500k => efetiva = (500000*9.5% - 13860)/500000 = 6.728%
const a=T.simplesAliquotaEfetiva(500000); ok(Math.abs(a.efetiva-6.728)<1e-9 && a.faixa.faixa===3,"aliq efetiva faixa 3 = "+a.efetiva);
// DAS 50k normal: 50000*6.728% = 3364
let s=T.calcSimples({rbt12:500000,seg:{normal:50000}}); ok(s.das===3364,"DAS normal "+s.das);
// soma reparticao = 100 em todas
for(const f of T.SIMPLES_ANEXO_I){const t=Object.values(f.rep).reduce((a,b)=>a+b,0); ok(Math.abs(t-100)<1e-9,"repartição faixa "+f.faixa+" soma "+t);}
// monofasico 10k: exclui pis 2.76 + cofins 12.74 = 15.5%: 10000*6.728%*(0.845)=568.516
s=T.calcSimples({rbt12:500000,seg:{normal:40000,monofasico:10000}}); ok(Math.abs(s.das-(40000*0.06728+568.516))<0.011,"segregação monofásico "+s.das+" economia "+s.economiaSegregacao);
// ST 10k: exclui icms 33.5% => 10000*0.06728*0.665=447.412
s=T.calcSimples({rbt12:500000,seg:{st:10000}}); ok(Math.abs(s.das-447.41)<0.011,"segregação ST "+s.das);
// RBT12 proporcional: 3 meses de 30k => 360k
const r=T.calcRbt12({mesesAnteriores:[0,0,0,0,0,0,0,0,0,30000,30000,30000]}); ok(r.valor===360000&&r.origem==="proporcional","rbt12 proporcional "+r.valor);
ok(T.calcRbt12({mesesAnteriores:[],receitaMes:20000}).valor===240000,"rbt12 início atividade");
ok(T.calcRbt12({mesesAnteriores:Array(12).fill(10000)}).valor===120000,"rbt12 histórico");
// sugestões
const c=T.sugerirFiscal({name:"Coca-Cola lata"},{uf:"SP",regime:"simples",nicho:"restaurante"}); ok(c.ncm==="22021000"&&c.monofasico&&c.icms_st&&c.csosn==="500"&&c.cfop==="5405","coca sugestão "+JSON.stringify(c));
const p=T.sugerirFiscal({name:"Picanha na chapa"},{uf:"SP",regime:"simples",nicho:"restaurante"}); ok(p.ncm==="21069090"&&!p.monofasico&&p.cfop==="5101"&&p.tipo==="producao","prato sugestão");
// apuração completa: restaurante simples
const vendas=[
 {numero:1001,paid_at:"2026-10-05T20:00:00Z",total:122,frete:0,pagamento:{metodo:"credito",valor_cobrado:122},entrega:{tipo:"mesa"},itens:[
  {product_id:"p1",nome:"Picanha",quantidade:1,preco_unitario:90,subtotal:90},
  {product_id:"p2",nome:"Coca-Cola",quantidade:2,preco_unitario:7,subtotal:14},
  {product_id:null,taxa:true,nome:"Taxa de serviço (10%)",quantidade:1,preco_unitario:10.4,subtotal:10.4},
  {product_id:null,taxa:true,nome:"Couvert artístico",quantidade:1,preco_unitario:7.6,subtotal:7.6}]},
 {numero:1002,paid_at:"2026-10-06T15:00:00Z",total:60,frete:8,pagamento:{metodo:"pix",valor_cobrado:60},entrega:{tipo:"entrega"},nf_numero:"55",itens:[
  {product_id:"p1",nome:"Picanha",quantidade:0.5,preco_unitario:90,subtotal:45},{product_id:"p3",nome:"Cerveja",quantidade:1,preco_unitario:7,subtotal:7}]},
];
const produtos=[{id:"p1",name:"Picanha",custo:35,estoque:10,unit:"unidade"},{id:"p2",name:"Coca-Cola",custo:3,estoque:48},{id:"p3",name:"Cerveja",custo:null,estoque:null}];
const R=T.apurarMes({competencia:"2026-10",cfg:{regime:"simples",uf:"SP",nicho:"restaurante",cnpj:"12345678000199",rbt12_manual:500000},vendas,produtos,fiscalPorProduto:{p1:{ncm:"21069090"}},
  compras:[{numero:5,total:300,recebida_em:"2026-10-02T10:00:00Z",fornecedor_id:"f1",itens:[1]}],fornecedores:[{id:"f1",nome:"Atacadão",cnpj:"11"}],
  despesas:[{valor:1000,categoria:"Aluguel"}],movsDepois:[{product_id:"p1",tipo:"saida",quantidade:2}]});
ok(R.resumo.bruto===182,"bruto "+R.resumo.bruto);
ok(R.resumo.taxaServico===10.4,"taxa serviço separada");
ok(R.resumo.receitaTributavel===171.6,"receita tributável (sem taxa) "+R.resumo.receitaTributavel);
ok(R.seg.monofasico_st===21 && R.seg.normal===150.6,"segregação "+JSON.stringify(R.seg));
ok(R.resumo.cmv===58.5,"CMV "+R.resumo.cmv);
ok(R.inventario.find(i=>i.nome==="Picanha").saldo===12,"inventário retroativo");
ok(R.pendencias.some(p=>/sem NCM/.test(p.texto)) && R.pendencias.some(p=>/sem custo/.test(p.texto)) && R.pendencias.some(p=>/sem documento fiscal/.test(p.texto)),"pendências");
console.log("DAS",R.apuracao.total, R.apuracao.linhas.map(l=>l.tributo+" "+l.valor).join(" | "));
console.log("DRE",R.dre.map(d=>d.conta+": "+d.valor).join(" | "));
// presumido SP com RET
const P=T.apurarMes({competencia:"2026-10",cfg:{regime:"presumido",uf:"SP",ret_sp_restaurante:true},vendas,produtos,fiscalPorProduto:{}});
console.log("PRES",P.apuracao.linhas.map(l=>l.tributo+" "+l.valor).join(" | "));
ok(P.apuracao.icms.valor===T.r2(171.6*0.04),"RET 4%");
// presumido LC224: ano anterior 4.99M + mes 100k => excedente 90k
const big=[{numero:1,paid_at:"2026-10-05T20:00:00Z",total:100000,pagamento:{metodo:"pix"},itens:[{product_id:"p1",nome:"Picanha",quantidade:1,preco_unitario:100000,subtotal:100000}]}];
const L=T.apurarMes({competencia:"2026-10",cfg:{regime:"presumido",uf:"SP"},vendas:big,produtos,receitaAnoAntes:4990000});
const irpj=L.apuracao.linhas.find(l=>l.tributo==="IRPJ").valor;
const baseIr=10000*0.08+90000*0.088; const exp=T.r2(baseIr*0.15);
ok(irpj===exp,"IRPJ com LC224 "+irpj+" esperado "+exp);
// CMV real
const RR=T.apurarMes({competencia:"2026-10",cfg:{regime:"simples",uf:"SP"},vendas:[],produtos:[{id:"carne",name:"Carne",custo:40,estoque:5},{id:"pao",name:"Pão",custo:1.2,estoque:90}],
 movsMes:[{product_id:"carne",tipo:"saida",quantidade:2,origem:"venda"},{product_id:"pao",tipo:"saida",quantidade:10,origem:"venda"},{product_id:"carne",tipo:"ajuste",quantidade:-0.5,origem:"manual"},{product_id:"pao",tipo:"saida",quantidade:3,origem:"manual"},{product_id:"carne",tipo:"entrada",quantidade:10,origem:"compra"}]});
ok(RR.cmvReal.teorico===92&&RR.cmvReal.perdas===23.6&&RR.cmvReal.real===115.6,"CMV teórico 92, perdas 23,60 (contagem -0,5 kg de carne e 3 pães perdidos), real 115,60: "+JSON.stringify(RR.cmvReal));
ok(RR.cmvReal.maioresPerdas[0].nome==="Carne"&&RR.cmvReal.maioresPerdas[0].valor===20,"maior perda: carne R$ 20");
const R3=T.apurarMes({competencia:"2026-10",cfg:{regime:"simples"},vendas:[],produtos:[{id:"c",name:"Carne",custo:40,estoque:5}],movsMes:[{product_id:"c",tipo:"ajuste",quantidade:5,origem:"saldo_inicial",motivo:"Saldo inicial"},{product_id:"c",tipo:"saida",quantidade:2,origem:"producao"},{product_id:"c",tipo:"saida",quantidade:1,origem:"venda"}]});
ok(R3.cmvReal.perdas===0&&R3.cmvReal.teorico===40,"saldo inicial e produção não contam como perda: "+JSON.stringify([R3.cmvReal.teorico,R3.cmvReal.perdas]));
