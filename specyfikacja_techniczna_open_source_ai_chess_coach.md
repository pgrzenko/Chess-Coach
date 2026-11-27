# Specyfikacja Techniczna (Wstępna): Open-Source AI Chess Coach

> **Informacja o statusie dokumentu:**
> Niniejsza specyfikacja techniczna jest wersją wstępną opracowaną przez **Gemini Hydrogen**. Przed rozpoczęciem implementacji dokument ten powinien zostać poddany krytycznemu przeglądowi technicznemu przez **GPT Sol** oraz przedyskutowany z autorem projektu. Szczegółowe zasady pracy, standardy kodowania oraz sposób prowadzenia sesji deweloperskich zostaną ustalone bezpośrednio przez autora projektu w osobnej komunikacji z GPT Sol.

---

## 1. Fundamenty architektoniczne i zasady nadrzędne (Zero-Slop Guardrails)

1. **Zasada Single Source of Truth (Determinizm ponad LLM):**
   * Model językowy **nie ma prawa** samodzielnie liczyć wariantów, oceniać pozycji ani zgadywać legalności ruchów.
   * Jedynym źródłem prawdy o pozycji jest **Stockfish (WASM)**, biblioteka reguł **chess.js** oraz **księga debiutowa (Polyglot + ECO)**.
   * Rola agentów AI ogranicza się wyłącznie do **syntezy pedagogicznej**: tłumaczenia ustrukturyzowanych danych z silnika i ekstraktora faktów na precyzyjny język trenerski dopasowany do wybranego trybu.
2. **Walidacja antyhalucynacyjna (SAN Guardrail):**
   * Każda odpowiedź modelu LLM musi być zwracana w formacie ustrukturyzowanym (JSON Schema / Structured Outputs).
   * Każdy ruch w notacji algebraicznej (`SAN`) wygenerowany w komentarzu trenera przechodzi przed wyświetleniem przez walidator `chess.js` w kontekście aktualnego węzła gry (lub wskazanego wariantu). Wykrycie nielegalnego ruchu odrzuca odpowiedź i wymusza regenerację z komunikatem błędu walidacji.
3. **Architektura Open Source i BYOK (Bring Your Own Key):**
   * Aplikacja działa w modelu *client-first* (brak wymaganego płatnego backendu do samego działania szachownicy i Stockfisha).
   * Klucz API OpenAI podawany jest przez użytkownika w ustawieniach i przechowywany wyłącznie lokalnie (`localStorage` / `IndexedDB`).
   * Domyślny model: `gpt-6.2-sol` (konfigurowalny w UI, wraz z możliwością zmiany `baseURL` dla kompatybilnych endpointów API).
   * Warstwa AI oparta o interfejs `IAgentProvider`, umożliwiający podpinanie kolejnych wyspecjalizowanych agentów lub zewnętrznych narzędzi przez API.
4. **Wielojęzyczność (i18n — Polski / Angielski):**
   * Aplikacja docelowo posiada przełącznik języka (**Polski `pl` / Angielski `en`**) dostępny bezpośrednio w interfejsie użytkownika.
   * Wybór języka steruje jednocześnie:
     * warstwą interfejsu użytkownika (UI, etykiety, komunikaty systemowe, nazwy motywów taktycznych i debiutów),
     * językiem generowanych wyjaśnień i komentarzy przez agentów AI (przekazywanym w kontrakcie wejściowym `AgentInputPayload`), z zachowaniem poprawnej, spójnej terminologii szachowej w obu językach.

---

## 2. Rekomendowany stos technologiczny

