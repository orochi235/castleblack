import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { tableFromIPC } from 'apache-arrow';
import { Persistence } from '@weasel-js/labkit';
import '@weasel-js/labkit/styles.css';
import { bandedLayout, blockLayout, type GroupKey } from '@pezlie/wall/src/grouped';
import { defaultUrls } from '@pezlie/wall/src/urls';
import { WallView, type WallGrouping } from '@pezlie/wall/src/WallView';
import {
  COLLECTION_LABELS, COLLECTIONS, planeKey, planeLabel, PLANES, UNICODE,
  type CodePoint, type Collection,
} from './spec';
import './unicode.css';

function feed(collection: Collection) {
  return {
    urls: defaultUrls(`/api/${collection}`),
    fetchItems: async (slot: string, since?: string) => {
      const query = since ? `?since=${encodeURIComponent(since)}` : '';
      const response = await fetch(`/api/${collection}/items/${encodeURIComponent(slot)}${query}`);
      if (!response.ok) throw new Error(`${collection} items: ${response.status}`);
      const table = tableFromIPC(new Uint8Array(await response.arrayBuffer()));
      return { table, version: response.headers.get('x-feed-version') ?? '' };
    },
    fetchSlots: async () => {
      const response = await fetch(`/api/${collection}/slots`);
      return ((await response.json()) as { slots: { slot: string; n: number }[] }).slots;
    },
  };
}

const FEEDS = Object.fromEntries(COLLECTIONS.map((c) => [c, feed(c)])) as
  Record<Collection, ReturnType<typeof feed>>;

const byPlane: GroupKey<CodePoint> = { reads: ['plane'], of: (c) => planeKey(c.plane), label: planeLabel };
// Keyed by the block's first code point so blocks run in code point order.
const byBlock: GroupKey<CodePoint> = {
  reads: ['block_start', 'block'],
  of: (c) => `${String(c.block_start ?? 0x10ffff).padStart(7, '0')} ${c.block}`,
  label: (key) => key.slice(8),
};

const groupings: WallGrouping<CodePoint>[] = [
  { key: 'plane', label: 'plane', layout: () => blockLayout(byPlane, PLANES.map((_, i) => planeKey(i))) },
  { key: 'block', label: 'block', desc: 'last plane first', layout: (desc) => bandedLayout(byPlane, byBlock, desc) },
  { key: 'script', label: 'script', layout: () => blockLayout({ reads: ['script'], of: (c) => c.script }, []) },
];

function Card({ item }: { item: CodePoint }) {
  return (
    <div className="unicode-card">
      <span className="unicode-card__glyph" aria-hidden="true">
        {item.kind === 'assigned' ? String.fromCodePoint(item.cp) : ''}
      </span>
      <dl>
        <dt>code point</dt><dd>{item.id}</dd>
        <dt>name</dt><dd>{item.name || 'none'}</dd>
        <dt>category</dt><dd>{item.gc}</dd>
        <dt>block</dt><dd>{item.block}</dd>
        <dt>script</dt><dd>{item.script}</dd>
        <dt>since</dt><dd>{item.age ? `Unicode ${item.age}` : 'not assigned'}</dd>
      </dl>
    </div>
  );
}

const fromHash = (): Collection => {
  const asked = window.location.hash.slice(1);
  return (COLLECTIONS as readonly string[]).includes(asked) ? asked as Collection : 'codepoints';
};

function App() {
  const [collection, setCollection] = useState(fromHash);
  useEffect(() => {
    const follow = () => setCollection(fromHash());
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  const { urls, fetchItems, fetchSlots } = FEEDS[collection];
  return (
    <WallView key={collection} title="pezlie: Unicode" spec={UNICODE} urls={urls}
              fetchItems={fetchItems} fetchSlots={fetchSlots} defaultSlot="ucd"
              storageKey={`pezlie-unicode.${collection}.params`} groupings={groupings}
              facet={{ key: 'script', label: 'script' }}
              header={(
                <label className="unicode-collection">
                  <span>collection</span>
                  <select value={collection}
                          onChange={(e) => { window.location.hash = e.target.value; }}>
                    {COLLECTIONS.map((c) => <option key={c} value={c}>{COLLECTION_LABELS[c]}</option>)}
                  </select>
                </label>
              )}
              renderCard={(item) => <Card item={item} />}
              describe={(item) => `${item.id} ${item.name}`} />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Persistence storageKey="pezlie-unicode"><App /></Persistence>
  </StrictMode>,
);
