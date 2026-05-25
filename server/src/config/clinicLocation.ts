// Clinic geolocation reference. Used by the login-audit feature to compute
// distance from the clinic on every login attempt and flag off-site sessions.
//
// Defaults are the Medics Clinic on Mahama Road, Accra (captured 2026-05-25
// from inside the conference room). Override via env vars for other sites.

export const CLINIC_LATITUDE = parseFloat(process.env.CLINIC_LATITUDE || '5.60551');
export const CLINIC_LONGITUDE = parseFloat(process.env.CLINIC_LONGITUDE || '-0.13912');

// Anything beyond this radius is considered "off-site" for audit purposes.
// 500m is enough to absorb GPS noise and the clinic footprint itself.
export const CLINIC_RADIUS_M = parseInt(process.env.CLINIC_RADIUS_M || '500', 10);

// Haversine great-circle distance in metres between two lat/lon pairs.
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