| Warstwa | Technologia | Rola i uzasadnienie |
| :--- | :--- | :--- |
| **Frontend & UI** | React 19 + TypeScript + Vite + Tailwind CSS | Szybki, responsywny interfejs wzorowany na **lichess.org** (ciemny motyw bazowy, skróty klawiszowe, brak zbędnych animacji opóźniających grę). |
| **Internacjonalizacja (i18n)** | `i18next` + `react-i18next` | Obsługa pełnego tłumaczenia interfejsu (PL / EN) oraz synchronizacja aktywnego języka z warstwą promptów AI. |
| **Szachownica i strzałki** | `chessground` (silnik szachownicy Lichess) | Natywny UX Lichess: rysowanie wielokolorowych strzałek, podświetlanie pól, premoves i płynne przeciąganie figur. |
| **Logika szachowa** | `chess.js` | Walidacja legalnych ruchów, generowanie PGN/FEN, detekcja szachów, matów, patów i powtórzeń pozycji. |
| **Silnik szachowy** | `stockfish.wasm` (multi-threaded Web Worker) | Lokalne obliczenia w przeglądarce bez kosztów serwerowych. Obsługa `MultiPV=3` (lub `5`), regulacja siły (`UCI_LimitStrength`, `UCI_Elo`). |
| **Księga debiutowa** | Lokalny parser binarny `.bin` (Polyglot) + baza `ECO` (JSON) + opcjonalne Lichess Opening Explorer API | Pełne pokrycie teorii debiutowej offline oraz dostęp do statystyk partii mistrzowskich i klubowych. |
| **Warstwa AI (Agents)** | OpenAI SDK (`gpt-6.2-sol` jako default) + wzorzec Adapter (`IAgentProvider`) | Modułowe agenty z dedykowanymi promptami systemowymi dla każdego z 4 trybów oraz wsparciem języków PL/EN. |
| **Persystencja lokalna** | `IndexedDB` (via Dexie.js) | Zapis postępów w kursie debiutów, własnych repertuarów, historii partii, preferencji językowych i rozwiązanych zadań. |

---

## 3. Potok analizy i kontrakt danych (Engine → Extractor → AI)

Po każdym ruchu (lub żądaniu analizy) aplikacja wykonuje deterministyczny potok zanim wywoła API modelu `gpt-6.2-sol`:

1. **Analiza Stockfish (`MultiPV=3`):**
   * Obliczenie oceny przed ruchem (`eval_before`) i po ruchu użytkownika (`eval_after`).
   * Wyznaczenie straty w centypionach (`cp_loss`).
   * Pobranie 3 najlepszych kandydatur wraz z ich głównymi liniami kontynuacji (`PV1`, `PV2`, `PV3`) oraz **linii obalenia** (`refutation_pv`), jeśli ruch użytkownika przekracza próg błędu.
2. **Deterministyczny Ekstraktor Faktów Pozycyjnych (`PositionFactExtractor`):**
   * Moduł w TypeScript symuluje na kopii `chess.js` najlepszy wariant silnika oraz wariant obalający ruch gracza, wyciągając twarde dane:
     * **Bilans materialny** na końcu wariantu (np. strata skoczka na f6, zdobycie piona c5).
     * **Motywy taktyczne** (widełki, związanie, szach z odsłony, atak z odsłony, przeciążenie figury, słabość ostatniej linii, wisząca figura).
     * **Zmiany strukturalne i pozycyjne** (utrata prawa do roszady, powstanie izolowanego lub zdwojonego piona, oddanie otwartej linii/przekątnej, osłabienie pól wokół króla).
     * **Status teoretyczny** (kod ECO, nazwa debiutu/wariantu, informacja czy ruch jest w księdze debiutowej oraz jakie są główne kontynuacje książkowe).
3. **Kontrakt JSON wejścia do agenta AI (`AgentInputPayload`):**

```json
{
  "mode": "general_coach | opening_course | kids_mode | tactics_trainer",
  "language": "pl | en",
  "fen_before": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "fen_after": "r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3",
  "user_move_san": "Nxe5",
  "classification": "blunder",
  "eval_before_cp": 25,
  "eval_after_cp": -310,
  "cp_loss": 335,
  "opening": {
    "eco": "C44",
    "name": "King's Knight Opening",
    "in_book": false,
    "book_moves_san": ["Bb5", "Bc4", "d4", "Nc3"]
  },
  "top_candidates": [
    { "rank": 1, "move_san": "Bb5", "eval_cp": 30, "pv_san": ["Bb5", "a6", "Ba4", "Nf6"] },
    { "rank": 2, "move_san": "Bc4", "eval_cp": 20, "pv_san": ["Bc4", "Bc5", "c3", "Nf6"] },
    { "rank": 3, "move_san": "d4", "eval_cp": 18, "pv_san": ["d4", "exd4", "Nxd4", "Bc5"] }
  ],
  "refutation": {
    "pv_san": ["Nxe5", "d4", "Nc6"],
    "extracted_facts": [
      "Loss of minor piece (Knight on e5) for one pawn",
      "Insufficient compensation after 3...Nxe5 4.d4 Nc6"
    ]
  }
}
```

