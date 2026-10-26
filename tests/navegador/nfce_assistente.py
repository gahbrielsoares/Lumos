import asyncio, json
from playwright.async_api import async_playwright
FAKE = r'''
const OWNER="o1";
window.__calls=[]; window.__conectado=false;
const DB={fiscal_config:[{owner_id:OWNER,dados:{razao_social:"Bar do Teste LTDA",nome_fantasia:"Bar do Teste",cnpj:"11222333000181",inscricao_estadual:"",regime:"simples",uf:"SP",municipio:"São Carlos"}}],
 sales_orders:[{id:"s1",numero:1201,owner_id:OWNER,status:"pago",paid_at:new Date().toISOString(),total:80,pagamento:{metodo:"pix",valor_cobrado:80},cliente:{nome:"Maria"}},
               {id:"s2",numero:1202,owner_id:OWNER,status:"pago",paid_at:new Date().toISOString(),total:45,pagamento:{metodo:"credito",valor_cobrado:45},cliente:{nome:"João"}}],
 fiscal_docs:[{id:"d1",sales_order_id:"s2",owner_id:OWNER,status:"erro",mensagem:"Rejeição 778: NCM inexistente",ambiente:"homologacao",created_at:new Date().toISOString()}]};
function q(t){let rows=[...(DB[t]||[])];let single=false;const o={select(){return o},order(){return o},limit(){return o},range(){return o},
 eq(k,v){rows=rows.filter(r=>r[k]===v);return o},gte(){return o},lte(){return o},lt(){return o},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return o},
 maybeSingle(){single=true;return o},then(res){res({data:single?(rows[0]||null):rows,error:null})}};return o}
export const supabase={from:q,auth:{getSession:async()=>({data:{session:{user:{id:OWNER}}}}),getUser:async()=>({data:{user:{id:OWNER,email:"dono@bar.com"}}})},
 functions:{invoke:async(name,{body})=>{window.__calls.push(body);
  if(body.action==="status") return {data: window.__conectado?{conectado:true,config:{cnpj:"11222333000181",ambiente:"homologacao",serie:"1",emitir_quando:"apos_pagamento",certificado:{validade:"2027-10-20T00:00:00Z"},conectado_em:new Date().toISOString()},tem_token_homologacao:true,cadastro_pela_lumos:true}:{conectado:false,config:{},cadastro_pela_lumos:true}};
  if(body.action==="conectar"){window.__conectado=true;return {data:{ok:true,passos:[{passo:"Dados conferidos",ok:true},{passo:"Certificado digital e cadastro conferidos pelo emissor",ok:true},{passo:"Empresa cadastrada no emissor",ok:true},{passo:"Chaves de emissão recebidas",ok:true},{passo:"Conexão testada (homologação)",ok:true}]}};}
  if(body.action==="conferir") return {data:{ok:true,passos:[{passo:"Dados conferidos",ok:true},{passo:"Certificado digital e cadastro conferidos pelo emissor",ok:true}]}};
  if(body.action==="emitir"){DB.fiscal_docs.unshift({id:"d2",sales_order_id:body.sales_order_id,owner_id:OWNER,status:"autorizado",numero:"15",ambiente:"homologacao",danfe_url:"https://x/danfe",xml_url:"https://x/xml",created_at:new Date().toISOString()});return {data:{ok:true,numero:"15"}};}
  return {data:{ok:true}};}}};
'''
import re as _re
_sb=open('js/sidebar.js').read()
_fora=_re.search(r'const ESQUELETO_FORA = `(.*?)`;', _sb, _re.S).group(1)
_menu=_re.search(r'const ESQUELETO_MENU = `(.*?)`;', _sb, _re.S).group(1)
ESQ="(function(){const s=document.querySelector('.dash-shell');if(s&&!s.querySelector('.dash-side')){s.insertAdjacentHTML('beforebegin',"+repr(_fora).replace("\\n"," ")+");s.insertAdjacentHTML('afterbegin',"+repr(_menu).replace("\\n"," ")+");}})();"
STUBS={"auth.js":"export async function requireSession(){} export function signOut(){}","theme.js":"export function initThemeToggle(){}","mobileNav.js":"export function initMobileNav(){}",
 "sidebar.js":ESQ+"export async function renderSidebar(){document.getElementById('dash-nav').innerHTML='<a id=\"logout-link\">Sair</a>'}",
 "workspace.js":"export async function getWorkspaceOwnerId(){return 'o1'} export async function getMyAccess(){return {member:null}}","supabaseClient.js":FAKE}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    pg=await b.new_page(viewport={"width":1250,"height":1000}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    async def forge(r): await r.fulfill(path="tests/.libs/forge.min.js",content_type="application/javascript")
    await pg.route("**/cdnjs.cloudflare.com/**",forge)
    async def cep(r): await r.fulfill(body=json.dumps({"logradouro":"Rua Episcopal","bairro":"Centro","localidade":"São Carlos","uf":"SP"}),content_type="application/json")
    await pg.route("**/viacep.com.br/**",cep)
    await pg.goto("http://localhost:8765/fiscal.html"); await pg.wait_for_selector("#wizard",state="visible")
    print("razao preenchida:",await pg.input_value("#d-razao"))
    # o padrão é "a loja já tem conta": escolhe o modo em que a Lumos cadastra (campos do certificado e do CSC)
    await pg.click('[data-m="lumos"] input'); await pg.wait_for_timeout(200)
    # validação local: IE errada
    await pg.fill("#d-ie","110042490115"); await pg.click("#b-conectar"); await pg.wait_for_timeout(200)
    print("passos IE errada:",await pg.inner_text("#passos"))
    await pg.fill("#d-ie","110042490114"); await pg.fill("#d-cep","13560000"); await pg.press("#d-cep","Tab"); await pg.wait_for_timeout(300)
    await pg.fill("#d-numero","100")
    print("endereço:",await pg.input_value("#d-rua"),"|",await pg.input_value("#d-bairro"))
    # certificado: senha errada, depois certa (formato moderno e antigo)
    await pg.set_input_files("#c-arquivo","tests/.libs/cert/moderno.pfx"); await pg.fill("#c-senha","errada"); await pg.press("#c-senha","Tab"); await pg.wait_for_timeout(1500)
    print("senha errada:",await pg.inner_text("#c-info"))
    await pg.fill("#c-senha","1234"); await pg.press("#c-senha","Tab"); await pg.wait_for_timeout(1500)
    print("moderno:",(await pg.inner_text("#c-info")).replace("\n"," | "))
    await pg.set_input_files("#c-arquivo","tests/.libs/cert/antigo.pfx"); await pg.wait_for_timeout(1500)
    print("antigo:",(await pg.inner_text("#c-info")).replace("\n"," | "))
    await pg.fill("#s-idh","1"); await pg.fill("#s-csch","ABCDEF1234567890ABCD")
    await pg.screenshot(path="tests/saida/n1.png",full_page=True)
    await pg.click("#b-conectar"); await pg.wait_for_timeout(800)
    if await pg.query_selector("[data-v='1']"): await pg.click("[data-v='1']")
    await pg.wait_for_timeout(500)
    calls=await pg.evaluate("window.__calls")
    c=[x for x in calls if x.get("action")=="conectar"][0]["dados"]
    print("enviado: cert base64?",bool(c["certificado_base64"]),"| info",c["certificado_info"]["cnpj"],c["certificado_info"]["titular"],"| csc",c["csc_id_homologacao"],"| IE",c["inscricao_estadual"])
    print("depois de conectar:",(await pg.inner_text("#conexao"))[:200].replace("\n"," | "))
    print("senha limpa:",await pg.input_value("#c-senha")=="")
    print("notas:",await pg.eval_on_selector_all("#rows tr","e=>e.map(x=>x.innerText.replace(/\\s+/g,' '))"))
    await pg.click('[data-emit="s1"]'); await pg.wait_for_timeout(600)
    print("após emitir:",await pg.eval_on_selector_all("#rows tr","e=>e.map(x=>x.innerText.replace(/\\s+/g,' '))"))
    await pg.screenshot(path="tests/saida/n2.png",full_page=True)
    print("ERROS",errs); await b.close()
asyncio.run(main())
