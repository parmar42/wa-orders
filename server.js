const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // This hosts your KDS HTML automatically!

// 1. DATABASE CONNECTION
const MONGODB_URI = process.env.MONGODB_URI; 
mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Connection Error:", err));

// 2. ORDER SCHEMA
const orderSchema = new mongoose.Schema({
  customerName: String,
  phoneNumber: String,
  waNumberFromURL: String,
  deliveryAddress: String,
  orderType: String,
  items: String, // We'll save the formatted string
  totalAmount: String,
  specialInstructions: String,
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// 3. API ROUTES

// A. Get active orders (for when the KDS screen refreshes)
app.get('/api/orders', async (req, res) => {
  const activeOrders = await Order.find({ status: 'active' }).sort({ createdAt: 1 });
  res.json(activeOrders);
});

// B. Submit new order (from your Menu Form)
app.post('/submit-order', async (req, res) => {
  try {
    const data = req.body;
    
    // Create new order record
    const newOrder = new Order({
      customerName: data.customerName,
      phoneNumber: data.phoneNumber,
      waNumberFromURL: data.waNumberFromURL,
      deliveryAddress: data.deliveryAddress,
      orderType: data.orderType,
      items: Array.isArray(data.items) ? data.items.map(i => `${i.name} x${i.quantity}`).join(', ') : data.items,
      totalAmount: data.totalAmount,
      specialInstructions: data.specialInstructions,
      source: data.waNumberFromURL ? 'whatsapp' : 'web'
    });

    await newOrder.save();

    // Push to KDS Screen via Socket.io
    io.emit('new-order', newOrder);

    // OPTIONAL: Push to Trello (Uncomment and fill when ready)
    /*
    await axios.post(`https://api.trello.com/1/cards?key=YOUR_KEY&token=YOUR_TOKEN&idList=LIST_ID`, {
        name: `Order: ${data.customerName}`,
        desc: `Items: ${newOrder.items}\nTotal: ${data.totalAmount}`
    });
    */

    res.status(200).json({ success: true, orderId: newOrder._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// C. Bump Order (Mark as Done)
app.patch('/api/orders/:id/bump', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'bumped' });
    res.status(200).send("Order Bumped");
  } catch (err) {
    res.status(500).send(err);
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server flying on port ${PORT}`));
