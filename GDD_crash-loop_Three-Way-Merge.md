# crash-loop — Game Design Document

**Puzzle 2D de Infraestrutura e Automação**

**Equipe Three-Way Merge** — Gabriel Felipe Guarnieri · Hector Guarçoni Machado · Marcos Winícios Silva Martins

**Disciplina:** Engenharia de Software para Jogos — 2026/1
**Versão:** 1.0 — 2026-06-27
**Protótipo jogável:** níveis L01–L02 em TypeScript + HTML5 Canvas

## Sumário

1. Identidade do Jogo
2. Pitch
3. Core Statement
4. Pilares de Design
5. Premissa Narrativa
6. Ambientação
7. Personagens
8. Core Gameplay
9. Mecânicas Principais
10. Recursos, Indicadores e Progressão
11. Feedback ao Jogador
12. Condições de Vitória, Derrota e Finais
13. Fases, Mapa e Estrutura de Mundo
14. Interface e Controles
15. Direção Visual
16. Direção de Áudio
17. Escopo Técnico
18. MVP — Versão Mínima Jogável
19. Riscos de Design e Mitigações
20. Plano de Desenvolvimento
21. Referências do Projeto
22. Observações Finais
23. Glossário de Termos Técnicos

## 1. Identidade do Jogo

**Título:** crash-loop.

**Gênero principal:** Puzzle 2D de Infraestrutura e Automação.

**Gêneros secundários / tags:** puzzle de programação, simulação de DevOps, estética de terminal, otimização multieixo, sistemas distribuídos, single-player, indie.

**Plataforma alvo:** navegador web em desktop (Windows, Linux e macOS); build estático, sem instalação.

**Tecnologia / engine:** TypeScript sobre HTML5 Canvas, empacotado com Vite. O núcleo de simulação é determinístico e desacoplado da camada de renderização.

**Público-alvo:** programadores, estudantes de engenharia de software e computação, profissionais de DevOps/SRE e fãs de puzzles no estilo Zachtronics (TIS-100, Opus Magnum, Shenzhen I/O).

**Classificação indicativa pretendida:** Livre. Sem violência; foco em raciocínio lógico, planejamento e otimização.

## 2. Pitch

Você opera uma plataforma de nuvem fictícia a partir de um único terminal monoespaçado. Cada nível é um sistema distribuído em falha — uma fila sobrecarregada, um serviço instável, um rollout travado — e cabe a você compor nós (load balancers, serviços, caches, filas e gates de CI) dentro de um orçamento de CPU, memória e custo. O nível é vencido quando o tráfego simulado conclui dentro do *error budget* (a margem de falhas tolerada por nível); uma medalha de ouro opcional recompensa quem entrega a topologia de menor custo.

## 3. Core Statement

crash-loop é um jogo sobre ler um sistema distribuído em falha e montar, nó a nó, a topologia mais enxuta que ainda mantém o tráfego dentro do *error budget*.

## 4. Pilares de Design

1. **Backend over bullets.** O gameplay é movido por estruturas de dados, filas e fluxo de recursos. Sem física, sem reflexos rápidos: a pressão vem de raciocinar, não de reagir.

2. **Infraestrutura como níveis.** Cada nível é um pequeno sistema distribuído sobre o qual o jogador raciocina de ponta a ponta. O desafio é entender o sistema antes de consertá-lo.

3. **Estética minimalista de terminal.** Tipografia monoespaçada, paleta de monitor CRT e arte voltada para ASCII. Baixo custo de assets, alta profundidade sistêmica.

4. **Pivô educacional.** Práticas reais de engenharia — Infrastructure as Code, testes automatizados, load balancing, CI/CD, *error budgets* — são mecânicas de primeira classe, não uma metáfora decorativa sobre um gameplay sem relação.

## 5. Premissa Narrativa

**Premissa:** você é a pessoa recém-contratada de plantão (*on-call*) na Helix Cloud, uma provedora de nuvem fictícia cujos sistemas não param de quebrar. A cada chamado, um serviço cai e você precisa redesenhar parte da infraestrutura, pelo terminal, antes que o *error budget* acabe.

