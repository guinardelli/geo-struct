# Pesos próprios das fatias — contrato 1

Esta etapa prepara o peso próprio das subáreas já atribuídas a materiais. Aplica o recorte de D2 aprovado pelo Eng. Gustavo Azocar: peso específico **total por subárea**. Não implementa pressão de água, sobrecarga, braço de momento, normal, resistência, equilíbrio ou FS. O aceite integral da especificação #30 e os demais itens R0–R6 continuam pendentes.

## Regra e fontes

Para o material `j` na fatia `i`, usar `Wij = γj Aij`; o peso próprio da fatia é `Wi = Σj Wij`. O valor de `γj` é exatamente o peso específico total informado no cadastro. Não usar o material da base para representar toda a fatia, não calcular um peso específico médio e não multiplicar novamente pela aceleração da gravidade.

`γ` em kN/m³ multiplicado por `A` em m² fornece **kN/m**, por metro de largura fora do plano da seção. São magnitudes positivas de peso, dirigidas para −Z. Não representam força normal à base, massa em kg ou peso em kN de uma largura de obra ainda não definida.

- [Aceite D2 na #30](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580): uso do peso específico total por subárea, separado da resistência do material na base.
- [Especificação candidata, §2](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450): expressão de `Wi` e unidade kN/m; a PR #37 permanece aberta.
- USACE EM 1110-2-1902 (31/10/2003), §2-2d, §F-2a(3) e §F-5c–d, consultados no [manual original em cópia pública](https://damtoolbox.org/images/8/83/Slope_Stability_Document.pdf): peso total acima/abaixo da água e soma dos pesos das partes com materiais diferentes. Essa consulta sustenta apenas a regra de peso usada aqui, não o restante do futuro solver.

## Condições e rastreabilidade

1. Exigir entrada disponível, geometria `geostruct-fixed-geometry/2` preparada e a mesma revisão exata das entradas. Guardar a revisão e o perfil geométrico que originaram os pesos.
2. Exigir peso específico total positivo e finito para todo material com área positiva. Material sem contribuição não bloqueia esta etapa. Pendências de coesão, atrito, modo de resistência ou origem permanecem no cadastro; não são preenchidas para preparar o peso.
3. Preservar, por material e fatia, ID/nome, área, γ utilizado, origem declarada dos parâmetros, peso e parcelas de cada região/solo de fundo. O total por material agrega suas contribuições nas fatias; o total da massa soma os pesos das fatias.
4. Água e sobrecargas podem determinar cortes geométricos, mas não são adicionadas ao peso próprio. Não inferir γ seco/saturado, não subtrair γ da água e não alterar γ ao mudar o modo de resistência. Pesos distintos exigem materiais/zonas explicitamente cadastrados.
5. Rejeitar área/parcela inconsistente, referência inexistente, produto nulo por perda de representação, valor não finito ou soma não finita. Conferir a soma das áreas de origem de cada material apenas contra arredondamento de ponto flutuante (`32 × Number.EPSILON × número de parcelas × escala da área`). Essa guarda aritmética não é tolerância de convergência ou critério mecânico.
6. Somar com compensação de arredondamento, sem arredondamentos intermediários nem ajuste de parcelas para forçar igualdade. O arredondamento apresentado na tela não volta ao núcleo.

Quando faltar γ, o resultado de pesos fica bloqueado, com diagnóstico por material, sem total parcial. A geometria e suas áreas continuam disponíveis. Não apresentar peso zero para um dado ausente.

## Interface e persistência

**Preparar fatias** também prepara o peso próprio quando os dados necessários estão disponíveis. O inspetor mostra o total ou as pendências. Em **Inspecionar fatias → Pesos por fatia**, consultar totais por material e as parcelas da fatia selecionada. A tabela geral também apresenta o peso próprio de cada fatia.

Rascunhos não alteram os pesos aplicados e ocultam sua apresentação até aplicar ou descartar. Mudanças aplicadas em materiais, geometria ou condições exigem nova preparação. Desfazer/refazer e troca de caso seguem a revisão de entrada. Os contratos de entrada e geometria continuam independentes; os pesos usam `geostruct-slice-weights/1`, estado `self-weight-only`. Nenhum resultado ou perfil é salvo no projeto `geostruct/4`, nem cria uma operação de histórico.

## Casos independentes

- Duas subáreas de 2 m² e 3 m², com γ de 18 e 20 kN/m³: parcelas de 36 e 60 kN/m; total de **96 kN/m**. Caso aritmético do contrato de subáreas, separado dos testes de interseção.
- Círculo de raio 5 m, centro (0, 4), terreno Z = 0: área independente `25 acos(4/5) − 12` m²; material homogêneo com γ = 18 resulta em 18 vezes essa área.
- Inclusão retangular acima do arco com área conhecida e γ diferente do fundo: conferir a soma por material, sem usar apenas o material da base.
- Estratos horizontais: áreas independentes de segmentos circulares multiplicadas pelos γ explicitamente informados. Refinamento, escala, translação e espelhamento preservam as relações esperadas.

Os testes verificam também nulos, finitude, material sem contribuição, origem, imutabilidade, revisão, água/cargas sem adição ao peso próprio e histórico na interface. São verificações desta preparação; não validam estabilidade.

O próximo passo é consolidar e preparar as pressões da linha piezométrica nas bases das fatias, com cobertura, hipóteses de água e casos independentes, antes de acrescentar sobrecargas e equações de equilíbrio.
