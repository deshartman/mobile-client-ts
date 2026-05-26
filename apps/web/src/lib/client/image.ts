const AVATAR_MAX_PX = 256;
const JPEG_QUALITY = 0.85;

/**
 * Read a File, draw it into a 256×256 centered-crop canvas, export as a
 * JPEG data URL. Keeps avatars under ~40KB so they don't bloat every
 * /contacts response and stay clean at 44px display size.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  return resizeToSquare(img, AVATAR_MAX_PX);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

function resizeToSquare(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const scale = Math.max(size / img.width, size / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;

  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
