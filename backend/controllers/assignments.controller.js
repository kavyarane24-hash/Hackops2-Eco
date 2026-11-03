/**
 * controllers/assignments.controller.js
 *
 * Core Assignments Controller for Incident Task Allocation.
 * Directly queries and mutates the Supabase assignments table.
 * Returns honest database errors (no mock fallbacks).
 */

'use strict';

const logger = require('../utils/logger');
const { getScopedClient, supabase: defaultSupabase } = require('../config/supabase');

const ALLOWED_ASSIGNMENT_STATUSES = new Set(['assigned', 'acknowledged', 'completed', 'overdue']);

/**
 * POST /api/assignments
 * Allocates an incident in Supabase to a Field Officer and Stakeholder.
 */
async function createAssignment(req, res, next) {
  try {
    const { incident_id, stakeholder_id, officer_id, deadline, notes, status = 'assigned' } = req.body;

    if (!incident_id) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "incident_id" is required.',
      });
    }

    const cleanStatus = status.toLowerCase().trim();
    if (!ALLOWED_ASSIGNMENT_STATUSES.has(cleanStatus)) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: "status" must be one of: ${Array.from(ALLOWED_ASSIGNMENT_STATUSES).join(', ')}.`,
      });
    }

    let deadlineIso = null;
    if (deadline) {
      const parsedDate = new Date(deadline);
      if (!Number.isNaN(parsedDate.getTime())) {
        deadlineIso = parsedDate.toISOString();
      }
    } else {
      deadlineIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    const assignmentPayload = {
      incident_id,
      stakeholder_id: stakeholder_id || null,
      officer_id: officer_id || null,
      deadline: deadlineIso,
      notes: notes ? notes.trim() : null,
      status: cleanStatus,
    };

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('assignments')
      .insert(assignmentPayload)
      .select()
      .single();

    if (error) {
      logger.error(`Database error creating assignment: ${error.message} (code: ${error.code})`);
      const statusCode = error.code === '42501' ? 403 : 500;
      return res.status(statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    logger.info(`Assignment created in Supabase with ID ${data.id}`);

    // Update the incident status to 'assigned'
    await supabase
      .from('incidents')
      .update({ status: 'assigned' })
      .eq('id', incident_id)
      .eq('status', 'new');

    return res.status(201).json({
      success: true,
      message: 'Assignment created successfully.',
      data,
    });
  } catch (err) {
    logger.error(`Error in createAssignment: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/assignments
 * Retrieves assignments directly from Supabase.
 */
async function listAssignments(req, res, next) {
  try {
    const { officer_id, stakeholder_id, incident_id, status, limit = 50 } = req.query;
    const supabase = getScopedClient(req) || defaultSupabase;

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    let query = supabase
      .from('assignments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10) || 50);

    if (officer_id) query = query.eq('officer_id', officer_id);
    if (stakeholder_id) query = query.eq('stakeholder_id', stakeholder_id);
    if (incident_id) query = query.eq('incident_id', incident_id);
    if (status) query = query.eq('status', status.toLowerCase().trim());

    const { data, error } = await query;
    if (error) {
      logger.error(`Database error fetching assignments: ${error.message}`);
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
    logger.error(`Error in listAssignments: ${err.message}`);
    next(err);
  }
}

/**
 * PATCH /api/assignments/:id/status
 * Updates assignment status in Supabase.
 */
async function updateAssignmentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !status.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "status" is required in request body.',
      });
    }

    const cleanStatus = status.toLowerCase().trim();
    if (!ALLOWED_ASSIGNMENT_STATUSES.has(cleanStatus)) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: "status" must be one of: ${Array.from(ALLOWED_ASSIGNMENT_STATUSES).join(', ')}.`,
      });
    }

    const updatePayload = {
      status: cleanStatus,
      updated_at: new Date().toISOString(),
    };
    if (notes) updatePayload.notes = notes.trim();

    const supabase = getScopedClient(req) || defaultSupabase;
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database service unavailable.',
      });
    }

    const { data, error } = await supabase
      .from('assignments')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error(`Database error updating assignment: ${error.message}`);
      return res.status(error.code === '42501' ? 403 : 500).json({
        success: false,
        error: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `Assignment not found with ID: ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Assignment status updated to "${cleanStatus}".`,
      data,
    });
  } catch (err) {
    logger.error(`Error in updateAssignmentStatus: ${err.message}`);
    next(err);
  }
}

module.exports = {
  createAssignment,
  listAssignments,
  updateAssignmentStatus,
};
