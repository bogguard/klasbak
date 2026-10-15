// JsBarcode ships no types for its encoders; we only use the Code 128 one.
declare module 'jsbarcode/bin/barcodes/CODE128/index.js' {
  export class CODE128 {
    constructor(data: string, options: object);
    valid(): boolean;
    /** `data` is the symbol as a string of modules: "1" = bar, "0" = space. */
    encode(): { data: string; text: string };
  }
}
