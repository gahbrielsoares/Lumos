"""Roda todos os testes do Lumos e mostra um resumo.
Uso (na raiz do projeto):  python3 tests/rodar.py            (todos)
                           python3 tests/rodar.py pdv nicho   (só os que têm essas palavras no nome)
Precisa: Node, Python 3 com Playwright e um Chromium (variável LUMOS_CHROMIUM se não for o padrão do Playwright).
"""
import os, re, subprocess, sys, time, glob, socket

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)
filtro = sys.argv[1:]
escolhe = lambda nome: not filtro or any(f in nome for f in filtro)

# Testes de navegador e o que passar para cada um (os "base_*" são apoio, não rodam sozinhos)
NAVEGADOR = {
    "tutoriais_paginas": ("base_paginas.py", ["dashboard", "agendamentos", "products", "estoque", "compras", "relatorios", "agents", "integracoes", "equipe", "settings", "pdv"]),
    "tutoriais_com_dados": ("tutoriais_com_dados.py", ["cozinha", "ficha-tecnica", "financeiro", "contabilidade", "fiscal"]),
}
for f in sorted(glob.glob("tests/navegador/*.py")):
    nome = os.path.basename(f)[:-3]
    if nome.startswith("base_") or nome in ("tutoriais_com_dados",): continue
    NAVEGADOR[nome] = (os.path.basename(f), [])
BENIGNO = ("ERR_NAME_NOT_RESOLVED", "status of 404", "getAccess", "Chart is not defined")

def falhou(saida, codigo):
    if codigo != 0 or "FALHOU" in saida or "Traceback" in saida: return True
    for m in re.finditer(r"(?:ERROS|erros[=:]) ?\[(.*?)\]", saida):
        itens = [i for i in re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))]
        itens = [a or b for a, b in itens]
        if any(not any(x in i for x in BENIGNO) for i in itens): return True
    return False

def rodar(cmd, timeout):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        return r.returncode, (r.stdout + r.stderr).decode("utf-8", "replace")
    except subprocess.TimeoutExpired:
        return 1, "Traceback: tempo esgotado"

print("Preparando...", flush=True)
c, s = rodar([sys.executable, "tests/apoio/preparar.py"], 600)
if c != 0: print(s); sys.exit(1)
def no_ar():
    try:
        with socket.create_connection(("127.0.0.1", 8765), timeout=1): return True
    except OSError: return False
# Servidor local das páginas (porta 8765). Se já houver um rodando nesta pasta, reaproveita.
servidor = None if no_ar() else subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(30):
    if no_ar(): break
    time.sleep(0.3)
else:
    print("Não foi possível ligar o servidor local na porta 8765."); sys.exit(1)
resultados = []
try:
    for f in sorted(glob.glob("tests/unitarios/*.test.mjs")):
        nome = os.path.basename(f).replace(".test.mjs", "")
        if not escolhe(nome): continue
        c, s = rodar(["node", f], 120)
        resultados.append(("cálculo", nome, not falhou(s, c), s.count("ok:") + s.count("\nok") , s))
        print(("  ok   " if resultados[-1][2] else "  FALHOU ") + "cálculo:   " + nome, flush=True)
    for nome, (arq, args) in NAVEGADOR.items():
        if not escolhe(nome): continue
        c, s = rodar([sys.executable, "tests/navegador/" + arq, *args], 900)
        resultados.append(("navegador", nome, not falhou(s, c), 0, s))
        print(("  ok   " if resultados[-1][2] else "  FALHOU ") + "navegador: " + nome, flush=True)
finally:
    if servidor: servidor.terminate()
ruins = [r for r in resultados if not r[2]]
print(f"\n{len(resultados) - len(ruins)} de {len(resultados)} testes passaram.")
for r in ruins:
    print(f"\n===== FALHOU: {r[1]} =====\n" + "\n".join(l for l in r[4].splitlines() if l.strip())[-1500:])
sys.exit(1 if ruins else 0)
