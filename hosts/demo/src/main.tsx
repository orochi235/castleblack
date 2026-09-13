import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@weasel-js/labkit/styles.css';
import { bandedLayout, blockLayout } from '@castleblack/wall/src/grouped';
import { defaultUrls } from '@castleblack/wall/src/urls';
import { WallView, type WallGrouping } from '@castleblack/wall/src/WallView';
import { DEMO, type DemoItem } from './spec';
import './demo.css';

const urls = defaultUrls('/api');

async function fetchItems(slot: string, since?: string) {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const response = await fetch(`/api/items/${encodeURIComponent(slot)}${query}`);
  if (!response.ok) throw new Error(`items for ${slot}: ${response.status}`);
  const body = await response.json() as { items: DemoItem[]; version: string };
  return { items: body.items, version: body.version };
}

async function fetchSlots() {
  const response = await fetch('/api/slots');
  const body = await response.json() as { slots: { slot: string; n: number }[] };
  return body.slots;
}

const groupings: WallGrouping<DemoItem>[] = [
  { key: 'kind', label: 'kind', layout: () => blockLayout((item: DemoItem) => item.kind, []) },
  { key: 'born', label: 'year born', desc: 'newest first',
    layout: (desc) => bandedLayout((item: DemoItem) => `${Math.floor(item.born / 10) * 10}s`,
                                   (item: DemoItem) => String(item.born), desc) },
];

function Card({ item, slot }: { item: DemoItem; slot: string }) {
  return (
    <div className="demo-card">
      <img className="demo-card__picture" alt=""
           src={item.sha ? urls.render(slot, item.id, item.sha.slice(0, 8)) : undefined} />
      <dl>
        <dt>id</dt><dd>{item.id}</dd>
        <dt>kind</dt><dd>{item.kind}, hue {item.hue}</dd>
        <dt>born</dt><dd>{item.born}</dd>
        <dt>render</dt>
        <dd>{item.error ?? (item.secs === null ? 'not drawn' : `${item.secs.toFixed(1)} s`)}</dd>
        {item.tags.length > 0 && (<><dt>tags</dt><dd>{item.tags.join(', ')}</dd></>)}
      </dl>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WallView title="castleblack demo" spec={DEMO} urls={urls}
              fetchItems={fetchItems} fetchSlots={fetchSlots} defaultSlot="outline"
              storageKey="castleblack-demo.params" groupings={groupings}
              facet={{ key: 'kind', label: 'kind' }}
              renderCard={(item, slot) => <Card item={item} slot={slot} />} />
  </StrictMode>,
);
