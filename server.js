const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// 1. INITIALIZE APP & SERVER
const app = express();
const server = http.createServer(app);
const io = new Server(server); // For the KDS real-time updates
const PORT = process.env.PORT || 3000;

// 2. INITIALIZE SUPABASE
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 3. MIDDLEWARE
app.use(express.json());
app.use(express.static('public')); // Serves your index.html and script.js

// 4. THE ORDER ROUTE (Includes your Logic)
app.post('/submit-order', async (req, res) => {
    const orderData = req.body;
    const orderNumber = "EM" + Math.floor(1000 + Math.random() * 9000);

    const itemDetails = orderData.orderItems
        .map(item => `${item.name} x${item.quantity}`)
        .join('\n');
    
    const plainTextMessage = `*Order #${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;

    try {
        // 1. SAVE TO SUPABASE
        await supabase.from('orders').insert([{
            order_number: orderNumber,
            customer_name: orderData.customerName,
            phone_number: orderData.phoneNumber,
            delivery_address: orderData.deliveryAddress,
            order_type: orderData.orderType,
            order_items: orderData.orderItems,
            total_amount: orderData.totalAmount
        }]);

        // 2. SEND TO TRELLO
        await axios.post(`https://api.trello.com/1/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`, {
            idList: process.env.TRELLO_LIST_ID,
            name: `New Order: #${orderNumber} - ${orderData.customerName}`,
            desc: plainTextMessage
        });

        // 3. SEND WHATSAPP VIA META API
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.META_PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: orderData.phoneNumber,
            type: "template",
            template: {
                name: "order_confirmation_text",
                language: { code: "en_US" },
                components: [{
                    type: "body",
                    parameters: [{ type: "text", text: plainTextMessage }]
                }]
            }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}` }
        });

        // 4. PUSH TO KDS (via Socket.io)
        io.emit('new-kds-order', { orderNumber, ...orderData, plainTextMessage });

        res.status(200).json({ success: true, orderNumber });

    } catch (error) {
        console.error("Automation Error:", error.response?.data || error.message);
        // Still return success so the frontend shows the modal, but log the error
        res.status(200).json({ success: true, orderNumber, automationWarning: true });
    }
});

// 5. START SERVER (Crucial for Render)
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});