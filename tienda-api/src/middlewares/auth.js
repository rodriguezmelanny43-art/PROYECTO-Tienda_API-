const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifica el JWT enviado en "Authorization: Bearer <token>".
 * Si es valido, carga el usuario en req.user; si no, responde 401.
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Acceso denegado: falta el token Bearer' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // lanza error si es invalido/expirado

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'El usuario del token ya no existe' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'El token ha expirado' });
    }
    return res.status(401).json({ message: 'Token invalido' });
  }
};

/** Restringe una ruta a ciertos roles (se usa despues de protect). */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'No tienes permisos para esta accion' });
  }
  next();
};

module.exports = { protect, authorize };
