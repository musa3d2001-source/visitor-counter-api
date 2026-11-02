"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <h1>حدث خطأ غير متوقع</h1>
          <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 10 }}>
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
