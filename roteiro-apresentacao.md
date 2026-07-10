# Roteiro do Vídeo — crash-loop

**Disciplina:** Engenharia de Software para Jogos — 2026/1
**Equipe:** Three-Way Merge — Gabriel Felipe Guarnieri · Hector Guarçoni Machado · Marcos Winícios Silva Martins
**Data:** 2026-07-10
**Entrega:** vídeo de **até 5 minutos**
**Jogar:** https://oguarni.github.io/crash-loop/ · **Código:** https://github.com/oguarni/crash-loop

> Termos da interface (load-balancer, service, ci-gate, cache, queue, ingress, error budget, Run, GOLD, cost/cycles/coverage) ficam **em inglês** porque é assim que aparecem na tela. A narração é em português.

---

## 0. Os quatro requisitos e onde cada um é atendido

O professor pediu quatro coisas. Esta tabela é a régua de correção — confira antes de exportar.

| Requisito | Bloco | Quem | Tempo |
|---|---|---|---|
| **Enredo** (objetivo do jogo) | 1 | Marcos | 0:00–1:00 |
| **Demonstração** | 2 | Hector | 1:00–3:00 |
| **Resultado do gameflow** (testes com jogadores) | 3 | Gabriel | 3:00–4:15 |
| **Projeto no GitHub / link pra teste** | 4 | Hector + Gabriel | 4:15–5:00 |

> **Sobre o requisito 3.** A equipe **não** rodou sessões de playtest com jogadores externos (a Etapa 4 do Status-Point segue como *a iniciar*). O professor previu isso: *"Grupos que não alcançaram o que foi definido, verifiquem outra forma de validar."* O bloco 3 usa essa cláusula — e a assume **explicitamente na fala**, sem fingir que houve playtest. A validação alternativa apresentada (enumeração exaustiva do espaço de topologias contra a simulação determinística) é forte e produziu resultados reais: dois furos de balanceamento encontrados e fechados. **Não invente números de jogadores.** A honestidade é a jogada certa aqui, e é o que o enunciado pede.

---

## 1. Pré-produção (fazer antes de gravar)

- [ ] Abrir **https://oguarni.github.io/crash-loop/** uma vez com internet. Depois disso a fonte é self-hosted e o jogo roda **offline**.
- [ ] Navegador em **tela cheia** (F11), zoom 100%, gravação em **1080p / 60 fps** (o canvas anima; 30 fps borra o tráfego).
- [ ] Silenciar os SFX com **M** se for narrar por cima, ou deixar baixo na mixagem. Não compita com a própria voz.
- [ ] **Ensaiar o build do L07 três vezes** (7 nós, 7 wires). É o mais longo.
- [ ] Gravar **gameplay e narração em passadas separadas**. Constrói-se com calma, narra-se depois por cima. Isso é vídeo, não apresentação ao vivo — nada precisa sair certo de primeira.
- [ ] Ter os prints do anexo B prontos, caso um run precise ser substituído por imagem estática.

**Teclas de fuga durante a gravação:** número (**1–7**) pula de fase · **Esc** volta ao menu · **`?`** abre a legenda · **`Skip >>`** pula o resto do run.

---

## 2. Linha do tempo

| Tempo | Bloco | Narrador | Tela |
|---|---|---|---|
| 0:00–1:00 | **Enredo** | Marcos | Boot screen → level-select |
| 1:00–3:00 | **Demonstração** | Hector | L01 → L05 → L07 |
| 3:00–4:15 | **Gameflow / validação** | Gabriel | Terminal (`npm test`) + prints |
| 4:15–5:00 | **GitHub + fecho** | Hector, depois Gabriel | Repositório → jogo no ar |

**Estourou os 5 min?** Corte na ordem: (1) o beat de re-run determinístico do L05, (2) o flourish do gate no L07, (3) o L05 inteiro. O arco mínimo é **L01 → L07**.

---

## 3. Bloco 1 — Enredo (0:00–1:00) · **MARCOS**

