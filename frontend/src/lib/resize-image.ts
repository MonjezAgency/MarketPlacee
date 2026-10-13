/** Downscale an image file in the browser (keeps aspect ratio) before upload. */
export async function resizeImage(file: File, max = 384, type: 'image/webp' | 'image/jpeg' = 'image/webp', quality = 0.86): Promise<File> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, type, quality));
        if (!blob) return file;
        return new File([blob], file.name.replace(/\.\w+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg'), { type: blob.type || type });
    } catch { return file; }
    finally { URL.revokeObjectURL(url); }
}
