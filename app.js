import { db, auth } from './db-config.js'; 

// --- STATE ---
let storeId = localStorage.getItem('store_id');
let shiftId = localStorage.getItem('shift_id');
let cart = []; 
let allProductsList = []; 
let currentTransaction = {}; 
let currentMethod = 'cash'; 
let globalDiscount = 0; 
let storeConfig = { 
    store_name: "CUAN-IN", 
    store_address: "Alamat Toko", 
    store_footer: "Terima Kasih",
    tax_rate: 0, 
    service_rate: 0 
};
let selectedProductForVariant = null;

// --- DOM ELEMENTS ---
const els = {
    menu: document.getElementById('daftar-menu'),
    cart: document.getElementById('cart-items'),
    totalDisplay: document.getElementById('btn-total'),
    modalPay: document.getElementById('modal-payment'),
    modalShift: document.getElementById('modal-shift'),
    modalVar: document.getElementById('modal-variant'),
    modalStruk: document.getElementById('modal-struk')
};

// --- INIT ---
async function init() {
    if(!storeId) window.location.href = 'login.html';
    
    // 1. Cek Shift Aktif
    const { data: shift } = await db.from('shifts')
        .select('*')
        .eq('store_id', storeId)
        .eq('user_id', (await auth.getUser()).data.user.id)
        .eq('status', 'open')
        .single();
    
    if(shift) {
        shiftId = shift.id;
        localStorage.setItem('shift_id', shift.id);
        loadConfig().then(() => fetchMenu()); 
    } else {
        showShiftModal('open');
    }
}

async function loadConfig() {
    const { data } = await db.from('settings').select('*').eq('store_id', storeId).single();
    if (data) storeConfig = data;
}

// --- SHIFT LOGIC ---
function showShiftModal(mode) {
    els.modalShift.style.display = 'flex';
    if(mode === 'open') {
        document.getElementById('shift-title').innerText = "☀️ Buka Kasir";
        document.getElementById('shift-desc').innerText = "Masukkan modal awal (uang di laci)";
        document.getElementById('btn-shift-action').innerText = "BUKA KASIR";
        document.getElementById('btn-shift-action').onclick = () => openShift();
    } else {
        document.getElementById('shift-title').innerText = "🌙 Tutup Kasir";
        document.getElementById('shift-desc').innerText = "Hitung uang fisik di laci saat ini";
        document.getElementById('btn-shift-action').innerText = "TUTUP & LOGOUT";
        document.getElementById('btn-shift-action').onclick = () => closeShift();
        
        db.from('shifts').select('expected_cash').eq('id', shiftId).single().then(({data}) => {
            const exp = document.getElementById('shift-expected');
            exp.style.display = 'block';
            exp.innerText = "Sistem: Rp " + (data.expected_cash||0).toLocaleString();
        });
    }
}

async function openShift() {
    const startCash = Number(document.getElementById('shift-input').value);
    const uid = (await auth.getUser()).data.user.id;
    const { data, error } = await db.from('shifts').insert({
        store_id: storeId, user_id: uid, start_cash: startCash, expected_cash: startCash, status: 'open'
    }).select().single();

    if(error) return alert("Gagal: " + error.message);
    shiftId = data.id; localStorage.setItem('shift_id', data.id);
    els.modalShift.style.display = 'none';
    loadConfig().then(() => fetchMenu());
}

async function closeShift() {
    const endCash = Number(document.getElementById('shift-input').value);
    await db.from('shifts').update({ end_cash: endCash, end_time: new Date(), status: 'closed' }).eq('id', shiftId);
    await auth.signOut(); localStorage.clear(); window.location.href = 'login.html';
}

window.logout = () => showShiftModal('close');

// --- MENU & VARIANTS ---
async function fetchMenu() {
    const { data } = await db.from('products').select('*').eq('store_id', storeId).order('id');
    allProductsList = data || [];
    window.filterMenu('all', document.querySelector('.cat-btn'));
}

