# Guia de uso — GeoStruct 0.1

## Primeiro projeto

Escolha **Novo projeto**, informe nome e, se desejar, responsável. A seção inicial não tem terreno nem material de fundo atribuído. O cadastro inicial começa com parâmetros e tipo de resistência em branco. **Explorar um exemplo** abre um modelo próprio em duas camadas, com dados ilustrativos claramente identificados e materiais já atribuídos.

Em **Geometria → Perfil do terreno**, marque os pontos da esquerda para a direita. Enter ou Concluir finaliza; Escape cancela; Backspace ou botão direito remove o último ponto. Regiões são fechadas automaticamente. O primeiro contorno do terreno deve ficar acima da cota da base indicada no painel.

Também é possível digitar a tabela X/Z nas propriedades. **Colar lista de coordenadas** aceita uma linha por ponto, com valores separados por ponto e vírgula, tabulação ou espaço. O separador decimal pode ser ponto ou vírgula. Exemplo:

```text
0 ; 20
15,5 ; 20
30 ; 8
50 ; 8
```

Clique em **Usar coordenadas**, confira a tabela e **Aplicar**. Os campos são um rascunho: sair deles para outro elemento oferece a opção de continuar editando ou descartar. O desenho não é modificado por um valor ainda não aplicado.

## Solos, água e cargas

Em **Materiais → Novo material**, informe nome, cor, peso específico total, coesão, atrito, tipo de parâmetros e origem. Escolha tensões efetivas (c′, φ′) ou totais (c, φ) de acordo com os dados informados. A troca de opção conserva os números; não os converte nem presume condição de drenagem. Campos em branco permanecem pendentes, e zero em coesão/atrito é um valor informado. **Aplicar** confirma o cadastro.

O solo de fundo é definido nas propriedades da seção/terreno e preenche as áreas sem outra região. Novas seções e regiões começam como **Sem material**; selecione um material no painel e aplique. A cor neutra e o marcador de pendência identificam os locais sem atribuição. Esse estado não representa escavação ou vazio. Regiões podem compartilhar bordas, mas não sobrepor áreas.

Em **Materiais → Atribuir material**, escolha o material e marque os destinos da seção ativa. **Marcar sem material** seleciona somente os destinos pendentes; **Marcar todos** inclui o fundo e todas as regiões. **Aplicar atribuição** gera um único passo de histórico. Para retirar um vínculo, escolha explicitamente **Retirar atribuição — deixar sem material**. Se o material tiver cadastro incompleto, a atribuição é permitida e as pendências continuam visíveis.

**Gerenciar materiais** reúne o cadastro e mostra onde cada material é usado. Abra a lista de atribuições e clique em uma para localizar a região/seção. **Editar** abre suas propriedades; **Duplicar** cria um cadastro independente sem novas atribuições. Excluir material em uso exige escolher outro para substituí-lo em todas as seções. A substituição e a exclusão são desfeitas juntas. Um material sem uso pode ser excluído, inclusive o último cadastro.

“Dados preenchidos” indica somente cadastro completo. O peso específico cadastrado continua sendo um único valor total por material; não são gerados valores secos, saturados ou submersos. Água e cargas são cadastradas separadamente; sua interpretação física depende do contrato do futuro cálculo.

Em **Água e cargas → Condição de água**, escolha **Condição seca** ou **Linha piezométrica prescrita** e registre a origem da hipótese. Projetos novos começam como **Não definida**. Para a condição piezométrica, informe também o peso específico da água γw em kN/m³ e a linha com X crescente, pelo desenho ou tabela. Desenhar uma linha ativa essa condição. Não é análise de percolação nem água externa; cobertura incompleta e linha acima do terreno geram avisos.

Alterar para seca/não definida guarda a linha, o peso específico e a origem sem usá-los no desenho. Reativar preserva os valores e verifica a geometria. **Excluir**, com água selecionada, remove somente a linha: a condição não passa automaticamente a seca. Também é possível salvar uma condição piezométrica com linha/peso ainda pendentes.

Em **Gerenciar cargas**, escolha **Sem sobrecargas** ou **Usar sobrecargas cadastradas**. O estado inicial **Não definida** é uma pendência. Essa escolha e as caixas de habilitação são aplicadas imediatamente, com desfazer. Cada faixa tem nome, limites X inicial/final, intensidade q (kPa), origem e habilitação própria. Só faixas habilitadas na condição de cargas ficam ativas.

**Desenhar nova faixa** usa dois pontos para definir o intervalo horizontal e ativa a condição de cargas. A intensidade começa **não informada**, nunca como zero presumido. Nas propriedades, preencha q e a origem e clique **Aplicar**. Vazio é pendência; q = 0 é um valor explícito. As setas só aparecem para q positivo. O carregamento cadastrado é vertical descendente e uniforme na projeção horizontal; faixas fora do terreno são recusadas, e sobreposições ativas são listadas para conferência.

