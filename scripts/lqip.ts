import sharp from "sharp";

export async function createLqip(imageUrl: string) {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Image returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return sharp(bytes)
    .rotate()
    .resize({ width: 18, height: 18, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 50 })
    .toBuffer()
    .then((buffer) => buffer.toString("base64"));
}
