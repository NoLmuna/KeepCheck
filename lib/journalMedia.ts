export async function compressVisitPhoto(
  file: Blob,
): Promise<{ blob: Blob; thumbnail: Blob }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  try {
    async function render(width: number, quality: number) {
      const scale = Math.min(1, width / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo processing unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Could not compress photo")),
          "image/webp",
          quality,
        ),
      );
    }
    let blob = await render(1280, 0.78);
    if (blob.size > 250 * 1024) blob = await render(1100, 0.68);
    if (blob.size > 250 * 1024) blob = await render(960, 0.58);
    return { blob, thumbnail: await render(320, 0.65) };
  } finally {
    bitmap.close();
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function shareCard(title: string, lines: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Card rendering unavailable");
  ctx.fillStyle = "#faf3e8";
  ctx.fillRect(0, 0, 720, 960);
  ctx.fillStyle = "#6b4930";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("KEEPCHECK · MY FOOD JOURNAL", 48, 65);
  let y = 135;
  function text(content: string, font: string) {
    ctx!.font = font;
    let line = "";
    for (const word of content.split(/\s+/)) {
      const next = `${line} ${word}`.trim();
      if (ctx!.measureText(next).width > 624 && line) {
        ctx!.fillText(line, 48, y);
        y += 38;
        line = word;
      } else line = next;
    }
    ctx!.fillText(line, 48, y);
    y += 50;
  }
  ctx.fillStyle = "#2f241b";
  text(title, "bold 40px sans-serif");
  for (const line of lines) {
    if (y > 850) break;
    text(line, "26px sans-serif");
  }
  ctx.font = "18px sans-serif";
  ctx.fillText("Saved moments. Good places.", 48, 920);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not create card"))),
      "image/png",
    ),
  );
  const file = new File([blob], "keepcheck-card.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  downloadBlob(blob, "keepcheck-card.png");
}
