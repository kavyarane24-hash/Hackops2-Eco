/**
 * routes/reports.routes.js
 *
 * Reports module – placeholder for another team member.
 * Mounted at: /api/reports (see server.js)
 */

const express = require('express');
const router  = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ success: true, module: 'Reports', status: 'placeholder' });
});

module.exports = router;
