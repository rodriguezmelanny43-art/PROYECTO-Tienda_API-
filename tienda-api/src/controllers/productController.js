const Product = require('../models/Product');

// GET /api/products  (publico)
exports.listProducts = async (req, res, next) => {
  try {
    const products = await Product.find().sort({ name: 1 });
    res.status(200).json({ count: products.length, products });
  } catch (err) {
    next(err);
  }
};

// POST /api/products  (solo admin)
exports.createProduct = async (req, res, next) => {
  try {
    const { name, description, price, stock } = req.body;
    const product = await Product.create({ name, description, price, stock });
    res.status(201).json({ message: 'Producto creado', product });
  } catch (err) {
    next(err);
  }
};