**Conflito central:** sistemas instáveis e recursos finitos. O jogador nunca tem CPU, memória e custo suficientes para a solução "desejada"; precisa encontrar a topologia mais enxuta que ainda assim segura o tráfego.

**Objetivo narrativo:** estabilizar a plataforma incidente a incidente, evoluindo de apagar incêndios pontuais para projetar sistemas resilientes — um arco inspirado em *The Phoenix Project*, do caos reativo à engenharia confiável.

**Tom do jogo:** técnico, seco e levemente irônico, com o humor de corredor de quem já passou por um plantão ruim. A narrativa é mínima e opcional, sempre subordinada ao puzzle.

## 6. Ambientação

**Local / mundo:** o interior fictício de uma provedora de nuvem, a Helix Cloud, vista inteiramente através de um terminal de operador.

**Época / contexto:** presente atemporal da cultura de software; referências a CI/CD, IaC, SRE e observabilidade situam o jogo no cotidiano de uma equipe de engenharia moderna.

**Tom:** minimalista, nostálgico de monitor CRT, com clareza técnica acima de espetáculo visual.

### 6.1 Locais principais

"Locais" aqui são contextos de sistema, não salas físicas — cada um define um arquétipo de nível:

- **Borda / Ingress:** o tráfego chega ao sistema; níveis sobre roteamento e load balancing.
- **Fila de mensagens:** filas sobrecarregadas e *back-pressure*; níveis sobre vazão (*throughput*) e *buffering*.
- **Camada de serviços:** serviços instáveis (*flapping*), *health checks* e *retries*.
- **Pipeline de CI/CD:** rollouts travados, gates de teste e estratégias de deploy.
- **Camada de dados / cache:** caches, invalidação e redução de latência.
- **Painel de SRE:** níveis-chefe que combinam *error budgets*, SLOs e múltiplas falhas simultâneas.

## 7. Personagens

Por ser um puzzle single-player de estética de terminal, o elenco é deliberadamente enxuto: serve para dar contexto humano aos níveis sem desviar o foco do *core loop*. O MVP concentra-se nas mecânicas, e os personagens entram na fase de conteúdo.

### 7.1 Protagonista / Avatar

**Nome:** a Operadora ou o Operador de plantão (sem rosto; representado pelo cursor e pelo prompt do terminal).

**Função no jogo:** avatar do jogador; quem digita os comandos e compõe a topologia.

**Motivação:** manter a plataforma de pé e, idealmente, não ser acordado de novo às três da manhã.

**Conflito:** recursos finitos contra sistemas que insistem em falhar.

**Relação com as mecânicas:** todas as ações do jogo são comandos do operador; ele não tem atributos próprios, apenas o orçamento do nível.

### 7.2 NPC / Personagem importante — SRE Sênior

**Nome:** a engenheira de confiabilidade que conduz o onboarding (mentora).

**Função narrativa:** guia do jogador; introduz conceitos novos no momento certo, no estilo de *The Phoenix Project*.

**Função mecânica:** entrega tutoriais diegéticos, dicas e o briefing de cada incidente; pode sugerir (sem entregar) a solução de ouro.

**Como reage às escolhas do jogador:** comenta soluções enxutas com aprovação e topologias caras com sarcasmo leve; não pune, apenas pontua.

### 7.3 Antagonista / Obstáculo principal

**Nome ou descrição:** "o Incidente" — o próprio sistema em falha, personificado pelo *pager* e pela barra de *error budget* que escorre.

**Função narrativa:** a pressão constante; não é um vilão, é a entropia da produção.

**Como aparece no gameplay:** tráfego simulado, picos de carga, serviços que oscilam e o *error budget* consumido em tempo real durante a simulação do nível.

## 8. Core Gameplay

### 8.1 Core mechanic

Compor uma topologia de nós sobre um sistema em falha, dentro de um orçamento de recursos, e rodar a simulação para verificar se o tráfego conclui dentro do *error budget*.

### 8.2 Core loop

