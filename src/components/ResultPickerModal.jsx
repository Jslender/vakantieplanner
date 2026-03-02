import React from "react";

export default function ResultPickerModal({ title, results, onPick, onClose }) {
  if (!results?.length) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: "baseline" }}>
          <h2 style={{ flex: "1 1 auto" }}>{title || "Kies de juiste bestemming"}</h2>
          <div style={{ flex: "0 0 120px" }}>
            <button className="secondary" onClick={onClose}>Sluiten</button>
          </div>
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          Meerdere matches gevonden. Kies de juiste (en ja, dit had Google al sinds 2004 kunnen oplossen, maar goed).
        </div>

        <div className="resultList">
          {results.map((r, idx) => (
            <button
              key={idx}
              className="resultBtn"
              onClick={() => onPick(r)}
              title={r.displayName}
            >
              <strong>{r.city || r.displayName.split(",")[0]}</strong>
              <div className="small">
                {[
                  r.state,
                  r.country,
                  r.type ? `(${r.type})` : ""
                ].filter(Boolean).join(" • ")}
              </div>
              <div className="small">{r.displayName}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
