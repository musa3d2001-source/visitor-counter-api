"use client";

import { DB_BUSY_MESSAGE, DB_BUSY_TITLE, isBusyDigest } from "@/lib/busy";

/**
 * خطأ في التخطيط الجذري نفسه: لا نضمن تحميل globals.css أو الخطوط هنا،
 * لذا التنسيق كله داخلي (inline) بنفس ألوان «الفصل المشمس».
 */
const font = "'Cairo Variable', Cairo, Tajawal, 'Segoe UI', Tahoma, system-ui, sans-serif";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const busy = isBusyDigest(error.digest);
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          fontFamily: font,
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          padding: 16,
          boxSizing: "border-box",
          color: "#172026",
          background:
            "radial-gradient(40% 55% at 96% 4%, rgb(255 197 49 / 0.38), transparent 70%), radial-gradient(36% 50% at 4% 22%, rgb(23 163 152 / 0.25), transparent 70%), radial-gradient(44% 46% at 30% 100%, rgb(255 173 138 / 0.32), transparent 70%), linear-gradient(180deg, #fff8ec, #fff2e0)",
        }}
      >
        <main
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 460,
            boxSizing: "border-box",
            textAlign: "center",
            background: "#fff",
            borderRadius: 32,
            padding: "44px 24px 32px",
            boxShadow: "0 2px 4px rgb(23 32 38 / 0.04), 0 30px 60px -30px rgb(120 80 20 / 0.35)",
            overflow: "hidden",
          }}
        >
          <div aria-hidden style={{ position: "absolute", top: 0, insetInline: 32, height: 6, borderRadius: "0 0 8px 8px", background: "linear-gradient(90deg, #ff6b5a, #ffc531, #18b9a7, #4d8dff, #9b5cf6)" }} />
          <div
            aria-hidden
            style={{
              width: 76,
              height: 76,
              margin: "0 auto",
              borderRadius: 24,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(145deg, #ffa07a, #e8483f)",
              boxShadow: "0 6px 0 #b4322a, 0 18px 30px -14px rgb(180 50 42 / 0.6)",
            }}
          >
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 2.5 20h19Z" />
              <path d="M12 10v4M12 17.2v.1" />
            </svg>
          </div>
          <h1 style={{ margin: "22px 0 8px", fontSize: 30, fontWeight: 900, lineHeight: 1.3 }}>{busy ? DB_BUSY_TITLE : "حدث خطأ غير متوقع"}</h1>
          <p style={{ margin: "0 0 26px", fontSize: 17, lineHeight: 1.9, color: "#3c4a52" }}>{busy ? DB_BUSY_MESSAGE : "حاول مرة أخرى بعد لحظات. إذا تكرر الخطأ، عُد إلى الصفحة الرئيسية."}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                minHeight: 52,
                padding: "0 26px",
                border: 0,
                borderRadius: 16,
                cursor: "pointer",
                fontFamily: font,
                fontSize: 17,
                fontWeight: 800,
                color: "#fff",
                background: "linear-gradient(180deg, #17a398, #0a6b66)",
                boxShadow: "0 5px 0 #075a55, 0 14px 24px -12px rgb(6 63 60 / 0.6)",
              }}
            >
              إعادة المحاولة
            </button>
            {/* رابط عادي (لا Link) لأن التطبيق نفسه في حالة خطأ */}
            <a
              href="/"
              style={{
                minHeight: 52,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 24px",
                borderRadius: 16,
                fontSize: 17,
                fontWeight: 800,
                color: "#172026",
                textDecoration: "none",
                background: "#fff",
                border: "2px solid #e0d2ba",
                boxShadow: "0 4px 0 #e0d2ba",
              }}
            >
              الصفحة الرئيسية
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
