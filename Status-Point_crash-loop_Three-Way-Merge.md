# crash-loop — Status Point

**Ponto de Situação do Desenvolvimento**

**Equipe Three-Way Merge** — Gabriel Felipe Guarnieri · Hector Guarçoni Machado · Marcos Winícios Silva Martins

**Disciplina:** Engenharia de Software para Jogos — 2026/1
**Data:** 2026-06-27
**Protótipo jogável:** níveis L01–L02 em TypeScript + HTML5 Canvas
**Documento de referência:** `GDD_crash-loop_Three-Way-Merge.pdf` (Game Design Document, v1.0)

## 1. Resumo Executivo

O protótipo de *crash-loop* está jogável de ponta a ponta. O núcleo do jogo — editor de topologia, motor de simulação determinístico, orçamento de recursos, *error budget* e pontuação por tier — está implementado e verificado: dois níveis (L01 "boot" e L02 "first deploy") são vencíveis, o *build* de produção compila sem erros e a matemática da simulação passa em 23 de 23 checagens automatizadas.

Tomando como base o **Plano de Desenvolvimento** do GDD (seção 20), o estado por etapa é:

| Etapa | Escopo | Status |
| --- | --- | --- |
| Etapa 1 — Protótipo básico | Editor de topologia e simulação de tráfego | Concluída |
| Etapa 2 — Mecânicas principais | Orçamento, *error budget*, tela de resultados, níveis externos, gate de CI | Concluída |
| Etapa 3 — Conteúdo e polimento | Níveis L03–L05, áudio, *branding*, estética CRT | Em andamento |
| Etapa 4 — Testes e ajustes | *Playtest*, calibração de dificuldade e pontuação | A iniciar |

As seções 2 a 4 detalham, respectivamente, o que está **concluído**, o que está **em andamento** e **o que falta**, conforme solicitado.

## 2. Etapas Concluídas

### 2.1 Núcleo técnico

- **Motor de simulação determinístico** (`sim/engine.ts`): tráfego processado por *tick*, em ordem topológica do grafo; a mesma topologia e o mesmo perfil produzem sempre o mesmo resultado. Um ciclo é rejeitado como topologia inválida (restrição real de DAG).
- **Editor de topologia em canvas** (`game.ts`, `render.ts`, `main.ts`): posicionar, conectar (*wire*), mover e apagar nós, com *hit-testing*, validação de sobreposição e cancelamento de fio em andamento.
- **Sistema de orçamento de recursos** — CPU, memória e custo (US$) — somado em tempo real e checado contra os tetos do nível, além do **error budget** por nível.
- **Catálogo de nós** (`sim/nodes.ts`): `ingress`, `load-balancer`, `service` e `ci-gate` (4 tipos), cada um com custo, capacidade e comportamento de *fan-out* próprios.
- **Regra de topologia `requireBeforeSinks`**: força todo caminho do `ingress` ao serviço a passar por um tipo de nó obrigatório (o gate de CI do L02), verificada antes de o tráfego fluir.
- **Pontuação por tier** (`progress.ts`): cada execução é graduada em FAIL / PASS / GOLD pelo eixo de custo; o melhor tier e o menor custo aprovado são persistidos por nível em `localStorage`, sem nunca alimentar a simulação (estado meta isolado).
- **Carregamento de níveis a partir de dados tipados** (`LevelSpec` em `types.ts`): cada nível é um dado externo (sistema inicial, orçamentos, perfil de tráfego, *error budget*, limiar de ouro e regras de roteamento), permitindo balanceamento sem tocar no motor.

### 2.2 Conteúdo jogável

- **L01 — "boot":** roteamento básico. `ingress` → *load-balancer* → 3 serviços absorvem 30 req/tick com zero descartes, a US$ 4,50 (também bate o limiar de ouro). Introduz orçamento de recursos e *error budget*.
- **L02 — "first deploy":** *deploy* canário. Todo o tráfego precisa passar por um gate de CI antes da produção; dois gates em paralelo sustentam 40 req/tick a US$ 7,50. Encadeia três lições — serviços sem gate são rejeitados, um gate só estrangula o tráfego, dois gates balanceados resolvem com custo mínimo.

