# Histórico

## Em desenvolvimento — casos de análise

- Casos com identidade própria vinculados à seção, hipóteses, direção de deslizamento e métodos pretendidos.
- Condições de água/cargas herdadas ou próprias, seleção explícita de faixas e prévia das entradas do cenário.
- Círculo fixo por desenho/coordenadas ou cópia explícita do círculo de tentativa; limites e passos de busca circular, sem gerar candidatos.
- Gerenciador, duplicação/exclusão, relatório e diagnósticos. Duplicar seção remapeia as referências dos casos; excluir seção trata seus casos na mesma operação.
- Proteção de faixas referenciadas, rascunhos e histórico; formato `geostruct/4`, migrando v1/v2/v3 sem criar casos presumidos.

Próximo passo: conferência completa do lançamento e revisão de usabilidade/arquivos antes da distribuição desktop. Sem solver nesta entrega.

## Em desenvolvimento — água e sobrecargas

- Condições explícitas de água e presença de sobrecargas por seção; ausência de lançamento distinta de hipótese adotada.
- Peso específico e origem da condição de água; alertas de cobertura e posição da linha piezométrica.
- Sobrecargas com q inicialmente não informado, origem, habilitação, cópia desabilitada e exclusão com histórico.
- Gerenciador com intervalos sobrepostos e rejeição de reativação fora do terreno; dados inativos preservados no cadastro/relatório.
- Formato `geostruct/3`, leitura de v1/v2 preservando valores e IDs, inclusive q = 0, e recuperação local compatível.
- Testes de condições, migração, edição, persistência, histórico e isolamento entre seções.

Esta etapa de água/cargas não adicionou solver ou distribuição de instaladores.

## Em desenvolvimento — materiais e atribuição

- Gerenciador de materiais com pendências de cadastro e consulta de uso em todas as seções.
- Novas regiões e solos de fundo sem atribuição automática; escolha individual ou em lote, com retirada explícita de vínculo.
- Tipo de parâmetros efetivos/totais inicialmente não definido, rótulos c′/φ′ e c/φ, valores nulos distintos de zero e erros de cadastro em português.
- Duplicação independente e substituição de todas as atribuições ao excluir material em uso, em uma operação de histórico.
- Formato `geostruct/2`: referências e tipo de parâmetros podem ser nulos; zero materiais é permitido. Leitura/migração de v1 preserva dados e IDs; campos desconhecidos são recusados.
- Relatório, árvore e desenho identificam atribuições pendentes. Testes de domínio/interface incluem arquivos e recuperação antigos.

Esta etapa de materiais não adicionou cálculo ou distribuição desktop.

## Em desenvolvimento — geometria e edição

- Inserir/excluir vértices, mover contornos, copiar e dividir regiões por reta.
- Edição de interfaces coincidentes com propagação aos contornos vizinhos, inclusive pela tabela, e histórico por operação.
- Captura de vértices/interseções/segmentos, grade configurável e restrição horizontal/vertical.
- Entrada absoluta, relativa e por distância/ângulo; medição sem modificar o projeto.
- Faces verticais no terreno, com rejeição de retorno, balanço e trechos sem área nas extremidades.
- Compatibilidade com arquivos `geostruct/1`, testes de geometria/precisão e fluxos de interface.

Esta evolução não publica instaladores, não adiciona solver e mantém a arte personalizada adiada.

## 0.1.0 — 2026-11-17

Primeira entrega de código: modelagem geotécnica 2D.

- Interface OpenStruct em português, ribbon, árvore de projeto, propriedades, temas e painéis redimensionáveis.
- Múltiplas seções, materiais compartilhados, terreno, regiões de solo, linha piezométrica, faixas de carga e círculo de tentativa.
- Desenho gráfico, tabela/colagem de coordenadas, arraste de vértices, captura, pan/zoom e histórico por operação.
- Validação de contornos, sobreposição, cobertura, propriedades e contrato de arquivo.
- Projetos `.geo.json`, recuperação local e proteção de rascunhos/alterações não salvas.
- Relatório de entradas com impressão e HTML; desenho SVG.
- Estrutura Tauri 2 para Linux/Windows com ícones padrão provisórios, documentação e CI.

O solver de estabilidade e o dimensionamento de contenções ainda não fazem parte desta versão. Instaladores, catálogo e atualização pelo Launcher serão tratados em etapa posterior.