1. Ler o briefing do incidente e inspecionar o sistema em falha.
2. Identificar o gargalo (fila cheia, serviço instável, rollout travado).
3. Compor e reposicionar nós dentro do orçamento de CPU, memória e custo.
4. Rodar a simulação de tráfego e observar o *error budget* escorrer.
5. Ajustar a topologia com base no resultado e iterar.
6. Concluir o nível e, opcionalmente, otimizar para a medalha de ouro.

### 8.3 Exemplo de turno / nível

**Briefing (nível L01 — "boot"):** o serviço `svc-cart` recebe todo o tráfego público em uma única réplica e cai sob carga. Chegam 30 requisições por *tick*, e cada serviço processa apenas 10. O `ingress` é um ponto de entrada único que só alimenta um nó a jusante, então o jogador roteia o tráfego por um *load balancer* e abre três réplicas do serviço: 3 × 10 = 30 req/tick, sem descarte. A topologia custa US$ 4,50 dentro do teto de US$ 5,00, 8 de CPU e 8 de memória, e ainda bate o limiar de ouro (`parCost`). Uma quarta réplica estouraria o orçamento sem nenhum ganho — a solução enxuta é a resposta.

## 9. Mecânicas Principais

### 9.1 Mecânica 1 — Composição de topologia

**Ação do jogador:** adicionar, remover, mover e conectar nós (load balancers, serviços, caches, filas, gates de CI) no diagrama do sistema.

**Condição / regra:** cada nó consome parte do orçamento de CPU, memória e custo; as conexões precisam formar um caminho válido (um grafo acíclico) para o tráfego.

**Mudança de estado:** altera a topologia ativa e, consequentemente, a vazão, a latência e a estabilidade do sistema simulado.

**Feedback ao jogador:** nós e arestas se acendem; os medidores de orçamento atualizam em tempo real; conexões inválidas ficam vermelhas.

**Parâmetros ajustáveis:** custo de cada nó, capacidade, latência introduzida e os limites do orçamento por nível.

### 9.2 Mecânica 2 — Simulação e otimização (medalha de ouro)

**Ação do jogador:** rodar o tráfego simulado contra a topologia e, após vencer, refinar a solução para reduzir o custo.

**Condição / regra:** o nível é concluído quando o tráfego termina dentro do *error budget*; a medalha de ouro exige bater o limiar de custo (`parCost`).

**Mudança de estado:** marca o nível como concluído e registra a melhor pontuação (menor custo aprovado).

**Feedback ao jogador:** tela de resultados com o tier alcançado (FAIL / PASS / GOLD), comparado ao limiar de ouro e ao melhor resultado anterior do próprio jogador.

**Parâmetros ajustáveis:** tamanho do *error budget*, perfil de tráfego (constante, em rampa ou em pico) e o limiar da medalha.

### 9.3 Outras mecânicas previstas

- **Infrastructure as Code:** declarar parte da topologia por um pequeno script/template em vez de posicionar nó a nó, recompensando reuso.
- **Testes automatizados:** inserir *test runners* e gates de CI que barram rollouts defeituosos; a cobertura vira um eixo de pontuação.
- **Observabilidade:** ferramentas que revelam métricas ocultas do sistema, ajudando a diagnosticar o gargalo.
- **Injeção de incidentes:** falhas seedadas (Risco/Chance) disparadas no meio da simulação, mantendo o determinismo por nível.

## 10. Recursos, Indicadores e Progressão

| Recurso / indicador | Como aumenta | Como diminui | Para que serve |
| --- | --- | --- | --- |
| Orçamento de CPU | Definido por nível; sobra ao remover nós | Cada nó de processamento consome | Limitar o tamanho da solução |
| Orçamento de memória | Definido por nível; sobra ao enxugar | Caches e réplicas consomem | Restringir caches e buffers |
| Orçamento de custo (US$) | Definido por nível | Cada nó tem um preço | Teto de gasto da topologia |
| Error budget | Reinicia a cada simulação | Erros e descartes o consomem | Condição de vitória do nível |
| Vazão (*throughput*) | Mais capacidade ou paralelismo | Gargalos e filas cheias | Concluir o tráfego a tempo |
| Custo total | — | Soluções mais enxutas | Eixo da medalha de ouro |
| Cobertura de testes | *Test runners* e gates de CI | Caminhos sem teste | Eixo de pontuação futuro |

