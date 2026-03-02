import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

// Read-only, phone-friendly day viewer (no map) with prev/next
export default function MobileItinerary({ tripName, startDateISO, days }) {
  const nav = useNavigate();
  const params = useParams();

  const safeDays = Array.isArray(days) ? days : [];
  const dayNumParam = Number(params.dayNumber || 1);
  const dayNumber = Number.isFinite(dayNumParam) && dayNumParam > 0 ? dayNumParam : 1;

  const dayIndex = useMemo(() => {
    const idx = safeDays.findIndex(d => Number(d.dayNumber) === Number(dayNumber));
    return idx >= 0 ? idx : 0;
  }, [safeDays, dayNumber]);

  const day = safeDays[dayIndex] || null;

  const tripRange = useMemo(() => {
    if (!startDateISO || !safeDays.length) return "";
    const d0 = new Date(startDateISO + "T00:00:00");
    const dEnd = new Date(d0.getTime() + (safeDays.length - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return `${fmt(d0)} t/m ${fmt(dEnd)}`;
  }, [startDateISO, safeDays]);

  const dayDateLabel = useMemo(() => {
    if (!startDateISO || !day) return "";
    const d0 = new Date(startDateISO + "T00:00:00");
    const d = new Date(d0.getTime() + (day.dayNumber - 1) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }, [startDateISO, day]);

  const transportLabel = (m) => {
    switch (m) {
      case "auto": return "Auto";
      case "vliegtuig": return "Vliegtuig";
      case "boot": return "Boot";
      case "trein": return "Trein";
      case "geen": return "Geen (verblijfsdag)";
      default: return m || "-";
    }
  };

  const money = (v) => {
    if (v == null || v === "") return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
  };

  const mapsSearchUrl = (q) => {
    const query = (q || "").trim();
    if (!query) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };

  const mapsDirUrl = (dest) => {
    // dest can be {lat,lng} or string
    if (!dest) return null;
    if (typeof dest === "string") {
      const q = dest.trim();
      if (!q) return null;
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    }
    const lat = Number(dest.lat);
    const lng = Number(dest.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  };

  const openUrl = (url) => {
    if (!url) return;
    window.open(url, "_blank");
  };

  const goDay = (n) => {
    const nn = Math.max(1, Math.min(safeDays.length || 1, n));
    nav(`/mobiel/${nn}`);
  };

  const autoLink = (text) => {
    const t = String(text || "");
    if (!t.trim()) return null;
    const parts = t.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((p, i) => {
      if (/^https?:\/\//.test(p)) {
        return <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  if (!day) {
    return (
      <div className="mobileWrap">
        <header className="mobileHeader">
          <div className="mobileTopRow">
            <div>
              <div className="mobileTrip">{tripName || "Reis"}</div>
              <div className="mobileSub">{tripRange || "Geen dagen gevonden."}</div>
            </div>
            <Link className="mobileBack" to="/">Planner</Link>
          </div>
        </header>
        <main className="mobileCard">
          <div className="mobileEmpty">Geen dagen gevonden.</div>
        </main>
      </div>
    );
  }

  const dayTitle = `Dag ${day.dayNumber}`;

  const segs = Array.isArray(day.flightSegments) ? day.flightSegments : [];
  const filledFlights = segs.filter(s => (s.flightNumber || s.departTime || s.arriveTime));

  // Destination for maps actions
  const primaryPoint = day.transportMode === "geen"
    ? (day.startPoint || null)
    : (day.endPoint || null);

  const primaryText = day.transportMode === "geen"
    ? (day.startText || "")
    : (day.endText || "");

  const destDir = mapsDirUrl(primaryPoint || primaryText);
  const destSearch = mapsSearchUrl(primaryText);

  const hotelSearch = mapsSearchUrl(day.hotelAddress || day.hotelName);

  return (
    <div className="mobileWrap">
      <header className="mobileHeader">
        <div className="mobileTopRow">
          <div>
            <div className="mobileTrip">{tripName || "Reis"}</div>
            <div className="mobileSub">{tripRange}</div>
            <div className="mobileSub2">{dayTitle}{dayDateLabel ? ` • ${dayDateLabel}` : ""}</div>
          </div>

          <div className="mobileNav">
            <button className="btn" disabled={dayIndex <= 0} onClick={() => goDay(day.dayNumber - 1)}>◀</button>
            <button className="btn" disabled={dayIndex >= (safeDays.length - 1)} onClick={() => goDay(day.dayNumber + 1)}>▶</button>
            <Link className="mobileBack" to="/">Planner</Link>
          </div>
        </div>
      </header>

      <main className="mobileCard">
        <section className="mobileSection">
          <div className="sectionTitle">Reis</div>

          <div className="kvRow">
            <div className="kvKey">Transport</div>
            <div className="kvVal">{transportLabel(day.transportMode)}</div>
          </div>

          <div className="kvRow">
            <div className="kvKey">Locatie</div>
            <div className="kvVal">
              {day.transportMode === "geen" ? (day.startText || "-") : `${day.startText || "-"} → ${day.endText || "-"}`}
            </div>
          </div>

          {Array.isArray(day.vias) && day.vias.filter(v => (v.text || "").trim()).length > 0 && (
            <div className="kvRow">
              <div className="kvKey">Via</div>
              <div className="kvVal">{day.vias.filter(v => (v.text || "").trim()).map(v => v.text).join(" • ")}</div>
            </div>
          )}

          {day.transportMode === "auto" && (day.autoKm || day.autoTime) && (
            <div className="kvRow">
              <div className="kvKey">Auto</div>
              <div className="kvVal">{day.autoKm ? `${day.autoKm} km` : ""}{day.autoTime ? ` • ${day.autoTime}` : ""}</div>
            </div>
          )}

          {day.transportMode === "vliegtuig" && filledFlights.length > 0 && (
            <div className="kvRow">
              <div className="kvKey">Vluchten</div>
              <div className="kvVal">
                {filledFlights.map((s, i) => (
                  <div key={i} className="flightLine">
                    {(s.flightNumber || "Vlucht")} {s.departTime ? `• ${s.departTime}` : ""}{s.arriveTime ? `–${s.arriveTime}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="actionRow">
            {destDir && <button className="btnPrimary" type="button" onClick={() => openUrl(destDir)}>Navigeer</button>}
            {!destDir && destSearch && <button className="btnPrimary" type="button" onClick={() => openUrl(destSearch)}>Open in Maps</button>}
          </div>
        </section>

        <section className="mobileSection">
          <div className="sectionTitle">Hotel</div>

          <div className="kvRow">
            <div className="kvKey">Naam</div>
            <div className="kvVal">{day.hotelName || "-"}</div>
          </div>

          <div className="kvRow">
            <div className="kvKey">Adres</div>
            <div className="kvVal">{day.hotelAddress || "-"}</div>
          </div>

          <div className="actionRow">
            {hotelSearch && <button className="btn" type="button" onClick={() => openUrl(hotelSearch)}>Open in Maps</button>}
            {(day.hotelLink || "").trim() && (
              <button className="btn" type="button" onClick={() => openUrl(day.hotelLink)}>Hotelpagina</button>
            )}
          </div>

          {(day.hotelCostPerNight || day.breakfastIncluded || day.extraCostLabel || day.extraCostAmount != null || day.hotelPaid) && (
            <div className="kvGrid">
              <div className="kvPill">{day.hotelCostPerNight ? `Kosten: ${money(day.hotelCostPerNight)}/nacht` : "Kosten: -"}</div>
              <div className="kvPill">{day.breakfastIncluded ? "Ontbijt: ja" : "Ontbijt: nee"}</div>
              <div className="kvPill">{day.hotelPaid ? "Betaald: ja" : "Betaald: nee"}</div>
              {(day.extraCostLabel || day.extraCostAmount != null) && (
                <div className="kvPill">
                  Extra: {(day.extraCostLabel || "kosten")}
                  {day.extraCostAmount != null && day.extraCostAmount !== "" ? ` (${money(day.extraCostAmount)})` : ""}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mobileSection">
          <div className="sectionTitle">Activiteiten</div>
          <div className="mobileText">{autoLink(day.activities) || <span className="muted">-</span>}</div>

          <div className="dividerSmall" />

          <div className="sectionTitle">Notities</div>
          <div className="mobileText">{autoLink(day.notes) || <span className="muted">-</span>}</div>
        </section>

        <div className="mobileFooterNav">
          <button className="btn" disabled={dayIndex <= 0} onClick={() => goDay(day.dayNumber - 1)}>◀ Vorige</button>
          <button className="btn" disabled={dayIndex >= (safeDays.length - 1)} onClick={() => goDay(day.dayNumber + 1)}>Volgende ▶</button>
        </div>
      </main>
    </div>
  );
}
