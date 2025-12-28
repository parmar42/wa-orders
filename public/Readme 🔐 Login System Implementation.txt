# 🔐 Login System Implementation for Tap+Serve KDS

## Overview

This guide adds a simple, secure login system to protect your KDS from unauthorized access.

---

## Option 1: Simple Password Protection (Recommended for Single Restaurant)

**Pros:** Easy to implement, no backend changes needed  
**Cons:** Single password for all users, stored in browser  

### Implementation

#### Step 1: Add Login HTML

Add this **right after `<body>` tag** in your KDS HTML:

```html
<body>
    <!-- LOGIN SCREEN -->
    <div id="loginScreen" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    ">
        <div style="
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            max-width: 400px;
            width: 90%;
        ">
            <h1 style="
                margin: 0 0 10px 0;
                font-size: 28px;
                color: #333;
                text-align: center;
            ">🍜 Tap+Serve KDS</h1>
            
            <p style="
                margin: 0 0 30px 0;
                color: #666;
                text-align: center;
                font-size: 14px;
            ">Kitchen Display System</p>
            
            <input 
                type="password" 
                id="loginPassword" 
                placeholder="Enter PIN"
                autocomplete="off"
                style="
                    width: 100%;
                    padding: 15px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 18px;
                    text-align: center;
                    letter-spacing: 8px;
                    margin-bottom: 15px;
                "
                onkeypress="if(event.key==='Enter') loginAttempt()"
            />
            
            <button 
                onclick="loginAttempt()"
                style="
                    width: 100%;
                    padding: 15px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                "
                onmouseover="this.style.background='#5568d3'"
                onmouseout="this.style.background='#667eea'"
            >
                Login
            </button>
            
            <div id="loginError" style="
                margin-top: 15px;
                color: #f44336;
                text-align: center;
                font-size: 14px;
                display: none;
            ">
                ❌ Invalid PIN. Please try again.
            </div>
        </div>
    </div>

    <!-- REST OF YOUR KDS HTML CONTINUES HERE -->
    <div class="top-header">
        ...
```

#### Step 2: Add Login JavaScript

Add this **at the very top of your `<script>` section**, before CONFIG:

```javascript
<script>
// ============================================
// LOGIN SYSTEM
// ============================================

const CORRECT_PIN = '1234';  // ← CHANGE THIS TO YOUR PIN
const SESSION_DURATION = 8 * 60 * 60 * 1000;  // 8 hours in milliseconds

function loginAttempt() {
    const inputPin = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    if (inputPin === CORRECT_PIN) {
        // Correct PIN
        const loginData = {
            authenticated: true,
            timestamp: Date.now()
        };
        
        localStorage.setItem('kds_auth', JSON.stringify(loginData));
        
        // Hide login screen
        document.getElementById('loginScreen').style.display = 'none';
        
        // Clear input
        document.getElementById('loginPassword').value = '';
        errorDiv.style.display = 'none';
        
        console.log('✅ Login successful');
        
    } else {
        // Wrong PIN
        errorDiv.style.display = 'block';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
        
        // Shake animation
        const loginScreen = document.getElementById('loginScreen').firstElementChild;
        loginScreen.style.animation = 'shake 0.5s';
        setTimeout(() => {
            loginScreen.style.animation = '';
        }, 500);
    }
}

function checkAuth() {
    const authData = localStorage.getItem('kds_auth');
    
    if (!authData) {
        // Not logged in
        return false;
    }
    
    const parsed = JSON.parse(authData);
    const now = Date.now();
    
    // Check if session expired
    if (now - parsed.timestamp > SESSION_DURATION) {
        // Session expired
        localStorage.removeItem('kds_auth');
        return false;
    }
    
    return parsed.authenticated;
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('kds_auth');
        location.reload();
    }
}

// Check authentication on page load
if (checkAuth()) {
    // Already logged in, hide login screen
    document.getElementById('loginScreen').style.display = 'none';
} else {
    // Not logged in, show login screen
    document.getElementById('loginScreen').style.display = 'flex';
    setTimeout(() => {
        document.getElementById('loginPassword').focus();
    }, 100);
}

// Add shake animation
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
        20%, 40%, 60%, 80% { transform: translateX(10px); }
    }
`;
document.head.appendChild(style);

// ============================================
// REST OF YOUR CODE CONTINUES HERE
// ============================================

const CONFIG = {
    // ... your existing config
```

#### Step 3: Add Logout Button

Update your header to include a logout button:

```javascript
<button class="icon-btn" onclick="logout()" title="Logout">
    🚪 Logout
</button>
```

---

## Option 2: Multi-User System (Better for Multiple Staff)

**Pros:** Different PINs per user, tracks who did what  
**Cons:** Requires backend changes  

### Database Setup

Add users table to Supabase:

```sql
CREATE TABLE kds_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    role TEXT DEFAULT 'staff',  -- 'admin', 'manager', 'staff'
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default admin user (PIN: 1234)
INSERT INTO kds_users (username, pin_hash, role) 
VALUES ('admin', '$2b$10$...', 'admin');  -- Use bcrypt hash
```

### Backend Endpoint

Add to `server.js`:

```javascript
// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { pin } = req.body;
        
        // Query user by PIN hash (use bcrypt to compare)
        const { data: user, error } = await supabase
            .from('kds_users')
            .select('*')
            .eq('active', true)
            .single();
        
        if (error || !user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Verify PIN with bcrypt
        const bcrypt = require('bcrypt');
        const match = await bcrypt.compare(pin, user.pin_hash);
        
        if (!match) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Generate session token
        const sessionToken = require('crypto').randomBytes(32).toString('hex');
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            },
            token: sessionToken
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
```

### Frontend Update

```javascript
async function loginAttempt() {
    const pin = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${CONFIG.NODEJS_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Store session
            localStorage.setItem('kds_session', JSON.stringify({
                user: data.user,
                token: data.token,
                timestamp: Date.now()
            }));
            
            // Hide login
            document.getElementById('loginScreen').style.display = 'none';
            
            console.log(`✅ Logged in as ${data.user.username}`);
            
        } else {
            // Show error
            document.getElementById('loginError').style.display = 'block';
        }
        
    } catch (error) {
        console.error('Login failed:', error);
        document.getElementById('loginError').style.display = 'block';
    }
}
```

---

## Option 3: Simple Hardcoded Staff PINs (Quick & Easy)

**Best for:** Small team, quick setup  

```javascript
const STAFF_PINS = {
    '1234': { name: 'Manager', role: 'admin' },
    '5678': { name: 'Cook 1', role: 'staff' },
    '9012': { name: 'Cook 2', role: 'staff' },
    '3456': { name: 'Server', role: 'staff' }
};

