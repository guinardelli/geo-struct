# Água e sobrecargas — cadastro e formato v3

Esta etapa prepara entradas explícitas de modelagem. Não calcula poropressões, forças, equilíbrio, fluxo ou fator de segurança. Os limites numéricos abaixo são controles de armazenamento, não valores recomendados nem critérios de aceitação de engenharia.

## Condição de água por seção

| Campo             | Conteúdo                                       | Regra de cadastro                                                                     |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `waterMode`       | `unspecified`, `dry` ou `piezometric`          | Escolha explícita; novo projeto começa não definido                                   |
| `water`           | Lista de pontos X/Z em m, ou `null`            | Até 500 pontos; X estritamente crescente quando a linha ativa tem dois ou mais pontos |
| `waterUnitWeight` | γw informado em kN/m³                          | Nulo, ou maior que zero e até 100; necessário na condição piezométrica                |
| `waterSource`     | Origem da medição ou justificativa da hipótese | Até 2.000 caracteres; branco é pendência para seca/piezométrica                       |

O campo `y` dos pontos guarda Z positivo para cima, como nos demais contornos. Uma linha representa carga piezométrica prescrita, não uma simulação de fluxo nem lâmina externa. O editor verifica cobertura horizontal do terreno e posição relativa usando os vértices das duas polilinhas, inclusive o lado inferior de faces verticais. Não extrapola a linha para trechos sem cobertura e não deduz pressões a partir dela.

Escolher seca ou não definida conserva todos os dados, com a linha inativa e fora do desenho, captura e edição gráfica. A tabela permite consultar/editar os dados guardados. Retornar à condição piezométrica verifica a geometria. Desenhar uma linha ativa a condição piezométrica, preservando o peso específico e a origem existentes; novos valores não são presumidos. Excluir a linha mantém a condição escolhida, que fica pendente se faltar a linha.

## Sobrecargas por seção

`loadCondition` admite `unspecified` (inicial), `none` e `loads`. A lista `loads` guarda até 100 faixas. Somente `loadCondition = loads` combinado com `enabled = true` torna uma faixa ativa.

| Campo da faixa | Conteúdo                                                                 | Regra de cadastro                                                                                   |
| -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `id` / `name`  | Identidade e nome                                                        | ID único no projeto; nome não vazio até 120 caracteres                                              |
| `x1` / `x2`    | Intervalo horizontal em m                                                | Coordenadas entre ±1.000.000; faixa ativa com largura positiva, inteiramente na extensão do terreno |
| `q`            | Intensidade uniforme vertical descendente em kPa, na projeção horizontal | Nulo ou entre 0 e 1.000.000; nulo é pendência e zero é dado informado                               |
| `enabled`      | Habilitação individual                                                   | Booleano explícito, preservado ao trocar a condição da seção                                        |
| `source`       | Origem e hipótese da sobrecarga                                          | Até 2.000 caracteres; branco é pendência da faixa ativa                                             |

Uma nova faixa ativa a condição de cargas e começa com q nulo e origem vazia. Duplicar conserva os dados, cria ID próprio e deixa a cópia desabilitada. Excluir a última faixa mantém a condição anterior: ausência de elementos não equivale a uma decisão de ausência de cargas.

Intervalos sobrepostos de faixas ativas produzem aviso com os nomes e o trecho comum; contato apenas na borda não é sobreposição. Não se calcula somatório, resultante ou decomposição de esforços. Faixas inativas continuam no gerenciador/relatório, mas não participam do desenho nem da conferência geométrica ativa. Reativação que introduza erro é recusada sem alterar o modelo. Propriedades pendentes podem ser salvas.

## Compatibilidade

O cadastro descrito neste documento foi introduzido em `geostruct/3`. O salvamento atual é `geostruct/4`, que adiciona [casos de análise](CASOS-DE-ANALISE.md). Antes de migrar, o leitor valida integralmente o contrato declarado em v1 ou v2, incluindo referências e campos desconhecidos. A migração preserva os IDs, materiais, geometria, pontos de água, limites e intensidades das cargas, inclusive zero. Acrescenta:

| Dado antigo                                   | Estado em v3                                                     |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Água não nula                                 | `waterMode: piezometric`, pontos preservados                     |
| Água nula                                     | `waterMode: unspecified`; não pressupõe condição seca            |
| Peso específico / origem da água inexistentes | `waterUnitWeight: null`, `waterSource: ""`                       |
| Lista de cargas não vazia                     | `loadCondition: loads`, faixas com `enabled: true`, origem vazia |
| Lista de cargas vazia                         | `loadCondition: unspecified`; não pressupõe ausência de cargas   |

Uma lista de água antiga vazia ou com um ponto fica piezométrica pendente; não é apagada nem considerada completa. O aplicativo comunica a migração e marca o arquivo para salvar. **Salvar como** conserva o original; aplicativos antigos não leem v4. Recuperações locais v1/v2 passam pela mesma leitura. Dados v3 inativos e pendentes são preservados ao migrar para v4, salvar e reabrir. Arquivos que se declarem antigos com campos novos são recusados.

## Limites e etapa seguinte

Materiais continuam com um peso específico total informado. A condição de água não altera esse valor, não cria pesos secos/saturados/submersos e não converte parâmetros efetivos/totais. Nenhuma regra de compatibilidade física entre esses campos é presumida enquanto o contrato do motor está pendente.

O recorte atual contém uma condição de água e uma condição de cargas por seção. Os casos próprios agora podem herdar essas condições ou escolher hipóteses de água e conjuntos de faixas, com direção, círculo fixo ou limites de busca. A geometria e os dados das faixas continuam pertencendo à seção. Água externa, fluxo numérico, forças concentradas, cargas trapezoidais/inclinadas, sismo e condições por estágio ainda não estão implementados. “Dados preenchidos” e ausência de erros de modelagem não significam aptidão para cálculo ou aprovação de estabilidade.
