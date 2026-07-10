# Roteiro de Apresentação — crash-loop

**Disciplina:** Engenharia de Software para Jogos — 2026/1
**Equipe:** Three-Way Merge — Gabriel Felipe Guarnieri · Hector Guarçoni Machado · Marcos Winícios Silva Martins
**Data:** 2026-07-06
**Duração alvo:** ~15 minutos
**Jogar ao vivo:** https://oguarni.github.io/crash-loop/

> Termos da interface (load-balancer, service, ci-gate, cache, queue, ingress, error budget, Run, GOLD, cost/cycles/coverage) ficam **em inglês** porque é assim que aparecem na tela. A fala é em português.

---

## 0. Checklist pré-voo (fazer 5 min antes)

- [ ] Abrir **https://oguarni.github.io/crash-loop/** uma vez **com internet**. Depois disso a fonte é self-hosted e o jogo roda **offline** — carregar uma vez basta.
- [ ] Deixar o **repositório aberto numa segunda aba/terminal** (para o bloco de engenharia). Se possível, `npm test` já rodado uma vez para o cache ficar quente.
- [ ] Tela cheia no navegador (F11). Zoom em 100%.
- [ ] Áudio: decidir se mantém os SFX (bom para feedback) ou silencia com **M** se a sala tiver eco. A vinheta CRT pode ser reduzida se o projetor lavar as cores (constante `VIGNETTE_ALPHA` no `render.ts`).
- [ ] **Ensaiar o build do L07 três vezes** — é o mais longo (7 nós, 7 wires). O resto é curto.
- [ ] Decorar as três teclas de fuga: **número (1–7)** pula de nível, **Esc** volta ao menu, **`?`** abre a legenda.
- [ ] Plano B pronto (ver seção 7): se a máquina do local não roda o jogo, o link ao vivo em qualquer navegador resolve.

---

## 1. Linha do tempo (visão geral)

| Tempo | Bloco | Objetivo |
|---|---|---|
| 0:00–2:30 | **Pitch de abertura** | O que é, a virada, por que nesta disciplina |
| 2:30–4:00 | **L01 "boot"** | Ensinar a interface e o loop central → GOLD |
| 4:00–6:00 | **L06 "back-pressure"** | A queue: bufferizar um pico em vez de superdimensionar |
| 6:00–8:30 | **L05 "chaos friday"** | Réplicas caem ao vivo; caos **determinístico** = testável |
| 8:30–11:30 | **L07 "black friday"** | O finale: todas as mecânicas e os três eixos ao mesmo tempo |
| 11:30–13:30 | **A engenharia por trás** | Determinismo → testes (110), CI/CD, arquitetura, processo |
| 13:30–15:00 | **Roadmap + encerramento + Q&A** | Fechar e responder |

**Se estourar o tempo:** corte o L06 (bloco 4:00–6:00). O arco mínimo que ainda conta a história é **L01 → L05 → L07**.

---

## 2. Pitch de abertura (0:00–2:30) — o que FALAR

Tela: deixe o **boot screen** (título) aberto. Fale por cima; só aperte **ENTER** para bootar no final deste bloco.

**Gancho (15s).**
> "A maioria dos jogos te entrega uma arma. O crash-loop te entrega um *pager* às três da manhã. Você é um SRE — a pessoa de plantão — e o seu trabalho é manter um provedor de nuvem fictício de pé enquanto ele tenta cair."

**O que é (30s).**
> "É um puzzle 2D de infraestrutura e automação, com estética de terminal. Sem física, sem 3D, sem tiro. O nosso lema é *backend over bullets*. Cada fase te entrega um sistema distribuído falhando, e você compõe uma topologia de nós — load-balancers, services, caches, queues — que aguenta o tráfego simulado dentro de um **error budget** e de um **orçamento de recursos**."

**A virada — o argumento central (45s).**
> "O detalhe que faz esse jogo caber nesta disciplina: **cada mecânica é uma prática real de engenharia de software.** Load balancing, caching, *deploy gates* de CI/CD, filas e back-pressure, *error budgets*, chaos engineering. Não é reskin — o service é um service, o gate é um canary de verdade. Você aprende SRE **jogando**, e não lendo sobre."

**Por que nesta disciplina (30s).**
> "E tem uma simetria que a gente gosta: o jogo **ensina** engenharia de software, e foi **construído** com engenharia de software de verdade — simulação determinística, 110 testes automatizados, pipeline de CI/CD, arquitetura em camadas. O meio e a mensagem batem. É isso que a gente quer mostrar nos próximos doze minutos: primeiro o jogo, depois a engenharia por trás dele."

