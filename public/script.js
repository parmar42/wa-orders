// ============================================
// 1. GLOBAL CONFIGURATION
// ============================================
const NODEJS_URL = '/api/orders';
//const NODEJS_URL = '/submit-order';
const chatNumber = process.env.CHAT_NUMBER;
//const chatNumber = '12462367556'; // Your business WhatsApp number
let orderItems = [];

// Extract the 'wa_number' from the URL globally so all functions can see it
const urlParams = new URLSearchParams(window.location.search);
const waNumber = urlParams.get('wa_number'); 

// ============================================
// 2. HELPER FUNCTIONS
// ============================================

function updateOrder() {
    orderItems = [];
    let subtotal = 0;
    const summaryDiv = document.getElementById('orderSummary');
    const summaryItems = document.getElementById('summaryItems');
    const summaryCalculations = document.getElementById('summaryCalculations');
    const submitBtn = document.getElementById('submitBtn');
    const orderType = document.getElementById('orderType').value;

    document.querySelectorAll('.menu-item.selected').forEach(item => {
        const name = item.getAttribute('data-item');
        const price = parseFloat(item.getAttribute('data-price'));
        const qty = parseInt(item.querySelector('.qty-display').textContent);
        const itemSubtotal = price * qty;
        orderItems.push({ name, price, quantity: qty, subtotal: itemSubtotal });
        subtotal += itemSubtotal;
    });

    if (orderItems.length > 0) {
        summaryDiv.style.display = 'block';
        summaryItems.innerHTML = orderItems.map(item => `
            <div class="summary-item">
                <span>${item.name} × ${item.quantity}</span>
                <span>$${item.subtotal.toFixed(2)}</span>
            </div>
        `).join('');
        
        let total = orderType === 'Delivery' ? subtotal * 1.10 : subtotal;
        summaryCalculations.innerHTML = `
            <div class="summary-subtotal"><span>Subtotal:</span><span>$${subtotal.toFixed(2)}</span></div>
            ${orderType === 'Delivery' ? `<div class="summary-item"><span>Service Charge (10%):</span><span>$${(subtotal * 0.1).toFixed(2)}</span></div>` : ''}
            <div class="summary-total"><span>TOTAL:</span><span>$${total.toFixed(2)} BBD</span></div>
        `;
        submitBtn.disabled = false;
    } else {
        summaryDiv.style.display = 'none';
        submitBtn.disabled = true;
    }
}

function showSuccessModal(orderNumber, orderData) {
    const modal = document.getElementById('successModal');
    const modalNum = document.getElementById('modalOrderNumber');
    const countdownDisplay = document.getElementById('redirectCountdown');

    if (modal) {
        if (modalNum) modalNum.textContent = orderNumber;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        let countdown = 5;
        if (countdownDisplay) countdownDisplay.textContent = countdown;
        
        const interval = setInterval(() => {
            countdown--;
            if (countdownDisplay) countdownDisplay.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(interval);
                
                // Determine which number to send them back to
                // Prioritize URL wa_number, then user's input phone
                const targetPhone = waNumber || orderData.userInput;
                const cleanNumber = targetPhone.replace(/\D/g, '');

                const whatsappMsg = encodeURIComponent(
                    `*NEW ORDER: #${orderNumber}*\n` +
                    `*Customer:* ${orderData.customerName}\n` +
                    `*Total:* ${orderData.totalAmount}\n` +
                    `*Type:* ${orderNumber}`
                );
                
                window.location.href = `https://wa.me/${chatNumber}`;
            }
        }, 1000);
    }
}

