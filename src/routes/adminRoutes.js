const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/admin', adminController.renderAdmin);
router.get('/admin/users/:id/edit', requireAdmin, adminController.renderEditUser);
router.post('/admin/users', requireAdmin, adminController.createUser);
router.post('/admin/users/:id', requireAdmin, adminController.updateUser);
router.post('/admin/users/:id/delete', requireAdmin, adminController.deleteUser);

module.exports = router;
