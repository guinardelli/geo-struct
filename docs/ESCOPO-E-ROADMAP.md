# Escopo e evolução

## 0.1.0 — Modelagem

Esta entrega prepara projetos e seções, materiais, terreno, regiões de solo, água, faixas de carga e círculo de tentativa. Inclui edição por desenho/coordenadas, histórico, persistência e relatório de entradas. Não calcula fator de segurança e não dimensiona contenções.

Limites de modelagem: 100 seções e 100 materiais por projeto; 64 regiões e 100 cargas por seção; 500 pontos por contorno; arquivos até 8 MB. Coordenadas limitadas a ±1.000.000 m. O terreno admite faces verticais com X não decrescente e mantém base horizontal. Não há contorno externo arbitrário, importação DXF/DWG, estágios construtivos, perfis em balanço, cálculo de fluxo, água externa ou análise sísmica. Cada caso tem identidade própria e é vinculado a uma seção; até 100 casos por projeto. O caso compartilha geometria e materiais com a seção, mas registra suas hipóteses, condições de água/cargas e superfície.

### Geometria e edição — implementado

Inserir/excluir/mover vértices, mover contornos, copiar regiões e dividir uma região em duas por uma reta. Interfaces coincidentes acompanham a edição, com opção explícita de desvincular. Captura por vértices/interseções/segmentos, grade configurável, restrição horizontal/vertical, entrada absoluta/relativa/polar e medição. Faces verticais são aceitas na modelagem; seu tratamento físico depende do contrato futuro do motor. Divisões que gerariam ilhas, furos ou mais de duas partes são recusadas. Não há importação CAD nesta entrega.

### Materiais e atribuição — implementado

Cadastro Mohr–Coulomb com escolha explícita de parâmetros efetivos/totais, mensagens de limites e pendências por campo. Novas regiões e solos de fundo ficam sem atribuição até a escolha do usuário. Gerenciador com consulta de uso, duplicação e substituição ao excluir; atribuição em lote na seção ativa e histórico por operação. Introduzido no formato `geostruct/2`, preservado no formato atual v4. O peso específico permanece como um único valor total informado; nenhum parâmetro é deduzido de outro ou gerado a partir da água. O detalhamento está em [Materiais e formato](MATERIAIS-E-FORMATO.md).

### Água e sobrecargas — implementado no recorte inicial

Condição de água explícita (não definida, seca ou piezométrica), peso específico informado e origem da hipótese. Sobrecargas uniformes com intensidade nula distinta de zero, origem, habilitação individual, duplicação desabilitada, exclusão e condição global por seção. Desativar preserva os lançamentos. Conferência de cobertura, linha acima do terreno, faixas fora do perfil e sobreposição entre cargas ativas. Formato `geostruct/3` com migração de v1/v2. Ver [Água e cargas](AGUA-E-CARGAS.md). Não há fluxo, água externa, força concentrada, carga trapezoidal, sismo ou cálculo de pressões/esforços nesta etapa.

### Casos de análise — implementado

Cadastro, duplicação e exclusão de casos por seção, com hipóteses, sentido de deslizamento e escolha dos métodos pretendidos. Condições próprias de água e seleção de faixas, além de herança explícita das condições atuais da seção. Círculo fixo por desenho/coordenadas ou cópia explícita do círculo de tentativa. Limites e passos informados para centros X/Z e raios, preservados ao alternar o modo. Prévia de entradas, conferência, relatório e formato `geostruct/4`, com leitura de v1/v2/v3. A geometria e os materiais são compartilhados, e a edição das faixas afeta os casos que as usam. Não há geração de candidatos, admissibilidade, perfil numérico, cálculo ou resultados. Ver [Casos de análise](CASOS-DE-ANALISE.md).

## Base técnica

- [#28 — Roadmap](https://github.com/ricardocorsini/openstruct-front/issues/28): primeiro motor determinístico 2D, superfícies circulares, Mohr–Coulomb, Fellenius e Bishop Simplificado.
- [#29 — Bibliografia](https://github.com/ricardocorsini/openstruct-front/issues/29): seleção aprovada pelo Eng. Gustavo Azocar. Referências principais: Duncan, Wright e Brandon (2014) e USACE EM 1110-2-1902 (2003).
- [#30 — Especificação](https://github.com/ricardocorsini/openstruct-front/issues/30), [PR #37](https://github.com/ricardocorsini/openstruct-front/pull/37): documento candidato; D1–D5 aprovadas como base, R0–R6, consulta direta de Bishop e aceite final pendentes na consulta de 17/11/2026.
- [#31 — Validação](https://github.com/ricardocorsini/openstruct-front/issues/31): catálogo de casos independentes e tolerâncias ainda pendente na mesma consulta.

Os testes de modelagem deste repositório não substituem os casos geotécnicos da #31. Os exemplos têm números ilustrativos, sem origem experimental e sem resultados de estabilidade associados.

## Sequência proposta

1. Geometria e edição: implementadas nesta evolução; revisar o uso em modelos reais.
2. Materiais, atribuição explícita, água e sobrecargas: implementados no recorte inicial. As regras físicas que combinam materiais/água dependem do contrato do motor.
3. Casos de análise: implementados no recorte de cadastro e prévia, com identidade própria e vínculo à seção.
4. **Próxima entrega — conferência completa do lançamento:** validação entre entidades, persistência/migrações e diagnóstico das pendências. Revisar usabilidade e arquivos nos sistemas de destino antes da primeira distribuição desktop.
5. Concluir a especificação #30 e o catálogo #31. Definir contrato do motor, perfis numéricos, tratamento das faces verticais, materiais/água e comportamento de falhas.
6. Implementar preparação de fatias e cálculo em superfície fixa. Validar geometria e forças, além das equações, com referências independentes.
7. Implementar busca circular determinística, progresso, cancelamento, inspeção por fatia e memória rastreável. Vincular resultados à revisão de entrada e invalidá-los quando ela mudar.
8. Especificar métodos rigorosos, superfícies não circulares e estabilidade com reforços. Especificar separadamente verificações/dimensionamento das contenções.

A distribuição desktop exige revisão nativa, instaladores, notas, catálogo/Launcher e procedimento de atualização. Compilação de CI não publica uma versão e não dispensa essa revisão.

Slide2 e GEO5 são referências de produto e comparação controlada. Seus padrões de tela, exemplos ou configurações não substituem decisões de engenharia nem servem, isoladamente, como fonte governante das equações. Critérios normativos de aceitação têm etapa própria.
