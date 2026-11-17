# Entradas do núcleo — primeira etapa

O contrato `geostruct-input/1` reúne as entradas aplicadas de um caso em uma cópia imutável, separada da interface e do arquivo de projeto. É um contrato de transferência de dados, sem perfil numérico, fatias, forças, busca, FS ou classificação de estabilidade dentro dessa entrada. A preparação geométrica consome esse contrato e devolve suas fatias separadamente; ver [Geometria do círculo](GEOMETRIA-DO-CIRCULO.md). As regras físicas continuam dependentes da especificação #30 e dos casos independentes #31.

## Uso na interface

Selecione um caso na árvore e abra **Entradas para o núcleo**, no painel de propriedades. A conferência mostra as condições efetivas, materiais referenciados, faixas ativas e pendências. Alterações em rascunho só entram após **Aplicar caso**. Edições dos dados compartilhados e desfazer/refazer atualizam a conferência.

“Entradas reunidas” significa ausência de pendências na conferência do cadastro. Não significa que uma superfície é admissível ou que há autorização para executar cálculo. “Entradas com pendências” mantém os valores disponíveis e os diagnósticos, inclusive erros geométricos. Projeto estruturalmente inválido ou caso inexistente produz “Entrada indisponível”, sem snapshot.

## Separação de responsabilidades

- `src/core/input.ts`: tipos independentes do editor, React, Tauri, arquivos e navegador.
- `src/domain/core-input.ts`: `prepareCoreInput(project, caseId)` valida a estrutura atual, resolve o caso pelas mesmas regras do editor e monta o snapshot. O núcleo não importa o modelo do editor.
- `src/components/CoreInputPreview.tsx`: apresentação dos dados aplicados e diagnósticos.

O adaptador recebe `unknown` e recusa valores não finitos, campos desconhecidos, IDs duplicados e referências inexistentes/cruzadas. A validação estrutural abrange o projeto inteiro, inclusive referências guardadas. Arquivos antigos passam primeiro pelo leitor e suas migrações existentes; o adaptador não infere casos nem migra formatos.

## Conteúdo

| Bloco       | Regra de transferência                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origem      | Formato do projeto e IDs/nomes do projeto, seção e caso; hipóteses e fontes dos parâmetros preservadas                                            |
| Unidades    | Comprimentos em m, forças em kN, tensões em kPa, pesos específicos em kN/m³ e ângulos de entrada em graus                                         |
| Coordenadas | Referencial original X/Z, Z positivo para cima; o campo `y` do arquivo vira `z`, sem espelhamento ou arredondamento                               |
| Geometria   | Terreno, base horizontal, regiões e atribuições, inclusive nulas; faces verticais preservadas                                                     |
| Materiais   | Somente os referenciados pela seção; parâmetros efetivos/totais, peso específico total e origem, sem deduções                                     |
| Água        | Escolha do caso e condição resolvida; linha e γw somente quando piezométrica. No modo seco/não definido, esses campos ficam nulos por inatividade |
| Cargas      | Escolha do caso, condição resolvida e faixas efetivamente ativas; seleção própria independe da habilitação na seção                               |
| Superfície  | Apenas o modo ativo: círculo fixo ou eixos X/Z/raio com limites e passos. Modo não definido permanece nulo                                        |
| Pendências  | Mesma conferência integrada do caso, com destinos preservados; separada da entrada e sem tolerâncias de solver                                    |

Campos ausentes não recebem valores presumidos. Zero de coesão, atrito ou q é conservado. Seleção vazia de faixas permanece pendente, diferente de “sem sobrecargas”. Passo nulo de eixo fixo é preservado. A cópia não inclui o círculo de tentativa nem configurações inativas; esses dados continuam integralmente no projeto.

Não há conversão para radianos, normalização pelo sentido de deslizamento, avaliação de admissibilidade ou combinação física de água, materiais e cargas. Essas operações pertencem às próximas etapas, conforme regras aprovadas. As tolerâncias do editor usadas nos diagnósticos existentes não entram no contrato do núcleo.

## Revisão e imutabilidade

`InputSnapshot` contém `input` e `revision`. A revisão é a serialização JSON exata da entrada construída em ordem definida pelo adaptador. Não usa relógio, contador, hash abreviado ou arredondamento. A comparação não tem colisões de hash; diferenças de conteúdo ou da ordem das listas produzem nova revisão. A string pode ser longa e fica em memória, sem exibição ou gravação no projeto.

`isCoreInputCurrent(project, snapshot)` compara essa revisão com a entrada atual do mesmo caso. Alterar geometria, material usado, origem, hipótese, direção, água/carga efetiva ou superfície ativa invalida a cópia anterior. Desfazer até os mesmos dados recupera a igualdade. Excluir o caso ou tornar o projeto estruturalmente inválido retorna falso.

Mudanças em outras seções/casos, materiais sem uso, cores e configurações inativas não alteram a revisão desse caso, desde que o projeto continue estruturalmente válido. IDs, nomes e textos incluídos na entrada também participam da revisão. Ela identifica os dados efetivos do caso, não o SHA do código ou uma revisão global do projeto. Futuros resultados deverão registrar também a versão do motor, da especificação e do perfil numérico.

O snapshot e seus diagnósticos são profundamente somente leitura em TypeScript e congelados em execução. Nenhuma referência mutável do projeto é compartilhada. A cópia é serializável para futura transferência a Worker, mas o Worker e o cache de resultados não fazem parte desta entrega.

O arquivo continua `geostruct/4`, sem novos campos ou migração. O projeto salvo não contém snapshot, revisão, diagnóstico ou resultado derivado.

## Verificação e próxima entrega

Testes cobrem herança e seleção própria, campos incompletos/zero, referências inválidas, conversão X/Z, faces verticais, fontes, isolamento, imutabilidade, ida/volta do arquivo e revisão após desfazer/refazer. Os fluxos de interface cobrem rascunhos, condições efetivas, edição de material compartilhado e preservação do formato v4. São testes de transferência e cadastro, sem validação geotécnica.

A preparação geométrica de um círculo fixo já consome esse contrato, com regras e casos analíticos descritos em [Geometria do círculo](GEOMETRIA-DO-CIRCULO.md). A etapa separada de [peso próprio](PESOS-DAS-FATIAS.md) usa o mesmo snapshot e as subáreas, conforme o recorte aprovado de D2. Os demais cálculos dependem do fechamento da [especificação #30](https://github.com/ricardocorsini/openstruct-front/issues/30) e dos [casos independentes #31](https://github.com/ricardocorsini/openstruct-front/issues/31).