4. **Kontrakt JSON wyjścia z agenta AI (`AgentOutputPayload`):**

```json
{
  "headline": "Błąd taktyczny — oddanie skoczka na e5",
  "critique_why_bad": "Bicie 3.Nxe5 jest podstawką, ponieważ pion e5 jest broniony przez czarnego skoczka z c6. Po 3...Nxe5 4.d4 czarny skoczek odchodzi na c6 z utrzymaniem czystej figury przewagi.",
  "best_move_rationale": "Zamiast tego 3.Bb5 (Partia Hiszpańska) wywiera pośredni nacisk na obrońcę piona e5 i przygotowuje roszadę, a 3.Bc4 celuje we wrażliwy punkt f7.",
  "suggested_arrows": [
    { "from": "f1", "to": "b5", "color": "green" },
    { "from": "c6", "to": "e5", "color": "red" }
  ],
  "referenced_moves_san": ["Nxe5", "d4", "Nc6", "Bb5", "Bc4"]
}
```

---

## 4. Specyfikacja 4 trybów funkcjonalnych

### 4.1. Tryb: Nauka dla dzieci (`kids_mode`)
Projektowany z myślą o najmłodszych adeptach szachów (od ok. 3,5 roku życia) rozpoczynających poznawanie szachownicy i zasad ruchu figur.
* **UX i wizualizacja ruchów:**
  * Kliknięcie lub najechanie na własną figurę natychmiast podświetla na szachownicy wszystkie legalne pola ruchu za pomocą wyraźnych, przyjaznych wizualnie znaczników oraz strzałek kierunkowych:
    * **Ruch na puste pole:** wyraźna zielona kropka / delikatna strzałka toru ruchu (szczególnie pomocna przy nauce ruchu skoczka w kształcie litery „L” oraz zasięgu gońca, wieży i hetmana).
    * **Bicie figury przeciwnika:** wyraźny pierścień/celownik na polu przeciwnika.
    * **Opcjonalny filtr bezpieczeństwa („Pola pod atakiem”):** delikatne ostrzeżenie wizualne, jeśli dziecko chce postawić figurę na polu bitym przez przeciwnika bez obrony.
  * Duże, kontrastowe figury, brak przytłaczającego panelu notacji algebraicznej i zegara.
* **Agent AI (`KidsCoachAgent`):**
  * Komunikaty dostosowane do poziomu przedszkolaka (zarówno w języku polskim, jak i angielskim): krótkie, ciepłe, obrazowe zdania bez żargonu szachowego (zamiast *„zostawiłeś skoczka bez obrony na polu f3”* → *„Uwaga! Czarna wieża patrzy na to pole i może zbić naszego konika. Spróbujmy poszukać bezpieczniejszego miejsca!”*).
  * Pozytywne wzmocnienie za każdy poprawny ruch oraz proste podpowiedzi kierunkowe.

### 4.2. Tryb: Kurs debiutów (`opening_course`)
Kompletny system nauki i treningu debiutów oparty o pełną księgę debiutową i weryfikację silnikową.
* **Baza wiedzy i nawigacja:**
  * Pełna księga debiutowa (obsługa plików Polyglot `.bin` + pełna klasyfikacja ECO + podgląd statystyk frekwencji i skuteczności ruchów w każdej pozycji).
  * Możliwość przeglądania dowolnego debiutu, wariantu głównego, linii pobocznych oraz transpozycji.
