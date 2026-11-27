export function CodeAndLicenses() {
  return (
    <details className="web-sources">
      <summary>Kod i licencje</summary>
      <ul>
        <li>
          <a href="/chess-coach-source.tar.gz" download>
            Kod Chess Coach
            <small>GPL-3.0-only · pobierz archiwum</small>
          </a>
        </li>
        <li>
          <a href="https://github.com/nmrugg/stockfish.js/tree/8d9ca57043594a8fa6ae0b73fb685d9105bf51df"
            target="_blank" rel="noreferrer">Kod Stockfish.js</a>
        </li>
        <li><a href="/stockfish/Copying.txt" target="_blank" rel="noreferrer">Licencja Stockfisha</a></li>
      </ul>
    </details>
  );
}