**Sistema de progressão:** o jogador avança por uma campanha de níveis agrupados por tema (ingress, filas, serviços, CI/CD, dados, SRE). Cada nível concluído libera o próximo; medalhas de ouro liberam níveis-desafio opcionais.

**Como o jogador avança no jogo:** resolvendo incidentes em ordem crescente de complexidade, reaproveitando padrões aprendidos e perseguindo, opcionalmente, as soluções de ouro.

## 11. Feedback ao Jogador

**Feedback imediato:** ao posicionar ou conectar um nó, os medidores de orçamento e as arestas reagem na hora; conexões inválidas ficam vermelhas.

**Feedback de curto prazo:** ao rodar a simulação, uma visualização mostra os pacotes percorrendo a topologia, as filas enchendo e o *error budget* escorrendo em tempo real.

**Feedback de longo prazo:** ao concluir o nível, uma tela de resultados informa o custo e o tier (FAIL / PASS / GOLD), compara com o limiar de ouro e com as tentativas anteriores, e sinaliza um novo recorde (*new best*).

**Cores, barras, ícones ou mensagens usadas:** paleta de terminal — verde (dentro do budget), âmbar (atenção) e vermelho (estourando); barras para CPU, memória, custo e *error budget*; logs em texto monoespaçado descrevem cada evento da simulação.

## 12. Condições de Vitória, Derrota e Finais

**Como o jogador vence (nível):** a simulação de tráfego conclui com os descartes dentro do *error budget* (tier PASS). A medalha de ouro (tier GOLD) é vencida ao atingir, além disso, o limiar de custo.

**Como o jogador perde ou falha:** os descartes ultrapassam o *error budget* (sistema considerado fora do ar), ou a topologia é inválida — um ciclo no grafo, um caminho que não chega ao serviço, ou tráfego que não passa por um gate obrigatório. Falhar apenas reabre o nível para nova tentativa, sem punição permanente.

**Múltiplos finais:** não há finais ramificados de enredo; o "final" é o desempenho agregado da campanha. Concluir todos os níveis fecha o arco da Helix Cloud; medalhas de ouro e níveis-desafio funcionam como conteúdo de maestria opcional, no espírito Zachtronics.

## 13. Fases, Mapa e Estrutura de Mundo

**Tipo de estrutura:** campanha linear com ramos de níveis autocontidos, agrupados por tema. Cada nível é um *pull request* isolado — itera como o código diário da equipe.

**Locais ou fases principais:** os mundos temáticos — Ingress, Filas, Serviços, CI/CD, Dados/Cache e Painel de SRE (chefes).

**Como o jogador avança entre eles:** concluindo níveis para liberar os seguintes; medalhas de ouro desbloqueiam níveis-desafio opcionais dentro de cada mundo.

### 13.1 Estrutura do protótipo atual

- **L01 — "boot":** roteamento básico. `ingress` → *load balancer* → três serviços absorvem 30 req/tick. Introduz orçamento de recursos e *error budget*.
- **L02 — "first deploy":** deploy canário. Todo o tráfego precisa passar por um gate de CI antes da produção; dois gates em paralelo sustentam 40 req/tick.
- **Roadmap (L03–L05):** *flapping cart* (nó de cache), *error budget* (orçamento apertado e pico de tráfego) e *chaos friday* (injeção de incidentes seedada no meio da execução).

## 14. Interface e Controles

### 14.1 Tela principal

- **Área central:** diagrama da topologia (nós e arestas) em estética de terminal, desenhado em canvas.
- **Painel lateral (rail):** paleta de nós disponíveis com seus custos.
- **Barra superior:** medidores de CPU, memória, custo e *error budget*.
- **Rodapé:** log/console monoespaçado com eventos e mensagens.

### 14.2 Controles principais

