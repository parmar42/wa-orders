const { createClient } = require('@supabase/supabase-js');

// These should be set in your Render Environment Variables
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/submit-order', async (req, res) => {
    const orderData = req.body;
    const orderNumber = "EM" + Math.floor(1000 + Math.random() * 9000);

    try {
        // SAVE TO SUPABASE
        const { data, error } = await supabase
            .from('orders')
            .insert([{
                order_number: orderNumber,
                customer_name: orderData.customerName,
                phone_number: orderData.phoneNumber,
                delivery_address: orderData.deliveryAddress,
                order_type: orderData.orderType,
                order_items: orderData.orderItems, // Saves as JSON
                total_amount: orderData.totalAmount
            }]);

        if (error) throw error;

        // Success response back to your clean script
        res.status(200).json({ success: true, orderNumber });

    } catch (error) {
        console.error("Database Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});