* **Podtryby pracy:**
  1. **Tryb Eksploracji (Wykład trenera):** Użytkownik klika kolejne ruchy z księgi, a `OpeningCoachAgent` wyjaśnia **idee strategiczne** pozycji: gdzie idą poszczególne figury, jakie są typowe przełomy pionowe, czego unikać i jaki plan gry środkowej wynika z danej struktury.
  2. **Tryb Sparingu Repertuarowego (Drill):** Użytkownik wybiera kolor (Białe/Czarne) i debiut/wariant. System odpowiada ruchami z księgi (wg wybranej wagi: główne linie lub zaskakujące warianty poboczne).
     * Jeśli użytkownik zagra ruch spoza głównej linii, system deterministycznie sprawdza w Stockfishu i księdze, czy jest to **grywalna linia poboczna / transpozycja** (akceptuje i komentuje zmianę charakteru gry), czy **błąd debiutowy** (natychmiast zatrzymuje, pokazuje linię obalenia i pozwala cofnąć ruch).

### 4.3. Tryb: Tryb ogólny — Sparing i Analiza (`general_coach`)
Główny tryb do gry treningowej oraz analizy dowolnej pozycji (z FEN, PGN lub od pozycji początkowej).
* **Funkcje w każdej pozycji:**
  * Wyświetlanie 3 najlepszych kandydatur według Stockfisha (`MultiPV=3`) jako strzałek na szachownicy (zróżnicowanych kolorem/grubością zależnie od oceny).
  * Uzasadnienie na żądanie lub automatyczne, **dlaczego najlepszy ruch jest najsilniejszy** w danej pozycji (odwołanie do konkretnych motywów z ekstraktora faktów).
  * **Krytyka słabego wyboru:** Gdy ruch użytkownika powoduje spadek oceny powyżej zdefiniowanego progu (np. konfigurowalne: `> 0.4` piona dla niedokładności, `> 1.0` piona dla błędu), trener AI generuje konkretną krytykę zawierającą:
    1. Co ruch użytkownika psuje w pozycji (taktycznie lub strukturalnie).
    2. Dokładny wariant obalenia (`refutation_pv`) z możliwością kliknięcia i prześledzenia go na szachownicy.
    3. Lepszą alternatywę wraz z jej ideą.

### 4.4. Tryb: Tryb zadań — Kombinacje i Taktyka (`tactics_trainer`)
Trener kombinacji oparty o otwarte bazy zadań (np. podzbiór bazy Lichess Puzzles w formacie CSV/JSON) oraz import własnych zestawów PGN.
* **Mechanika zadań:**
  * Filtrowanie po poziomie trudności (ranking) oraz motywach taktycznych (widełki, związanie, odciągnięcie, przeciążenie, podwójny szach, motyw mata na ostatniej linii, końcówki).
  * Weryfikacja wieloruchowa: zadanie wymaga znalezienia całej wymuszającej sekwencji.
  * **Krytyka błędnych prób:** Jeśli użytkownik zagra kuszący, ale błędny ruch (np. zła kolejność bicia lub przedwczesny szach), Stockfish wylicza obronę przeciwnika, a `TacticsCoachAgent` tłumaczy, dlaczego ten pomysł nie działa, zanim użytkownik cofnie ruch i spróbuje ponownie.
  * Stopniowalny system podpowiedzi (1. wskazanie motywu taktycznego → 2. wskazanie figury, którą należy zagrać → 3. pełne rozwiązanie z wyjaśnieniem).

---

## 5. Wymagania przekrojowe: UI/UX (styl Lichess) i Cofanie ruchów

### 5.1. Drzewo wariantów i bezwarunkowe cofanie ruchów (`Undo / Takeback`)
* **Wymóg krytyczny:** W **każdym z 4 trybów** użytkownik ma natychmiastową możliwość cofania ruchów (przycisk w UI, skrót klawiszowy `Strzałka w lewo` / `Ctrl+Z`, kliknięcie wcześniejszego węzła na liście ruchów).
* Stan partii przechowywany jest jako **drzewo wariantów (Move Tree)**, a nie płaska tablica ruchów — cofnięcie ruchu i zagranie innego tworzy boczną odnogę analizy (identycznie jak w Lichess Analysis Board).
* Cofnięcie ruchu natychmiast anuluje bieżące obliczenia Web Workera Stockfisha dla starej pozycji, uruchamia analizę dla przywróconego węzła i synchronizuje kontekst komentarza AI.

