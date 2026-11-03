/**
 * routes/cpcb.routes.js
 *
 * CPCB Ambient Air Quality & CAAQMS Dataset Endpoints.
 * Serves verified real-time and historical air quality records from India's Open Government Data platform.
 *
 * Mounted at: /api/cpcb (see server.js)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getCpcbRealtimeDataset, getCpcbHistoricalDataset } = require('../services/cpcbDataset.service');

// Health Check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'CPCB CAAQMS Environmental Dataset',
    status: 'operational',
    source: 'Central Pollution Control Board (data.gov.in)',
  });
});

// Overview & National Statistics
router.get('/overview', (req, res) => {
  try {
    const dataset = getCpcbRealtimeDataset();
    if (!dataset) {
      return res.status(503).json({
        success: false,
        error: 'CPCB dataset is temporarily unavailable on server.',
      });
    }

    return res.status(200).json({
      success: true,
      metadata: dataset.metadata,
      filterOptions: dataset.filterOptions,
      topPollutedCities: dataset.topPollutedCities,
      cleanestCities: dataset.cleanestCities,
      topPollutedStations: dataset.topPollutedStations,
      cleanestStations: dataset.cleanestStations,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve CPCB overview.',
    });
  }
});

// Station List with filtering
router.get('/stations', (req, res) => {
  try {
    const dataset = getCpcbRealtimeDataset();
    if (!dataset) {
      return res.status(503).json({
        success: false,
        error: 'CPCB dataset is temporarily unavailable on server.',
      });
    }

    const { state, city, pollutant, minAqi, maxAqi } = req.query;
    let stations = dataset.stations;

    if (state) {
      stations = stations.filter((s) => s.state.toLowerCase() === state.toLowerCase());
    }
    if (city) {
      stations = stations.filter((s) => s.city.toLowerCase() === city.toLowerCase());
    }
    if (pollutant) {
      const pKey = pollutant.toUpperCase();
      stations = stations.filter((s) => s.pollutants[pKey] && s.pollutants[pKey].avg !== null);
    }
    if (minAqi) {
      stations = stations.filter((s) => s.calculatedAqi !== null && s.calculatedAqi >= parseFloat(minAqi));
    }
    if (maxAqi) {
      stations = stations.filter((s) => s.calculatedAqi !== null && s.calculatedAqi <= parseFloat(maxAqi));
    }

    return res.status(200).json({
      success: true,
      count: stations.length,
      stations,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve CPCB stations.',
    });
  }
});

// Cities with average values
router.get('/cities', (req, res) => {
  try {
    const dataset = getCpcbRealtimeDataset();
    if (!dataset) {
      return res.status(503).json({
        success: false,
        error: 'CPCB dataset is temporarily unavailable on server.',
      });
    }
    const { state } = req.query;
    let cities = dataset.cities;
    if (state) {
      cities = cities.filter((c) => c.state.toLowerCase() === state.toLowerCase());
    }
    return res.status(200).json({
      success: true,
      count: cities.length,
      cities,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve CPCB cities.',
    });
  }
});

// Multi-Year Daily Historical Timeseries
router.get('/history', (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 90;
    const history = getCpcbHistoricalDataset(days);
    return res.status(200).json({
      success: true,
      source: 'Central Pollution Control Board (CPCB) Multi-Year Ambient Air Archive',
      count: history.length,
      timelineDays: days,
      history,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve CPCB historical records.',
    });
  }
});

module.exports = router;