**Equipe + referências (20s).**
> "Somos a equipe **Three-Way Merge** — Gabriel, Hector e Marcos. O nome é a operação de controle de versão que reconcilia três históricos num só. As referências são honestas: a linhagem Zachtronics — TIS-100, Opus Magnum —, e do lado técnico o livro de *Site Reliability Engineering* do Google, *Continuous Delivery* e *The Phoenix Project*."

→ Aperte **ENTER**. O boot log imprime (`region us-merge-1 online`, `error budget mounted`, `pager routed — on call: you`) e cai no **level-select**.

---

## 3. Demo ao vivo — o que FAZER no jogo

**Modelo de interação (vale para todas as fases):**
- **Colocar nó:** clique no componente na **rail** (esquerda) → clique num espaço vazio do tabuleiro. A ferramenta continua selecionada, então dá para colocar vários clicando em vários lugares.
- **Ligar (wire):** clique em **`wire` (`->`)** na rail → clique no nó de **origem** → clique no nó de **destino**. Duas etapas por ligação.
- **Regra do ingress:** o **ingress só tem UMA saída**. Sempre ligue `ingress → primeiro nó` e faça o *fan-out* a partir dali. (Se tentar uma segunda saída do ingress, o jogo avisa — é uma boa deixa para explicar.)
- **Rodar:** botão **`Run >`** (canto inferior direito) ou **Enter**.
- **Corrigir:** ferramenta **`delete` (`x`)** apaga um nó ou uma edge; **`move` (`::`)** arrasta. Em último caso, **Clear** limpa e recomeça.

> Dica de palco: no menu, use as **teclas numéricas** para pular de fase — nunca dependa de achar o card certo com o mouse.

---

### 3.1 L01 "boot" (2:30–4:00) — o loop central

**No menu, pressione `1`.** (Ou clique no card L01.)

**Ideia pedagógica:** ensinar a interface e provar o loop: compor → rodar → pontuar. O `svc-cart` está numa réplica só e desaba: chegam **30 req/tick**, um service aguenta **10**.

**Passo a passo (alvo: GOLD, $4.50):**
1. Rail: clique **`load-balancer`**. Tabuleiro: clique um pouco à **direita do ingress**, na mesma altura.
2. Rail: clique **`service`**. Tabuleiro: clique **três** pontos numa coluna, mais à direita (um acima, um no meio, um abaixo).
3. Rail: clique **`wire` (`->`)**.
4. Ligue **ingress → load-balancer** (clique num, depois no outro).
5. Ligue **load-balancer → service** para os **três** services (origem, destino; origem, destino; origem, destino).
6. **`Run >`** (ou Enter).

**Enquanto fala (aponte para a tela):**
> "O ingress só tem uma saída, então preciso de um load-balancer para abrir o tráfego em leque. Ele divide **30** igualmente: **10 para cada** service, exatamente a capacidade de cada um. Repara nos medidores embaixo — **CPU, MEM, COST** e o **ERR_BUDGET**. Rodando…"

**Resultado esperado:** banner **GOLD — error budget held**, **0 dropped**, **$4.50** (bate o `parCost`).
> "Zero drops, no menor custo possível. Um quarto service estouraria o orçamento de $5.00 — então essa é a **única** solução ótima. Toda fase tem uma *estratégia dominante*: a lição é inequívoca."

---

### 3.2 L06 "back-pressure" (4:00–6:00) — a fila

**Esc** para o menu, **pressione `6`.**

**Ideia pedagógica:** o contraponto de "compre mais capacidade". O tráfego fica em **10 req/tick**, dá um pico de **40 por cinco ticks** e volta. Provisionar para o pico é caro demais — a resposta é **bufferizar** o pico com uma **queue** e drenar depois.

**Passo a passo (alvo: GOLD, $4.00):**
1. Rail: **`queue`**. Tabuleiro: à direita do ingress.
2. Rail: **`service`**. Tabuleiro: **dois** pontos à direita da queue (um em cima, um embaixo).
3. Rail: **`wire`**. Ligue **ingress → queue**, depois **queue → service** nos dois.
4. **`Run >`**.

**Momento-chave — pause no pico:** por volta do **tick 12**, aperte **`Pause`** (ou Espaço).
> "Olha a queue: o campo *held* subiu até **100** — ela encheu o buffer no pico. Ela drena no máximo **20 por tick** e segura o resto **atravessando os ticks** — é o único nó com estado. Nada foi derrubado; foi só **adiado**."

Aperte **Espaço** de novo para retomar e deixe terminar.

