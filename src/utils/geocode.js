export async function geocodeCandidates(query, { limit = 5 } = {}) {
  const q = query?.trim();
  if (!q) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Geocoding mislukt");

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  const mapped = data.map((x) => ({
    lat: Number(x.lat),
    lng: Number(x.lon),
    displayName: x.display_name,
    // a bit of structure to help humans pick
    country: x.address?.country,
    state: x.address?.state,
    city: x.address?.city || x.address?.town || x.address?.village,
    type: x.type
  }));
  return mapped.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