**Tela:** boot screen parado no título. No fim do bloco, **ENTER** — o boot log imprime (`region us-merge-1 online`, `error budget mounted`, `pager routed — on call: you`) e cai no level-select.

*Alvo: ~150 palavras. Fale devagar; este é o bloco que o professor usa para entender tudo o que vem depois.*

**Gancho (10s).**
> "A maioria dos jogos te entrega uma arma. O crash-loop te entrega um *pager* às três da manhã."

**O objetivo do jogo (30s).**
> "Você é um SRE — a pessoa de plantão de um provedor de nuvem fictício. Cada fase entrega um sistema distribuído que está caindo, e o seu objetivo é montar uma topologia de nós — load-balancers, services, caches, queues — que aguente o tráfego simulado dentro de dois limites: um **error budget**, que é quantas requisições você pode perder, e um orçamento de custo. O loop é: compor, rodar, pontuar. É um puzzle 2D com estética de terminal. Sem física, sem 3D, sem tiro — o nosso lema é *backend over bullets*."

**A virada (20s).**
> "O que faz esse jogo caber nesta disciplina: **cada mecânica é uma prática real de engenharia de software.** Load balancing, cache, filas e back-pressure, *deploy gate* de CI/CD, error budget, chaos engineering. Não é reskin — o *service* é um service, o *gate* é um canary de verdade. Você aprende SRE jogando, não lendo. Somos a equipe **Three-Way Merge**."

→ **ENTER.** Deixe o boot log correr como transição para o bloco do Hector.

---

## 4. Bloco 2 — Demonstração (1:00–3:00) · **HECTOR**

Três fases, escolhidas para mostrar um eixo de pontuação cada. **Grave o build inteiro, depois acelere 3–4× na edição** e narre por cima — ninguém precisa ver 7 wires sendo ligados em tempo real.

**Modelo de interação (para não errar na gravação):**
- **Colocar nó:** clique no componente na *rail* (esquerda) → clique num espaço vazio do tabuleiro.
- **Ligar:** clique em **`wire` (`->`)** → clique na **origem** → clique no **destino**.
- **Regra do ingress:** o ingress tem **uma única saída**. Sempre `ingress → primeiro nó`, e o *fan-out* a partir dali.
- **Rodar:** **`Run >`** ou **Enter**. **Corrigir:** `delete` (`x`) · `move` (`::`) · **Clear**.

### 4.1 L01 "boot" (~45s) — o loop central

**Tecla `1`.** Build: **load-balancer + 3 services**.

1. Rail `load-balancer` → tabuleiro, à direita do ingress.
2. Rail `service` → **três** pontos numa coluna à direita.
3. Rail `wire` → `ingress → load-balancer`, depois `load-balancer → service` nos três.
4. **`Run >`**.

> "Fase um, *boot*. Chegam **30 requisições por tick**, e um service aguenta **10** — sozinho, ele desaba. O ingress só tem uma saída, então eu coloco um **load-balancer** para abrir o tráfego em leque, e três services atrás dele: **10 para cada**, exatamente a capacidade."

[Run termina: banner **GOLD**]

> "GOLD. Zero requisições perdidas, **$4.50** — bate o par. Um quarto service estouraria o orçamento de cinco dólares, então essa é a **única** solução ótima. E é assim em toda fase: existe uma **estratégia dominante**, e por isso a lição fica inequívoca."

### 4.2 L05 "chaos friday" (~35s) — o error budget

**Esc**, tecla `5`. Build: **load-balancer + 4 services**.

> "Fase cinco, *chaos friday*. O tráfego é estável — 20 por tick — mas réplicas **caem no meio da execução**. Quatro réplicas, cinco requisições para cada."

[Quando um nó ficar **vermelho pulsando** com `! down` e a barra de status mostrar `INCIDENT · 1 replica down`, **pause**.]

