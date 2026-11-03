/**
 * services/cpcbDataset.service.js
 *
 * Official CPCB (Central Pollution Control Board) Real-Time Ambient Air Quality
 * and Historical Monitoring Dataset Service.
 *
 * Source:
 *  - Open Government Data Platform India (data.gov.in)
 *  - Resource ID: 3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69 (Real-time CAAQMS)
 *  - CPCB Continuous Ambient Air Quality Monitoring Network
 *
 * Principles:
 *  - Pure, explainable ingestion.
 *  - Preserves exact observations and timestamps (26-06-2024 21:00:00).
 *  - Missing values ('NA') are preserved as null / 'N/A' (never zeroed).
 *  - CPCB NAQI sub-index calculation based on official CPCB breakpoints.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const REALTIME_CSV_PATH = path.join(__dirname, '..', 'data', 'cpcb_realtime_aqi.csv');
const HISTORICAL_CSV_PATH = path.join(__dirname, '..', 'data', 'cpcb_historical_daily.csv');

// In-memory cache for parsed datasets
let cachedDataset = null;
let cachedHistorical = null;

function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// CPCB Sub-Index for PM2.5 (24-hour breakpoint)
function calculateCpcbPm25SubIndex(pm25) {
  if (pm25 === null || pm25 === undefined || isNaN(pm25) || pm25 < 0) return null;
  if (pm25 <= 30) return Math.round((50 / 30) * pm25);
  if (pm25 <= 60) return Math.round(50 + ((100 - 50) / (60 - 30)) * (pm25 - 30));
  if (pm25 <= 90) return Math.round(100 + ((200 - 100) / (90 - 60)) * (pm25 - 60));
  if (pm25 <= 120) return Math.round(200 + ((300 - 200) / (120 - 90)) * (pm25 - 90));
  if (pm25 <= 250) return Math.round(300 + ((400 - 300) / (250 - 120)) * (pm25 - 120));
  return Math.min(500, Math.round(400 + ((500 - 400) / (380 - 250)) * (pm25 - 250)));
}

// CPCB Sub-Index for PM10 (24-hour breakpoint)
function calculateCpcbPm10SubIndex(pm10) {
  if (pm10 === null || pm10 === undefined || isNaN(pm10) || pm10 < 0) return null;
  if (pm10 <= 50) return Math.round((50 / 50) * pm10);
  if (pm10 <= 100) return Math.round(50 + ((100 - 50) / (100 - 50)) * (pm10 - 50));
  if (pm10 <= 250) return Math.round(100 + ((200 - 100) / (250 - 100)) * (pm10 - 100));
  if (pm10 <= 350) return Math.round(200 + ((300 - 200) / (350 - 250)) * (pm10 - 250));
  if (pm10 <= 430) return Math.round(300 + ((400 - 300) / (430 - 350)) * (pm10 - 350));
  return Math.min(500, Math.round(400 + ((500 - 400) / (510 - 430)) * (pm10 - 430)));
}

function getAqiCategory(aqi) {
  if (aqi === null || aqi === undefined) return 'Unavailable';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

function getAqiColor(category) {
  switch (category) {
    case 'Good': return '#10b981';
    case 'Satisfactory': return '#84cc16';
    case 'Moderate': return '#eab308';
    case 'Poor': return '#f97316';
    case 'Very Poor': return '#ef4444';
    case 'Severe': return '#7f1d1d';
    default: return '#6b7280';
  }
}

/**
 * Loads and parses the CPCB Real-time dataset from disk.
 */
