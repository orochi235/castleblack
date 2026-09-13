/** Rasterizing a slot's render at a chosen size, not the intrinsic one.
 *
 *  Renders declare only a `viewBox`, so an `<img>` decodes them at an
 *  engine-chosen size and `drawImage` then stretches that decode. Setting
 *  `width`/`height` on the root fixes the size the decoder targets.
 *
 *  A slot need not hold SVG at all, so a render travels as bytes and is sized
 *  only where sizing means anything. A raster has no `preserveAspectRatio` to
 *  letterbox it, so it gets `contain()` instead.
 */

const OPEN_SVG_TAG = /<svg\b[^>]*>/;

/** A `viewBox` standing for the size a tag declares, where it has no box.
 *
 *  Without one the size below is a crop, not a scale: user units with no box
 *  to map them are CSS pixels. */
function boxFor(tag: string): string {
  if (/\sviewBox="/.test(tag)) return '';
  const w = /\swidth="([\d.]+)/.exec(tag);
  const h = /\sheight="([\d.]+)/.exec(tag);
  return w && h ? ` viewBox="0 0 ${w[1]} ${h[1]}"` : '';
}

/** `svgText` with its root tag's `width`/`height` set to `w`/`h`, replacing
 *  either attribute if already present. */
export function injectSize(svgText: string, w: number, h: number): string {
  return svgText.replace(OPEN_SVG_TAG, (tag) => {
    const box = boxFor(tag);
    const stripped = tag
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '');
    return stripped.replace(/^<svg/, `<svg width="${w}" height="${h}"${box}`);
  });
}

/** `blob` with a `w`x`h` sized SVG root, or `blob` itself. A raster carries
 *  its own dimensions, and reading one as text destroys it. */
export async function sizedBlob(blob: Blob, w: number, h: number):
    Promise<Blob> {
  if (blob.type !== 'image/svg+xml') return blob;
  return new Blob([injectSize(await blob.text(), w, h)], { type: blob.type });
}

/** Where a `sw`x`sh` image sits, centered, inside a `w`x`h` box with its
 *  shape kept -- the `object-fit: contain` rect, in canvas coordinates. */
export function contain(sw: number, sh: number, w: number, h: number):
    { x: number; y: number; w: number; h: number } {
  if (!(sw > 0) || !(sh > 0)) return { x: 0, y: 0, w, h };
  const scale = Math.min(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

/** A decoded render, rasterized at exactly `w`x`h` device pixels.
 *
 *  Chrome's `createImageBitmap` throws `InvalidStateError` on any SVG blob,
 *  so there the `<img>`-into-canvas fallback runs, sized the same way. */
export async function rasterize(render: Blob, w: number, h: number):
    Promise<CanvasImageSource> {
  const svg = render.type === 'image/svg+xml';
  const blob = await sizedBlob(render, w, h);
  // Only an SVG letterboxes itself; `resizeWidth` on a raster is a stretch.
  if (svg && typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, {
        resizeWidth: w, resizeHeight: h, resizeQuality: 'high',
      });
    } catch {
      /* fall through to the <img> path below */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = svg ? new Image(w, h) : new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('render decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context to rasterize into');
    ctx.imageSmoothingQuality = 'high';
    const at = svg ? { x: 0, y: 0, w, h }
                   : contain(img.naturalWidth, img.naturalHeight, w, h);
    ctx.drawImage(img, at.x, at.y, at.w, at.h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The render at `url`, as bytes: reading a raster slot as UTF-8 corrupts it
 *  past decoding. The caller holds them so a reraster costs no refetch. */
export async function fetchRender(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.blob();
}

/** Fetches the render at `url` and rasterizes it at `w`x`h`. */
export async function fetchAndRasterize(url: string, w: number, h: number):
    Promise<CanvasImageSource> {
  return rasterize(await fetchRender(url), w, h);
}
