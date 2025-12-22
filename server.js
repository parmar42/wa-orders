const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. MIDDLEWARE ---
app.use(express.json());
app.use(express.static('public')); // This serves your menu.html and kds.html

// --- 2. DATABASE CONNECTION ---
const uri = process.env.MONGODB_URI; // This pulls from Render's settings

mongoose.connect(uri)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Connection Error:', err));

// --- 3. DATABASE SCHEMA ---
const orderSchema = new mongoose.Schema({
  customerName: String,
  phoneNumber: String,
  waNumberFromURL: String,
  deliveryAddress: String,
  orderType: String,
  items: String,
  totalAmount: String,
  specialInstructions: String,
  displayId: String, // This stores the WA-1234 number
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// --- 4. ROUTES ---

// Submit Order from Menu
app.post('/submit-order', async (req, res) => {
  try {
    const data = req.body;
    
    // Generate numerical WA-1234 ID
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const isWA = data.waNumberFromURL && data.waNumberFromURL.length > 0;
    const displayId = isWA ? `WA-${randomDigits}` : `#${randomDigits}`;

    const newOrder = new Order({ ...data, displayId });
    await newOrder.save();

    // Shout to KDS screen
    io.emit('new-order', newOrder);

    res.status(200).json({ success: true, orderNumber: displayId });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Fetch active orders for KDS startup
app.get('/api/orders', async (req, res) => {
  const activeOrders = await Order.find({ status: 'active' });
  res.json(activeOrders);
});

// Bump order (Mark as Done)
app.patch('/api/orders/:id/bump', async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, { status: 'completed' });
  res.json({ success: true });
});

// --- 5. START SERVER ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server flying on port ${PORT}`));