### 5.2. Interfejs graficzny inspirowany Lichess.org
* **Układ 3-kolumnowy (Desktop):**
  * **Lewy panel:** Wybór trybu, przełącznik języka (**PL / EN**), ustawienia sesji (siła silnika, próg czułości krytyki, wybór debiutu/kategorii zadań, filtr pól dla dzieci).
  * **Centrum:** Pasek oceny pozycji (`Evaluation Bar` po lewej stronie szachownicy), szachownica `chessground` z warstwą strzałek SVG (`MultiPV` + strzałki krytyki/podpowiedzi), paski gracza i silnika nad/pod szachownicą.
  * **Prawy panel:** Interaktywny zapis partii i drzewa wariantów (`PGN Tree`), panel statystyk księgi debiutowej (w trybie debiutowym) oraz dedykowane okno **Trenera AI** z wyraźnym rozdzieleniem sekcji: *Ocena ruchu*, *Dlaczego to błąd / Dlaczego to najlepszy ruch* oraz przyciskiem *"Pokaż wariant na szachownicy"*.

---

## 6. Struktura projektu i plan implementacji (do przeglądu przez GPT Sol)

```text
/src
  /core
    /engine          # Wrapper Web Workera dla Stockfish.wasm (kolejka zadań, MultiPV, abort)
    /chess           # Zarządzanie drzewem wariantów (MoveTree), wrapper chess.js, walidator SAN
    /opening-book    # Parser Polyglot (.bin), baza ECO, adapter Lichess Opening Explorer API
    /fact-extractor  # Deterministyczna analiza zmian materialnych, motywów taktycznych i struktury
  /agents
    /contracts       # Schematy TypeScript & JSON Schema (AgentInputPayload, AgentOutputPayload)
    /providers       # IAgentProvider, OpenAIProvider (default: gpt-6.2-sol), CustomEndpointProvider
    /prompts         # Szablony systemowe (PL/EN) dla: KidsCoach, OpeningCoach, GeneralCoach, TacticsCoach
  /i18n
    /locales         # Słowniki tłumaczeń interfejsu (pl.json, en.json)
  /ui
    /board           # Integracja chessground, warstwa strzałek SVG, podświetlenia dla Kids Mode
    /panels          # MoveTreePanel, EvalBar, CoachPanel, OpeningExplorerPanel, SettingsModal (BYOK)
    /modes           # Widoki i kontrolery dla 4 trybów
```

### Proponowana kolejność wdrażania (Milestones)
1. **Faza 1 (Core Deterministyczny & i18n):** Konfiguracja projektu, system tłumaczeń (`PL / EN`), `chessground` + `chess.js`, drzewo wariantów z pełną obsługą `Undo` oraz wielowątkowy `Stockfish.wasm` Web Worker zwracający `MultiPV=3` i rysujący strzałki na szachownicy.
2. **Faza 2 (Księga Debiutowa & Fact Extractor):** Implementacja parsera księgi debiutowej (Polyglot + ECO) oraz modułu `PositionFactExtractor` generującego deterministyczny opis różnic pozycji i wariantów obalenia.
3. **Faza 3 (Warstwa Agentów AI & Walidator):** Implementacja `OpenAIProvider` (`gpt-6.2-sol`), ekranu konfiguracji klucza API (BYOK), dwujęzycznych promptów (PL/EN) dla wszystkich 4 trybów oraz walidatora legalności ruchów SAN w odpowiedziach LLM.
4. **Faza 4 (Realizacja 4 Trybów UI):** Dopracowanie dedykowanego UX dla `kids_mode` (wizualizacja zasięgu figur i pól bicia), `opening_course`, `general_coach` oraz `tactics_trainer` z bazą zadań i systemem podpowiedzi.