function getCpcbRealtimeDataset() {
  if (cachedDataset) return cachedDataset;

  if (!fs.existsSync(REALTIME_CSV_PATH)) {
    logger.warn(`CPCB dataset file not found at: ${REALTIME_CSV_PATH}`);
    return null;
  }

  const rawText = fs.readFileSync(REALTIME_CSV_PATH, 'utf8');
  const lines = rawText.trim().split('\n');

  const stationsMap = new Map();
  const statesSet = new Set();
  const citiesSet = new Set();
  const pollutantsSet = new Set();
  const seenCombos = new Set();

  let rawLines = 0;
  let validNumeric = 0;
  let missingValCount = 0;
  let observationTimestamp = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = parseCsvLine(line);
    if (parts.length < 11) continue;
    rawLines++;

    const [country, state, city, station, lastUpdate, latStr, lonStr, rawPollutant, minStr, maxStr, avgStr] = parts;
    const pollutant = rawPollutant.trim();
    if (!observationTimestamp && lastUpdate) observationTimestamp = lastUpdate;

    const comboKey = `${station}|${pollutant}|${lastUpdate}`;
    if (seenCombos.has(comboKey)) continue;
    seenCombos.add(comboKey);

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const min = (minStr === 'NA' || minStr === '' || isNaN(parseFloat(minStr))) ? null : parseFloat(minStr);
    const max = (maxStr === 'NA' || maxStr === '' || isNaN(parseFloat(maxStr))) ? null : parseFloat(maxStr);
    const avg = (avgStr === 'NA' || avgStr === '' || isNaN(parseFloat(avgStr))) ? null : parseFloat(avgStr);

    if (avg !== null) {
      validNumeric++;
    } else {
      missingValCount++;
    }

    statesSet.add(state);
    citiesSet.add(city);
    pollutantsSet.add(pollutant);

    const stationKey = `${state}__${city}__${station}`;
    if (!stationsMap.has(stationKey)) {
      stationsMap.set(stationKey, {
        id: stationKey.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        station,
        city,
        state,
        latitude: lat,
        longitude: lon,
        lastUpdate,
        pollutants: {},
      });
    }

    const st = stationsMap.get(stationKey);
    st.pollutants[pollutant] = { min, max, avg };
  }

  // Calculate station-level AQIs
  const stationsList = [];
  let totalAqiSum = 0;
  let totalAqiCount = 0;

  for (const st of stationsMap.values()) {
    const pm25 = st.pollutants['PM2.5']?.avg ?? null;
    const pm10 = st.pollutants['PM10']?.avg ?? null;
    const subPm25 = calculateCpcbPm25SubIndex(pm25);
    const subPm10 = calculateCpcbPm10SubIndex(pm10);

    let aqi = null;
    let dominant = 'N/A';

    if (subPm25 !== null && subPm10 !== null) {
      if (subPm25 >= subPm10) {
        aqi = subPm25;
        dominant = 'PM2.5';
      } else {
        aqi = subPm10;
        dominant = 'PM10';
      }
    } else if (subPm25 !== null) {
      aqi = subPm25;
      dominant = 'PM2.5';
    } else if (subPm10 !== null) {
      aqi = subPm10;
      dominant = 'PM10';
    }

    st.calculatedAqi = aqi;
    st.aqiCategory = getAqiCategory(aqi);
    st.aqiColor = getAqiColor(st.aqiCategory);
    st.dominantPollutant = dominant;

    if (aqi !== null) {
      totalAqiSum += aqi;
      totalAqiCount++;
    }

    stationsList.push(st);
  }

  // City-wise aggregation
  const cityAgg = {};
  for (const st of stationsList) {
    if (!cityAgg[st.city]) {
      cityAgg[st.city] = {
        city: st.city,
        state: st.state,
        stationCount: 0,
        aqiSum: 0,
        aqiCount: 0,
        pm25Sum: 0,
        pm25Count: 0,
        pm10Sum: 0,
        pm10Count: 0,
        no2Sum: 0,
        no2Count: 0,
        so2Sum: 0,
        so2Count: 0,
        coSum: 0,
        coCount: 0,
        o3Sum: 0,
        o3Count: 0,
      };
    }
    const c = cityAgg[st.city];
    c.stationCount++;
    if (st.calculatedAqi !== null) {
      c.aqiSum += st.calculatedAqi;
      c.aqiCount++;
    }
    const p = st.pollutants;
    if (p['PM2.5']?.avg !== null && p['PM2.5']?.avg !== undefined) { c.pm25Sum += p['PM2.5'].avg; c.pm25Count++; }
    if (p['PM10']?.avg !== null && p['PM10']?.avg !== undefined) { c.pm10Sum += p['PM10'].avg; c.pm10Count++; }
    if (p['NO2']?.avg !== null && p['NO2']?.avg !== undefined) { c.no2Sum += p['NO2'].avg; c.no2Count++; }
    if (p['SO2']?.avg !== null && p['SO2']?.avg !== undefined) { c.so2Sum += p['SO2'].avg; c.so2Count++; }
    if (p['CO']?.avg !== null && p['CO']?.avg !== undefined) { c.coSum += p['CO'].avg; c.coCount++; }
    if (p['OZONE']?.avg !== null && p['OZONE']?.avg !== undefined) { c.o3Sum += p['OZONE'].avg; c.o3Count++; }
  }

  const citiesList = Object.values(cityAgg).map((c) => {
    const avgAqi = c.aqiCount > 0 ? Math.round(c.aqiSum / c.aqiCount) : null;
    const cat = getAqiCategory(avgAqi);
    return {
      city: c.city,
      state: c.state,
      stationCount: c.stationCount,
      avgAqi,
      aqiCategory: cat,
      aqiColor: getAqiColor(cat),
      pm25: c.pm25Count > 0 ? Math.round((c.pm25Sum / c.pm25Count) * 10) / 10 : null,
      pm10: c.pm10Count > 0 ? Math.round((c.pm10Sum / c.pm10Count) * 10) / 10 : null,
      no2: c.no2Count > 0 ? Math.round((c.no2Sum / c.no2Count) * 10) / 10 : null,
      so2: c.so2Count > 0 ? Math.round((c.so2Sum / c.so2Count) * 10) / 10 : null,
      co: c.coCount > 0 ? Math.round((c.coSum / c.coCount) * 10) / 10 : null,
      o3: c.o3Count > 0 ? Math.round((c.o3Sum / c.o3Count) * 10) / 10 : null,
    };
  });

  const sortedCities = [...citiesList].filter((c) => c.avgAqi !== null).sort((a, b) => b.avgAqi - a.avgAqi);
  const sortedStations = [...stationsList].filter((s) => s.calculatedAqi !== null).sort((a, b) => b.calculatedAqi - a.calculatedAqi);

  cachedDataset = {
    metadata: {
      source: 'Central Pollution Control Board (CPCB) - Open Government Data Platform India (data.gov.in)',
      resourceId: '3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69',
      datasetTitle: 'Real-Time Air Quality Index from Various Locations across India',
      observationTimestamp: observationTimestamp || '26-06-2024 21:00:00',
      totalRecords: rawLines,
      validNumericRecords: validNumeric,
      missingValuesCount: missingValCount,
      uniqueStations: stationsList.length,
      uniqueCities: citiesSet.size,
      uniqueStates: statesSet.size,
      nationalAvgAqi: totalAqiCount > 0 ? Math.round(totalAqiSum / totalAqiCount) : null,
      nationalAqiCategory: getAqiCategory(totalAqiCount > 0 ? Math.round(totalAqiSum / totalAqiCount) : null),
    },
    filterOptions: {
      states: Array.from(statesSet).sort(),
      cities: Array.from(citiesSet).sort(),
      pollutants: Array.from(pollutantsSet).sort(),
    },
    topPollutedCities: sortedCities.slice(0, 10),
    cleanestCities: sortedCities.slice(-10).reverse(),
    topPollutedStations: sortedStations.slice(0, 10),
    cleanestStations: sortedStations.slice(-10).reverse(),
    cities: citiesList,
    stations: stationsList,
  };

  return cachedDataset;
}

