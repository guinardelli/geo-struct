# Casos de análise e formato v4

Um caso prepara as entradas de uma análise na geometria de uma seção. Cada caso tem ID próprio; geometria, materiais, linha piezométrica e dados das faixas continuam no cadastro da seção. Mudar esses dados afeta os casos vinculados. A versão em desenvolvimento permite preparar a [geometria das fatias de um círculo fixo](GEOMETRIA-DO-CIRCULO.md), sem gravá-la no arquivo. Fellenius pode avaliar o círculo fixo na sessão, sem persistir resultados. Bishop e enumeração de candidatos permanecem pendentes.

## Contrato

`project.analysisCases` admite de zero a 100 casos. IDs são únicos em todo o projeto. Um projeto novo ou migrado não recebe casos automaticamente.

| Campo                     | Conteúdo e regra                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`, `name`, `sectionId` | ID único, nome não vazio até 120 caracteres e referência obrigatória a uma seção existente                                    |
| `description`             | Hipóteses do cenário, até 2.000 caracteres; branco é pendência                                                                |
| `direction`               | `left-to-right` (+X), `right-to-left` (−X) ou nulo; não inferida pela inclinação do terreno                                   |
| `methods`                 | Lista sem duplicatas de `bishop` e/ou `fellenius`; vazia é pendência. Fellenius disponível para círculo fixo; Bishop pendente |
| `surfaceMode`             | `fixed`, `search` ou nulo                                                                                                     |
| `fixedCircle`             | Centro `x`, `y` (Z) em m e `radius` em m; cada valor pode ser nulo enquanto pendente                                          |
| `search`                  | Eixos `x`, `y` (Z) e `radius`, cada um com `min`, `max` e `step` em m, inicialmente nulos                                     |
| `waterCondition`          | Nulo, `section`, `dry` ou `piezometric`                                                                                       |
| `waterSource`             | Origem/justificativa da hipótese própria de água, até 2.000 caracteres                                                        |
| `loadCondition`           | Nulo, `section`, `none` ou `selected`                                                                                         |
| `loadIds`                 | IDs distintos de até 100 faixas da mesma seção, preservados também quando a seleção estiver inativa                           |

Coordenadas têm o limite de armazenamento existente de ±1.000.000 m; raios devem ser positivos e até 1.000.000 m; passos devem ser positivos e até 2.000.000 m. São limites de cadastro, sem significado de recomendação de engenharia. Campos faltantes permanecem nulos, sem valores presumidos. O referencial original X/Z é preservado ao mudar a direção; eventual normalização pertence à preparação futura do motor.

Mínimo não pode exceder máximo no modo de busca ativo. Intervalos não nulos exigem passo informado; um intervalo fixo admite passo nulo. Esta entrega não decide tolerância, tratamento dos extremos, teto de candidatos, desempate ou resolução recomendada. Nenhuma contagem de candidatos é apresentada.

O registro de centros, raios e passos explícitos segue o recorte de D5 registrado na [decisão de engenharia da #30](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580). A [especificação candidata](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450) mantém R0–R6 e aceite integral pendentes na consulta de 17/11/2026. Este cadastro não implementa as regras de cálculo ou as propostas numéricas ainda em revisão.

## Resolução das condições

| Escolha no caso    | Entradas usadas na prévia e conferência                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Água `section`     | Condição, linha, γw e origem atuais da seção                                                                 |
| Água `dry`         | Hipótese seca e origem informada no caso; linha/γw da seção permanecem guardados                             |
| Água `piezometric` | Linha e γw cadastrados na seção, com origem da hipótese própria do caso; a linha pode estar inativa na seção |
| Água nula          | Não definida, sem pressupor condição seca                                                                    |
| Cargas `section`   | Condição atual da seção e habilitação individual de suas faixas                                              |
| Cargas `none`      | Nenhuma faixa ativa no caso, mantendo os IDs guardados                                                       |
| Cargas `selected`  | Somente as faixas em `loadIds`, independentemente da habilitação ou condição de cargas na seção              |
| Cargas nula        | Não definidas, sem pressupor ausência de carga                                                               |

A resolução cria uma cópia em memória, sem alterar o cadastro. Dados de cada faixa são compartilhados: nome, intervalo, q e origem continuam na seção. Uma seleção explícita vazia é pendência, não é convertida para `none`. A origem própria de água permanece guardada quando se escolhe herdar a condição da seção. Uma hipótese piezométrica exige linha e γw; a seca exige justificativa. A conferência reutiliza os diagnósticos de água/cargas com destino ao caso correspondente.

O modelo ainda contém uma única linha piezométrica e um cadastro de faixas por seção. Linhas alternativas ou intensidades diferentes podem ser representadas em outra seção duplicada; séries temporais, combinações com fatores, variações de material e estágios construtivos não fazem parte deste recorte.

## Edição e integridade

- Criar caso deixa direção, métodos, superfície e condições pendentes; não copia o círculo de tentativa automaticamente.
- Copiar círculo de tentativa preenche o rascunho. Desenhar círculo do caso grava sua geometria em uma operação; a tabela aceita ponto/vírgula decimal.
- Alternar círculo fixo/busca conserva a configuração inativa. A prévia mostra apenas o modo aplicado; não comprova interseções, massa deslizante ou admissibilidade.
- Duplicar caso cria ID próprio e conserva as referências na mesma seção. Configurações são independentes.
- Duplicar seção copia seus casos e remapeia as referências para os novos IDs de faixas, inclusive seleções guardadas. Se exceder o limite de casos, a operação inteira é recusada.
- Excluir caso preserva a seção. Excluir seção informa quantos casos serão excluídos e realiza tudo no mesmo passo de histórico.
- Excluir faixa selecionada por qualquer caso exige retirar antes suas referências, inclusive guardadas/inativas. Casos que herdam a lista da seção acompanham as alterações dessa lista.
- Rascunhos exigem Aplicar caso; trocar contexto protege campos e desenhos em andamento. Desfazer/refazer reverte cada transação completa.

A prévia de caso permite navegar e inspecionar suas entradas; editar a geometria retorna ao cadastro base pela árvore ou pelo comando específico. Selecionar um caso não altera o arquivo. O relatório conserva as hipóteses, direção, métodos, condições resolvidas, faixas ativas e configurações inativas identificadas, sem FS ou status de aprovação.

## Migração

O formato atual é `geostruct/4`. O leitor valida o contrato declarado antes de migrar. Arquivos v3 recebem `analysisCases: []` e `version: 4`, conservando integralmente os demais campos, inclusive nulos, zeros, linhas/faixas inativas e círculo de tentativa. Arquivos v1/v2 recebem também os campos de água/cargas descritos em [Água e cargas](AGUA-E-CARGAS.md), sem pressupor hipóteses ausentes.

Não se deduz direção, método ou cenário de um círculo antigo. IDs, materiais e geometria são preservados. Campos desconhecidos, referências inexistentes ou cruzadas entre seções e IDs duplicados são recusados. A recuperação local mantém a mesma chave e usa esse leitor. A abertura comunica a migração e marca o projeto para salvar; Salvar como conserva o original. Versões anteriores do aplicativo não leem v4.
