export default function AttachmentPreviewModal({ url, filename, onClose }) {
  const isPdf = filename?.toLowerCase().endsWith(".pdf");

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: "flex-start", paddingTop: 40 }}>
      <div style={{
        width: "90vw", maxWidth: 900, height: "80vh",
        background: "#0d1626", borderRadius: 16, border: "1px solid #1e2d45",
        boxShadow: "0 25px 60px #00000080", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid #111d2e", flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: "var(--t3)", fontWeight: 500 }}>
            📎 {filename || "Invoice"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={url} target="_blank" rel="noreferrer"
              style={{ padding: "6px 12px", background: "var(--surf)", border: "1px solid #1e2d45",
                borderRadius: 8, color: "var(--t2)", fontSize: 12, textDecoration: "none", fontFamily: "inherit" }}>
              Open in new tab ↗
            </a>
            <button onClick={onClose}
              style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surf)", border: "1px solid #1e2d45",
                color: "var(--t2)", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden", background: "var(--bg)" }}>
          {isPdf
            ? <iframe src={url} title={filename} style={{ width: "100%", height: "100%", border: "none" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <img src={url} alt={filename} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
              </div>
          }
        </div>
      </div>
    </div>
  );
}