**Resultado esperado:** **GOLD**, **0 dropped**, **$4.00**, e o eixo **CYCLES = 750**.
> "Aqui acende o segundo eixo de pontuação: **CYCLES** — o total de *request-ticks* que ficaram esperando na fila. Custo, cycles e coverage são placares separados, na linhagem do Opus Magnum. A lição: **absorver** o pico sai muito mais barato que **dimensionar** para ele."

---

### 3.3 L05 "chaos friday" (6:00–8:30) — o caos determinístico

**Esc** para o menu, **pressione `5`.**

**Ideia pedagógica:** resiliência. O tráfego é estável (**20 req/tick**), mas um **cronograma semeado** derruba réplicas no meio da execução — uma de cada vez, dois incidentes de cinco ticks. Você não vê o horário exato; constrói **para** a falha.

**Passo a passo (alvo: GOLD, $5.50):**
1. Rail: **`load-balancer`**. Tabuleiro: à direita do ingress.
2. Rail: **`service`**. Tabuleiro: **quatro** pontos numa coluna à direita do lb.
3. Rail: **`wire`**. Ligue **ingress → load-balancer**, depois **load-balancer → service** nos **quatro**.
4. **`Run >`**.

**Enquanto roda (é o momento mais visual — narre):**
> "Com quatro réplicas, o load-balancer dá **5 req/tick** para cada. Agora observem…"

Quando um nó ficar **vermelho pulsando** com `! down` e soltar faíscas, a linha de status mostra `INCIDENT · 1 replica down`. **Pause** durante o incidente:
> "Uma réplica caiu. Como ela só carregava 5 por tick, só esses 5 caem — os outros três seguram o tráfego. Repara no **ERR_BUDGET** subindo, mas dentro do limite."

Retome e deixe terminar.

**Resultado esperado:** **GOLD**, **50 dropped** de **55** permitidos, **$5.50**.
> "Derrubamos **50 requisições e mesmo assim é GOLD.** Isso é o **error budget**: confiabilidade tem orçamento — 100% é caro demais e nem é a meta. Com duas ou três réplicas, cada uma carrega demais e a queda estoura o limite. Quatro é a solução dominante."

**Flourish opcional (+15s) — o determinismo:** aperte **Edit** e **`Run >`** de novo.
> "Roda de novo: **a mesma réplica cai no mesmo tick.** O caos parece aleatório, mas é uma função pura da *seed* da fase, gerada uma vez antes do loop. É por isso que um jogo com falhas aleatórias ainda é **testável** — e determinismo é uma das nossas pillars de design."

---

### 3.4 L07 "black friday" (8:30–11:30) — o finale

**Esc** para o menu, **pressione `7`.**

**Ideia pedagógica:** o clímax. Empilha **tudo** numa topologia só, com os **três eixos vivos** ao mesmo tempo. Pico de leitura em **32 req/tick**, rajada de **56 por oito ticks** (a Black Friday), cauda longa de recuperação, e **dois incidentes** derrubando réplicas.

**Topologia-alvo:** `ingress → cache → queue → ci-gate → 4 services`.

> **Duas regras estruturais valem aqui** (`requireBeforeSinks: ['gate', 'queue']`): todo caminho até uma réplica precisa cruzar **a queue** *e* **o ci-gate**. Sem a queue, o run é rejeitado com "*Unbuffered traffic reached production*" — é o que impede trocar a queue por um segundo gate e vencer o par a $7.00.

**Passo a passo (alvo: GOLD, $8.00):**
1. Rail: **`cache`**. Tabuleiro: à direita do ingress.
2. Rail: **`queue`**. Tabuleiro: à direita do cache.
3. Rail: **`ci-gate`**. Tabuleiro: à direita da queue. (Formam uma **cadeia horizontal**.)
4. Rail: **`service`**. Tabuleiro: **quatro** pontos numa coluna à direita do gate.
5. Rail: **`wire`**. Ligue em cadeia: **ingress → cache**, **cache → queue**, **queue → ci-gate**, e o **ci-gate → service** nas **quatro** réplicas.
6. **`Run >`**.

> Se faltar espaço, use **`move` (`::`)** para reorganizar, ou **Clear** e recomece. Posições são aproximadas — o que importa é a **cadeia** e as 4 réplicas atrás do gate.

**Enquanto constrói, amarre com o que já mostrou:**
> "Vou empilhar as peças. O **cache** corta a leitura pesada pela metade, então eu provisiono para os *misses*, não para a chegada inteira. A **queue** — que vocês viram na back-pressure — soca a rajada e drena depois. O **ci-gate** é um canary: **toda** réplica precisa passar por ele antes de produção. E o **chaos**, como no chaos friday, ainda derruba uma réplica no meio."

