/**
 * controllers/fieldUpdates.controller.js
 *
 * Core Field Updates Controller for On-Site Inspection Evidence.
 * Directly queries and mutates the Supabase field_updates table.
 * Returns honest database errors (no mock fallbacks).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { getScopedClient, supabase: defaultSupabase } = require('../config/supabase');

const ALLOWED_INCIDENT_STATUS_UPDATES = new Set(['investigating', 'action_taken', 'resolved', 'closed']);

/**
 * POST /api/field-updates
 * Inserts inspection findings and updates incident status directly in Supabase.
 */
async function submitFieldUpdate(req, res, next) {
  try {
    const { incident_id, officer_id, inspection_notes, action_taken, status_update = 'action_taken' } = req.body;

    if (!incident_id) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "incident_id" is required.',
      });
    }

    if (!inspection_notes || !inspection_notes.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "inspection_notes" is required.',
      });
    }

    const cleanStatusUpdate = status_update.toLowerCase().trim();
    if (!ALLOWED_INCIDENT_STATUS_UPDATES.has(cleanStatusUpdate)) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: "status_update" must be one of: ${Array.from(ALLOWED_INCIDENT_STATUS_UPDATES).join(', ')}.`,
      });
    }

    const mediaUrls = [];
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file) => {
        mediaUrls.push(`/api/field-updates/media/${file.filename}`);
      });
    }

    const updatePayload = {
      incident_id,
      officer_id: officer_id || null,
      inspection_notes: inspection_notes.trim(),
      action_taken: action_taken ? action_taken.trim() : null,
      media_urls: mediaUrls,
      status_update: cleanStatusUpdate,
    };

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('field_updates')
      .insert(updatePayload)
      .select()
      .single();

    if (error) {
      logger.error(`Database error submitting field update: ${error.message} (code: ${error.code})`);
      const statusCode = error.code === '42501' ? 403 : 500;
      return res.status(statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    logger.info(`Field update registered in Supabase for incident ${incident_id}`);

    // Update incident status in Supabase
    await supabase
      .from('incidents')
      .update({ status: cleanStatusUpdate, updated_at: new Date().toISOString() })
      .eq('id', incident_id);

    // Update assignment status to completed
    let assignQuery = supabase
      .from('assignments')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('incident_id', incident_id);

    if (officer_id) {
      assignQuery = assignQuery.eq('officer_id', officer_id);
    }
    await assignQuery;

    return res.status(201).json({
      success: true,
      message: 'Field inspection update submitted successfully.',
      incident_status: cleanStatusUpdate,
      data,
    });
  } catch (err) {
    logger.error(`Error in submitFieldUpdate: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/field-updates
 * Retrieves field updates directly from Supabase.
 */
async function listFieldUpdates(req, res, next) {
  try {
    const { incident_id, officer_id, limit = 50 } = req.query;
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    let query = supabase
      .from('field_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10) || 50);

    if (incident_id) query = query.eq('incident_id', incident_id);
    if (officer_id) query = query.eq('officer_id', officer_id);

    const { data, error } = await query;
    if (error) {
      logger.error(`Database error fetching field updates: ${error.message}`);
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
    logger.error(`Error in listFieldUpdates: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/field-updates/media/:filename
 * Securely streams an on-site proof photo from private disk storage
 */
function serveEvidenceMedia(req, res) {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(__dirname, '..', 'uploads', 'images', safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'Evidence media file not found.',
    });
  }

  return res.sendFile(filePath);
}

module.exports = {
  submitFieldUpdate,
  listFieldUpdates,
  serveEvidenceMedia,
};
