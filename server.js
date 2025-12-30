const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// 1. INITIALIZE APP & SERVER
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT"]
    }
});
const PORT = process.env.PORT || 3000;

// 2. INITIALIZE SUPABASE
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 3. MIDDLEWARE
app.use(express.json());
app.use(express.static('public'));

// 4. HEALTH CHECK ENDPOINT
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        connections: io.engine.clientsCount
    });
});

// ============================================
// LEGACY ENDPOINT - GOOGLE SHEETS / MAKE.COM
// ============================================
/*app.post('/submit-order', async (req, res) => {
    const orderData = req.body; 
    const orderNumber = "EM" + Math.floor(1000 + Math.random() * 9000);

    // Format the text for Trello description and WhatsApp message
    const itemDetails = orderData.orderItems
        .map(item => `${item.name} x${item.quantity}`)
        .join('\n');
    
    const plainTextMessage = `*Order #${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;
    const whatsappUpdate = `✅ Order confirmed!\n\n*Order# ${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;
    
    // ✅ BROADCAST TO KDS - LEGACY FORMAT
    io.emit('new-kds-order', { 
        orderNumber, 
        ...orderData, 
        plainTextMessage 
    });
    console.log("📢 Legacy order broadcast to KDS:", orderNumber);

    try {
        // Save to Supabase
        const { data: savedOrder, error: dbError } = await supabase
            .from('orders')
            .insert([{ 
                order_number: orderNumber,
                customer_name: orderData.customerName,
                phone_number: orderData.phoneNumber,
                user_input: orderData.userInput,
                delivery_address: orderData.deliveryAddress,
                order_type: orderData.orderType,
                total_amount: orderData.totalAmount,
                order_items: JSON.stringify(orderData.orderItems),
                status: 'new'
            }])
            .select()
            .single();

        if (dbError) throw dbError;

        // Send to Trello
        await axios.post(`https://api.trello.com/1/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`, {
            idList: process.env.TRELLO_LIST_ID,
            name: `Order #${orderNumber} - ${orderData.customerName}`,
            desc: plainTextMessage
        });

        // Send WhatsApp
        await axios.post(`https://graph.facebook.com/v24.0/${process.env.META_PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: orderData.phoneNumber,
            type: "text",
            text: { body: whatsappUpdate }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}` }
        });

        res.status(200).json({ success: true, orderNumber });

    } catch (error) {
        console.error("❌ Legacy order automation error:", error.response?.data || error.message);
        
        res.status(200).json({ 
            success: true, 
            orderNumber, 
            note: "Order sent to kitchen, but external automation had an issue." 
        });
    }
    });
**/
// ============================================
// NEW ENDPOINT - NODE.JS / SUPABASE (TAP+SERVE)
// ============================================

app.post('/api/orders', async (req, res) => {
        const orderData = req.body;
        const orderNumber = "SM" + Math.floor(1000 + Math.random() * 9000);

    try {
                
        console.log('📥 Received new order:', orderData);
        
        // Save to Supabase (Supabase generates UUID automatically)
        const orderNumber = orderData.orderNumber || `MN${Date.now()}`;
    const customerName = orderData.customer || orderData.customerName;
    const phoneNumber = orderData.phone || orderData.phoneNumber;
    const orderSource = orderData.source || 'phone';
    const deliveryAddress = orderData.deliveryAddress;
    const orderItems = orderData.items;
    const promiseTime = orderData.promiseTime || 20;

    const { data: savedOrder, error: dbError } = await supabase
        .from('orders')
        .insert([{
            order_number: orderNumber,
            customer_name: customerName,
            phone_number: phoneNumber,
            order_source: orderSource,
            delivery_address: deliveryAddress,
            order_items: orderItems,
            promise_time: promiseTime,
            status: 'new'
        }])
        .select()
        .single();

    if (dbError) {
        console.error('❌ Supabase insert error:', dbError);
        return res.status(500).json({
            success: false,
            message: dbError.message
        });
    }

        
        console.log('✅ Order saved to Supabase with ID:', savedOrder.id);
        
        // ✅ BROADCAST TO ALL KDS - NEW FORMAT WITH UUID
        const kdsOrder = {
            id: savedOrder.id,  // ← UUID from Supabase
            orderNumber: savedOrder.order_number,
            customer: savedOrder.customer_name,
            phone: savedOrder.phone_number,
            source: savedOrder.order_source,
            items: JSON.parse(savedOrder.order_items),
            promiseTime: savedOrder.promise_time,
            status: savedOrder.status,
            createdAt: savedOrder.created_at
        };
        
        io.emit('new_order', kdsOrder);  // ← CORRECT EVENT NAME
        console.log('📡 Broadcast new_order event with UUID:', savedOrder.id);
        
        res.json({
            success: true,
            message: 'Order created successfully',
            order: kdsOrder
        });
        
    } catch (error) {
        console.error('❌ Create order error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// GET ORDERS
// ============================================
app.get('/api/orders', async (req, res) => {
    try {
        const { status, source, limit = 50 } = req.query;
        
        let query = supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));
        
        // Filter by status (comma-separated: new,preparing,ready)
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

// ============================================
// UPDATE ORDER STATUS
// ============================================
app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;  // ← This is the UUID
        const { status } = req.body;
        
        console.log(`📝 Updating order ${orderId} to status: ${status}`);
        
        const { data: updatedOrder, error: dbError } = await supabase
            .from('orders')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)  // ← Match by UUID
            .select()
            .single();
        
        if (dbError || !updatedOrder) {
            console.error('❌ Update failed:', dbError);
            return res.status(404).json({
                success: false,
                message: 'Order not found or update failed'
            });
        }
        
        // ✅ BROADCAST STATUS CHANGE TO ALL KDS DISPLAYS
        io.emit('order_updated', {
            orderId: orderId,  // ← UUID
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        console.log(`✅ Order ${updatedOrder.order_number} updated to ${status} and broadcast`);
        
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

// ============================================
// SOCKET.IO CONNECTION HANDLING
// ============================================
io.on('connection', (socket) => {
    console.log('✅ KDS connected:', socket.id);
    console.log('📊 Total connections:', io.engine.clientsCount);
    
    socket.on('disconnect', () => {
        console.log('🔴 KDS disconnected:', socket.id);
        console.log('📊 Total connections:', io.engine.clientsCount);
    });
});

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 Socket.io ready for real-time updates`);
    console.log(`📡 Broadcasting on events: 'new_order', 'new-kds-order', 'order_updated'`);
});