const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { defineUserModel } = require('../models/User');
const { getRedis } = require('../config/redis');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().max(100).optional(),
  lastName: Joi.string().max(100).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  twoFactorCode: Joi.string().length(6).optional()
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const User = defineUserModel();
    
    // Check if email exists
    const existingUser = await User.findOne({ where: { email: value.email.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 10);

    // Create user
    const user = await User.create({
      id: uuidv4(),
      email: value.email.toLowerCase(),
      password: hashedPassword,
      firstName: value.firstName,
      lastName: value.lastName,
      emailVerificationToken: uuidv4()
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        },
        token
      }
    });
  } catch (error) {
    logger.error('Registration failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const User = defineUserModel();
    const user = await User.findOne({ where: { email: value.email.toLowerCase() } });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(value.password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check if 2FA is required
    if (user.twoFactorEnabled) {
      if (!value.twoFactorCode) {
        return res.status(403).json({ 
          success: false, 
          error: 'Two-factor authentication required',
          requiresTwoFactor: true
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: value.twoFactorCode,
        window: 1
      });

      if (!verified) {
        return res.status(401).json({ success: false, error: 'Invalid two-factor code' });
      }
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    logger.info('User logged in', { userId: user.id });

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled
        },
        token
      }
    });
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Setup 2FA
router.post('/2fa/setup', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const User = defineUserModel();
    const user = await User.findByPk(req.user.id);

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA is already enabled' });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `SurebetDetector:${user.email}`,
      length: 32
    });

    // Store secret temporarily (will be confirmed later)
    const redis = getRedis();
    await redis.setex(`2fa:setup:${user.id}`, 600, secret.base32);

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl
      }
    });
  } catch (error) {
    logger.error('2FA setup failed', { error: error.message });
    res.status(500).json({ success: false, error: '2FA setup failed' });
  }
});

// Verify and enable 2FA
router.post('/2fa/verify', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, error: 'Invalid code' });
    }

    const User = defineUserModel();
    const user = await User.findByPk(req.user.id);

    const redis = getRedis();
    const secret = await redis.get(`2fa:setup:${user.id}`);

    if (!secret) {
      return res.status(400).json({ success: false, error: '2FA setup expired. Please start again.' });
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () => 
      Math.random().toString(36).substring(2, 8).toUpperCase()
    );

    // Enable 2FA
    user.twoFactorSecret = secret;
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = backupCodes;
    await user.save();

    await redis.del(`2fa:setup:${user.id}`);

    logger.info('2FA enabled', { userId: user.id });

    res.json({
      success: true,
      data: {
        message: 'Two-factor authentication enabled',
        backupCodes
      }
    });
  } catch (error) {
    logger.error('2FA verification failed', { error: error.message });
    res.status(500).json({ success: false, error: '2FA verification failed' });
  }
});

// Disable 2FA
router.post('/2fa/disable', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { password } = req.body;
    
    const User = defineUserModel();
    const user = await User.findByPk(req.user.id);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    user.twoFactorSecret = null;
    user.twoFactorEnabled = false;
    user.twoFactorBackupCodes = [];
    await user.save();

    logger.info('2FA disabled', { userId: user.id });

    res.json({
      success: true,
      data: { message: 'Two-factor authentication disabled' }
    });
  } catch (error) {
    logger.error('2FA disable failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to disable 2FA' });
  }
});

// Refresh token
router.post('/refresh', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, role: req.user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: { token }
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

module.exports = router;
