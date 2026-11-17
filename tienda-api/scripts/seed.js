// Crea un usuario administrador y productos de ejemplo.
// Uso: npm run seed   (requiere .env con MONGO_URI)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Product = require('../src/models/Product');

(async () => {
  await connectDB();

  const adminEmail = 'admin@tienda.com';
  if (!(await User.findOne({ email: adminEmail }))) {
    await User.create({
      name: 'Administrador',
      email: adminEmail,
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
    });
    console.log('Admin creado: admin@tienda.com / admin123');
  }

  const products = [
    { name: 'Laptop Pro 14', description: 'Laptop de 14 pulgadas', price: 3500, stock: 10 },
    { name: 'Mouse inalambrico', description: 'Mouse optico USB', price: 45.5, stock: 50 },
    { name: 'Teclado mecanico', description: 'Teclado switch azul', price: 180, stock: 25 },
  ];
  for (const p of products) {
    await Product.updateOne({ name: p.name }, { $setOnInsert: p }, { upsert: true });
  }
  console.log('Productos de ejemplo listos');

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
