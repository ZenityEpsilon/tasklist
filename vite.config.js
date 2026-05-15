import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function inlineHtmlAssets() {
  let outDir = 'dist';

  return {
    name: 'inline-html-assets',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const dist = resolve(outDir);
      const htmlPath = resolve(dist, 'index.html');
      if (!existsSync(htmlPath)) return;

      let source = readFileSync(htmlPath, 'utf8');

      source = source.replace(
        /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g,
        (tag, fileName) => {
          const assetPath = resolve(dist, fileName);
          if (!existsSync(assetPath)) return tag;

          const css = readFileSync(assetPath, 'utf8').replaceAll('url(./', 'url(./assets/');
          unlinkSync(assetPath);

          return `<style>${css}</style>`;
        }
      );

      source = source.replace(
        /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g,
        (tag, fileName) => {
          const assetPath = resolve(dist, fileName);
          if (!existsSync(assetPath)) return tag;

          const js = readFileSync(assetPath, 'utf8');
          unlinkSync(assetPath);

          return `<script type="module">${js}</script>`;
        }
      );

      writeFileSync(htmlPath, source);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), inlineHtmlAssets()]
});
