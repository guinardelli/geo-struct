# Fellenius em círculo fixo

Este incremento implementa o método de referência de D1, aprovado na [issue #30](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580): pressão neutra projetada, conforme USACE EM 1110-2-1902, eq. C-12, e Duncan et al. (2014), eq. 6.59. A implementação do recorte foi autorizada pelo mantenedor na sequência da entrada mecânica. Não representa aceite de engenharia de R0–R6, CA8 ou encerramento da [PR #37](https://github.com/ricardocorsini/openstruct-front/pull/37).

## Recorte e regras explícitas

| Item               | Regra deste incremento                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superfície         | Um círculo fixo, ramo inferior, geometria e entrada mecânica preparadas para a mesma revisão. Fellenius deve estar selecionado no caso.                                                                                                                                                                                  |
| R0: momentos       | No referencial crescente no movimento, cada carga descendente usa seu braço próprio `−xq`. O peso usa `R sin α`. Parcelas negativas são conservadas.                                                                                                                                                                     |
| R1/R3: geometria   | Mantém o contrato geométrico existente, base pela corda, pressão/material no meio angular, área até o arco e refinamento máximo de 3°. Face vertical que toque o intervalo da massa bloqueia este método; fora dele não interfere.                                                                                       |
| R2: materiais/água | Bases todas efetivas ou todas totais. Mistura de modos nas bases bloqueia o método; estratos com materiais diferentes são permitidos. Água externa/carga acima do terreno continua bloqueada pela preparação. γ total informado, sem peso submerso deduzido.                                                             |
| R4: denominador    | Perfil explícito com limiar `τD ≥ 0`, em kN/m. Exige `D > τD`. Somas compensadas; exige também `D > 32 ε Σ                                                                                                                                                                                                               | d   | ` para recusar denominador indistinguível de cancelamento em ponto flutuante. O limite de representação não é tolerância geométrica ou critério normativo. |
| R4: tração         | Perfil explícito com `τt ≥ 0`, em kPa. `σr < −τt` rejeita o resultado. Negativo dentro da tolerância permanece bruto e gera aviso; não há corte para zero, redistribuição ou modelo de perda de contato. Com `τt = 0`, qualquer tração rejeita.                                                                          |
| R5: zero           | Com D admissível e sem tração além do limiar, se todas as bases têm c = φ = 0, retorna estado destacado `zero-resistance` e FS = 0. Não transforma cancelamento resistente em ausência física de resistência. Outras somas resistentes não positivas são rejeitadas. Não existe classificação de candidatos nesta etapa. |
| Finitude           | Recusa NaN, infinito, overflow e produto/quociente de grandezas não nulas que desapareça para zero por underflow. Não arredonda intermediários.                                                                                                                                                                          |
| Saída              | FS do círculo informado, parcelas e diagnósticos. Não é mínimo de busca, aprovação de estabilidade ou comparação com critério normativo. Bishop permanece indisponível.                                                                                                                                                  |

Os dois limiares começam sem preenchimento na interface. Zero é uma escolha explícita válida; campos vazios não viram zero. O perfil é da sessão e aparece na inspeção. Alterar qualquer dado/perfil invalida a apresentação do resultado anterior. Nenhum resultado, perfil ou tolerância é acrescentado ao arquivo `geostruct/4` ou ao relatório de entradas.

## Equações e rastreabilidade

Por unidade de largura fora do plano, com `b = ℓ cos α`, `V = W + Q` e `ue = u` no modo efetivo ou zero no total:

```text
Ni = (Vi − uei bi) cos αi
σri = Ni / ℓi
Ci = ci ℓi
Ti = Ni tan φi
Ai = Ci + Ti
di = Wi sin αi + Σj Mqij / R
D = Σi di
A = Σi Ai
FS = A / D
```

N é a normal aproximada usada na resistência: efetiva nas bases efetivas, total nas totais. A correção de água na normal é `ue b cos α = Ue cos² α`; não se usa a variante histórica `V cos α − Ue`. Cada contribuição de sobrecarga conserva Q, ponto, braço, momento e parcela `Mq/R`. Forças têm unidade kN/m, momentos kN·m/m, tensões kPa; FS é adimensional. Não se infere normal total a partir de N na variante projetada.

Fonte diretamente conferida: [USACE EM 1110-2-1902](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1902.pdf), pp. C-13–C-16, eqs. C-12–C-14 e limitações do método, também disponível no [Dam Safety Toolbox](https://damtoolbox.org/images/8/83/Slope_Stability_Document.pdf). Fellenius satisfaz a equação global de momentos com as aproximações do método; não satisfaz todas as equações de equilíbrio. Não se atribui a esta fonte a aprovação das políticas de software da tabela acima.

## Casos independentes

1. Uma base ℓ = 2 m, α = 30°, W = 100 kN/m, Q = 15 kN/m, R = 10 m, carga em x local = −5 m, c = 5 kPa, φ = 30° e u = 10 kPa: b = √3 m, N = (115 − 10√3)√3/2, C = 10, T = 57,5 − 5√3 e D = 57,5 kN/m. FS = `(67,5 − 5√3)/57,5`. Deslocar a carga para x = 0 ou +5 mantém N e altera D para 50 ou 42,5. O caso distingue C-12 da variante C-13.
2. Bases com φ = 0: o resultado é `Σcℓ/D`, independente da água enquanto a admissibilidade passar. c = φ = 0 em todas as bases produz zero destacado, sem divisão indefinida.
3. Duncan et al., 2ª ed., fig. 7.34, p. 154: colunas das nove fatias transcritas na [especificação candidata](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450), c′ = 100 psf e φ′ = 30°. A fonte da transcrição é a candidata; o livro não foi reaberto para esta entrega. Conversão coerente de ft/psf/lb para SI antes do núcleo. D original = 28.822,497; C = 9.140; T = 25.051,584; FS reproduzido ≈ 1,186281, valor publicado arredondado 1,19. Esse teste verifica a equação nas fatias fornecidas, não a reconstrução da geometria publicada.

Complementam os casos: modelo próprio de talude com preparo completo, refinamento, translação, espelhamento com inversão de sentido, pesos/pressões/sobrecargas, casos totais e efetivos, tração, limiares exatos, cancelamento, nulos, revisões e imutabilidade. A interface cobre cálculo explícito, troca de dados/perfil, histórico, arquivo e isolamento de casos. A validação integral e o catálogo independente da #31 continuam em desenvolvimento.
