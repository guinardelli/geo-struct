# Validação da primeira etapa

## Verificações executáveis

- `npm run check`: tipos TypeScript e testes do domínio. Cobertura de geometria, interseção/cobertura de regiões, linhas, água, faixas, leitura/limites de arquivo, IDs, duplicação, números e histórico.
- `npm run build`: aplicação web compilada.
- `npm run test:e2e`: uso real no Chromium, incluindo criação, edição, rascunhos, arraste, cancelamento, undo/redo, seções, arquivos, recuperação, relatório e janela mínima.
- `npm run format:check`: consistência de formatação.
- Workflow `Validate and build`: repete as verificações e compila o executável Tauri em Ubuntu 24.04 e Windows. Não publica release nem integra o catálogo.

Os artefatos do CI incluem traces de falhas, sem capturas de imagens. Resultados de uma execução específica devem ser conferidos pelo SHA no GitHub Actions.

### Evolução da geometria e edição

Testes adicionais verificam interfaces com subdivisões diferentes, conservação de área e ausência de sobreposição após editar/dividir, limites de pontos, identidades/materiais, cópia inválida, precisão/captura e faces verticais. O arquivo de exemplo da primeira versão é lido e regravado sem alterar seus dados. Os fluxos de interface cobrem edição compartilhada e histórico, inserção/exclusão gráfica, divisão com persistência, rejeição de cópia, deslocamento relativo, medição sem modificar o modelo e entrada de face vertical na janela mínima.

Asserções de geometria não são validações das forças sobre faces verticais. O solver ainda não existe. Não se executa geração/conversão de imagens nos testes; traces são mantidos sem screenshots.

### Materiais e arquivos

Os testes verificam atribuição explícita/nula, zero de coesão/atrito, escolha de tipo de resistência, limites de cadastro, duplicação independente, atribuição em lote isolada por seção e substituição/exclusão em todas as seções com histórico único. Cobrem lista vazia de materiais, referências inválidas, preservação dos dados v1 na migração para o formato atual e recusa de campos desconhecidos. Os fluxos Chromium exercitam o gerenciador na janela mínima, rascunhos, pendências, relatório, persistência, recuperação antiga e navegação aos usos do material.

Os limites numéricos são limites do cadastro de software. “Dados preenchidos” não é validação dos parâmetros de engenharia ou condição de cálculo.

### Água, cargas e formato v3

Testes de domínio verificam estados explícitos, retenção ao desativar, q nulo/zero, origem, limites estruturais, ativação inválida, cobertura, linha acima de vértice interior/face vertical, intervalos sobrepostos e contato nas bordas. Incluem exclusão da última faixa, cópia desabilitada, histórico, isolamento e distinção entre erros iguais de seções diferentes. Leitura de v1/v2 preserva IDs e dados, mantém ausência como não definida e recusa campos desconhecidos.

Os testes Chromium cobrem condição seca e reativação, edição decimal/rascunhos, desenho de linha/faixa, relatório, persistência, gerenciador na janela mínima, habilitação, duplicação, exclusão, navegação a pendências de outra seção e rejeição de ativação fora do terreno. Nenhuma verificação calcula pressão, esforço ou FS.

### Casos de análise e formato v4

O domínio cobre criação com escolhas pendentes, condições herdadas e próprias, seleção de faixas independente da seção, duplicação/exclusão com histórico, limite de casos, referências cruzadas e remapeamento ao duplicar a seção. Valida círculo incompleto, raios/passos inválidos, eixos fixos, limites invertidos, troca de modo sem perda e diagnósticos dos cenários. A migração de v1/v2/v3 preserva os dados e não inventa casos.

Os fluxos Chromium verificam criação, edição, rascunhos, desenho/cancelamento, cópia do círculo de tentativa, prévia de condições, busca sem geração de candidatos, arquivo e relatório, gerenciador na janela mínima, exclusão de faixa referenciada, operações de seção com casos, navegação por diagnóstico e recuperação v3. As verificações não validam interseções do círculo, admissibilidade física, malha de candidatos ou FS.

## Limites

As verificações são de software de modelagem, sem validação de solver geotécnico. Não há benchmark de FS nesta entrega. A revisão com engenheiros e os casos de cálculo independentes dependem das issues #30/#31 do frontend.

Compilar um executável nativo não comprova sua interação com todos os ambientes. Antes de distribuir instaladores, conferir manualmente em Linux e Windows: abrir/salvar, cancelamento de diálogo, permissões, fechamento com alterações, impressão, escala de tela, zoom/pan e teclado. Validar Linux WebKitGTK e Windows WebView2 além do Chromium dos testes.

A recuperação usa armazenamento local e pode ser bloqueada pelo navegador. O caso deve produzir aviso sem substituir a responsabilidade de salvar arquivo. Arquivos com geometria inconsistente são abertos com diagnósticos, sem conferir aprovação de estabilidade.

## Conferência integrada dos lançamentos

Em **Análise → Conferir modelo**, filtre por seção/caso e severidade. Cada caso inclui a geometria e os materiais compartilhados, além das condições efetivas de água/cargas do cenário. Materiais sem uso aparecem em um escopo próprio. Clique numa pendência para abrir o cadastro correspondente; rascunhos continuam protegidos. O relatório de entradas inclui a mesma conferência por escopo. Pendências compartilhadas aparecem em cada caso afetado, portanto as contagens não são somáveis como ocorrências únicas.

A conferência é derivada dos dados aplicados e não altera o formato v4 ou cria resultados. Ausência de pendências não comprova admissibilidade das superfícies nem estabilidade. Testes cobrem dependências compartilhadas, isolamento, condições próprias, ida/volta do arquivo, navegação e rascunhos. O salvamento recusa projetos acima de 8 MB para evitar produzir um arquivo que o leitor rejeitaria; o modelo aberto permanece disponível para edição.
