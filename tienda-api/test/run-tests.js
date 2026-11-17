require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto_de_pruebas';
process.env.JWT_EXPIRES_IN = '1d';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tienda_test';
const OUT = path.join(__dirname, '..', 'docs', 'pruebas.txt');

let base;
const log = [];
let passed = 0;
let failed = 0;

const pretty = (o) => JSON.stringify(o, null, 2);

/** Ejecuta una peticion, la registra en el log y devuelve { status, body }. */
async function call(title, method, url, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(base + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();

  const shownHeaders = { ...headers };
  if (token) shownHeaders['Authorization'] = 'Bearer <token>';
  log.push(
    [
      `### ${title}`,
      `Endpoint: ${method} ${url}`,
      `Headers: ${Object.keys(shownHeaders).length ? pretty(shownHeaders) : '(ninguno)'}`,
      `Request Payload: ${body !== undefined ? pretty(body) : '(sin cuerpo)'}`,
      `Response Status: ${res.status} ${res.statusText || ''}`.trim(),
      `Response Payload: ${pretty(data)}`,
      '',
    ].join('\n')
  );
  return { status: res.status, body: data };
}

function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  OK   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`);
  }
}

const stockOf = async (name) => (await Product.findOne({ name })).stock;

(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Product.init()]); // crea los indices unique

  // Datos iniciales: un admin y tres productos
  await User.create({
    name: 'Administrador',
    email: 'admin@tienda.com',
    password: await bcrypt.hash('admin123', 10),
    role: 'admin',
  });
  await Product.insertMany([
    { name: 'Laptop Pro 14', description: 'Laptop de 14 pulgadas', price: 3500, stock: 10 },
    { name: 'Mouse inalambrico', description: 'Mouse optico USB', price: 45.5, stock: 50 },
    { name: 'Teclado mecanico', description: 'Teclado switch azul', price: 180, stock: 25 },
  ]);

  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`API de pruebas en ${base}\n`);

  // ---------- 1. REGISTRO ----------
  console.log('Registro');
  let r = await call('1.1 Registro exitoso', 'POST', '/api/auth/register', {
    body: { name: 'Melanny Rodriguez', email: 'mel@correo.com', password: 'clave123' },
  });
  check('registro devuelve 201 y no expone la contrasena', r.status === 201 && !r.body.user.password);

  const stored = await User.findOne({ email: 'mel@correo.com' }).select('+password');
  check('la contrasena se guarda hasheada con bcrypt', /^\$2[aby]\$10\$/.test(stored.password));

  r = await call('1.2 Registro con email duplicado', 'POST', '/api/auth/register', {
    body: { name: 'Otra Persona', email: 'mel@correo.com', password: 'clave123' },
  });
  check('email duplicado devuelve 409', r.status === 409);

  r = await call('1.3 Registro con datos invalidos', 'POST', '/api/auth/register', {
    body: { name: 'A', email: 'correo-malo', password: '123' },
  });
  check('datos invalidos devuelven 400', r.status === 400);

  r = await call('1.4 Registro intentando asignarse rol admin', 'POST', '/api/auth/register', {
    body: { name: 'Intruso', email: 'intruso@correo.com', password: 'clave123', role: 'admin' },
  });
  check('el rol enviado en el body se ignora (queda "user")', r.status === 201 && r.body.user.role === 'user');

  // ---------- 2. LOGIN ----------
  console.log('Login');
  r = await call('2.1 Login exitoso', 'POST', '/api/auth/login', {
    body: { email: 'mel@correo.com', password: 'clave123' },
  });
  const token = r.body.token;
  check('login devuelve 200 y un JWT de 3 partes', r.status === 200 && token && token.split('.').length === 3);

  r = await call('2.2 Login con contrasena incorrecta', 'POST', '/api/auth/login', {
    body: { email: 'mel@correo.com', password: 'incorrecta' },
  });
  check('contrasena incorrecta devuelve 401', r.status === 401);

  r = await call('2.3 Login con email inexistente', 'POST', '/api/auth/login', {
    body: { email: 'nadie@correo.com', password: 'clave123' },
  });
  check('email inexistente devuelve 401 (mismo mensaje)', r.status === 401 && r.body.message === 'Credenciales invalidas');

  // segundo usuario para probar permisos
  await call('2.4 Registro del segundo usuario', 'POST', '/api/auth/register', {
    body: { name: 'Carlos Perez', email: 'carlos@correo.com', password: 'clave456' },
  });
  r = await call('2.5 Login del segundo usuario', 'POST', '/api/auth/login', {
    body: { email: 'carlos@correo.com', password: 'clave456' },
  });
  const token2 = r.body.token;

  r = await call('2.6 Login del administrador', 'POST', '/api/auth/login', {
    body: { email: 'admin@tienda.com', password: 'admin123' },
  });
  const tokenAdmin = r.body.token;

  // ---------- 3. PROTECCION DE RUTAS ----------
  console.log('Proteccion de rutas');
  r = await call('3.1 Ruta privada sin token', 'GET', '/api/orders');
  check('sin token devuelve 401', r.status === 401);

  r = await call('3.2 Ruta privada con token invalido', 'GET', '/api/orders', { token: 'token.falso.123' });
  check('token invalido devuelve 401', r.status === 401);

  const forged = require('jsonwebtoken').sign({ id: stored._id }, 'otro_secreto');
  r = await call('3.3 Token firmado con otro secreto', 'GET', '/api/orders', { token: forged });
  check('token firmado con otra clave devuelve 401', r.status === 401);

  // ---------- 4. PRODUCTOS ----------
  console.log('Productos');
  r = await call('4.1 Listar productos (publico)', 'GET', '/api/products');
  check('listado devuelve 3 productos', r.status === 200 && r.body.count === 3);
  const byName = Object.fromEntries(r.body.products.map((p) => [p.name, p]));
  const laptop = byName['Laptop Pro 14']._id;
  const mouse = byName['Mouse inalambrico']._id;
  const teclado = byName['Teclado mecanico']._id;

  r = await call('4.2 Crear producto como usuario normal', 'POST', '/api/products', {
    token,
    body: { name: 'Monitor 24', description: 'Full HD', price: 650, stock: 8 },
  });
  check('usuario normal recibe 403', r.status === 403);

  r = await call('4.3 Crear producto como admin', 'POST', '/api/products', {
    token: tokenAdmin,
    body: { name: 'Monitor 24', description: 'Full HD', price: 650, stock: 8 },
  });
  check('admin crea producto (201)', r.status === 201);

  r = await call('4.4 Crear producto con stock negativo', 'POST', '/api/products', {
    token: tokenAdmin,
    body: { name: 'Producto malo', price: 10, stock: -5 },
  });
  check('stock negativo devuelve 400', r.status === 400);

  // ---------- 5. CREAR ORDEN ----------
  console.log('Crear orden');
  r = await call('5.1 Crear orden exitosa (2 mouse + 1 laptop)', 'POST', '/api/orders', {
    token,
    body: {
      items: [
        { productId: mouse, quantity: 2 },
        { productId: laptop, quantity: 1 },
      ],
    },
  });
  const orderId = r.body.order && r.body.order._id;
  check('orden creada (201) con total 3591', r.status === 201 && r.body.order.total === 3591 && r.body.order.status === 'completada');
  check('stock del mouse bajo de 50 a 48', (await stockOf('Mouse inalambrico')) === 48);
  check('stock de la laptop bajo de 10 a 9', (await stockOf('Laptop Pro 14')) === 9);
  await call('5.1b Verificar el stock tras la compra', 'GET', '/api/products');

  r = await call('5.2 Listar mis ordenes', 'GET', '/api/orders', { token });
  check('el usuario ve su orden', r.status === 200 && r.body.count === 1);

  r = await call('5.3 Orden con stock insuficiente (revierte todo)', 'POST', '/api/orders', {
    token,
    body: {
      items: [
        { productId: teclado, quantity: 5 },
        { productId: laptop, quantity: 999 },
      ],
    },
  });
  check('stock insuficiente devuelve 409', r.status === 409);
  check('el teclado (ya descontado) fue restaurado a 25', (await stockOf('Teclado mecanico')) === 25);
  check('la laptop sigue en 9', (await stockOf('Laptop Pro 14')) === 9);

  r = await call('5.4 Orden con producto inexistente', 'POST', '/api/orders', {
    token,
    body: { items: [{ productId: '64b7f0c2a1b2c3d4e5f60718', quantity: 1 }] },
  });
  check('producto inexistente devuelve 404', r.status === 404);

  r = await call('5.5 Orden con cantidad invalida', 'POST', '/api/orders', {
    token,
    body: { items: [{ productId: mouse, quantity: 0 }] },
  });
  check('cantidad 0 devuelve 400', r.status === 400);

  r = await call('5.6 Orden sin items', 'POST', '/api/orders', { token, body: { items: [] } });
  check('items vacio devuelve 400', r.status === 400);

  // ---------- 6. DEVOLVER ORDEN ----------
  console.log('Devolver orden');
  r = await call('6.1 Devolver orden de otro usuario', 'POST', `/api/orders/${orderId}/return`, { token: token2 });
  check('otro usuario recibe 403', r.status === 403);
  check('el stock no cambio tras el intento ajeno', (await stockOf('Mouse inalambrico')) === 48);

  r = await call('6.2 Devolver orden propia', 'POST', `/api/orders/${orderId}/return`, { token });
  check('devolucion exitosa (200), estado "devuelta"', r.status === 200 && r.body.order.status === 'devuelta');
  check('stock del mouse restaurado a 50', (await stockOf('Mouse inalambrico')) === 50);
  check('stock de la laptop restaurado a 10', (await stockOf('Laptop Pro 14')) === 10);
  await call('6.2b Verificar el stock tras la devolucion', 'GET', '/api/products');

  r = await call('6.3 Devolver la misma orden otra vez', 'POST', `/api/orders/${orderId}/return`, { token });
  check('segunda devolucion devuelve 409', r.status === 409);
  check('el stock NO se duplico (mouse sigue en 50)', (await stockOf('Mouse inalambrico')) === 50);

  r = await call('6.4 Devolver orden con id mal formado', 'POST', '/api/orders/abc123/return', { token });
  check('id invalido devuelve 400', r.status === 400);

  r = await call('6.5 Devolver orden inexistente', 'POST', '/api/orders/64b7f0c2a1b2c3d4e5f60718/return', { token });
  check('orden inexistente devuelve 404', r.status === 404);

  // ---------- 7. CONCURRENCIA (opcional) ----------
  // Solo es concluyente contra un MongoDB real: findOneAndUpdate es atomico por documento.
  // Algunos emuladores compatibles con MongoDB no garantizan esa atomicidad.
  // Activar con: TEST_CONCURRENCY=1 npm test
  if (process.env.TEST_CONCURRENCY === '1') {
    console.log('Concurrencia');
    await Product.create({ name: 'Edicion limitada', price: 100, stock: 1 });
    const limited = (await Product.findOne({ name: 'Edicion limitada' }))._id;
    const attempts = await Promise.all(
      [token, token2, token, token2, token].map((t) =>
        fetch(base + '/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ items: [{ productId: limited, quantity: 1 }] }),
        }).then((x) => x.status)
      )
    );
    const ok = attempts.filter((s) => s === 201).length;
    const conflict = attempts.filter((s) => s === 409).length;
    log.push(
      `### 7.1 Prueba de concurrencia: 5 compras simultaneas de la ultima unidad\nResultado de los 5 status HTTP: ${JSON.stringify(
        attempts
      )}\nStock final: ${await stockOf('Edicion limitada')}\n`
    );
    check('solo 1 de 5 compras simultaneas tuvo exito', ok === 1 && conflict === 4);
    check('el stock final es 0 (nunca negativo)', (await stockOf('Edicion limitada')) === 0);
  }

  // ---------- RESUMEN ----------
  const summary = `\nResumen: ${passed} verificaciones correctas, ${failed} fallidas.\n`;
  console.log(summary);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, log.join('\n') + summary);

  server.close();
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
