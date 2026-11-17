const router = require('express').Router();
const { createOrder, returnOrder, myOrders } = require('../controllers/orderController');
const { protect } = require('../middlewares/auth');

// Todas las rutas de ordenes son privadas
router.use(protect);

router.get('/', myOrders);
router.post('/', createOrder);
router.post('/:id/return', returnOrder);

module.exports = router;
