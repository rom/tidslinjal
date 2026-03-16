# Tidslinjal Manuale Utente

**Versione 6.1.0**

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Per iniziare](#2-per-iniziare)
3. [Interfaccia](#3-interfaccia)
4. [Navigare la timeline](#4-navigare-la-timeline)
5. [Eventi](#5-eventi)
6. [Flusso di stato degli eventi](#6-flusso-di-stato-degli-eventi)
7. [Commenti](#7-commenti)
8. [Livelli](#8-livelli)
9. [Allarmi e notifiche](#9-allarmi-e-notifiche)
10. [Esercitazione e tempo sintetico](#10-esercitazione-e-tempo-sintetico)
11. [Fasi dell'esercitazione](#11-fasi-dellesercitazione)
12. [Blocco delle fasce orarie](#12-blocco-delle-fasce-orarie)
13. [Ruoli e permessi](#13-ruoli-e-permessi)
14. [Impostazioni](#14-impostazioni)
15. [Esportazione e rapporti](#15-esportazione-e-rapporti)
16. [Vista amministratore](#16-vista-amministratore)
17. [Orologi, conto alla rovescia e cronometri](#17-orologi-conto-alla-rovescia-e-cronometri)
18. [Registro delle decisioni](#18-registro-delle-decisioni)
19. [Diario operativo](#19-diario-operativo)
20. [Gestione risorse](#20-gestione-risorse)
21. [Proiezione cartografica](#21-proiezione-cartografica)
22. [Finestre staccabili](#22-finestre-staccabili)
23. [Integrazioni e connettori](#23-integrazioni-e-connettori)
24. [Modelli](#24-modelli)
25. [Scorciatoie da tastiera e mouse](#25-scorciatoie-da-tastiera-e-mouse)
26. [Risoluzione dei problemi](#26-risoluzione-dei-problemi)
27. [Riferimenti e biblioteca documenti](#27-riferimenti-e-biblioteca-documenti)
28. [Accessibilità](#28-accessibilità)
29. [Preset dello spazio di lavoro](#29-preset-dello-spazio-di-lavoro)

---

## 1. Panoramica

**Tidslinjal** è uno strumento collaborativo basato sul web per la gestione di timeline operative, progettato per team geograficamente distribuiti. Fornisce una cronologia visiva condivisa degli eventi per la pianificazione operativa, il coordinamento e la consapevolezza situazionale — incluso il supporto per esercitazioni militari e di emergenza con tempo sintetico.

Funzionalità principali:
- Timeline condivisa multi-utente con accesso basato sui ruoli
- Gestione del ciclo di vita degli eventi con flusso di approvazione
- Livelli nominati per separare i flussi di attività
- Supporto esercitazioni con STARTEX/ENDEX e tempo sintetico "Giorno N / T+T"
- Notifiche di allarme in tempo reale tramite Server-Sent Events
- Esportazione in ICS, JSON e CSV
- Formato data militare DTG (Date-Time Group)
- Modalità ad alto contrasto e palette adattate ai daltonici
- Supporto lingua finlandese (Suomi)
- Gestione documenti di riferimento con checksum
- Preset dello spazio di lavoro

---

## 2. Per iniziare

### Accesso

Navigare a `http://<server>:<porta>` (predefinito: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Nome utente: [admin          ] │
│  Password:    [••••••••••••••]  │
│                                 │
│         [ Accedi ]              │
└─────────────────────────────────┘
```

Credenziali predefinite: `admin` / `admin`

> **Nota di sicurezza:** Cambiare immediatamente la password dell'amministratore dopo il primo accesso utilizzando il pulsante 🔑 nell'angolo in alto a destra.

### Autoregistrazione

Se l'amministratore ha abilitato l'autoregistrazione, il link **"Nessun account? Registrati"** viene visualizzato nella pagina di accesso. Esistono quattro modalità di registrazione:

| Modalità | Descrizione |
|---|---|
| **Aperta** | Chiunque può registrarsi; l'account viene attivato immediatamente |
| **Revisionata** | Chiunque può registrarsi; l'admin deve approvare l'account prima di consentire l'accesso |
| **Invito generale** | La registrazione richiede un codice di invito condiviso fornito dall'admin |
| **Invito personale** | La registrazione richiede un codice monouso personale generato dall'admin per ogni utente |

### Reimpostazione della password

Se hai registrato un indirizzo e-mail nel tuo profilo:

1. Clicca su **Password dimenticata?** nella pagina di accesso
2. Inserisci il tuo nome utente o indirizzo e-mail
3. Viene generato un token di reimpostazione (visualizzato sullo schermo se nessun server e-mail è configurato)
4. Clicca su **Reimposta password**, incolla il token e scegli una nuova password

### Cambio password

Clicca sul pulsante **🔑** nell'intestazione. Inserisci la password attuale e poi la nuova password due volte.

---

## 3. Interfaccia

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Oggi] [›] [⏱]  Vista: [Sett.▼]  Risol.: [Ora▼]  │
│             [🔍 Cerca…] [🗂 Livelli] [⬇ Esporta] [📄 Rapporto]      │
│                          [👤 Nome  ruolo] [?][🔑][☰] [Esci]         │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  PANNELLO LAT.  │
│                  GRIGLIA TIMELINE                  │                 │
│  Ora   │  Lun 01  │  Mar 02  │  Mer 03  │  ...    │  [Legenda]      │
│ ───────┼──────────┼──────────┼──────────┤         │  [Allarmi]      │
│ 08:00  │          │ ▓▓▓▓▓▓▓▓ │          │         │  [Livelli]      │
│ 09:00  │          │ Riepilog.│          │         │  [Impostazioni] │
│ 10:00  │ ████████ │          │          │         │                 │
│        │ Stand-up │          │          │         │                 │
│ 11:00  │          │          │ ████████ │         │                 │
│        │          │          │ ENDEX    │         │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Intestazione** — navigazione, selezione vista, ricerca e controlli utente.

**Griglia timeline** — giorni da sinistra a destra, orari dall'alto in basso. Gli eventi appaiono come blocchi colorati.

**Pannello laterale** — schede Legenda, Allarmi, Livelli, Utenti (admin), Gruppi (admin), Registro di audit (Capo team+), Fasi (Capo team+), Impostazioni. Attivare/disattivare con il pulsante ☰.

---

## 4. Navigare la timeline

### Navigazione per data

| Controllo | Azione |
|---|---|
| Pulsanti **‹** / **›** | Avanzare indietro / avanti di un intervallo di visualizzazione |
| Pulsante **Oggi** | Saltare alla data odierna |
| Pulsante **⏱** | Scorrere la griglia all'ora corrente |

### Intervallo di visualizzazione

Usare il menu a tendina **Vista** nella barra degli strumenti:

```
Vista: [Giorno ▼]
        Giorno
        2 Giorni
        3 Giorni
        4 Giorni
      ▶ Settimana
        Mese
        2 Mesi
        3 Mesi
```

### Risoluzione (altezza delle fasce)

Usare il menu a tendina **Risoluzione**:

```
Risoluzione: [Ora ▼]
              10 min
              15 min
            ▶ Ora
              Giorno
```

### Zoom

**Trascinare per zoomare** — cliccare e trascinare verso l'alto/basso sulla colonna del tempo (bordo sinistro) per aumentare o diminuire l'altezza delle fasce. Trascinare **verso l'alto** per ingrandire, **verso il basso** per rimpicciolire.

**Doppio clic** sulla colonna del tempo per reimpostare lo zoom a 1×.

Tastiera: **+** / **-** per ingrandire/rimpicciolire a passi.

### Scorrimento orizzontale

Clic centrale e trascinamento sull'area della timeline per scorrere a sinistra/destra.

---

## 5. Eventi

### Creare un evento

Cliccare su una cella vuota nella griglia della timeline o cliccare **+ Aggiungi evento** nell'intestazione.

```
┌─────────────────────── Aggiungi evento ──────────────────────────────┐
│ Titolo *  [                                                        ]  │
│                                                                       │
│ Tipo      [Attività          ▼]   Colore  [■]                        │
│                                                                       │
│ Inizio *  [2025-06-01T10:00]    Fine  [2025-06-01T11:00]             │
│                                                                       │
│ Livello   [Linea master      ▼]  Stato [Pianificato      ▼]          │
│                                                                       │
│ Descrizione                                                           │
│ [                                                                 ]   │
│                                                                       │
│ Partecipanti  [—  ▼]   ☐ Evento giornaliero (nessun orario)         │
│                                                                       │
│ ☐ Ricorrente    Schema [Settimanale ▼]                               │
│ Data fine  [               ]                                          │
│                                                                       │
│ Allegato 📎 [Scegli file]                                             │
│                                                                       │
│              [Annulla]   [Salva]                                      │
└───────────────────────────────────────────────────────────────────────┘
```

### Tipi di evento

Ogni tipo di evento ha un blocco colorato e un'icona visualizzata a **sinistra** del titolo dell'evento.

| Icona | Tipo | Colore | Note |
|---|---|---|---|
| — | **Evento** | Blu | Occorrenza generale |
| ⚡ | **Istantaneo** | Arancione | Singolo istante — nessun orario di fine. Visualizzato come un marcatore a ◆ diamante. |
| 🤝 | **Riunione** | Grigio | Riunione programmata |
| 🏢 | **Riunione in presenza** | Arancione bruciato | Riunione fisica in un luogo specifico |
| ⚖️ | **Decisione** | Verde | Punto decisionale |
| ⏰ | **Scadenza** | Rosso | Termine ultimo |
| — | **Attività** | Verde | Blocco di lavoro |
| 🔄 | **Ricorrente** | Viola | Modello per attività ricorrenti |
| 📊 | **Rapporto** | Foglia di tè | Rapporto o riepilogo |
| 📌 | **Compito assegnato** | Arancione | Compito assegnato a una persona o un team |
| 🧍 | **Standup giornaliero** | Ciano | Breve riunione di stato quotidiana |

L'icona ↻ (a sinistra del titolo) indica che l'evento fa parte di una **serie ricorrente**. I tipi personalizzati possono avere un'icona emoji personalizzata impostata tramite **Impostazioni → Tipi di evento → Modifica**.

Attivare/disattivare tutte le icone globalmente in **Impostazioni → Icone evento**.

I tipi personalizzati possono essere aggiunti da utenti con permessi Lettura/Scrittura+ dal pannello delle impostazioni.

### Eventi istantanei

Quando si seleziona **Istantaneo** come tipo:
- Il campo **Fine** viene nascosto (nessuna durata)
- L'evento viene visualizzato come un sottile marcatore verticale con un ◆ diamante in cima
- Non può essere impostato come ricorrente

### Eventi giornalieri

Selezionare **Evento giornaliero (nessun orario)** per un evento che copre l'intera giornata:
- I campi orario di inizio/fine vengono nascosti
- L'evento viene visualizzato nell'area grigia al di fuori delle ore lavorative
- La ricorrenza non è disponibile per gli eventi giornalieri

### Partecipanti

Il campo **Partecipanti** indica se l'attività coinvolge parti interne o esterne:

| Valore | Etichetta | Colore |
|---|---|---|
| — | nessuno | — |
| **Interno** | `INTERNO` | Foglia di tè |
| **Esterno** | `ESTERNO` | Rosso |

### Eventi ricorrenti

Selezionare **Ricorrente**, poi scegliere uno schema:

| Schema | Intervallo |
|---|---|
| Ogni 30 minuti | 30 minuti |
| Ogni ora | 1 ora |
| Ogni 2 / 3 / 4 ore | 2 / 3 / 4 ore |
| Giornaliero | 1 giorno |
| Settimanale | 7 giorni |
| Mensile | ~1 mese |
| Trimestrale | ~3 mesi |

### Modificare e eliminare eventi

Cliccare su un blocco evento per aprire la vista dettagliata. Cliccare **Modifica** per apportare modifiche. Cliccare **Elimina** (visibile per il creatore e gli admin) per rimuovere.

---

## 6. Flusso di stato degli eventi

Ogni evento ha uno stato che progredisce attraverso un ciclo di vita:

```
pianificato ──► attivo ──► risposto ──► concluso ──► inviato
                                                        │
                                             ┌──────────┤
                                             ▼          ▼
                                         verificato  rifiutato
                                                        │
                                                  (motivo richiesto)
```

`annullato` è disponibile in qualsiasi fase.

### Transizioni

| Da → A | Chi può agire |
|---|---|
| Qualsiasi → qualsiasi (eccetto verificare/rifiutare) | Creatore, Capo team+ |
| risposto | Rapportore, Creatore, Capo team+ |
| inviato → verificato | Capo team+ (registra chi e quando) |
| inviato → rifiutato | Capo team+ (richiede motivo del rifiuto) |

### Ruolo del rapportore

Gli utenti con il ruolo **Rapportore** possono:
- Pubblicare commenti sugli eventi
- Impostare lo stato su `risposto` o `concluso` (richiede approvazione del Capo team)

---

## 7. Commenti

Cliccare su un blocco evento per aprire la vista dettagliata. Scorrere fino a **Commenti**.

- Tutti gli utenti autenticati possono leggere i commenti
- Gli utenti con Lettura/Scrittura+ possono pubblicare commenti
- I rapportori possono pubblicare commenti; i commenti che modificano lo stato richiedono approvazione
- I Capi team+ possono approvare o eliminare i commenti in attesa

---

## 8. Livelli

I livelli sono sovrapposizioni nominati sopra la linea master. Permettono a diversi team di avere tracce di eventi separate con una vista comune.

### Creare un livello

1. Aprire la scheda **Livelli** nel pannello laterale o cliccare **🗂 Livelli** nella barra degli strumenti
2. Cliccare **+ Nuovo livello**
3. Inserire nome, colore, descrizione, visibilità e permessi

```
┌──────── Nuovo livello ────────────┐
│ Nome *   [Cyber team           ]  │
│ Colore   [■ #9B59B6            ]  │
│ Descrizione [                   ] │
│                                   │
│ Visibilità  [Gruppi         ▼]    │
│ Permesso    [Lettura/Scrit. ▼]    │
│ Gruppi      ☐ Alpha  ☐ Bravo     │
│                                   │
│         [Annulla]  [Salva]        │
└───────────────────────────────────┘
```

### Visibilità

| Impostazione | Chi può vedere il livello |
|---|---|
| **Privato** | Solo il proprietario |
| **Gruppi** | Proprietario + membri dei gruppi selezionati |
| **Pubblico** | Tutti gli utenti autenticati |

### Commutare i livelli

Cliccare **🗂 Livelli** nella barra degli strumenti per aprire il pannello di commutazione rapida. Cliccare su un elemento per attivarlo/disattivarlo. Più livelli possono essere attivi contemporaneamente — selezionare le caselle dei livelli che si desidera visualizzare.

---

## 9. Allarmi e notifiche

### Impostare un allarme

1. Cliccare su un blocco evento per aprire la vista dettagliata
2. Cliccare **🔔 Imposta allarme**
3. Scegliere il tempo di preavviso (al momento, 5/10/15/30 min, o 1 ora prima)

### Notifiche degli allarmi

Quando un allarme si attiva, un pannello di notifica appare nella parte superiore dello schermo:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Allarme — "Riepilogo ENDEX" tra 15 minuti (10:45)                 │
│                    [Chiudi] [📋 Vedi evento] [✓ ACK]                 │
└──────────────────────────────────────────────────────────────────────┘
```

- **Chiudi** — rimuove la notifica senza conferma.
- **📋 Vedi evento** — apre la vista dettagliata dell'evento direttamente dall'allarme.
- **✓ ACK** — conferma l'allarme e interrompe l'escalation.
- Pulsante **Vai alla riunione** — se l'evento è una riunione con URL (Teams/Zoom), un pulsante nella notifica dell'allarme apre direttamente la riunione.

Gli allarmi non confermati vengono escalati — diventano arancioni, poi rosso lampeggiante ogni 60 secondi.

### Registro di audit degli allarmi

Ogni conferma di allarme viene registrata nel **Registro di audit** (accessibile per Capi team e superiori). Ogni voce include:
- Chi ha confermato l'allarme (nome utente e ID)
- Quando è avvenuta la conferma (timestamp)
- L'indirizzo IP da cui il sistema è stato raggiunto al momento

### Orologi per fusi orari multipli

L'intestazione mostra l'orologio primario in tempo reale. È possibile aggiungere un numero qualsiasi di orologi per altri fusi orari.

**Aggiungere un orologio:**
1. Cliccare sul pulsante **+** a sinistra dell'orologio principale nell'intestazione.
2. Inserire un'etichetta breve (es. *Tallinn*, *Kyiv*, *Kabul*).
3. Selezionare il fuso orario IANA nel menu a tendina.
4. Cliccare **Aggiungi**. L'orologio appare immediatamente a sinistra dell'orologio principale.

**Rimuovere un orologio:** Cliccare **×** sul widget dell'orologio, oppure andare su **Impostazioni → Formato data/ora → Fusi orari aggiuntivi → Rimuovi**.

### Notifiche webhook

Configurare un URL webhook in **Impostazioni** per ricevere anche le notifiche degli allarmi tramite HTTP POST verso Mattermost, Slack o qualsiasi endpoint HTTP.

### Scheda Allarmi nel pannello laterale

Visualizzare e gestire tutti i propri allarmi attivi dalla scheda **Allarmi** nel pannello laterale.

---

## 10. Esercitazione e tempo sintetico

Per le esercitazioni addestrative, Tidslinjal supporta una modalità "tempo sintetico" che sostituisce le date reali del calendario con etichette giorno/ora dell'esercitazione.

### Configurazione (solo admin)

1. Aprire la scheda **Impostazioni** nel pannello laterale
2. Scorrere fino a **Impostazioni esercitazione**
3. Compilare:
   - **Nome esercitazione** — visualizzato come badge nell'intestazione
   - **STARTEX** — la data e l'ora reali corrispondenti a "Giorno 1 T+0"
   - **ENDEX** — la data e l'ora reali per la fine dell'esercitazione
4. Selezionare **Attiva visualizzazione tempo sintetico**
5. Cliccare **Salva**

### Attivare il tempo sintetico

Il pulsante **🕐 T+** appare nella barra degli strumenti quando la modalità esercitazione è configurata. Cliccare per alternare tra visualizzazione tempo reale e sintetico.

### Congelamento della timeline

Nel pannello **Impostazioni**, usare **Congela/pausa la timeline** per fermare l'orologio sintetico a un momento specifico. Cliccare **Riprendi** per rimuovere il congelamento.

---

## 11. Fasi dell'esercitazione

I Capi team e i ruoli superiori possono definire blocchi nominati e colorati che coprono l'intera timeline per visualizzare le fasi dell'esercitazione.

1. Aprire la scheda **Fasi** nel pannello laterale
2. Cliccare **+ Nuova fase**
3. Inserire nome, colore, ora di inizio, ora di fine e ordine di visualizzazione (0–9)

Le fasi vengono visualizzate come bande colorate semi-trasparenti nella parte superiore della griglia della timeline.

---

## 12. Blocco delle fasce orarie

Gli admin e gli utenti con il flag `può_bloccare` possono bloccare intervalli di tempo per impedire la creazione di eventi.

1. Cliccare **🔒 Blocca fascia oraria** nell'intestazione (visibile per admin/utenti può_bloccare)
2. Inserire ora di inizio, ora di fine e motivo

Le fasce orarie bloccate vengono visualizzate come una sovrapposizione a strisce rosse. Gli eventi non possono essere creati nelle fasce orarie bloccate.

---

## 13. Ruoli e permessi

| Ruolo | Abbreviazione | Funzionalità |
|---|---|---|
| **Osservatore** | `observer` | Accesso in sola lettura alla timeline e agli eventi — non può modificare, commentare o bloccare |
| **Lettura** | `read` | Visualizzare timeline, eventi, livelli; impostare allarmi personali |
| **Rapportore** | `reporter` | + Pubblicare commenti; impostare risposto/concluso (con approvazione) |
| **Lettura/Scrittura** | `readwrite` | + Creare/modificare i propri eventi; creare tipi di evento e livelli |
| **Capo team** | `teamlead` | + Creare gruppi; verificare/rifiutare eventi inviati; visualizzare registro di audit; gestire fasi |
| **Capo operazioni** | `oplead` | + Creare/modificare/eliminare eventi sulla linea master |
| **Assistente di stato maggiore** | `staffofficer` | Stessi diritti del capo operazioni — designazione alternativa per il personale di stato maggiore |
| **Ufficiale di stato maggiore** | `staffofficer_full` | Come l'assistente di stato maggiore, ma richiede almeno una designazione J (J1–J9) |
| **Admin** | `admin` | Accesso completo — gestire tutti gli utenti, ruoli, blocchi, impostazioni attività, registrazione |

Il flag `può_bloccare` può essere assegnato a qualsiasi utente indipendentemente dal ruolo.

### Designazioni J (ruolo Ufficiale di stato maggiore)

**Ufficiale di stato maggiore** (`staffofficer_full`) richiede almeno una designazione J NATO. Le designazioni identificano la branca dello stato maggiore:

| Codice | Branca |
|---|---|
| J1 | Personale |
| J2 | Intelligence |
| J3 | Operazioni |
| J4 | Logistica |
| J5 | Pianificazione |
| J6 | Comunicazioni |
| J7 | Addestramento |
| J8 | Finanza |
| J9 | Cooperazione civile-militare |

---

## 14. Impostazioni

Aprire la scheda **Impostazioni** nel pannello laterale per configurare le proprie preferenze.

### Tema e visualizzazione

| Impostazione | Opzioni |
|---|---|
| **Tema** | Scuro / Chiaro / City Camo / Urban Camo |
| **Dimensione** | Piccola / Normale / Grande / Enorme |
| **Lingua** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇫🇮 Suomi |
| **Formato data/ora** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Formato ora** | 24h / 12h |
| **Modalità alto contrasto** | Attiva / Disattiva |
| **Palette daltonici** | Disattiva / Protanopia / Deuteranopia / Tritanopia |
| **Vista predefinita** | Griglia / Lista / Diario / Decisioni / Mappa / Rapporti |
| **Segui automaticamente ora attuale** | Attiva / Disattiva |
| **Intervallo predefinito** | Giorno / 3 Giorni / Settimana / 2 Settimane / Mese |
| **Risoluzione predefinita** | 10 min / 15 min / Ora / Giorno |
| **La settimana inizia** | Lunedì / Domenica |
| **Ritardo tooltip** | Immediato / 200 ms / 500 ms |
| **Conferma spostamento trascinamento** | Attiva / Disattiva |
| **Tipo di evento predefinito** | qualsiasi tipo configurato |
| **Banner di benvenuto** | visualizzato al primo accesso |

La lingua può anche essere cambiata direttamente con i pulsanti bandiera (🇬🇧 🇸🇪 🇫🇷 🇫🇮) nella barra degli strumenti.

### Formato data/ora e ore giornaliere

La sezione **Formato data/ora** raggruppa sia la selezione del formato che la configurazione delle ore giornaliere:

| Impostazione | Descrizione |
|---|---|
| **Formato data** | ISO 8601 / UK / FR / SV |
| **Inizio giornata** | Prima ora della giornata lavorativa |
| **Fine giornata** | Ultima ora della giornata lavorativa |

Le fasce orarie al di fuori di inizio–fine giornata vengono visualizzate in grigio/a strisce.

### Vista predefinita

Cliccare su uno dei pulsanti intervallo (Giorno / 2 Giorni / 3 Giorni / 4 Giorni / Settimana) per impostare la vista predefinita. La modifica cambia anche la vista corrente immediatamente.

### Visibilità dei tipi di evento

Attivare/disattivare i singoli tipi di evento. I tipi nascosti sono attenuati nella timeline. I tipi personalizzati possono essere creati con il pulsante **+ Nuovo tipo** (Lettura/Scrittura+).

### Indicatore ora corrente (linea rossa)

| Impostazione | Descrizione |
|---|---|
| Mostra / Nascondi | Attivare/disattivare la linea rossa |
| Colore | Colore della linea (predefinito rosso) |
| Larghezza | Spessore della linea in pixel |
| Tipo | Solida / Tratteggiata / Punteggiata |
| Etichetta H+N | Mostrare l'etichetta ora dell'esercitazione sulla linea |

### Webhook / Notifiche

Inserire un URL webhook per ricevere notifiche degli allarmi come richieste HTTP POST:
- **Mattermost** — payload `{"text": "..."}`
- **Slack** — payload `{"text": "..."}`
- **Generico** — payload JSON completo dell'allarme

Cliccare **Test** per inviare una notifica di prova.

---

## 15. Esportazione e rapporti

### Esportazione

Cliccare **⬇ Esporta** nella barra degli strumenti per aprire la finestra di esportazione:

| Formato | Contenuto |
|---|---|
| **ICS** | Eventi nella vista corrente come iCalendar; importare in qualsiasi app calendario |
| **JSON** | Esportazione completa del sistema (tutti gli eventi, utenti, gruppi, livelli, impostazioni) — solo admin |
| **CSV** | Eventi nella vista corrente come foglio di calcolo separato da virgole |

### Rapporti

Cliccare **📄 Rapporto** per aprire il generatore di rapporti:

| Tipo di rapporto | Descrizione |
|---|---|
| **Revisione post-azione (AAR)** | Riepilogo degli eventi raggruppati per stato |
| **Immagine della timeline** | Lista cronologica di tutti gli eventi nell'intervallo |
| **Attività per livello** | Eventi suddivisi per livello |

Selezionare **HTML** per visualizzare nel browser, oppure **Stampa/PDF** per stampare o salvare come PDF.

---

## 16. Vista amministratore

Navigare a `/admin-view` (richiede il ruolo **Admin**) per una dashboard amministrativa dedicata.

---

## 17. Orologi, conto alla rovescia e cronometri

### Orologi dei fusi orari
L'orologio nell'intestazione mostra l'ora locale in tempo reale. Cliccare **+** per aggiungere fusi orari aggiuntivi per team distribuiti. Cliccare **⧉** per staccare tutti gli orologi in una finestra separata.

### Display a sette segmenti VCR
Gli orologi vengono visualizzati in stile retrò VCR con display a sette segmenti. I colori e lo spessore dei segmenti sono configurabili.

### Conto alla rovescia
Creare timer con conto alla rovescia che contano fino a un orario obiettivo:
- Cliccare **+ Conto alla rovescia** nella barra degli strumenti degli orologi
- Impostare l'orario obiettivo o selezionare dall'inizio/fine di un evento
- Il conto alla rovescia mostra il tempo rimanente con un **indicatore di progresso**
- Un allarme si attiva quando il conto alla rovescia raggiunge lo zero
- Cliccare **ACK** per confermare

### Cronometri
Creare cronometri che contano in avanti:
- Cliccare **+ Cronometro** nella barra degli strumenti degli orologi
- Configurare: durata (ore/minuti/secondi), pulsanti preimpostati (5/10/15/30/60 min)
- Scegliere se il cronometro deve fermarsi o continuare dopo l'obiettivo
- Attivare l'allarme sonoro all'obiettivo
- Il cronometro mostra un **indicatore di progresso** con marcatura tempo extra

### Selettore colore
La barra degli strumenti degli orologi contiene selettori colore:
| Selettore | Controlla |
|---|---|
| **BG** | Colore di sfondo |
| **CD** | Colore accento del conto alla rovescia |
| **TM** | Colore accento del cronometro |

---

## 18. Registro delle decisioni
Il registro delle decisioni fornisce un tracciamento strutturato delle decisioni prese durante le operazioni o le esercitazioni.

### Creare una decisione
1. Cliccare **+ Nuova decisione**
2. Compilare titolo, descrizione, stato e responsabile
3. Allegare file se necessario
4. Cliccare **Salva**

### Stato delle decisioni
| Stato | Descrizione |
|---|---|
| **Proposta** | La decisione è stata presentata |
| **Approvata** | La decisione è stata approvata |
| **Rifiutata** | La decisione è stata respinta |

---

## 19. Diario operativo
Il diario operativo fornisce una registrazione cronologica degli eventi operativi, osservazioni e annotazioni.
- Aprire il **Diario operativo** dal pannello laterale (scheda Registri)
- Cliccare **+ Nuova voce** per aggiungere una voce nel diario
- Le voci vengono datate e collegate al creatore

---

## 20. Gestione risorse
Gestire le risorse operative (sale, edifici, servizi IT, datacenter) dal pannello laterale.

### Tipi di risorsa
| Tipo | Descrizione |
|---|---|
| **Sale** | Sale riunioni, centri operativi |
| **Edifici** | Edifici fisici e strutture |
| **Servizi IT** | Infrastruttura IT, server, reti |
| **Datacenter** | Strutture datacenter |

### Creare una risorsa
1. Aprire la scheda **Risorse** nel pannello laterale
2. Selezionare il tipo di risorsa
3. Cliccare **+ Aggiungi**
4. Compilare nome, descrizione, posizione (lat/lng), immagine e simbolo
5. Cliccare **Salva**

---

## 21. Proiezione cartografica
La proiezione cartografica fornisce una vista geografica interattiva delle riunioni, degli utenti e delle risorse.

- **Livelli mappa** — alternare tra OpenStreetMap, Topografica, Satellite e Scura
- **Sovrapposizione risorse** — mostrare/nascondere sale, edifici, servizi IT e datacenter
- **Ricerca indirizzo** — geocodificare un indirizzo e zoomare sulla posizione
- **Selettore simboli** — scegliere simboli cartografici militari e operativi per risorse ed eventi
- **Importazione GeoJSON/KML** — caricare file di dati geografici esterni
- **Adatta tutti** — zoom automatico per mostrare tutti i marcatori visibili

---

## 22. Finestre staccabili
Diverse viste possono essere staccate in finestre separate del browser:
| Finestra | Descrizione |
|---|---|
| **Orologi** | Tutti gli orologi, conti alla rovescia e cronometri |
| **Pannello laterale** | Pannello laterale completo con tutte le schede |
| **Registro decisioni** | Vista del registro delle decisioni |
| **Proiezione cartografica** | Mappa interattiva con tutte le sovrapposizioni |

Tema, lingua e dati vengono sincronizzati automaticamente tramite BroadcastChannel.

---

## 23. Integrazioni e connettori

### Framework di integrazione
La scheda Integrazioni (Admin/Capo operazioni) fornisce:
- **OIDC SSO** — configurazione Single Sign-On
- **SMTP e-mail** — e-mail in uscita per allarmi e rapporti
- **Microsoft Teams** — integrazione webhook
- **Zoom** — integrazione link riunioni
- **Chiavi API** — generazione di bearer token

### Connettori eventi
| Connettore | Descrizione |
|---|---|
| **STIX/TAXII** | Importare feed di intelligence sulle minacce informatiche |
| **Syslog** | Ricevere messaggi syslog come eventi |

---

## 24. Modelli
Salvare e riutilizzare insiemi di eventi, fasi, blocchi, gruppi e livelli:
- **Salva** — selezionare intervallo di date; gli eventi vengono memorizzati con offset relativi
- **Applica** — specificare STARTEX/T=0; tutti gli eventi vengono ricreati; livelli per evento supportati
- **Importa** — caricare file modello `.json`
- 31 modelli di esempio inclusi: 20 modelli di esercitazione e 11 modelli di incidente

---

## 25. Scorciatoie da tastiera e mouse

### Mouse

| Azione | Risultato |
|---|---|
| Clic su una fascia oraria vuota | Aprire Aggiungi evento a quell'orario |
| Clic su un blocco evento | Aprire i dettagli dell'evento |
| Trascinare un blocco evento | Riprogrammare nella fascia di destinazione |
| Trascinare la colonna del tempo | Zoomare altezza fascia (su = ingrandire) |
| Doppio clic sulla colonna del tempo | Reimpostare lo zoom a 1× |
| Clic centrale e trascinamento sulla timeline | Scorrere orizzontalmente |

### Tastiera

| Tasto | Azione |
|---|---|
| `←` / `→` | Navigare indietro / avanti di un intervallo |
| `T` | Saltare a oggi |
| `N` | Scorrere all'ora corrente |
| `E` | Aprire la finestra Aggiungi evento |
| `?` o `H` | Aprire la guida integrata |
| `Esc` | Chiudere la finestra corrente |
| `+` / `-` | Zoomare altezza fascia in/out |
| `F` | Congelare / riprendere il tempo sintetico |

---

## 26. Risoluzione dei problemi

### Impossibile accedere
- Verificare nome utente e password (predefiniti: `admin` / `admin`)
- Assicurarsi che il server sia in esecuzione: `./tidslinjal --port 8080`
- Controllare il log del server per eventuali errori

### Gli eventi non vengono visualizzati
- Controllare l'intervallo di date della **Vista** — potresti visualizzare un intervallo che non include i tuoi eventi
- Controllare i filtri dei **Livelli** — cliccare 🗂 e assicurarsi che i livelli corretti siano attivi
- Controllare la **Visibilità dei tipi di evento** nelle Impostazioni — i tipi nascosti non vengono visualizzati

### L'allarme non si attiva
- SSE richiede una connessione browser persistente — assicurarsi che la pagina sia aperta
- Verificare che le notifiche del browser siano consentite per il sito
- Verificare il tempo di preavviso dell'allarme: a 0 min l'allarme si attiva esattamente all'ora di inizio dell'evento

### La commutazione dei livelli non funziona
- Cliccare **🗂 Livelli** nella barra degli strumenti
- Selezionare **Linea master** per visualizzare tutti i livelli
- Oppure selezionare singoli livelli per filtrare

### L'esportazione produce un file vuoto
- Assicurarsi che ci siano eventi nell'intervallo di visualizzazione corrente
- Regolare l'intervallo della **Vista** per includere gli eventi desiderati

### La directory dei dati non è scrivibile
- Assicurarsi che la directory `data/` esista e sia scrivibile dal processo del server
- Usare `--data /percorso/alla/directory/scrivibile` o impostare la variabile d'ambiente `DATA_DIR`

---

## 27. Riferimenti e biblioteca documenti

La biblioteca dei riferimenti consente di gestire documenti e link collegati a operazioni ed esercitazioni.

### Caricare riferimenti

Caricare riferimenti come file, URL o testo locale. Il sistema supporta il caricamento massivo (più file contemporaneamente) e il rilevamento automatico del tipo di file.

### Metadati dei riferimenti

Ogni riferimento ha i seguenti metadati:

| Campo | Descrizione |
|---|---|
| **Titolo** | Nome del riferimento |
| **Descrizione** | Breve riepilogo |
| **Categoria** | Classificazione (vedi sotto) |
| **Tag** | Tag a testo libero per la ricerca |
| **Lingua** | Lingua del documento |
| **Proprietario** | Persona responsabile |
| **Custode** | Persona che mantiene il documento |
| **Modalità di copia** | Come viene archiviato il documento (vedi sotto) |

### Categorie

| Categoria |
|---|
| Manuale |
| SOP |
| Politica |
| Mappa |
| Riferimento |
| Lista di controllo |
| FAQ |
| Obiettivo |
| Altro |

### Modalità di copia

| Modalità | Descrizione |
|---|---|
| **Copia centrale** | Il file viene archiviato centralmente sul server |
| **Copia locale** | Il file viene archiviato localmente dall'utente |
| **Visualizza link** | Nessuna copia — solo un link alla fonte originale |

### Modificare i metadati dei riferimenti

Cliccare su un riferimento per aprire la vista dettagliata. Cliccare **Modifica** per cambiare i metadati.

### Checksum crittografici

Il sistema calcola automaticamente checksum crittografici per i file caricati:

| Algoritmo |
|---|
| MD5 |
| SHA-1 |
| SHA-256 |
| SHA-512 |

Cliccare su **Visualizza checksum** per aprire la finestra dei checksum con tutti i valori calcolati.

### Ricerca e filtraggio

Usare il campo di ricerca e i filtri per categoria per trovare i riferimenti. Filtrare per categoria, tag e testo libero.

---

## 28. Accessibilità

### Modalità alto contrasto

La modalità alto contrasto può essere sovrapposta a qualsiasi tema e migliora la visibilità di:
- Linee della griglia
- Marcatori temporali
- Bande delle fasi
- Sovrapposizioni di blocco
- Eventi evidenziati

Attivare tramite **Impostazioni → Tema e visualizzazione → Modalità alto contrasto**.

### Palette per daltonici

Tre palette per daltonici sono disponibili:

| Palette | Tipo |
|---|---|
| **Protanopia** | Daltonismo rosso-verde |
| **Deuteranopia** | Daltonismo verde-rosso |
| **Tritanopia** | Daltonismo blu-giallo |

Attivare tramite **Impostazioni → Tema e visualizzazione → Palette daltonici**.

La modalità alto contrasto e le palette per daltonici possono essere attivate contemporaneamente.

---

## 29. Preset dello spazio di lavoro

Salvare e ripristinare preset nominati dello spazio di lavoro per un accesso rapido alle viste più utilizzate.

### Salvare un preset

Un preset salva le seguenti impostazioni:
- Vista (griglia, lista, diario, decisioni, mappa, rapporti)
- Intervallo
- Risoluzione
- Livello di zoom
- Livelli nascosti
- Scheda del pannello laterale

### Caricare un preset

Cliccare su un preset salvato per applicare immediatamente tutte le impostazioni salvate con un solo clic.

### Eliminare un preset

Cliccare **Elimina** accanto a un preset per rimuoverlo.

---

*Tidslinjal v6.1.0 — Timeline operativa collaborativa*
