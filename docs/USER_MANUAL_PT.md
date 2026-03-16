# Tidslinjal Manual do Utilizador

**Versão 6.1.0**

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Primeiros passos](#2-primeiros-passos)
3. [A interface](#3-a-interface)
4. [Navegar na linha temporal](#4-navegar-na-linha-temporal)
5. [Eventos](#5-eventos)
6. [Fluxo de estado dos eventos](#6-fluxo-de-estado-dos-eventos)
7. [Comentários](#7-comentários)
8. [Camadas](#8-camadas)
9. [Alarmes e notificações](#9-alarmes-e-notificações)
10. [Exercício e tempo sintético](#10-exercício-e-tempo-sintético)
11. [Fases do exercício](#11-fases-do-exercício)
12. [Bloqueio de intervalos de tempo](#12-bloqueio-de-intervalos-de-tempo)
13. [Funções e permissões](#13-funções-e-permissões)
14. [Definições](#14-definições)
15. [Exportação e relatórios](#15-exportação-e-relatórios)
16. [Vista de administração](#16-vista-de-administração)
17. [Relógios, contagens decrescentes e cronómetros](#17-relógios-contagens-decrescentes-e-cronómetros)
18. [Registo de decisões](#18-registo-de-decisões)
19. [Diário de bordo](#19-diário-de-bordo)
20. [Gestão de recursos](#20-gestão-de-recursos)
21. [Projeção cartográfica](#21-projeção-cartográfica)
22. [Janelas destacáveis](#22-janelas-destacáveis)
23. [Integrações e conectores](#23-integrações-e-conectores)
24. [Modelos](#24-modelos)
25. [Atalhos de teclado e rato](#25-atalhos-de-teclado-e-rato)
26. [Resolução de problemas](#26-resolução-de-problemas)
27. [Referências e biblioteca de documentos](#27-referências-e-biblioteca-de-documentos)
28. [Acessibilidade](#28-acessibilidade)
29. [Predefinições da área de trabalho](#29-predefinições-da-área-de-trabalho)

---

## 1. Visão geral

**Tidslinjal** é uma ferramenta colaborativa de linha temporal operacional baseada na web, destinada a equipas geograficamente distribuídas. Proporciona uma cronologia visual partilhada de eventos para planeamento de operações, coordenação e consciência situacional — incluindo suporte para exercícios militares e de emergência com tempo sintético.

Funcionalidades principais:
- Linha temporal partilhada com múltiplos utilizadores e acesso baseado em funções
- Gestão do ciclo de vida de eventos com fluxo de aprovação
- Camadas nomeadas para separar fluxos de atividade
- Suporte a exercícios com STARTEX/ENDEX e tempo sintético "Dia N / T+T"
- Notificações de alarme em tempo real via Server-Sent Events
- Exportação para ICS, JSON e CSV
- Formato de data militar DTG (Date-Time Group)
- Modo de alto contraste e paletas adaptadas a daltonismo
- Suporte para o idioma finlandês (Suomi)
- Gestão de documentos de referência com somas de verificação
- Predefinições da área de trabalho

---

## 2. Primeiros passos

### Iniciar sessão

Aceda a `http://<servidor>:<porta>` (predefinição: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Utilizador: [admin          ]  │
│  Palavra-passe: [••••••••••••]  │
│                                 │
│       [ Iniciar sessão ]        │
└─────────────────────────────────┘
```

Credenciais predefinidas: `admin` / `admin`

> **Nota de segurança:** Altere a palavra-passe de administrador imediatamente após o primeiro início de sessão utilizando o botão 🔑 no canto superior direito.

### Autorregisto

Se o administrador tiver ativado o autorregisto, a ligação **"Não tem conta? Registe-se"** é apresentada na página de início de sessão. Existem quatro modos de registo:

| Modo | Descrição |
|---|---|
| **Aberto** | Qualquer pessoa pode registar-se; a conta é ativada imediatamente |
| **Revisto** | Qualquer pessoa pode registar-se; o administrador tem de aprovar a conta antes de permitir o início de sessão |
| **Convite geral** | O registo requer um código de convite partilhado fornecido pelo administrador |
| **Convite pessoal** | O registo requer um código pessoal de utilização única gerado pelo administrador por utilizador |

### Reposição da palavra-passe

Se registou um endereço de correio eletrónico no seu perfil:

1. Clique em **Esqueceu a palavra-passe?** na página de início de sessão
2. Introduza o seu nome de utilizador ou endereço de correio eletrónico
3. É gerado um token de reposição (apresentado no ecrã se nenhum servidor de correio eletrónico estiver configurado)
4. Clique em **Repor palavra-passe**, cole o token e escolha uma nova palavra-passe

### Alterar palavra-passe

Clique no botão **🔑** no cabeçalho. Introduza a sua palavra-passe atual e, em seguida, a nova palavra-passe duas vezes.

---

## 3. A interface

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Hoje] [›] [⏱]  Vista: [Semana▼]  Res.: [Hora▼]   │
│             [🔍 Pesquisar…] [🗂 Camadas] [⬇ Exportar] [📄 Relatório]  │
│                        [👤 Nome  função] [?][🔑][☰] [Terminar sessão] │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  PAINEL LATERAL │
│               GRELHA DA LINHA TEMPORAL             │                 │
│  Hora │  Seg 01  │  Ter 02  │  Qua 03  │  ...     │  [Legenda]      │
│ ──────┼──────────┼──────────┼──────────┤          │  [Alarmes]      │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │          │  [Camadas]      │
│ 09:00 │          │ Revisão  │          │          │  [Definições]   │
│ 10:00 │ ████████ │          │          │          │                 │
│       │ Stand-up │          │          │          │                 │
│ 11:00 │          │          │ ████████ │          │                 │
│       │          │          │ ENDEX    │          │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Cabeçalho** — navegação, seleção de vista, pesquisa e controlos do utilizador.

**Grelha da linha temporal** — dias da esquerda para a direita, horas de cima para baixo. Os eventos são apresentados como blocos coloridos.

**Painel lateral** — separadores Legenda, Alarmes, Camadas, Utilizadores (admin), Grupos (admin), Registo de auditoria (Chefe de equipa+), Fases (Chefe de equipa+), Definições. Alterne com o botão ☰.

---

## 4. Navegar na linha temporal

### Navegação por data

| Controlo | Ação |
|---|---|
| Botões **‹** / **›** | Avançar / retroceder um intervalo de visualização |
| Botão **Hoje** | Saltar para hoje |
| Botão **⏱** | Deslocar a grelha para a hora atual |

### Intervalo de visualização

Utilize o menu pendente **Vista** na barra de ferramentas:

```
Vista: [Dia ▼]
        Dia
        2 Dias
        3 Dias
        4 Dias
      ▶ Semana
        Mês
        2 Meses
        3 Meses
```

### Resolução (altura do intervalo)

Utilize o menu pendente **Resolução**:

```
Resolução: [Hora ▼]
            10 min
            15 min
          ▶ Hora
            Dia
```

### Zoom

**Arrastar para ampliar** — clique e arraste para cima/baixo na coluna de tempo (margem esquerda) para aumentar ou diminuir a altura do intervalo. Arraste **para cima** para ampliar, **para baixo** para reduzir.

**Duplo clique** na coluna de tempo para repor o zoom para 1×.

Teclado: **+** / **-** para ampliar/reduzir em incrementos.

### Deslocação horizontal

Clique com o botão do meio e arraste na área da linha temporal para deslocar para a esquerda/direita.

---

## 5. Eventos

### Criar um evento

Clique numa célula vazia na grelha da linha temporal ou clique em **+ Adicionar evento** no cabeçalho.

```
┌─────────────────────── Adicionar evento ──────────────────────────┐
│ Título *  [                                                      ]  │
│                                                                      │
│ Tipo      [Atividade        ▼]   Cor   [■]                          │
│                                                                      │
│ Início *  [2025-06-01T10:00]    Fim    [2025-06-01T11:00]           │
│                                                                      │
│ Camada   [Linha principal  ▼]  Estado  [Planeado          ▼]       │
│                                                                      │
│ Descrição                                                            │
│ [                                                                ]   │
│                                                                      │
│ Participantes  [—  ▼]   ☐ Evento diário (sem hora específica)       │
│                                                                      │
│ ☐ Recorrente    Padrão [Semanal ▼]                                  │
│ Data de fim  [               ]                                       │
│                                                                      │
│ Anexo 📎 [Escolher ficheiro]                                         │
│                                                                      │
│              [Cancelar]   [Guardar]                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Tipos de evento

Cada tipo de evento possui um bloco colorido e um ícone apresentado à **esquerda** do título do evento.

| Ícone | Tipo | Cor | Notas |
|---|---|---|---|
| — | **Evento** | Azul | Ocorrência genérica |
| ⚡ | **Instante** | Laranja | Ponto único no tempo — sem hora de fim. Representado como um marcador ◆ em losango. |
| 🤝 | **Reunião** | Cinzento | Reunião agendada |
| 🏢 | **Reunião presencial** | Laranja queimado | Reunião presencial num local específico |
| ⚖️ | **Decisão** | Verde | Ponto de decisão |
| ⏰ | **Prazo** | Vermelho | Prazo limite rígido |
| — | **Atividade** | Verde | Bloco de trabalho |
| 🔄 | **Repetitivo** | Roxo | Modelo para atividades recorrentes |
| 📊 | **Relatório** | Azul-petróleo | Relatório ou revisão |
| 📌 | **Tarefa atribuída** | Laranja | Tarefa atribuída a uma pessoa ou equipa |
| 🧍 | **Standup diário** | Ciano | Breve reunião diária de estado |

O ícone ↻ (à esquerda do título) indica que o evento faz parte de uma **série recorrente**. Os tipos personalizados podem ter um ícone emoji próprio definido em **Definições → Tipos de evento → Editar**.

Ative/desative todos os ícones globalmente em **Definições → Ícones de evento**.

Os tipos personalizados podem ser adicionados por utilizadores com Leitura/Escrita+ a partir do painel de definições.

### Eventos instantâneos

Quando **Instante** é selecionado como tipo:
- O campo **Fim** é ocultado (sem duração)
- O evento é representado como um marcador vertical estreito com um losango ◆ no topo
- Não pode ser configurado como recorrente

### Eventos diários

Marque **Evento diário (sem hora específica)** para um evento que abrange o dia inteiro:
- Os campos de hora de início/fim são ocultados
- O evento é apresentado na zona cinzenta fora das horas de trabalho
- A repetição não está disponível para eventos diários

### Participantes

O campo **Participantes** indica se a atividade envolve partes internas ou externas:

| Valor | Etiqueta | Cor |
|---|---|---|
| — | nenhuma | — |
| **Interno** | `INTERNO` | Azul-petróleo |
| **Externo** | `EXTERNO` | Vermelho |

### Eventos recorrentes

Marque **Recorrente** e, em seguida, selecione um padrão:

| Padrão | Intervalo |
|---|---|
| A cada 30 minutos | 30 minutos |
| De hora em hora | 1 hora |
| A cada 2 / 3 / 4 horas | 2 / 3 / 4 horas |
| Diariamente | 1 dia |
| Semanalmente | 7 dias |
| Mensalmente | ~1 mês |
| Trimestralmente | ~3 meses |

### Editar e eliminar eventos

Clique num bloco de evento para abrir a vista de detalhes. Clique em **Editar** para modificar. Clique em **Eliminar** (visível para o criador e administradores) para remover.

---

## 6. Fluxo de estado dos eventos

Cada evento possui um estado que progride ao longo de um ciclo de vida:

```
planeado ──► ativo ──► respondido ──► concluído ──► submetido
                                                        │
                                             ┌──────────┤
                                             ▼          ▼
                                         verificado  rejeitado
                                                        │
                                                  (motivo obrigatório)
```

`cancelado` está disponível em qualquer fase.

### Transições

| De → Para | Quem pode atuar |
|---|---|
| Qualquer → qualquer (exceto verificar/rejeitar) | Criador, Chefe de equipa+ |
| respondido | Relator, Criador, Chefe de equipa+ |
| submetido → verificado | Chefe de equipa+ (regista quem e quando) |
| submetido → rejeitado | Chefe de equipa+ (requer motivo de rejeição) |

### A função de Relator

Os utilizadores com a função **Relator** podem:
- Publicar comentários em eventos
- Definir o estado como `respondido` ou `concluído` (requer aprovação do Chefe de equipa)

---

## 7. Comentários

Clique num bloco de evento para abrir a vista de detalhes. Desloque-se até **Comentários**.

- Todos os utilizadores autenticados podem ler comentários
- Utilizadores com Leitura/Escrita+ podem publicar comentários
- Relatores podem publicar comentários; comentários que alteram o estado requerem aprovação
- Chefes de equipa+ podem aprovar ou eliminar comentários pendentes

---

## 8. Camadas

As camadas são sobreposições nomeadas sobre a linha principal. Permitem que diferentes equipas tenham faixas de eventos separadas com uma vista comum.

### Criar uma camada

1. Abra o separador **Camadas** no painel lateral ou clique em **🗂 Camadas** na barra de ferramentas
2. Clique em **+ Nova camada**
3. Introduza o nome, cor, descrição, visibilidade e permissões

```
┌──────── Nova camada ──────────┐
│ Nome *   [Equipa Ciber      ]  │
│ Cor      [■ #9B59B6         ]  │
│ Descrição [                  ] │
│                                │
│ Visibilidade [Grupos      ▼]   │
│ Permissão    [Leitura/Escrita ▼] │
│ Grupos       ☐ Alpha  ☐ Bravo │
│                                │
│         [Cancelar]  [Guardar]  │
└────────────────────────────────┘
```

### Visibilidade

| Definição | Quem pode ver a camada |
|---|---|
| **Privada** | Apenas o proprietário |
| **Grupos** | Proprietário + membros dos grupos selecionados |
| **Pública** | Todos os utilizadores autenticados |

### Alternar camadas

Clique em **🗂 Camadas** na barra de ferramentas para abrir a caixa de alternância rápida. Clique num item para o alternar. Várias camadas podem estar ativas em simultâneo — marque as caixas de seleção das camadas que pretende ver.

---

## 9. Alarmes e notificações

### Definir um alarme

1. Clique num bloco de evento para abrir a vista de detalhes
2. Clique em **🔔 Definir alarme**
3. Selecione a antecedência (no momento, 5/10/15/30 min, ou 1 hora antes)

### Notificações de alarme

Quando um alarme é acionado, é apresentado um painel de notificação no topo do ecrã:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarme — "Revisão ENDEX" em 15 minutos (10:45)                    │
│                    [Fechar] [📋 Ver evento] [✓ ACK]                  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Fechar** — remove a notificação sem confirmação.
- **📋 Ver evento** — abre a vista de detalhes do evento diretamente a partir do alarme.
- **✓ ACK** — confirma o alarme e interrompe a escalada.
- Botão **Ir para reunião** — se o evento for uma reunião com URL (Teams/Zoom), é apresentado um botão na notificação do alarme que abre a reunião diretamente.

Alarmes não confirmados são escalados — ficam laranja e, em seguida, pulsam a vermelho a cada 60 segundos.

### Registo de auditoria de alarmes

Cada confirmação de alarme é registada no **Registo de auditoria** (acessível para Chefes de equipa e superiores). Cada entrada inclui:
- Quem confirmou o alarme (nome de utilizador e ID)
- Quando a confirmação ocorreu (carimbo temporal)
- O endereço IP a partir do qual o sistema foi acedido no momento

### Relógios de múltiplos fusos horários

O cabeçalho apresenta o relógio principal em tempo real. Pode adicionar qualquer número de relógios para outros fusos horários.

**Adicionar um relógio:**
1. Clique no botão **+** à esquerda do relógio principal no cabeçalho.
2. Introduza uma etiqueta curta (p. ex. *Tallinn*, *Kyiv*, *Cabul*).
3. Selecione o fuso horário IANA no menu pendente.
4. Clique em **Adicionar**. O relógio é apresentado imediatamente à esquerda do relógio principal.

**Remover um relógio:** Clique em **×** no widget do relógio, ou aceda a **Definições → Formato de data/hora → Fusos horários adicionais → Remover**.

### Notificações via Webhook

Configure um URL de webhook em **Definições** para receber também notificações de alarme via HTTP POST para Mattermost, Slack ou qualquer endpoint HTTP.

### Separador Alarmes no painel lateral

Visualize e gira todos os seus alarmes ativos a partir do separador **Alarmes** no painel lateral.

---

## 10. Exercício e tempo sintético

Para exercícios de treino, o Tidslinjal suporta um modo de "tempo sintético" que substitui datas reais do calendário por etiquetas de dia/hora do exercício.

### Configuração (apenas administrador)

1. Abra o separador **Definições** no painel lateral
2. Desloque-se até **Definições do exercício**
3. Preencha:
   - **Nome do exercício** — apresentado como uma etiqueta no cabeçalho
   - **STARTEX** — a data e hora reais que correspondem a "Dia 1 T+0"
   - **ENDEX** — a data e hora reais para o fim do exercício
4. Marque **Ativar visualização de tempo sintético**
5. Clique em **Guardar**

### Ativar tempo sintético

O botão **🕐 T+** é apresentado na barra de ferramentas quando o modo de exercício está configurado. Clique para alternar entre a visualização de tempo real e tempo sintético.

### Congelamento da linha temporal

No painel de **Definições**, utilize **Congelar/pausar a linha temporal** para parar o relógio sintético num ponto específico. Clique em **Retomar** para remover o congelamento.

---

## 11. Fases do exercício

Os Chefes de equipa e funções superiores podem definir blocos nomeados e coloridos que abrangem toda a linha temporal para apresentar as fases do exercício.

1. Abra o separador **Fases** no painel lateral
2. Clique em **+ Nova fase**
3. Introduza o nome, cor, hora de início, hora de fim e ordem de apresentação (0–9)

As fases são apresentadas como faixas de cor translúcidas no topo da grelha da linha temporal.

---

## 12. Bloqueio de intervalos de tempo

Os administradores e utilizadores com a flag `pode_bloquear` podem bloquear intervalos de tempo para impedir a criação de eventos.

1. Clique em **🔒 Bloquear intervalo** no cabeçalho (visível para administradores/utilizadores com pode_bloquear)
2. Introduza a hora de início, hora de fim e motivo

Os intervalos bloqueados são apresentados como uma sobreposição com traços vermelhos. Não é possível criar eventos em intervalos bloqueados.

---

## 13. Funções e permissões

| Função | Abreviatura | Capacidades |
|---|---|---|
| **Observador** | `observer` | Acesso apenas de leitura à linha temporal e eventos — não pode editar, comentar ou bloquear |
| **Leitura** | `read` | Ver linha temporal, eventos, camadas; definir alarmes pessoais |
| **Relator** | `reporter` | + Publicar comentários; definir respondido/concluído (com aprovação) |
| **Leitura/Escrita** | `readwrite` | + Criar/editar eventos próprios; criar tipos de evento e camadas |
| **Chefe de equipa** | `teamlead` | + Criar grupos; verificar/rejeitar eventos submetidos; ver registo de auditoria; gerir fases |
| **Chefe de operações** | `oplead` | + Criar/editar/eliminar eventos na linha principal |
| **Assistente de estado-maior** | `staffofficer` | Mesmos direitos que o chefe de operações — designação alternativa para pessoal de estado-maior |
| **Oficial de estado-maior** | `staffofficer_full` | O mesmo que assistente de estado-maior, mas requer pelo menos uma designação J (J1–J9) |
| **Administrador** | `admin` | Acesso total — gerir todos os utilizadores, funções, bloqueios, definições de atividade, registo |

A flag `pode_bloquear` pode ser atribuída a qualquer utilizador independentemente da função.

### Designações J (função de Oficial de estado-maior)

**Oficial de estado-maior** (`staffofficer_full`) requer pelo menos uma designação J da NATO. As designações identificam a área do estado-maior:

| Código | Área |
|---|---|
| J1 | Pessoal |
| J2 | Informações |
| J3 | Operações |
| J4 | Logística |
| J5 | Planeamento |
| J6 | Comunicações |
| J7 | Formação |
| J8 | Finanças |
| J9 | Cooperação civil-militar |

---

## 14. Definições

Abra o separador **Definições** no painel lateral para configurar as suas preferências.

### Tema e visualização

| Definição | Opções |
|---|---|
| **Tema** | Escuro / Claro / City Camo / Urban Camo |
| **Tamanho** | Pequeno / Normal / Grande / Enorme |
| **Idioma** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇫🇮 Suomi |
| **Formato de data/hora** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Formato de hora** | 24h / 12h |
| **Modo de alto contraste** | Ligado / Desligado |
| **Paleta para daltonismo** | Desligado / Protanopia / Deuteranopia / Tritanopia |
| **Vista de entrada predefinida** | Grelha / Lista / Diário de bordo / Decisões / Mapa / Relatórios |
| **Seguir automaticamente agora** | Ligado / Desligado |
| **Intervalo predefinido** | Dia / 3 Dias / Semana / 2 Semanas / Mês |
| **Resolução predefinida** | 10 min / 15 min / Hora / Dia |
| **Semana começa** | Segunda-feira / Domingo |
| **Atraso da dica** | Imediato / 200 ms / 500 ms |
| **Confirmar arrasto** | Ligado / Desligado |
| **Tipo de evento predefinido** | qualquer tipo configurado |
| **Faixa de boas-vindas** | apresentada no primeiro início de sessão |

O idioma também pode ser alterado diretamente com os botões de bandeira (🇬🇧 🇸🇪 🇫🇷 🇫🇮) na barra de ferramentas.

### Formato de data/hora e horas do dia

A secção **Formato de data/hora** agrupa tanto a seleção de formato como a configuração das horas do dia:

| Definição | Descrição |
|---|---|
| **Formato de data** | ISO 8601 / UK / FR / SV |
| **Início do dia** | Primeira hora do dia de trabalho |
| **Fim do dia** | Última hora do dia de trabalho |

Os intervalos fora do início–fim do dia são apresentados a cinzento/tracejados.

### Vista predefinida

Clique num dos botões de intervalo (Dia / 2 Dias / 3 Dias / 4 Dias / Semana) para definir a sua vista predefinida. Alterar isto também muda a vista atual imediatamente.

### Visibilidade dos tipos de evento

Ative/desative tipos de evento individuais. Os tipos ocultos são apresentados esbatidos na linha temporal. Os tipos personalizados podem ser criados com o botão **+ Novo tipo** (Leitura/Escrita+).

### Indicador de momento atual (linha vermelha)

| Definição | Descrição |
|---|---|
| Mostrar / Ocultar | Alternar a linha vermelha |
| Cor | Cor da linha (predefinição: vermelho) |
| Largura | Espessura da linha em pixéis |
| Tipo | Sólida / Tracejada / Pontilhada |
| Etiqueta H+N | Apresentar a etiqueta de hora do exercício na linha |

### Webhook / Notificações

Introduza um URL de webhook para receber notificações de alarme como pedidos HTTP POST:
- **Mattermost** — payload `{"text": "..."}`
- **Slack** — payload `{"text": "..."}`
- **Genérico** — payload JSON completo do alarme

Clique em **Testar** para enviar uma notificação de teste.

---

## 15. Exportação e relatórios

### Exportação

Clique em **⬇ Exportar** na barra de ferramentas para abrir a janela de exportação:

| Formato | Conteúdo |
|---|---|
| **ICS** | Eventos na vista atual como iCalendar; importar em qualquer aplicação de calendário |
| **JSON** | Exportação completa do sistema (todos os eventos, utilizadores, grupos, camadas, definições) — apenas administrador |
| **CSV** | Eventos na vista atual como folha de cálculo separada por vírgulas |

### Relatórios

Clique em **📄 Relatório** para abrir o gerador de relatórios:

| Tipo de relatório | Descrição |
|---|---|
| **Revisão pós-ação (AAR)** | Resumo de eventos agrupados por estado |
| **Imagem da linha temporal** | Lista cronológica de todos os eventos no intervalo |
| **Atividade por camada** | Eventos discriminados por camada |

Selecione **HTML** para ver no navegador, ou **Imprimir/PDF** para imprimir ou guardar como PDF.

---

## 16. Vista de administração

Navegue para `/admin-view` (requer a função **Administrador**) para um painel de administração dedicado.

---

## 17. Relógios, contagens decrescentes e cronómetros

### Relógios de fuso horário
O relógio no cabeçalho apresenta a hora local em tempo real. Clique em **+** para adicionar fusos horários adicionais para equipas distribuídas. Clique em **⧉** para destacar todos os relógios numa janela separada.

### Ecrã VCR de sete segmentos
Os relógios são apresentados em estilo retro VCR com ecrã de sete segmentos. As cores e a espessura dos segmentos podem ser configuradas.

### Contagem decrescente
Crie contagens decrescentes que contam até um tempo-alvo:
- Clique em **+ Contagem decrescente** na barra de ferramentas dos relógios
- Defina o tempo-alvo ou selecione a partir da hora de início/fim de um evento
- A contagem decrescente apresenta o tempo restante com um **indicador de progresso**
- Um alarme é acionado quando a contagem atinge zero
- Clique em **ACK** para confirmar

### Cronómetros
Crie cronómetros que contam para cima:
- Clique em **+ Cronómetro** na barra de ferramentas dos relógios
- Configure: duração (horas/minutos/segundos), botões predefinidos (5/10/15/30/60 min)
- Escolha se o cronómetro deve parar ou continuar após o tempo-alvo
- Ative o alarme sonoro ao atingir o alvo
- O cronómetro apresenta um **indicador de progresso** com marcação de tempo excedido

### Seletor de cores
A barra de ferramentas dos relógios contém seletores de cores:
| Seletor | Controla |
|---|---|
| **BG** | Cor de fundo |
| **CD** | Cor de destaque da contagem decrescente |
| **TM** | Cor de destaque do cronómetro |

---

## 18. Registo de decisões
O registo de decisões proporciona um acompanhamento estruturado das decisões tomadas durante operações ou exercícios.

### Criar uma decisão
1. Clique em **+ Nova decisão**
2. Preencha o título, descrição, estado e responsável
3. Anexe ficheiros se necessário
4. Clique em **Guardar**

### Estado da decisão
| Estado | Descrição |
|---|---|
| **Proposta** | Decisão foi apresentada |
| **Aprovada** | Decisão foi aprovada |
| **Rejeitada** | Decisão foi rejeitada |

---

## 19. Diário de bordo
O diário de bordo proporciona um registo cronológico de eventos operacionais, observações e notas.
- Abra o **Diário de bordo** a partir do painel lateral (separador Registos)
- Clique em **+ Nova entrada** para adicionar uma entrada no diário
- As entradas são carimbadas com data/hora e associadas ao criador

---

## 20. Gestão de recursos
Gira recursos operacionais (salas, edifícios, serviços de TI, centros de dados) a partir do painel lateral.

### Tipos de recurso
| Tipo | Descrição |
|---|---|
| **Salas** | Salas de reunião, centros de operações |
| **Edifícios** | Edifícios e instalações físicas |
| **Serviços de TI** | Infraestrutura de TI, servidores, redes |
| **Centros de dados** | Instalações de centros de dados |

### Criar um recurso
1. Abra o separador **Recursos** no painel lateral
2. Selecione o tipo de recurso
3. Clique em **+ Adicionar**
4. Preencha o nome, descrição, localização (lat/lng), imagem e símbolo
5. Clique em **Guardar**

---

## 21. Projeção cartográfica
A projeção cartográfica proporciona uma vista geográfica interativa de reuniões, utilizadores e recursos.

- **Camadas do mapa** — alterne entre OpenStreetMap, Topográfico, Satélite e Escuro
- **Sobreposição de recursos** — mostrar/ocultar salas, edifícios, serviços de TI e centros de dados
- **Pesquisa de endereço** — geocodifique um endereço e amplie para a localização
- **Seletor de símbolos** — selecione símbolos cartográficos militares e operacionais para recursos e eventos
- **Importação GeoJSON/KML** — carregue ficheiros de dados geográficos externos
- **Ajustar todos** — zoom automático para apresentar todos os marcadores visíveis

---

## 22. Janelas destacáveis
Várias vistas podem ser destacadas para janelas de navegador separadas:
| Janela | Descrição |
|---|---|
| **Relógios** | Todos os relógios, contagens decrescentes e cronómetros |
| **Painel lateral** | Painel lateral completo com todos os separadores |
| **Registo de decisões** | Vista do registo de decisões |
| **Projeção cartográfica** | Mapa interativo com todas as sobreposições |

O tema, idioma e dados são sincronizados automaticamente via BroadcastChannel.

---

## 23. Integrações e conectores

### Enquadramento de integrações
O separador Integrações (Admin/Chefe de operações) disponibiliza:
- **OIDC SSO** — configuração de Single Sign-On
- **Correio SMTP** — correio eletrónico de saída para alarmes e relatórios
- **Microsoft Teams** — integração via webhook
- **Zoom** — integração de ligação para reuniões
- **Chaves de API** — gerar tokens bearer

### Conectores de eventos
| Conector | Descrição |
|---|---|
| **STIX/TAXII** | Importar feeds de informações sobre ciberameaças |
| **Syslog** | Receber mensagens syslog como eventos |

---

## 24. Modelos
Guarde e reutilize conjuntos de eventos, fases, bloqueios, grupos e camadas:
- **Guardar** — selecione o intervalo de datas; os eventos são armazenados com offsets relativos
- **Aplicar** — introduza STARTEX/T=0; todos os eventos são recriados; camadas por evento são suportadas
- **Importar** — carregue ficheiros de modelo `.json`
- 31 modelos de exemplo incluídos: 20 modelos de exercício e 11 modelos de incidente

---

## 25. Atalhos de teclado e rato

### Rato

| Ação | Resultado |
|---|---|
| Clicar numa célula de tempo vazia | Abrir Adicionar evento nesse momento |
| Clicar num bloco de evento | Abrir detalhes do evento |
| Arrastar bloco de evento | Reagendar para o intervalo de destino |
| Arrastar coluna de tempo | Ampliar altura do intervalo (cima = ampliar) |
| Duplo clique na coluna de tempo | Repor zoom para 1× |
| Arrastar com botão do meio na linha temporal | Deslocar horizontalmente |

### Teclado

| Tecla | Ação |
|---|---|
| `←` / `→` | Navegar para trás / para a frente um intervalo |
| `T` | Saltar para hoje |
| `N` | Deslocar para a hora atual |
| `E` | Abrir a caixa de diálogo Adicionar evento |
| `?` ou `H` | Abrir ajuda integrada |
| `Esc` | Fechar a janela modal atual |
| `+` / `-` | Ampliar/reduzir altura do intervalo |
| `F` | Congelar / retomar tempo sintético |

---

## 26. Resolução de problemas

### Não consigo iniciar sessão
- Verifique o nome de utilizador e a palavra-passe (predefinição: `admin` / `admin`)
- Certifique-se de que o servidor está em execução: `./tidslinjal --port 8080`
- Verifique o registo do servidor para erros

### Os eventos não aparecem
- Verifique o intervalo de datas em **Vista** — poderá estar a visualizar um intervalo que não inclui os seus eventos
- Verifique os filtros de **Camadas** — clique em 🗂 e certifique-se de que as camadas corretas estão ativas
- Verifique a **Visibilidade dos tipos de evento** em Definições — os tipos ocultos não são apresentados

### O alarme não é acionado
- SSE requer uma ligação persistente do navegador — certifique-se de que a página está aberta
- Verifique se as notificações do navegador estão permitidas para o sítio web
- Verifique a antecedência do alarme: com 0 min, o alarme é acionado exatamente na hora de início do evento

### A alternância de camadas não funciona
- Clique em **🗂 Camadas** na barra de ferramentas
- Selecione **Linha principal** para ver todas as camadas
- Ou selecione camadas individuais para filtrar

### A exportação gera um ficheiro vazio
- Certifique-se de que existem eventos no intervalo de visualização atual
- Ajuste o intervalo de **Vista** para incluir os eventos pretendidos

### O diretório de dados não tem permissão de escrita
- Certifique-se de que o diretório `data/` existe e tem permissão de escrita para o processo do servidor
- Utilize `--data /caminho/para/diretorio/com/escrita` ou defina a variável de ambiente `DATA_DIR`

---

## 27. Referências e biblioteca de documentos

A biblioteca de referências permite gerir documentos e ligações associados a operações e exercícios.

### Carregar referências

Carregue referências como ficheiro, URL ou texto local. O sistema suporta carregamento em massa (vários ficheiros em simultâneo) e deteção automática do tipo de ficheiro.

### Metadados de referência

Cada referência possui os seguintes metadados:

| Campo | Descrição |
|---|---|
| **Título** | Nome da referência |
| **Descrição** | Breve resumo |
| **Categoria** | Classificação (ver abaixo) |
| **Etiquetas** | Etiquetas de texto livre para pesquisa |
| **Idioma** | Idioma do documento |
| **Proprietário** | Pessoa responsável |
| **Curador** | Pessoa que mantém o documento |
| **Modo de cópia** | Como o documento é armazenado (ver abaixo) |

### Categorias

| Categoria |
|---|
| Manual |
| SOP |
| Política |
| Mapa |
| Referência |
| Lista de verificação |
| FAQ |
| Objetivo |
| Outros |

### Modos de cópia

| Modo | Descrição |
|---|---|
| **Cópia central** | O ficheiro é armazenado centralmente no servidor |
| **Cópia local** | O ficheiro é armazenado localmente no utilizador |
| **Ver ligação** | Sem cópia — apenas uma ligação para a fonte original |

### Editar metadados de referência

Clique numa referência para abrir a vista de detalhes. Clique em **Editar** para alterar os metadados.

### Somas de verificação criptográficas

O sistema calcula automaticamente somas de verificação criptográficas para ficheiros carregados:

| Algoritmo |
|---|
| MD5 |
| SHA-1 |
| SHA-256 |
| SHA-512 |

Clique em **Ver somas de verificação** para abrir a janela de somas de verificação com todos os valores calculados.

### Pesquisa e filtragem

Utilize o campo de pesquisa e os filtros de categoria para encontrar referências. Filtre por categoria, etiquetas e texto livre.

---

## 28. Acessibilidade

### Modo de alto contraste

O modo de alto contraste pode ser sobreposto a qualquer tema e reforça a visibilidade de:
- Linhas da grelha
- Marcadores de tempo
- Faixas de fase
- Sobreposições de bloqueio
- Eventos selecionados

Ative em **Definições → Tema e visualização → Modo de alto contraste**.

### Paletas para daltonismo

Estão disponíveis três paletas para daltonismo:

| Paleta | Tipo |
|---|---|
| **Protanopia** | Daltonismo vermelho-verde |
| **Deuteranopia** | Daltonismo verde-vermelho |
| **Tritanopia** | Daltonismo azul-amarelo |

Ative em **Definições → Tema e visualização → Paleta para daltonismo**.

O modo de alto contraste e as paletas para daltonismo podem ser ativados em simultâneo.

---

## 29. Predefinições da área de trabalho

Guarde e restaure predefinições nomeadas da área de trabalho para acesso rápido às suas vistas mais utilizadas.

### Guardar uma predefinição

Uma predefinição guarda as seguintes definições:
- Vista (grelha, lista, diário de bordo, decisões, mapa, relatórios)
- Intervalo
- Resolução
- Nível de zoom
- Camadas ocultas
- Separador do painel lateral

### Carregar uma predefinição

Clique numa predefinição guardada para aplicar imediatamente todas as definições guardadas com um clique.

### Eliminar uma predefinição

Clique em **Eliminar** junto a uma predefinição para a apagar.

---

*Tidslinjal v6.1.0 — Linha temporal operacional colaborativa*
