// heic2any ships no types. Minimal declaration for the browser HEIC→JPEG
// conversion used in components/photo-manager.tsx.
declare module "heic2any" {
  interface Heic2AnyOptions {
    blob: Blob
    toType?: string
    quality?: number
  }
  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>
}
