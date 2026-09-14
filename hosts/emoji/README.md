# Emoji host

All 3,944 fully-qualified emoji in Emoji 17.0 on one compact wall: no header,
sidebar or legend, dark, sized to embed. Each cell draws its emoji in the
viewer's own emoji font, so there is nothing to bake and no server. It is
published to GitHub Pages by `.github/workflows/pages.yml`.

```bash
npm run dev -w hosts/emoji       # http://localhost:5197
npm run build -w hosts/emoji     # dist/
npx vitest run                   # in hosts/emoji/
```

`scripts/emoji.mjs` fetches `emoji-test.txt` once into `.cache/`, checks its
pinned sha256, and writes `public/emoji.json`; `dev` and `build` run it first.
