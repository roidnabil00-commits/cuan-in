import { db } from './db-config.js'; 

// --- ELEMEN HTML ---
const daftarMenuEl = document.getElementById('daftar-menu');
const cartItemsEl = document.getElementById('cart-items');
const totalPriceEl = document.getElementById('total-price');
const btnCheckout = document.getElementById('btn-checkout');
const btnTotalLabel = document.getElementById('btn-total'); 
const subtotalEl = document.getElementById('total-price'); 

// --- MODAL ---
const modalPayment = document.getElementById('modal-payment');
const payTotalDisplay = document.getElementById('pay-total-display');
const payInput = document.getElementById('pay-input');
const payChange = document.getElementById('pay-change');
const areaCash = document.getElementById('area-cash');
const areaQris = document.getElementById('area-qris');
const areaEdc = document.getElementById('area-edc');
const btnCash = document.getElementById('btn-cash');
const btnQris = document.getElementById('btn-qris');
const btnEdc = document.getElementById('btn-edc');

const modalStruk = document.getElementById('modal-struk');
const strukContent = document.getElementById('struk-content');
// const strukTotal = document.getElementById('struk-total-price'); // SAYA HAPUS KARENA SUDAH TIDAK DIPAKAI
const strukDate = document.getElementById('struk-date');
const strukId = document.getElementById('struk-id');
const btnTutupStruk = document.getElementById('btn-tutup-struk');

// --- DATA ---
let cart = []; 
let productsCache = {}; 
let allProductsList = []; 
let storeConfig = { tax_rate: 0, service_rate: 0, store_name: "CUAN-IN", store_address: "Loading...", store_footer: "Terima Kasih" };
let currentTransaction = {}; 
let currentMethod = 'cash'; 
let activeCategory = 'all';
let globalDiscount = 0; 

// --- LOAD CONFIG ---
async function loadConfig() {
    try {
        const { data } = await db.from('settings').select('*').single();
        if (data) storeConfig = data;
    } catch (e) { console.error("Config Error:", e); }
}
loadConfig();

// --- 1. MENU LOGIC ---
async function fetchMenu() {
    const { data, error } = await db.from('products').select('*').order('id', { ascending: true });
    if (error) return alert("Gagal ambil menu: " + error.message);

    allProductsList = data || []; 
    productsCache = {};
    allProductsList.forEach(item => productsCache[item.id] = item);
    renderMenu(activeCategory);
}

db.channel('public:products').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchMenu()).subscribe();
fetchMenu(); 

window.filterMenu = (kategori, btnElement) => {
    activeCategory = kategori;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    renderMenu(kategori);
}

function renderMenu(kategori) {
    if(!daftarMenuEl) return;
    daftarMenuEl.innerHTML = "";
    const filtered = kategori === 'all' ? allProductsList : allProductsList.filter(p => p.category === kategori);

    if(filtered.length === 0) return daftarMenuEl.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#888;">Menu Kosong.</p>`;

    filtered.forEach(data => {
        const stock = data.stock !== undefined ? data.stock : 0;
        const isHabis = stock <= 0;
        const disc = data.discount_percent || 0;
        const finalPrice = data.price - (data.price * disc / 100);

        let priceHtml = `<div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>`;
        let badgeHtml = '';

        if(disc > 0) {
            priceHtml = `<div style="font-size:11px; text-decoration:line-through; color:#888;">Rp ${data.price.toLocaleString('id-ID')}</div><div class="price" style="color:#ff4757;">Rp ${finalPrice.toLocaleString('id-ID')}</div>`;
            badgeHtml = `<div style="position:absolute; top:10px; left:10px; background:#ff4757; color:white; font-size:10px; padding:2px 8px; border-radius:10px; font-weight:bold;">-${disc}%</div>`;
        }

        const card = document.createElement('div');
        card.className = 'card';
        if(isHabis) { card.style.opacity = "0.5"; card.style.background = "rgba(0,0,0,0.5)"; }
        
        card.innerHTML = `${badgeHtml}<h3>${data.name}</h3>${isHabis ? "<span style='color:#ff4757; font-size:12px; font-weight:bold;'>HABIS</span>" : `<span style='color:#a0aec0; font-size:12px;'>Stok: ${stock}</span>`}${priceHtml}`;
        
        if (!isHabis) card.addEventListener('click', () => window.addToCart(data.id));
        daftarMenuEl.appendChild(card);
    });
}

// --- CART LOGIC ---
window.addToCart = (id) => {
    const product = productsCache[id];
    if (!product) return;
    const item = cart.find(i => i.id === id);
    const disc = product.discount_percent || 0;
    const realPrice = product.price - (product.price * disc / 100);

    if ((item ? item.qty : 0) + 1 > product.stock) return alert("Stok habis!");
    
    if (item) item.qty++;
    else cart.push({ id, name: product.name, price: realPrice, original_price: product.price, qty: 1 });
    updateCartUI();
}

