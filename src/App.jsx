import React, { useEffect, useMemo, useState, useRef } from "react";
import { Routes, Route, Link } from "react-router-dom";
import MobileItinerary from "./MobileItinerary.jsx";

import html2canvas from "html2canvas";
import DayEditor from "./components/DayEditor.jsx";
import MapView from "./components/MapView.jsx";
import { loadState, resetState, saveState } from "./utils/storage.js";
import { fetchRouteOSRM, formatDuration, formatKm } from "./utils/route.js";
import { exportPlanToExcelWithDaySheets } from "./utils/excel_advanced.js";
import { addDaysISO, formatDateNL, localTodayISO } from "./utils/date.js";

const TOTAL_ID = "TOTAL_TRIP";

async function waitForMapMove(map) {
  return new Promise((resolve) => {
    if (!map) return resolve();
    const done = () => {
      try { map.off("moveend", done); } catch {}
      resolve();
    };
    try { map.on("moveend", done); } catch { return resolve(); }
    // safety
    setTimeout(done, 1200);
  });
}

function fitMapExplicit(points) {
  try {
    const map = window.__vp_map;
    if (!map || !points || points.length === 0) return Promise.resolve();

    const clean = points
      .filter((p) => Array.isArray(p) && p.length === 2)
      .map((p) => [Number(p[0]), Number(p[1])])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

    if (clean.length === 0) return Promise.resolve();

    map.invalidateSize();
    if (clean.length >= 2) {
      map.fitBounds(clean, { padding: [60, 60], maxZoom: 12 });
    } else {
      map.setView(clean[0], 11);
    }
    return waitForMapMove(map);
  } catch {
    return Promise.resolve();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeDays(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(),
    dayNumber: i + 1,
    transportMode: "auto",
    startText: "",
    startAutoFromPrev: false,
    endText: "",
    notes: "",
    // hotel
    hotelName: "",
    hotelAddress: "",
    hotelLink: "",
    hotelCost: null,
    breakfastIncluded: false,
    extraCostLabel: "",
    extraCostAmount: null,
    // flight (for vliegtuig)
    flightSegments: [{ id: crypto.randomUUID(), flightNumber: "", departTime: "", arriveTime: "" }],
    // geo
    startPoint: null,
    endPoint: null,
    vias: [],
    route: null
  }));
}

function normalizeLegacyDay(d) {
  return {
    ...d,
    transportMode: d.transportMode ?? "auto",
    startText: d.startText ?? "",
    startAutoFromPrev: !!d.startAutoFromPrev,
    endText: d.endText ?? "",
    notes: d.notes ?? "",
    hotelName: d.hotelName ?? "",
    hotelAddress: d.hotelAddress ?? "",
    hotelLink: d.hotelLink ?? "",
    hotelCost: d.hotelCost ?? null,
    breakfastIncluded: !!d.breakfastIncluded,
    extraCostLabel: d.extraCostLabel ?? "",
    extraCostAmount: d.extraCostAmount ?? null,    flightSegments: Array.isArray(d.flightSegments) && d.flightSegments.length
      ? d.flightSegments.map(s => ({ id: s.id ?? crypto.randomUUID(), flightNumber: s.flightNumber ?? "", departTime: s.departTime ?? s.flightDepartureTime ?? "", arriveTime: s.arriveTime ?? "" }))
      : [{ id: crypto.randomUUID(), flightNumber: d.flightNumber ?? "", departTime: d.flightDepartureTime ?? "", arriveTime: "" }],
    vias: Array.isArray(d.vias) ? d.vias.map(v => ({
      id: v.id ?? crypto.randomUUID(),
      text: v.text ?? "",
      point: v.point ?? null
    })) : [],
    route: d.route ?? null
  };
}

