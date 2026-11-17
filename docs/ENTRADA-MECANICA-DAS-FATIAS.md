# Entrada mecânica das fatias

`prepareSliceMechanics` consolida a geometria, os pesos, as pressões prescritas e as sobrecargas da mesma revisão e do mesmo perfil. O contrato imutável `geostruct-slice-mechanics/1`, estágio `mechanical-inputs-only`, prepara a entrada para os métodos. Não resolve equilíbrio, normal de base, resistência mobilizada, tração, convergência, denominador motriz ou FS.

O recorte parte de D2/D3 da [issue #30](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580) e explicita as convenções de preparação dos §§1–2 da [especificação candidata](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450). Não encerra R0–R6 nem o aceite final da [PR #37](https://github.com/ricardocorsini/openstruct-front/pull/37). Mistura de modos, faces verticais e condições de água conservam suas informações e limitações; a consolidação não declara admissibilidade para um método.

## Referencial e geometria

O projeto permanece em X/Z. Para a preparação, `s = +1` para esquerda→direita e `s = −1` para direita→esquerda. A origem local é o centro do círculo: `x = s (X − Xc)` e `z = Z − Zc`. A ordem das fatias segue o movimento; `number` conserva o número geométrico original e `order` registra a posição local. Extremos de entrada/saída e pontos de aplicação são transformados sem modificar os dados originais. Sentido ausente bloqueia apenas a consolidação.

| Grandeza                 | Convenção                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| b                        | largura horizontal da fatia, em m                                                                       |
| ℓ                        | comprimento da corda da base, em m; não o arco                                                          |
| α                        | `−s × inclinação original da corda`, em radianos, positivo quando a base desce no sentido do movimento  |
| sin α, cos α             | coeficientes geométricos; `b = ℓ cos α`                                                                 |
| braço do peso            | aproximação `R sin α`, em m, própria dos métodos de fatias da candidata; não é o centroide real do peso |
| braço de cada sobrecarga | braço próprio já preparado, orientado ao movimento; nunca substituído pelo braço do peso                |

As coordenadas locais são calculadas por diferenças em relação ao centro para reduzir cancelamento. Pontos com Z original continuam disponíveis. O sentido não é escolhido a partir da inclinação do talude ou do sinal de um momento.

## Resistência, água e forças

Somente o material identificado na base fornece c, φ e modo. Materiais acima da base mantêm suas contribuições de peso; seus parâmetros resistentes não são exigidos por esta etapa. Valores devem estar explicitamente preenchidos: `c ≥ 0`, `0 ≤ φ < 90°`, modo efetivo/total. Zero informado é válido; nulo não é convertido em zero. φ é conservado em graus, convertido para radianos e para `tan φ`, sem inferir coesão, ângulo ou modo.

| Grandeza por fatia | Definição                                                   | Unidade |
| ------------------ | ----------------------------------------------------------- | ------- |
| W                  | peso próprio preparado, com parcelas de γ total × área      | kN/m    |
| Q                  | soma das faixas descendentes preparadas                     | kN/m    |
| V                  | W + Q, carga vertical descendente; não é normal de base     | kN/m    |
| u                  | pressão física prescrita no ponto médio angular do arco     | kPa     |
| ue                 | u no modo efetivo; zero no modo total                       | kPa     |
| U                  | u ℓ, resultante normal aproximada da pressão física na base | kN/m    |
| Ue                 | ue ℓ, parcela para uso com o modo resistente da base        | kN/m    |

O [USACE EM 1110-2-1902, §2-2c, eq. 2-3](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1902.pdf) distingue a pressão real da pressão usada no cálculo em tensões totais; esta última é zero. O §F-4b(6), p. F-15, obtém a força de água da base multiplicando pressão por comprimento. Consulta em 17/11/2026, também pela [cópia do manual no Dam Safety Toolbox](https://damtoolbox.org/images/8/83/Slope_Stability_Document.pdf). Aqui se usa pressão constante representada no ponto do arco e comprimento de corda, explicitamente como aproximação. U não é força de água externa, não inclui forças laterais e não é somado a V. Não se somam escalares U de bases com direções diferentes como uma força global.

No modo total, u e U continuam visíveis; somente ue/Ue são zero. Isso não troca automaticamente a condição para seca nem dispensa γw/cobertura na preparação física existente. Não se altera γ do solo nem se deduz peso submerso. Bases de modos distintos são identificadas individualmente; a compatibilidade do modo misto com o futuro cálculo continua parte de R2.

## Integridade e inspeção

Todos os estágios precisam estar preparados, ter contratos conhecidos, mesma revisão, perfil geométrico idêntico e correspondência inequívoca entre números de fatia. Registros faltantes, repetidos ou de outra discretização são recusados. São conferidos limites geométricos, pontos das pressões, sentido das cargas, parâmetros e finitude; não há consolidação parcial. Produtos positivos que desapareçam por underflow também recebem diagnóstico. A preparação copia seus dados e não congela objetos mutáveis do chamador.

`Inspecionar fatias → Entrada mecânica` apresenta a ordem no movimento e o número original, coordenadas, parâmetros/origem da base, W/Q/V, u/ue/U/Ue e cada braço de sobrecarga. Bloqueios não removem as inspeções independentes de geometria, pesos, pressões e cargas. A mudança de dados/perfil, rascunhos, arquivo e histórico usa a proteção de revisão existente. O projeto continua `geostruct/4`, sem resultados no arquivo ou no relatório de entradas.

## Verificações independentes

Uma base de 2 m a 30°, W = 100 kN/m, Q = 15 kN/m, u = 10 kPa, c = 5 kPa e φ = 30° dá b = √3 m, V = 115 kN/m, U = 20 kN/m e tan φ = 1/√3. No modo total ue/Ue são zero e u/U permanecem 10/20. O caso é conferido sem calcular normal, resistência ou FS. Os testes também cobrem material superior distinto, modos por base, espelhamento/sentido, translação, escala, refinamento, cargas com braços distintos, nulos/zeros, estágios bloqueados, revisões/perfis incompatíveis, numeração e arquivo/histórico.