Desabilitar uma faixa ou escolher **Sem sobrecargas** preserva todos os lançamentos. **Duplicar** cria uma cópia desabilitada, com ID próprio. Editar abre as propriedades; excluir exige confirmação. Excluir a última faixa não decide a condição da seção: escolha explicitamente Sem sobrecargas quando aplicável. Todas essas operações pertencem à seção ativa e ao histórico. Os dados inativos permanecem no relatório com sua identificação.

**Análise → Círculo de tentativa** recebe centro e um ponto do círculo. Centro/raio podem ser ajustados numericamente. Ele é uma referência geométrica: não há FS nem verificação da superfície nesta versão.

## Navegar e editar

- Roda: zoom no cursor. Botão do meio ou Espaço + arrastar: mover vista.
- V: selecionar; H: mover vista; F: enquadrar; F3: captura.
- Captura procura vértices próximos, interseções, segmentos e depois a grade. Em **Geometria → Precisão**, configure o passo (inicialmente 0,5 m) e a restrição horizontal/vertical. F3 desliga a captura; a restrição ortogonal é uma opção separada.
- Selecione terreno, região ou água para exibir seus vértices. Arrastar um vértice gera um passo de histórico; alterações inválidas são recusadas com mensagem.
- Ctrl+Z desfaz e Ctrl+Shift+Z/Ctrl+Y refaz. Em campos de texto, esses atalhos conservam a edição nativa do campo.
- Arraste os divisores dos painéis ou use setas após focá-los com Tab.
- A faixa **Mostrar** controla a visibilidade de solos, água, cargas e círculo. Ocultar é apenas visual: não muda a condição ou habilitação dos lançamentos. Temas claro/escuro ficam no topo.

### Editar contornos e interfaces

Selecione o terreno, uma região ou a linha piezométrica antes de escolher **Inserir vértice**, **Excluir vértice** ou **Mover contorno**. Inserir usa um clique no interior de um segmento. Excluir usa um clique no vértice e mantém o mínimo de dois pontos no perfil ou três na região. Mover usa um ponto base e um destino, que definem o deslocamento.

Por padrão, **Editar interfaces de solo vinculadas** mantém juntas as fronteiras coincidentes entre terreno e regiões, inclusive quando os dois lados têm números diferentes de vértices. Desfazer reverte a operação completa. A água é independente. Desligue a vinculação em **Precisão** para editar só o contorno selecionado; a validação continua recusando sobreposição e saída do domínio. A edição pela tabela também acompanha as interfaces. Colar uma lista substitui apenas o contorno selecionado e não infere quais pontos antigos correspondem aos novos.

**Copiar região** exige uma região selecionada e dois pontos de deslocamento. Cria um novo ID e mantém o material original. **Dividir região** usa dois pontos para definir uma reta infinita de corte e cria duas regiões adjacentes com o mesmo material. Selecione cada parte para ajustar nome e material. Reta tangente/exterior ou corte que gera mais de duas partes é recusado. Copiar/dividir atua em regiões explícitas; o solo de fundo continua preenchendo o restante da seção.

O perfil pode conter faces verticais: use pontos consecutivos com o mesmo X e Z diferente. Continue avançando da esquerda para a direita; retornos e perfis em balanço não são aceitos. Uma face na extremidade não pode retornar sobre o fechamento lateral automático. A admissão geométrica não significa que o futuro motor já aceite o caso.

### Entrada precisa e medição

Durante o desenho ou comandos de dois pontos, abra **Entrada precisa** no canto inferior esquerdo. Escolha **X/Z**, **ΔX/ΔZ** a partir do último ponto, ou **Distância/ângulo**. O primeiro ponto precisa de X/Z ou clique. Ângulos são medidos a partir de +X, positivos em direção a +Z. Valores digitados são preservados, sem arredondamento pela grade ou restrição ortogonal. A tabela das propriedades continua disponível para coordenadas existentes.

**Medir** mostra distância, ΔX, ΔZ e ângulo entre dois pontos; não modifica o projeto. Um terceiro ponto inicia outra medição. Escape encerra. As preferências de precisão valem para a sessão e não são gravadas como parâmetros físicos no `.geo.json`.

## Casos de análise

Em **Análise → Novo caso**, cadastre um cenário da seção ativa. O caso começa com escolhas pendentes. Informe nome, hipóteses, direção e os métodos pretendidos. Direita/esquerda é sempre relativa ao eixo X do desenho; escolher movimento para a esquerda não espelha seus dados. Os métodos são registrados para preparação: ainda não executam cálculo.

Em **Água no caso**, escolha usar a condição atual da seção ou adotar condição seca/usar a linha cadastrada. As hipóteses próprias exigem origem; a opção piezométrica usa os pontos e γw da seção, mesmo se a linha estiver guardada nela. Em **Sobrecargas no caso**, escolha a condição atual da seção, ausência de cargas ou faixas selecionadas. A seleção explícita pode ativar faixas desabilitadas na seção; mantenha isso como escolha consciente. Dados das faixas (q, posição e origem), geometria e materiais permanecem compartilhados.