export default function App() {
  const saved = loadState();

  const [tripName, setTripName] = useState(saved?.tripName ?? "");
  const [startDateISO, setStartDateISO] = useState(saved?.startDateISO ?? localTodayISO());
  const [daysCount, setDaysCount] = useState(saved?.daysCount ?? 7);
  const [days, setDays] = useState(saved?.days ? saved.days.map(normalizeLegacyDay) : makeDays(saved?.daysCount ?? 7));
  const [activeDayId, setActiveDayId] = useState(saved?.activeDayId ?? (days?.[0]?.id ?? ""));

  function handleSelectDay(id) {
    if (isExporting) return;
    setActiveDayId((prev) => (prev === id ? "" : id));
  }

  const [busyRoute, setBusyRoute] = useState(false);
  const [routeErr, setRouteErr] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [topTab, setTopTab] = useState("reis");
  const [exportStep, setExportStep] = useState("");

  const daysRef = useRef(days);
  useEffect(() => { daysRef.current = days; }, [days]);

  const activeDay = useMemo(() => {
    if (!activeDayId) return null;
    if (activeDayId === TOTAL_ID) return null;
    return days.find((d) => d.id === activeDayId) ?? null;
  }, [days, activeDayId]);

  // Auto-fit map when switching days (and after routes load)
  useEffect(() => {
    const fn = window.__vp_fitToActive;
    if (typeof fn !== "function") return;
    // Fit immediately and again after a short delay to catch async route drawing
    try { fn(); } catch {}
    const t = setTimeout(() => { try { fn(); } catch {} }, 600);
    return () => clearTimeout(t);
  }, [activeDayId]);

useEffect(() => {
    const ok = saveState({ tripName, startDateISO, daysCount, days, activeDayId });
    if (!ok) {
      setSaveError("Lokale opslag is vol of geblokkeerd. Exporteer je project (JSON) om niets kwijt te raken.");
    } else if (saveError) {
      // clear if it starts working again
      setSaveError("");
    }
  }, [tripName, startDateISO, daysCount, days, activeDayId]);

  function setCount(n) {
    const next = Math.max(1, Math.min(60, n));
    setDaysCount(next);

    setDays((prev) => {
      if (prev.length === next) return prev;
      if (prev.length < next) {
        const extra = makeDays(next - prev.length).map((d, idx) => ({ ...d, dayNumber: prev.length + idx + 1 }));
        return [...prev, ...extra];
      }
      const sliced = prev.slice(0, next).map((d, idx) => ({ ...d, dayNumber: idx + 1 }));
      if (!sliced.some((d) => d.id === activeDayId)) setActiveDayId(sliced[0]?.id ?? null);
      return sliced;
    });
  }

  function updateDay(updated) {
    let normalized = updated;

    if (updated.transportMode === "geen") {
      normalized = {
        ...updated,
        endText: "",
        endPoint: null,
        vias: [],
        route: null,
        flightSegments: [{ id: crypto.randomUUID(), flightNumber: "", departTime: "", arriveTime: "" }]
      };
    }

    if (updated.transportMode !== "auto") {
      normalized = { ...normalized, route: null };
    }

    setDays((prev) => {
      const idx = prev.findIndex((d) => d.id === normalized.id);
      const nextArr = prev.map((d) => (d.id === normalized.id ? normalized : d));

      // Auto-fill: end of day N becomes start of day N+1
      if (idx >= 0 && idx < nextArr.length - 1) {
        const cur = nextArr[idx];
        const nxt = nextArr[idx + 1];

        const shouldSync = (!nxt.startText?.trim()) || nxt.startAutoFromPrev;

        if (cur.transportMode !== "geen") {
          if (cur.endText?.trim() && cur.endPoint && shouldSync) {
            nextArr[idx + 1] = {
              ...nxt,
              startText: cur.endText,
              startPoint: cur.endPoint,
              startAutoFromPrev: true,
              route: nxt.transportMode === "auto" ? null : nxt.route
            };
          } else if ((!cur.endText?.trim() || !cur.endPoint) && nxt.startAutoFromPrev) {
            nextArr[idx + 1] = {
              ...nxt,
              startText: "",
              startPoint: null,
              startAutoFromPrev: false,
              route: nxt.transportMode === "auto" ? null : nxt.route
            };
          }
        }
      }

      return nextArr;
    });
  }

  function missingViaGeocodes(day) {
    return (day.vias ?? []).filter(v => (v.text?.trim() ?? "") !== "" && !v.point);
  }

  function buildAutoPoints(day) {
    const points = [];
    if (day.startPoint) points.push(day.startPoint);
    const viaPoints = (day.vias ?? []).map(v => v.point).filter(Boolean);
    points.push(...viaPoints);
    if (day.endPoint) points.push(day.endPoint);
    return points;
  }

  async function maybeFetchAutoRoute(day) {
    if (day.transportMode !== "auto") return;
    if (!day.startPoint || !day.endPoint) return;

    const missing = missingViaGeocodes(day);
    if (missing.length > 0) {
      setRouteErr("Niet alle via-punten zijn gegeocodeerd. Klik bij elke via op 'Zoek'.");
      return;
    }

    const points = buildAutoPoints(day);
    if (points.length < 2) return;

    setBusyRoute(true);
    setRouteErr("");
    try {
      const route = await fetchRouteOSRM(points);
      updateDay({ ...day, route });
    } catch (e) {
      setRouteErr(e?.message || "Route fout");
    } finally {
      setBusyRoute(false);
    }
  }

  async function onGeocoded(which, result) {
    if (!activeDay) return;
    const updated = { ...activeDay };

    if (which === "start") { updated.startPoint = result; updated.startAutoFromPrev = false; }
    if (which === "end") updated.endPoint = result;

    updated.route = null;
    updateDay(updated);

    // For "geen": no route
    if (updated.transportMode === "geen") return;
    await maybeFetchAutoRoute(updated);
  }

  async function onGeocodedVia(viaId, result) {
    if (!activeDay) return;
    const updated = { ...activeDay, vias: (activeDay.vias ?? []).map(v => v.id === viaId ? { ...v, point: result } : v), route: null };
    updateDay(updated);
    await maybeFetchAutoRoute(updated);
  }

  useEffect(() => {
    if (!activeDay) return;
    if (activeDay.transportMode !== "auto") return;
    if (activeDay.route) return;
    if (!activeDay.startPoint || !activeDay.endPoint) return;
    if (missingViaGeocodes(activeDay).length > 0) return;
    maybeFetchAutoRoute(activeDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay?.transportMode]);

  const viaPoints = useMemo(() => {
    return (activeDay?.vias ?? []).filter(v => v.point).map((v) => ({ ...v.point, id: v.id, label: v.text }));
  }, [activeDay]);

  const routeLineAuto = useMemo(() => {
    const coords = activeDay?.route?.geojson?.coordinates;
    if (!coords?.length) return [];
    return coords.map(([lng, lat]) => [lat, lng]);
  }, [activeDay]);

  const straightLine = useMemo(() => {
    if (activeDay?.transportMode !== "vliegtuig") return [];
    const pts = [];
    if (activeDay?.startPoint) pts.push([activeDay.startPoint.lat, activeDay.startPoint.lng]);
    (viaPoints ?? []).forEach(v => pts.push([v.lat, v.lng]));
    if (activeDay?.endPoint) pts.push([activeDay.endPoint.lat, activeDay.endPoint.lng]);
    return pts.length >= 2 ? pts : [];
  }, [activeDay, viaPoints]);

  const totalView = activeDayId === TOTAL_ID;

  // TOTAL TRIP view aggregates (all days)
  const totalViaPoints = useMemo(() => {
    if (!totalView) return [];
    const pts = [];
    days.forEach((d) => {
      if (d.startPoint) pts.push({ ...d.startPoint, id: `${d.id}-start`, label: d.startText || "Start" });
      (d.vias ?? []).forEach((v, idx) => {
        if (v.point) pts.push({ ...v.point, id: `${d.id}-via-${idx}`, label: v.text || `Via ${idx + 1}` });
      });
      if (d.transportMode !== "geen" && d.endPoint) pts.push({ ...d.endPoint, id: `${d.id}-end`, label: d.endText || "Eind" });
    });
    return pts;
  }, [totalView, days]);

  const totalAutoLines = useMemo(() => {
    if (!totalView) return [];
    const lines = [];
    days.forEach((d) => {
      if (d.transportMode !== "auto") return;
      const coords = d.route?.geojson?.coordinates;
      if (!coords?.length) return;
      lines.push(coords.map(([lng, lat]) => [lat, lng]));
    });
    return lines;
  }, [totalView, days]);

  const totalStraightLines = useMemo(() => {
    if (!totalView) return [];
    const lines = [];
    days.forEach((d) => {
      if (d.transportMode !== "vliegtuig") return;
      const pts = [];
      if (d.startPoint) pts.push([d.startPoint.lat, d.startPoint.lng]);
      (d.vias ?? []).forEach((v) => { if (v.point) pts.push([v.point.lat, v.point.lng]); });
      if (d.endPoint) pts.push([d.endPoint.lat, d.endPoint.lng]);
      if (pts.length >= 2) lines.push(pts);
    });
    return lines;
  }, [totalView, days]);

  const totalStartPoint = useMemo(() => (totalView ? (days[0]?.startPoint ?? null) : null), [totalView, days]);

  const showAutoRoute = (!totalView) && activeDay?.transportMode === "auto";
  const showStraightLine = (!totalView) && activeDay?.transportMode === "vliegtuig";
  const showTotalAuto = totalView;
  const showTotalStraight = totalView;

  const routeMeta = useMemo(() => {
    if (!showAutoRoute) return null;
    const r = activeDay?.route;
    if (!r) return null;
    return { km: formatKm(r.distanceMeters), dur: formatDuration(r.durationSeconds) };
  }, [activeDay, showAutoRoute]);

  const totalKm = useMemo(() => {
    const sum = days.reduce((acc, d) => acc + (d.transportMode === "auto" ? (d.route?.distanceMeters ?? 0) : 0), 0);
    return sum > 0 ? formatKm(sum) : "";
  }, [days]);

  const totalHotelCost = useMemo(() => {
    const sum = days.reduce((acc, d) => acc + (Number(d.hotelCost) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [days]);

  const totalExtraCosts = useMemo(() => {
    const sum = days.reduce((acc, d) => acc + (Number(d.extraCostAmount) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [days]);

  const totalLodgingCost = useMemo(() => Math.round((totalHotelCost + totalExtraCosts) * 100) / 100, [totalHotelCost, totalExtraCosts]);

  const nightsCount = useMemo(() => days.filter(d => (Number(d.hotelCost) || 0) > 0).length, [days]);

  const avgHotelPerNight = useMemo(() => {
    if (!nightsCount) return 0;
    return Math.round((totalHotelCost / nightsCount) * 100) / 100;
  }, [totalHotelCost, nightsCount]);

  const avgLodgingPerNight = useMemo(() => {
    if (!nightsCount) return 0;
    return Math.round((totalLodgingCost / nightsCount) * 100) / 100;
  }, [totalLodgingCost, nightsCount]);

  function dayIso(dayNumber) {
    return startDateISO ? addDaysISO(startDateISO, (dayNumber ?? 1) - 1) : "";
  }
  function dayLabel(dayNumber) {
    const iso = dayIso(dayNumber);
    return iso ? formatDateNL(iso) : "";
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ tripName, startDateISO, daysCount, days }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "slender_vakantieplanner_project.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed?.days?.length) throw new Error("Geen geldige planning");
        setTripName(parsed.tripName ?? "");
        setTripName(parsed.tripName ?? "");
        setStartDateISO(parsed.startDateISO ?? localTodayISO());
        setDaysCount(parsed.daysCount ?? parsed.days.length);
        setDays(parsed.days.map(normalizeLegacyDay));
      } catch (err) {
        alert(err?.message || "Import mislukt");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function hardReset() {
    if (!confirm("Alles wissen?")) return;
    resetState();
    const d = makeDays(7);
    setTripName("");
    setStartDateISO(localTodayISO());
    setTripName("");
    setDaysCount(7);
    setDays(d);
    setActiveDayId(d[0].id);
        setAddPinMode(false);    setRouteErr("");
  }

  async function exportExcelAdvanced() {
    if (isExporting) return;

    setIsExporting(true);
    setExportStep("Voorbereiden…");

    const prevActive = activeDayId;
    const images = {};

    try {
      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        setExportStep(`Dag ${d.dayNumber}: kaart renderen…`);
        setActiveDayId(d.id);
        // Give React + Leaflet time to render this day
        await sleep(900);

        // Ensure auto route is available before capturing (otherwise you only get points)
        const latest = daysRef.current.find(x => x.id === d.id);
        if (latest && latest.transportMode === "auto" && !latest.route && latest.startPoint && latest.endPoint) {
          try {
            const missing = (latest.vias ?? []).filter(v => (v.text?.trim() ?? "") !== "" && !v.point);
            if (missing.length === 0) {
              setExportStep(`Dag ${d.dayNumber}: route ophalen…`);
              const points = [latest.startPoint, ...(latest.vias ?? []).map(v => v.point).filter(Boolean), latest.endPoint];
              const route = await fetchRouteOSRM(points);
              setDays(prev => prev.map(x => x.id === latest.id ? { ...x, route } : x));
              await sleep(1300);
            }
          } catch {}
        }

        // Fit map to this day's geometry for a relevant screenshot (explicit)
        try {
          const cur = daysRef.current.find(x => x.id === d.id) ?? d;
          const pts = [];
          if (cur.startPoint) pts.push([cur.startPoint.lat, cur.startPoint.lng]);
          (cur.vias ?? []).forEach(v => { if (v.point) pts.push([v.point.lat, v.point.lng]); });
          if (cur.transportMode !== "geen" && cur.endPoint) pts.push([cur.endPoint.lat, cur.endPoint.lng]);

          // If we have an auto-route, include a few samples so bounds reflect the real line
          const coords = cur.route?.geojson?.coordinates;
          if (Array.isArray(coords) && coords.length > 5) {
            const step = Math.max(1, Math.floor(coords.length / 8));
            for (let k = 0; k < coords.length; k += step) {
              const [lng, lat] = coords[k];
              pts.push([lat, lng]);
            }
          }

          await fitMapExplicit(pts);
          // extra wait so tiles + polylines paint before capture
          await sleep(1300);
        } catch {
          await sleep(500);
        }

        const el = document.getElementById("mapCapture");
        if (!el) continue;

        setExportStep(`Dag ${d.dayNumber}: screenshot maken…`);
        const canvas = await html2canvas(el, {
          useCORS: true,
          backgroundColor: "#ffffff",
          scale: 2
        });
        images[d.id] = canvas.toDataURL("image/png");
      }

      setExportStep("Excel bouwen…");
      await exportPlanToExcelWithDaySheets({
        tripName,
        days,
        dayLabelFn: dayLabel,
        totalAutoKmText: totalKm,
        totalHotelCost,
        totalExtraCosts,
        totalLodgingCost,
        nightsCount,
        avgHotelPerNight,
        avgLodgingPerNight,
        mapImagesByDayId: images
      });
    } catch (e) {
      alert(e?.message || "Excel export mislukt");
    } finally {
      setActiveDayId(prevActive);
      setExportStep("");
      setIsExporting(false);
    }
  }

  return (
    <div className="app">
      <div className="card sidebar">
        <div className="header">
          <h1>Slender vakantieplanner</h1>
          <div className="small">{tripName && startDateISO ? `${tripName} • ${formatDateNL(startDateISO)} t/m ${formatDateNL(addDaysISO(startDateISO, daysCount-1))}` : ""}</div>
        </div>

        <div className="divider" />

        {saveError && (
          <div className="saveErrorBanner">
            <strong>Let op:</strong> {saveError}
          </div>
        )}

        <div className="topTabs">
          <button type="button" className="chipBtn" style={{marginLeft:"auto"}} onClick={() => { const n = activeDay?.dayNumber || 1; window.open(`/mobiel/${n}`, "_blank"); }}>Telefoonweergave</button>
          <button className={topTab === "reis" ? "tab active" : "tab"} onClick={() => setTopTab("reis")}>
            Reisinstellingen
          </button>
          <button className={topTab === "opslag" ? "tab active" : "tab"} onClick={() => setTopTab("opslag")}>
            Opslag
          </button>
        </div>

        {topTab === "reis" && (
          <>
            <div className="row">
              <div>
                <label>Naam van reis</label>
                <input
                  value={tripName}
                  placeholder="Bijv. Utah roadtrip 2026"
                  onChange={(e) => setTripName(e.target.value)}
                />
              </div>
            </div>

            <div className="row">
              <div>
                <label>Startdatum</label>
                <input type="date" value={startDateISO} onChange={(e) => setStartDateISO(e.target.value)} />
              </div>
              <div>
                <label>Aantal dagen</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={daysCount}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
            </div>
          </>
        )}

        {topTab === "opslag" && (
          <>
            <div className="row" style={{ marginTop: 6 }}>
              <div>
                <label>Export</label>
                <button className="secondary" onClick={exportExcelAdvanced} disabled={isExporting}>
                  Export Excel (samenvatting + dagbladen)
                </button>
              </div>
              <div className="small">
                Tip: export maakt per dag een kaart-screenshot gebaseerd op de route/lijn.
              </div>
            </div>

            {isExporting && (
              <div className="exportingBanner">
                <strong>Export bezig…</strong>
                <br />
                <span className="small" style={{ color: "#ddd" }}>
                  {exportStep}
                </span>
              </div>
            )}

            <div className="row" style={{ marginTop: 10 }}>
              <div>
                <label>Backup</label>
                <div className="row">
                  <button className="secondary" onClick={exportJson} disabled={isExporting}>
                    Project opslaan (JSON)
                  </button>
                  <button className="secondary" onClick={hardReset} disabled={isExporting}>
                    Reset
                  </button>
                </div>

                <div className="small" style={{ marginTop: 6 }}>
                  Project laden (JSON):{" "}
                  <input type="file" accept="application/json" onChange={importJson} disabled={isExporting} />
                </div>
              </div>
            </div>
          </>
        )}

<div className="small">
          <div className="strongDivider" />
        Actieve dag: <strong>{activeDay?.dayNumber ?? "-"}</strong>
          {activeDay?.dayNumber ? <> • <strong>{dayLabel(activeDay.dayNumber)}</strong></> : null}
          {activeDay?.dayNumber ? <> • <button type="button" className="chipBtn" onClick={() => { const n = activeDay?.dayNumber || 1; window.open(`/mobiel/${n}`, "_blank"); }}>Telefoonweergave</button></> : null}
          {routeMeta ? <> • Auto-route: <strong>{routeMeta.km}</strong> • <strong>{routeMeta.dur}</strong></> : null}
          {totalKm ? <> • Totaal auto-km: <strong>{totalKm}</strong></> : null}
        </div>

        {routeErr && <div className="small" style={{ color: "crimson", marginTop: 6 }}>{routeErr}</div>}
        {busyRoute && showAutoRoute && <div className="small" style={{ marginTop: 6 }}>Route ophalen...</div>}

        <div className="divider" />

        <div className="daysList">
          {days.map((d) => {
            const isActive = d.id === activeDayId;
            const breakfast = d.breakfastIncluded ? "ontbijt ✓" : "ontbijt –";
            const extra = (Number(d.extraCostAmount) || 0) > 0 ? `extra €${Number(d.extraCostAmount).toFixed(2)}` : "";
                        const segs = Array.isArray(d.flightSegments) ? d.flightSegments : [];
            const flight = d.transportMode === "vliegtuig" && segs.some(s => (s.flightNumber||s.departTime||s.arriveTime))
              ? ` • ${segs.filter(s=>s.flightNumber||s.departTime||s.arriveTime).map(s => `${s.flightNumber || "vlucht"} ${s.departTime || ""}-${s.arriveTime || ""}`.trim()).join(" / ")}`
              : "";

            const headline = d.transportMode === "geen"
              ? `${d.startText || "Verblijflocatie?"} • geen vervoer`
              : `${d.startText || "Start?"} → ${d.endText || "Eind?"} • ${d.transportMode}${flight}${(d.vias?.length ?? 0) > 0 ? ` • via ${d.vias.length}` : ""}`;

            return (
              <div
                key={d.id}
                className={"dayItem " + (isActive ? "active" : "")}
                onClick={() => handleSelectDay(d.id)}
                style={{ cursor: isExporting ? "not-allowed" : "pointer" }}
              >
                <div className="row" style={{ alignItems: "baseline" }}>
                  <div>
                    <span className="badge">Dag {d.dayNumber}</span>
                    <span className="small">{dayLabel(d.dayNumber)}</span>
                  </div>
                </div>

                <div className="small" style={{ marginTop: 6 }}>
                  {headline}
                </div>

                <div className="small" style={{ marginTop: 6 }}>
                  Hotel: {d.hotelName || "-"}{d.hotelAddress?.trim() ? ` • ${d.hotelAddress}` : ""} {d.hotelCost != null ? `• € ${Number(d.hotelCost).toFixed(2)}` : ""}
                  {" "}• {breakfast}
                  {extra ? ` • ${extra}` : ""}
                  {d.hotelLink?.trim() ? (
                    <>
                      {" "}• <a className="inlineLink" href={d.hotelLink} target="_blank" rel="noreferrer" onClick={(e)=>e.stopPropagation()}>link</a>
                    </>
                  ) : null}
                </div>

                <div className="small" style={{ marginTop: 6 }}>
                  {d.transportMode === "auto"
                    ? (d.route?.distanceMeters ? `${formatKm(d.route.distanceMeters)} • ${formatDuration(d.route.durationSeconds)}` : "Geen route (nog)")
                    : (d.transportMode === "vliegtuig" ? "Rechte lijn (geen km-berekening)" : (d.transportMode === "geen" ? "Geen route nodig" : "Geen lijn nodig"))}
                </div>

                {isActive && (
                  <div className="accordionBody" onClick={(e) => e.stopPropagation()}>
                    <DayEditor
                      day={d}
                      dayDateLabel={dayLabel(d.dayNumber)}
                      onChange={updateDay}
                      onGeocoded={onGeocoded}
                      onGeocodedVia={onGeocodedVia}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className={"dayItem " + (activeDayId === TOTAL_ID ? "active" : "")}
          onClick={() => handleSelectDay(TOTAL_ID)}
          style={{ cursor: isExporting ? "not-allowed" : "pointer" }}
        >
          <div className="row" style={{ alignItems: "baseline" }}>
            <div>
              <span className="badge">Totaalreis</span>
              <span className="small">• alle dagen op één kaart</span>
            </div>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Toont alle auto-routes en vluchtlijnen die zijn ingevoerd.
          </div>
        </div>

        <div className="divider" />

        <div className="small">
          <strong>Totals</strong><br/>
          Totaal auto-kilometers: <strong>{totalKm || "-"}</strong><br/>
          Totaal hotelkosten: <strong>€ {totalHotelCost.toFixed(2)}</strong><br/>
          Totaal extra kosten: <strong>€ {totalExtraCosts.toFixed(2)}</strong><br/>
          Totaal verblijfskosten: <strong>€ {totalLodgingCost.toFixed(2)}</strong><br/>
          Overnachtingen met kosten: <strong>{nightsCount}</strong><br/>
          Gemiddeld hotel per overnachting: <strong>€ {avgHotelPerNight.toFixed(2)}</strong><br/>
          Gemiddeld verblijf per overnachting: <strong>€ {avgLodgingPerNight.toFixed(2)}</strong>
        </div>
      </div>

      <MapView
        activeDay={totalView ? { transportMode: "totaal" } : activeDay}
        startPoint={totalView ? totalStartPoint : activeDay?.startPoint}
        endPoint={totalView ? null : (activeDay?.transportMode === "geen" ? null : activeDay?.endPoint)}
        viaPoints={
          totalView
            ? totalViaPoints
            : (activeDay?.transportMode === "geen"
                ? []
                : (activeDay?.vias ?? []).filter(v=>v.point).map(v=>({ ...v.point, id: v.id, label: v.text })))
        }
        routeLineAuto={totalView ? totalAutoLines : routeLineAuto}
        lineStraight={totalView ? totalStraightLines : straightLine}
        showAutoRoute={totalView ? showTotalAuto : showAutoRoute}
        showStraightLine={totalView ? showTotalStraight : showStraightLine}
      />
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={plannerView} />
      <Route path="/mobiel" element={<MobileItinerary tripName={tripName} startDateISO={startDateISO} days={days} />} />
      <Route path="/mobiel/" element={<MobileItinerary tripName={tripName} startDateISO={startDateISO} days={days} />} />
      <Route path="/mobiel/:dayNumber" element={<MobileItinerary tripName={tripName} startDateISO={startDateISO} days={days} />} />
    </Routes>
  );
}