**Flourish opcional (+20s) — a regra do deploy gate:** antes de colocar o gate, ligue `queue → service` direto e aperte **`Run >`**.
> "Sem o gate, o jogo **recusa** a rodar: *'untested traffic reached production'*. É uma regra topológica de CI/CD — tráfego não testado não chega em produção."
Aí adicione o **ci-gate** no meio e rode de novo.

**Resultado esperado:** **GOLD**, **45 dropped** de **52**, **$8.00**, **CYCLES 768**, **COVERAGE 100%** — e provavelmente **NEW BEST**.
> "Os três eixos acesos de uma vez: custo no par, 768 request-ticks bufferizados, e **100% de coverage** — todas as réplicas atrás do gate. Tira o cache e a fila entope; tira a fila e um gate só não segura a rajada; roda com três réplicas e a queda derruba o orçamento. **Quatro** é a única solução ouro. E isso a gente **prova** — no próximo bloco."

---

## 4. A engenharia por trás (11:30–13:30) — a prova de SE

Troque para o **repositório/terminal**. Este bloco é o que transforma "joguinho legal" em "projeto de engenharia de software".

**1) Determinismo → testabilidade (a pillar que paga tudo).**
> "A simulação é uma **função pura**: mesma topologia + mesmo tráfego + mesma seed → mesmo resultado, sempre. Nenhum `Math.random`, nenhum relógio de parede. Isso me deixa **afirmar resultados exatos** num teste."

Se a máquina roda Node, **rode ao vivo** (impacto alto, ~1s):
```
npm test        # 92 passing
```
> "**110 testes**, cobertura de **~99%** no núcleo (sim + regras do tabuleiro + pontuação), mais um smoke harness headless com **71 asserções**. Cada fase tem a solução ouro e o *near-miss* provados: no finale, quatro réplicas passam a $8.00 e três réplicas **falham** — está no teste."

**2) CI/CD — a simetria de fechamento.**
> "Tem CI no GitHub Actions: a cada push roda **typecheck → testes → build**. E um workflow de deploy publica no GitHub Pages a cada merge na main. Ou seja: **o jogo que ensina CI/CD é entregue por um pipeline de CI/CD.**"

**3) Arquitetura em camadas.**
> "`sim/` é o motor determinístico; `game.ts` são as regras do tabuleiro **sem nenhum código de DOM**, então as regras são unit-testáveis e o renderer é substituível; `render.ts` desenha; `progress.ts` guarda os placares. Separação limpa de responsabilidades."

**4) Processo de equipe (a meta-piada que é séria).**
> "A gente se chama **Three-Way Merge** e trabalhou em **trilhas paralelas** com fronteiras de propriedade de arquivo explícitas e um contrato de dados compartilhado (`docs/plans/`) — depois reconciliado por pull requests com CI barrando o merge. A gente **praticou** a engenharia de software que estava ensinando: do conceito (Atividade 1) à pesquisa de mecânicas (Atividade 2), ao GDD, ao sprint de build, ao deploy ao vivo."

---

## 5. Roadmap + encerramento (13:30–15:00)

**Roadmap (o que vem):**
- **Infrastructure as Code** — declarar parte da topologia por um script/template.
- **Narrativa & NPCs** — briefings de incidente diegéticos e um mentor SRE sênior.
- **Campanha temática** — agrupar fases em mundos (Ingress, Queues, Services, CI/CD, Data/Cache) com cenários-chefe.

**Frase de encerramento (decore uma):**
> "Sete regiões para estabilizar, uma pillar: **engenharia de verdade, jogável.** O jogo ensina os sistemas — e foi construído pelos mesmos sistemas que ensina."

Abra para **perguntas** (respostas prontas na seção 6).

---

## 6. Perguntas prováveis e respostas

**"Não é só um clone de Opus Magnum / Zachtronics?"**
> A gente cita a linhagem abertamente. O diferencial é que **cada mecânica mapeia para uma prática de SRE real e nomeável** — não é puzzle abstrato, é um modelo de fluxo fiel (ainda que simplificado). Fidelidade educacional é o ponto.

**"Como vocês projetaram a dificuldade?"**
> Cada fase tem uma **estratégia dominante** imposta pelos orçamentos e pelas regras estruturais da topologia — um ouro único ou quase único. A lição fica inequívoca, e a gente **prova** cada uma com teste (ex.: no L01, lb + 3 services é o único build dentro de $5 que zera; no L07, quatro réplicas é o único ouro). Também **enumeramos exaustivamente** o espaço de topologias dentro do orçamento de cada fase para confirmar que não existe um ouro mais barato que o par — foi assim que achamos e fechamos dois furos no finale: uma escada de caches que ganhava ouro a $5.00 sem nenhum service, e um build de $7.00 que trocava a queue por um segundo gate.

