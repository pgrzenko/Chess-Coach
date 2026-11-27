# AI Chess Coach — zasady pracy agentów

## Decyzje i zakres prac

- Bieżące decyzje właściciela mają pierwszeństwo. [SSOT](docs/SSOT.md) obowiązuje przy planowaniu i implementacji. Aktualny kod, konfiguracja i testy mówią, co już działa. Rozbieżność z SSOT opisz i uzgodnij, zanim zmienisz zachowanie produktu.
- Przed zmianą sprawdź checkout, gałąź, HEAD, status i różnice w objętych plikach. Zachowaj cudze zmiany. Działaj lokalnie w uzgodnionej ścieżce. Pytania i diagnozy traktuj jako odczyt. Zmianę zakresu, kosztowne operacje i publikację uzgodnij z właścicielem.
- Stosuj Ponytail. Najpierw szukaj istniejącego rozwiązania, potem korzystaj z biblioteki standardowej i platformy. Wprowadzaj najmniejszą kompletną zmianę. Testuj zachowanie przy zwykłym użyciu i istotne przypadki brzegowe. Ogranicz odkrywanie i logi do bieżącego zadania.

## Delegowanie i raportowanie

- Każde zlecenie dla agenta zapisz jako Markdown w `personal/ai-outputs/<temat>/Prompts/`. W pierwszych liniach podaj pełną bezwzględną ścieżkę katalogu `Chess Coach` z aktualnego zlecenia, adres `https://github.com/pgrzenko/Chess-Coach` i aktywną gałąź. Przy ścieżkach ze spacją używaj cudzysłowów w poleceniach.
- Podaj oczekiwany wynik, granice zadania, weryfikację oraz dokładną ścieżkę raportu. Każdy agent zostawia po zadaniu zwięzły raport Markdown w `personal/ai-outputs/<temat>/Reports/`. Raport zawiera zakres, zmienione pliki, wykonane polecenia z wynikami oraz uwagi i ryzyka.
- Całe `personal/` jest ignorowane przez Git. Przed commitem sprawdź zakres staged. Klucze, dane osobowe, prompty i raporty robocze pozostają lokalne. W jednym checkoucie pracuje jeden autor zmian naraz.

## Podział zadań

- **Codex (`gpt-6.2-sol`)** prowadzi architekturę, utrzymuje SSOT, implementuje trudne zadania i weryfikuje pracę. Zachowaj model i poziom rozumowania wybrane przez właściciela.
- **Claude Opus 5.5 (Cursor)** pracuje przy najtrudniejszej logice deterministycznej, złożonych algorytmach i refaktoryzacjach.
- **Grok 4.7 High / Grok Bot (Cursor)** bierze dobrze opisane trudne zadania, moduły UI i odrębne prace równoległe.
- **GitHub Copilot (`Gemini 3.8 Flash`)** bierze proste testy, drobne poprawki i mechaniczne uzupełnienia.
- **Gemini Web (`Hydrogen`)** służy do pogłębionych analiz domenowych i sprawdzania źródeł.

## Weryfikacja i delivery

- Uruchom najpierw skupione testy zmienionego zachowania, potem typecheck, potrzebny build i `git diff --check`. Podaj faktycznie wykonane polecenia i wyniki. Dla logiki szachowej sprawdzaj deterministyczne dane przed wywołaniem modelu.
- W PR do `main` uruchamiaj jeden zestaw kontroli. Po scaleniu powtarzaj go tylko wtedy, gdy zmienił się sprawdzany kod lub konfiguracja wpływająca na wynik. Gotowe wydanie sprawdź na Windows z lokalnym silnikiem oraz w trybie bez sieci.
- Commity, push, PR-y i publikacja GitHub Releases wymagają zakresu zatwierdzonego przez właściciela. Po jego zatwierdzeniu agent prowadzi cały uzgodniony proces, łącznie z rozpoznaniem błędów CI i sprawdzeniem wydania.