- **Posicionar nó:** clicar um componente no painel lateral e depois clicar um espaço livre na área de trabalho.
- **Conectar nós (*wire*):** selecionar a ferramenta de fio, clicar no nó de origem e depois no de destino.
- **Mover nó:** selecionar a ferramenta de mover e arrastar o nó.
- **Apagar:** selecionar a ferramenta de apagar e clicar em um nó ou aresta.
- **Rodar simulação:** botão **Run >** ou tecla **Enter**.
- **Pausar / retomar:** tecla **Espaço** ou **P**.
- **Cancelar um fio em andamento:** tecla **Esc**.

### 14.3 Elementos de interface

Medidores de orçamento, paleta de nós, inspetor do nó selecionado, tela de briefing do incidente e tela de resultados com o tier e o custo.

## 15. Direção Visual

**Estilo visual:** minimalismo de terminal — tipografia monoespaçada, arte voltada para ASCII, diagramas limpos de nós e arestas.

**Referências visuais:** TIS-100, EXAPUNKS e Hacknet (UX monoespaçada e atmosfera de monitor CRT); Hypnospace Outlaw (nostalgia de UI retrô).

**Paleta / atmosfera:** verde-fósforo `#7CFFB2` e âmbar `#E0B265` sobre fundo azul-noite `#0B1020`, com branco-osso `#F1EEE6` para o texto, cinza-carvão `#3A3D45` para elementos neutros e vermelho `#FF6B6B` reservado para alertas. Estética coesa e de baixíssimo custo de assets.

**Tipos de assets necessários:** fonte monoespaçada, ícones simples de nós, shaders/efeitos leves de CRT (scanlines, glow) e elementos de UI vetoriais.

## 16. Direção de Áudio

**Estilo musical:** ambiente eletrônico discreto e repetitivo, que sustenta a concentração; intensifica sutilmente durante a simulação.

**Efeitos sonoros importantes:** teclas do terminal, encaixe de nó, conexão estabelecida, alerta de *error budget* crítico, e jingles curtos de nível concluído e de medalha de ouro.

**Como o áudio reforça o feedback do jogo:** sons distintos para ações válidas e inválidas; o tom de alerta acompanha a cor vermelha do *error budget*; o jingle de ouro premia a otimização.

## 17. Escopo Técnico

**Engine:** TypeScript sobre HTML5 Canvas, empacotado com Vite e distribuído como build estático. O núcleo de simulação é desacoplado da camada de renderização: a lógica de regras (`game.ts`) não conhece o DOM, o que a torna testável em isolamento e o renderizador, substituível.

**Modelo de simulação:** determinístico, por *tick*, em ordem topológica do grafo — a mesma topologia e o mesmo perfil de tráfego produzem sempre o mesmo resultado. Um ciclo no grafo é rejeitado como topologia inválida, refletindo a restrição real de um DAG.

### 17.1 Sistemas necessários

- Máquina de estados do jogo (menu, nível, simulação, resultados).
- Motor de simulação determinístico de tráfego sobre a topologia.
- Sistema de orçamento de recursos (CPU, memória, custo) e de *error budget*.
- Editor de topologia em canvas (posicionar, mover, conectar e apagar nós, com *hit-testing*).
- Sistema de pontuação por tier (FAIL / PASS / GOLD), persistido localmente.
- Carregador de níveis a partir de dados externos tipados.

### 17.2 Dados externos

- Definições de nível tipadas (`LevelSpec`): sistema inicial, orçamentos, perfil de tráfego, *error budget*, limiar de ouro e regras de roteamento.
- Catálogo de nós (`NodeSpec`) com custos, capacidades e parâmetros.
- Recursos de UI, fonte monoespaçada e efeitos sonoros curtos.

A simulação determinística é validada de forma reprodutível por um *harness* headless (`test:sim`), que roda o motor fora do navegador e confere os resultados nível a nível.

## 18. MVP — Versão Mínima Jogável

**O MVP entrega (estado atual: L01–L02 jogáveis):**

