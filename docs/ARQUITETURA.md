# Arquitetura

React, TypeScript e Vite compõem a interface. Tauri 2 fornece a janela nativa para Linux/Windows. Os arquivos, a tipografia, os ícones e o processamento são locais. Não existe backend remoto, conta ou telemetria do produto.

| Camada                           | Responsabilidade                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/domain/model.ts`            | Contrato `geostruct/4`, migração de v1/v2/v3, materiais, seções, IDs e validação estrutural |
| `src/domain/materials.ts`        | Pendências, consulta de uso, criação/duplicação, atribuição e substituição de materiais     |
| `src/domain/analysis.ts`         | Casos, condições resolvidas para prévia/conferência, referências e operações por seção      |
| `src/domain/conditions.ts`       | Condições de água/cargas, seleção de dados ativos e operações imutáveis de sobrecarga       |
| `src/domain/geometry.ts`         | Contornos, interpolação, sobreposição, cobertura e diagnósticos do editor                   |
| `src/domain/editing.ts`          | Operações imutáveis de vértices/contornos, interfaces coincidentes, divisão e cópia         |
| `src/domain/precision.ts`        | Captura, entrada absoluta/relativa/polar e medição, sem dependência de tela                 |
| `src/domain/history.ts`          | Histórico imutável, limitado a 50 transações                                                |
| `src/components/ModelCanvas.tsx` | Vista SVG, coordenadas de tela, pan/zoom, captura e prévias de desenho                      |
| `src/components/Inspector.tsx`   | Rascunhos de campos e aplicação transacional                                                |
| `src/App.tsx`                    | Projeto ativo, seleção, comandos, histórico e proteções de navegação                        |
| `src/lib/files.ts`               | Adaptadores web/desktop, serialização, exportação e recuperação                             |
| `src-tauri`                      | Identidade nativa, diálogos, permissões e empacotamento                                     |

O modelo usa coordenadas cartesianas X e Z, com Z positivo para cima. O campo JSON `y` armazena a coordenada vertical Z. Comprimentos em m, tensões em kPa e pesos específicos em kN/m³. Zoom e pan pertencem à vista, nunca alteram o modelo.

Cada seção possui um terreno e uma base horizontal; o domínio é fechado automaticamente. Regiões poligonais representam outros solos e não podem sobrepor suas áreas. O material de fundo preenche o restante do domínio. Novas seções/regiões começam com referência de material nula, indicada como pendência; isso não representa um vazio físico. Materiais são compartilhados no projeto; seções duplicadas recebem novos IDs para seus elementos e preservam suas atribuições existentes.

O terreno admite X não decrescente e faces verticais, sem retorno sobre segmentos nem prolongamentos sem área nas extremidades. A base continua horizontal e perfis em balanço não são admitidos. A linha piezométrica mantém X estritamente crescente. Na abscissa de uma face vertical, o desenho de cargas usa o envelope superior e o diagnóstico de água acima do terreno usa o inferior. Essas convenções servem ao editor, não definem forças ou admissibilidade do futuro solver. A tolerância geométrica do editor é `1e-7 m`; não determina convergência, admissibilidade ou tolerância do futuro cálculo.

Os contornos continuam armazenados como listas de pontos. O formato atual é `geostruct/4`: acrescenta casos com identidade e vínculo à seção; conserva as pendências de materiais introduzidas em v2 e acrescenta condições explícitas de água/cargas, peso específico da água, origem e habilitação de cargas, além de q nulo. A leitura valida v1/v2/v3 em seus contratos antes de migrar; preserva valores, coordenadas e IDs e não interpreta ausência de lançamento como condição seca ou sem cargas. Campos desconhecidos são recusados. A interface comunica a migração e marca o projeto para salvar; aplicativos antigos não leem v4. Use Salvar como para manter o original. A recuperação local antiga passa pela mesma leitura. Grade, restrição ortogonal e vinculação de interfaces são opções da sessão, não parâmetros físicos serializados.

`conditions.ts` centraliza quais lançamentos estão ativos. Desenho, captura e diagnósticos geométricos usam somente a água piezométrica e as faixas habilitadas na condição de cargas. Dados guardados continuam no cadastro e relatório, com identificação de inatividade. Trocas no gerenciador são transações imediatas; propriedades usam rascunho/Aplicar. Duplicar carga cria ID próprio e cópia desabilitada. Reativação que introduza erro geométrico é recusada e apresentada no formulário. `introducedError` distingue os diagnósticos por seção, destino e mensagem. Veja [Água e cargas](AGUA-E-CARGAS.md).

`analysis.ts` mantém os casos fora da geometria da seção, em `project.analysisCases`. Cada caso referencia a seção e, opcionalmente, IDs de faixas dela. `resolveCaseSection` produz uma cópia para prévia e conferência, aplicando condições do caso sem modificar a seção armazenada. A condição herdada é dinâmica; a opção de faixas selecionadas independe da habilitação global. O desenho do caso é uma prévia sem edição da geometria base; a árvore ou Voltar à seção base retorna à edição. A seleção de caso é estado da sessão, não altera o arquivo.

Duplicar a seção duplica seus casos e remapeia IDs das cargas; excluir a seção exclui seus casos na mesma transação e com confirmação explícita. Faixas referenciadas em seleções de casos, inclusive guardadas/inativas, não podem ser excluídas até retirar essas referências. O círculo de tentativa permanece independente: copiar para um caso é uma operação explícita. A migração não cria casos automaticamente. Veja [Casos de análise](CASOS-DE-ANALISE.md).

Criar uma região não escolhe o primeiro material. O gerenciador de materiais exibe pendências e usos em todas as seções. Atribuição em lote muda somente os destinos escolhidos na seção ativa; substituição ao excluir percorre todas as atribuições do material. Essas operações são imutáveis e entram no histórico como uma transação. Uma exclusão em uso sem substituto válido é recusada. Duplicar material cria um ID independente e não muda suas atribuições. Veja [Materiais e formato](MATERIAIS-E-FORMATO.md).

A edição vinculada encontra coincidências geométricas entre terreno e regiões. Ao mover uma aresta, insere os vértices necessários nos vizinhos e interpola suas subdivisões ao longo da nova aresta. Inserção/exclusão acompanha os contornos coincidentes; a água permanece independente. Cada aplicação produz uma seção nova e só chega ao histórico após validação. Copiar cria outro ID; dividir preserva o ID original em uma das partes e cria outro na segunda, mantendo o material nas duas. Divisão com ilhas, furos ou mais de duas partes é recusada.

A tabela conserva a correspondência de linhas existentes para propagar movimentos e exclusões. Colar uma lista substitui apenas o contorno selecionado, sem inferir correspondência com vértices antigos. Para substituir a maior parte dos vértices, deve-se usar essa operação explícita. A entrada numérica direta não é arredondada pela captura. Captura prioriza vértices, interseções, segmentos e grade; a restrição ortogonal preserva a coordenada transversal da âncora.

A serialização valida tipos, limites, referências e IDs. Arquivos estruturalmente inválidos são recusados sem substituir o projeto aberto. Um arquivo estruturalmente válido com inconsistências geométricas pode ser aberto e corrigido; os diagnósticos continuam visíveis. Aplicações de edição não introduzem novos erros geométricos. Avisos, inclusive parâmetros ainda vazios, são preservados no arquivo.

Rascunhos de propriedades só modificam o modelo em **Aplicar**. A troca de contexto protege rascunhos e desenhos em andamento. Arrastar um vértice confirma uma transação ao soltar. Cancelar restaura a geometria original. Undo/redo não intercepta edição de texto em campos.

Os diálogos nativos ampliam o escopo apenas para caminhos selecionados pelo usuário. Não há permissão de leitura/escrita global. A proteção de fechamento nativa intercepta `CloseRequested`; navegação no navegador usa `beforeunload`. A recuperação local guarda o último modelo aplicado, não rascunhos de campos ou traçados ainda não concluídos.

## Preparação para o motor

O motor será um módulo separado do React, com dados de entrada normalizados, resultados por fatia, diagnósticos e revisão do modelo de origem. A busca deverá executar em Worker com progresso e cancelamento. A versão atual não contém solver simulado, regra de FS mínimo ou sinalização de aprovação de estabilidade. O contrato detalhado depende do fechamento das issues #30/#31.

## Conferência integrada dos lançamentos

Em **Análise → Conferir modelo**, filtre por seção/caso e severidade. Cada caso inclui a geometria e os materiais compartilhados, além das condições efetivas de água/cargas do cenário. Materiais sem uso aparecem em um escopo próprio. Clique numa pendência para abrir o cadastro correspondente; rascunhos continuam protegidos. O relatório de entradas inclui a mesma conferência por escopo. Pendências compartilhadas aparecem em cada caso afetado, portanto as contagens não são somáveis como ocorrências únicas.

A conferência é derivada dos dados aplicados e não altera o formato v4 ou cria resultados. Ausência de pendências não comprova admissibilidade das superfícies nem estabilidade. Testes cobrem dependências compartilhadas, isolamento, condições próprias, ida/volta do arquivo, navegação e rascunhos. O salvamento recusa projetos acima de 8 MB para evitar produzir um arquivo que o leitor rejeitaria; o modelo aberto permanece disponível para edição.
