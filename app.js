import { db } from './db-config.js'; 

// --- ELEMEN HTML UTAMA ---
const daftarMenuEl = document.getElementById('daftar-menu');
const cartItemsEl = document.getElementById('cart-items');
const totalPriceEl = document.getElementById('total-price');
const btnCheckout = document.getElementById('btn-checkout');
const btnTotalLabel = document.getElementById('btn-total'); 

// --- ELEMEN PAYMENT MODAL ---
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

// --- ELEMEN STRUK ---
const modalStruk = document.getElementById('modal-struk');
const strukContent = document.getElementById('struk-content');
const strukTotal = document.getElementById('struk-total-price');
const strukDate = document.getElementById('struk-date');
const strukId = document.getElementById('struk-id');
const btnTutupStruk = document.getElementById('btn-tutup-struk');

// --- VARIABEL GLOBAL ---
let cart = []; 
let productsCache = {}; 
let allProductsList = []; 
let storeConfig = { tax_rate: 0, service_rate: 0, store_name: "CUAN-IN", store_address: "Loading...", store_footer: "Terima Kasih" };
let currentTransaction = {}; 
let currentMethod = 'cash'; 
let activeCategory = 'all';

// --- 0. LOAD CONFIG ---
async function loadConfig() {
    try {
        const { data } = await db.from('settings').select('*').single();
        if (data) storeConfig = data;
    } catch (e) { console.error(e); }
}
loadConfig();

// --- 1. MENU LOGIC ---
async function fetchMenu() {
    const { data, error } = await db.from('products').select('*').order('id', { ascending: true });
    if (error) return;

    allProductsList = data; 
    productsCache = {};
    data.forEach(item => productsCache[item.id] = item);
    renderMenu(activeCategory);
}

// REALTIME UPDATE
db.channel('public:products').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchMenu()).subscribe();
fetchMenu();

// --- EXPOSE GLOBAL FUNCTIONS ---
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

    if(filtered.length === 0) return daftarMenuEl.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#888;">Menu kosong.</p>`;

    filtered.forEach(data => {
        const stock = data.stock !== undefined ? data.stock : 0;
        const isHabis = stock <= 0;
        const card = document.createElement('div');
        card.className = 'card';
        if(isHabis) { card.style.opacity = "0.5"; card.style.background = "rgba(0,0,0,0.5)"; }
        
        const statusText = isHabis ? "<span style='color:#ff4757; font-size:12px; font-weight:bold;'>HABIS</span>" : `<span style='color:#a0aec0; font-size:12px;'>Stok: ${stock}</span>`;
        card.innerHTML = `<h3>${data.name}</h3>${statusText}<div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>`;
        
        if (!isHabis) card.addEventListener('click', () => window.addToCart(data.id));
        daftarMenuEl.appendChild(card);
    });
}

window.addToCart = (id) => {
    const item = cart.find(i => i.id === id);
    const product = productsCache[id];
    if (!product) return;
    if ((item ? item.qty : 0) + 1 > product.stock) return alert("Stok habis!");
    
    if (item) item.qty++; else cart.push({ id, name: product.name, price: product.price, qty: 1 });
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

window.clearCart = () => { if(confirm("Hapus semua?")) { cart = []; updateCartUI(); } }

function updateCartUI() {
    cartItemsEl.innerHTML = "";
    if (cart.length === 0) {
        btnCheckout.disabled = true; totalPriceEl.innerHTML = `<div style="text-align:center; color:#555;">Siap Cuan?</div>`; btnTotalLabel.innerText = "Rp 0";
        return cartItemsEl.innerHTML = `<div style="text-align:center; color:#555; margin-top:50px;">Belum ada pesanan</div>`;
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
    
    const tax = subtotal * ((storeConfig.tax_rate || 0) / 100);
    const service = subtotal * ((storeConfig.service_rate || 0) / 100);
    const grand = subtotal + tax + service;

    totalPriceEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#ccc;"><span>Subtotal</span><span>${subtotal.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#ccc;"><span>Tax (${storeConfig.tax_rate||0}%)</span><span>${tax.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#ccc;"><span>Service (${storeConfig.service_rate||0}%)</span><span>${service.toLocaleString('id-ID')}</span></div>
    `;
    btnTotalLabel.innerText = "Rp " + grand.toLocaleString('id-ID');
    btnCheckout.disabled = false;
}

// --- PAYMENT ---
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
    const orderType = document.getElementById('order-type').value;

    if (!custName) return alert("Isi nama pelanggan!");
    if (orderType === 'dine-in' && !tableNum) return alert("Nomor meja wajib diisi!");

    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    const tax = subtotal * ((storeConfig.tax_rate||0) / 100);
    const service = subtotal * ((storeConfig.service_rate||0) / 100);
    const grand = Math.ceil(subtotal + tax + service); 

    currentTransaction = { customer_name: custName, table_number: orderType === 'takeaway' ? '' : tableNum, order_type: orderType, subtotal, tax, service, grand_total: grand, items: cart };

    payTotalDisplay.innerText = "Rp " + formatNum(grand);
    payInput.value = ""; payChange.innerText = "Rp 0";
    window.setPaymentMethod('cash'); modalPayment.style.display = "flex"; 
});

window.setPaymentMethod = (method) => {
    currentMethod = method;
    [btnCash, btnQris, btnEdc].forEach(btn => { btn.style.borderColor = 'rgba(255,255,255,0.2)'; btn.style.color = '#ccc'; btn.style.background = 'var(--bg-main)'; });
    const activeBtn = method === 'cash' ? btnCash : (method === 'qris' ? btnQris : btnEdc);
    activeBtn.style.borderColor = 'var(--accent-green)'; activeBtn.style.color = 'var(--accent-green)'; activeBtn.style.background = 'rgba(0,255,136,0.1)';
    areaCash.style.display = method === 'cash' ? 'block' : 'none';
    areaQris.style.display = method === 'qris' ? 'block' : 'none';
    areaEdc.style.display = method === 'edc' ? 'block' : 'none';
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
    } catch (e) { alert("Error: " + e.message); }
};

function renderStruk(data) {
    document.querySelector('.struk-header h2').innerText = storeConfig.store_name;
    document.querySelector('.struk-header p').innerText = storeConfig.store_address;
    document.querySelector('.struk-footer p:first-child').innerText = storeConfig.store_footer;

    const labelMeja = data.order_type === 'takeaway' ? "TAKEAWAY" : `Meja: ${data.table_number}`;
    strukContent.innerHTML = `<div style="border-bottom:1px dashed #000; padding-bottom:5px; margin-bottom:5px; font-size:12px;">${labelMeja} / <strong>${data.customer_name}</strong></div>`;
    
    data.items.forEach(i => strukContent.innerHTML += `<div class="struk-item"><span>${i.name} (${i.qty})</span><span>${(i.price*i.qty).toLocaleString('id-ID')}</span></div>`);
    
    strukContent.innerHTML += `
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <div class="struk-item"><span>Total</span><span>${data.grand_total.toLocaleString('id-ID')}</span></div>
        <div class="struk-item"><span>Bayar</span><span>${data.amount_received.toLocaleString('id-ID')}</span></div>
        <div class="struk-item"><span>Kembali</span><span>${data.change_amount.toLocaleString('id-ID')}</span></div>
    `;
    strukTotal.innerText = "Rp " + data.grand_total.toLocaleString('id-ID'); 
    strukDate.innerText = new Date().toLocaleString('id-ID');
    strukId.innerText = data.order_number;
}

if (btnTutupStruk) btnTutupStruk.addEventListener('click', () => { modalStruk.style.display = "none"; cart = []; updateCartUI(); });