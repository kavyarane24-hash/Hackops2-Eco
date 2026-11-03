/**
 * utils/geoUtils.js
 *
 * Pure mathematical functions for spherical geodesy, bounding boxes,
 * and meteorological wind-bearing correlation.
 *
 * Implements:
 *  - Great-circle Haversine distance formula (mean Earth radius R = 6371.0 km)
 *  - Forward initial bearing calculation (0° to 359.999°)
 *  - Circular angular difference accounting for 0°/360° wrap
 *  - Meteorological upwind classification (wind direction = origin of air)
 *  - Bounding box generation with antimeridian splitting and polar safety
 */

'use strict';

const EARTH_RADIUS_KM = 6371.0;
const KM_PER_DEG_LAT = 111.32;

/**
 * Converts degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180.0;
}

/**
 * Converts radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
function toDegrees(rad) {
  return (rad * 180.0) / Math.PI;
}

/**
 * Normalizes an angle into the range [0, 360).
 * @param {number} deg
 * @returns {number}
 */
function normalizeAngle(deg) {
  const mod = deg % 360.0;
  return mod < 0 ? mod + 360.0 : mod;
}

/**
 * Computes great-circle distance between two points using the Haversine formula.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2.0) * Math.sin(deltaPhi / 2.0) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) * Math.sin(deltaLambda / 2.0);

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Computes initial forward bearing from (lat1, lon1) towards (lat2, lon2).
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Initial azimuth bearing in degrees [0, 360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return normalizeAngle(toDegrees(theta));
}

/**
 * Computes the minimal circular angular difference between two bearings.
 * Accounts seamlessly for the 0°/360° boundary.
 *
 * @param {number} angle1 - Degrees [0, 360)
 * @param {number} angle2 - Degrees [0, 360)
 * @returns {number} Absolute difference in degrees [0, 180]
 */
function angularDifference(angle1, angle2) {
  const a1 = normalizeAngle(angle1);
  const a2 = normalizeAngle(angle2);
  const diff = Math.abs(a1 - a2);
  return diff > 180.0 ? 360.0 - diff : diff;
}

/**
 * Determines whether a hotspot is located in the upwind sector relative to a target location.
 *
 * Meteorological convention:
 *  - windOriginDeg is the direction FROM which the wind arrives (e.g. 310° = Northwest).
 *  - Bearing is the angle from target towards the hotspot.
 *  - If the hotspot lies in the sector from which the wind blows, smoke/particulate
 *    matter can be transported downwind toward the target location.
 *
 * @param {number} targetLat
 * @param {number} targetLon
 * @param {number} hotspotLat
 * @param {number} hotspotLon
 * @param {number} windOriginDeg - Meteorological wind origin [0, 360)
 * @param {number} [thresholdDeg=30] - Sector tolerance (e.g. 30° corridor)
 * @returns {{ isUpwind: boolean, bearing: number, angularDiff: number }}
 */
function checkUpwindCorrelation(targetLat, targetLon, hotspotLat, hotspotLon, windOriginDeg, thresholdDeg = 30) {
  if (typeof windOriginDeg !== 'number' || Number.isNaN(windOriginDeg)) {
    return { isUpwind: false, bearing: null, angularDiff: null };
  }

  const bearing = calculateBearing(targetLat, targetLon, hotspotLat, hotspotLon);
  const diff = angularDifference(bearing, windOriginDeg);
  const isUpwind = diff <= thresholdDeg;

  return {
    isUpwind,
    bearing: parseFloat(bearing.toFixed(1)),
    angularDiff: parseFloat(diff.toFixed(1)),
  };
}

/**
 * Calculates geographic bounding box(es) covering a given radius in kilometers.
 * Handles:
 *  - Latitude clamping to [-90, 90]
 *  - Extreme polar latitudes (safely expands longitude across entire circle if near pole)
 *  - Antimeridian splitting: If the bounding box crosses ±180° longitude, splits into
 *    two non-wrapping bounding boxes suitable for standard API queries.
 *
 * @param {number} lat - Center latitude [-90, 90]
 * @param {number} lon - Center longitude [-180, 180]
 * @param {number} radiusKm - Radius in kilometers (> 0)
 * @returns {Array<{ minLon: number, minLat: number, maxLon: number, maxLat: number, bboxString: string }>}
 */
