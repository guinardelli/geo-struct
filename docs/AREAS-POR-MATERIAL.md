# Áreas por material nas fatias

Esta etapa acrescenta a composição geométrica das fatias ao contrato `geostruct-fixed-geometry/2`. O arquivo de projeto continua `geostruct/4`; o resultado é imutável, vinculado à revisão das entradas e mantido apenas na sessão. Não há pesos, pressões, forças, parâmetros resistentes equivalentes ou FS.

## Regras da partição

- A área de cada material é sua interseção com a faixa vertical da fatia, acima do arco inferior e abaixo do terreno. O material identificado na base não é usado para atribuir toda a área da fatia.
- Regiões côncavas podem contribuir com vários intervalos separados. Orientação do contorno e ordem do cadastro não definem prioridade. Bordas compartilhadas têm área nula; sobreposições positivas ou topologia indistinguível interrompem a preparação.
- O solo de fundo ocupa os intervalos não cobertos pelas regiões. Sua área é integrada nesses intervalos; não é um resíduo ajustado para forçar a conservação.
- Toda parcela positiva precisa de material atribuído. Uma região sem material que contribui acima da base bloqueia a preparação, mesmo sem tocar o círculo. Regiões fora da massa não contribuem. Parâmetros físicos ainda vazios não impedem esta etapa geométrica.
- Parcelas com o mesmo material são somadas, preservando os IDs das regiões e suas áreas. A origem `regionId: null` identifica o solo de fundo. Nomes iguais não substituem IDs distintos.
- A decomposição introduz limites internos de integração nas abscissas dos vértices das regiões. Eles não alteram as fatias, o refinamento angular ou o material da base definidos na etapa anterior. Faces verticais e interfaces compartilhadas usam limites unilaterais.

## Integração e conservação

Entre dois limites internos, as arestas poligonais são retas. A varredura vertical usa paridade para obter os intervalos de cada região, recorta-os pelo terreno e pelo arco, verifica sobreposições e integra também os intervalos restantes de fundo. Coordenadas locais em relação ao centro do círculo reduzem o cancelamento por translação. Um intervalo cujo ponto interior não possa ser representado gera diagnóstico.

Entre duas retas, a área é a do trapézio. Quando o limite inferior é o arco, soma-se ao trapézio até a corda o segmento circular `R² (θ − sin θ) / 2`, avaliado pela série estável já utilizada na geometria. Não há aproximação do arco por segmentos, quadratura dependente da tela ou distribuição proporcional pelo material da base. Os comprimentos e as áreas continuam em m e m².

As somas por origem, material, fatia e conjunto usam compensação de arredondamento. Para cada fatia, registrar soma das subáreas, diferença assinada em relação à área geométrica independente e limite de comparação `ε × b`, em m², onde `ε` é a tolerância geométrica informada e `b` é a largura. A conferência global usa `ε × (Xfinal − Xinicial)`. Esses limites são decisões geométricas explícitas desta etapa, não tolerâncias de convergência ou critérios de engenharia. Resíduo acima do limite, parcela negativa ou resultado não finito bloqueia a preparação. Não corrigir a maior parcela nem redistribuir a diferença.

Limites operacionais: até 20.000 intervalos internos e 2.000.000 avaliações de arestas ativas por preparação, além das 2.000 fatias já existentes. O orçamento é conferido antes da integração; excesso produz diagnóstico, sem truncar áreas ou congelar a interface com uma expansão sem limite.

## Referências de verificação

O §2 da [especificação candidata #30](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450) distingue a área `Aij` de cada material e o material resistente na base. A PR #37 continua candidata; esta implementação não registra aceite das regras físicas pendentes. O [contrato do círculo](GEOMETRIA-DO-CIRCULO.md) mantém a proveniência e as decisões geométricas anteriores.

Os casos próprios verificam estratos horizontais com áreas de segmentos circulares, interfaces inclinadas, divisão simétrica, inclusões poligonais com áreas conhecidas e regiões côncavas. Incluem conservação por fatia e global, refinamento, translação, escala, inversão dos contornos, espelhamento, atribuição explícita, fundo e múltiplas regiões do mesmo material. Os testes de interface conferem totais, composição por fatia, edição/histórico e preservação do arquivo. São referências de geometria, não benchmarks de estabilidade.

## Uso e próxima etapa

Prepare o círculo como antes e abra **Inspecionar fatias → Áreas por material**. Consulte os totais e selecione uma fatia para conferir sua composição, origens e diferença de conservação. Alterar o cadastro ou o perfil exige nova preparação.

Essas áreas alimentam a etapa independente de [pesos próprios](PESOS-DAS-FATIAS.md), pelos pesos específicos totais explicitamente informados. O contrato geométrico continua sem grandezas mecânicas. Pressões, sobrecargas e equações de estabilidade continuam etapas posteriores.
