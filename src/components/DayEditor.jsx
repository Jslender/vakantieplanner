import React, { useMemo, useState } from "react";
import { geocodeCandidates } from "../utils/geocode.js";
import ResultPickerModal from "./ResultPickerModal.jsx";

const TRANSPORT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "vliegtuig", label: "Vliegtuig" },
  { value: "trein", label: "Trein" },
  { value: "boot", label: "Boot" },
  { value: "geen", label: "Geen (blijven op locatie)" }
];

function ensureSegments(day) {
  const segs = Array.isArray(day.flightSegments) ? day.flightSegments : [];
  if (segs.length >= 1) return segs;
  return [{ id: crypto.randomUUID(), flightNumber: "", departTime: "", arriveTime: "" }];
}

export default function DayEditor({ day, dayDateLabel, onChange, onGeocoded, onGeocodedVia }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pickState, setPickState] = useState(null); // { title, results, onPick }
  const [tab, setTab] = useState("reis");

  const title = useMemo(() => `Dag ${day.dayNumber}`, [day.dayNumber]);

  const isFlight = day.transportMode === "vliegtuig";
  const isNone = day.transportMode === "geen";
  const startLabel = isNone ? "Verblijflocatie" : "Startbestemming";
  const vias = Array.isArray(day.vias) ? day.vias : [];
  const segments = ensureSegments(day).slice(0, 2);

  async function geocode(which) {
    setErr("");
    setBusy(true);
    try {
      const query = (which === "start" ? day.startText : day.endText)?.trim();
      const results = await geocodeCandidates(query, { limit: 6 });

      if (!results.length) {
        setErr(`Geen locatie gevonden voor: "${query}"`);
        return;
      }

      if (results.length === 1) {
        onGeocoded(which, results[0]);
        return;
      }

      setPickState({
        title: `Kies bestemming voor ${which === "start" ? "locatie" : "eindbestemming"}`,
        results,
        onPick: (r) => {
          setPickState(null);
          onGeocoded(which, r);
        }
      });
    } catch (e) {
      setErr(e?.message || "Geocoding fout");
    } finally {
      setBusy(false);
    }
  }

  async function geocodeVia(viaId) {
    setErr("");
    setBusy(true);
    try {
      const via = vias.find((v) => v.id === viaId);
      const query = (via?.text ?? "").trim();
      const results = await geocodeCandidates(query, { limit: 6 });

      if (!results.length) {
        setErr(`Geen locatie gevonden voor: "${query}"`);
        return;
      }

      if (results.length === 1) {
        onGeocodedVia(viaId, results[0]);
        return;
      }

      setPickState({
        title: "Kies juiste via-bestemming",
        results,
        onPick: (r) => {
          setPickState(null);
          onGeocodedVia(viaId, r);
        }
      });
    } catch (e) {
      setErr(e?.message || "Geocoding fout");
    } finally {
      setBusy(false);
    }
  }

  function onTransportChange(nextMode) {
    const base = { ...day, transportMode: nextMode };

    if (nextMode === "geen") {
      base.endText = "";
      base.endPoint = null;
      base.vias = [];
      base.route = null;
    }

    if (nextMode !== "vliegtuig") {
      base.flightSegments = ensureSegments(base).slice(0, 1);
    }

    onChange(base);
  }

  return (
    <div>
      {pickState && (
        <ResultPickerModal
          title={pickState.title}
          results={pickState.results}
          onPick={pickState.onPick}
          onClose={() => setPickState(null)}
        />
      )}

      <div className="row">
        <div>
          <span className="badge">{title}</span>
          <span className="small">{dayDateLabel ? `• ${dayDateLabel}` : ""}</span>
        </div>
      </div>

      <div className="divider" />

      <div className="tabs">
        <button className={tab === "reis" ? "tab active" : "tab"} onClick={() => setTab("reis")}>Reis</button>
        <button className={tab === "hotel" ? "tab active" : "tab"} onClick={() => setTab("hotel")}>Hotel</button>
        <button className={tab === "activiteiten" ? "tab active" : "tab"} onClick={() => setTab("activiteiten")}>Activiteiten</button>
      </div>

      {tab === "reis" && (
        <>
      {/* 1) Transport */}
      <div className="row">
        <div>
          <label>Transport</label>
          <select value={day.transportMode} onChange={(e) => onTransportChange(e.target.value)}>
            {TRANSPORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="divider" />

      {/* 2) Bestemmingen */}
      <div className="row">
        <div>
          <label>{startLabel}</label>
          <input
            value={day.startText || ""}
            placeholder={isNone ? "Bijv. Moab" : "Bijv. Amsterdam"}
            onChange={(e) => onChange({ ...day, startText: e.target.value, startAutoFromPrev: false })}
          />
        </div>
        <div style={{ flex: "0 0 120px" }}>
          <label>&nbsp;</label>
          <button disabled={busy || !(day.startText || "").trim()} onClick={() => geocode("start")}>
            Zoek
          </button>
        </div>
      </div>

      {!isNone && (
        <React.Fragment>
          <div className="divider" style={{ marginTop: 10, marginBottom: 10 }} />

          <div className="row" style={{ alignItems: "baseline" }}>
            <div>
              <label>Via (tussenbestemmingen)</label>
              <div className="small">Auto: via's tellen mee in route. Vliegtuig: rechte lijn per segment.</div>
            </div>
            <div style={{ flex: "0 0 160px" }}>
              <button
                className="secondary"
                onClick={() =>
                  onChange({
                    ...day,
                    vias: [...vias, { id: crypto.randomUUID(), text: "", point: null }],
                    route: null
                  })
                }
              >
                + Via toevoegen
              </button>
            </div>
          </div>

          {vias.length > 0 && (
            <div className="viaList" style={{ marginTop: 8 }}>
              {vias.map((v, idx) => (
                <div key={v.id} className="viaRow">
                  <div>
                    <label>Via {idx + 1}</label>
                    <input
                      value={v.text || ""}
                      placeholder="Bijv. Luxemburg stad"
                      onChange={(e) => {
                        const nextVias = vias.map((x) =>
                          x.id === v.id ? { ...x, text: e.target.value, point: null } : x
                        );
                        onChange({ ...day, vias: nextVias, route: null });
                      }}
                    />
                  </div>
                  <div>
                    <label>&nbsp;</label>
                    <button disabled={busy || !(v.text || "").trim()} onClick={() => geocodeVia(v.id)}>
                      Zoek
                    </button>
                  </div>
                  <div>
                    <label>&nbsp;</label>
                    <button
                      className="danger"
                      title="Verwijderen"
                      onClick={() => {
                        const nextVias = vias.filter((x) => x.id !== v.id);
                        onChange({ ...day, vias: nextVias, route: null });
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="divider" style={{ marginTop: 10, marginBottom: 10 }} />

          <div className="row">
            <div>
              <label>Eindbestemming</label>
              <input
                value={day.endText || ""}
                placeholder="Bijv. Trier"
                onChange={(e) => onChange({ ...day, endText: e.target.value })}
              />
            </div>
            <div style={{ flex: "0 0 120px" }}>
              <label>&nbsp;</label>
              <button disabled={busy || !(day.endText || "").trim()} onClick={() => geocode("end")}>
                Zoek
              </button>
            </div>
          </div>

          {/* 3) Vliegtuigdetails (tussen bestemming en hotel) */}
          {isFlight && (
            <React.Fragment>
              <div className="divider" />
              <div className="row" style={{ alignItems: "baseline" }}>
                <div>
                  <label>Vluchtgegevens</label>
                  <div className="small">Optioneel: 2e vlucht voor overstap op dezelfde dag.</div>
                </div>
                <div style={{ flex: "0 0 220px" }}>
                  <button
                    className="secondary"
                    onClick={() => {
                      const cur = ensureSegments(day);
                      if (cur.length >= 2) onChange({ ...day, flightSegments: [cur[0]] });
                      else
                        onChange({
                          ...day,
                          flightSegments: [
                            ...cur,
                            { id: crypto.randomUUID(), flightNumber: "", departTime: "", arriveTime: "" }
                          ]
                        });
                    }}
                  >
                    {ensureSegments(day).length >= 2 ? "2e vlucht verwijderen" : "+ 2e vlucht toevoegen"}
                  </button>
                </div>
              </div>

              {segments.map((seg, idx) => (
                <div key={seg.id} className="row" style={{ marginTop: 8 }}>
                  <div>
                    <label>Vluchtnummer {idx + 1}</label>
                    <input
                      value={seg.flightNumber || ""}
                      placeholder="Bijv. KL1234"
                      onChange={(e) => {
                        const next = ensureSegments(day).slice(0, 2);
                        next[idx] = { ...next[idx], flightNumber: e.target.value };
                        onChange({ ...day, flightSegments: next });
                      }}
                    />
                  </div>
                  <div>
                    <label>Vertrek {idx + 1}</label>
                    <input
                      type="time"
                      value={seg.departTime || ""}
                      onChange={(e) => {
                        const next = ensureSegments(day).slice(0, 2);
                        next[idx] = { ...next[idx], departTime: e.target.value };
                        onChange({ ...day, flightSegments: next });
                      }}
                    />
                  </div>
                  <div>
                    <label>Aankomst {idx + 1}</label>
                    <input
                      type="time"
                      value={seg.arriveTime || ""}
                      onChange={(e) => {
                        const next = ensureSegments(day).slice(0, 2);
                        next[idx] = { ...next[idx], arriveTime: e.target.value };
                        onChange({ ...day, flightSegments: next });
                      }}
                    />
                  </div>
                </div>
              ))}
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      <div className="divider" />

        </>
      )}

      {tab === "hotel" && (
        <>
      {/* 4) Hotel (onder bestemmingen / vlucht) */}
      <div>
        <label>Hotel (naam)</label>
        <input
          value={day.hotelName || ""}
          placeholder="Bijv. Best Western ..."
          onChange={(e) => onChange({ ...day, hotelName: e.target.value })}
        />
      </div>

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Hotel adres</label>
          <input
            value={day.hotelAddress || ""}
            placeholder="Straat + plaats (liefst zo specifiek mogelijk)"
            onChange={(e) => onChange({ ...day, hotelAddress: e.target.value })}
          />
        </div>
        <div style={{ flex: "0 0 auto", minWidth: "auto" }}>
          <button
            type="button"
            className="secondary"
            style={{ width: "auto", whiteSpace: "nowrap", padding: "10px 14px" }}
            onClick={() => {
              const addr = (day.hotelAddress || "").trim();
              if (!addr) return;
              const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
              window.open(url, "_blank");
            }}
          >
            Open in Maps
          </button>
        </div>
      </div>


      <div className="row">
        <div>
          <label>Hotel link</label>
          <input
            value={day.hotelLink || ""}
            placeholder="https://..."
            onChange={(e) => onChange({ ...day, hotelLink: e.target.value })}
          />
          {(day.hotelLink || "").trim() && (
            <div className="small" style={{ marginTop: 6 }}>
              <a className="inlineLink" href={day.hotelLink} target="_blank" rel="noreferrer">
                Open hotelpagina
              </a>
            </div>
          )}
        </div>
        <div>
          <label>Hotel kosten (per nacht)</label>
          <input
            type="number"
            step="0.01"
            value={day.hotelCost ?? ""}
            placeholder="Bijv. 149.00"
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...day, hotelCost: v === "" ? null : Number(v) });
            }}
          />
        </div>
      </div>

      <div className="row">
        <div>
          <label>Ontbijt</label>
          <div className="checkboxRow">
            <input
              type="checkbox"
              checked={!!day.breakfastIncluded}
              onChange={(e) => onChange({ ...day, breakfastIncluded: e.target.checked })}
            />
            <span className="small">Ontbijt inbegrepen</span>
          </div>
        </div>

        <div>
          <label>Betaald</label>
          <div className="checkboxRow">
            <input
              type="checkbox"
              checked={!!day.hotelPaid}
              onChange={(e) => onChange({ ...day, hotelPaid: e.target.checked })}
            />
            <span className="small">Hotel al betaald</span>
          </div>
        </div>
      </div>

            <div className="row" style={{ alignItems: "flex-end" }}>
        <div>
          <label>Extra kosten (omschrijving)</label>
          <input
            value={day.extraCostLabel || ""}
            placeholder="Bijv. parkeren"
            onChange={(e) => onChange({ ...day, extraCostLabel: e.target.value })}
          />
        </div>
        <div>
          <label>Extra kosten (bedrag)</label>
          <input
            type="number"
            step="0.01"
            value={day.extraCostAmount ?? ""}
            placeholder="Bijv. 18.50"
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...day, extraCostAmount: v === "" ? null : Number(v) });
            }}
          />
        </div>
        <div className="small" style={{ flex: "1 1 100%", marginTop: -4 }}>
          Tip: vul bedrag in als het meetelt voor totals.
        </div>
      </div>

      <div className="divider" />

        </>
      )}

      {tab === "activiteiten" && (
        <>
          <div>
            <label>Activiteiten / dagplanning</label>
            <textarea
              value={day.activities || ""}
              placeholder="Bijv. hikes, viewpoints, restaurants, tijden..."
              onChange={(e) => onChange({ ...day, activities: e.target.value })}
            />
          </div>

          <div className="divider" />

          <div>
            <label>Notities (algemeen)</label>
            <textarea
              value={day.notes || ""}
              placeholder="Overig: route-info, reserveringen, reminders..."
              onChange={(e) => onChange({ ...day, notes: e.target.value })}
            />
          </div>
        </>
      )}

      {err && (
        <div className="small" style={{ color: "crimson", marginTop: 6 }}>
          {err}
        </div>
      )}
    </div>
  );
}
