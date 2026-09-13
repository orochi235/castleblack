/** Where the wall fetches a slot's pictures. `bakery`'s routes answer
 *  `defaultUrls('/api')`; a host with other paths supplies its own. */
export interface SlotUrls {
  /** The JSON manifest beside a sheet. */
  manifest(slot: string, level: number): string;
  /** The sheet image, versioned so a rebake is not served from cache. */
  sheet(slot: string, level: number, version?: string): string;
  /** One item's loose tile. */
  tile(slot: string, level: number, id: string): string;
  /** One item's full render, for the vector rung. */
  render(slot: string, id: string): string;
}

export function defaultUrls(base = '/api'): SlotUrls {
  const q = encodeURIComponent;
  return {
    manifest: (slot, level) => `${base}/thumbs/${q(slot)}/sheet-${level}.json`,
    sheet: (slot, level, version) =>
      `${base}/thumbs/${q(slot)}/sheet-${level}.webp${version ? `?v=${q(version)}` : ''}`,
    tile: (slot, level, id) => `${base}/thumbs/${q(slot)}/${level}/${q(id)}.webp`,
    render: (slot, id) => `${base}/corpus/render/${q(slot)}/${q(id)}.svg`,
  };
}
