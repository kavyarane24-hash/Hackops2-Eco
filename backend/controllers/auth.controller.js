/**
 * controllers/auth.controller.js
 *
 * Core Authentication & Role Management Controller.
 * Integrates directly with Supabase Auth (auth.users) and the public.users profile table.
 * Uses genuine Supabase Auth sessions, valid JWTs, and enforces admin-only access on staff directory.
 */

'use strict';

const logger = require('../utils/logger');
const { getScopedClient, supabase: defaultSupabase } = require('../config/supabase');

/**
 * POST /api/auth/register
 * Registers a new user with Supabase Auth.
 * Role is strictly enforced as 'citizen' via database trigger; user metadata cannot override it.
 */
async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: A valid "email" is required.',
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: "password" must be at least 6 characters.',
      });
    }

    if (!defaultSupabase) {
      return res.status(503).json({
        success: false,
        error: 'Authentication service unavailable: Supabase client is not configured.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const { data, error } = await defaultSupabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name: name ? name.trim() : cleanEmail.split('@')[0],
          // Role is deliberately NOT set here; database trigger guarantees 'citizen'
        },
      },
    });

    if (error) {
      logger.error(`Supabase Auth signup failed: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.info(`User registered in Supabase Auth: ${cleanEmail} (${data.user?.id})`);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully with "citizen" role.',
      user: {
        id: data.user.id,
        email: data.user.email,
        role: 'citizen',
      },
    });
  } catch (err) {
    logger.error(`Error in register: ${err.message}`);
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Authenticates user via Supabase Auth and returns genuine access token and verified database role.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: Both "email" and "password" are required.',
      });
    }

    if (!defaultSupabase) {
      return res.status(503).json({
        success: false,
        error: 'Authentication service unavailable: Supabase client is not configured.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const { data, error } = await defaultSupabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data?.session) {
      logger.warn(`Failed login attempt for ${cleanEmail}: ${error?.message || 'No session'}`);
      return res.status(401).json({
        success: false,
        error: error?.message || 'Invalid login credentials.',
      });
    }

    // Retrieve verified role and profile from public.users table using the user's authenticated session
    const userClient = getScopedClient(req) || defaultSupabase;
    const { data: profile } = await userClient
      .from('users')
      .select('role, name, department')
      .eq('id', data.user.id)
      .single();

    logger.info(`User logged in via Supabase Auth: ${cleanEmail} [Role: ${profile?.role || 'citizen'}]`);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name || data.user.user_metadata?.name || cleanEmail.split('@')[0],
        role: profile?.role || 'citizen',
        department: profile?.department || null,
      },
    });
  } catch (err) {
    logger.error(`Error in login: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile using genuine Supabase JWT.
 */
async function getMe(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Bearer token is required.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!defaultSupabase) {
      return res.status(503).json({
        success: false,
        error: 'Authentication service unavailable.',
      });
    }

    const { data, error } = await defaultSupabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or expired session token.',
      });
    }

    const { data: profile, error: profileError } = await defaultSupabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return res.status(200).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name || data.user.user_metadata?.name || data.user.email.split('@')[0],
        role: profile?.role || 'citizen',
        department: profile?.department || null,
        created_at: profile?.created_at || data.user.created_at,
      },
    });
  } catch (err) {
    logger.error(`Error in getMe: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/auth/users
 * Returns list of team members (filtered by ?role=field_officer or ?role=stakeholder).
 * STRICTLY restricted to authenticated users with the 'admin' role.
 * Returns 401 for unauthenticated callers and 403 for non-admin callers.
 */
async function listUsers(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required. Bearer token must be provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!defaultSupabase) {
      return res.status(503).json({
        success: false,
        error: 'Service unavailable: Supabase client is not configured.',
      });
    }

    // 1. Verify token with Supabase Auth
    const { data: authData, error: authError } = await defaultSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or expired token.',
      });
    }

    // 2. Verify caller has 'admin' role in public.users
    const { data: callerProfile, error: callerError } = await defaultSupabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (callerError || !callerProfile || callerProfile.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Access to the staff directory is restricted to administrators.',
      });
    }

    // 3. Admin verified: query users matching optional ?role=
    const { role } = req.query;
    let query = defaultSupabase.from('users').select('id, name, email, role, department');
    if (role) {
      query = query.eq('role', role);
    }

    const { data: users, error: usersError } = await query;
    if (usersError) {
      logger.error(`Error fetching staff users: ${usersError.message}`);
      return res.status(500).json({
        success: false,
        error: usersError.message,
      });
    }

    return res.status(200).json({
      success: true,
      count: users ? users.length : 0,
      data: users || [],
    });
  } catch (err) {
    logger.error(`Error in listUsers: ${err.message}`);
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
  listUsers,
};