Em **Definição da superfície**, escolha círculo fixo ou busca circular. Para o círculo, informe centro X/Z e raio, use **Desenhar círculo do caso** (dois pontos, também por Entrada precisa), ou **Copiar círculo de tentativa**. A cópia entra no rascunho e exige **Aplicar caso**; o desenho confirmado entra no histórico diretamente. O círculo de tentativa da seção não é alterado. Escape cancela o traçado.

Para busca, informe mínimos, máximos e passos dos centros X/Z e raios. Não há valores sugeridos nem geração de candidatos. Um eixo com mínimo igual ao máximo é fixo e pode ficar sem passo. Limites invertidos e passos não positivos são recusados; vazios ficam pendentes. Alternar o modo preserva o círculo e os limites guardados.

Selecione o caso na árvore para ver sua prévia: condições de água/cargas, círculo fixo ou região de centros. A prévia não comprova a admissibilidade da superfície. Use **Enquadrar** para incluir os limites na vista. A edição da geometria base retorna pela árvore ou **Voltar à seção base**. Propriedades só mudam com **Aplicar caso**; a navegação protege rascunhos.

**Gerenciar casos** lista os casos da seção, seus estados e pendências, e permite editar, duplicar ou excluir. Duplicar seção duplica também seus casos com referências próprias; excluir seção avisa quantos casos serão removidos. Faixas selecionadas por casos não podem ser excluídas até retirar as referências, inclusive seleções guardadas em modos inativos. Desfazer/refazer reverte cada operação completa.

## Arquivos e recuperação

**Salvar** e Ctrl+S exportam `.geo.json`. No desktop, o primeiro salvamento pede destino e os seguintes atualizam o caminho selecionado. **Salvar como** escolhe um novo destino principal. No navegador, cada salvamento gera um download. Confira seu destino de downloads.

**Abrir** valida a estrutura antes de substituir o projeto atual; arquivo inválido não remove o trabalho aberto. Salve ou descarte alterações do projeto antes de substituí-lo. A recuperação local registra somente as operações aplicadas e é oferecida na tela inicial; nunca abre automaticamente. Ela não substitui o arquivo exportado e não contém campos/traçados ainda em edição.

O salvamento usa `geostruct/4`. Arquivos e recuperações das versões 1, 2 e 3 são migrados mantendo materiais, referências, coordenadas e IDs. A abertura do arquivo antigo informa a migração e pede salvamento para persistir o novo formato; **Salvar como** permite conservar o original. Versões antigas do aplicativo não abrem arquivos v4. Campos desconhecidos ou referências inexistentes são recusados, sem descarte silencioso. Ausência de água/cargas antiga fica não definida, sem pressupor condição seca ou sem cargas. Nenhum caso é criado a partir de arquivos antigos, e o círculo de tentativa continua preservado. Consulte [Casos de análise](CASOS-DE-ANALISE.md).

**Fechar projeto** retorna à tela inicial, protegendo alterações. Fechar normalmente remove sua recuperação local. Fechar a janela/browser sem resolver alterações exibe a proteção da plataforma. Bloqueio de armazenamento local é comunicado; salvar arquivo continua disponível.

## Documentar

**Relatório de entradas** reúne todas as seções, materiais e fontes, coordenadas, água, cargas, círculo, casos e diagnósticos. Os casos registram condições resolvidas, lançamentos ativos, limites e dados guardados, sempre sem resultados de cálculo. Imprimir/PDF usa a impressão disponível no navegador/sistema. **Exportar HTML** fornece uma versão portátil. **Exportar desenho** salva SVG da vista atual; a extensão não contém o modelo editável completo, que pertence ao `.geo.json`.

As verificações desta versão detectam inconsistências de modelagem. A estabilidade e os critérios de aceitação ainda não são calculados.

## Conferência integrada dos lançamentos

Em **Análise → Conferir modelo**, filtre por seção/caso e severidade. Cada caso inclui a geometria e os materiais compartilhados, além das condições efetivas de água/cargas do cenário. Materiais sem uso aparecem em um escopo próprio. Clique numa pendência para abrir o cadastro correspondente; rascunhos continuam protegidos. O relatório de entradas inclui a mesma conferência por escopo. Pendências compartilhadas aparecem em cada caso afetado, portanto as contagens não são somáveis como ocorrências únicas.

A conferência é derivada dos dados aplicados e não altera o formato v4 ou cria resultados. Ausência de pendências não comprova admissibilidade das superfícies nem estabilidade. Testes cobrem dependências compartilhadas, isolamento, condições próprias, ida/volta do arquivo, navegação e rascunhos. O salvamento recusa projetos acima de 8 MB para evitar produzir um arquivo que o leitor rejeitaria; o modelo aberto permanece disponível para edição.
