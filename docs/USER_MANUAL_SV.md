# Tidslinjal Användarmanual

**Version 6.0.0**

---

## Innehållsförteckning

1. [Översikt](#1-översikt)
2. [Komma igång](#2-komma-igång)
3. [Gränssnittet](#3-gränssnittet)
4. [Navigera tidslinjen](#4-navigera-tidslinjen)
5. [Händelser](#5-händelser)
6. [Händelsestatus-arbetsflöde](#6-händelsestatus-arbetsflöde)
7. [Kommentarer](#7-kommentarer)
8. [Lager](#8-lager)
9. [Larm och notifieringar](#9-larm-och-notifieringar)
10. [Övning och syntetisk tid](#10-övning-och-syntetisk-tid)
11. [Övningsfaser](#11-övningsfaser)
12. [Tidsluckslåsning](#12-tidsluckslåsning)
13. [Roller och behörigheter](#13-roller-och-behörigheter)
14. [Inställningar](#14-inställningar)
15. [Export och rapporter](#15-export-och-rapporter)
16. [Adminvy](#16-adminvy)
17. [Klockor, nedräkningar och tidtagare](#17-klockor-nedräkningar-och-tidtagare)
18. [Beslutslogg](#18-beslutslogg)
19. [Loggbok](#19-loggbok)
20. [Resurshantering](#20-resurshantering)
21. [Kartprojektion](#21-kartprojektion)
22. [Avtagbara fönster](#22-avtagbara-fönster)
23. [Integrationer och anslutningar](#23-integrationer-och-anslutningar)
24. [Mallar](#24-mallar)
25. [Tangentbords- och musgenvägar](#25-tangentbords--och-musgenvägar)
26. [Felsökning](#26-felsökning)

---

## 1. Översikt

**Tidslinjal** är ett samarbetsbaserat, webbaserat operativt tidslinje-verktyg för geografiskt utspridda team. Det ger en delad, visuell kronologi av händelser för operationsplanering, koordinering och lägesuppfattning — inklusive stöd för militära och nödlägesövningar med syntetisk tid.

Nyckelfunktioner:
- Delad tidslinje med flera användare och rollbaserad åtkomst
- Händelselivscykelhantering med godkännandearbetsflöde
- Namngivna lager för att separera aktivitetsströmmar
- Övningsstöd med STARTEX/ENDEX och syntetisk "Dag N / T+T" tid
- Larmeddelanden i realtid via Server-Sent Events
- Export till ICS, JSON och CSV

---

## 2. Komma igång

### Logga in

Gå till `http://<server>:<port>` (standard: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Användarnamn: [admin         ] │
│  Lösenord:     [••••••••••••••] │
│                                 │
│         [ Logga in ]            │
└─────────────────────────────────┘
```

Standarduppgifter: `admin` / `admin`

> **Säkerhetsnotering:** Byt adminlösenordet omedelbart efter första inloggning med 🔑-knappen i övre högra hörnet.

### Självregistrering

Om administratören har aktiverat självregistrering visas länken **"Inget konto? Registrera dig"** på inloggningssidan. Det finns fyra registreringslägen:

| Läge | Beskrivning |
|---|---|
| **Öppen** | Vem som helst kan registrera sig; kontot aktiveras direkt |
| **Granskad** | Vem som helst kan registrera sig; admin måste godkänna kontot innan inloggning tillåts |
| **Generell inbjudan** | Registrering kräver en delad inbjudningskod som adminen tillhandahåller |
| **Personlig inbjudan** | Registrering kräver en personlig engångskod som adminen genererar per användare |

### Lösenordsåterställning

Om du har registrerat en e-postadress på din profil:

1. Klicka på **Glömt lösenord?** på inloggningssidan
2. Ange ditt användarnamn eller din e-postadress
3. En återställningstoken genereras (visas på skärmen om ingen e-postserver är konfigurerad)
4. Klicka på **Återställ lösenord**, klistra in token och välj ett nytt lösenord

### Byta lösenord

Klicka på **🔑**-knappen i sidhuvudet. Ange ditt nuvarande lösenord och sedan ditt nya lösenord två gånger.

---

## 3. Gränssnittet

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Idag] [›] [⏱]  Visa: [Vecka▼]  Upl.: [Timme▼]   │
│             [🔍 Sök…] [🗂 Lager] [⬇ Exportera] [📄 Rapport]          │
│                          [👤 Namn  roll] [?][🔑][☰] [Logga ut]       │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  SIDOPANEL      │
│                  TIDSLINJEGRID                     │                 │
│  Tid  │  Mån 01  │  Tis 02  │  Ons 03  │  ...     │  [Förklaring]   │
│ ──────┼──────────┼──────────┼──────────┤          │  [Larm]         │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │          │  [Lager]        │
│ 09:00 │          │ Genomg.  │          │          │  [Inställningar]│
│ 10:00 │ ████████ │          │          │          │                 │
│       │ Stand-up │          │          │          │                 │
│ 11:00 │          │          │ ████████ │          │                 │
│       │          │          │ ENDEX    │          │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**Sidhuvud** — navigering, vyval, sökning och användarkontroller.

**Tidslinjegrid** — dagar från vänster till höger, tid uppifrån och ner. Händelser visas som färgade block.

**Sidopanel** — flikarna Förklaring, Larm, Lager, Användare (admin), Grupper (admin), Granskningslogg (Gruppledare+), Faser (Gruppledare+), Inställningar. Växla med ☰-knappen.

---

## 4. Navigera tidslinjen

### Datumnavigering

| Kontroll | Åtgärd |
|---|---|
| **‹** / **›**-knappar | Stega bakåt / framåt ett visningsintervall |
| **Idag**-knapp | Hoppa till idag |
| **⏱**-knapp | Scrolla griden till aktuell tid |

### Visningsintervall

Använd **Visa**-rullgardinsmenyn i verktygsfältet:

```
Visa: [Dag ▼]
       Dag
       2 Dagar
       3 Dagar
       4 Dagar
     ▶ Vecka
       Månad
       2 Månader
       3 Månader
```

### Upplösning (slothöjd)

Använd **Upplösning**-rullgardinsmenyn:

```
Upplösning: [Timme ▼]
             10 min
             15 min
           ▶ Timme
             Dag
```

### Zoom

**Dra för att zooma** — klicka och dra uppåt/nedåt på tidskolumnen (vänster kant) för att öka eller minska slothöjden. Dra **uppåt** för att zooma in, **nedåt** för att zooma ut.

**Dubbelklicka** på tidskolumnen för att återställa zoom till 1×.

Tangentbord: **+** / **-** för att zooma in/ut i steg.

### Horisontell panorering

Mellanklicka och dra på tidslinje-området för att panorera vänster/höger.

---

## 5. Händelser

### Skapa en händelse

Klicka på en tom cell i tidslinjegriden eller klicka **+ Lägg till händelse** i sidhuvudet.

```
┌─────────────────────── Lägg till händelse ───────────────────────────┐
│ Titel *  [                                                        ]   │
│                                                                       │
│ Typ      [Aktivitet       ▼]   Färg  [■]                             │
│                                                                       │
│ Start *  [2025-06-01T10:00]    Slut  [2025-06-01T11:00]              │
│                                                                       │
│ Lager    [Masterlinjen    ▼]  Status [Planerad         ▼]            │
│                                                                       │
│ Beskrivning                                                           │
│ [                                                                 ]   │
│                                                                       │
│ Deltagare  [—  ▼]   ☐ Dagshändelse (ingen specifik tid)              │
│                                                                       │
│ ☐ Återkommande    Mönster [Veckovis ▼]                               │
│ Slutdatum  [               ]                                          │
│                                                                       │
│ Bilaga 📎 [Välj fil]                                                  │
│                                                                       │
│              [Avbryt]   [Spara]                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Händelsetyper

Varje händelsetyp har ett färgat block och en ikon som visas till **vänster** om händelsetiteln.

| Ikon | Typ | Färg | Anteckningar |
|---|---|---|---|
| — | **Händelse** | Blå | Allmän förekomst |
| ⚡ | **Ögonblick** | Orange | Enstaka tidpunkt — ingen sluttid. Renderas som en ◆ diamantmarkör. |
| 🤝 | **Möte** | Grå | Schemalagt möte |
| 🏢 | **Fysiskt möte** | Bränt orange | Fysiskt möte på en specifik plats |
| ⚖️ | **Beslut** | Grön | Beslutspunkt |
| ⏰ | **Tidsgräns** | Röd | Hård deadline |
| — | **Aktivitet** | Grön | Arbetsblock |
| 🔄 | **Upprepande** | Lila | Mall för återkommande aktiviteter |
| 📊 | **Rapportering** | Blågrön | Rapport eller genomgång |
| 📌 | **Tilldelad uppgift** | Orange | Uppgift tilldelad en person eller ett team |
| 🧍 | **Daglig standup** | Cyan | Kort dagligt statusmöte |

Ikonen ↻ (till vänster om titeln) anger att händelsen är del av en **återkommande serie**. Anpassade typer kan ha en egen emoji-ikon inställd via **Inställningar → Händelsetyper → Redigera**.

Slå på/av alla ikoner globalt i **Inställningar → Händelseikoner**.

Anpassade typer kan läggas till av användare med Läs/Skriv+ från inställningspanelen.

### Ögonblickshändelser

När **Ögonblick** väljs som typ:
- Fältet **Slut** döljs (ingen varaktighet)
- Händelsen renderas som en smal vertikal markör med en ◆ diamant överst
- Den kan inte ställas in som återkommande

### Dagshändelser

Markera **Dagshändelse (ingen specifik tid)** för en händelse som sträcker sig över hela dagen:
- Start-/sluttidsfälten döljs
- Händelsen visas i det gråa området utanför dagstimmar
- Upprepning är inte tillgänglig för dagshändelser

### Deltagare

Fältet **Deltagare** markerar om aktiviteten involverar interna eller externa parter:

| Värde | Märke | Färg |
|---|---|---|
| — | inget | — |
| **Intern** | `INTERN` | Blågrön |
| **Extern** | `EXTERN` | Röd |

### Återkommande händelser

Markera **Återkommande**, välj sedan ett mönster:

| Mönster | Intervall |
|---|---|
| Var 30:e minut | 30 minuter |
| Varje timme | 1 timme |
| Varannan / var 3:e / var 4:e timme | 2 / 3 / 4 timmar |
| Dagligen | 1 dag |
| Veckovis | 7 dagar |
| Månadsvis | ~1 månad |
| Kvartalsvis | ~3 månader |

### Redigera och ta bort händelser

Klicka på ett händelseblock för att öppna detaljvyn. Klicka **Redigera** för att ändra. Klicka **Ta bort** (synligt för skaparen och admins) för att ta bort.

---

## 6. Händelsestatus-arbetsflöde

Varje händelse har en status som fortskrider genom en livscykel:

```
planerad ──► aktiv ──► besvarad ──► avslutad ──► inskickad
                                                      │
                                           ┌──────────┤
                                           ▼          ▼
                                       verifierad  avvisad
                                                      │
                                                (orsak krävs)
```

`avbruten` är tillgänglig i vilket stadium som helst.

### Övergångar

| Från → Till | Vem kan agera |
|---|---|
| Valfri → valfri (utom verifiera/avvisa) | Skapare, Gruppledare+ |
| besvarad | Rapportör, Skapare, Gruppledare+ |
| inskickad → verifierad | Gruppledare+ (registrerar vem och när) |
| inskickad → avvisad | Gruppledare+ (kräver avvisningsorsak) |

### Rapportörsrollen

Användare med rollen **Rapportör** kan:
- Posta kommentarer på händelser
- Ange status som `besvarad` eller `avslutad` (kräver Gruppledarens godkännande)

---

## 7. Kommentarer

Klicka på ett händelseblock för att öppna detaljvyn. Scrolla ner till **Kommentarer**.

- Alla autentiserade användare kan läsa kommentarer
- Läs/Skriv+-användare kan posta kommentarer
- Rapportörer kan posta kommentarer; statuständrande kommentarer kräver godkännande
- Gruppledare+ kan godkänna eller ta bort väntande kommentarer

---

## 8. Lager

Lager är namngivna överlägg ovanpå masterlinjen. De gör det möjligt för olika team att ha separata händelsespår med en gemensam vy.

### Skapa ett lager

1. Öppna fliken **Lager** i sidopanelen eller klicka **🗂 Lager** i verktygsfältet
2. Klicka **+ Nytt lager**
3. Ange namn, färg, beskrivning, synlighet och behörigheter

```
┌──────── Nytt lager ────────────┐
│ Namn *   [Cyberteam         ]  │
│ Färg     [■ #9B59B6          ]  │
│ Beskrivning [                 ]│
│                                │
│ Synlighet  [Grupper       ▼]   │
│ Behörighet [Läs/Skriv    ▼]    │
│ Grupper    ☐ Alpha  ☐ Bravo    │
│                                │
│         [Avbryt]  [Spara]      │
└────────────────────────────────┘
```

### Synlighet

| Inställning | Vem kan se lagret |
|---|---|
| **Privat** | Bara ägaren |
| **Grupper** | Ägare + medlemmar i valda grupper |
| **Offentlig** | Alla autentiserade användare |

### Växla lager

Klicka **🗂 Lager** i verktygsfältet för att öppna snabbväxlingsrutan. Klicka på ett objekt för att växla det. Flera lager kan vara aktiva samtidigt — markera kryssrutorna för de lager du vill se.

---

## 9. Larm och notifieringar

### Ställa in ett larm

1. Klicka på ett händelseblock för att öppna detaljvyn
2. Klicka **🔔 Ställ larm**
3. Välj ledtid (vid tidpunkten, 5/10/15/30 min, eller 1 timme innan)

### Larmnotifieringar

När ett larm utlöses visas en notifieringspanel överst på skärmen:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Larm — "ENDEX genomgång" om 15 minuter (10:45)                    │
│                    [Stäng] [📋 Visa händelse] [✓ ACK]               │
└──────────────────────────────────────────────────────────────────────┘
```

- **Stäng** — tar bort notifieringen utan kvittering.
- **📋 Visa händelse** — öppnar händelsens detaljvy direkt från larmet.
- **✓ ACK** — kvitterar larmet och stoppar eskalering.

Okvitterade larm eskalerar — de blir orange, sedan pulserande röda var 60:e sekund.

### Larmgranskningslogg

Varje larmkvittering registreras i **Granskningsloggen** (tillgänglig för Gruppledare och högre). Varje post inkluderar:
- Vem som kvitterade larmet (användarnamn och ID)
- När kvitteringen skedde (tidsstämpel)
- IP-adressen som systemet nåddes från vid tillfället

### Klockor för flera tidszoner

Rubriken visar den primära realtidsklockan. Du kan lägga till valfritt antal klockor för andra tidszoner.

**Lägga till en klocka:**
1. Klicka på **+**-knappen till vänster om huvudklockan i rubriken.
2. Ange en kort etikett (t.ex. *Tallinn*, *Kyiv*, *Kabul*).
3. Välj IANA-tidszon i rullgardinsmenyn.
4. Klicka **Lägg till**. Klockan visas omedelbart till vänster om huvudklockan.

**Ta bort en klocka:** Klicka **×** på klockwidgeten, eller gå till **Inställningar → Datum/tid-format → Ytterligare tidszoner → Ta bort**.

### Webhook-notifieringar

Konfigurera en webhook-URL i **Inställningar** för att också ta emot larmnotifieringar via HTTP POST till Mattermost, Slack eller valfri HTTP-endpoint.

### Larm-fliken i sidopanelen

Visa och hantera alla dina aktiva larm från fliken **Larm** i sidopanelen.

---

## 10. Övning och syntetisk tid

För träningsövningar stöder Tidslinjal ett "syntetisk tid"-läge som ersätter riktiga kalenderdatum med övningsdags-/timmetiketter.

### Konfiguration (Bara admin)

1. Öppna fliken **Inställningar** i sidopanelen
2. Scrolla ner till **Övningsinställningar**
3. Fyll i:
   - **Övningsnamn** — visas som ett märke i sidhuvudet
   - **STARTEX** — det riktiga datumet och tid som mappar till "Dag 1 T+0"
   - **ENDEX** — det riktiga datumet och tid för övningens slut
4. Markera **Aktivera syntetisk tidsvisning**
5. Klicka **Spara**

### Aktivera syntetisk tid

Knappen **🕐 T+** visas i verktygsfältet när övningsläget är konfigurerat. Klicka för att växla mellan riktig och syntetisk tidsvisning.

### Tidslinjefrysen

I **Inställningar**-panelen, använd **Frys/pausa tidslinjen** för att stoppa den syntetiska klockan vid en specifik tidpunkt. Klicka **Återuppta** för att ta bort frysningen.

---

## 11. Övningsfaser

Gruppledare och högre roller kan definiera namngivna, färgade block som täcker hela tidslinjen för att visa övningsfaser.

1. Öppna fliken **Faser** i sidopanelen
2. Klicka **+ Ny fas**
3. Ange namn, färg, starttid, sluttid och visningsordning (0–9)

Faser visas som genomskinliga färgband längst upp i tidslinjegriden.

---

## 12. Tidsluckslåsning

Admins och användare med flaggan `kan_låsa` kan låsa tidsintervall för att förhindra skapande av händelser.

1. Klicka **🔒 Lås tidslucka** i sidhuvudet (synligt för admin/kan_låsa-användare)
2. Ange starttid, sluttid och orsak

Låsta tidsluckor visas som ett rödstreckigt överlägg. Händelser kan inte skapas i låsta tidsluckor.

---

## 13. Roller och behörigheter

| Roll | Förkortning | Funktioner |
|---|---|---|
| **Observatör** | `observer` | Skrivskyddad åtkomst till tidslinje och händelser — kan inte redigera, kommentera eller låsa |
| **Läs** | `read` | Visa tidslinje, händelser, lager; ställa in personliga larm |
| **Rapportör** | `reporter` | + Posta kommentarer; ange besvarad/avslutad (med godkännande) |
| **Läs/Skriv** | `readwrite` | + Skapa/redigera egna händelser; skapa händelsetyper och lager |
| **Gruppledare** | `teamlead` | + Skapa grupper; verifiera/avvisa inskickade händelser; visa granskningslogg; hantera faser |
| **Operationsledare** | `oplead` | + Skapa/redigera/ta bort händelser på masterlinjen |
| **Stabsassistent** | `staffofficer` | Samma rättigheter som operationsledare — alternativ beteckning för stabspersonal |
| **Stabsofficer** | `staffofficer_full` | Samma som stabsassistent, men kräver minst en J-beteckning (J1–J9) |
| **Admin** | `admin` | Full åtkomst — hantera alla användare, roller, lås, aktivitetsinställningar, registrering |

Flaggan `kan_låsa` kan tilldelas vilken användare som helst oavsett roll.

### J-beteckningar (Stabsofficersrollen)

**Stabsofficer** (`staffofficer_full`) kräver minst en NATO J-beteckning. Beteckningarna identifierar stabsgrenen:

| Kod | Gren |
|---|---|
| J1 | Personal |
| J2 | Underrättelser |
| J3 | Operationer |
| J4 | Logistik |
| J5 | Planering |
| J6 | Kommunikation |
| J7 | Utbildning |
| J8 | Finans |
| J9 | Civil-militärt samarbete |

---

## 14. Inställningar

Öppna fliken **Inställningar** i sidopanelen för att konfigurera dina inställningar.

### Tema och display

| Inställning | Alternativ |
|---|---|
| **Tema** | Mörkt / Ljust / City Camo / Urban Camo |
| **Storlek** | Liten / Normal / Stor / Enorm |
| **Språk** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français |
| **Datum-/tidsformat** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) |

Språket kan också ändras direkt med flaggknapparna (🇬🇧 🇸🇪 🇫🇷) i verktygsfältet.

### Datum-/tidsformat och dagstimmar

Avsnittet **Datum-/tidsformat** grupperar både formatval och konfiguration av dagstimmar:

| Inställning | Beskrivning |
|---|---|
| **Datumformat** | ISO 8601 / UK / FR / SV |
| **Dag start** | Första timmen på arbetsdagen |
| **Dag slut** | Sista timmen på arbetsdagen |

Tidsluckor utanför dag start–slut visas grå/streckade.

### Standardvy

Klicka på en av intervallknapparna (Dag / 2 Dagar / 3 Dagar / 4 Dagar / Vecka) för att ange din standardvy. Att ändra detta växlar också den aktuella vyn omedelbart.

### Händelsetypsynlighet

Slå på/av enskilda händelsetyper. Dolda typer är nedtonade i tidslinjen. Anpassade typer kan skapas med knappen **+ Ny typ** (Läs/Skriv+).

### Nulägesspår (röd linje)

| Inställning | Beskrivning |
|---|---|
| Visa / Dölj | Växla den röda linjen |
| Färg | Linjefärg (standard röd) |
| Bredd | Linjetjocklek i pixlar |
| Typ | Solid / Streckad / Prickad |
| H+N-etikett | Visa övningstimme-etikett på linjen |

### Webhook / Notifieringar

Ange en webhook-URL för att ta emot larmnotifieringar som HTTP POST-förfrågningar:
- **Mattermost** — `{"text": "..."}` payload
- **Slack** — `{"text": "..."}` payload
- **Generisk** — fullt larm-JSON-payload

Klicka **Testa** för att skicka en testnotifiering.

---

## 15. Export och rapporter

### Export

Klicka **⬇ Exportera** i verktygsfältet för att öppna exportmodalen:

| Format | Innehåll |
|---|---|
| **ICS** | Händelser i aktuell vy som iCalendar; importera i valfri kalenderapp |
| **JSON** | Komplett systemexport (alla händelser, användare, grupper, lager, inställningar) — bara admin |
| **CSV** | Händelser i aktuell vy som kommaseparerat kalkylblad |

### Rapporter

Klicka **📄 Rapport** för att öppna rapportgeneratorn:

| Rapporttyp | Beskrivning |
|---|---|
| **Efterhandsbedömning (AAR)** | Sammanfattning av händelser grupperade efter status |
| **Tidslinjebild** | Kronologisk lista över alla händelser i intervallet |
| **Per-lager-aktivitet** | Händelser uppdelade per lager |

Välj **HTML** för att visa i webbläsaren, eller **Skriv ut/PDF** för att skriva ut eller spara som PDF.

---

## 16. Adminvy

Navigera till `/admin-view` (kräver rollen **Admin**) för en dedikerad administratörsdashboard.

---

## 17. Klockor, nedräkningar och tidtagare

### Tidszonsklockorna
Klockan i sidhuvudet visar lokal realtid. Klicka **+** för att lägga till extra tidszoner för distribuerade team. Klicka **⧉** för att frigöra alla klockor till ett separat fönster.

### VCR sjusegmentdisplay
Klockorna visas i retro VCR-stil med sjusegmentdisplay. Segmentfärger och tjocklek kan konfigureras.

### Nedräkningstimer
Skapa nedräkningstimer som räknar ner till en måltid:
- Klicka **+ Nedräkning** i klockornas verktygsfält
- Ställ in måltid eller välj från en händelses start/sluttid
- Nedräkningen visar kvarvarande tid med en **framstegsindikator**
- Ett larm utlöses när nedräkningen når noll
- Klicka **ACK** för att bekräfta

### Tidtagare
Skapa tidtagare som räknar uppåt:
- Klicka **+ Tidtagare** i klockornas verktygsfält
- Konfigurera: varaktighet (timmar/minuter/sekunder), förinställda knappar (5/10/15/30/60 min)
- Välj om tidtagaren ska stoppa eller fortsätta efter måltiden
- Aktivera ljudlarm vid måltid
- Tidtagaren visar en **framstegsindikator** med övertidsmarkering

### Färgväljare
Klockornas verktygsfält innehåller färgväljare:
| Väljare | Styr |
|---|---|
| **BG** | Bakgrundsfärg |
| **CD** | Nedräkningens accentfärg |
| **TM** | Tidtagarens accentfärg |

---

## 18. Beslutslogg
Beslutsloggen ger strukturerad spårning av beslut som fattas under operationer eller övningar.

### Skapa ett beslut
1. Klicka **+ Nytt beslut**
2. Fyll i titel, beskrivning, status och ansvarig
3. Bifoga filer vid behov
4. Klicka **Spara**

### Beslutsstatus
| Status | Beskrivning |
|---|---|
| **Föreslagen** | Beslut har lagts fram |
| **Godkänd** | Beslut har godkänts |
| **Avvisad** | Beslut har avvisats |

---

## 19. Loggbok
Loggboken ger en kronologisk registrering av operativa händelser, observationer och anteckningar.
- Öppna **Loggbok** från sidofältet (fliken Loggar)
- Klicka **+ Ny post** för att lägga till en loggpost
- Poster tidsstämplas och kopplas till skaparen

---

## 20. Resurshantering
Hantera operativa resurser (rum, byggnader, IT-tjänster, datacenter) från sidofältet.

### Resurstyper
| Typ | Beskrivning |
|---|---|
| **Rum** | Mötesrum, operationscentraler |
| **Byggnader** | Fysiska byggnader och anläggningar |
| **IT-tjänster** | IT-infrastruktur, servrar, nätverk |
| **Datacenter** | Datacenteranläggningar |

### Skapa en resurs
1. Öppna fliken **Resurser** i sidofältet
2. Välj resurstyp
3. Klicka **+ Lägg till**
4. Fyll i namn, beskrivning, plats (lat/lng), bild och symbol
5. Klicka **Spara**

---

## 21. Kartprojektion
Kartprojektionen ger en interaktiv geografisk vy över möten, användare och resurser.

- **Kartlager** — byt mellan OpenStreetMap, Topografisk, Satellit och Mörk
- **Resursöverlägg** — visa/dölj rum, byggnader, IT-tjänster och datacenter
- **Adresssökning** — geokoda en adress och zooma till platsen
- **GeoJSON/KML-import** — ladda externa geografiska datafiler
- **Anpassa alla** — automazooma för att visa alla synliga markörer

---

## 22. Avtagbara fönster
Flera vyer kan frigöras till separata webbläsarfönster:
| Fönster | Beskrivning |
|---|---|
| **Klockor** | Alla klockor, nedräkningar och tidtagare |
| **Sidofält** | Fullständigt sidofält med alla flikar |
| **Beslutslogg** | Beslutsloggvy |
| **Kartprojektion** | Interaktiv karta med alla överlägg |

Tema, språk och data synkroniseras automatiskt via BroadcastChannel.

---

## 23. Integrationer och anslutningar

### Integreringsramverk
Fliken Integrationer (Admin/Ops Lead) ger:
- **OIDC SSO** — Single Sign-On-konfiguration
- **SMTP-post** — utgående e-post för larm och rapporter
- **Microsoft Teams** — webhook-integration
- **Zoom** — möteslänksintegration
- **API-nycklar** — generera bearer-tokens

### Händelseanslutningar
| Anslutning | Beskrivning |
|---|---|
| **STIX/TAXII** | Importera cyberhot-underrättelseflöden |
| **Syslog** | Ta emot syslog-meddelanden som händelser |

---

## 24. Mallar
Spara och återanvänd uppsättningar av händelser, faser, lås, grupper och lager:
- **Spara** — välj datumintervall; händelser lagras med relativa offset
- **Tillämpa** — ange STARTEX/T=0; alla händelser återskapas; lager per händelse stöds
- **Importera** — ladda `.json`-mallfiler
- 31 exempelmallar ingår: 20 övningsmallar och 11 incidentmallar

---

## 25. Tangentbords- och musgenvägar

### Mus

| Åtgärd | Resultat |
|---|---|
| Klicka på en tom tidslucka | Öppna Lägg till händelse vid den tidpunkten |
| Klicka på händelseblock | Öppna händelsedetaljer |
| Dra händelseblock | Schemalägg om till målslot |
| Dra tidskolumn | Zooma slothöjd (upp = zooma in) |
| Dubbelklicka tidskolumn | Återställ zoom till 1× |
| Mittklicka-dra tidslinje | Panorera horisontellt |

### Tangentbord

| Tangent | Åtgärd |
|---|---|
| `←` / `→` | Navigera bakåt / framåt ett intervall |
| `T` | Hoppa till idag |
| `N` | Scrolla till aktuell tid |
| `E` | Öppna Lägg till händelse-dialogrutan |
| `?` eller `H` | Öppna inbyggd hjälp |
| `Esc` | Stäng aktuell modal |
| `+` / `-` | Zooma slothöjd in/ut |
| `F` | Frys / återuppta syntetisk tid |

---

## 26. Felsökning

### Kan inte logga in
- Kontrollera användarnamn och lösenord (standard: `admin` / `admin`)
- Se till att servern körs: `./tidslinjal --port 8080`
- Kontrollera serverloggen för fel

### Händelser visas inte
- Kontrollera **Visa**-datumintervallet — du kanske visar ett intervall som inte inkluderar dina händelser
- Kontrollera **Lager**-filter — klicka 🗂 och se till att rätt lager är aktiva
- Kontrollera **Händelsetypsynlighet** i Inställningar — dolda typer visas inte

### Larmet utlöses inte
- SSE kräver en beständig webbläsaranslutning — se till att sidan är öppen
- Kontrollera att webbläsarnotifieringar är tillåtna för webbplatsen
- Verifiera larmets ledtid: vid 0 min utlöses larmet exakt vid händelsens starttid

### Lagerväxling fungerar inte
- Klicka **🗂 Lager** i verktygsfältet
- Välj **Masterlinjen** för att visa alla lager
- Eller välj enskilda lager för att filtrera

### Exporten ger en tom fil
- Se till att det finns händelser i det aktuella visningsintervallet
- Justera **Visa**-intervallet för att inkludera önskade händelser

### Datakatalogen är inte skrivbar
- Se till att katalogen `data/` finns och är skrivbar av serverprocessen
- Använd `--data /sökväg/till/skrivbar/katalog` eller ange miljövariabeln `DATA_DIR`

---

*Tidslinjal v6.0.0 — Samarbetsbaserad operativ tidslinje*