// ============================================
// 3. INTERACTIVITY WRAPPER
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 System Initializing...");

    // A. Category Headers Toggle
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const target = document.getElementById(targetId);
            const isShown = target.classList.contains('show');
            
            document.querySelectorAll('.menu-items').forEach(m => m.classList.remove('show'));
            document.querySelectorAll('.category-header').forEach(h => h.classList.remove('active'));
            
            if (!isShown) {
                target.classList.add('show');
                this.classList.add('active');
            }
        });
    });

    // B. Menu Item & Quantity Selection
    document.querySelectorAll('.menu-item').forEach(item => {
        const checkbox = item.querySelector('.item-checkbox');
        
        checkbox.addEventListener('change', () => {
            item.classList.toggle('selected', checkbox.checked);
            if (!checkbox.checked) item.querySelector('.qty-display').textContent = '1';
            updateOrder();
        });

        item.addEventListener('click', (e) => {
            if (e.target.closest('.qty-btn') || e.target === checkbox) return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        });

        item.querySelector('.qty-plus').addEventListener('click', (e) => {
            e.stopPropagation();
            const display = item.querySelector('.qty-display');
            display.textContent = parseInt(display.textContent) + 1;
            updateOrder();
        });

        item.querySelector('.qty-minus').addEventListener('click', (e) => {
            e.stopPropagation();
            const display = item.querySelector('.qty-display');
            let qty = parseInt(display.textContent);
            if (qty > 1) {
                display.textContent = qty - 1;
                updateOrder();
            }
        });
    });

    const orderTypeSelect = document.getElementById('orderType');
    if (orderTypeSelect) orderTypeSelect.addEventListener('change', updateOrder);

    // D. Final Form Submission
    const orderForm = document.getElementById('orderForm');
     if (orderForm) {
        orderForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const customerName = document.getElementById('customerName').value.trim();
            const phone = document.getElementById('userInput').value.trim();
        

            if (!customerName || !phone || orderItems.length === 0) {
                alert("Please complete all required fields.");
                return;
            }

    // List of every ID your script expects to find in the HTML
    const requiredIds = [
        'customerName', 
        'userInput', 
        'orderType', 
        'loading'
    ];

    let missingAny = false;

    requiredIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            console.log(`✅ Found: ID="${id}"`);
        } else {
            console.warn(`❌ MISSING: ID="${id}" (Your HTML needs this)`);
            missingAny = true;
        }
    });

    // Check the special Query Selector for the total
    const totalEl = document.querySelector('.summary-total span:last-child');
    if (totalEl) {
        console.log(`✅ Found: Total Amount element`);
    } else {
        console.warn(`❌ MISSING: CSS Selector ".summary-total span:last-child"`);
        missingAny = true;
    }

    if (missingAny) {
        console.error("⛔ STOPPING: The script crashed because the elements above are missing.");
        alert("Developer Note: Check the F12 Console. Some HTML elements are missing.");
        return; // Stop the script here so it doesn't throw the 'null' error
    }

    console.log("🚀 All elements found! Sending data to Render...");

    // ... Rest of your fetch code ...

            const orderData = {
                customerName,
                phoneNumber: waNumber || phone, 
                userInput: phone,
                deliveryAddress: document.getElementById('deliveryAddress')?.value || 'N/A',
                orderType: document.getElementById('orderType').value,
                orderItems: orderItems,
                totalAmount: document.querySelector('.summary-total span:last-child')?.textContent || "$0.00",
                timestamp: new Date().toISOString()
            };

            document.getElementById('loading').style.display = 'block';

            try {
                const response = await fetch(NODEJS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });

                const result = await response.json();
                document.getElementById('loading').style.display = 'none';

                if (result.success) {
                    // This function now has access to orderData and the global waNumber
                    showSuccessModal(result.orderNumber || "EM" + Date.now().toString().slice(-4), orderData);
                    this.reset();
                    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('selected'));
                    updateOrder();
                } else {
                    throw new Error(result.message || "Server rejected order");
                }
            } catch (error) {
                document.getElementById('loading').style.display = 'none';
                console.error("Submission error:", error);
                alert("Order could not be processed. Please check your connection.");
            }
        });
    }

    console.log("✅ All systems go.");
});




