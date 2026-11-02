/**
 * قراءة مدة فيديو MP4 من صندوق mvhd (بدون أدوات خارجية).
 * يُمرَّر جزء من بداية الملف أو نهايته؛ يعيد null إن لم يُعثر على moov/mvhd.
 */
export function mp4DurationSeconds(buf: Uint8Array): number | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const readType = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);

  function scan(start: number, end: number): number | null {
    let o = start;
    while (o + 8 <= end) {
      let size = view.getUint32(o);
      const type = readType(o + 4);
      let header = 8;
      if (size === 1) {
        if (o + 16 > end) return null;
        size = Number(view.getBigUint64(o + 8));
        header = 16;
      } else if (size === 0) {
        size = end - o;
      }
      if (size < header) return null;
      const boxEnd = Math.min(o + size, end);
      if (type === "moov") return scan(o + header, boxEnd);
      if (type === "mvhd") {
        const p = o + header;
        if (p + 4 > end) return null;
        const version = buf[p];
        if (version === 1) {
          if (p + 32 > end) return null;
          const timescale = view.getUint32(p + 20);
          const duration = Number(view.getBigUint64(p + 24));
          return timescale ? duration / timescale : null;
        }
        if (p + 20 > end) return null;
        const timescale = view.getUint32(p + 12);
        const duration = view.getUint32(p + 16);
        return timescale ? duration / timescale : null;
      }
      o += size;
    }
    return null;
  }

  // من بداية الملف: البحث المتسلسل في الصناديق العليا
  const fromStart = scan(0, buf.length);
  if (fromStart !== null) return Math.round(fromStart);
  // من جزء عشوائي (نهاية الملف): البحث عن توقيع mvhd مباشرة
  for (let i = 4; i + 4 < buf.length; i++) {
    if (buf[i] === 0x6d && readType(i) === "mvhd") {
      const size = view.getUint32(i - 4);
      const r = scan(i - 4, Math.min(buf.length, i - 4 + size));
      if (r !== null) return Math.round(r);
    }
  }
  return null;
}