> "Uma réplica caiu. Como ela só carregava cinco por tick, só essas cinco caem — as outras três seguram o tráfego. Repara no **ERR_BUDGET** subindo, mas dentro do limite."

[Retome, deixe terminar: **50 dropped / 55**, **$5.50**, **GOLD**.]

> "Perdemos **50 requisições e mesmo assim é GOLD.** Isso é o **error budget**: confiabilidade tem orçamento — 100% é caro demais e nem é a meta."

[**Opcional, +8s** — corte este beat primeiro se estourar o tempo. **Edit** → **`Run >`**:]

> "E o caos é **semeado**: roda de novo e a mesma réplica cai no mesmo tick. Parece aleatório, mas é uma função pura da seed. É por isso que um jogo com falhas ainda é **testável** — e isso volta no próximo bloco."

### 4.3 L07 "black friday" (~40s) — o finale

**Esc**, tecla `7`. Topologia: `ingress → cache → queue → ci-gate → 4 services`.

1. Rail `cache` → à direita do ingress. 2. `queue` → à direita do cache. 3. `ci-gate` → à direita da queue (cadeia horizontal).
4. Rail `service` → **quatro** pontos numa coluna à direita do gate.
5. Rail `wire` → `ingress → cache`, `cache → queue`, `queue → ci-gate`, e `ci-gate → service` nas quatro.
6. **`Run >`**.

> "E o finale, *black friday* — tudo empilhado numa topologia só. O **cache** corta a leitura pesada pela metade, então eu provisiono para os *misses*, não para a chegada inteira. A **queue** absorve a rajada de **56 por tick** e drena depois. O **ci-gate** é um canary: **toda** réplica precisa passar por ele antes de produção."

[**Opcional, +12s** — o flourish do gate. Antes de colocar o ci-gate, ligue `queue → service` direto e aperte **`Run >`**: o jogo **recusa** com *"untested traffic reached production"*.]

> "Sem o gate, o jogo nem roda. É uma regra topológica de CI/CD: tráfego não testado não chega em produção."

[Run completo: **GOLD**, **45 dropped / 52**, **$8.00**, **CYCLES 768**, **COVERAGE 100%**.]

> "GOLD. **Oito dólares no par**, **768** request-ticks bufferizados na fila, e **100% de coverage** — todas as réplicas atrás do gate. Os três eixos de pontuação acesos ao mesmo tempo, na linhagem do Opus Magnum. E que quatro réplicas seja a **única** solução ouro, a gente não acha: a gente **prova**."

→ Deixa a deixa pronta para o Gabriel.

---

## 5. Bloco 3 — Resultado do gameflow (3:00–4:15) · **GABRIEL**

**Tela:** terminal com `npm test` rodando (leva ~6s, cabe ao vivo), depois os prints do anexo B.

*Alvo: ~190 palavras. Este é o bloco delicado — leia a nota do topo antes de gravar.*

**A ressalva, dita de frente (15s).**
> "Sobre o gameflow, uma ressalva honesta: **não conseguimos rodar sessões de playtest com jogadores externos** dentro do prazo. Seguindo a orientação, validamos o fluxo por outra via — e ela cobre justamente o que mais nos preocupava: a **curva de dificuldade**."

**A validação alternativa (30s).**
> "A simulação é uma **função pura**: mesma topologia, mesmo tráfego, mesma seed, mesmo resultado. Nenhum `Math.random`. Isso deixa a gente **automatizar o playtest**: em vez de pedir para um jogador tentar, a gente **enumera exaustivamente** todas as topologias possíveis dentro do orçamento de cada fase e verifica que o ouro pretendido é o único — que não existe atalho mais barato."

**O resultado — o que a validação encontrou (25s).**
> "E encontrou coisa. **Dois furos reais**, que a gente fechou: uma escada de caches que tirava ouro a **$5.00 sem nenhum service**, e um build de **$7.00** que trocava a queue por um segundo gate e vencia o par do finale. Um jogador humano provavelmente não acharia nenhum dos dois. A busca exaustiva achou os dois."

