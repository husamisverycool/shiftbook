declare module "heic-convert" {
  interface ConvertOptions {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    /** JPEG quality between 0 and 1. */
    quality?: number;
  }
  export default function convert(options: ConvertOptions): Promise<ArrayBuffer>;
}