- Editor de topologia em canvas (posicionar, conectar, mover e apagar nós).
- Motor determinístico de tráfego por *tick* em ordem topológica, com visualização da simulação.
- Orçamento de recursos (CPU, memória, custo) e *error budget* por nível.
- Catálogo de nós: `ingress`, `load-balancer`, `service` e `ci-gate`.
- Pontuação por tier (FAIL / PASS / GOLD) pelo eixo de custo, persistida entre sessões.
- Níveis carregados de dados externos tipados.

**O MVP não terá ainda:**

- Mecânica de Infrastructure as Code por script.
- Os eixos completos de otimização (custo + ciclos + cobertura de testes).
- Campanha completa com todos os mundos temáticos.
- Narrativa e NPCs plenos.
- Nós de cache e fila (L03+), injeção de incidentes seedada (L05) e os efeitos finais de CRT e trilha sonora.

## 19. Riscos de Design e Mitigações

| Risco | Por que é um problema | Como mitigar |
| --- | --- | --- |
| Curva de aprendizado íngreme | Conceitos de DevOps podem afastar quem não é da área | Tutoriais diegéticos graduais e dicas da SRE sênior |
| Escopo crescer demais | Inviabiliza o protótipo no semestre | Começar com um mundo, 5–8 níveis e poucos tipos de nó |
| Simulação não determinística | A mesma solução dando resultados diferentes frustra | Núcleo determinístico em ordem topológica, validado por *harness* |
| Dificuldade mal calibrada | Níveis triviais ou impossíveis quebram o ritmo | Playtest e parâmetros (orçamento, budget) em dados externos |
| Virar exercício árido | Sem contexto, o puzzle pode parecer só números | Briefings curtos de incidente e logs com personalidade |
| Pontuação opaca | O jogador não entende como melhorar | Mostrar claramente o tier, o custo e o limiar de ouro |

## 20. Plano de Desenvolvimento

### 20.1 Etapa 1 — Protótipo básico (concluída)

**Objetivo:** validar o editor de topologia e a simulação de tráfego.

**Entregáveis:** posicionar e conectar tipos de nó; rodar uma simulação simples; medidor de orçamento. Materializada no nível L01.

### 20.2 Etapa 2 — Mecânicas principais (em andamento)

**Objetivo:** validar orçamento, *error budget* e condição de vitória.

**Entregáveis:** orçamento de recursos; *error budget* que escorre na simulação; tela de resultados com custo e tier; níveis em arquivo externo; gate de CI (L02).

### 20.3 Etapa 3 — Conteúdo e polimento

**Objetivo:** montar um mundo temático completo e dar acabamento de terminal.

**Entregáveis:** níveis L03–L05 (cache, pico de tráfego, injeção de incidentes); briefings de incidente; estética CRT; sons de ação e jingles.

### 20.4 Etapa 4 — Testes e ajustes

**Objetivo:** calibrar dificuldade, clareza e pontuação.

**Entregáveis:** playtest com roteiro; ajuste de orçamentos e limiares; decisão sobre os eixos de ciclos e cobertura e sobre a mecânica de IaC.

## 21. Referências do Projeto

### 21.1 Referências de jogos (inspiração direta)

- *TIS-100* (Zachtronics, 2015): puzzle com estética de terminal e arquitetura assembly diegética.
- *Shenzhen I/O* (Zachtronics, 2016): curva de dificuldade e pontuação de otimização.
- *Opus Magnum* (Zachtronics, 2017): pontuação multieixo (custo / ciclos / área), referência direta para o tradeoff de engenharia.
- *EXAPUNKS* (Zachtronics, 2018): level design de sistemas distribuídos.
- *while True: learn()* (Luden.io, 2018): grafos de nós e curva de aprendizado acessível.
- *Hacknet* (Team Fractal Alligator, 2015): UX monoespaçada e atmosfera de monitor CRT.
- *Factorio* (Wube Software, 2020): automação e otimização de *throughput* e fluxo de recursos.
- *Mindustry* (AnukenDev, 2017): escopo técnico de um indie 2D de automação.
- *Bitburner* (Daniel Xie, 2017): soluções criadas pelo próprio jogador via scripts.
- *Hypnospace Outlaw* (Tendershoot, 2019): atmosfera nostálgica de UI retrô.

