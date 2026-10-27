import asyncio, json
from playwright.async_api import async_playwright
FAKE=r'''
window.__signup=null;
const PERFIL={id:"u1",email:"lumos@equipe.lumos.app",role:"suporte",status:"ativo",allowed_tabs:null,demo:true};
const BC={owner_id:"u1",business_type:"restaurante",disabled_tabs:["follow_up","leads"],disabled_stages:[]};
function q(t){let single=false;const rows=t==="profiles"?[PERFIL]:t==="business_config"?[BC]:t==="team_members"?[]:[];const o={select(){return o},eq(){return o},order(){return o},limit(){return o},range(){return o},in(){return o},gte(){return o},lte(){return o},lt(){return o},or(){return o},
 maybeSingle(){single=true;return o},single(){single=true;return o},upsert(){return Promise.resolve({error:null})},insert(){return o},update(){return o},
 then(r,j){return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(r,j)}};return o}
const user={id:"u1",email:"lumos@equipe.lumos.app",user_metadata:{}};
export const supabase={from:q,rpc:async()=>({data:null,error:null}),auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
 signUp:async(a)=>{window.__signup=a;return {data:{},error:null}},signOut:async()=>({})},functions:{invoke:async()=>({data:{}})}};'''
STUBS={"supabaseClient.js":FAKE,"auth.js":"export async function requireSession(){return {user:{id:'u1'}}} export function signOut(){} export async function signUp(a){const {supabase}=await import('./supabaseClient.js?v=91');return supabase.auth.signUp({email:a.email,password:a.password,options:{data:{name:a.name,nicho:a.nicho}}})}"}
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=__import__("os").environ.get("LUMOS_CHROMIUM") or None)
    ctx=await b.new_context(viewport={"width":1300,"height":850}); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    async def route(r):
      name=r.request.url.split("/js/")[-1].split("?")[0]
      if name in STUBS: await r.fulfill(body=STUBS[name],content_type="application/javascript")
      else: await r.continue_()
    await pg.route("**/js/*.js*",route)
    async def estado():
      await pg.wait_for_selector("#demo-modo"); await pg.wait_for_timeout(1200)
      return {"modo":await pg.inner_text("#demo-modo button.on"),"menu Admin":await pg.evaluate("!!document.querySelector('#dash-nav a[href=\"admin.html\"]')"),"Simular":await pg.evaluate("!!document.querySelector('[data-tool=simular]')"),"Leads no menu":await pg.evaluate("!!document.querySelector('#dash-nav a[href=\"leads.html\"]')")}
    await pg.goto("http://localhost:8765/caixa.html"); print("1º acesso:",await estado())
    await pg.screenshot(path="tests/saida/demo1.png")
    await pg.click('#demo-modo [data-m="dev"]'); await pg.wait_for_load_state(); print("Desenvolvedor:",await estado(),"| erros:",errs)
    await pg.screenshot(path="tests/saida/demo2.png")
    await pg.click('#demo-modo [data-m="cliente"]'); await pg.wait_for_load_state(); print("volta Cliente:",await estado())
    # Tutoriais em Configurações (modo cliente: começa desligado)
    await pg.goto("http://localhost:8765/settings.html"); await pg.wait_for_selector("#tutoriais-check"); await pg.wait_for_timeout(1200)
    print("Configurações: tutoriais ligado?",await pg.is_checked("#tutoriais-check"))
    await pg.click("#tutoriais-check"); await pg.wait_for_load_state(); await pg.wait_for_timeout(1500)
    print("depois de ligar: ligado?",await pg.is_checked("#tutoriais-check"),"| Simular aparece?",await pg.evaluate("!!document.querySelector('[data-tool=simular]')"))
    # Cadastro com nicho
    sp=await ctx.new_page(); await sp.route("**/js/*.js*",route); await sp.goto("http://localhost:8765/signup.html"); await sp.wait_for_selector("#nicho option", state="attached")
    print("nichos no cadastro:",await sp.eval_on_selector_all("#nicho option","e=>e.map(o=>o.textContent).slice(1)"))
    await sp.fill("#name","Dona Rosa"); await sp.fill("#email","rosa@bar.com"); await sp.fill("#password","123456"); await sp.click("button[type=submit]"); await sp.wait_for_timeout(300)
    print("sem nicho:",await sp.inner_text("#msg"))
    await sp.select_option("#nicho","restaurante"); await sp.click("button[type=submit]"); await sp.wait_for_timeout(500)
    print("enviado:",json.dumps(await sp.evaluate("window.__signup?.options")),"|",await sp.inner_text("#msg"))
    await sp.screenshot(path="tests/saida/signup.png")
    print("ERROS",errs); await b.close()
asyncio.run(main())
