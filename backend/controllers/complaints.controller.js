/**
 * controllers/complaints.controller.js
 *
 * Core Complaints Controller for Citizen Reporting and Public Tracking.
 * Persists all records directly to the Supabase complaints table.
 * Returns honest errors upon database failure (no mock fallbacks).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getScopedClient, supabase: defaultSupabase } = require('../config/supabase');

/**
 * Generates a unique tracking ID in the format ECO-2026-XXXX
 */
function generateTrackingId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    const randIndex = crypto.randomInt(0, chars.length);
    code += chars[randIndex];
  }
  return `ECO-2026-${code}`;
}

/**
 * POST /api/complaints
 * Submits a new citizen complaint with optional media attachments.
 * Directly inserts into the Supabase complaints table.
 */
async function submitComplaint(req, res, next) {
  try {
    const { category, description, language, latitude, longitude, address } = req.body;

    if (!category || !category.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "category" is required.',
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "description" is required.',
      });
    }

    const mediaUrls = [];
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file) => {
        mediaUrls.push(`/api/complaints/media/${file.filename}`);
      });
    }

    const trackingId = generateTrackingId();
    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;

    const complaintPayload = {
      tracking_id: trackingId,
      category: category.trim(),
      description: description.trim(),
      language: (language || 'en').trim(),
      latitude: Number.isNaN(lat) ? null : lat,
      longitude: Number.isNaN(lng) ? null : lng,
      address: address ? address.trim() : null,
      media_urls: mediaUrls,
      status: 'submitted',
    };

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable: Supabase client is not configured.',
      });
    }

    // Direct database write
    const { error } = await supabase
      .from('complaints')
      .insert(complaintPayload);

    if (error) {
      logger.error(`Database error inserting complaint: ${error.message} (code: ${error.code})`);
      const statusCode = error.code === '42501' ? 403 : 500;
      return res.status(statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        hint: error.hint || 'Check table-level grants in Supabase.',
      });
    }

    logger.info(`Complaint successfully persisted in Supabase with tracking ID ${trackingId}`);

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      tracking_id: trackingId,
      data: {
        ...complaintPayload,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error(`Error in submitComplaint: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/complaints/:trackingId
 * Safe citizen complaint tracking via database RPC.
 */
async function getComplaintByTrackingId(req, res, next) {
  try {
    const { trackingId } = req.params;

    if (!trackingId || !trackingId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Tracking ID is required.',
      });
    }

    const cleanId = trackingId.trim();
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase.rpc('track_complaint', {
      p_tracking_id: cleanId,
    });

    if (error) {
      logger.error(`Error tracking complaint: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No complaint found matching tracking ID: ${cleanId}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: data[0],
    });
  } catch (err) {
    logger.error(`Error in getComplaintByTrackingId: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/complaints
 * Lists complaints for authorized staff/admin users ONLY.
 * Requires genuine Supabase JWT.
 */
async function listComplaints(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required. Staff token must be provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    // Verify token with Supabase Auth
    const { data: authData, error: authError } = await defaultSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or expired authentication token.',
      });
    }

    // Verify staff role
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !userProfile || userProfile.role === 'citizen') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Access to staff complaints is restricted.',
      });
    }

    const { status, category, limit = 50 } = req.query;

    let query = supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10) || 50);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) {
      logger.error(`Database error fetching complaints: ${error.message}`);
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
    logger.error(`Error in listComplaints: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/complaints/media/:filename
 * Securely streams an uploaded complaint image from private disk storage
 */
function serveComplaintMedia(req, res) {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(__dirname, '..', 'uploads', 'images', safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'Media file not found.',
    });
  }

  return res.sendFile(filePath);
}

module.exports = {
  submitComplaint,
  getComplaintByTrackingId,
  listComplaints,
  serveComplaintMedia,
};
