import re
from collections import Counter
md=open('docs/INSTALACAO.md').read()
partes=re.split(r'^## (\d+)\.[^\n]*\n', md, flags=re.M)
vivo={}
OBJ=r'(?:(\w+)\.)?(\w+)'
for i in range(1,len(partes),2):
    sec=int(partes[i]); corpo=partes[i+1]
    for sql in re.findall(r'```sql\n(.*?)```', corpo, re.S):
        sql=re.sub(r'--[^\n]*','',sql); toks=[]
        def add(m,op,tipo,sch,tab,nome): toks.append((m.start(),op,tipo,(sch or 'public').lower(),tab,nome))
        for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?'+OBJ, sql, re.I): add(m,'add','tabela',m.group(1),m.group(2),m.group(2))
        for m in re.finditer(r'drop\s+table\s+(?:if\s+exists\s+)?'+OBJ, sql, re.I): add(m,'del','tabela',m.group(1),m.group(2),m.group(2))
        for m in re.finditer(r'create\s+(?:or\s+replace\s+)?view\s+'+OBJ, sql, re.I): add(m,'add','tabela',m.group(1),m.group(2),m.group(2))
        for m in re.finditer(r'alter\s+table\s+(?:if\s+exists\s+)?'+OBJ+r'\s+((?:add\s+column[^;]*?,?\s*)+);', sql, re.I|re.S):
            for c in re.finditer(r'add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)', m.group(3), re.I): add(m,'add','coluna',m.group(1),m.group(2),c.group(1))
        for m in re.finditer(r'alter\s+table\s+'+OBJ+r'\s+drop\s+column\s+(?:if\s+exists\s+)?(\w+)', sql, re.I): add(m,'del','coluna',m.group(1),m.group(2),m.group(3))
        for m in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+'+OBJ+r'\s*\(', sql, re.I): add(m,'add','funcao',m.group(1),'',m.group(2))
        for m in re.finditer(r'drop\s+function\s+(?:if\s+exists\s+)?'+OBJ, sql, re.I): add(m,'del','funcao',m.group(1),'',m.group(2))
        for m in re.finditer(r'create\s+trigger\s+(\w+)\s+.*?\son\s+'+OBJ, sql, re.I|re.S): add(m,'add','gatilho',m.group(2),m.group(3),m.group(1))
        for m in re.finditer(r'drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)\s+on\s+'+OBJ, sql, re.I): add(m,'del','gatilho',m.group(2),m.group(3),m.group(1))
        for m in re.finditer(r'create\s+policy\s+"([^"]+)"\s+on\s+'+OBJ, sql, re.I): add(m,'add','regra',m.group(2),m.group(3),m.group(1))
        for m in re.finditer(r'drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+'+OBJ, sql, re.I): add(m,'del','regra',m.group(2),m.group(3),m.group(1))
        for m in re.finditer(r'create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+'+OBJ, sql, re.I): add(m,'add','indice',m.group(2),m.group(3),m.group(1))
        for m in re.finditer(r'drop\s+index\s+(?:if\s+exists\s+)?'+OBJ, sql, re.I): add(m,'del','indice',m.group(1),'',m.group(2))
        for pos,op,tipo,sch,tab,nome in sorted(toks):
            tab=tab.lower(); nl=nome if tipo=='regra' else nome.lower()
            if tipo=='indice':
                if op=='del':
                    for kk in [x for x in vivo if x[0]=='indice' and x[3]==nl]: del vivo[kk]
                    continue
                k=('indice',sch,'',nl)
            else: k=(tipo,sch,tab if tipo!='funcao' else '',nl)
            if op=='del':
                vivo.pop(k,None)
                if tipo=='tabela':
                    for kk in [x for x in vivo if x[1]==sch and x[2]==tab]: del vivo[kk]
            else: vivo[k]=(sec,tipo,sch,tab,nl)
itens=sorted(vivo.values(), key=lambda x:(x[0],x[1],x[3],x[4]))
print(len(itens),"objetos;", dict(Counter(x[1] for x in itens)), "| esquemas:", dict(Counter(x[2] for x in itens)), "| seções", min(x[0] for x in itens),"a",max(x[0] for x in itens))
q=lambda s:"'"+s.replace("'","''")+"'"
vals=",\n".join(f"  ({s}, {q(t)}, {q(sc)}, {q(tab)}, {q(n)})" for s,t,sc,tab,n in itens)
ult=max(int(partes[i]) for i in range(1,len(partes),2))
sql=f"""-- Lumos: o que falta aplicar do guia de instalação (docs/INSTALACAO.md)
-- Gerado a partir das seções 1 a {ult}. Só LÊ o banco, não altera nada.
-- Resultado: uma linha por seção com pendência. Se vier só "Tudo aplicado", está em dia.
with esperado(secao, tipo, esquema, tabela, nome) as (values
{vals}
),
falta as (
  select e.* from esperado e
  where case e.tipo
    when 'tabela'  then to_regclass(e.esquema || '.' || e.nome) is null
    when 'coluna'  then not exists (select 1 from information_schema.columns c where c.table_schema = e.esquema and c.table_name = e.tabela and c.column_name = e.nome)
    when 'funcao'  then not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = e.esquema and p.proname = e.nome)
    when 'gatilho' then not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = e.esquema and c.relname = e.tabela and t.tgname = e.nome and not t.tgisinternal)
    when 'regra'   then not exists (select 1 from pg_policies p where p.schemaname = e.esquema and p.tablename = e.tabela and p.policyname = e.nome)
    when 'indice'  then to_regclass(e.esquema || '.' || e.nome) is null
  end
)
select secao as "Seção", count(*) as "Itens faltando",
       string_agg(tipo || ': ' || case when tabela <> '' and tipo <> 'tabela' then tabela || '.' else '' end || nome, ' | ' order by tipo, nome) as "O que falta"
from falta group by secao
union all
select null, 0, 'Tudo aplicado' where not exists (select 1 from falta)
order by 1 nulls last;
"""
open('docs/verificar-instalacao.sql','w').write(sql)