### 2.3 Verificação e build

- **Type-check limpo:** `tsc --noEmit` sem erros.
- **Build de produção:** `vite build` gera um *bundle* estático (≈ 30 kB; ≈ 11 kB *gzip*), sem instalação, que roda no navegador.
- **Harness de simulação determinística** (`test:sim`): roda o motor fora do navegador e confere a matemática e as regras de topologia de L01 e L02 — **23 de 23 checagens passam** (conservação de tráfego, capacidade de nós, rejeição de ciclo, regra do gate, custo de ouro e a fusão de pontuação).

### 2.4 Documentação e entregas de curso

- **Game Design Document v1.0** completo (23 seções), em Markdown e PDF.
- **Atividade 1 — Conceito e formação de equipe:** entregue.
- **Atividade 2 — Pesquisa de Game Mechanics:** entregue (catálogo de 18 mecânicas com mapeamento de escopo).

## 3. Etapas em Andamento

A Etapa 3 (conteúdo e polimento) já começou; o trabalho está concentrado na camada de "sensação" sobre o núcleo já verificado:

- **Áudio sintetizado** (`audio.ts`): efeitos de terminal gerados via Web Audio API (sem arquivos de áudio no *build*) — teclas, encaixe de nó, conexão, alerta de *error budget* e jingles de nível e de ouro. Em integração com os eventos de jogo.
- **Identidade visual no boot** (`images.ts` + `public/`): *logo*, avatar do operador e ícone exibidos na tela de abertura; os *masters* pesados ficam fora do versionamento e `scripts/build-assets.sh` deriva as cópias otimizadas.
- **Visualização ampliada da simulação** (`render.ts`): feedback mais rico durante a execução — pacotes percorrendo a topologia, filas enchendo, *error budget* escorrendo — e a tela de resultados com tier, custo e recorde (*new best*).

Essas mudanças estão na árvore de trabalho, sobre o protótipo L01–L02 já consolidado, em fase de integração e ajuste.

## 4. O Que Falta

### 4.1 Conteúdo de níveis

- **L03 — "flapping cart":** nó de **cache** para absorver leituras repetidas.
- **L04 — "error budget":** orçamento mais apertado e um pico de tráfego.
- **L05 — "chaos friday":** injeção de incidentes *seedada* no meio da execução (mecânica de Risco/Chance), mantendo o determinismo por nível.
- **Novos tipos de nó:** `cache` e `queue` (fila com *back-pressure*).
- **Campanha temática completa:** os mundos Ingress, Filas, Serviços, CI/CD, Dados/Cache e Painel de SRE (níveis-chefe).

### 4.2 Mecânicas e sistemas

- **Infrastructure as Code:** declarar parte da topologia por *script*/template em vez de posicionar nó a nó.
- **Pontuação multieixo completa:** somar os eixos de **ciclos** e **cobertura de testes** ao eixo de custo já existente.
- **Narrativa e NPCs:** *briefings* diegéticos de incidente e a SRE sênior que conduz o *onboarding*.

### 4.3 Polimento e validação

- **Estética de terminal:** efeitos CRT (*scanlines*, *glow*) e trilha sonora ambiente.
- **Etapa 4 — Testes e ajustes:** *playtest* com roteiro e usuários, calibração de dificuldade, orçamentos e limiares. A base de verificação determinística (`test:sim`) já existe como fundação para essa etapa.

## 5. Como Verificar o Estado Atual

O estado relatado é reproduzível a partir da raiz do projeto:

```
npm install
npm run dev        # abre o protótipo jogável (L01–L02) no navegador
npm run test:sim   # roda o harness determinístico: 23/23 checagens
npm run build      # type-check limpo + bundle estático de produção
```

## 6. Próximos Passos Imediatos

1. Concluir a integração de áudio e da visualização ampliada na Etapa 2/3, consolidando as mudanças da árvore de trabalho.
2. Implementar o nó de `cache` e o nível **L03 — "flapping cart"**, reaproveitando o carregador de níveis tipado.
3. Preparar um roteiro curto de *playtest* para iniciar a calibração de dificuldade da Etapa 4.
