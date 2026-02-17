const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: LocalStrategy } = require('passport-local');
const bcrypt = require('bcryptjs');
const { defineUserModel } = require('./models/User');
const logger = require('./utils/logger');

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-in-production'
};

// JWT Strategy
passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const User = defineUserModel();
    const user = await User.findByPk(payload.id);
    
    if (!user || !user.isActive) {
      return done(null, false);
    }
    
    return done(null, user);
  } catch (error) {
    logger.error('JWT strategy error', { error: error.message });
    return done(error, false);
  }
}));

// Local Strategy (email/password)
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const User = defineUserModel();
      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      
      if (!user) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      
      // Check if account is locked
      if (user.lockUntil && user.lockUntil > new Date()) {
        return done(null, false, { message: 'Account is temporarily locked' });
      }
      
      const isMatch = await bcrypt.compare(password, user.password);
      
      if (!isMatch) {
        // Increment login attempts
        user.loginAttempts += 1;
        
        // Lock account after 5 failed attempts
        if (user.loginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
          logger.warn('Account locked due to failed attempts', { userId: user.id });
        }
        
        await user.save();
        return done(null, false, { message: 'Invalid credentials' });
      }
      
      // Reset login attempts on successful authentication
      if (user.loginAttempts > 0) {
        user.loginAttempts = 0;
        user.lockUntil = null;
        await user.save();
      }
      
      return done(null, user);
    } catch (error) {
      logger.error('Local strategy error', { error: error.message });
      return done(error);
    }
  }
));

module.exports = passport;
