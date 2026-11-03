/**
 * controllers/incidents.controller.js
 *
 * Core Incidents Controller for Admin Triage and Status Lifecycle.
 * Directly queries and mutates the Supabase incidents table.
 * Returns honest database errors (no mock fallbacks).
 */

'use strict';

const logger = require('../utils/logger');
const { getScopedClient, supabase: defaultSupabase } = require('../config/supabase');

const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_STATUSES = new Set(['new', 'assigned', 'investigating', 'action_taken', 'resolved', 'closed']);

/**
 * POST /api/incidents
 * Creates a new incident in Supabase and links it to a complaint.
 */
async function createIncident(req, res, next) {
  try {
    const {
      title,
      severity = 'medium',
      complaint_id,
      assessment,
      source_hypotheses,
      latitude,
      longitude,
      cpcb_comparison,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "title" is required.',
      });
    }

    const cleanSeverity = severity.toLowerCase().trim();
    if (!ALLOWED_SEVERITIES.has(cleanSeverity)) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: "severity" must be one of: ${Array.from(ALLOWED_SEVERITIES).join(', ')}.`,
      });
    }

    const lat = latitude !== undefined && latitude !== null ? parseFloat(latitude) : null;
    const lng = longitude !== undefined && longitude !== null ? parseFloat(longitude) : null;

    const incidentPayload = {
      title: title.trim(),
      severity: cleanSeverity,
      complaint_id: complaint_id || null,
      status: 'new',
      assessment: assessment ? assessment.trim() : null,
      source_hypotheses: Array.isArray(source_hypotheses) ? source_hypotheses : [],
      latitude: Number.isNaN(lat) ? null : lat,
      longitude: Number.isNaN(lng) ? null : lng,
      cpcb_comparison: cpcb_comparison && typeof cpcb_comparison === 'object' ? cpcb_comparison : {},
    };

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('incidents')
      .insert(incidentPayload)
      .select()
      .single();

    if (error) {
      logger.error(`Database error creating incident: ${error.message} (code: ${error.code})`);
      const statusCode = error.code === '42501' ? 403 : 500;
      return res.status(statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    logger.info(`Incident created in Supabase with ID: ${data.id}`);

    // If linked to a complaint, advance complaint status to 'converted_to_incident'
    if (complaint_id) {
      await supabase
        .from('complaints')
        .update({ status: 'converted_to_incident' })
        .eq('id', complaint_id);
    }

    return res.status(201).json({
      success: true,
      message: 'Incident created successfully.',
      data,
    });
  } catch (err) {
    logger.error(`Error in createIncident: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/incidents
 * Retrieves incidents directly from Supabase for Admin Overview and GIS Map.
 */
async function listIncidents(req, res, next) {
  try {
    const { status, severity, limit = 50 } = req.query;
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    let query = supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10) || 50);

    if (status) query = query.eq('status', status.toLowerCase().trim());
    if (severity) query = query.eq('severity', severity.toLowerCase().trim());

    const { data, error } = await query;
    if (error) {
      logger.error(`Database error fetching incidents: ${error.message}`);
      return res.status(error.code === '42501' ? 403 : 500).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      count: data ? data.length : 0,
      data: data || [],
    });
  } catch (err) {
    logger.error(`Error in listIncidents: ${err.message}`);
    next(err);
  }
}

/**
 * PATCH /api/incidents/:id/status
 * Updates incident lifecycle status in Supabase.
 */
async function updateIncidentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !status.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "status" is required in request body.',
      });
    }

    const cleanStatus = status.toLowerCase().trim();
    if (!ALLOWED_STATUSES.has(cleanStatus)) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: "status" must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
      });
    }

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({ status: cleanStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error(`Database error updating incident status: ${error.message}`);
      return res.status(error.code === '42501' ? 403 : 500).json({
        success: false,
        error: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `Incident not found with ID: ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Incident status updated to "${cleanStatus}".`,
      data,
    });
  } catch (err) {
    logger.error(`Error in updateIncidentStatus: ${err.message}`);
    next(err);
  }
}

module.exports = {
  createIncident,
  listIncidents,
  updateIncidentStatus,
};