window.changeQty = (id, delta) => {
    const numId = Number(id);
    const idx = cart.findIndex(i => i.id === numId);
    if (idx === -1) return;
    const newQty = cart[idx].qty + delta;
    if (newQty <= 0) cart.splice(idx, 1);
    else if (delta > 0 && newQty > productsCache[numId].stock) return alert("Stok mentok!");
    else cart[idx].qty = newQty;
    updateCartUI();
}

window.clearCart = () => { if(confirm("Hapus semua?")) { cart = []; globalDiscount = 0; updateCartUI(); } }

window.setGlobalDiscount = (val) => { globalDiscount = Number(val); updateCartUI(); }

function updateCartUI() {
    cartItemsEl.innerHTML = "";
    if (cart.length === 0) {
        btnCheckout.disabled = true; subtotalEl.innerHTML = "Subtotal: 0"; btnTotalLabel.innerText = "Rp 0";
        return cartItemsEl.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.3); margin-top:50px;">Belum ada pesanan</div>`;
    }

    let subtotal = 0;
    cart.forEach(item => {
        subtotal += item.price * item.qty;
        cartItemsEl.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info"><span class="cart-item-name">${item.name}</span><span class="cart-item-price">@${item.price.toLocaleString('id-ID')}</span></div>
                <div class="qty-controls"><button class="btn-qty red" onclick="changeQty('${item.id}', -1)">${item.qty===1?'🗑️':'-'}</button><span style="color:white; font-weight:bold;">${item.qty}</span><button class="btn-qty" onclick="changeQty('${item.id}', 1)">+</button></div>
                <div style="font-weight:bold; margin-left:10px; color:white;">${(item.price*item.qty).toLocaleString('id-ID')}</div>
            </div>`;
    });

     let discountAmount = 0;
    if(globalDiscount > 0) {
        discountAmount = subtotal * (globalDiscount / 100);
    }
    const subtotalAfterDisc = subtotal - discountAmount;

    // 2. Hitung Pajak & Service (Dari harga setelah diskon)
    const tax = subtotalAfterDisc * ((storeConfig.tax_rate || 0) / 100);
    const service = subtotalAfterDisc * ((storeConfig.service_rate || 0) / 100);

    // 3. Total Akhir
    let grand = subtotalAfterDisc + tax + service;

    subtotalEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Subtotal</span><span>${subtotal.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; border-top:1px dashed #555; padding-top:5px;">
            <select onchange="setGlobalDiscount(this.value)" style="background:#0f3460; color:white; border:none; border-radius:5px; padding:2px; font-size:12px;">
                <option value="0" ${globalDiscount===0?'selected':''}>🎟️ Promo (None)</option>
                <option value="5" ${globalDiscount===5?'selected':''}>Diskon 5%</option>
                <option value="10" ${globalDiscount===10?'selected':''}>Diskon 10%</option>
                <option value="20" ${globalDiscount===20?'selected':''}>Diskon 20%</option>
                <option value="50" ${globalDiscount===50?'selected':''}>Diskon 50%</option>
            </select>
            <span style="color:${globalDiscount>0?'#ff4757':'#aaa'}">-${discountAmount.toLocaleString('id-ID')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px; margin-top:5px;"><span>Total</span><span>Rp ${grand.toLocaleString('id-ID')}</span></div>
    `;
    
    btnTotalLabel.innerText = "Rp " + grand.toLocaleString('id-ID');
    btnCheckout.disabled = false;

    currentTransaction = { subtotal, tax, service, discount_amount: discountAmount, grand_total: Math.ceil(grand), items: cart };
}

const cleanNum = (val) => Number(String(val).replace(/\./g, "").replace(/,/g, ""));
const formatNum = (num) => new Intl.NumberFormat('id-ID').format(num);

window.toggleTableInput = () => {
    const type = document.getElementById('order-type').value;
    const tableInput = document.getElementById('table-num');
    if (type === 'takeaway') { tableInput.value = ''; tableInput.disabled = true; tableInput.placeholder = "X"; } 
    else { tableInput.disabled = false; tableInput.placeholder = "No. Meja"; }
}

btnCheckout.addEventListener('click', () => {
    const custName = document.getElementById('cust-name').value.trim();
    const tableNum = document.getElementById('table-num').value.trim();
    if (!custName) return alert("Isi nama pelanggan!");
    
    currentTransaction.customer_name = custName;
    currentTransaction.table_number = tableNum;
    currentTransaction.order_type = document.getElementById('order-type').value;

    payTotalDisplay.innerText = "Rp " + formatNum(currentTransaction.grand_total); 
    payInput.value = ""; payChange.innerText = "Rp 0";
    window.setPaymentMethod('cash'); modalPayment.style.display = "flex"; 
});

window.setPaymentMethod = (method) => {
    currentMethod = method;
    [btnCash, btnQris, btnEdc].forEach(btn => { btn.style.borderColor = 'rgba(255,255,255,0.2)'; btn.style.color = '#ccc'; btn.style.background = 'var(--bg-main)'; });
    const activeBtn = method === 'cash' ? btnCash : (method === 'qris' ? btnQris : btnEdc);
    activeBtn.style.borderColor = 'var(--accent-green)'; activeBtn.style.color = 'var(--accent-green)'; activeBtn.style.background = 'rgba(0,255,136,0.1)';
    areaCash.style.display = method === 'cash' ? 'block' : 'none'; areaQris.style.display = method === 'qris' ? 'block' : 'none'; areaEdc.style.display = method === 'edc' ? 'block' : 'none';
};

window.calcChange = (input) => {
    if(input) input.value = formatNum(input.value.replace(/\D/g, ""));
    const received = cleanNum(payInput.value);
    const change = received - currentTransaction.grand_total;
    payChange.innerText = received >= currentTransaction.grand_total ? "Rp " + formatNum(change) : "Kurang: Rp " + formatNum(Math.abs(change));
};

window.fastCash = (amt) => { payInput.value = formatNum(amt === 'pas' ? currentTransaction.grand_total : amt); window.calcChange(); };
window.closePayment = () => modalPayment.style.display = "none";

window.processFinalPayment = async () => {
    const received = cleanNum(payInput.value);
    if (currentMethod === 'cash' && received < currentTransaction.grand_total) return alert("Uang kurang!");
    if (!confirm("Proses bayar?")) return;

    try {
        const { data: orderData, error } = await db.from('orders').insert({
            order_number: "INV-" + Date.now(),
            customer_name: currentTransaction.customer_name,
            table_number: currentTransaction.table_number,
            order_type: currentTransaction.order_type,
            subtotal: currentTransaction.subtotal,
            tax: currentTransaction.tax,
            service: currentTransaction.service,
            discount_amount: currentTransaction.discount_amount, // SAVE DISKON
            grand_total: currentTransaction.grand_total,
            payment_method: currentMethod,
            amount_received: (currentMethod === 'cash' ? received : currentTransaction.grand_total),
            change_amount: (currentMethod === 'cash' ? (received - currentTransaction.grand_total) : 0),
            status: 'paid'
        }).select().single();

        if (error) throw error;

        for (const item of currentTransaction.items) {
            await db.from('order_items').insert({ order_id: orderData.id, product_id: item.id, product_name: item.name, price_at_purchase: item.price, qty: item.qty, subtotal: item.price * item.qty });
            const currStock = productsCache[item.id].stock;
            await db.from('products').update({ stock: currStock - item.qty }).eq('id', item.id);
        }

        modalPayment.style.display = "none"; 
        renderStruk({...currentTransaction, ...orderData}); 
        modalStruk.style.display = "flex"; 
        document.getElementById('cust-name').value = ""; document.getElementById('table-num').value = "";
        cart = []; globalDiscount = 0; updateCartUI(); 
    } catch (e) { alert("Error: " + e.message); }
};

// --- RENDER STRUK (ADA DISKON & FIXED TOTAL) ---
function renderStruk(data) {
    document.querySelector('.struk-header h2').innerText = storeConfig.store_name;
    document.querySelector('.struk-header p').innerText = storeConfig.store_address;
    document.querySelector('.struk-footer p:first-child').innerText = storeConfig.store_footer;
    strukDate.innerText = new Date().toLocaleString('id-ID'); 
    strukId.innerText = ""; 

    let itemsHtml = '';
    data.items.forEach(i => {
        itemsHtml += `<div class="struk-item"><span>${i.qty}x ${i.name}</span><span>${(i.price * i.qty).toLocaleString('id-ID')}</span></div>`;
    });

    // Baris Diskon
    let discountRow = "";
    if(data.discount_amount > 0) {
        discountRow = `<div class="struk-item" style="color:black;"><span>Diskon</span><span>-${data.discount_amount.toLocaleString('id-ID')}</span></div>`;
    }

    strukContent.innerHTML = `
        <div style="text-align:center; margin-bottom:10px; padding-bottom:10px; border-bottom:2px dashed #000;">
            <h3 style="margin:0; font-size:16px;">${data.order_number}</h3>
            <span style="font-size:10px;">${data.customer_name} / ${data.order_type}</span>
        </div>
        <div style="margin-bottom:10px;">${itemsHtml}</div>
        <hr style="border-top:1px dashed #000; margin:10px 0;">
        <div class="struk-item"><span>Subtotal</span><span>${data.subtotal.toLocaleString('id-ID')}</span></div>
        ${discountRow}
        <div class="struk-item" style="font-weight:bold; font-size:16px; margin-top:5px; border-top:1px solid #000; padding-top:5px;">
            <span>TOTAL</span><span>Rp ${data.grand_total.toLocaleString('id-ID')}</span>
        </div>
        <div style="margin-top:10px; font-size:11px;">
            <div class="struk-item"><span>Bayar (${data.payment_method})</span><span>${data.amount_received.toLocaleString('id-ID')}</span></div>
            <div class="struk-item"><span>Kembali</span><span>${data.change_amount.toLocaleString('id-ID')}</span></div>
        </div>
    `;
    
    // Saya hapus baris yang dulu mereset elemen 'struk-total-price'
    // karena elemen itu sudah dihapus dari HTML
}

if (btnTutupStruk) btnTutupStruk.addEventListener('click', () => { modalStruk.style.display = "none"; });