**"Como se testa um jogo com falhas aleatórias?"**
> O chaos é **semeado** — função pura da seed da fase, gerado uma vez antes do loop de ticks. Mesma seed → mesmo cronograma. Por isso dá para escrever um teste de determinismo (roda duas vezes, mesmo resultado). Está no `engine.test.ts`.

**"Qual a stack técnica?"**
> TypeScript + Vite, HTML5 Canvas, Web Audio para SFX **sintetizados** (nenhum arquivo de áudio), **zero dependências de runtime**, bundle de ~43 kB. Sem framework: o renderer é escrito à mão e as regras do jogo são agnósticas de framework.

**"Por que sem física / 3D / multiplayer?"**
> Pillar deliberada — *backend over bullets*. Mantém a simulação determinística e testável e o foco em **pensamento de sistemas**. É disciplina de escopo, não limitação.

**"Qual foi o escopo entregue?"**
> v1: **7 fases**, 6 tipos de nó (ingress, load-balancer, service, ci-gate, cache, queue), level-select, pontuação multi-eixo, help overlay, áudio, polish CRT, e **no ar** no GitHub Pages.

**"Como a equipe dividiu o trabalho?"**
> Duas trilhas paralelas (`docs/plans/PLAN-A`, `PLAN-B`) com propriedade de arquivos separada e um contrato de dados compartilhado (o formato do `SimResult`). Merge por PR, com CI barrando.

---

## 7. Referência rápida e contingência

### Controles (cola de palco)

| Ação | Como |
|---|---|
| Colocar | Clicar componente na rail → clicar espaço vazio |
| Ligar (wire) | `wire` → clicar origem → clicar destino |
| Mover / Apagar | `move` arrasta · `delete` remove nó ou edge |
| Rodar | **`Run >`** ou **Enter** |
| Pausar / Retomar | **`Pause`** ou **Espaço** / **P** |
| Pular fim da run | **`Skip >>`** |
| Ajuda / legenda | **`?`** ou **H** |
| Mudo | **M** |
| Voltar ao menu | **Esc** (ou `< menu` na rail) |
| Pular de fase | **teclas 1–7** no menu |

**Tipos de nó:** `ingress >>` (1 saída) · `load-balancer <=>` $1.50 (divide igual) · `service []` $1.00 cap 10 (sink) · `ci-gate =|=` $1.00 cap 20 (canary; tudo passa) · `cache [~]` $1.00 (serve ~50% local) · `queue [>]` $2.00 (drena 20/tick, buffer 100).

### Se algo der errado

- **Errei um wire/nó:** ferramenta **`delete` (`x`)** tira só aquele; ou **Clear** e recomeça. Não trave — comente ("aqui um delete rápido") e siga.
- **Build ao vivo demorou:** pule para uma fase já pronta com as **teclas numéricas** e mostre um **Run** direto, ou use **`Skip >>`** para não esperar a animação.
- **Perdi o tempo:** corte o **L06**; o arco mínimo é **L01 → L05 → L07**.
- **Sem internet na hora:** o jogo roda **offline** depois de carregar uma vez. Se nem isso, rode o build local (`npm run preview`) ou mostre o `dist/`.
- **A máquina do local não tem Node** (para o `npm test` ao vivo): tenha um **print** da saída dos 110 testes ou mostre o **check verde do CI** no GitHub. O jogo em si só precisa de um navegador.

---

## Anexo — números verificados (para não errar no palco)

Reproduzidos headless contra `src/sim/engine` (é o que os testes afirmam):

| Fase | Build ouro | Dropped / budget | Custo / par | Cycles | Coverage |
|---|---|---|---|---|---|
| **L01** boot | lb + 3 services | 0 / 20 | $4.50 / $4.50 | — | — |
| **L06** back-pressure | queue + 2 services | 0 / 20 | $4.00 / $4.00 | 750 | — |
| **L05** chaos friday | lb + 4 services | 50 / 55 | $5.50 / $5.50 | — | — |
| **L07** black friday | cache→queue→ci-gate→4 services | 45 / 52 | $8.00 / $8.00 | 768 | 100% |

**Números de apoio para o Q&A:** L07 com 3 réplicas → **60 dropped** (FALHA); com 5 réplicas → 37 dropped mas **$9.00**, acima do par (PASS, não ouro). O finale é verificado no `engine.test.ts` e no `sim-check.ts`.
