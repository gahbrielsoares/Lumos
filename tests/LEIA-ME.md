# Testes automáticos do Lumos

Robôs que usam o sistema como uma pessoa usaria e conferem se o resultado está certo. Servem para que
nenhuma mudança quebre, sem ninguém perceber, algo que já funcionava.

## Como rodar

Na raiz do projeto:

```
python3 tests/rodar.py              # todos (leva alguns minutos)
python3 tests/rodar.py pdv nicho    # só os que têm essas palavras no nome
```

Precisa de Node, Python 3 com Playwright e um Chromium. Se o Chromium não estiver no lugar padrão do
Playwright, informe o caminho em `LUMOS_CHROMIUM`. Na primeira vez, `tests/apoio/preparar.py` baixa duas
bibliotecas e gera certificados de teste (nas pastas `.build`, `.libs` e `saida`, que não vão para o GitHub).

Nenhum teste usa o banco de verdade: todos usam um banco falso em memória.

## O que cada um confere

**Cálculo (`tests/unitarios`)**
- `motor_fiscal`: Simples, segregação das bebidas, Presumido (LC 224), RBT12, CMV teórico e real.
- `nfce_montagem`: validação de CNPJ, IE de SP e CSC; montagem da NFC-e (desconto, taxa de serviço, Pix, CPF).
- `pdv_servidor`: preço sempre do cadastro, troco, desconto, produto de outra loja, venda repetida, horário offline.
- `link_pagamento`: link do Mercado Pago e do Asaas com o valor exato e o aviso de pagamento.
- `confirmacao_pagamento`: só dá baixa com pagamento aprovado, do pedido certo e com o valor certo.
- `baixa_estoque`: baixa dos insumos pela ficha técnica, com a perda, sem baixar em dobro.

**Navegador (`tests/navegador`)**
- `tutoriais_paginas` e `tutoriais_com_dados`: todos os tutoriais (Simular) rodam do começo ao fim sem gravar nada.
- `pdv_venda`, `pdv_com_caixa`, `pdv_sem_internet`, `aviso_sem_internet`: o PDV e o caixa do turno.
- `compra_lista`, `compra_conectada`: compra com insumos, custo médio e resumo.
- `ficha_combo`, `subreceita_producao`: combos e produção de subreceita.
- `nicho_restaurante`, `nicho_materiais`: cada nicho só vê os seus produtos.
- `menu_grupos`, `esqueleto_paginas`: o menu e a moldura de todas as páginas.
- `area_de_trabalho`: barra (dock), painéis do CRM, ERP e Lumos, páginas como janelas, alternar, fechar e favoritos.
- `responsivo`: abre todas as páginas no tamanho de celular (inclusive depois de estreitar a janela) e falha se algo sair da tela.
- `contabilidade_excel`, `nfce_assistente`, `clientes_restaurante`, `tutorial_kanban`, `tutorial_mesas`.

Os arquivos `base_*.py` são apoio (banco falso e menu falso) e não rodam sozinhos.
