globalThis.Deno={env:{get:()=>""},serve:()=>{}};
const F=await import(new URL('../.build/fiscal_t.mjs', import.meta.url).href);
const ok=(c,m)=>console.log(c?"ok:":"FALHOU:",m);
ok(F.cnpjValido("11.222.333/0001-81"),"CNPJ válido aceito");
ok(!F.cnpjValido("11.222.333/0001-82"),"CNPJ com dígito errado recusado");
ok(!F.cnpjValido("11111111111111"),"CNPJ repetido recusado");
ok(F.ieValida("110.042.490.114","SP"),"IE SP válida aceita");
ok(!F.ieValida("110.042.490.115","SP"),"IE SP errada recusada");
ok(F.cscValido("1","A1B2C3D4E5F6G7H8"),"CSC válido");
ok(!F.cscValido("abc","123"),"CSC inválido");
const base={razao_social:"Bar do Teste LTDA",cnpj:"11222333000181",uf:"SP",inscricao_estadual:"110042490114",logradouro:"Rua A",bairro:"Centro",municipio:"São Carlos",cep:"13560000",ambiente:"homologacao",csc_id_homologacao:"1",csc_homologacao:"A1B2C3D4E5F6G7H8"};
ok(F.conferirDados(base).some(p=>/certificado/.test(p)),"exige certificado");
ok(F.conferirDados({...base,certificado_base64:"xx",certificado_senha:"1",certificado_info:{cnpj:"11222333000181",validade:"2027-01-01"}}).length===0,"dados completos passam");
ok(F.conferirDados({...base,certificado_base64:"xx",certificado_senha:"1",certificado_info:{cnpj:"99999999000199",validade:"2027-01-01"}}).some(p=>/outro CNPJ/.test(p)),"certificado de outro CNPJ recusado");
ok(F.conferirDados({...base,certificado_base64:"xx",certificado_senha:"1",certificado_info:{cnpj:"11222333000181",validade:"2020-01-01"}}).some(p=>/vencido/.test(p)),"certificado vencido recusado");
ok(F.conferirDados({...base,ambiente:"producao",certificado_base64:"x",certificado_senha:"1"}).some(p=>/produção/.test(p)),"produção exige CSC de produção");
const emp=F.montarEmpresa({...base,regime:"simples",certificado_base64:"QUJD",certificado_senha:"s",csc_homologacao:"A1B2C3D4E5F6G7H8",csc_id_homologacao:"1"});
ok(emp.regime_tributario===1&&emp.habilita_nfce&&emp.arquivo_certificado_base64==="QUJD"&&emp.id_token_nfce_homologacao===1,"cadastro da empresa montado "+JSON.stringify(Object.keys(emp)));
const order={id:"5f0e",numero:1203,itens:[
 {product_id:"p1",nome:"X-Burguer",quantidade:2,preco_unitario:32,subtotal:64},
 {product_id:"p2",nome:"Coca-Cola lata",quantidade:1,preco_unitario:7,subtotal:7},
 {product_id:null,taxa:true,nome:"Taxa de serviço (10%)",quantidade:1,preco_unitario:7.1,subtotal:7.1}],
 pagamento:{metodo:"credito",valor_cobrado:75},entrega:{tipo:"mesa",local:"Mesa 4"},cliente:{nome:"João",cpf:"123.456.789-09"},frete:0};
const m=F.montarNfce(order,{fiscalPorProduto:{p1:{ncm:"21069090",cfop:"5101",csosn:"102",cst_pis:"49"}},produtos:{p1:{unit:"unidade"},p2:{unit:"unidade"}},cfg:{regime:"simples",uf:"SP"},ambiente:"producao",cnpj:"11222333000181"});
console.log(JSON.stringify(m.nota,null,1).slice(0,1800));
ok(m.nota.items.length===2,"taxa de serviço fora da nota");
ok(m.totalNota===67.9 && m.nota.formas_pagamento[0].valor_pagamento===67.9,"desconto de R$ 3,10 aplicado: total 67,90 = "+m.totalNota);
ok(m.nota.items.reduce((t,i)=>t+(i.valor_desconto||0),0)===3.1,"desconto distribuído nos itens");
ok(m.nota.formas_pagamento[0].forma_pagamento==="03"&&m.nota.formas_pagamento[0].tipo_integracao==="2","cartão de crédito 03 não integrado");
ok(m.nota.cpf_destinatario==="12345678909","CPF na nota");
ok(m.nota.items[1].codigo_ncm==="22021000"&&m.nota.items[1].icms_situacao_tributaria==="500","Coca sem cadastro: sugestão ST 500");
ok(m.avisos.some(a=>/Coca/.test(a)),"aviso de produto sem cadastro");
const h=F.montarNfce(order,{fiscalPorProduto:{},produtos:{},cfg:{regime:"simples"},ambiente:"homologacao",cnpj:"1"});
ok(h.nota.items[0].descricao.startsWith("NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO"),"homologação: descrição obrigatória da Sefaz");
const pres=F.montarNfce({...order,itens:order.itens.slice(0,1),pagamento:{metodo:"pix",valor_cobrado:64}},{fiscalPorProduto:{p1:{ncm:"21069090",cfop:"5101",cst_icms:"00",cst_pis:"01",icms_aliq:4}},produtos:{},cfg:{regime:"presumido",uf:"SP"},ambiente:"producao",cnpj:"1"});
const it=pres.nota.items[0];
ok(it.icms_valor===2.56&&it.pis_valor===0.42&&it.cofins_valor===1.92&&pres.nota.formas_pagamento[0].forma_pagamento==="17","Presumido: ICMS 4%, PIS 0,65%, Cofins 3%, Pix 17");
const ent=F.montarNfce({...order,itens:order.itens.slice(0,1),frete:8,pagamento:{metodo:"dinheiro",valor_cobrado:72},entrega:{tipo:"entrega"}},{fiscalPorProduto:{},produtos:{},cfg:{regime:"simples"},ambiente:"producao",cnpj:"1"});
ok(ent.nota.presenca_comprador==="4"&&ent.nota.valor_frete===8&&ent.totalNota===72,"delivery: entrega a domicílio com frete");
