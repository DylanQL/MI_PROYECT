const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/login', authController.renderLogin);
router.get('/register', authController.renderRegister);
router.post('/login', authController.login);
router.post('/register/status', authController.registrationStatus);
router.post('/register/send-code', authController.sendRegisterCode);
router.post('/register/verify-code', authController.verifyRegisterCode);
router.post('/logout', authController.logout);

module.exports = router;
