import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

export default function MapView({
  activeDay,
  startPoint,
  endPoint,
  viaPoints,
  routeLineAuto,
  lineStraight,
  showAutoRoute,
  showStraightLine
}) {
  const mapRef = useRef(null);

  function pushPoint(arr, p) {
    if (!p) return;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    arr.push([lat, lng]);
  }


  const center = useMemo(() => {
    if (startPoint) return [startPoint.lat, startPoint.lng];
    if (endPoint) return [endPoint.lat, endPoint.lng];
    return [52.1326, 5.2913];
  }, [startPoint, endPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const points = [];
    pushPoint(points, startPoint);
    (viaPoints ?? []).forEach(v => points.push([v.lat, v.lng]));
    pushPoint(points, endPoint);

    if (showAutoRoute && routeLineAuto?.length) points.push(...routeLineAuto);
    if (showStraightLine && lineStraight?.length) points.push(...lineStraight);

    const doFit = () => {
      if (points.length >= 2) {
      const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
      map.fitBounds(bounds.pad(0.2));
    } else if (points.length === 1) {
        map.setView(points[0], 10);
      }
    };

    // Wait a tick so polylines/markers are painted before fitting.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(doFit, 40));
    } else {
      setTimeout(doFit, 40);
    }
  }, [activeDay, startPoint, endPoint, viaPoints, routeLineAuto, lineStraight, showAutoRoute, showStraightLine]);

  // Expose a helper for export so we can fit the map to the current day's geometry
  useEffect(() => {
    window.__vp_fitToActive = () => {
      const map = mapRef.current;
      if (!map) return Promise.resolve();
      map.invalidateSize();

      const pts = [];
      pushPoint(pts, startPoint);
      (viaPoints ?? []).forEach(v => pushPoint(pts, v));
      pushPoint(pts, endPoint);

      if (showAutoRoute && routeLineAuto?.length) {
        if (Array.isArray(routeLineAuto?.[0]?.[0])) {
          routeLineAuto.forEach(ln => { if (Array.isArray(ln)) pts.push(...ln); });
        } else {
          pts.push(...routeLineAuto);
        }
      }
      if (showStraightLine && lineStraight?.length) {
        if (Array.isArray(lineStraight?.[0]?.[0])) {
          lineStraight.forEach(ln => { if (Array.isArray(ln)) pts.push(...ln); });
        } else {
          pts.push(...lineStraight);
        }
      }

      if (pts.length === 0) return Promise.resolve();

      return new Promise((resolve) => {
        const done = () => { map.off("moveend", done); resolve(); };
        map.on("moveend", done);

        if (pts.length >= 2) {
          const bounds = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
          map.fitBounds(bounds.pad(0.2));
        } else {
          map.setView(pts[0], 11);
        }
        setTimeout(() => { try { map.off("moveend", done); } catch {} resolve(); }, 800);
      });
    };

  
  const autoIsMulti = Array.isArray(routeLineAuto?.[0]?.[0]);
  const straightIsMulti = Array.isArray(lineStraight?.[0]?.[0]);
  return () => { try { delete window.__vp_fitToActive; } catch {} };
  }, [startPoint, endPoint, viaPoints, routeLineAuto, lineStraight, showAutoRoute, showStraightLine]);


  const autoIsMulti = Array.isArray(routeLineAuto?.[0]?.[0]);
  const straightIsMulti = Array.isArray(lineStraight?.[0]?.[0]);
  return (
    <div className="card mapCard">
      <div className="header">
        <h1>Kaart</h1>
        <div className="small">OpenStreetMap basislaag.</div>
      </div>

      <div className="mapWrap" id="mapCapture">
        <MapContainer
          center={center}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => { mapRef.current = map; window.__vp_map = map; }}
        >
          <TileLayer attribution='&copy; OpenStreetMap bijdragers' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" crossOrigin="anonymous" />

          {startPoint && (
            <Marker position={[startPoint.lat, startPoint.lng]}>
              <Popup>
                <strong>{activeDay?.transportMode === "geen" ? "Verblijf" : "Start"}</strong>
                <div className="small">{activeDay?.startText}</div>
              </Popup>
            </Marker>
          )}

          {(viaPoints ?? []).map((p, idx) => (
            <Marker key={p.id ?? `${p.lat},${p.lng},${idx}`} position={[p.lat, p.lng]}>
              <Popup><strong>Via {idx + 1}</strong><div className="small">{p.label ?? ""}</div></Popup>
            </Marker>
          ))}

          {endPoint && (
            <Marker position={[endPoint.lat, endPoint.lng]}>
              <Popup><strong>Eind</strong><div className="small">{activeDay?.endText}</div></Popup>
            </Marker>
          )}

          {showAutoRoute && routeLineAuto?.length > 0 && (autoIsMulti ? routeLineAuto.map((ln, i) => (<Polyline key={`a-${i}`} positions={ln} pathOptions={{ weight: 6 }} />)) : (routeLineAuto?.length > 1 ? <Polyline positions={routeLineAuto} pathOptions={{ weight: 6 }} /> : null))}
          {showStraightLine && lineStraight?.length > 0 && (straightIsMulti ? lineStraight.map((ln, i) => (<Polyline key={`s-${i}`} positions={ln} pathOptions={{ weight: 4, dashArray: "6 6" }} />)) : (lineStraight?.length > 1 ? <Polyline positions={lineStraight} pathOptions={{ weight: 4, dashArray: "6 6" }} /> : null))}
        </MapContainer>
      </div>
    </div>
  );
}