function loginAttempt() {
    const pin = document.getElementById('loginPassword').value;
    const user = STAFF_PINS[pin];
    
    if (user) {
        // Valid PIN
        localStorage.setItem('kds_auth', JSON.stringify({
            authenticated: true,
            user: user.name,
            role: user.role,
            timestamp: Date.now()
        }));
        
        document.getElementById('loginScreen').style.display = 'none';
        console.log(`✅ Logged in as ${user.name}`);
        
        // Show welcome message
        alert(`Welcome, ${user.name}!`);
        
    } else {
        // Invalid PIN
        document.getElementById('loginError').style.display = 'block';
        document.getElementById('loginPassword').value = '';
    }
}
```

---

## Security Best Practices

### ✅ DO:

1. **Use HTTPS** - Always serve KDS over HTTPS (Vercel/Netlify do this automatically)
2. **Session Timeout** - Auto-logout after 8 hours of inactivity
3. **Clear on Logout** - Remove all localStorage data
4. **Hash PINs** - Never store plaintext PINs in database (use bcrypt)
5. **Rate Limiting** - Add backend rate limiting for login attempts
6. **Unique PINs** - Give each staff member a unique PIN
7. **Change Regularly** - Update PINs every 3-6 months

### ❌ DON'T:

1. **Don't use admin/password** - Too common
2. **Don't share PINs** - Each person should have their own
3. **Don't store in code** - Use environment variables for production
4. **Don't disable HTTPS** - Always use secure connections
5. **Don't log PINs** - Never console.log sensitive data
6. **Don't use short PINs** - Minimum 4 digits, 6+ is better

---

## Enhanced Features

### Auto-Logout on Inactivity

```javascript
let inactivityTimer;
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;  // 30 minutes

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        alert('Session expired due to inactivity');
        logout();
    }, INACTIVITY_TIMEOUT);
}

// Reset timer on any user activity
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);

// Start timer on login
resetInactivityTimer();
```

### Show Current User

Add to your header:

```html
<div class="logo">
    <span id="currentUser" style="margin-right: 15px; color: #aaa; font-size: 12px;"></span>
    <span>🍜 EAST MOON</span>
</div>
```

```javascript
// After successful login
const authData = JSON.parse(localStorage.getItem('kds_auth'));
if (authData && authData.user) {
    document.getElementById('currentUser').textContent = `👤 ${authData.user}`;
}
```

### Audit Log

Track who changed order statuses:

```javascript
async function changeStatus(orderId, newStatus) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Get current user
    const authData = JSON.parse(localStorage.getItem('kds_auth'));
    const username = authData?.user || 'Unknown';
    
    console.log(`📝 ${username} changed ${order.orderNumber} to ${newStatus}`);
    
    // Update order with user info
    order.status = newStatus;
    order.lastUpdatedBy = username;
    order.lastUpdatedAt = new Date().toISOString();
    
    // Save to database with audit trail
    await updateOrderStatusInSupabase(order.id, newStatus, username);
    
    renderOrders();
}
```

---

## Quick Start Guide

### For Option 1 (Recommended):

1. **Copy the Login HTML** - Add after `<body>` tag
2. **Copy the Login JavaScript** - Add before CONFIG
3. **Change the PIN** - Update `CORRECT_PIN = '1234'` to your PIN
4. **Add Logout Button** - Add to header
5. **Test** - Refresh page, enter PIN, verify it works
6. **Done!** ✅

**Time to implement:** 5 minutes

---

## Testing Checklist

- [ ] Login screen appears on fresh load
- [ ] Wrong PIN shows error message
- [ ] Correct PIN hides login screen and shows KDS
- [ ] Login persists after page refresh
- [ ] Session expires after configured time
- [ ] Logout button clears session
- [ ] Multiple tabs share same session
- [ ] Login works on mobile devices

---

## Deployment Notes

### Environment Variables (Production)

Instead of hardcoding PIN in JavaScript:

```javascript
// Development
const CORRECT_PIN = '1234';  // Hardcoded for testing

// Production - Use env variable
const CORRECT_PIN = process.env.KDS_PIN || 'fallback-pin';
```

Set in Vercel/Netlify:
```
KDS_PIN=your-secure-pin
```

---

## Support

If you need help:
1. Start with **Option 1** (simplest)
2. Test locally before deploying
3. Check browser console for errors
4. Verify localStorage in DevTools → Application tab

---

**Ready to add login to your KDS?**

Choose an option and I can help you implement it! 🔐