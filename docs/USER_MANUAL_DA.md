# Tidslinjal Brugermanual

**Version 6.1.0**

---

## Indholdsfortegnelse

1. [Oversigt](#1-oversigt)
2. [Kom i gang](#2-kom-i-gang)
3. [Brugerfladen](#3-brugerfladen)
4. [Navigering af tidslinjen](#4-navigering-af-tidslinjen)
5. [Begivenheder](#5-begivenheder)
6. [Begivenhedsstatus-arbejdsgang](#6-begivenhedsstatus-arbejdsgang)
7. [Kommentarer](#7-kommentarer)
8. [Lag](#8-lag)
9. [Alarmer og notifikationer](#9-alarmer-og-notifikationer)
10. [Øvelse og syntetisk tid](#10-øvelse-og-syntetisk-tid)
11. [Øvelsesfaser](#11-øvelsesfaser)
12. [Tidslåsning](#12-tidslåsning)
13. [Roller og rettigheder](#13-roller-og-rettigheder)
14. [Indstillinger](#14-indstillinger)
15. [Eksport og rapporter](#15-eksport-og-rapporter)
16. [Adminvisning](#16-adminvisning)
17. [Ure, nedtællinger og tidtagere](#17-ure-nedtællinger-og-tidtagere)
18. [Beslutningslog](#18-beslutningslog)
19. [Logbog](#19-logbog)
20. [Ressourcehåndtering](#20-ressourcehåndtering)
21. [Kortprojektion](#21-kortprojektion)
22. [Aftagelige vinduer](#22-aftagelige-vinduer)
23. [Integrationer og forbindelser](#23-integrationer-og-forbindelser)
24. [Skabeloner](#24-skabeloner)
25. [Tastatur- og musegenveje](#25-tastatur--og-musegenveje)
26. [Fejlfinding](#26-fejlfinding)
27. [Referencer og dokumentbibliotek](#27-referencer-og-dokumentbibliotek)
28. [Tilgængelighed](#28-tilgængelighed)
29. [Arbejdsområdets forudindstillinger](#29-arbejdsområdets-forudindstillinger)

---

## 1. Oversigt

**Tidslinjal** er et samarbejdsbaseret, webbaseret operativt tidslinjeværktøj til geografisk spredte teams. Det giver en delt, visuel kronologi af begivenheder til operationsplanlægning, koordinering og situationsbevidsthed — inklusive støtte til militære øvelser og nødsituationsøvelser med syntetisk tid.

Nøglefunktioner:
- Delt tidslinje med flere brugere og rollebaseret adgang
- Begivenhedslivscyklushåndtering med godkendelsesarbejdsgang
- Navngivne lag til at adskille aktivitetsstrømme
- Øvelsesstøtte med STARTEX/ENDEX og syntetisk "Dag N / T+T" tid
- Alarmnotifikationer i realtid via Server-Sent Events
- Eksport til ICS, JSON og CSV
- DTG (Date-Time Group) militært datoformat
- Højkontrasttilstand og farveblindhedspaletter
- Finsk (Suomi) sprogstøtte
- Referencedokumenthåndtering med kontrolsummer
- Arbejdsområdets forudindstillinger

---

## 2. Kom i gang

### Log ind

Gå til `http://<server>:<port>` (standard: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Brugernavn: [admin          ] │
│  Adgangskode:[••••••••••••••]  │
│                                 │
│         [ Log ind ]             │
└─────────────────────────────────┘
```

Standardoplysninger: `admin` / `admin`

> **Sikkerhedsnote:** Skift adminadgangskoden øjeblikkeligt efter første login med 🔑-knappen i øverste højre hjørne.

### Selvregistrering

Hvis administratoren har aktiveret selvregistrering, vises linket **"Ingen konto? Registrer dig"** på loginsiden. Der er fire registreringstilstande:

| Tilstand | Beskrivelse |
|---|---|
| **Åben** | Alle kan registrere sig; kontoen aktiveres med det samme |
| **Gennemgået** | Alle kan registrere sig; admin skal godkende kontoen før login tillades |
| **Generel invitation** | Registrering kræver en delt invitationskode fra admin |
| **Personlig invitation** | Registrering kræver en personlig engangskode som admin genererer per bruger |

### Nulstilling af adgangskode

Hvis du har registreret en e-mailadresse på din profil:

1. Klik på **Glemt adgangskode?** på loginsiden
2. Indtast dit brugernavn eller din e-mailadresse
3. Et nulstillingstoken genereres (vises på skærmen hvis ingen e-mailserver er konfigureret)
4. Klik på **Nulstil adgangskode**, indsæt token og vælg en ny adgangskode

### Skift adgangskode

Klik på **🔑**-knappen i sidehovedet. Indtast din nuværende adgangskode og derefter din nye adgangskode to gange.

---

## 3. Brugerfladen

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [I dag] [›] [⏱]  Vis: [Uge▼]  Opl.: [Time▼]      │
│             [🔍 Søg…] [🗂 Lag] [⬇ Eksporter] [📄 Rapport]            │
│                          [👤 Navn  rolle] [?][🔑][☰] [Log ud]        │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  SIDEPANEL      │
│                  TIDSLINJEGITTER                   │                 │
│  Tid  │  Man 01  │  Tir 02  │  Ons 03  │  ...     │  [Forklaring]   │
│ ──────┼──────────┼──────────┼──────────┤          │  [Alarmer]      │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │          │  [Lag]          │
│ 09:00 │          │ Gennemg. │          │          │  [Indstillinger]│
│ 10:00 │ ████████ │          │          │          │                 │
│       │ Stand-up │          │          │          │                 │
│ 11:00 │          │          │ ████████ │          │                 │
│       │          │          │ ENDEX    │          │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Sidehoved** — navigation, visningsvalg, søgning og brugerkontroller.

**Tidslinjegitter** — dage fra venstre til højre, tid oppefra og ned. Begivenheder vises som farvede blokke.

**Sidepanel** — fanerne Forklaring, Alarmer, Lag, Brugere (admin), Grupper (admin), Revisionslog (Gruppeleder+), Faser (Gruppeleder+), Indstillinger. Skift med ☰-knappen.

---

## 4. Navigering af tidslinjen

### Datonavigering

| Kontrol | Handling |
|---|---|
| **‹** / **›**-knapper | Gå et visningsinterval frem / tilbage |
| **I dag**-knap | Hop til i dag |
| **⏱**-knap | Rul gitteret til aktuel tid |

### Visningsinterval

Brug **Vis**-rullemenuen i værktøjslinjen:

```
Vis: [Dag ▼]
      Dag
      2 Dage
      3 Dage
      4 Dage
    ▶ Uge
      Måned
      2 Måneder
      3 Måneder
```

### Opløsning (slothøjde)

Brug **Opløsning**-rullemenuen:

```
Opløsning: [Time ▼]
            10 min
            15 min
          ▶ Time
            Dag
```

### Zoom

**Træk for at zoome** — klik og træk op/ned på tidskolonnen (venstre kant) for at øge eller mindske slothøjden. Træk **op** for at zoome ind, **ned** for at zoome ud.

**Dobbeltklik** på tidskolonnen for at nulstille zoom til 1×.

Tastatur: **+** / **-** for at zoome ind/ud i trin.

### Horisontal panorering

Midterklik og træk på tidslinjeområdet for at panorere venstre/højre.

---

## 5. Begivenheder

### Opret en begivenhed

Klik på en tom celle i tidslinjegitteret eller klik **+ Tilføj begivenhed** i sidehovedet.

```
┌─────────────────────── Tilføj begivenhed ─────────────────────────┐
│ Titel *  [                                                       ]  │
│                                                                      │
│ Type     [Aktivitet       ▼]   Farve  [■]                           │
│                                                                      │
│ Start *  [2025-06-01T10:00]    Slut  [2025-06-01T11:00]             │
│                                                                      │
│ Lag      [Masterlinjen    ▼]  Status [Planlagt          ▼]          │
│                                                                      │
│ Beskrivelse                                                          │
│ [                                                                ]   │
│                                                                      │
│ Deltagere  [—  ▼]   ☐ Heldagsbegivenhed (ingen specifik tid)       │
│                                                                      │
│ ☐ Tilbagevendende    Mønster [Ugentligt ▼]                          │
│ Slutdato  [               ]                                          │
│                                                                      │
│ Vedhæftning 📎 [Vælg fil]                                            │
│                                                                      │
│              [Annuller]   [Gem]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Begivenhedstyper

Hver begivenhedstype har en farvet blok og et ikon, der vises til **venstre** for begivenhedstitlen.

| Ikon | Type | Farve | Bemærkninger |
|---|---|---|---|
| — | **Begivenhed** | Blå | Generel forekomst |
| ⚡ | **Øjeblik** | Orange | Enkelt tidspunkt — ingen sluttid. Vises som en ◆ diamantmarkør. |
| 🤝 | **Møde** | Grå | Planlagt møde |
| 🏢 | **Fysisk møde** | Brændt orange | Fysisk møde på en bestemt lokation |
| ⚖️ | **Beslutning** | Grøn | Beslutningspunkt |
| ⏰ | **Tidsfrist** | Rød | Hård deadline |
| — | **Aktivitet** | Grøn | Arbejdsblok |
| 🔄 | **Gentagende** | Lilla | Skabelon til tilbagevendende aktiviteter |
| 📊 | **Rapportering** | Blågrøn | Rapport eller gennemgang |
| 📌 | **Tildelt opgave** | Orange | Opgave tildelt en person eller et team |
| 🧍 | **Dagligt standup** | Cyan | Kort dagligt statusmøde |

Ikonet ↻ (til venstre for titlen) angiver at begivenheden er del af en **tilbagevendende serie**. Brugerdefinerede typer kan have et eget emoji-ikon indstillet via **Indstillinger → Begivenhedstyper → Rediger**.

Slå alle ikoner til/fra globalt i **Indstillinger → Begivenhedsikoner**.

Brugerdefinerede typer kan tilføjes af brugere med Læs/Skriv+ fra indstillingspanelet.

### Øjebliksbegivenheder

Når **Øjeblik** vælges som type:
- Feltet **Slut** skjules (ingen varighed)
- Begivenheden vises som en smal vertikal markør med en ◆ diamant øverst
- Den kan ikke indstilles som tilbagevendende

### Heldagsbegivenheder

Markér **Heldagsbegivenhed (ingen specifik tid)** for en begivenhed der strækker sig over hele dagen:
- Start-/sluttidsfelterne skjules
- Begivenheden vises i det grå område uden for dagstimer
- Gentagelse er ikke tilgængelig for heldagsbegivenheder

### Deltagere

Feltet **Deltagere** markerer om aktiviteten involverer interne eller eksterne parter:

| Værdi | Mærke | Farve |
|---|---|---|
| — | intet | — |
| **Intern** | `INTERN` | Blågrøn |
| **Ekstern** | `EKSTERN` | Rød |

### Tilbagevendende begivenheder

Markér **Tilbagevendende**, vælg derefter et mønster:

| Mønster | Interval |
|---|---|
| Hvert 30. minut | 30 minutter |
| Hver time | 1 time |
| Hver 2. / 3. / 4. time | 2 / 3 / 4 timer |
| Dagligt | 1 dag |
| Ugentligt | 7 dage |
| Månedligt | ~1 måned |
| Kvartalsvis | ~3 måneder |

### Rediger og slet begivenheder

Klik på en begivenhedsblok for at åbne detaljevisningen. Klik **Rediger** for at ændre. Klik **Slet** (synligt for opretteren og admins) for at slette.

---

## 6. Begivenhedsstatus-arbejdsgang

Hver begivenhed har en status der skrider frem gennem en livscyklus:

```
planlagt ──► aktiv ──► besvaret ──► afsluttet ──► indsendt
                                                      │
                                           ┌──────────┤
                                           ▼          ▼
                                       verificeret  afvist
                                                      │
                                                (årsag kræves)
```

`annulleret` er tilgængelig i ethvert stadie.

### Overgange

| Fra → Til | Hvem kan handle |
|---|---|
| Enhver → enhver (undtagen verificer/afvis) | Opretter, Gruppeleder+ |
| besvaret | Rapportør, Opretter, Gruppeleder+ |
| indsendt → verificeret | Gruppeleder+ (registrerer hvem og hvornår) |
| indsendt → afvist | Gruppeleder+ (kræver afvisningsårsag) |

### Rapportørrollen

Brugere med rollen **Rapportør** kan:
- Skrive kommentarer til begivenheder
- Sætte status til `besvaret` eller `afsluttet` (kræver Gruppelederens godkendelse)

---

## 7. Kommentarer

Klik på en begivenhedsblok for at åbne detaljevisningen. Rul ned til **Kommentarer**.

- Alle autentificerede brugere kan læse kommentarer
- Læs/Skriv+-brugere kan skrive kommentarer
- Rapportører kan skrive kommentarer; statusændrende kommentarer kræver godkendelse
- Gruppeleder+ kan godkende eller slette ventende kommentarer

---

## 8. Lag

Lag er navngivne overlejringer oven på masterlinjen. De gør det muligt for forskellige teams at have separate begivenhedsspor med en fælles visning.

### Opret et lag

1. Åbn fanen **Lag** i sidepanelet eller klik **🗂 Lag** i værktøjslinjen
2. Klik **+ Nyt lag**
3. Indtast navn, farve, beskrivelse, synlighed og rettigheder

```
┌──────── Nyt lag ──────────────┐
│ Navn *   [Cyberteam         ] │
│ Farve    [■ #9B59B6          ]│
│ Beskrivelse [                ]│
│                               │
│ Synlighed  [Grupper       ▼] │
│ Rettighed  [Læs/Skriv    ▼]  │
│ Grupper    ☐ Alpha  ☐ Bravo  │
│                               │
│         [Annuller]  [Gem]     │
└───────────────────────────────┘
```

### Synlighed

| Indstilling | Hvem kan se laget |
|---|---|
| **Privat** | Kun ejeren |
| **Grupper** | Ejeren + medlemmer af valgte grupper |
| **Offentlig** | Alle autentificerede brugere |

### Skift lag

Klik **🗂 Lag** i værktøjslinjen for at åbne hurtigskiftboksen. Klik på et element for at skifte det. Flere lag kan være aktive samtidigt — markér afkrydsningsfelterne for de lag du vil se.

---

## 9. Alarmer og notifikationer

### Indstil en alarm

1. Klik på en begivenhedsblok for at åbne detaljevisningen
2. Klik **🔔 Indstil alarm**
3. Vælg varslingstid (på tidspunktet, 5/10/15/30 min, eller 1 time før)

### Alarmnotifikationer

Når en alarm udløses, vises et notifikationspanel øverst på skærmen:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarm — "ENDEX gennemgang" om 15 minutter (10:45)                  │
│                    [Luk] [📋 Vis begivenhed] [✓ ACK]                 │
└──────────────────────────────────────────────────────────────────────┘
```

- **Luk** — fjerner notifikationen uden kvittering.
- **📋 Vis begivenhed** — åbner begivenhedens detaljevisning direkte fra alarmen.
- **✓ ACK** — kvitterer alarmen og stopper eskalering.
- **Gå til møde**-knap — hvis begivenheden er et møde med URL (Teams/Zoom) vises en knap i alarmnotifikationen der åbner mødet direkte.

Ukvitterede alarmer eskalerer — de bliver orange, derefter pulserende røde hvert 60. sekund.

### Alarmrevisionslog

Hver alarmkvittering registreres i **Revisionsloggen** (tilgængelig for Gruppeleder og højere). Hver post inkluderer:
- Hvem der kvitterede alarmen (brugernavn og ID)
- Hvornår kvitteringen skete (tidsstempel)
- IP-adressen som systemet blev tilgået fra på tidspunktet

### Ure til flere tidszoner

Sidehovedet viser det primære realtidsur. Du kan tilføje et vilkårligt antal ure til andre tidszoner.

**Tilføj et ur:**
1. Klik på **+**-knappen til venstre for hoveduret i sidehovedet.
2. Indtast en kort etiket (f.eks. *Tallinn*, *Kyiv*, *Kabul*).
3. Vælg IANA-tidszone i rullemenuen.
4. Klik **Tilføj**. Uret vises øjeblikkeligt til venstre for hoveduret.

**Fjern et ur:** Klik **×** på urwidgeten, eller gå til **Indstillinger → Dato-/tidsformat → Yderligere tidszoner → Fjern**.

### Webhook-notifikationer

Konfigurer en webhook-URL i **Indstillinger** for også at modtage alarmnotifikationer via HTTP POST til Mattermost, Slack eller enhver HTTP-endpoint.

### Alarm-fanen i sidepanelet

Vis og håndter alle dine aktive alarmer fra fanen **Alarmer** i sidepanelet.

---

## 10. Øvelse og syntetisk tid

Til træningsøvelser understøtter Tidslinjal en "syntetisk tid"-tilstand der erstatter rigtige kalenderdatoer med øvelsesdags-/timeetiketter.

### Konfiguration (kun admin)

1. Åbn fanen **Indstillinger** i sidepanelet
2. Rul ned til **Øvelsesindstillinger**
3. Udfyld:
   - **Øvelsesnavn** — vises som et mærke i sidehovedet
   - **STARTEX** — den rigtige dato og tid der svarer til "Dag 1 T+0"
   - **ENDEX** — den rigtige dato og tid for øvelsens afslutning
4. Markér **Aktivér syntetisk tidsvisning**
5. Klik **Gem**

### Aktivér syntetisk tid

Knappen **🕐 T+** vises i værktøjslinjen når øvelsestilstanden er konfigureret. Klik for at skifte mellem rigtig og syntetisk tidsvisning.

### Tidslinjefrysning

I **Indstillinger**-panelet, brug **Frys/pausér tidslinjen** for at stoppe det syntetiske ur ved et bestemt tidspunkt. Klik **Genoptag** for at fjerne frysningen.

---

## 11. Øvelsesfaser

Gruppeledere og højere roller kan definere navngivne, farvede blokke der dækker hele tidslinjen for at vise øvelsesfaser.

1. Åbn fanen **Faser** i sidepanelet
2. Klik **+ Ny fase**
3. Indtast navn, farve, starttid, sluttid og visningsrækkefølge (0–9)

Faser vises som gennemsigtige farvebånd øverst i tidslinjegitteret.

---

## 12. Tidslåsning

Admins og brugere med flaget `kan_låse` kan låse tidsintervaller for at forhindre oprettelse af begivenheder.

1. Klik **🔒 Lås tidsslot** i sidehovedet (synligt for admin/kan_låse-brugere)
2. Indtast starttid, sluttid og årsag

Låste tidsslots vises som et rødstribet overlejring. Begivenheder kan ikke oprettes i låste tidsslots.

---

## 13. Roller og rettigheder

| Rolle | Forkortelse | Funktioner |
|---|---|---|
| **Observatør** | `observer` | Skrivebeskyttet adgang til tidslinje og begivenheder — kan ikke redigere, kommentere eller låse |
| **Læs** | `read` | Vis tidslinje, begivenheder, lag; indstil personlige alarmer |
| **Rapportør** | `reporter` | + Skriv kommentarer; sæt besvaret/afsluttet (med godkendelse) |
| **Læs/Skriv** | `readwrite` | + Opret/rediger egne begivenheder; opret begivenhedstyper og lag |
| **Gruppeleder** | `teamlead` | + Opret grupper; verificer/afvis indsendte begivenheder; vis revisionslog; håndter faser |
| **Operationsleder** | `oplead` | + Opret/rediger/slet begivenheder på masterlinjen |
| **Stabsassistent** | `staffofficer` | Samme rettigheder som operationsleder — alternativ betegnelse for stabspersonel |
| **Stabsofficer** | `staffofficer_full` | Samme som stabsassistent, men kræver mindst én J-betegnelse (J1–J9) |
| **Admin** | `admin` | Fuld adgang — håndter alle brugere, roller, låse, aktivitetsindstillinger, registrering |

Flaget `kan_låse` kan tildeles enhver bruger uanset rolle.

### J-betegnelser (Stabsofficersrollen)

**Stabsofficer** (`staffofficer_full`) kræver mindst én NATO J-betegnelse. Betegnelserne identificerer stabsgrenen:

| Kode | Gren |
|---|---|
| J1 | Personel |
| J2 | Efterretning |
| J3 | Operationer |
| J4 | Logistik |
| J5 | Planlægning |
| J6 | Kommunikation |
| J7 | Uddannelse |
| J8 | Finans |
| J9 | Civil-militært samarbejde |

---

## 14. Indstillinger

Åbn fanen **Indstillinger** i sidepanelet for at konfigurere dine indstillinger.

### Tema og visning

| Indstilling | Muligheder |
|---|---|
| **Tema** | Mørk / Lys / City Camo / Urban Camo |
| **Størrelse** | Lille / Normal / Stor / Enorm |
| **Sprog** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇫🇮 Suomi |
| **Dato-/tidsformat** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Tidsformat** | 24h / 12h |
| **Højkontrasttilstand** | Til / Fra |
| **Farveblindpalet** | Fra / Protanopi / Deuteranopi / Tritanopi |
| **Standard landingsvisning** | Gitter / Liste / Logbog / Beslutning / Kort / Rapporter |
| **Autofølg nu** | Til / Fra |
| **Standardinterval** | Dag / 3 Dage / Uge / 2 Uger / Måned |
| **Standardopløsning** | 10 min / 15 min / Time / Dag |
| **Ugen starter** | Mandag / Søndag |
| **Tooltipforsinkelse** | Øjeblikkeligt / 200 ms / 500 ms |
| **Bekræft træk-flyt** | Til / Fra |
| **Standard begivenhedstype** | enhver konfigureret type |
| **Velkomstbanner** | vises ved første login |

Sproget kan også ændres direkte med flagknapperne (🇬🇧 🇸🇪 🇫🇷 🇫🇮) i værktøjslinjen.

### Dato-/tidsformat og dagstimer

Afsnittet **Dato-/tidsformat** grupperer både formatvalg og konfiguration af dagstimer:

| Indstilling | Beskrivelse |
|---|---|
| **Datoformat** | ISO 8601 / UK / FR / SV |
| **Dag start** | Første time på arbejdsdagen |
| **Dag slut** | Sidste time på arbejdsdagen |

Tidsslots uden for dag start–slut vises grå/stiplede.

### Standardvisning

Klik på en af intervalknapperne (Dag / 2 Dage / 3 Dage / 4 Dage / Uge) for at indstille din standardvisning. Ændring af dette skifter også den aktuelle visning øjeblikkeligt.

### Begivenhedstypesynlighed

Slå individuelle begivenhedstyper til/fra. Skjulte typer er nedtonede i tidslinjen. Brugerdefinerede typer kan oprettes med knappen **+ Ny type** (Læs/Skriv+).

### Nutidsspor (rød linje)

| Indstilling | Beskrivelse |
|---|---|
| Vis / Skjul | Skift den røde linje |
| Farve | Linjefarve (standard rød) |
| Bredde | Linjetykkelse i pixels |
| Type | Solid / Stiplet / Prikket |
| H+N-etiket | Vis øvelsestimeetiket på linjen |

### Webhook / Notifikationer

Indtast en webhook-URL for at modtage alarmnotifikationer som HTTP POST-anmodninger:
- **Mattermost** — `{"text": "..."}` payload
- **Slack** — `{"text": "..."}` payload
- **Generisk** — fuldt alarm-JSON-payload

Klik **Test** for at sende en testnotifikation.

---

## 15. Eksport og rapporter

### Eksport

Klik **⬇ Eksporter** i værktøjslinjen for at åbne eksportmodalen:

| Format | Indhold |
|---|---|
| **ICS** | Begivenheder i aktuel visning som iCalendar; importer i enhver kalenderapp |
| **JSON** | Komplet systemeksport (alle begivenheder, brugere, grupper, lag, indstillinger) — kun admin |
| **CSV** | Begivenheder i aktuel visning som kommasepareret regneark |

### Rapporter

Klik **📄 Rapport** for at åbne rapportgeneratoren:

| Rapporttype | Beskrivelse |
|---|---|
| **Efterhandsvurdering (AAR)** | Oversigt over begivenheder grupperet efter status |
| **Tidslinjebillede** | Kronologisk liste over alle begivenheder i intervallet |
| **Per-lag-aktivitet** | Begivenheder opdelt per lag |

Vælg **HTML** for at vise i browseren, eller **Udskriv/PDF** for at udskrive eller gemme som PDF.

---

## 16. Adminvisning

Navigér til `/admin-view` (kræver rollen **Admin**) for et dedikeret administratordashboard.

---

## 17. Ure, nedtællinger og tidtagere

### Tidszoneurene
Uret i sidehovedet viser lokal realtid. Klik **+** for at tilføje ekstra tidszoner til distribuerede teams. Klik **⧉** for at frigøre alle ure til et separat vindue.

### VCR syvsegmentdisplay
Urene vises i retro VCR-stil med syvsegmentdisplay. Segmentfarver og tykkelse kan konfigureres.

### Nedtællingstimer
Opret nedtællingstimere der tæller ned til et måltidspunkt:
- Klik **+ Nedtælling** i urenes værktøjslinje
- Indstil måltidspunkt eller vælg fra en begivenheds start-/sluttid
- Nedtællingen viser resterende tid med en **fremskridtsindikator**
- En alarm udløses når nedtællingen når nul
- Klik **ACK** for at bekræfte

### Tidtagere
Opret tidtagere der tæller opad:
- Klik **+ Tidtager** i urenes værktøjslinje
- Konfigurer: varighed (timer/minutter/sekunder), forudindstillede knapper (5/10/15/30/60 min)
- Vælg om tidtageren skal stoppe eller fortsætte efter måltidspunktet
- Aktivér lydalarm ved måltidspunkt
- Tidtageren viser en **fremskridtsindikator** med overtidsmarkering

### Farvevælger
Urenes værktøjslinje indeholder farvevælgere:
| Vælger | Styrer |
|---|---|
| **BG** | Baggrundsfarve |
| **CD** | Nedtællingens accentfarve |
| **TM** | Tidtagerens accentfarve |

---

## 18. Beslutningslog
Beslutningsloggen giver struktureret sporing af beslutninger truffet under operationer eller øvelser.

### Opret en beslutning
1. Klik **+ Ny beslutning**
2. Udfyld titel, beskrivelse, status og ansvarlig
3. Vedhæft filer efter behov
4. Klik **Gem**

### Beslutningsstatus
| Status | Beskrivelse |
|---|---|
| **Foreslået** | Beslutning er fremlagt |
| **Godkendt** | Beslutning er godkendt |
| **Afvist** | Beslutning er afvist |

---

## 19. Logbog
Logbogen giver en kronologisk registrering af operative begivenheder, observationer og notater.
- Åbn **Logbog** fra sidepanelet (fanen Logge)
- Klik **+ Ny post** for at tilføje en logpost
- Poster tidsstemples og kobles til opretteren

---

## 20. Ressourcehåndtering
Håndter operative ressourcer (rum, bygninger, IT-tjenester, datacentre) fra sidepanelet.

### Ressourcetyper
| Type | Beskrivelse |
|---|---|
| **Rum** | Møderum, operationscentre |
| **Bygninger** | Fysiske bygninger og anlæg |
| **IT-tjenester** | IT-infrastruktur, servere, netværk |
| **Datacentre** | Datacenteranlæg |

### Opret en ressource
1. Åbn fanen **Ressourcer** i sidepanelet
2. Vælg ressourcetype
3. Klik **+ Tilføj**
4. Udfyld navn, beskrivelse, placering (lat/lng), billede og symbol
5. Klik **Gem**

---

## 21. Kortprojektion
Kortprojektionen giver en interaktiv geografisk visning af møder, brugere og ressourcer.

- **Kortlag** — skift mellem OpenStreetMap, Topografisk, Satellit og Mørk
- **Ressourceoverlejring** — vis/skjul rum, bygninger, IT-tjenester og datacentre
- **Adressesøgning** — geokod en adresse og zoom til placeringen
- **Symbolvælger** — vælg militære og operative kortsymboler til ressourcer og begivenheder
- **GeoJSON/KML-import** — indlæs eksterne geografiske datafiler
- **Tilpas alle** — autozoom for at vise alle synlige markører

---

## 22. Aftagelige vinduer
Flere visninger kan frigøres til separate browservinduer:
| Vindue | Beskrivelse |
|---|---|
| **Ure** | Alle ure, nedtællinger og tidtagere |
| **Sidepanel** | Fuldstændigt sidepanel med alle faner |
| **Beslutningslog** | Beslutningslogvisning |
| **Kortprojektion** | Interaktivt kort med alle overlejringer |

Tema, sprog og data synkroniseres automatisk via BroadcastChannel.

---

## 23. Integrationer og forbindelser

### Integrationsramme
Fanen Integrationer (Admin/Ops Lead) giver:
- **OIDC SSO** — Single Sign-On-konfiguration
- **SMTP-post** — udgående e-mail til alarmer og rapporter
- **Microsoft Teams** — webhook-integration
- **Zoom** — mødelinkintegration
- **API-nøgler** — generér bearer-tokens

### Begivenhedsforbindelser
| Forbindelse | Beskrivelse |
|---|---|
| **STIX/TAXII** | Importer cybertrusselefterretningsfeeds |
| **Syslog** | Modtag syslog-beskeder som begivenheder |

---

## 24. Skabeloner
Gem og genbrug sæt af begivenheder, faser, låse, grupper og lag:
- **Gem** — vælg datointerval; begivenheder lagres med relative offsets
- **Anvend** — angiv STARTEX/T=0; alle begivenheder genskabes; lag per begivenhed understøttes
- **Importer** — indlæs `.json`-skabelonfiler
- 31 eksempelskabeloner medfølger: 20 øvelsesskabeloner og 11 hændelsesskabeloner

---

## 25. Tastatur- og musegenveje

### Mus

| Handling | Resultat |
|---|---|
| Klik på et tomt tidsslot | Åbn Tilføj begivenhed ved det tidspunkt |
| Klik på begivenhedsblok | Åbn begivenhedsdetaljer |
| Træk begivenhedsblok | Flyt til målslot |
| Træk tidskolonne | Zoom slothøjde (op = zoom ind) |
| Dobbeltklik tidskolonne | Nulstil zoom til 1× |
| Midterklik-træk tidslinje | Panorér horisontalt |

### Tastatur

| Tast | Handling |
|---|---|
| `←` / `→` | Navigér et interval frem / tilbage |
| `T` | Hop til i dag |
| `N` | Rul til aktuel tid |
| `E` | Åbn Tilføj begivenhed-dialogen |
| `?` eller `H` | Åbn indbygget hjælp |
| `Esc` | Luk aktuel modal |
| `+` / `-` | Zoom slothøjde ind/ud |
| `F` | Frys / genoptag syntetisk tid |

---

## 26. Fejlfinding

### Kan ikke logge ind
- Kontrollér brugernavn og adgangskode (standard: `admin` / `admin`)
- Sørg for at serveren kører: `./tidslinjal --port 8080`
- Kontrollér serverloggen for fejl

### Begivenheder vises ikke
- Kontrollér **Vis**-datointervallet — du viser muligvis et interval der ikke inkluderer dine begivenheder
- Kontrollér **Lag**-filter — klik 🗂 og sørg for at de rigtige lag er aktive
- Kontrollér **Begivenhedstypesynlighed** i Indstillinger — skjulte typer vises ikke

### Alarmen udløses ikke
- SSE kræver en vedvarende browserforbindelse — sørg for at siden er åben
- Kontrollér at browsernotifikationer er tilladt for webstedet
- Verificér alarmens varslingstid: ved 0 min udløses alarmen præcis ved begivenhedens starttid

### Lagskift fungerer ikke
- Klik **🗂 Lag** i værktøjslinjen
- Vælg **Masterlinjen** for at vise alle lag
- Eller vælg individuelle lag for at filtrere

### Eksporten giver en tom fil
- Sørg for at der er begivenheder i det aktuelle visningsinterval
- Justér **Vis**-intervallet for at inkludere ønskede begivenheder

### Datakatalogen er ikke skrivbar
- Sørg for at katalogen `data/` findes og er skrivbar af serverprocessen
- Brug `--data /sti/til/skrivbar/katalog` eller indstil miljøvariablen `DATA_DIR`

---

## 27. Referencer og dokumentbibliotek

Referencebiblioteket gør det muligt at håndtere dokumenter og links knyttet til operationer og øvelser.

### Upload referencer

Upload referencer som fil, URL eller lokal tekst. Systemet understøtter masseupload (flere filer samtidigt) og automatisk filtypedetektering.

### Referencemetadata

Hver reference har følgende metadata:

| Felt | Beskrivelse |
|---|---|
| **Titel** | Referencens navn |
| **Beskrivelse** | Kort sammenfatning |
| **Kategori** | Klassificering (se nedenfor) |
| **Tags** | Fritekst-tags til søgning |
| **Sprog** | Dokumentets sprog |
| **Ejer** | Ansvarlig person |
| **Forvalter** | Person der vedligeholder dokumentet |
| **Kopieringstilstand** | Hvordan dokumentet lagres (se nedenfor) |

### Kategorier

| Kategori |
|---|
| Håndbog |
| SOP |
| Politik |
| Kort |
| Reference |
| Checkliste |
| FAQ |
| Mål |
| Øvrigt |

### Kopieringstilstande

| Tilstand | Beskrivelse |
|---|---|
| **Central kopi** | Filen lagres centralt på serveren |
| **Lokal kopi** | Filen lagres lokalt hos brugeren |
| **Vis link** | Ingen kopi — kun et link til originalkilden |

### Rediger referencemetadata

Klik på en reference for at åbne detaljevisningen. Klik **Rediger** for at ændre metadata.

### Kryptografiske kontrolsummer

Systemet beregner automatisk kryptografiske kontrolsummer for uploadede filer:

| Algoritme |
|---|
| MD5 |
| SHA-1 |
| SHA-256 |
| SHA-512 |

Klik på **Vis kontrolsummer** for at åbne kontrolsummemodalen med alle beregnede værdier.

### Søgning og filtrering

Brug søgefeltet og kategorifiltre til at finde referencer. Filtrer på kategori, tags og fritekst.

---

## 28. Tilgængelighed

### Højkontrasttilstand

Højkontrasttilstand kan lægges oven på ethvert tema og forstærker synligheden af:
- Gitterlinjer
- Tidsmarkører
- Fasebånd
- Låseoverlejringer
- Markerede begivenheder

Aktivér via **Indstillinger → Tema og visning → Højkontrasttilstand**.

### Farveblindpaletter

Tre farveblindpaletter er tilgængelige:

| Palet | Type |
|---|---|
| **Protanopi** | Rød-grøn farveblindhed |
| **Deuteranopi** | Grøn-rød farveblindhed |
| **Tritanopi** | Blå-gul farveblindhed |

Aktivér via **Indstillinger → Tema og visning → Farveblindpalet**.

Højkontrasttilstand og farveblindpaletter kan aktiveres samtidigt.

---

## 29. Arbejdsområdets forudindstillinger

Gem og gendan navngivne arbejdsområdeforudindstillinger til hurtig adgang til dine mest brugte visninger.

### Gem en forudindstilling

En forudindstilling gemmer følgende indstillinger:
- Visning (gitter, liste, logbog, beslutning, kort, rapporter)
- Interval
- Opløsning
- Zoomniveau
- Skjulte lag
- Sidepanelfane

### Indlæs en forudindstilling

Klik på en gemt forudindstilling for øjeblikkeligt at anvende alle gemte indstillinger med ét klik.

### Slet en forudindstilling

Klik **Slet** ved siden af en forudindstilling for at fjerne den.

---

*Tidslinjal v6.1.0 — Samarbejdsbaseret operativ tidslinje*
