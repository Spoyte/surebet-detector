const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const logger = require('../utils/logger');
const { defineUserModel } = require('../models/User');

const router = express.Router();

// Get current user profile
router.get('/me', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        phoneNumber: req.user.phoneNumber,
        role: req.user.role,
        timezone: req.user.timezone,
        currency: req.user.currency,
        language: req.user.language,
        isEmailVerified: req.user.isEmailVerified,
        twoFactorEnabled: req.user.twoFactorEnabled,
        lastLoginAt: req.user.lastLoginAt,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    logger.error('Get profile failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/me', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const updateSchema = Joi.object({
      firstName: Joi.string().max(100).optional(),
      lastName: Joi.string().max(100).optional(),
      phoneNumber: Joi.string().max(20).optional(),
      timezone: Joi.string().max(50).optional(),
      currency: Joi.string().length(3).optional(),
      language: Joi.string().max(10).optional()
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const User = defineUserModel();
    const user = await User.findByPk(req.user.id);

    // Update fields
    Object.keys(value).forEach(key => {
      if (value[key] !== undefined) {
        user[key] = value[key];
      }
    });

    await user.save();

    logger.info('Profile updated', { userId: user.id });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        timezone: user.timezone,
        currency: user.currency,
        language: user.language
      }
    });
  } catch (error) {
    logger.error('Update profile failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// Change password
router.put('/me/password', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const passwordSchema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).required()
    });

    const { error, value } = passwordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const User = defineUserModel();
    const user = await User.findByPk(req.user.id);

    // Verify current password
    const isMatch = await bcrypt.compare(value.currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash and save new password
    user.password = await bcrypt.hash(value.newPassword, 10);
    await user.save();

    logger.info('Password changed', { userId: user.id });

    res.json({
      success: true,
      data: { message: 'Password updated successfully' }
    });
  } catch (error) {
    logger.error('Password change failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// Get user by ID (admin only)
router.get('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const User = defineUserModel();
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get user failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// List users (admin only)
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { page = 1, limit = 20, search, role } = req.query;
    const offset = (page - 1) * limit;

    const User = defineUserModel();
    const where = {};

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (role) {
      where.role = role;
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'twoFactorSecret', 'twoFactorBackupCodes'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total: count,
          page: parseInt(page),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('List users failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

// Update user role (admin only)
router.put('/:id/role', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { role } = req.body;
    if (!['user', 'premium', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const User = defineUserModel();
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.role = role;
    await user.save();

    logger.info('User role updated', { userId: user.id, newRole: role, adminId: req.user.id });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Update role failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

// Deactivate user (admin only)
router.delete('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const User = defineUserModel();
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.isActive = false;
    await user.save();

    logger.info('User deactivated', { userId: user.id, adminId: req.user.id });

    res.json({
      success: true,
      data: { message: 'User deactivated' }
    });
  } catch (error) {
    logger.error('Deactivate user failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to deactivate user' });
  }
});

module.exports = router;
