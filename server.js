const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// 1. Initialize the App
const app = express();
const PORT = process.env.PORT || 3000;

// 2. Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 3. Middleware (CRITICAL: This allows the server to read your JSON data)
app.use(express.json());
app.use(express.static('public')); // Serves your index.html and script.js

// 4. Your Order Route
app.post('/submit-order', async (req, res) => {
    const orderData = req.body;
    const orderNumber = "EM" + Math.floor(1000 + Math.random() * 9000);

    try {
        const { data, error } = await supabase
            .from('orders')
            .insert([{
                order_number: orderNumber,
                customer_name: orderData.customerName,
                phone_number: orderData.phoneNumber,
                delivery_address: orderData.deliveryAddress,
                order_type: orderData.orderType,
                order_items: orderData.orderItems,
                total_amount: orderData.totalAmount
            }]);

        if (error) throw error;

        res.status(200).json({ success: true, orderNumber });
    } catch (error) {
        console.error("Database Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. Start the Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});