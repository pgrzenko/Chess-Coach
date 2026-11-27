# AI Chess Coach

Lokalny prototyp analizy szachowej i sparingu ze Stockfishem dla Windows. Zakres pierwszego wydania jest w [SSOT](docs/SSOT.md).

## Uruchomienie na Windows x64

Potrzebny jest Node.js 22.12 lub nowszy.

```powershell
npm ci
npm run setup:engine
npm start
```

Instalacja pobiera Electron i oficjalny Stockfish 19. Instalator silnika sprawdza SHA-256 archiwum i zapisuje plik w lokalnym `personal/stockfish/`. Przy kolejnym uruchomieniu aplikacja działa z plików na dysku. Można ustawić `STOCKFISH_PATH` na ścieżkę do własnego binarium UCI.

Na szachownicy zagraj ruch i odczytaj maksymalnie trzy warianty Stockfisha. Cofnij strzałką w lewo albo wybierz wcześniejszy węzeł. Inny ruch z tego samego węzła tworzy odnogę. Oceny są pokazywane z perspektywy białych.

W Sparingu wybierz kolor i rozegraj partię ze Stockfishem. Podpowiedzi możesz włączyć w panelu trenera. Domyślnie jest nim Lew, a Sowę możesz wybrać w tym samym panelu. Odczyt podpowiedzi mówi współrzędne pełnymi słowami, np. „z e dwa na e cztery”. Gdy aplikacja ma nagranie wybranego trenera dla tego ruchu, odtwarza je lokalnie. W pozostałych przypadkach używa polskiego głosu Windows.

## Dla dzieci

Lekcja „Mat w jednym” działa bez klucza. Lew pokazuje strzałkę po nieudanej próbie. Lokalny głos Windows można włączyć przyciskiem **Odsłuchaj głos Windows**. **Powtórz** korzysta z nagrania w pamięci.

Opcjonalny klucz OpenAI można wpisać w **Dla dzieci → Ustawienia dla dorosłego**. Zapis uruchamia Lunę i głos Cedar. Aplikacja przechowuje klucz w zaszyfrowanym pliku w katalogu danych Electron. Odtworzenie głosu OpenAI następuje po zgodności transkrypcji z zatwierdzonym tekstem. W razie braku klucza, błędu lub rozbieżności aplikacja udostępnia to samo zdanie do odsłuchania głosem Windows. Zapis pól w dymku jest szachowy, np. `g7`. Wymowa jest przygotowywana osobno. Przy uruchomieniu przez `npm start` wpisy `[lion-voice]` w terminalu pokazują liczbę tokenów z Realtime API.

## Weryfikacja

```powershell
npm run typecheck
npm test
npm run build
```

Testy używają zainstalowanego silnika i nie wykonują połączeń z API.

Kod aplikacji jest na licencji GPL-3.0. [Źródło Stockfisha 19 i jego licencja](https://github.com/official-stockfish/Stockfish/tree/sf_19) · [Chessground i jego licencja](https://github.com/lichess-org/chessground/tree/v10.0.0).
