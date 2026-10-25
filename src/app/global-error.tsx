"use client";

/** Last-resort boundary when the root layout itself fails; must render its own <html>. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#14131f",
          color: "#f3f2f8",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>PocketPulse couldn’t load</h1>
          <p style={{ opacity: 0.75, marginBottom: 20 }}>
            Nothing was saved or changed. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#9b7bff",
              color: "#140f26",
              border: 0,
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
