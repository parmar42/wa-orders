const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');

// ============================================
// INITIALIZE APP & SERVER
// ============================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT"]
    }
});
const PORT = process.env.PORT || 3000;

// ============================================
// INITIALIZE SUPABASE
// ============================================
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.static('public'));

// ============================================
// HEALTH CHECK
// ============================================
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
app.post('/submit-order', async (req, res) => {
    const orderData = req.body; 
    const orderNumber = "EM" + Math.floor(1000 + Math.random() * 9000);

    const itemDetails = orderData.orderItems
        .map(item => `${item.name} x${item.quantity}`)
        .join('\n');
    
    const plainTextMessage = `*Order #${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;
    const whatsappUpdate = `✅ Order confirmed!\n\n*Order# ${orderNumber}*\n\nItems:\n${itemDetails}\n\nTotal: ${orderData.totalAmount}\nType: ${orderData.orderType}`;
    
    // Broadcast to KDS - Legacy format
    io.emit('new-kds-order', { 
        orderNumber, 
        ...orderData, 
        plainTextMessage 
    });
    console.log("📢 Legacy order broadcast:", orderNumber);

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
                order_source: orderData.orderType?.toLowerCase() || 'phone',
                total_amount: orderData.totalAmount,
                order_items: JSON.stringify(orderData.orderItems),
                status: 'new'
            }])
            .select()
            .single();

        if (dbError) throw dbError;

        // Send to Trello (if configured)
        if (process.env.TRELLO_KEY && process.env.TRELLO_TOKEN) {
            await axios.post(
                `https://api.trello.com/1/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`, 
                {
                    idList: process.env.TRELLO_LIST_ID,
                    name: `Order #${orderNumber} - ${orderData.customerName}`,
                    desc: plainTextMessage
                }
            ).catch(err => console.error('Trello error:', err.message));
        }

        // Send WhatsApp (if configured)
        if (process.env.META_PHONE_ID && process.env.META_ACCESS_TOKEN) {
            await axios.post(
                `https://graph.facebook.com/v24.0/${process.env.META_PHONE_ID}/messages`, 
                {
                    messaging_product: "whatsapp",
                    to: 12462348400,
                    type: "text",
                    text: { body: whatsappUpdate }
                }, 
                {
                    headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}` }
                }
            ).catch(err => console.error('WhatsApp error:', err.message));
        }

        res.json({ success: true, orderNumber });

    } catch (error) {
        console.error("❌ Legacy order error:", error.message);
        res.status(200).json({ 
            success: true, 
            orderNumber, 
            note: "Order sent to kitchen, but external automation had an issue." 
        });
    }
});

// ============================================
// NEW ENDPOINT - NODE.JS / SUPABASE
// ============================================
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        
        console.log('📥 New order received:', orderData.orderNumber || 'N/A');
        
        // Validate required fields
        if (!orderData.customer && !orderData.customerName) {
            return res.status(400).json({
                success: false,
                message: 'Customer name is required'
            });
        }

        // Parse items - handle both array and string formats
        let itemsToSave = [];
        if (Array.isArray(orderData.items)) {
            itemsToSave = orderData.items;
        } else if (typeof orderData.items === 'string') {
            try {
                itemsToSave = JSON.parse(orderData.items);
            } catch (e) {
                itemsToSave = [{name: orderData.items, quantity: 1}];
            }
        }
        
        // Save to Supabase (auto-generates UUID)
        const { data: savedOrder, error: dbError } = await supabase
            .from('orders')
            .insert([{
                order_number: orderData.orderNumber || `EM${Date.now()}`,
                customer_name: orderData.customer || orderData.customerName,
                phone_number: orderData.phone || orderData.phoneNumber || '',
                order_source: orderData.source || 'phone',
                order_items: JSON.stringify(itemsToSave),
                promise_time: orderData.promiseTime || 20,
                status: 'new'
            }])
            .select()
            .single();
        
        if (dbError) {
            console.error('❌ Database error:', dbError.message);
            return res.status(500).json({
                success: false,
                message: dbError.message
            });
        }
        
        console.log('✅ Saved to database:', savedOrder.id);
        
        // Broadcast to all KDS displays - NEW FORMAT
        const kdsOrder = {
            id: savedOrder.id,
            orderNumber: savedOrder.order_number,
            customer: savedOrder.customer_name,
            phone: savedOrder.phone_number,
            source: savedOrder.order_source,
            items: JSON.parse(savedOrder.order_items),
            promiseTime: savedOrder.promise_time,
            status: savedOrder.status,
            createdAt: savedOrder.created_at
        };
        
        io.emit('new_order', kdsOrder);
        console.log('📡 Broadcast new_order:', savedOrder.id);
        
        res.json({
            success: true,
            message: 'Order created',
            order: kdsOrder
        });
        
    } catch (error) {
        console.error('❌ Create order error:', error.message);
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
        
        if (status) {
            const statuses = status.split(',');
            query = query.in('status', statuses);
        }
        
        if (source) {
            query = query.eq('order_source', source);
        }
        
        const { data: orders, error } = await query;
        
        if (error) {
            console.error('❌ Query error:', error.message);
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        
        console.log(`✅ Fetched ${orders.length} orders`);
        
        res.json({
            success: true,
            count: orders.length,
            orders: orders
        });
        
    } catch (error) {
        console.error('❌ Get orders error:', error.message);
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
        const { orderId } = req.params;
        const { status } = req.body;
        
        // Validate status
        const validStatuses = ['new', 'preparing', 'ready', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        console.log(`📝 Updating ${orderId} to ${status}`);
        
        const { data: updatedOrder, error: dbError } = await supabase
            .from('orders')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();
        
        if (dbError) {
            console.error('❌ Update failed:', dbError.message);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Broadcast to all KDS displays
        io.emit('order_updated', {
            orderId: orderId,
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        console.log(`✅ Updated ${updatedOrder.order_number} to ${status}`);
        
        res.json({
            success: true,
            message: 'Status updated',
            order: updatedOrder
        });
        
    } catch (error) {
        console.error('❌ Update error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// SOCKET.IO
// ============================================
io.on('connection', (socket) => {
    console.log('✅ KDS connected:', socket.id);
    console.log('📊 Active connections:', io.engine.clientsCount);
    
    socket.on('disconnect', () => {
        console.log('🔴 KDS disconnected:', socket.id);
        console.log('📊 Active connections:', io.engine.clientsCount);
    });
});

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 Socket.io ready`);
    console.log(`📡 Events: new_order, new-kds-order, order_updated`);
});