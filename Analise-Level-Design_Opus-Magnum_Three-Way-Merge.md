# Análise de Level Design - Opus Magnum

**Disciplina:** Engenharia de Software para Jogos  
**Equipe:** Three-Way Merge  
**Integrantes:** Gabriel Felipe Guarnieri, Hector Guarçoni Machado, Marcos Winícios Silva Martins  
**Jogo analisado:** *Opus Magnum*  
**Desenvolvedora:** Zachtronics  

## 1. Jogo escolhido

O jogo escolhido para a análise foi *Opus Magnum*, da Zachtronics, uma das principais referências usadas no projeto do grupo. Ele é um puzzle de automação em que o jogador constrói máquinas alquímicas para transformar reagentes em produtos específicos. Cada fase apresenta entradas, saídas e peças disponíveis, e o jogador precisa montar uma solução funcional usando braços mecânicos, trilhos, glifos e comandos.

A escolha é adequada para a disciplina porque *Opus Magnum* tem uma estrutura de level design muito próxima de problemas de engenharia: o jogo não exige reflexo ou combate, mas planejamento, decomposição de problemas, testes, iteração e otimização. Uma solução pode simplesmente funcionar, mas o jogo incentiva o jogador a melhorá-la por custo, ciclos e área ocupada.

## 2. Quantidade de níveis identificados

Na campanha principal, foram identificados **36 puzzles distribuídos em 5 capítulos**. Para esta análise, considerei a campanha principal como o conjunto central de fases, pois ela organiza a progressão narrativa e mecânica do jogo.

Além da campanha principal, o jogo também possui conteúdo extra, como apêndice, editor de puzzles e suporte a fases criadas pela comunidade via Steam Workshop. Esses conteúdos aumentam bastante a vida útil do jogo, mas não foram tratados como parte da contagem principal porque não compõem a progressão central da campanha.

## 3. Divisões dos níveis

*Opus Magnum* divide seus níveis principalmente em **capítulos**. Cada capítulo apresenta um conjunto de puzzles liberados progressivamente e intercalados com trechos narrativos. O avanço não acontece por um mapa espacial tradicional, mas por uma sequência de desafios dentro da história.

A estrutura pode ser entendida assim:

| Divisão | Função no level design |
| --- | --- |
| Capítulos | Organizam a campanha e marcam a progressão narrativa. |
| Puzzles | Funcionam como as fases principais do jogo. Cada puzzle pede a produção de uma substância ou artefato. |
| Apêndice | Reúne desafios extras, geralmente mais voltados a jogadores que querem continuar otimizando. |
| Workshop/editor | Permite fases criadas por jogadores, fora da campanha oficial. |

Dentro de cada puzzle também existe uma divisão interna importante: o jogador alterna entre construir, programar, executar, observar erros e refatorar a máquina. Essa estrutura faz com que cada fase funcione como um pequeno ciclo de desenvolvimento: projetar, testar, depurar e otimizar.

## 4. Progressão e dificuldade

A dificuldade de *Opus Magnum* é **progressiva**, mas não de forma puramente linear. O jogo começa com puzzles simples, que apresentam poucos componentes e exigem transformações diretas. Depois, os desafios passam a combinar mais reagentes, mais produtos, mais restrições espaciais e maior necessidade de coordenação entre braços mecânicos.

Nos primeiros níveis, o objetivo principal é entender as regras básicas: mover átomos, ligar elementos, posicionar glifos e criar uma sequência de comandos que produza o item pedido. O jogador aprende a lógica do sistema sem ser pressionado por limites rígidos de tempo ou custo.

Nos capítulos seguintes, a dificuldade aumenta por complexidade combinatória. O jogador precisa lidar com múltiplas entradas, moléculas maiores, transformações em cadeia e máquinas com várias partes funcionando ao mesmo tempo. O desafio deixa de ser apenas "como produzir isso?" e passa a ser "como produzir isso de forma estável, legível e eficiente?".

Outro ponto importante é que *Opus Magnum* trabalha com dificuldade variável por fase. Algumas fases são fáceis de concluir, mas difíceis de otimizar. Outras exigem uma ideia estrutural específica para a primeira solução funcionar. Isso cria uma curva interessante: o jogo permite avanço mesmo com soluções grandes e lentas, mas oferece profundidade para quem busca melhorar desempenho.

## 5. Como a dificuldade é medida

O jogo não trata dificuldade apenas como vencer ou perder. Depois que uma solução funciona, ela é comparada por três métricas principais:

| Métrica | O que avalia |
| --- | --- |
| Custo | Quantidade e valor dos componentes usados na máquina. |
| Ciclos | Tempo necessário para completar a produção. |
| Área | Espaço ocupado pela solução no tabuleiro hexagonal. |

Essas métricas fazem o mesmo puzzle ter várias camadas de desafio. Uma primeira solução pode ser cara, lenta e grande, mas ainda válida. Depois disso, o jogador pode tentar reduzir custo, diminuir ciclos ou compactar a área. Nem sempre é possível otimizar tudo ao mesmo tempo, então o jogo cria decisões de projeto parecidas com trade-offs de engenharia.

## 6. Comentário geral sobre o level design

O level design de *Opus Magnum* é forte porque ensina por acúmulo de repertório. Cada fase apresenta um problema relativamente fechado, mas a solução depende de padrões que o jogador aprendeu antes: ciclos, paralelismo, sincronização, reaproveitamento de movimentos e organização espacial.

A progressão pode ser resumida assim:

| Etapa | Papel na curva de aprendizado |
| --- | --- |
| Introdução | Ensina manipulação básica de átomos e comandos simples. |
| Combinação | Exige ligação de elementos e uso coordenado de glifos. |
| Automação | Estimula máquinas que repetem ciclos de produção sem intervenção. |
| Otimização | Incentiva redução de custo, ciclos e área. |
| Maestria | Apresenta puzzles em que clareza, paralelismo e compactação se tornam essenciais. |

Essa estrutura é uma referência útil para o projeto do grupo porque mostra como um jogo pode ensinar sistemas complexos sem depender de tutoriais longos. O jogador aprende fazendo, errando, observando a simulação e ajustando a própria solução.

## 7. Conclusão

Foram identificados **36 níveis principais** em *Opus Magnum*, organizados em **5 capítulos** de campanha. O jogo também possui desafios extras e fases criadas pela comunidade, mas a campanha principal é a base mais clara para analisar a progressão.

A dificuldade é progressiva e variável por fase. Ela aumenta pela introdução de novas combinações, maior coordenação entre componentes e maior exigência de otimização. O jogo se destaca porque permite soluções abertas: passar de fase é apenas o primeiro objetivo; melhorar a solução por custo, ciclos e área cria uma segunda camada de profundidade.

Para um projeto como o da equipe Three-Way Merge, *Opus Magnum* é uma referência importante porque transforma raciocínio sistêmico em level design. Cada fase ensina um conceito mecânico e, ao mesmo tempo, incentiva o jogador a pensar como engenheiro: montar uma solução funcional, testar, encontrar gargalos e otimizar.

## 8. Referências consultadas

- Página oficial de *Opus Magnum*, Zachtronics: https://www.zachtronics.com/opus-magnum/
- Página de *Opus Magnum* na Steam: https://store.steampowered.com/app/558990/Opus_Magnum/
- Resumo enciclopédico sobre estrutura e gameplay: https://en.wikipedia.org/wiki/Opus_Magnum
- Discussão/análise sobre a campanha principal com 36 puzzles em 5 capítulos: https://biggieblog.com/reaching-long-awaited-perfection-on-opus-magnums-final-level/