/**
 * Loads and parses the CPCB Historical multi-year dataset.
 */
function getCpcbHistoricalDataset(limitDays = 90) {
  if (cachedHistorical) {
    return limitDays ? cachedHistorical.slice(-limitDays) : cachedHistorical;
  }

  if (!fs.existsSync(HISTORICAL_CSV_PATH)) {
    return [];
  }

  const rawText = fs.readFileSync(HISTORICAL_CSV_PATH, 'utf8');
  const lines = rawText.trim().split('\n');
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [date, pm25Str, o3Str, no2Str] = line.split(',');
    if (!date) continue;

    const pm25 = parseFloat(pm25Str);
    const o3 = parseFloat(o3Str);
    const no2 = parseFloat(no2Str);

    results.push({
      date,
      pm25: !isNaN(pm25) ? Math.round(pm25 * 10) / 10 : null,
      o3: !isNaN(o3) ? Math.round(o3 * 10) / 10 : null,
      no2: !isNaN(no2) ? Math.round(no2 * 10) / 10 : null,
      aqiEstimate: !isNaN(pm25) ? calculateCpcbPm25SubIndex(pm25) : null,
    });
  }

  // Reverse so chronological (oldest to newest)
  results.reverse();
  cachedHistorical = results;
  return limitDays ? cachedHistorical.slice(-limitDays) : cachedHistorical;
}

module.exports = {
  getCpcbRealtimeDataset,
  getCpcbHistoricalDataset,
  calculateCpcbPm25SubIndex,
  calculateCpcbPm10SubIndex,
  getAqiCategory,
  getAqiColor,
};
