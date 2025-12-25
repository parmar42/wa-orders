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

app.post('/submit-order', async (req, res) => {
    const orderData = req.body; 
    const orderNumber = "EM" + Math.floor(1000 + Math.random() * 9000);

    // Format the text for Trello description and WhatsApp message
    const itemDetails = orderData.orderItems
        .map(item => `${item.name} x${item.quantity}`)
        .join('\n');
    
    const plainTextMessage = `*Order #${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;

    // 1. BROADCAST TO KDS (Immediate - even if others fail)
    io.emit('new-kds-order', { orderNumber, ...orderData, plainTextMessage });
    console.log("📢 Shouted to KDS:", orderNumber);

    try {
       // 2. SAVE TO SUPABASE (Explicitly mapping columns)
        const { error: dbError } = await supabase
            .from('orders')
            .insert([{ 
                order_number: orderNumber,
                customer_name: orderData.customerName, // Ensure these match your Supabase columns
                phone_number: orderData.phoneNumber,
                user_phone: orderData.userPhone,
                order_type: orderData.orderType,
                total_amount: orderData.totalAmount,
                order_items: JSON.stringify(orderData.orderItems), // Items must be saved as text or JSON
                status: 'new'
            }]);

        if (dbError) throw dbError; // If Supabase fails, catch it below
        // 3. SEND TO TRELLO (Visual Board)
        await axios.post(`https://api.trello.com/1/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`, {
            idList: process.env.TRELLO_LIST_ID,
            name: `Order #${orderNumber} - ${orderData.customerName} - ${plainTextMessage}`,
            desc: plainTextMessage
        });

        // 4. SEND WHATSAPP (Customer Receipt)
        // Uses the wa_number captured from your URL
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.META_PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: userPhone,
            type: "text",
            text: { body: plainTextMessage }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}` }
        });

        // If everything succeeds, send this response
        res.status(200).json({ success: true, orderNumber });

    } catch (error) {
        // If Trello, Supabase, or WhatsApp fails, we log it here
        console.error("Automation Error Log:", error.response?.data || error.message);
        
        // We still send success:true to the user because the KDS worked!
        res.status(200).json({ 
            success: true, 
            orderNumber, 
            note: "Order sent to kitchen, but external automation had an issue." 
        });
    }
});


// 5. START SERVER (Crucial for Render)
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});