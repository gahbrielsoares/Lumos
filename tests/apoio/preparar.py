"""Prepara o ambiente dos testes (rode a partir da raiz do projeto).
- Extrai funções das Edge Functions para testá-las no Node (pasta tests/.build).
- Baixa as bibliotecas usadas no navegador sem internet (Excel e leitura do certificado) em tests/.libs.
- Gera dois certificados A1 de teste (formato antigo e novo).
"""
import os, re, subprocess, shutil, tarfile, io, glob

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BUILD = os.path.join(RAIZ, "tests", ".build"); LIBS = os.path.join(RAIZ, "tests", ".libs")
os.makedirs(BUILD, exist_ok=True); os.makedirs(os.path.join(LIBS, "cert"), exist_ok=True); os.makedirs(os.path.join(RAIZ, "tests", "saida"), exist_ok=True)
fn = lambda nome: open(os.path.join(RAIZ, "supabase", "functions", nome, "index.ts")).read()

def esbuild(ts_txt, nome):
    src = os.path.join(BUILD, nome + ".ts"); open(src, "w").write(ts_txt)
    subprocess.run(["npx", "-y", "esbuild", src, "--loader:.ts=ts", "--format=esm", f"--outfile={os.path.join(BUILD, nome + '.mjs')}"], check=True, capture_output=True)

def trecho(txt, ini, fim):
    a = txt.index(ini); b = txt.index(fim, a)
    return "export " + txt[a:b]

orders = fn("orders")
esbuild(trecho(orders, "async function registrarVendaNoErp", "// ---------- NFC-e automática depois do pagamento"), "fn")
esbuild(trecho(orders, "async function pdvVenda", "// ---------- Mesa: conta e fechamento pelo garçom"), "pdv_fn")
esbuild(trecho(orders, "async function criarLinkPagamento", "// deno-lint-ignore no-explicit-any\nasync function approve("), "link_fn")
imp = re.compile(r'^import \{ createClient \} from "https://esm\.sh/@supabase/supabase-js@2";', re.M)
esbuild(imp.sub("const createClient = () => ({});", fn("fiscal")), "fiscal_t")
esbuild(imp.sub("const createClient = () => globalThis.__sb;", fn("pagamentos")), "pag_t")

def npm(pacote, arquivo, destino):
    if os.path.exists(destino): return
    out = subprocess.run(["npm", "pack", pacote, "--silent"], cwd=LIBS, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    with tarfile.open(os.path.join(LIBS, out)) as t: open(destino, "wb").write(t.extractfile("package/" + arquivo).read())
    os.remove(os.path.join(LIBS, out))
npm("xlsx@0.18.5", "dist/xlsx.full.min.js", os.path.join(LIBS, "xlsx.full.min.js"))
npm("node-forge@1.3.1", "dist/forge.min.js", os.path.join(LIBS, "forge.min.js"))

cert = os.path.join(LIBS, "cert")
if not os.path.exists(os.path.join(cert, "moderno.pfx")):
    run = lambda *a: subprocess.run(list(a), cwd=cert, check=True, capture_output=True)
    run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "k.pem", "-out", "c.pem", "-days", "365", "-subj", "/C=BR/O=ICP-Brasil/CN=BAR DO TESTE LTDA:11222333000181")
    run("openssl", "pkcs12", "-export", "-inkey", "k.pem", "-in", "c.pem", "-out", "moderno.pfx", "-passout", "pass:1234")
    run("openssl", "pkcs12", "-export", "-legacy", "-inkey", "k.pem", "-in", "c.pem", "-out", "antigo.pfx", "-passout", "pass:1234")
print("ambiente de testes preparado")