### 21.2 Referências acadêmicas e da indústria

- Beyer, B. et al. (2016). *Site Reliability Engineering*. O'Reilly — *error budgets*, SLO/SLI.
- Humble, J. & Farley, D. (2010). *Continuous Delivery*. Addison-Wesley — arquétipos de nível de CI/CD.
- Morris, K. (2020). *Infrastructure as Code* (2ª ed.). O'Reilly — mecânica de IaC.
- Kim, G. et al. (2013). *The Phoenix Project*. IT Revolution — esboço narrativo de DevOps.
- Beck, K. (2002). *Test-Driven Development: By Example*. Addison-Wesley — cobertura como eixo de pontuação.
- Hunicke, R., LeBlanc, M. & Zubek, R. (2004). *MDA: A Formal Approach to Game Design and Game Research*. AAAI Workshop — mecânicas, dinâmicas e estética.
- Sicart, M. (2008). *Defining Game Mechanics*. Game Studies, v. 8, n. 2 — definição formal de mecânica.
- Schell, J. (2019). *The Art of Game Design* (3ª ed.). CRC Press — lentes de design.
- Salen, K. & Zimmerman, E. (2003). *Rules of Play*. MIT Press — fundamentos de design de sistemas.
- Adams, E. (2014). *Fundamentals of Game Design* (3ª ed.). New Riders — estrutura de gêneros e níveis.
- Nystrom, R. (2014). *Game Programming Patterns* — padrões de arquitetura de jogos.
- Sommerville, I. (2015). *Software Engineering* (10ª ed.). Pearson — processo e engenharia.

## 22. Observações Finais

- O MVP prioriza o *core loop* (compor topologia e simular) antes de qualquer polimento visual ou narrativo.
- A pontuação multieixo (custo, ciclos e cobertura de testes) é a meta completa; o MVP entrega o eixo de custo, e os demais entram na fase de conteúdo.
- Os níveis são definidos em dados externos tipados desde o início, permitindo balanceamento sem reescrever o motor.
- A simulação é determinística por nível: a mesma solução produz sempre o mesmo resultado, condição essencial para que a pontuação seja justa.
- Os conceitos de engenharia são ensinados pelo próprio gameplay, por meio de tutoriais diegéticos e dos comentários da SRE sênior, evitando paredes de texto.

## 23. Glossário de Termos Técnicos

- **Error budget:** a quantidade de falhas (requisições descartadas) tolerada antes de o serviço ser considerado fora do alvo de confiabilidade. No jogo, é a condição de vitória do nível.
- **SLO / SLI:** *Service Level Objective* e *Service Level Indicator* — a meta de confiabilidade e a métrica que a mede.
- **Load balancer:** nó que distribui o tráfego de entrada igualmente entre os nós a jusante.
- **Cache:** camada que guarda respostas frequentes para reduzir carga e latência.
- **Fila / back-pressure:** buffer que absorve picos de tráfego; quando enche, pressiona a montante.
- **CI/CD:** *Continuous Integration / Continuous Delivery* — integração e entrega contínuas de software.
- **Deploy canário:** liberação gradual de uma versão nova para uma fração do tráfego antes da adoção total.
- **Gate de CI:** ponto de verificação por onde todo o tráfego (ou rollout) precisa passar antes da produção.
- **IaC (Infrastructure as Code):** declarar a infraestrutura por código/templates versionáveis em vez de configuração manual.
- **Throughput (vazão):** volume de requisições processadas por unidade de tempo.
- **Topologia:** o grafo de nós e conexões que define como o tráfego flui pelo sistema.
- **Rollback:** reverter para uma versão anterior estável após um deploy problemático.
- **SRE (Site Reliability Engineering):** disciplina que aplica engenharia de software à operação de sistemas confiáveis.
- **DAG:** grafo dirigido acíclico; a topologia válida do jogo é um DAG (sem ciclos).
