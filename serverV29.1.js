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
    const whatsappUpdate = `✅ Order confirmed!\n\n*Order# ${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;
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
                user_input: orderData.userInput,
                delivery_address: orderData.deliveryAddress,
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
            
            //`Order sent from ${orderData.phoneNumber} | Customer filled number ${userInput}\n\n${plainTextMessage}`,
            
        });

        // 4. SEND WHATSAPP (Customer Receipt)
        // Uses the wa_number captured from your URL
        await axios.post(`https://graph.facebook.com/v24.0/${process.env.META_PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: orderData.phoneNumber,
            type: "text",
            text: { body: whatsappUpdate }
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


/**
 * GET ALL ORDERS
 * GET /api/orders
 */
app.get('/api/orders', async (req, res) => {
    try {
        const { status, source, limit = 50 } = req.query;
        
        let query = supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));
        
        // Filter by status (can be comma-separated like: new,preparing,ready)
        if (status) {
            const statuses = status.split(',');
            query = query.in('status', statuses);
        }
        
        if (source) {
            query = query.eq('order_source', source);
        }
        
        const { data: orders, error } = await query;
        
        if (error) {
            console.error('❌ Supabase query error:', error);
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        
        console.log(`✅ Fetched ${orders.length} orders from Supabase`);
        
        res.json({
            success: true,
            count: orders.length,
            orders: orders
        });
        
    } catch (error) {
        console.error('❌ Get orders error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * UPDATE ORDER STATUS
 * PUT /api/orders/:orderNumber/status
 */
app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        
        console.log(`📝 Updating order ${orderId} to status: ${status}`);
        
        const { data: updatedOrder, error: dbError } = await supabase
            .from('orders')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();
        
        if (dbError || !updatedOrder) {
            console.error('❌ Update failed:', dbError);
            return res.status(404).json({
                success: false,
                message: 'Order not found or update failed'
            });
        }
        
        // Broadcast status change to all connected KDS displays
        io.emit('order_updated', {
            orderId: orderId,
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        console.log('✅ Order updated and broadcast to all KDS');
        
        res.json({
            success: true,
            message: 'Order status updated',
            order: updatedOrder
        });
        
    } catch (error) {
        console.error('❌ Status update error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// 5. START SERVER (Crucial for Render)
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);


});
