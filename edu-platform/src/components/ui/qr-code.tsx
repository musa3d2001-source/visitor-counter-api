import { encode } from "uqr";

/**
 * رمز QR يُرسم على الخادم عناصر SVG عادية: لا سكربت ولا صورة خارجية، فلا تتغير سياسة CSP.
 * أبيض دائمًا تحت الرمز حتى تقرأه الكاميرا. الهامش ٤ وحدات كما يشترط معيار QR.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, data } = encode(value, { ecc: "M", border: 4 });
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y]?.[x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={className} data-testid="totp-qr">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
