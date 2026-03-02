export async function fetchRouteOSRM(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Route ophalen mislukt");

  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) return null;

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geojson: route.geometry
  };
}

export function formatKm(meters) {
  if (meters == null) return "";
  const km = meters / 1000;
  return `${km.toFixed(km >= 100 ? 0 : 1)} km`;
}

export function formatDuration(seconds) {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h}u ${m}m`;
}
