import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function webAssets(): Plugin {
  const root = import.meta.dirname;
  const stockfish = path.join(root, 'node_modules', 'stockfish');
  return {
    name: 'chess-coach-web-assets',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace("base-uri 'none';", "connect-src 'self'; worker-src 'self'; base-uri 'none';");
    },
    writeBundle(options) {
      const outDir = path.resolve(root, options.dir ?? 'dist-web');
      const engineDir = path.join(outDir, 'stockfish');
      mkdirSync(engineDir, { recursive: true });
      for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
        copyFileSync(path.join(stockfish, 'bin', file), path.join(engineDir, file));
      }
      copyFileSync(path.join(stockfish, 'Copying.txt'), path.join(engineDir, 'Copying.txt'));
      cpSync(path.join(root, 'recordings'), path.join(outDir, 'recordings'), { recursive: true });
      for (const file of ['lion-coach.png', 'owl-coach.png']) {
        const portrait = path.join(root, 'public', file);
        if (existsSync(portrait)) copyFileSync(portrait, path.join(outDir, file));
      }
      execFileSync('tar', [
        '-czf', path.join(outDir, 'chess-coach-source.tar.gz'),
        'LICENSE', 'README.md', 'package.json', 'package-lock.json',
        'index.html', 'tsconfig.json', 'vite.config.ts', 'vercel.json',
        'src', 'shared', 'server', 'api', 'desktop', 'scripts', 'docs/SSOT.md', 'recordings/POCHODZENIE.md',
      ], { cwd: root, stdio: 'inherit' });
    },
  };
}

export default defineConfig(({ mode }) => mode === 'web' ? {
  base: '/',
  envDir: false,
  publicDir: false,
  build: { outDir: 'dist-web' },
  plugins: [webAssets()],
} : { base: './', envDir: false });
