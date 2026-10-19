// Feste Koordinaten [lon, lat] für Orte, die in Leons Bewerbungen vorkommen können.
const CITIES = {
  leer: [7.45, 53.23],
  emden: [7.21, 53.37],
  bremen: [8.8, 53.08],
  bremerhaven: [8.58, 53.55],
  oldenburg: [8.21, 53.14],
  aurich: [7.48, 53.47],
  papenburg: [7.4, 53.08],
  wilhelmshaven: [8.12, 53.52],
  hamburg: [9.99, 53.55],
  moormerland: [7.43, 53.3],
  norden: [7.21, 53.6],
  oviedo: [-5.85, 43.36],
};

export function coordsFor(app = {}) {
  if (Number.isFinite(app.lat) && Number.isFinite(app.lon)) return [app.lon, app.lat];
  const key = String(app.city || '').toLowerCase().trim().split(/[\s(,/]/)[0];
  return CITIES[key] || null;
}