[`npm test` termina: **110 passed**]

> "Está tudo travado em **110 testes automatizados**. Cada fase tem a solução ouro **e** o *near-miss* provados: no finale, quatro réplicas passam a oito dólares, e três réplicas **falham** com 60 drops."

**O limite, também dito de frente (20s).**
> "O que essa validação **não** cobre, e a gente reconhece: legibilidade e a confusão do jogador de primeira viagem. Nenhuma suíte de testes descobre que um ícone não se entende. Foi por isso que adicionamos um **tutorial overlay** e fizemos uma passada de legibilidade — mas sessões com jogadores continuam sendo o **próximo passo**, não uma caixa marcada."

---

## 6. Bloco 4 — GitHub + fecho (4:15–5:00) · **HECTOR**, depois **GABRIEL**

**Tela:** repositório no GitHub (mostre o check verde do CI) → corte para o jogo rodando no navegador → cartela final com os dois links, **legíveis e parados por pelo menos 5 segundos**.

**HECTOR (20s).**
> "O projeto está inteiro no GitHub: código, GDD, os testes e o pipeline. E o jogo está **no ar** — dá para jogar no navegador agora, sem instalar nada, direto do GitHub Pages. Deploy automático a cada merge na main."

**GABRIEL (25s).**
> "TypeScript, Canvas, **zero dependências de runtime**, bundle de 43 kB. `sim/` é o motor determinístico, `game.ts` são as regras do tabuleiro sem nenhum código de DOM, `render.ts` desenha. E tem CI: cada push roda **typecheck, testes e build**."
>
> "Fechando com a simetria de que a gente gosta: **o jogo que ensina CI/CD é entregue por um pipeline de CI/CD.** Sete regiões para estabilizar, uma pillar: **engenharia de verdade, jogável.**"

**Cartela final (deixe 5s na tela, sem narração):**

```
   crash-loop  ·  Three-Way Merge

   Jogar:  oguarni.github.io/crash-loop
   Código: github.com/oguarni/crash-loop
```

---

## Anexo A — Números verificados

Reproduzidos headless contra `src/sim/engine`. **Não arredonde no vídeo.**

| Fase | Build ouro | Dropped / budget | Custo / par | Cycles | Coverage |
|---|---|---|---|---|---|
| **L01** boot | lb + 3 services | 0 / 20 | $4.50 / $4.50 | — | — |
| **L05** chaos friday | lb + 4 services | 50 / 55 | $5.50 / $5.50 | — | — |
| **L07** black friday | cache→queue→ci-gate→4 services | 45 / 52 | $8.00 / $8.00 | 768 | 100% |

- **Suíte:** `npm test` → **110 passed** (3 arquivos). Cobertura ~99% no núcleo. Harness headless `test:sim` com 71 asserções.
- **Near-miss do L07:** 3 réplicas → **60 dropped** (FALHA). 5 réplicas → 37 dropped, mas **$9.00**, acima do par (PASS, não ouro).
- **Bundle:** ~43 kB, zero dependências de runtime.
- **Tipos de nó:** `ingress >>` (1 saída) · `load-balancer <=>` $1.50 · `service []` $1.00 cap 10 · `ci-gate =|=` $1.00 cap 20 · `cache [~]` $1.00 (serve ~50%) · `queue [>]` $2.00 (drena 20/tick, buffer 100).

---

## Anexo B — Prints a capturar antes de gravar

Servem de plano B (substituem um run que não saiu bom) e de material para o bloco 3.

1. **Level-select** com os tiers conquistados (mostra progressão).
2. Tela de **resultado GOLD** de cada uma das três fases demonstradas.
3. O **run rejeitado** do L07: *"untested traffic reached production"*.
4. Saída do **`npm test`** com `110 passed`.
5. O **check verde do CI** na página de commits do GitHub.

---

## Anexo C — Controles

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
| Voltar ao menu | **Esc** |
| Pular de fase | **teclas 1–7** no menu |
