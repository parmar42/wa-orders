const express = require('express');
const path = require('path');
const app = express();

// 1. MIDDLEWARE: This is the most important part. 
// It allows your server to read the JSON data sent by script.js
app.use(express.json()); 

// 2. SERVE STATIC FILES: Tells Node to look in the 'public' folder 
// for your index.html, style.css, and script.js
app.use(express.static('public'));

// 3. THE POST ROUTE: This is where the order data arrives
app.post('/submit-order', (req, res) => {
    // req.body now contains the orderData object from your script
    console.log("📦 Order Received from Client:");
    console.log(req.body); 

    // Eventually, you will add Supabase code here.
    // For now, we just send a success response to the browser.
    res.status(200).json({ 
        success: true, 
        message: "Order received by Node.js!",
        orderNumber: "BN-" + Math.floor(1000 + Math.random() * 9000)
    });
});

// 4. START SERVER
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});