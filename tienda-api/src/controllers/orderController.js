const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');

/** Devuelve al inventario las cantidades indicadas: [{ product, quantity }] */
const restoreStock = (lines) =>
  Product.bulkWrite(
    lines.map((l) => ({
      updateOne: { filter: { _id: l.product }, update: { $inc: { stock: l.quantity } } },
    }))
  );

// POST /api/orders   body: { items: [{ productId, quantity }] }
exports.createOrder = async (req, res, next) => {
  const deducted = []; // lineas ya descontadas del stock (para poder revertir)
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Debes enviar al menos un producto en "items"' });
    }

    // Validar formato y unificar productos repetidos
    const merged = new Map();
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!mongoose.isValidObjectId(it.productId)) {
        return res.status(400).json({ message: `productId invalido: ${it.productId}` });
      }
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: 'La cantidad debe ser un entero mayor o igual a 1' });
      }
      merged.set(String(it.productId), (merged.get(String(it.productId)) || 0) + qty);
    }

    const lines = [];
    for (const [productId, quantity] of merged) {
      // Descuento ATOMICO: solo se descuenta si hay stock suficiente en ese instante.
      // Evita vender de mas cuando dos compras llegan a la vez.
      const product = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { returnDocument: 'after' }
      );

      if (!product) {
        // Falla: revertir lo ya descontado y explicar el motivo
        if (deducted.length) await restoreStock(deducted);
        const exists = await Product.findById(productId);
        if (!exists) {
          return res.status(404).json({ message: `Producto no encontrado: ${productId}` });
        }
        return res.status(409).json({
          message: `Stock insuficiente para "${exists.name}"`,
          disponible: exists.stock,
          solicitado: quantity,
        });
      }

      deducted.push({ product: product._id, quantity });
      lines.push({ product: product._id, name: product.name, price: product.price, quantity });
    }

    const total = Number(lines.reduce((s, l) => s + l.price * l.quantity, 0).toFixed(2));
    const order = await Order.create({ user: req.user._id, items: lines, total });

    res.status(201).json({ message: 'Orden creada correctamente', order });
  } catch (err) {
    // Cualquier error inesperado: dejar el inventario como estaba
    if (deducted.length) {
      try {
        await restoreStock(deducted);
      } catch (e) {
        console.error('No se pudo revertir el stock', e);
      }
    }
    next(err);
  }
};

// POST /api/orders/:id/return
exports.returnOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: `Identificador invalido: ${id}` });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });

    // Solo el dueño de la orden (o un admin) puede devolverla
    const isOwner = String(order.user) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'No puedes devolver una orden de otro usuario' });
    }

    // Cambio de estado ATOMICO: si dos peticiones llegan a la vez, solo una lo logra
    const updated = await Order.findOneAndUpdate(
      { _id: id, status: 'completada' },
      { status: 'devuelta', returnedAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!updated) {
      return res.status(409).json({ message: 'La orden ya fue devuelta anteriormente' });
    }

    try {
      await restoreStock(updated.items);
    } catch (err) {
      // Si no se pudo restaurar el stock, volver la orden a su estado original
      await Order.updateOne({ _id: id }, { status: 'completada', $unset: { returnedAt: '' } });
      throw err;
    }

    res.status(200).json({ message: 'Orden devuelta y stock restaurado', order: updated });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders  (ordenes del usuario autenticado)
exports.myOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ count: orders.length, orders });
  } catch (err) {
    next(err);
  }
};