window.filterMenu = (cat, btn) => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    
    els.menu.innerHTML = "";
    const list = cat === 'all' ? allProductsList : allProductsList.filter(p => p.category === cat);
    
    list.forEach(p => {
        const hasVar = p.variants && p.variants.length > 0;
        els.menu.innerHTML += `
            <div class="card" onclick='handleClickProduct(${JSON.stringify(p)})'>
                <h3>${p.name} ${hasVar ? '<span style="font-size:10px; background:#764ba2; padding:2px 5px; border-radius:4px;">Varian</span>' : ''}</h3>
                <div class="price">Rp ${p.price.toLocaleString()}</div>
            </div>`;
    });
}

window.handleClickProduct = (p) => {
    if (typeof p === 'string') p = JSON.parse(p); 

    if (p.variants && p.variants.length > 0) {
        selectedProductForVariant = p;
        const vList = document.getElementById('variant-list');
        vList.innerHTML = "";
        p.variants.forEach((v, idx) => {
            vList.innerHTML += `<button class="var-btn" onclick="selectVariant(${idx})">${v.name} (+${v.price})</button>`;
        });
        els.modalVar.style.display = 'flex';
    } else {
        addToCart(p, null);
    }
};

window.selectVariant = (idx) => {
    const variant = selectedProductForVariant.variants[idx];
    addToCart(selectedProductForVariant, variant);
    els.modalVar.style.display = 'none';
};

// --- CART ---
function addToCart(p, variant) {
    const uniqueId = p.id + (variant ? '-' + variant.name : '');
    const price = p.price + (variant ? variant.price : 0);
    const name = p.name + (variant ? ` (${variant.name})` : '');
    
    const exist = cart.find(c => c.uniqueId === uniqueId);
    if(exist) exist.qty++;
    else cart.push({ uniqueId, productId: p.id, name, price, qty: 1 });
    updateCartUI();
}

window.changeQty = (uid, delta) => {
    const item = cart.find(c => c.uniqueId === uid);
    if(!item) return;
    item.qty += delta;
    if(item.qty <= 0) cart = cart.filter(c => c.uniqueId !== uid);
    updateCartUI();
}

window.clearCart = () => { cart = []; updateCartUI(); };

