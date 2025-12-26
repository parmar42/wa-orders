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


        
    // 2. INSERT WHATSAPP SERVICE MESSAGE LOGIC HERE
    /*const whatsappUrl = `https://graph.facebook.com/v24.0/${process.env.PHONE_NUMBER_ID}/messages`;
    
    try {
        await axios.post(whatsappUrl, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: orderData.phoneNumber, // The 'phone' field from your KDS
            type: "text",
            text: { 
                body: `✅ Confirming order #${orderData.orderNumber} for ${orderData.customerName} \n\n ${orderData.orderItems}. We are starting now!` 
            }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ Service message sent');
    } catch (error) {
        console.error('❌ WhatsApp Error:', error.response ? error.response.data : error.message);
    }

    res.sendStatus(200);
});
**/
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
      /////////////////////////////////////////////////////


// 5. START SERVER (Crucial for Render)
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);


});





/*const axios = require('axios');

// Configuration - Use Environment Variables on Render for security!
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_VERSION = 'v21.0';

/**
 * Function to send WhatsApp notification
 * Called when the order form is filled/submitted
 
async function sendWhatsAppNotification(orderData) {
    // Construct the URL manually to avoid "Unknown path" errors
    const url = `https://graph.facebook.com/${WHATSAPP_VERSION}/${PHONE_NUMBER_ID}/messages`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: orderData.phoneNumber, // Must include country code, e.g., "1246XXXXXXX"
        type: "template",
        template: {
            name: "order_confirmation", // Replace with your approved template name
            language: { code: "en_US" },
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: orderData.customerName },
                        { type: "text", text: orderData.orderNumber.toString() }
                    ]
                }
            ]
        }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ WhatsApp message sent successfully:', response.data);
    } catch (error) {
        // Detailed error logging to catch path or permission issues
        console.error('❌ WhatsApp API Error:', error.response ? error.response.data : error.message);
    }
}
**/
// Example: Triggering when the order form is received
app.post('/submit-order', (req, res) => {
    const newOrder = req.body;
    
    // 1. Process order for KDS
    io.emit('new-kds-order', newOrder);

    // 2. Send WhatsApp Message
    //sendWhatsAppNotification(newOrder);

    res.status(200).send("Order Received");

});






