const User = require('../models/User');

module.exports = {
  requireRole: (role) => async (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect('/select-role');
    if (user.role !== role) return res.status(403).send('Forbidden');
    // attach full user from DB
    const full = await User.findById(user._id);
    if (!full) return res.redirect('/select-role');
    req.user = full;
    next();
  }
};
