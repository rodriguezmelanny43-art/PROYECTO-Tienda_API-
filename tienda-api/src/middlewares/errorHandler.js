/** Ruta no encontrada */
const notFound = (req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
};

/** Manejador global de errores */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Errores de validacion de Mongoose
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: 'Error de validacion', errors });
  }
  // ObjectId mal formado
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Identificador invalido: ${err.value}` });
  }
  // Clave duplicada (unique)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    return res.status(409).json({
      message: field ? `Ya existe un registro con ese ${field}` : 'Ya existe un registro con esos datos',
    });
  }
  // JSON mal formado en el body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON mal formado en el cuerpo de la peticion' });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Error interno del servidor' : err.message });
};

module.exports = { notFound, errorHandler };
