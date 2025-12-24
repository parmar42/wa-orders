// ============================================
// CONFIGURATION
// ============================================
const USE_APPS_SCRIPT = true;   
const USE_NODEJS = true; // Set to true to test your Node.js server
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyCGM8lBnjEMy6-kHEbzg5BywiTSAcwKrcZNQgUgWykUfvXXO34ZE7yOg1IWBGHB537kg/exec';

const NODEJS_URL = '/submit-order';
const WHATSAPP_NUMBER = '12461234567';

let orderItems = [];
let customerWaNumber = '';

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('orderForm');
    if(form) form.setAttribute('novalidate', 'novalidate');
    
    // Category toggle
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const target = document.getElementById(targetId);
            const isShown = target.classList.contains('show');
            document.querySelectorAll('.menu-items').forEach(items => items.classList.remove('show'));
            document.querySelectorAll('.category-header').forEach(h => h.classList.remove('active'));
            if (!isShown) {
                target.classList.add('show');
                this.classList.add('active');
            }
        });
    });

    // Menu item selection
    document.querySelectorAll('.menu-item').forEach(item => {
        const checkbox = item.querySelector('.item-checkbox');
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
                item.querySelector('.qty-display').textContent = '1';
            }
            updateOrder();
        });
        item.addEventListener('click', function(e) {
            if (e.target.classList.contains('qty-btn') || e.target === checkbox) return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        });
    });

    // Quantity controls
    document.querySelectorAll('.qty-plus').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const display = this.previousElementSibling;
            let qty = parseInt(display.textContent);
            qty++;
            display.textContent = qty;
            updateOrder();
        });
    });

    document.querySelectorAll('.qty-minus').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const display = this.nextElementSibling;
            let qty = parseInt(display.textContent);
            if (qty > 1) {
                qty--;
                display.textContent = qty;
                updateOrder();
            }
        });
    });

    const orderTypeSelect = document.getElementById('orderType');
    if(orderTypeSelect) orderTypeSelect.addEventListener('change', updateOrder);
});

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

async function sendToAppsScript(formData) {
    if (!USE_APPS_SCRIPT) return { success: true, skipped: true };
    try {
        const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: formData });
        return await response.json();
    } catch (error) {
        return { success: false, message: error.message };
    }
}

async function sendToNodeJS(orderData) {
    if (!USE_NODEJS) return { success: true, skipped: true };
    try {
        const response = await fetch(NODEJS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        return await response.json();
    } catch (error) {
        return { success: false, message: error.message };
    }
}

document.getElementById('orderForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const customerName = document.getElementById('customerName').value.trim();
    const clientPhoneNumber = document.getElementById('phoneNumber').value.trim();
    const deliveryAddress = document.getElementById('deliveryAddress').value.trim();
    const orderType = document.getElementById('orderType').value;

    if (!customerName || !clientPhoneNumber) {
        alert("Please fill required fields");
        return;
    }

    const orderData = {
        customerName,
        phoneNumber: clientPhoneNumber,
        deliveryAddress,
        orderType,
        orderItems,
        totalAmount: document.querySelector('.summary-total span:last-child')?.textContent || "$0.00",
        timestamp: new Date().toISOString()
    };

    const gasFormData = new FormData();
    for (let key in orderData) {
        gasFormData.append(key, key === 'orderItems' ? JSON.stringify(orderData[key]) : orderData[key]);
    }

    document.getElementById('loading').style.display = 'block';
    try {
        const [appsScriptResult, nodejsResult] = await Promise.all([
            sendToAppsScript(gasFormData),
            sendToNodeJS(orderData)
        ]);
        document.getElementById('loading').style.display = 'none';
        showSuccessModal(appsScriptResult.orderNumber || "Order Placed");
    } catch (error) {
        document.getElementById('loading').style.display = 'none';
        alert("Submission Error: " + error.message);
    }
});

function showSuccessModal(orderNumber) {
    alert("Success! Order Number: " + orderNumber);
    window.location.reload();
}