function updateCartUI() {
    els.cart.innerHTML = "";
    let subtotal = 0;
    
    // Render Cart Items
    cart.forEach(c => {
        subtotal += c.price * c.qty;
        els.cart.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info"><span class="cart-item-name">${c.name}</span><span style="font-size:12px; color:#aaa;">@${c.price.toLocaleString()}</span></div>
                <div class="qty-controls">
                    <button class="btn-qty red" onclick="changeQty('${c.uniqueId}', -1)">-</button>
                    <b>${c.qty}</b>
                    <button class="btn-qty" onclick="changeQty('${c.uniqueId}', 1)">+</button>
                </div>
                <b>${(c.price*c.qty).toLocaleString()}</b>
            </div>`;
    });

    // --- HITUNG TAX & SERVICE ---
    const taxRate = storeConfig.tax_rate || 0;
    const serviceRate = storeConfig.service_rate || 0;
    
    const tax = Math.round(subtotal * (taxRate / 100));
    const service = Math.round(subtotal * (serviceRate / 100));
    const grand = Math.ceil(subtotal + tax + service);

    // --- TAMPILKAN RINCIAN DI KASIR ---
    const detailHtml = `
        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
            <span>Subtotal</span><span>Rp ${subtotal.toLocaleString()}</span>
        </div>
        ${tax > 0 ? `<div style="display:flex; justify-content:space-between; font-size:12px; color:#aaa;"><span>Tax (${taxRate}%)</span><span>Rp ${tax.toLocaleString()}</span></div>` : ''}
        ${service > 0 ? `<div style="display:flex; justify-content:space-between; font-size:12px; color:#aaa;"><span>Service (${serviceRate}%)</span><span>Rp ${service.toLocaleString()}</span></div>` : ''}
    `;

    document.getElementById('total-price').innerHTML = detailHtml;
    els.totalDisplay.innerText = "Rp " + grand.toLocaleString();
    document.getElementById('btn-checkout').disabled = cart.length === 0;
    
    // Update Mobile Bar
    const mob = document.getElementById('mobile-total-display');
    if(mob) mob.innerText = "Rp " + grand.toLocaleString();
    if(cart.length > 0 && window.innerWidth <= 768) document.getElementById('mobile-cart-bar').style.display = 'flex';
    else document.getElementById('mobile-cart-bar').style.display = 'none';

    currentTransaction = { 
        subtotal, tax, service, grand_total: grand, items: cart 
    };
}

// --- PAYMENT ---
document.getElementById('btn-checkout').onclick = () => {
    const name = document.getElementById('cust-name').value;
    if(!name) return alert("Isi Nama Pelanggan!");
    currentTransaction.customer_name = name;
    currentTransaction.table_number = document.getElementById('table-num').value || '-';
    currentTransaction.order_type = document.getElementById('order-type').value;
    
    document.getElementById('pay-total-display').innerText = "Rp " + currentTransaction.grand_total.toLocaleString();
    window.setPaymentMethod('cash');
    els.modalPay.style.display = 'flex';
};

// --- EDC LOGIC ---
window.updateEdcCode = () => {
    const bank = document.getElementById('edc-bank').value;
    const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const datePart = new Date().toISOString().slice(2,10).replace(/-/g,'');
    document.getElementById('edc-code').value = `REF-${bank}-${datePart}-${rnd}`;
};

window.setPaymentMethod = (m) => {
    currentMethod = m;
    ['btn-cash','btn-qris','btn-edc'].forEach(id => document.getElementById(id).style.background = 'var(--bg-main)');
    document.getElementById('btn-'+m).style.background = 'rgba(0,255,136,0.2)';
    
    document.getElementById('area-cash').style.display = m === 'cash' ? 'block' : 'none';
    document.getElementById('area-qris').style.display = m === 'qris' ? 'block' : 'none';
    document.getElementById('area-edc').style.display = m === 'edc' ? 'block' : 'none';

    // Generate Code if EDC
    if(m === 'edc') window.updateEdcCode();
};

window.calcChange = (el) => {
    const val = Number(el.value.replace(/\D/g,''));
    el.value = val.toLocaleString('id-ID');
    const change = val - currentTransaction.grand_total;
    document.getElementById('pay-change').innerText = change >= 0 ? "Rp "+change.toLocaleString() : "Kurang!";
};

window.fastCash = (amt) => {
    const val = amt === 'pas' ? currentTransaction.grand_total : amt;
    document.getElementById('pay-input').value = val.toLocaleString('id-ID');
    window.calcChange(document.getElementById('pay-input'));
};

window.processFinalPayment = async () => {
    const payVal = Number(document.getElementById('pay-input').value.replace(/\./g,''));
    if(currentMethod === 'cash' && payVal < currentTransaction.grand_total) return alert("Uang Kurang!");

    const finalPay = currentMethod === 'cash' ? payVal : currentTransaction.grand_total;
    const finalChange = currentMethod === 'cash' ? (payVal - currentTransaction.grand_total) : 0;

    // Menyiapkan Nama Metode Pembayaran untuk Database
    let methodToSave = currentMethod.toUpperCase();
    if(currentMethod === 'edc') {
        const bank = document.getElementById('edc-bank').value;
        const code = document.getElementById('edc-code').value;
        methodToSave = `EDC ${bank} (${code})`;
    }

    // Update Transaction Object for Receipt
    currentTransaction.payment_method = methodToSave;
    currentTransaction.amount_received = finalPay;
    currentTransaction.change_amount = finalChange;

    // Save Order
    const { data: order, error } = await db.from('orders').insert({
        store_id: storeId,
        order_number: "INV-" + Date.now().toString().slice(-6),
        customer_name: currentTransaction.customer_name,
        table_number: currentTransaction.table_number,
        order_type: currentTransaction.order_type,
        subtotal: currentTransaction.subtotal,
        tax: currentTransaction.tax,
        service: currentTransaction.service,
        grand_total: currentTransaction.grand_total,
        payment_method: methodToSave,
        amount_received: finalPay,
        change_amount: finalChange,
        status: 'paid'
    }).select().single();

    if(error) return alert(error.message);

    // Save Items & Update Stock
    for(const item of currentTransaction.items) {
        await db.from('order_items').insert({
            order_id: order.id,
            product_id: item.productId,
            product_name: item.name,
            qty: item.qty,
            price_at_purchase: item.price,
            subtotal: item.price * item.qty
        });
        
        const {data:prod} = await db.from('products').select('stock').eq('id', item.productId).single();
        if(prod) await db.from('products').update({stock: prod.stock - item.qty}).eq('id', item.productId);
    }

    // Update Shift Cash (Only if Cash)
    if(currentMethod === 'cash') {
        const { data: s } = await db.from('shifts').select('expected_cash').eq('id', shiftId).single();
        await db.from('shifts').update({ expected_cash: s.expected_cash + currentTransaction.grand_total }).eq('id', shiftId);
    }

    // Show Struk
    els.modalPay.style.display = 'none';
    renderStruk(order);
    els.modalStruk.style.display = 'flex';
    cart = []; updateCartUI();
};

function renderStruk(o) {
    // 1. Header Struk
    const headerHtml = `
        <div style="border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px; text-align:center;">
            <h3 style="margin:0;">${storeConfig.store_name}</h3>
            <p style="margin:0; font-size:10px;">${storeConfig.store_address}</p>
            <br>
            <div style="display:flex; justify-content:space-between; font-size:10px;">
                <span>NO: ${o.order_number}</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div style="text-align:left; font-size:10px;">Pelanggan: ${o.customer_name}</div>
        </div>
    `;

    // 2. Isi Item
    let itemsHtml = '';
    currentTransaction.items.forEach(i => {
        itemsHtml += `
            <div style="display:flex; justify-content:space-between; font-size:12px;">
                <span>${i.qty}x ${i.name}</span>
                <span>${(i.price * i.qty).toLocaleString()}</span>
            </div>`;
    });

    // 3. Rincian Harga (Tax, Service, Total)
    const taxHtml = o.tax > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Tax</span><span>${o.tax.toLocaleString()}</span></div>` : '';
    const servHtml = o.service > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Service</span><span>${o.service.toLocaleString()}</span></div>` : '';

    const footerHtml = `
        <div style="border-top:1px dashed #000; margin-top:10px; padding-top:5px; font-size:12px;">
            <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>${o.subtotal.toLocaleString()}</span></div>
            ${taxHtml}
            ${servHtml}
            <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:14px; margin:5px 0;">
                <span>TOTAL</span><span>Rp ${o.grand_total.toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between;"><span>Metode</span><span>${o.payment_method}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Bayar</span><span>${o.amount_received.toLocaleString()}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Kembali</span><span>${o.change_amount.toLocaleString()}</span></div>
        </div>
        <div style="text-align:center; margin-top:15px; font-size:10px;">${storeConfig.store_footer}</div>
    `;

    // Gabungkan ke Modal
    const modalBox = document.querySelector('#modal-struk .modal-box');
    modalBox.innerHTML = `
        ${headerHtml}
        ${itemsHtml}
        ${footerHtml}
        <button onclick="window.print()" style="width:100%; padding:10px; background:#333; color:white; border:none; margin-top:20px;">PRINT</button>
        <button onclick="document.getElementById('modal-struk').style.display='none'" style="width:100%; padding:10px; border:1px solid red; color:red; margin-top:5px; background:white;">TUTUP</button>
    `;
}

// Start
init();