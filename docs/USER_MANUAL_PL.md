# Tidslinjal Podręcznik Użytkownika

**Wersja 6.1.0**

---

## Spis treści

1. [Przegląd](#1-przegląd)
2. [Pierwsze kroki](#2-pierwsze-kroki)
3. [Interfejs](#3-interfejs)
4. [Nawigacja po osi czasu](#4-nawigacja-po-osi-czasu)
5. [Zdarzenia](#5-zdarzenia)
6. [Przepływ statusu zdarzeń](#6-przepływ-statusu-zdarzeń)
7. [Komentarze](#7-komentarze)
8. [Warstwy](#8-warstwy)
9. [Alarmy i powiadomienia](#9-alarmy-i-powiadomienia)
10. [Ćwiczenia i czas syntetyczny](#10-ćwiczenia-i-czas-syntetyczny)
11. [Fazy ćwiczeń](#11-fazy-ćwiczeń)
12. [Blokowanie przedziałów czasowych](#12-blokowanie-przedziałów-czasowych)
13. [Role i uprawnienia](#13-role-i-uprawnienia)
14. [Ustawienia](#14-ustawienia)
15. [Eksport i raporty](#15-eksport-i-raporty)
16. [Panel administratora](#16-panel-administratora)
17. [Zegary, odliczania i stopery](#17-zegary-odliczania-i-stopery)
18. [Dziennik decyzji](#18-dziennik-decyzji)
19. [Dziennik zdarzeń](#19-dziennik-zdarzeń)
20. [Zarządzanie zasobami](#20-zarządzanie-zasobami)
21. [Projekcja mapy](#21-projekcja-mapy)
22. [Odłączane okna](#22-odłączane-okna)
23. [Integracje i łączniki](#23-integracje-i-łączniki)
24. [Szablony](#24-szablony)
25. [Skróty klawiaturowe i myszy](#25-skróty-klawiaturowe-i-myszy)
26. [Rozwiązywanie problemów](#26-rozwiązywanie-problemów)
27. [Referencje i biblioteka dokumentów](#27-referencje-i-biblioteka-dokumentów)
28. [Dostępność](#28-dostępność)
29. [Presety obszaru roboczego](#29-presety-obszaru-roboczego)

---

## 1. Przegląd

**Tidslinjal** to oparte na współpracy, webowe narzędzie operacyjnej osi czasu dla rozproszonych geograficznie zespołów. Zapewnia wspólną, wizualną chronologię zdarzeń do planowania operacji, koordynacji i świadomości sytuacyjnej — w tym wsparcie dla ćwiczeń wojskowych i kryzysowych z czasem syntetycznym.

Kluczowe funkcje:
- Współdzielona oś czasu z wieloma użytkownikami i dostępem opartym na rolach
- Zarządzanie cyklem życia zdarzeń z przepływem zatwierdzania
- Nazwane warstwy do separacji strumieni aktywności
- Wsparcie ćwiczeń z STARTEX/ENDEX i syntetycznym czasem „Dzień N / T+T"
- Powiadomienia alarmowe w czasie rzeczywistym przez Server-Sent Events
- Eksport do ICS, JSON i CSV
- DTG (Date-Time Group) — wojskowy format daty
- Tryb wysokiego kontrastu i palety dostosowane do daltonizmu
- Wsparcie języka fińskiego (Suomi)
- Zarządzanie dokumentami referencyjnymi z sumami kontrolnymi
- Presety obszaru roboczego

---

## 2. Pierwsze kroki

### Logowanie

Przejdź do `http://<serwer>:<port>` (domyślnie: `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Nazwa użytkownika: [admin    ] │
│  Hasło:             [•••••••••] │
│                                 │
│         [ Zaloguj się ]         │
└─────────────────────────────────┘
```

Domyślne dane logowania: `admin` / `admin`

> **Uwaga dotycząca bezpieczeństwa:** Zmień hasło administratora natychmiast po pierwszym logowaniu za pomocą przycisku 🔑 w prawym górnym rogu.

### Samodzielna rejestracja

Jeśli administrator włączył samodzielną rejestrację, na stronie logowania pojawi się link **„Nie masz konta? Zarejestruj się"**. Dostępne są cztery tryby rejestracji:

| Tryb | Opis |
|---|---|
| **Otwarty** | Każdy może się zarejestrować; konto jest aktywowane natychmiast |
| **Z weryfikacją** | Każdy może się zarejestrować; administrator musi zatwierdzić konto przed zalogowaniem |
| **Zaproszenie ogólne** | Rejestracja wymaga wspólnego kodu zaproszenia udostępnionego przez administratora |
| **Zaproszenie osobiste** | Rejestracja wymaga osobistego jednorazowego kodu wygenerowanego przez administratora dla danego użytkownika |

### Resetowanie hasła

Jeśli zarejestrowałeś adres e-mail w swoim profilu:

1. Kliknij **Zapomniałem hasła?** na stronie logowania
2. Podaj swoją nazwę użytkownika lub adres e-mail
3. Wygenerowany zostanie token resetujący (wyświetlany na ekranie, jeśli serwer pocztowy nie jest skonfigurowany)
4. Kliknij **Resetuj hasło**, wklej token i wybierz nowe hasło

### Zmiana hasła

Kliknij przycisk **🔑** w nagłówku. Podaj obecne hasło, a następnie nowe hasło dwukrotnie.

---

## 3. Interfejs

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Dziś] [›] [⏱]  Widok: [Tydzień▼]  Rozdziel.: [Godzina▼] │
│             [🔍 Szukaj…] [🗂 Warstwy] [⬇ Eksportuj] [📄 Raport]            │
│                          [👤 Imię  rola] [?][🔑][☰] [Wyloguj]              │
├────────────────────────────────────────────────────────┬─────────────────┤
│                                                        │  PANEL BOCZNY   │
│                 SIATKA OSI CZASU                       │                 │
│  Czas  │  Pon 01  │  Wt 02   │  Śr 03   │  ...       │  [Legenda]      │
│ ───────┼──────────┼──────────┼──────────┤            │  [Alarmy]       │
│ 08:00  │          │ ▓▓▓▓▓▓▓▓ │          │            │  [Warstwy]      │
│ 09:00  │          │ Przegląd │          │            │  [Ustawienia]   │
│ 10:00  │ ████████ │          │          │            │                 │
│        │ Stand-up │          │          │            │                 │
│ 11:00  │          │          │ ████████ │            │                 │
│        │          │          │ ENDEX    │            │                 │
└────────────────────────────────────────────────────────┴─────────────────┘
```

**Nagłówek** — nawigacja, wybór widoku, wyszukiwanie i kontrolki użytkownika.

**Siatka osi czasu** — dni od lewej do prawej, czas od góry do dołu. Zdarzenia wyświetlane są jako kolorowe bloki.

**Panel boczny** — zakładki Legenda, Alarmy, Warstwy, Użytkownicy (admin), Grupy (admin), Dziennik audytu (Lider zespołu+), Fazy (Lider zespołu+), Ustawienia. Przełączaj przyciskiem ☰.

---

## 4. Nawigacja po osi czasu

### Nawigacja po datach

| Kontrolka | Działanie |
|---|---|
| Przyciski **‹** / **›** | Przejdź wstecz / naprzód o jeden interwał widoku |
| Przycisk **Dziś** | Przejdź do dzisiaj |
| Przycisk **⏱** | Przewiń siatkę do bieżącego czasu |

### Interwał widoku

Użyj menu rozwijanego **Widok** na pasku narzędzi:

```
Widok: [Dzień ▼]
        Dzień
        2 Dni
        3 Dni
        4 Dni
      ▶ Tydzień
        Miesiąc
        2 Miesiące
        3 Miesiące
```

### Rozdzielczość (wysokość slotu)

Użyj menu rozwijanego **Rozdzielczość**:

```
Rozdzielczość: [Godzina ▼]
                10 min
                15 min
              ▶ Godzina
                Dzień
```

### Powiększanie

**Przeciągnij, aby powiększyć** — kliknij i przeciągnij w górę/dół na kolumnie czasu (lewy brzeg), aby zwiększyć lub zmniejszyć wysokość slotu. Przeciągnij **w górę**, aby powiększyć, **w dół**, aby pomniejszyć.

**Podwójne kliknięcie** na kolumnie czasu przywraca powiększenie do 1×.

Klawiatura: **+** / **-** aby powiększać/pomniejszać krokowo.

### Panoramowanie poziome

Kliknij środkowym przyciskiem myszy i przeciągnij na obszarze osi czasu, aby panoramować w lewo/prawo.

---

## 5. Zdarzenia

### Tworzenie zdarzenia

Kliknij pustą komórkę w siatce osi czasu lub kliknij **+ Dodaj zdarzenie** w nagłówku.

```
┌─────────────────────── Dodaj zdarzenie ───────────────────────────┐
│ Tytuł *  [                                                      ]   │
│                                                                     │
│ Typ      [Aktywność       ▼]   Kolor  [■]                          │
│                                                                     │
│ Początek *  [2025-06-01T10:00]    Koniec  [2025-06-01T11:00]        │
│                                                                     │
│ Warstwa    [Linia główna  ▼]  Status [Planowane        ▼]          │
│                                                                     │
│ Opis                                                                │
│ [                                                                ]  │
│                                                                     │
│ Uczestnicy  [—  ▼]   ☐ Zdarzenie całodniowe (bez określonego czasu)│
│                                                                     │
│ ☐ Powtarzające się    Wzorzec [Co tydzień ▼]                       │
│ Data końcowa  [               ]                                     │
│                                                                     │
│ Załącznik 📎 [Wybierz plik]                                         │
│                                                                     │
│              [Anuluj]   [Zapisz]                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Typy zdarzeń

Każdy typ zdarzenia ma kolorowy blok i ikonę wyświetlaną po **lewej** stronie tytułu zdarzenia.

| Ikona | Typ | Kolor | Uwagi |
|---|---|---|---|
| — | **Zdarzenie** | Niebieski | Ogólne zdarzenie |
| ⚡ | **Moment** | Pomarańczowy | Pojedynczy punkt w czasie — brak czasu zakończenia. Renderowany jako znacznik ◆ romb. |
| 🤝 | **Spotkanie** | Szary | Zaplanowane spotkanie |
| 🏢 | **Spotkanie stacjonarne** | Ciemnopomarańczowy | Spotkanie stacjonarne w określonym miejscu |
| ⚖️ | **Decyzja** | Zielony | Punkt decyzyjny |
| ⏰ | **Termin** | Czerwony | Twardy termin |
| — | **Aktywność** | Zielony | Blok pracy |
| 🔄 | **Powtarzające się** | Fioletowy | Szablon dla powtarzających się aktywności |
| 📊 | **Raportowanie** | Morski | Raport lub przegląd |
| 📌 | **Przypisane zadanie** | Pomarańczowy | Zadanie przypisane osobie lub zespołowi |
| 🧍 | **Codzienny stand-up** | Cyjan | Krótkie codzienne spotkanie statusowe |

Ikona ↻ (po lewej stronie tytułu) oznacza, że zdarzenie jest częścią **powtarzającej się serii**. Niestandardowe typy mogą mieć własną ikonę emoji ustawioną przez **Ustawienia → Typy zdarzeń → Edytuj**.

Włącz/wyłącz wszystkie ikony globalnie w **Ustawienia → Ikony zdarzeń**.

Niestandardowe typy mogą być dodawane przez użytkowników z uprawnieniami Odczyt/Zapis+ z panelu ustawień.

### Zdarzenia momentowe

Gdy jako typ wybrano **Moment**:
- Pole **Koniec** jest ukryte (brak czasu trwania)
- Zdarzenie jest renderowane jako wąski pionowy znacznik z rombem ◆ na górze
- Nie można ustawić jako powtarzające się

### Zdarzenia całodniowe

Zaznacz **Zdarzenie całodniowe (bez określonego czasu)** dla zdarzenia obejmującego cały dzień:
- Pola czasu początkowego/końcowego są ukryte
- Zdarzenie wyświetlane jest w szarym obszarze poza godzinami dnia
- Powtarzanie nie jest dostępne dla zdarzeń całodniowych

### Uczestnicy

Pole **Uczestnicy** oznacza, czy aktywność obejmuje strony wewnętrzne czy zewnętrzne:

| Wartość | Etykieta | Kolor |
|---|---|---|
| — | brak | — |
| **Wewnętrzni** | `WEWNĘTRZNI` | Morski |
| **Zewnętrzni** | `ZEWNĘTRZNI` | Czerwony |

### Zdarzenia powtarzające się

Zaznacz **Powtarzające się**, a następnie wybierz wzorzec:

| Wzorzec | Interwał |
|---|---|
| Co 30 minut | 30 minut |
| Co godzinę | 1 godzina |
| Co 2 / 3 / 4 godziny | 2 / 3 / 4 godziny |
| Codziennie | 1 dzień |
| Co tydzień | 7 dni |
| Co miesiąc | ~1 miesiąc |
| Co kwartał | ~3 miesiące |

### Edycja i usuwanie zdarzeń

Kliknij blok zdarzenia, aby otworzyć widok szczegółów. Kliknij **Edytuj**, aby zmodyfikować. Kliknij **Usuń** (widoczne dla twórcy i administratorów), aby usunąć.

---

## 6. Przepływ statusu zdarzeń

Każde zdarzenie ma status, który przechodzi przez cykl życia:

```
planowane ──► aktywne ──► odpowiedziane ──► zakończone ──► przesłane
                                                              │
                                                   ┌──────────┤
                                                   ▼          ▼
                                               zweryfikowane  odrzucone
                                                              │
                                                        (wymagany powód)
```

`anulowane` jest dostępne na każdym etapie.

### Przejścia

| Z → Do | Kto może wykonać |
|---|---|
| Dowolny → dowolny (oprócz weryfikacji/odrzucenia) | Twórca, Lider zespołu+ |
| odpowiedziane | Sprawozdawca, Twórca, Lider zespołu+ |
| przesłane → zweryfikowane | Lider zespołu+ (rejestruje kto i kiedy) |
| przesłane → odrzucone | Lider zespołu+ (wymaga powodu odrzucenia) |

### Rola Sprawozdawcy

Użytkownicy z rolą **Sprawozdawca** mogą:
- Publikować komentarze do zdarzeń
- Ustawiać status jako `odpowiedziane` lub `zakończone` (wymaga zatwierdzenia Lidera zespołu)

---

## 7. Komentarze

Kliknij blok zdarzenia, aby otworzyć widok szczegółów. Przewiń w dół do sekcji **Komentarze**.

- Wszyscy uwierzytelnieni użytkownicy mogą czytać komentarze
- Użytkownicy z uprawnieniami Odczyt/Zapis+ mogą publikować komentarze
- Sprawozdawcy mogą publikować komentarze; komentarze zmieniające status wymagają zatwierdzenia
- Liderzy zespołu+ mogą zatwierdzać lub usuwać oczekujące komentarze

---

## 8. Warstwy

Warstwy to nazwane nakładki na linii głównej. Umożliwiają różnym zespołom posiadanie oddzielnych ścieżek zdarzeń ze wspólnym widokiem.

### Tworzenie warstwy

1. Otwórz zakładkę **Warstwy** w panelu bocznym lub kliknij **🗂 Warstwy** na pasku narzędzi
2. Kliknij **+ Nowa warstwa**
3. Podaj nazwę, kolor, opis, widoczność i uprawnienia

```
┌──────── Nowa warstwa ─────────────┐
│ Nazwa *   [Cyberteam            ]  │
│ Kolor     [■ #9B59B6            ]  │
│ Opis      [                      ] │
│                                    │
│ Widoczność  [Grupy          ▼]     │
│ Uprawnienia [Odczyt/Zapis   ▼]     │
│ Grupy       ☐ Alpha  ☐ Bravo      │
│                                    │
│         [Anuluj]  [Zapisz]         │
└────────────────────────────────────┘
```

### Widoczność

| Ustawienie | Kto widzi warstwę |
|---|---|
| **Prywatna** | Tylko właściciel |
| **Grupy** | Właściciel + członkowie wybranych grup |
| **Publiczna** | Wszyscy uwierzytelnieni użytkownicy |

### Przełączanie warstw

Kliknij **🗂 Warstwy** na pasku narzędzi, aby otworzyć panel szybkiego przełączania. Kliknij element, aby go przełączyć. Kilka warstw może być aktywnych jednocześnie — zaznacz pola wyboru tych warstw, które chcesz widzieć.

---

## 9. Alarmy i powiadomienia

### Ustawianie alarmu

1. Kliknij blok zdarzenia, aby otworzyć widok szczegółów
2. Kliknij **🔔 Ustaw alarm**
3. Wybierz czas wyprzedzenia (w momencie zdarzenia, 5/10/15/30 min lub 1 godzinę przed)

### Powiadomienia alarmowe

Gdy alarm zostaje wyzwolony, u góry ekranu pojawia się panel powiadomień:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarm — „Przegląd ENDEX" za 15 minut (10:45)                       │
│                    [Zamknij] [📋 Pokaż zdarzenie] [✓ ACK]            │
└──────────────────────────────────────────────────────────────────────┘
```

- **Zamknij** — usuwa powiadomienie bez potwierdzenia.
- **📋 Pokaż zdarzenie** — otwiera widok szczegółów zdarzenia bezpośrednio z alarmu.
- **✓ ACK** — potwierdza alarm i zatrzymuje eskalację.
- Przycisk **Dołącz do spotkania** — jeśli zdarzenie jest spotkaniem z URL (Teams/Zoom), w powiadomieniu alarmu pojawia się przycisk otwierający spotkanie bezpośrednio.

Niepotwierdzone alarmy eskalują — stają się pomarańczowe, a następnie pulsująco czerwone co 60 sekund.

### Dziennik audytu alarmów

Każde potwierdzenie alarmu jest rejestrowane w **Dzienniku audytu** (dostępnym dla Lidera zespołu i wyżej). Każdy wpis zawiera:
- Kto potwierdził alarm (nazwa użytkownika i ID)
- Kiedy nastąpiło potwierdzenie (znacznik czasu)
- Adres IP, z którego system był dostępny w danym momencie

### Zegary wielu stref czasowych

Nagłówek wyświetla główny zegar czasu rzeczywistego. Możesz dodać dowolną liczbę zegarów dla innych stref czasowych.

**Dodawanie zegara:**
1. Kliknij przycisk **+** po lewej stronie głównego zegara w nagłówku.
2. Podaj krótką etykietę (np. *Tallinn*, *Kyiv*, *Kabul*).
3. Wybierz strefę czasową IANA z menu rozwijanego.
4. Kliknij **Dodaj**. Zegar pojawi się natychmiast po lewej stronie głównego zegara.

**Usuwanie zegara:** Kliknij **×** na widżecie zegara lub przejdź do **Ustawienia → Format daty/czasu → Dodatkowe strefy czasowe → Usuń**.

### Powiadomienia webhook

Skonfiguruj URL webhooka w **Ustawienia**, aby również otrzymywać powiadomienia alarmowe przez HTTP POST do Mattermost, Slack lub dowolnego punktu końcowego HTTP.

### Zakładka Alarmy w panelu bocznym

Przeglądaj i zarządzaj wszystkimi aktywnymi alarmami z zakładki **Alarmy** w panelu bocznym.

---

## 10. Ćwiczenia i czas syntetyczny

Dla ćwiczeń szkoleniowych Tidslinjal obsługuje tryb „czasu syntetycznego", który zastępuje rzeczywiste daty kalendarzowe etykietami dnia/godziny ćwiczenia.

### Konfiguracja (tylko administrator)

1. Otwórz zakładkę **Ustawienia** w panelu bocznym
2. Przewiń w dół do **Ustawienia ćwiczenia**
3. Wypełnij:
   - **Nazwa ćwiczenia** — wyświetlana jako etykieta w nagłówku
   - **STARTEX** — rzeczywista data i czas odpowiadające „Dniu 1 T+0"
   - **ENDEX** — rzeczywista data i czas zakończenia ćwiczenia
4. Zaznacz **Włącz wyświetlanie czasu syntetycznego**
5. Kliknij **Zapisz**

### Aktywacja czasu syntetycznego

Przycisk **🕐 T+** pojawia się na pasku narzędzi, gdy tryb ćwiczeń jest skonfigurowany. Kliknij, aby przełączać między wyświetlaniem czasu rzeczywistego i syntetycznego.

### Zamrożenie osi czasu

W panelu **Ustawienia** użyj **Zamroź/wstrzymaj oś czasu**, aby zatrzymać zegar syntetyczny w określonym momencie. Kliknij **Wznów**, aby usunąć zamrożenie.

---

## 11. Fazy ćwiczeń

Liderzy zespołu i wyższe role mogą definiować nazwane, kolorowe bloki obejmujące całą oś czasu w celu wyświetlania faz ćwiczeń.

1. Otwórz zakładkę **Fazy** w panelu bocznym
2. Kliknij **+ Nowa faza**
3. Podaj nazwę, kolor, czas rozpoczęcia, czas zakończenia i kolejność wyświetlania (0–9)

Fazy wyświetlane są jako przezroczyste kolorowe pasma na górze siatki osi czasu.

---

## 12. Blokowanie przedziałów czasowych

Administratorzy i użytkownicy z flagą `może_blokować` mogą blokować przedziały czasowe, aby uniemożliwić tworzenie zdarzeń.

1. Kliknij **🔒 Zablokuj przedział** w nagłówku (widoczne dla administratorów/użytkowników z flagą może_blokować)
2. Podaj czas rozpoczęcia, czas zakończenia i powód

Zablokowane przedziały wyświetlane są jako czerwone przerywane nakładki. Zdarzenia nie mogą być tworzone w zablokowanych przedziałach.

---

## 13. Role i uprawnienia

| Rola | Skrót | Funkcje |
|---|---|---|
| **Obserwator** | `observer` | Dostęp tylko do odczytu osi czasu i zdarzeń — nie może edytować, komentować ani blokować |
| **Odczyt** | `read` | Wyświetlanie osi czasu, zdarzeń, warstw; ustawianie osobistych alarmów |
| **Sprawozdawca** | `reporter` | + Publikowanie komentarzy; ustawianie statusu odpowiedziane/zakończone (z zatwierdzeniem) |
| **Odczyt/Zapis** | `readwrite` | + Tworzenie/edycja własnych zdarzeń; tworzenie typów zdarzeń i warstw |
| **Lider zespołu** | `teamlead` | + Tworzenie grup; weryfikacja/odrzucanie przesłanych zdarzeń; przeglądanie dziennika audytu; zarządzanie fazami |
| **Lider operacji** | `oplead` | + Tworzenie/edycja/usuwanie zdarzeń na linii głównej |
| **Asystent sztabu** | `staffofficer` | Te same uprawnienia co lider operacji — alternatywne oznaczenie dla personelu sztabowego |
| **Oficer sztabu** | `staffofficer_full` | To samo co asystent sztabu, ale wymaga co najmniej jednego oznaczenia J (J1–J9) |
| **Administrator** | `admin` | Pełny dostęp — zarządzanie wszystkimi użytkownikami, rolami, blokadami, ustawieniami aktywności, rejestracją |

Flaga `może_blokować` może być przypisana dowolnemu użytkownikowi niezależnie od roli.

### Oznaczenia J (rola Oficera sztabu)

**Oficer sztabu** (`staffofficer_full`) wymaga co najmniej jednego oznaczenia NATO J. Oznaczenia identyfikują gałąź sztabu:

| Kod | Gałąź |
|---|---|
| J1 | Personel |
| J2 | Wywiad |
| J3 | Operacje |
| J4 | Logistyka |
| J5 | Planowanie |
| J6 | Łączność |
| J7 | Szkolenie |
| J8 | Finanse |
| J9 | Współpraca cywilno-wojskowa |

---

## 14. Ustawienia

Otwórz zakładkę **Ustawienia** w panelu bocznym, aby skonfigurować preferencje.

### Motyw i wyświetlanie

| Ustawienie | Opcje |
|---|---|
| **Motyw** | Ciemny / Jasny / City Camo / Urban Camo |
| **Rozmiar** | Mały / Normalny / Duży / Ogromny |
| **Język** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français / 🇫🇮 Suomi |
| **Format daty/czasu** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) / DTG (141200ZMAR26) |
| **Format czasu** | 24h / 12h |
| **Tryb wysokiego kontrastu** | Wł. / Wył. |
| **Paleta dla daltonistów** | Wył. / Protanopia / Deuteranopia / Tritanopia |
| **Domyślny widok początkowy** | Siatka / Lista / Dziennik zdarzeń / Decyzje / Mapa / Raporty |
| **Automatyczne śledzenie „teraz"** | Wł. / Wył. |
| **Domyślny interwał** | Dzień / 3 Dni / Tydzień / 2 Tygodnie / Miesiąc |
| **Domyślna rozdzielczość** | 10 min / 15 min / Godzina / Dzień |
| **Tydzień zaczyna się** | Poniedziałek / Niedziela |
| **Opóźnienie podpowiedzi** | Natychmiast / 200 ms / 500 ms |
| **Potwierdzenie przeciągnięcia** | Wł. / Wył. |
| **Domyślny typ zdarzenia** | dowolny skonfigurowany typ |
| **Baner powitalny** | wyświetlany przy pierwszym logowaniu |

Język można również zmienić bezpośrednio za pomocą przycisków flag (🇬🇧 🇸🇪 🇫🇷 🇫🇮) na pasku narzędzi.

### Format daty/czasu i godziny dnia

Sekcja **Format daty/czasu** grupuje zarówno wybór formatu, jak i konfigurację godzin dnia:

| Ustawienie | Opis |
|---|---|
| **Format daty** | ISO 8601 / UK / FR / SV |
| **Początek dnia** | Pierwsza godzina dnia roboczego |
| **Koniec dnia** | Ostatnia godzina dnia roboczego |

Sloty czasowe poza zakresem początek–koniec dnia wyświetlane są szaro/kreskowane.

### Widok domyślny

Kliknij jeden z przycisków interwału (Dzień / 2 Dni / 3 Dni / 4 Dni / Tydzień), aby ustawić domyślny widok. Zmiana tego przełącza również bieżący widok natychmiast.

### Widoczność typów zdarzeń

Włączaj/wyłączaj poszczególne typy zdarzeń. Ukryte typy są wygaszone na osi czasu. Niestandardowe typy można tworzyć przyciskiem **+ Nowy typ** (Odczyt/Zapis+).

### Ślad bieżącego czasu (czerwona linia)

| Ustawienie | Opis |
|---|---|
| Pokaż / Ukryj | Przełącz czerwoną linię |
| Kolor | Kolor linii (domyślnie czerwony) |
| Szerokość | Grubość linii w pikselach |
| Typ | Ciągła / Kreskowana / Kropkowana |
| Etykieta H+N | Wyświetlaj etykietę godziny ćwiczenia na linii |

### Webhook / Powiadomienia

Podaj URL webhooka, aby otrzymywać powiadomienia alarmowe jako żądania HTTP POST:
- **Mattermost** — payload `{"text": "..."}`
- **Slack** — payload `{"text": "..."}`
- **Ogólny** — pełny payload JSON alarmu

Kliknij **Testuj**, aby wysłać powiadomienie testowe.

---

## 15. Eksport i raporty

### Eksport

Kliknij **⬇ Eksportuj** na pasku narzędzi, aby otworzyć okno eksportu:

| Format | Zawartość |
|---|---|
| **ICS** | Zdarzenia w bieżącym widoku jako iCalendar; importuj do dowolnej aplikacji kalendarza |
| **JSON** | Kompletny eksport systemu (wszystkie zdarzenia, użytkownicy, grupy, warstwy, ustawienia) — tylko administrator |
| **CSV** | Zdarzenia w bieżącym widoku jako arkusz rozdzielony przecinkami |

### Raporty

Kliknij **📄 Raport**, aby otworzyć generator raportów:

| Typ raportu | Opis |
|---|---|
| **Przegląd po działaniu (AAR)** | Podsumowanie zdarzeń pogrupowanych według statusu |
| **Obraz osi czasu** | Chronologiczna lista wszystkich zdarzeń w interwale |
| **Aktywność wg warstwy** | Zdarzenia podzielone według warstwy |

Wybierz **HTML**, aby wyświetlić w przeglądarce, lub **Drukuj/PDF**, aby wydrukować lub zapisać jako PDF.

---

## 16. Panel administratora

Przejdź do `/admin-view` (wymaga roli **Administrator**) do dedykowanego pulpitu administratora.

---

## 17. Zegary, odliczania i stopery

### Zegary stref czasowych
Zegar w nagłówku pokazuje lokalny czas rzeczywisty. Kliknij **+**, aby dodać dodatkowe strefy czasowe dla rozproszonych zespołów. Kliknij **⧉**, aby odłączyć wszystkie zegary do osobnego okna.

### Wyświetlacz siedmiosegmentowy VCR
Zegary wyświetlane są w retro stylu VCR z wyświetlaczem siedmiosegmentowym. Kolory i grubość segmentów można konfigurować.

### Odliczanie
Twórz odliczania, które odliczają do czasu docelowego:
- Kliknij **+ Odliczanie** na pasku narzędzi zegarów
- Ustaw czas docelowy lub wybierz z czasu rozpoczęcia/zakończenia zdarzenia
- Odliczanie pokazuje pozostały czas ze **wskaźnikiem postępu**
- Alarm jest wyzwalany, gdy odliczanie osiągnie zero
- Kliknij **ACK**, aby potwierdzić

### Stoper
Twórz stopery, które liczą w górę:
- Kliknij **+ Stoper** na pasku narzędzi zegarów
- Konfiguruj: czas trwania (godziny/minuty/sekundy), przyciski presetów (5/10/15/30/60 min)
- Wybierz, czy stoper ma się zatrzymać czy kontynuować po osiągnięciu celu
- Włącz alarm dźwiękowy przy osiągnięciu celu
- Stoper wyświetla **wskaźnik postępu** z oznaczeniem przekroczenia czasu

### Wybór kolorów
Pasek narzędzi zegarów zawiera selektory kolorów:
| Selektor | Steruje |
|---|---|
| **BG** | Kolor tła |
| **CD** | Kolor akcentu odliczania |
| **TM** | Kolor akcentu stopera |

---

## 18. Dziennik decyzji
Dziennik decyzji zapewnia ustrukturyzowane śledzenie decyzji podejmowanych podczas operacji lub ćwiczeń.

### Tworzenie decyzji
1. Kliknij **+ Nowa decyzja**
2. Wypełnij tytuł, opis, status i osobę odpowiedzialną
3. W razie potrzeby dołącz pliki
4. Kliknij **Zapisz**

### Status decyzji
| Status | Opis |
|---|---|
| **Zaproponowana** | Decyzja została przedłożona |
| **Zatwierdzona** | Decyzja została zatwierdzona |
| **Odrzucona** | Decyzja została odrzucona |

---

## 19. Dziennik zdarzeń
Dziennik zdarzeń zapewnia chronologiczny rejestr zdarzeń operacyjnych, obserwacji i notatek.
- Otwórz **Dziennik zdarzeń** z panelu bocznego (zakładka Dzienniki)
- Kliknij **+ Nowy wpis**, aby dodać wpis do dziennika
- Wpisy są opatrzone znacznikiem czasu i powiązane z twórcą

---

## 20. Zarządzanie zasobami
Zarządzaj zasobami operacyjnymi (pomieszczenia, budynki, usługi IT, centra danych) z panelu bocznego.

### Typy zasobów
| Typ | Opis |
|---|---|
| **Pomieszczenia** | Sale konferencyjne, centra operacyjne |
| **Budynki** | Budynki fizyczne i obiekty |
| **Usługi IT** | Infrastruktura IT, serwery, sieci |
| **Centra danych** | Obiekty centrów danych |

### Tworzenie zasobu
1. Otwórz zakładkę **Zasoby** w panelu bocznym
2. Wybierz typ zasobu
3. Kliknij **+ Dodaj**
4. Wypełnij nazwę, opis, lokalizację (szer./dł. geogr.), obraz i symbol
5. Kliknij **Zapisz**

---

## 21. Projekcja mapy
Projekcja mapy zapewnia interaktywny widok geograficzny spotkań, użytkowników i zasobów.

- **Warstwy mapy** — przełączaj między OpenStreetMap, Topograficzną, Satelitarną i Ciemną
- **Nakładki zasobów** — pokaż/ukryj pomieszczenia, budynki, usługi IT i centra danych
- **Wyszukiwanie adresów** — geokoduj adres i przybliż do lokalizacji
- **Wybór symboli** — wybierz wojskowe i operacyjne symbole kartograficzne dla zasobów i zdarzeń
- **Import GeoJSON/KML** — wczytaj zewnętrzne pliki danych geograficznych
- **Dopasuj wszystko** — automatyczne przybliżenie, aby wyświetlić wszystkie widoczne znaczniki

---

## 22. Odłączane okna
Kilka widoków można odłączyć do osobnych okien przeglądarki:
| Okno | Opis |
|---|---|
| **Zegary** | Wszystkie zegary, odliczania i stopery |
| **Panel boczny** | Pełny panel boczny ze wszystkimi zakładkami |
| **Dziennik decyzji** | Widok dziennika decyzji |
| **Projekcja mapy** | Interaktywna mapa ze wszystkimi nakładkami |

Motyw, język i dane synchronizują się automatycznie przez BroadcastChannel.

---

## 23. Integracje i łączniki

### Framework integracji
Zakładka Integracje (Administrator/Lider operacji) zapewnia:
- **OIDC SSO** — konfiguracja Single Sign-On
- **SMTP poczta** — poczta wychodząca dla alarmów i raportów
- **Microsoft Teams** — integracja webhook
- **Zoom** — integracja linków do spotkań
- **Klucze API** — generowanie tokenów bearer

### Łączniki zdarzeń
| Łącznik | Opis |
|---|---|
| **STIX/TAXII** | Import kanałów wywiadowczych o cyberzagrożeniach |
| **Syslog** | Odbieranie wiadomości syslog jako zdarzeń |

---

## 24. Szablony
Zapisuj i ponownie wykorzystuj zestawy zdarzeń, faz, blokad, grup i warstw:
- **Zapisz** — wybierz zakres dat; zdarzenia zapisywane są z relatywnymi przesunięciami
- **Zastosuj** — podaj STARTEX/T=0; wszystkie zdarzenia zostaną odtworzone; obsługiwane są warstwy per zdarzenie
- **Importuj** — wczytaj pliki szablonów `.json`
- Dołączonych jest 31 przykładowych szablonów: 20 szablonów ćwiczeń i 11 szablonów incydentów

---

## 25. Skróty klawiaturowe i myszy

### Mysz

| Akcja | Rezultat |
|---|---|
| Kliknij pusty slot czasowy | Otwórz Dodaj zdarzenie w tym momencie |
| Kliknij blok zdarzenia | Otwórz szczegóły zdarzenia |
| Przeciągnij blok zdarzenia | Przełóż na docelowy slot |
| Przeciągnij kolumnę czasu | Zmień wysokość slotu (w górę = powiększ) |
| Podwójne kliknięcie kolumny czasu | Przywróć powiększenie do 1× |
| Środkowy przycisk — przeciągnij oś czasu | Panoramuj poziomo |

### Klawiatura

| Klawisz | Akcja |
|---|---|
| `←` / `→` | Nawiguj wstecz / naprzód o jeden interwał |
| `T` | Przejdź do dzisiaj |
| `N` | Przewiń do bieżącego czasu |
| `E` | Otwórz okno Dodaj zdarzenie |
| `?` lub `H` | Otwórz wbudowaną pomoc |
| `Esc` | Zamknij bieżące okno modalne |
| `+` / `-` | Powiększ/pomniejsz wysokość slotu |
| `F` | Zamroź / wznów czas syntetyczny |

---

## 26. Rozwiązywanie problemów

### Nie można się zalogować
- Sprawdź nazwę użytkownika i hasło (domyślnie: `admin` / `admin`)
- Upewnij się, że serwer działa: `./tidslinjal --port 8080`
- Sprawdź log serwera pod kątem błędów

### Zdarzenia się nie wyświetlają
- Sprawdź zakres dat w **Widoku** — możesz przeglądać interwał, który nie obejmuje Twoich zdarzeń
- Sprawdź filtr **Warstw** — kliknij 🗂 i upewnij się, że odpowiednie warstwy są aktywne
- Sprawdź **Widoczność typów zdarzeń** w Ustawieniach — ukryte typy nie są wyświetlane

### Alarm się nie wyzwala
- SSE wymaga trwałego połączenia przeglądarki — upewnij się, że strona jest otwarta
- Sprawdź, czy powiadomienia przeglądarki są dozwolone dla tej witryny
- Zweryfikuj czas wyprzedzenia alarmu: przy 0 min alarm wyzwala się dokładnie w momencie rozpoczęcia zdarzenia

### Przełączanie warstw nie działa
- Kliknij **🗂 Warstwy** na pasku narzędzi
- Wybierz **Linię główną**, aby wyświetlić wszystkie warstwy
- Lub wybierz poszczególne warstwy do filtrowania

### Eksport generuje pusty plik
- Upewnij się, że w bieżącym interwale widoku są zdarzenia
- Dostosuj interwał **Widoku**, aby objąć pożądane zdarzenia

### Katalog danych nie jest zapisywalny
- Upewnij się, że katalog `data/` istnieje i jest zapisywalny przez proces serwera
- Użyj `--data /ścieżka/do/zapisywalnego/katalogu` lub ustaw zmienną środowiskową `DATA_DIR`

---

## 27. Referencje i biblioteka dokumentów

Biblioteka referencji umożliwia zarządzanie dokumentami i linkami powiązanymi z operacjami i ćwiczeniami.

### Przesyłanie referencji

Przesyłaj referencje jako plik, URL lub tekst lokalny. System obsługuje przesyłanie masowe (wiele plików jednocześnie) i automatyczne wykrywanie typu pliku.

### Metadane referencji

Każda referencja posiada następujące metadane:

| Pole | Opis |
|---|---|
| **Tytuł** | Nazwa referencji |
| **Opis** | Krótkie podsumowanie |
| **Kategoria** | Klasyfikacja (patrz poniżej) |
| **Tagi** | Tagi tekstowe do wyszukiwania |
| **Język** | Język dokumentu |
| **Właściciel** | Osoba odpowiedzialna |
| **Opiekun** | Osoba utrzymująca dokument |
| **Tryb kopiowania** | Sposób przechowywania dokumentu (patrz poniżej) |

### Kategorie

| Kategoria |
|---|
| Podręcznik |
| SOP |
| Polityka |
| Mapa |
| Referencja |
| Lista kontrolna |
| FAQ |
| Cel |
| Inne |

### Tryby kopiowania

| Tryb | Opis |
|---|---|
| **Kopia centralna** | Plik przechowywany centralnie na serwerze |
| **Kopia lokalna** | Plik przechowywany lokalnie u użytkownika |
| **Wyświetl link** | Brak kopii — tylko link do oryginalnego źródła |

### Edycja metadanych referencji

Kliknij referencję, aby otworzyć widok szczegółów. Kliknij **Edytuj**, aby zmienić metadane.

### Kryptograficzne sumy kontrolne

System automatycznie oblicza kryptograficzne sumy kontrolne dla przesłanych plików:

| Algorytm |
|---|
| MD5 |
| SHA-1 |
| SHA-256 |
| SHA-512 |

Kliknij **Pokaż sumy kontrolne**, aby otworzyć okno sum kontrolnych ze wszystkimi obliczonymi wartościami.

### Wyszukiwanie i filtrowanie

Użyj pola wyszukiwania i filtrów kategorii, aby znaleźć referencje. Filtruj według kategorii, tagów i tekstu dowolnego.

---

## 28. Dostępność

### Tryb wysokiego kontrastu

Tryb wysokiego kontrastu może być nałożony na dowolny motyw i zwiększa widoczność:
- Linii siatki
- Znaczników czasu
- Pasm faz
- Nakładek blokad
- Zaznaczonych zdarzeń

Aktywuj przez **Ustawienia → Motyw i wyświetlanie → Tryb wysokiego kontrastu**.

### Palety dla daltonistów

Dostępne są trzy palety dla daltonistów:

| Paleta | Typ |
|---|---|
| **Protanopia** | Ślepota na kolor czerwono-zielony |
| **Deuteranopia** | Ślepota na kolor zielono-czerwony |
| **Tritanopia** | Ślepota na kolor niebiesko-żółty |

Aktywuj przez **Ustawienia → Motyw i wyświetlanie → Paleta dla daltonistów**.

Tryb wysokiego kontrastu i palety dla daltonistów mogą być aktywowane jednocześnie.

---

## 29. Presety obszaru roboczego

Zapisuj i przywracaj nazwane presety obszaru roboczego dla szybkiego dostępu do najczęściej używanych widoków.

### Zapisywanie presetu

Preset zapisuje następujące ustawienia:
- Widok (siatka, lista, dziennik zdarzeń, decyzje, mapa, raporty)
- Interwał
- Rozdzielczość
- Poziom powiększenia
- Ukryte warstwy
- Zakładka panelu bocznego

### Wczytywanie presetu

Kliknij zapisany preset, aby natychmiast zastosować wszystkie zapisane ustawienia jednym kliknięciem.

### Usuwanie presetu

Kliknij **Usuń** obok presetu, aby go skasować.

---

*Tidslinjal v6.1.0 — Oparta na współpracy operacyjna oś czasu*
