const router = require('express').Router();
const { listProducts, createProduct } = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/auth');

router.get('/', listProducts);
router.post('/', protect, authorize('admin'), createProduct);

module.exports = router;
