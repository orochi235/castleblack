// Runs for every test file; the DOM polyfills apply only under jsdom.
if (typeof window !== 'undefined') {
  // jsdom implements neither, and a drag captures the pointer.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }

  // Node's experimental Web Storage global shadows jsdom's and stays inert
  // without `--localstorage-file`.
  if (typeof globalThis.localStorage === 'undefined') {
    class MemoryStorage implements Storage {
      #store = new Map<string, string>();
      get length() { return this.#store.size; }
      clear() { this.#store.clear(); }
      getItem(key: string) { return this.#store.has(key) ? this.#store.get(key)! : null; }
      key(index: number) { return [...this.#store.keys()][index] ?? null; }
      removeItem(key: string) { this.#store.delete(key); }
      setItem(key: string, value: string) { this.#store.set(key, String(value)); }
    }
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  }

  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // Without PointerEvent, testing-library falls back to a bare Event and every
  // coordinate arrives undefined.
  if (!('PointerEvent' in globalThis)) {
    class PointerEventPolyfill extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventPolyfill;
    (window as unknown as { PointerEvent?: unknown }).PointerEvent = PointerEventPolyfill;
  }

  // jsdom's Blob predates `.text()` and `.arrayBuffer()`.
  if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
    const read = <T>(blob: Blob, as: 'text' | 'buffer'): Promise<T> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as T);
        reader.onerror = () => reject(reader.error);
        if (as === 'text') reader.readAsText(blob);
        else reader.readAsArrayBuffer(blob);
      });
    Blob.prototype.text = function text() { return read<string>(this, 'text'); };
    Blob.prototype.arrayBuffer = function arrayBuffer() {
      return read<ArrayBuffer>(this, 'buffer');
    };
  }

  // react-aria-components escapes collection ids with CSS.escape, which jsdom lacks.
  const host = window as unknown as { CSS?: { escape?: (s: string) => string } };
  if (!host.CSS?.escape) {
    const css = host.CSS ?? {};
    css.escape = (value: string): string => {
      const str = String(value);
      const first = str.charCodeAt(0);
      let out = '';
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c === 0) { out += '�'; continue; }
        if ((c >= 1 && c <= 0x1f) || c === 0x7f
            || (i === 0 && c >= 0x30 && c <= 0x39)
            || (i === 1 && c >= 0x30 && c <= 0x39 && first === 0x2d)) {
          out += '\\' + c.toString(16) + ' ';
          continue;
        }
        if (i === 0 && str.length === 1 && c === 0x2d) { out += '\\' + str[i]; continue; }
        if (c >= 0x80 || c === 0x2d || c === 0x5f
            || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a)
            || (c >= 0x61 && c <= 0x7a)) { out += str[i]; continue; }
        out += '\\' + str[i];
      }
      return out;
    };
    host.CSS = css;
  }
}
