import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Persistence } from '@weasel-js/labkit';
import '@weasel-js/labkit/styles.css';
import { defaultUrls } from '@pezlie/wall/src/urls';
import { WallView } from '@pezlie/wall/src/WallView';
import { EMOJI, type Emoji } from './spec';
import './emoji.css';

const BASE = import.meta.env.BASE_URL;
// No sheets are baked, so these only ever miss; the cells draw glyphs instead.
const URLS = defaultUrls(`${BASE}api`);
// Wide enough to fit a tile with every emoji large enough to draw.
const PARAMS = { cols: 32 };

async function fetchItems(_slot: string, since?: string) {
  // A static file never changes under an open page.
  if (since) return { items: [] as Emoji[], version: since };
  const response = await fetch(`${BASE}emoji.json`);
  if (!response.ok) throw new Error(`emoji.json: ${response.status}`);
  return (await response.json()) as { items: Emoji[]; version: string };
}

const fetchSlots = async () => [{ slot: 'emoji', n: 0 }];

function Card({ item }: { item: Emoji }) {
  return (
    <div className="emoji-card">
      <span className="emoji-card__glyph" aria-hidden="true">{item.emoji}</span>
      <dl>
        <dt>name</dt><dd>{item.name}</dd>
        <dt>group</dt><dd>{item.group}</dd>
        <dt>subgroup</dt><dd>{item.subgroup}</dd>
        <dt>since</dt><dd>Emoji {item.version.toFixed(1)}</dd>
        <dt>code points</dt><dd>{item.id.replaceAll('-', ' ')}</dd>
      </dl>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Persistence storageKey="pezlie-emoji">
      <WallView compact mode="dark" title="pezlie: every emoji" spec={EMOJI} urls={URLS}
                fetchItems={fetchItems} fetchSlots={fetchSlots} defaultSlot="emoji"
                storageKey="pezlie-emoji.params" paramDefaults={PARAMS}
                renderCard={(item) => <Card item={item} />}
                describe={(item) => item.name} />
    </Persistence>
  </StrictMode>,
);
