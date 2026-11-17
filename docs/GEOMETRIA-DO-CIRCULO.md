# Geometria de um círculo fixo — contrato 2

Esta entrega consolida o recorte geométrico de R1/R3 da especificação candidata #30, sob a autorização de implementação do mantenedor nesta etapa. Não registra aceite de engenharia da especificação integral, não fecha a PR #37 e não implementa forças, pressões, FS, busca ou critérios normativos.

## Fontes e alcance

- A decisão D3 aprovada pelo Eng. Gustavo Azocar estabelece fatias verticais, cortes nas transições e abertura inicial máxima de 3°, com refinamento: <https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580>.
- O §2 da proposta `34af4d9` descreve arco inferior, dois cruzamentos, cortes obrigatórios e distingue arco/corda: <https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450>. R1/R3 e o aceite integral permanecem abertos; as regras abaixo são decisões explícitas desta preparação geométrica, não uma aprovação presumida das equações.
- USACE EM 1110-2-1902 (31/10/2003), §1-5d(2), §C-1d e §F-2a(1–3): separação da massa em fatias verticais e distinção entre dimensões, áreas e pesos. O original foi consultado em <https://damtoolbox.org/images/8/83/Slope_Stability_Document.pdf> (cópia do manual; o endereço oficial retornou 403). O manual não fixa as tolerâncias desta implementação.

## Decisões geométricas

| Item             | Comportamento desta etapa                                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referencial      | X/Z original, com Z para cima; fatias ordenadas em +X. A direção do caso é preservada na revisão, mas não muda a geometria. Não há ângulo motriz de Fellenius/Bishop.                                                                                                                                           |
| Superfície       | Apenas círculo fixo completo e raio positivo; ramo inferior `z = zc − sqrt(R² − (x − xc)²)`.                                                                                                                                                                                                                    |
| Interseções      | Resolver todos os segmentos do terreno, inclusive verticais; descartar raízes do ramo superior. Raízes em vértices compartilhados representam um único encontro.                                                                                                                                                |
| Delimitação      | Exigir dois cruzamentos transversais, com terreno abaixo do arco por fora e acima por dentro. Tangência, contato sem troca de lado, cruzamentos adicionais, resolução insuficiente ou encontro no limite da seção/domínio do arco produzem diagnóstico, sem escolher um par arbitrário.                         |
| Faces verticais  | São cortes obrigatórios. O topo de cada fatia usa o limite do terreno pelo lado interior daquela fatia. A geometria preserva o salto de cota; não atribui forças à face.                                                                                                                                        |
| Base do domínio  | O arco deve permanecer acima da base horizontal com separação maior que a tolerância. Não recortar o círculo ou completar solo fora da seção.                                                                                                                                                                   |
| Cortes           | Preservar interseções extremas, vértices do terreno, encontros arco–bordas de regiões, encontros arco–linha piezométrica, nós da água e extremos das faixas ativas. Guardar o motivo e a origem de cada corte.                                                                                                  |
| Coincidências    | Cortes com a mesma abscissa são um único corte com todos os motivos. Raízes que correspondem a vértices de origem são ancoradas nesses vértices dentro da tolerância. Cortes distintos separados por distância menor ou igual à tolerância interrompem a preparação; não apagar uma faixa fina silenciosamente. |
| Refinamento      | Subdividir cada intervalo obrigatório em aberturas angulares iguais, de no máximo 3°; permitir valores menores. O refinamento conserva as fronteiras obrigatórias.                                                                                                                                              |
| Material da base | Classificar geometricamente o ponto médio angular; guardar o ID, sem aplicar resistência. Ponto indistinguível de uma interface, múltipla atribuição ou ausência de material gera diagnóstico. Não usar esse ponto ainda para pressão ou braço de peso.                                                         |
| Água/cargas      | Usar somente as condições efetivas do caso. Exigir condições definidas e cobertura da linha no intervalo preparado; não calcular pressão, força ou soma de carregamentos.                                                                                                                                       |
| Capacidade       | Limite operacional de 2.000 fatias por prévia, verificado antes da expansão. Ao excedê-lo, informar o limite sem truncar a geometria. Não é parâmetro de engenharia.                                                                                                                                            |

A tolerância geométrica em metros é obrigatória e informada pelo usuário, sem valor inicial presumido. O limite angular inicial de 3° vem de D3; a interface permite refiná-lo. A tolerância do editor não é importada pelo núcleo. O perfil usado acompanha o resultado em memória. Não é um perfil numérico de convergência do futuro solver.

Os diagnósticos de erro do cadastro impedem a preparação. Pendências de parâmetros resistentes não impedem a geometria, mas continuam visíveis e não são preenchidas. Atribuições usadas na base precisam ser inequívocas.

Na versão 2, o resultado também inclui [áreas por material e origem](AREAS-POR-MATERIAL.md), com conferência de conservação por fatia e global. Uma atribuição ausente em qualquer parcela positiva bloqueia a preparação, inclusive acima da base. Raízes da mesma reta compartilhada entre regiões são reaproveitadas mesmo quando a interface possui subdivisões diferentes; isso exige coincidência da reta, não apenas proximidade dos cortes.

## Grandezas e casos independentes

Para cada fatia, guardar limites X, cotas de topo e arco nos dois lados, largura, abertura angular, comprimento do arco, comprimento e inclinação geométrica da corda, ponto médio angular, material da base e área geométrica total. A área é a do trapézio entre terreno e corda acrescida do segmento circular entre corda e arco; não aproximar o arco por uma polilinha no cálculo da área. A avaliação do segmento usa a expansão de `θ − sin θ` para evitar cancelamento em aberturas pequenas. A soma das áreas usa compensação de arredondamento.

A referência independente inicial é um círculo de raio 5 m, centro (0, 4), interceptado pelo terreno horizontal Z = 0: encontros X = −3 e +3 e área `25 acos(4/5) − 12` m². Testes devem conferir essa área sem chamar a fórmula por fatia da implementação, além de translação, espelhamento e refinamento. Casos próprios adicionais cobrem contatos, vértices, faces verticais, interfaces, cortes e domínio truncado. São referências analíticas de geometria; não substituem os benchmarks geotécnicos da #31.

## Interface, revisão e persistência

Selecionar o caso, abrir **Geometria do círculo fixo**, informar a tolerância e usar **Preparar fatias**. A vista mostra os cortes e a base circular; a tabela permite inspecionar valores e motivos dos cortes. Alterar entradas efetivas ou o perfil oculta a prévia anterior. Rascunhos precisam ser aplicados antes da preparação. Abrir a tabela e preparar a geometria não modificam o projeto nem criam passos de histórico.

O arquivo permanece `geostruct/4`. Perfil de prévia e resultados são dados da sessão, não são gravados no projeto. O resultado registra a revisão exata de entrada, a versão do contrato geométrico e o perfil usado. A geometria preparada não constitui admissibilidade mecânica ou aprovação de estabilidade.

As subáreas por material estão implementadas no contrato 2 e alimentam o [contrato independente de peso próprio](PESOS-DAS-FATIAS.md). O próximo passo é consolidar e preparar pressões de água, depois resultantes de sobrecarga conforme as regras aprovadas, antes de implementar Fellenius/Bishop e os casos independentes de FS.