function calculateBoundingBoxes(lat, lon, radiusKm) {
  if (typeof lat !== 'number' || lat < -90 || lat > 90) {
    throw new Error(`Invalid latitude: ${lat}. Must be between -90 and 90.`);
  }
  if (typeof lon !== 'number' || lon < -180 || lon > 180) {
    throw new Error(`Invalid longitude: ${lon}. Must be between -180 and 180.`);
  }
  if (typeof radiusKm !== 'number' || radiusKm <= 0) {
    throw new Error(`Invalid radiusKm: ${radiusKm}. Must be greater than 0.`);
  }

  const deltaLat = radiusKm / KM_PER_DEG_LAT;
  const minLat = Math.max(-90.0, lat - deltaLat);
  const maxLat = Math.min(90.0, lat + deltaLat);

  // Near poles (above 88° latitude), meridians converge; query full longitudinal width
  if (Math.abs(lat) >= 88.0) {
    return [
      {
        minLon: -180.0,
        minLat: parseFloat(minLat.toFixed(4)),
        maxLon: 180.0,
        maxLat: parseFloat(maxLat.toFixed(4)),
        bboxString: `-180,${minLat.toFixed(4)},180,${maxLat.toFixed(4)}`,
      },
    ];
  }

  // Calculate longitudinal delta using cosine of the maximum absolute latitude
  const maxAbsLat = Math.max(Math.abs(minLat), Math.abs(maxLat));
  const cosLat = Math.cos(toRadians(maxAbsLat));
  const deltaLon = cosLat > 0.001 ? radiusKm / (KM_PER_DEG_LAT * cosLat) : 180.0;

  const rawMinLon = lon - deltaLon;
  const rawMaxLon = lon + deltaLon;

  // Case 1: Crosses antimeridian to the west (rawMinLon < -180)
  if (rawMinLon < -180.0) {
    const wrappedMin = rawMinLon + 360.0;
    return [
      {
        minLon: parseFloat(wrappedMin.toFixed(4)),
        minLat: parseFloat(minLat.toFixed(4)),
        maxLon: 180.0,
        maxLat: parseFloat(maxLat.toFixed(4)),
        bboxString: `${wrappedMin.toFixed(4)},${minLat.toFixed(4)},180,${maxLat.toFixed(4)}`,
      },
      {
        minLon: -180.0,
        minLat: parseFloat(minLat.toFixed(4)),
        maxLon: parseFloat(rawMaxLon.toFixed(4)),
        maxLat: parseFloat(maxLat.toFixed(4)),
        bboxString: `-180,${minLat.toFixed(4)},${rawMaxLon.toFixed(4)},${maxLat.toFixed(4)}`,
      },
    ];
  }

  // Case 2: Crosses antimeridian to the east (rawMaxLon > 180)
  if (rawMaxLon > 180.0) {
    const wrappedMax = rawMaxLon - 360.0;
    return [
      {
        minLon: parseFloat(rawMinLon.toFixed(4)),
        minLat: parseFloat(minLat.toFixed(4)),
        maxLon: 180.0,
        maxLat: parseFloat(maxLat.toFixed(4)),
        bboxString: `${rawMinLon.toFixed(4)},${minLat.toFixed(4)},180,${maxLat.toFixed(4)}`,
      },
      {
        minLon: -180.0,
        minLat: parseFloat(minLat.toFixed(4)),
        maxLon: parseFloat(wrappedMax.toFixed(4)),
        maxLat: parseFloat(maxLat.toFixed(4)),
        bboxString: `-180,${minLat.toFixed(4)},${wrappedMax.toFixed(4)},${maxLat.toFixed(4)}`,
      },
    ];
  }

  // Case 3: Standard single bounding box
  return [
    {
      minLon: parseFloat(rawMinLon.toFixed(4)),
      minLat: parseFloat(minLat.toFixed(4)),
      maxLon: parseFloat(rawMaxLon.toFixed(4)),
      maxLat: parseFloat(maxLat.toFixed(4)),
      bboxString: `${rawMinLon.toFixed(4)},${minLat.toFixed(4)},${rawMaxLon.toFixed(4)},${maxLat.toFixed(4)}`,
    },
  ];
}

module.exports = {
  haversineDistance,
  calculateBearing,
  angularDifference,
  checkUpwindCorrelation,
  calculateBoundingBoxes,
  normalizeAngle,
};
