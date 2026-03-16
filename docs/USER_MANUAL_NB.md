# Tidslinjal Brukerhåndbok

**Versjon 6.1.0**

---

## Innholdsfortegnelse

1. [Oversikt](#1-oversikt)
2. [Kom i gang](#2-kom-i-gang)
3. [Brukergrensesnittet](#3-brukergrensesnittet)
4. [Navigere tidslinjen](#4-navigere-tidslinjen)
5. [Hendelser](#5-hendelser)
6. [Hendelsesstatus-arbeidsflyt](#6-hendelsesstatus-arbeidsflyt)
7. [Kommentarer](#7-kommentarer)
8. [Lag](#8-lag)
9. [Alarmer og varsler](#9-alarmer-og-varsler)
10. [Øvelse og syntetisk tid](#10-øvelse-og-syntetisk-tid)
11. [Øvelsesfaser](#11-øvelsesfaser)
12. [Tidsluke-låsing](#12-tidsluke-låsing)
13. [Roller og tillatelser](#13-roller-og-tillatelser)
14. [Innstillinger](#14-innstillinger)
15. [Eksport og rapporter](#15-eksport-og-rapporter)
16. [Adminvisning](#16-adminvisning)
17. [Klokker, nedtellinger og tidtakere](#17-klokker-nedtellinger-og-tidtakere)
18. [Beslutningslogg](#18-beslutningslogg)
19. [Loggbok](#19-loggbok)
20. [Ressurshåndtering](#20-ressurshåndtering)
21. [Kartprojeksjon](#21-kartprojeksjon)
22. [Avtakbare vinduer](#22-avtakbare-vinduer)
23. [Integrasjoner og tilkoblinger](#23-integrasjoner-og-tilkoblinger)
24. [Maler](#24-maler)
25. [Tastatur- og mussnarveier](#25-tastatur--og-mussnarveier)
26. [Feilsøking](#26-feilsøking)
27. [Referanser og dokumentbibliotek](#27-referanser-og-dokumentbibliotek)
28. [Tilgjengelighet](#28-tilgjengelighet)
29. [Arbeidsområdets forhåndsinnstillinger](#29-arbeidsområdets-forhåndsinnstillinger)

---

## 1. Oversikt

**Tidslinjal** er et samarbeidsbasert, nettbasert operativt tidslinjeverktøy for geografisk spredte team. Det gir en delt, visuell kronologi av hendelser for operasjonsplanlegging, koordinering og situasjonsforståelse — inkludert støtte for militære øvelser og beredskapsøvelser med syntetisk tid.

Nøkkelfunksjoner:
- Delt tidslinje med flere brukere og rollebasert tilgang
- Hendelseslivssyklushåndtering med godkjenningsarbeidsflyt
- Navngitte lag for å separere aktivitetsstrømmer
- Øvelsesstøtte med STARTEX/ENDEX og syntetisk "Dag N / T+T"-tid
- Alarmvarsler i sanntid via Server-Sent Events
- Eksport til ICS, JSON og CSV
- DTG (Date-Time Group) militært datoformat
- Høykontrastmodus og fargeblindevennlige paletter
- Finsk (Suomi) språkstøtte
- Referansedokumenthåndtering med kontrollsummer
- Arbeidsområdets forhåndsinnstillinger

---

## 2. Kom i gang

### Logge inn

Gå til `http://<server>:<port>` (standard: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Brukernavn: [admin          ] │
│  Passord:    [••••••••••••••]  │
│                                 │
│         [ Logg inn ]            │
└─────────────────────────────────┘
```

Standardpålogging: `admin` / `admin`

> **Sikkerhetsnotat:** Bytt admin-passordet umiddelbart etter første innlogging med 🔑-knappen øverst til høyre.

### Selvregistrering

Hvis administratoren har aktivert selvregistrering, vises lenken **"Ingen konto? Registrer deg"** på innloggingssiden. Det finnes fire registreringsmodi:

| Modus | Beskrivelse |
|---|---|
| **Åpen** | Hvem som helst kan registrere seg; kontoen aktiveres umiddelbart |
| **Gjennomgått** | Hvem som helst kan registrere seg; admin må godkjenne kontoen før innlogging tillates |
| **Generell invitasjon** | Registrering krever en delt invitasjonskode som admin gir ut |
| **Personlig invitasjon** | Registrering krever en personlig engangskode som admin genererer per bruker |

### Passordtilbakestilling

Hvis du har registrert en e-postadresse på profilen din:

1. Klikk på **Glemt passord?** på innloggingssiden
2. Skriv inn brukernavnet eller e-postadressen din
3. Et tilbakestillingstoken genereres (vises på skjermen hvis ingen e-postserver er konfigurert)
4. Klikk på **Tilbakestill passord**, lim inn tokenet og velg et nytt passord

### Bytte passord

Klikk på **🔑**-knappen i toppteksten. Skriv inn ditt nåværende passord og deretter det nye passordet to ganger.

---

## 3. Brukergrensesnittet

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [I dag] [›] [⏱]  Vis: [Uke▼]  Oppl.: [Time▼]     │
│             [🔍 Søk…] [🗂 Lag] [⬇ Eksporter] [📄 Rapport]            │
│                          [👤 Navn  rolle] [?][🔑][☰] [Logg ut]       │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  SIDEPANEL      │
│                  TIDSLINJEGRID                     │                 │
│  Tid  │  Man 01  │  Tir 02  │  Ons 03  │  ...     │  [Forklaring]   │
│ ──────┼──────────┼──────────┼──────────┤          │  [Alarm]        │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │          │  [Lag]          │
│ 09:00 │          │ Gjennomg.│          │          │  [Innstillinger]│
│ 10:00 │ ████████ │          │          │          │                 │
│       │ Stand-up │          │          │          │                 │
│ 11:00 │          │          │ ████████ │          │                 │
│       │          │          │ ENDEX    │          │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Topptekst** — navigering, visningsvalg, søk og brukerkontroller.

**Tidslinjegrid** — dager fra venstre til høyre, tid ovenfra og ned. Hendelser vises som fargede blokker.

**Sidepanel** — fanene Forklaring, Alarm, Lag, Brukere (admin), Grupper (admin), Revisjonslogg (Teamleder+), Faser (Teamleder+), Innstillinger. Veksle med ☰-knappen.

---

## 4. Navigere tidslinjen

### Datonavigering

| Kontroll | Handling |
|---|---|
| **‹** / **›**-knapper | Steg bakover / fremover ett visningsintervall |
| **I dag**-knapp | Hopp til i dag |
| **⏱**-knapp | Rull griden til gjeldende tid |

### Visningsintervall

Bruk **Vis**-nedtrekksmenyen i verktøylinjen:

```
Vis: [Dag ▼]
      Dag
      2 Dager
      3 Dager
      4 Dager
    ▶ Uke
      Måned
      2 Måneder
      3 Måneder
```

### Oppløsning (lukkehøyde)

Bruk **Oppløsning**-nedtrekksmenyen:

```
Oppløsning: [Time ▼]
             10 min
             15 min
           ▶ Time
             Dag
```

### Zoom

**Dra for å zoome** — klikk og dra oppover/nedover på tidskolonnen (venstre kant) for å øke eller redusere lukkehøyden. Dra **oppover** for å zoome inn, **nedover** for å zoome ut.

**Dobbeltklikk** på tidskolonnen for å tilbakestille zoom til 1×.

Tastatur: **+** / **-** for å zoome inn/ut i trinn.

### Horisontal panorering

Midtklikk og dra på tidslinjeområdet for å panorere venstre/høyre.

---

## 5. Hendelser

### Opprette en hendelse

Klikk på en tom celle i tidslinjegriden eller klikk **+ Legg til hendelse** i toppteksten.

```
┌─────────────────────── Legg til hendelse ──────────────────────────┐
│ Tittel *  [                                                       ]  │
│                                                                      │
│ Type      [Aktivitet       ▼]   Farge  [■]                          │
│                                                                      │
│ Start *  [2025-06-01T10:00]    Slutt  [2025-06-01T11:00]            │
│                                                                      │
│ Lag      [Hovedlinjen     ▼]  Status [Planlagt          ▼]          │
│                                                                      │
│ Beskrivelse                                                          │
│ [                                                                ]   │
│                                                                      │
│ Deltakere  [—  ▼]   ☐ Heldagshendelse (ingen spesifikk tid)        │
│                                                                      │
│ ☐ Gjentakende    Mønster [Ukentlig ▼]                               │
│ Sluttdato  [               ]                                         │
│                                                                      │
│ Vedlegg 📎 [Velg fil]                                                │
│                                                                      │
│              [Avbryt]   [Lagre]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Hendelsestyper

Hver hendelsestype har en farget blokk og et ikon som vises til **venstre** for hendelsestitelen.

| Ikon | Type | Farge | Merknader |
|---|---|---|---|
| — | **Hendelse** | Blå | Generell forekomst |
| ⚡ | **Øyeblikk** | Oransje | Enkelt tidspunkt — ingen sluttid. Vises som en ◆ diamantmarkør. |
| 🤝 | **Møte** | Grå | Planlagt møte |
| 🏢 | **Fysisk møte** | Brent oransje | Fysisk møte på et bestemt sted |
| ⚖️ | **Beslutning** | Grønn | Beslutningspunkt |
| ⏰ | **Tidsfrist** | Rød | Hard frist |
| — | **Aktivitet** | Grønn | Arbeidsblokk |
| 🔄 | **Gjentakende** | Lilla | Mal for gjentakende aktiviteter |
| 📊 | **Rapportering** | Blågrønn | Rapport eller gjennomgang |
| 📌 | **Tildelt oppgave** | Oransje | Oppgave tildelt en person eller et team |
| 🧍 | **Daglig standup** | Cyan | Kort daglig statusmøte |

Ikonet ↻ (til venstre for tittelen) angir at hendelsen er del av en **gjentakende serie**. Egendefinerte typer kan ha et eget emoji-ikon satt via **Innstillinger → Hendelsestyper → Rediger**.

Slå av/på alle ikoner globalt i **Innstillinger → Hendelsesikoner**.

Egendefinerte typer kan legges til av brukere med Les/Skriv+ fra innstillingspanelet.

### Øyeblikkshendelser

Når **Øyeblikk** velges som type:
- Feltet **Slutt** skjules (ingen varighet)
- Hendelsen vises som en smal vertikal markør med en ◆ diamant øverst
- Den kan ikke settes som gjentakende

### Heldagshendelser

Merk av for **Heldagshendelse (ingen spesifikk tid)** for en hendelse som strekker seg over hele dagen:
- Start-/sluttidsfeltene skjules
- Hendelsen vises i det grå området utenfor dagstimene
- Gjentakelse er ikke tilgjengelig for heldagshendelser

### Deltakere

Feltet **Deltakere** markerer om aktiviteten involverer interne eller eksterne parter:

| Verdi | Merke | Farge |
|---|---|---|
| — | ingen | — |
| **Intern** | `INTERN` | Blågrønn |
| **Ekstern** | `EKSTERN` | Rød |

### Gjentakende hendelser

Merk av for **Gjentakende**, velg deretter et mønster:

| Mønster | Intervall |
|---|---|
| Hvert 30. minutt | 30 minutter |
| Hver time | 1 time |
| Annenhver / hver 3. / hver 4. time | 2 / 3 / 4 timer |
| Daglig | 1 dag |
| Ukentlig | 7 dager |
| Månedlig | ~1 måned |
| Kvartalsvis | ~3 måneder |

### Redigere og slette hendelser

Klikk på en hendelsesblokk for å åpne detaljvisningen. Klikk **Rediger** for å endre. Klikk **Slett** (synlig for oppretter og admins) for å slette.

---

## 6. Hendelsesstatus-arbeidsflyt

Hver hendelse har en status som beveger seg gjennom en livssyklus:

```
planlagt ──► aktiv ──► besvart ──► avsluttet ──► innsendt
                                                      │
                                           ┌──────────┤
                                           ▼          ▼
                                       verifisert  avvist
                                                      │
                                                (årsak kreves)
```

`avbrutt` er tilgjengelig i ethvert stadium.

### Overganger

| Fra → Til | Hvem kan handle |
|---|---|
| Vilkårlig → vilkårlig (unntatt verifisere/avvise) | Oppretter, Teamleder+ |
| besvart | Rapportør, Oppretter, Teamleder+ |
| innsendt → verifisert | Teamleder+ (registrerer hvem og når) |
| innsendt → avvist | Teamleder+ (krever avvisningsårsak) |

### Rapportørrollen

Brukere med rollen **Rapportør** kan:
- Legge inn kommentarer på hendelser
- Sette status som `besvart` eller `avsluttet` (krever Teamleders godkjenning)

---

## 7. Kommentarer

Klikk på en hendelsesblokk for å åpne detaljvisningen. Rull ned til **Kommentarer**.

- Alle autentiserte brukere kan lese kommentarer
- Les/Skriv+-brukere kan legge inn kommentarer
- Rapportører kan legge inn kommentarer; statusendrende kommentarer krever godkjenning
- Teamleder+ kan godkjenne eller slette ventende kommentarer

---

## 8. Lag

Lag er navngitte overlegg oppå hovedlinjen. De gjør det mulig for forskjellige team å ha separate hendelsesspor med en felles visning.

### Opprette et lag

1. Åpne fanen **Lag** i sidepanelet eller klikk **🗂 Lag** i verktøylinjen
2. Klikk **+ Nytt lag**
3. Angi navn, farge, beskrivelse, synlighet og tillatelser

```
┌──────── Nytt lag ─────────────────┐
│ Navn *   [Cyberteam           ]   │
│ Farge    [■ #9B59B6            ]  │
│ Beskrivelse [                  ]  │
│                                   │
│ Synlighet  [Grupper        ▼]    │
│ Tillatelse [Les/Skriv      ▼]    │
│ Grupper    ☐ Alpha  ☐ Bravo      │
│                                   │
│         [Avbryt]  [Lagre]         │
└───────────────────────────────────┘
```

### Synlighet

| Innstilling | Hvem kan se laget |
|---|---|
| **Privat** | Bare eieren |
| **Grupper** | Eier + medlemmer i valgte grupper |
| **Offentlig** | Alle autentiserte brukere |

### Veksle lag

Klikk **🗂 Lag** i verktøylinjen for å åpne hurtigvekslingsboksen. Klikk på et element for å veksle det. Flere lag kan være aktive samtidig — merk av boksene for de lagene du vil se.

---

## 9. Alarmer og varsler

### Sette et alarm

1. Klikk på en hendelsesblokk for å åpne detaljvisningen
2. Klikk **🔔 Sett alarm**
3. Velg ledetid (ved tidspunktet, 5/10/15/30 min, eller 1 time før)

### Alarmvarsler

Når et alarm utløses, vises et varselpanel øverst på skjermen:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarm — "ENDEX-gjennomgang" om 15 minutter (10:45)                │
│                    [Lukk] [📋 Vis hendelse] [✓ ACK]                  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Lukk** — fjerner varselet uten kvittering.
- **📋 Vis hendelse** — åpner hendelsens detaljvisning direkte fra alarmet.
- **✓ ACK** — kvitterer alarmet og stopper eskalering.
- **Gå til møte**-knapp — hvis hendelsen er et møte med URL (Teams/Zoom), vises en knapp i alarmvarselet som åpner møtet direkte.

Ukvitterte alarmer eskalerer — de blir oransje, deretter pulserende røde hvert 60. sekund.

### Alarmrevisjonslogg

Hver alarmkvittering registreres i **Revisjonsloggen** (tilgjengelig for Teamleder og høyere). Hver oppføring inkluderer:
- Hvem som kvitterte alarmet (brukernavn og ID)
- Når kvitteringen skjedde (tidsstempel)
- IP-adressen systemet ble nådd fra på det tidspunktet

### Klokker for flere tidssoner

Toppteksten viser den primære sanntidsklokken. Du kan legge til et vilkårlig antall klokker for andre tidssoner.

**Legge til en klokke:**
1. Klikk på **+**-knappen til venstre for hovedklokken i toppteksten.
2. Skriv inn en kort etikett (f.eks. *Tallinn*, *Kyiv*, *Kabul*).
3. Velg IANA-tidssone i nedtrekksmenyen.
4. Klikk **Legg til**. Klokken vises umiddelbart til venstre for hovedklokken.

**Fjerne en klokke:** Klikk **×** på klokkwidgeten, eller gå til **Innstillinger → Dato/klokkeslettformat → Ytterligere tidssoner → Fjern**.

### Webhook-varsler

Konfigurer en webhook-URL i **Innstillinger** for også å motta alarmvarsler via HTTP POST til Mattermost, Slack eller en vilkårlig HTTP-endepunkt.

### Alarm-fanen i sidepanelet

Vis og håndter alle dine aktive alarmer fra fanen **Alarm** i sidepanelet.

---

## 10. Øvelse og syntetisk tid

For treningsøvelser støtter Tidslinjal en "syntetisk tid"-modus som erstatter ekte kalenderdatoer med øvelsesdag-/timeetiketter.

### Konfigurasjon (kun admin)

1. Åpne fanen **Innstillinger** i sidepanelet
2. Rull ned til **Øvelsesinnstillinger**
3. Fyll inn:
   - **Øvelsesnavn** — vises som et merke i toppteksten
   - **STARTEX** — den ekte datoen og klokkeslettet som tilsvarer "Dag 1 T+0"
   - **ENDEX** — den ekte datoen og klokkeslettet for øvelsens slutt
4. Merk av for **Aktiver syntetisk tidsvisning**
5. Klikk **Lagre**

### Aktivere syntetisk tid

Knappen **🕐 T+** vises i verktøylinjen når øvelsesmodus er konfigurert. Klikk for å veksle mellom ekte og syntetisk tidsvisning.

### Tidslinjefrysen

I **Innstillinger**-panelet, bruk **Frys/pause tidslinjen** for å stoppe den syntetiske klokken ved et bestemt tidspunkt. Klikk **Gjenoppta** for å fjerne frysingen.

---

## 11. Øvelsesfaser

Teamledere og høyere roller kan definere navngitte, fargede blokker som dekker hele tidslinjen for å vise øvelsesfaser.

1. Åpne fanen **Faser** i sidepanelet
2. Klikk **+ Ny fase**
3. Angi navn, farge, starttid, sluttid og visningsrekkefølge (0–9)

Faser vises som gjennomsiktige fargebånd øverst i tidslinjegriden.

---

## 12. Tidsluke-låsing

Admins og brukere med flagget `kan_låse` kan låse tidsintervaller for å forhindre oppretting av hendelser.

1. Klikk **🔒 Lås tidsluke** i toppteksten (synlig for admin/kan_låse-brukere)
2. Angi starttid, sluttid og årsak

Låste tidsluker vises som et rødstripet overlegg. Hendelser kan ikke opprettes i låste tidsluker.

---

## 13. Roller og tillatelser

| Rolle | Forkortelse | Funksjoner |
|---|---|---|
| **Observatør** | `observer` | Skrivebeskyttet tilgang til tidslinje og hendelser — kan ikke redigere, kommentere eller låse |
| **Les** | `read` | Vise tidslinje, hendelser, lag; sette personlige alarmer |
| **Rapportør** | `reporter` | + Legge inn kommentarer; sette besvart/avsluttet (med godkjenning) |
| **Les/Skriv** | `readwrite` | + Opprette/redigere egne hendelser; opprette hendelsestyper og lag |
| **Teamleder** | `teamlead` | + Opprette grupper; verifisere/avvise innsendte hendelser; vise revisjonslogg; håndtere faser |
| **Operasjonsleder** | `oplead` | + Opprette/redigere/slette hendelser på hovedlinjen |
| **Stabsassistent** | `staffofficer` | Samme rettigheter som operasjonsleder — alternativ betegnelse for stabspersonell |
| **Stabsoffiser** | `staffofficer_full` | Samme som stabsassistent, men krever minst én J-betegnelse (J1–J9) |
| **Admin** | `admin` | Full tilgang — håndtere alle brukere, roller, låser, aktivitetsinnstillinger, registrering |

Flagget `kan_låse` kan tildeles enhver bruker uavhengig av rolle.

### J-betegnelser (Stabsoffiserrollen)

**Stabsoffiser** (`staffofficer_full`) krever minst én NATO J-betegnelse. Betegnelsene identifiserer stabsgrenen:

| Kode | Gren |
|---|---|
| J1 | Personell |
| J2 | Etterretning |
| J3 | Operasjoner |
| J4 | Logistikk |
| J5 | Planlegging |
| J6 | Kommunikasjon |
| J7 | Utdanning |
| J8 | Finans |
| J9 | Sivil-militært samarbeid |

---

## 14. Innstillinger

Åpne fanen **Innstillinger** i sidepanelet for å konfigurere dine innstillinger.

### Tema og visning

| Innstilling | Alternativer |
|---|---|
| **Tema** | Mørkt / Lyst / City Camo / Urban Camo |
| **Størrelse** | Liten / Normal / Stor / Enorm |
| **Språk** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇫🇮 Suomi |
| **Dato-/klokkeslettformat** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Tidsformat** | 24t / 12t |
| **Høykontrastmodus** | På / Av |
| **Fargeblindepalett** | Av / Protanopi / Deuteranopi / Tritanopi |
| **Standard landingsvisning** | Grid / Liste / Loggbok / Beslutning / Kart / Rapporter |
| **Autofølg nå** | På / Av |
| **Standardintervall** | Dag / 3 Dager / Uke / 2 Uker / Måned |
| **Standardoppløsning** | 10 min / 15 min / Time / Dag |
| **Uken begynner** | Mandag / Søndag |
| **Verktøytipsforsinkelse** | Umiddelbart / 200 ms / 500 ms |
| **Bekreft dra-flytt** | På / Av |
| **Standard hendelsestype** | vilkårlig konfigurert type |
| **Velkomstbanner** | vises ved første innlogging |

Språket kan også endres direkte med flaggknappene (🇬🇧 🇸🇪 🇫🇷 🇫🇮) i verktøylinjen.

### Dato-/klokkeslettformat og dagstimer

Avsnittet **Dato-/klokkeslettformat** grupperer både formatvalg og konfigurasjon av dagstimer:

| Innstilling | Beskrivelse |
|---|---|
| **Datoformat** | ISO 8601 / UK / FR / SV |
| **Dag start** | Første time på arbeidsdagen |
| **Dag slutt** | Siste time på arbeidsdagen |

Tidsluker utenfor dag start–slutt vises grå/stripede.

### Standardvisning

Klikk på en av intervallknappene (Dag / 2 Dager / 3 Dager / 4 Dager / Uke) for å angi din standardvisning. Å endre dette veksler også den gjeldende visningen umiddelbart.

### Hendelsestypesynlighet

Slå av/på individuelle hendelsestyper. Skjulte typer er nedtonet i tidslinjen. Egendefinerte typer kan opprettes med knappen **+ Ny type** (Les/Skriv+).

### Nåtidsspor (rød linje)

| Innstilling | Beskrivelse |
|---|---|
| Vis / Skjul | Veksle den røde linjen |
| Farge | Linjefarge (standard rød) |
| Bredde | Linjetykkelse i piksler |
| Type | Heltrukken / Stiplet / Prikket |
| H+N-etikett | Vis øvelsestime-etikett på linjen |

### Webhook / Varsler

Angi en webhook-URL for å motta alarmvarsler som HTTP POST-forespørsler:
- **Mattermost** — `{"text": "..."}` nyttelast
- **Slack** — `{"text": "..."}` nyttelast
- **Generisk** — fullstendig alarm-JSON-nyttelast

Klikk **Test** for å sende et testvarsel.

---

## 15. Eksport og rapporter

### Eksport

Klikk **⬇ Eksporter** i verktøylinjen for å åpne eksportmodalen:

| Format | Innhold |
|---|---|
| **ICS** | Hendelser i gjeldende visning som iCalendar; importer i en vilkårlig kalenderapp |
| **JSON** | Komplett systemeksport (alle hendelser, brukere, grupper, lag, innstillinger) — kun admin |
| **CSV** | Hendelser i gjeldende visning som kommaseparert regneark |

### Rapporter

Klikk **📄 Rapport** for å åpne rapportgeneratoren:

| Rapporttype | Beskrivelse |
|---|---|
| **Etteraksjonsvurdering (AAR)** | Sammendrag av hendelser gruppert etter status |
| **Tidslinjebilde** | Kronologisk liste over alle hendelser i intervallet |
| **Per-lag-aktivitet** | Hendelser fordelt per lag |

Velg **HTML** for å vise i nettleseren, eller **Skriv ut/PDF** for å skrive ut eller lagre som PDF.

---

## 16. Adminvisning

Naviger til `/admin-view` (krever rollen **Admin**) for et dedikert administratørdashbord.

---

## 17. Klokker, nedtellinger og tidtakere

### Tidssoneklokker
Klokken i toppteksten viser lokal sanntid. Klikk **+** for å legge til ekstra tidssoner for distribuerte team. Klikk **⧉** for å løsrive alle klokker til et separat vindu.

### VCR sjusegmentdisplay
Klokkene vises i retro VCR-stil med sjusegmentdisplay. Segmentfarger og tykkelse kan konfigureres.

### Nedtellingstimer
Opprett nedtellingstimere som teller ned til et måltidspunkt:
- Klikk **+ Nedtelling** i klokkenes verktøylinje
- Still inn måltidspunkt eller velg fra en hendelses start-/sluttid
- Nedtellingen viser gjenværende tid med en **fremdriftsindikator**
- Et alarm utløses når nedtellingen når null
- Klikk **ACK** for å bekrefte

### Tidtakere
Opprett tidtakere som teller oppover:
- Klikk **+ Tidtaker** i klokkenes verktøylinje
- Konfigurer: varighet (timer/minutter/sekunder), forhåndsinnstilte knapper (5/10/15/30/60 min)
- Velg om tidtakeren skal stoppe eller fortsette etter måltidspunktet
- Aktiver lydalarm ved måltidspunkt
- Tidtakeren viser en **fremdriftsindikator** med overtidsmarkering

### Fargevelger
Klokkenes verktøylinje inneholder fargevelgere:
| Velger | Styrer |
|---|---|
| **BG** | Bakgrunnsfarge |
| **CD** | Nedtellingens aksentfarge |
| **TM** | Tidtakerens aksentfarge |

---

## 18. Beslutningslogg
Beslutningsloggen gir strukturert sporing av beslutninger som tas under operasjoner eller øvelser.

### Opprette en beslutning
1. Klikk **+ Ny beslutning**
2. Fyll inn tittel, beskrivelse, status og ansvarlig
3. Legg ved filer ved behov
4. Klikk **Lagre**

### Beslutningsstatus
| Status | Beskrivelse |
|---|---|
| **Foreslått** | Beslutning er lagt frem |
| **Godkjent** | Beslutning er godkjent |
| **Avvist** | Beslutning er avvist |

---

## 19. Loggbok
Loggboken gir en kronologisk registrering av operative hendelser, observasjoner og notater.
- Åpne **Loggbok** fra sidepanelet (fanen Logger)
- Klikk **+ Ny oppføring** for å legge til en loggoppføring
- Oppføringer tidsstemples og knyttes til oppretter

---

## 20. Ressurshåndtering
Håndter operative ressurser (rom, bygninger, IT-tjenester, datasentre) fra sidepanelet.

### Ressurstyper
| Type | Beskrivelse |
|---|---|
| **Rom** | Møterom, operasjonssentraler |
| **Bygninger** | Fysiske bygninger og anlegg |
| **IT-tjenester** | IT-infrastruktur, servere, nettverk |
| **Datasentre** | Datasenteranlegg |

### Opprette en ressurs
1. Åpne fanen **Ressurser** i sidepanelet
2. Velg ressurstype
3. Klikk **+ Legg til**
4. Fyll inn navn, beskrivelse, plassering (lat/lng), bilde og symbol
5. Klikk **Lagre**

---

## 21. Kartprojeksjon
Kartprojeksjonen gir en interaktiv geografisk visning over møter, brukere og ressurser.

- **Kartlag** — bytt mellom OpenStreetMap, Topografisk, Satellitt og Mørk
- **Ressursoverlegg** — vis/skjul rom, bygninger, IT-tjenester og datasentre
- **Adressesøk** — geokod en adresse og zoom til stedet
- **Symbolvelger** — velg militære og operative kartsymboler for ressurser og hendelser
- **GeoJSON/KML-import** — last inn eksterne geografiske datafiler
- **Tilpass alle** — autozoom for å vise alle synlige markører

---

## 22. Avtakbare vinduer
Flere visninger kan løsrives til separate nettleservinduer:
| Vindu | Beskrivelse |
|---|---|
| **Klokker** | Alle klokker, nedtellinger og tidtakere |
| **Sidepanel** | Fullstendig sidepanel med alle faner |
| **Beslutningslogg** | Beslutningsloggvisning |
| **Kartprojeksjon** | Interaktivt kart med alle overlegg |

Tema, språk og data synkroniseres automatisk via BroadcastChannel.

---

## 23. Integrasjoner og tilkoblinger

### Integrasjonsrammeverk
Fanen Integrasjoner (Admin/Ops Lead) gir:
- **OIDC SSO** — Single Sign-On-konfigurasjon
- **SMTP-post** — utgående e-post for alarmer og rapporter
- **Microsoft Teams** — webhook-integrasjon
- **Zoom** — møtelenkeintegrasjon
- **API-nøkler** — generer bearer-tokens

### Hendelsestilkoblinger
| Tilkobling | Beskrivelse |
|---|---|
| **STIX/TAXII** | Importer cybertrussel-etterretningsstrømmer |
| **Syslog** | Motta syslog-meldinger som hendelser |

---

## 24. Maler
Lagre og gjenbruk sett av hendelser, faser, låser, grupper og lag:
- **Lagre** — velg datointervall; hendelser lagres med relative forskyvninger
- **Bruk** — angi STARTEX/T=0; alle hendelser gjenskapes; lag per hendelse støttes
- **Importer** — last inn `.json`-malfiler
- 31 eksempelmaler er inkludert: 20 øvelsesmaler og 11 hendelsesmaler

---

## 25. Tastatur- og mussnarveier

### Mus

| Handling | Resultat |
|---|---|
| Klikk på en tom tidsluke | Åpne Legg til hendelse ved det tidspunktet |
| Klikk på hendelsesblokk | Åpne hendelsesdetaljer |
| Dra hendelsesblokk | Planlegg på nytt til målluke |
| Dra tidskolonne | Zoom lukkehøyde (opp = zoom inn) |
| Dobbeltklikk tidskolonne | Tilbakestill zoom til 1× |
| Midtklikk-dra tidslinje | Panorer horisontalt |

### Tastatur

| Tast | Handling |
|---|---|
| `←` / `→` | Naviger bakover / fremover ett intervall |
| `T` | Hopp til i dag |
| `N` | Rull til gjeldende tid |
| `E` | Åpne Legg til hendelse-dialogen |
| `?` eller `H` | Åpne innebygd hjelp |
| `Esc` | Lukk gjeldende modal |
| `+` / `-` | Zoom lukkehøyde inn/ut |
| `F` | Frys / gjenoppta syntetisk tid |

---

## 26. Feilsøking

### Kan ikke logge inn
- Kontroller brukernavn og passord (standard: `admin` / `admin`)
- Sørg for at serveren kjører: `./tidslinjal --port 8080`
- Kontroller serverloggen for feil

### Hendelser vises ikke
- Kontroller **Vis**-datointervallet — du viser kanskje et intervall som ikke inkluderer hendelsene dine
- Kontroller **Lag**-filter — klikk 🗂 og sørg for at riktige lag er aktive
- Kontroller **Hendelsestypesynlighet** i Innstillinger — skjulte typer vises ikke

### Alarmet utløses ikke
- SSE krever en vedvarende nettlesertilkobling — sørg for at siden er åpen
- Kontroller at nettleservarsler er tillatt for nettstedet
- Verifiser alarmets ledetid: ved 0 min utløses alarmet nøyaktig ved hendelsens starttid

### Lagveksling fungerer ikke
- Klikk **🗂 Lag** i verktøylinjen
- Velg **Hovedlinjen** for å vise alle lag
- Eller velg individuelle lag for å filtrere

### Eksporten gir en tom fil
- Sørg for at det finnes hendelser i det gjeldende visningsintervallet
- Juster **Vis**-intervallet for å inkludere ønskede hendelser

### Datakatalogen er ikke skrivbar
- Sørg for at katalogen `data/` finnes og er skrivbar av serverprosessen
- Bruk `--data /sti/til/skrivbar/katalog` eller angi miljøvariabelen `DATA_DIR`

---

## 27. Referanser og dokumentbibliotek

Referansebiblioteket gjør det mulig å håndtere dokumenter og lenker knyttet til operasjoner og øvelser.

### Laste opp referanser

Last opp referanser som fil, URL eller lokal tekst. Systemet støtter masseopplasting (flere filer samtidig) og automatisk filtypegjenkjenning.

### Referansemetadata

Hver referanse har følgende metadata:

| Felt | Beskrivelse |
|---|---|
| **Tittel** | Referansens navn |
| **Beskrivelse** | Kort sammendrag |
| **Kategori** | Klassifisering (se nedenfor) |
| **Tagger** | Fritekst-tagger for søk |
| **Språk** | Dokumentets språk |
| **Eier** | Ansvarlig person |
| **Forvalter** | Person som vedlikeholder dokumentet |
| **Kopieringsmodus** | Hvordan dokumentet lagres (se nedenfor) |

### Kategorier

| Kategori |
|---|
| Håndbok |
| SOP |
| Policy |
| Kart |
| Referanse |
| Sjekkliste |
| FAQ |
| Mål |
| Øvrig |

### Kopieringsmodi

| Modus | Beskrivelse |
|---|---|
| **Sentral kopi** | Filen lagres sentralt på serveren |
| **Lokal kopi** | Filen lagres lokalt hos brukeren |
| **Vis lenke** | Ingen kopi — bare en lenke til originalkilden |

### Redigere referansemetadata

Klikk på en referanse for å åpne detaljvisningen. Klikk **Rediger** for å endre metadata.

### Kryptografiske kontrollsummer

Systemet beregner automatisk kryptografiske kontrollsummer for opplastede filer:

| Algoritme |
|---|
| MD5 |
| SHA-1 |
| SHA-256 |
| SHA-512 |

Klikk på **Vis kontrollsummer** for å åpne kontrollsummemodalen med alle beregnede verdier.

### Søk og filtrering

Bruk søkefeltet og kategorifilter for å finne referanser. Filtrer på kategori, tagger og fritekst.

---

## 28. Tilgjengelighet

### Høykontrastmodus

Høykontrastmodus kan legges oppå et hvilket som helst tema og forsterker synligheten for:
- Rutenettlinjer
- Tidsmarkører
- Fasebånd
- Låsoverlegg
- Markerte hendelser

Aktiver via **Innstillinger → Tema og visning → Høykontrastmodus**.

### Fargeblindepaletter

Tre fargeblindepaletter er tilgjengelige:

| Palett | Type |
|---|---|
| **Protanopi** | Rødgrønn fargeblindhet |
| **Deuteranopi** | Grønnrød fargeblindhet |
| **Tritanopi** | Blågul fargeblindhet |

Aktiver via **Innstillinger → Tema og visning → Fargeblindepalett**.

Høykontrastmodus og fargeblindepaletter kan aktiveres samtidig.

---

## 29. Arbeidsområdets forhåndsinnstillinger

Lagre og gjenopprett navngitte arbeidsområdeforhåndsinnstillinger for rask tilgang til dine vanligste visninger.

### Lagre en forhåndsinnstilling

En forhåndsinnstilling lagrer følgende innstillinger:
- Visning (grid, liste, loggbok, beslutning, kart, rapporter)
- Intervall
- Oppløsning
- Zoomnivå
- Skjulte lag
- Sidepanelfane

### Laste inn en forhåndsinnstilling

Klikk på en lagret forhåndsinnstilling for å umiddelbart bruke alle lagrede innstillinger med ett klikk.

### Slette en forhåndsinnstilling

Klikk **Slett** ved siden av en forhåndsinnstilling for å fjerne den.

---

*Tidslinjal v6.1.0 — Samarbeidsbasert operativ tidslinje*
