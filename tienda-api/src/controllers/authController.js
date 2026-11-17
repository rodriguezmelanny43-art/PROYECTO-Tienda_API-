const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const SALT_ROUNDS = 10;

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validamos antes de hashear para que bcrypt nunca reciba un valor invalido
    if (!password || String(password).length < 6) {
      return res
        .status(400)
        .json({ message: 'Error de validacion', errors: ['La contrasena debe tener al menos 6 caracteres'] });
    }

    const hashed = await bcrypt.hash(String(password), SALT_ROUNDS);
    // El rol NUNCA se toma del body: todo registro publico es "user"
    const user = await User.create({ name, email, password: hashed, role: 'user' });

    res.status(201).json({
      message: 'Usuario registrado correctamente',
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contrasena son obligatorios' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
    const ok = user && (await bcrypt.compare(String(password), user.password));
    if (!ok) {
      // Mismo mensaje para email inexistente y contrasena incorrecta (no filtra que cuentas existen)
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    res.status(200).json({
      message: 'Login exitoso',
      token: signToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};
