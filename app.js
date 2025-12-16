import { db } from './firebase-config.js'; 
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, writeBatch, doc, getDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let storeConfig = { taxRate: 0, serviceRate: 0, storeName: "CUAN-IN", storeAddress: "Loading...", storeFooter: "Terima Kasih" };
let currentTransaction = {}; 
let currentMethod = 'cash'; 
let activeCategory = 'all';

// --- 0. LOAD CONFIG ---
async function loadConfig() {
    try {
        const docSnap = await getDoc(doc(db, "settings", "store_config"));
        if (docSnap.exists()) storeConfig = docSnap.data();
    } catch (e) { console.error(e); }
}
loadConfig();

// --- 1. MENU LOGIC ---
const q = query(collection(db, "products"), orderBy("created_at", "desc"));
onSnapshot(q, (snapshot) => {
    allProductsList = []; productsCache = {}; 
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const item = { ...data, id: docSnap.id };
        productsCache[docSnap.id] = item;
        allProductsList.push(item);
    });
    renderMenu(activeCategory);
});

window.filterMenu = (kategori, btnElement) => {
    activeCategory = kategori;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) {
        btnElement.classList.add('active');
    } else {
        const targetBtn = Array.from(document.querySelectorAll('.cat-btn')).find(b => b.innerText.toLowerCase().includes(kategori === 'all' ? 'semua' : kategori.toLowerCase()));
        if(targetBtn) targetBtn.classList.add('active');
    }
    renderMenu(kategori);
}

function renderMenu(kategori) {
    if(!daftarMenuEl) return;
    daftarMenuEl.innerHTML = "";
    
    const filtered = kategori === 'all' ? allProductsList : allProductsList.filter(p => p.category === kategori);

    if(filtered.length === 0) {
        daftarMenuEl.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#888;">Menu kosong.</p>`;
        return;
    }

    filtered.forEach(data => {
        const stock = data.stock !== undefined ? data.stock : 0;
        const isHabis = stock <= 0;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.opacity = isHabis ? "0.5" : "1";
        
        // --- PERBAIKAN DISINI: HAPUS BACKGROUND WHITE ---
        // Biarkan CSS yang mengatur warnanya (Navi/Dark)
        if(isHabis) card.style.background = "rgba(0,0,0,0.5)"; // Gelap kalau habis
        
        const statusText = isHabis 
            ? "<span style='color:#ff4757; font-size:12px; font-weight:bold;'>HABIS</span>" 
            : `<span style='color:#a0aec0; font-size:12px;'>Stok: ${stock}</span>`;

        card.innerHTML = `
            <h3>${data.name}</h3>
            ${statusText}
            <div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>
        `;
        if (!isHabis) card.addEventListener('click', () => addToCart(data.id));
        daftarMenuEl.appendChild(card);
    });
}

// --- 2. CART LOGIC ---
window.addToCart = (id) => {
    const item = cart.find(i => i.id === id);
    if ((item ? item.qty : 0) + 1 > productsCache[id].stock) return alert("Stok habis!");
    item ? item.qty++ : cart.push({ id, name: productsCache[id].name, price: productsCache[id].price, qty: 1 });
    updateCartUI();
}

window.changeQty = (id, delta) => {
    const idx = cart.findIndex(i => i.id === id);
    if (idx === -1) return;
    const newQty = cart[idx].qty + delta;
    if (newQty <= 0) cart.splice(idx, 1);
    else if (delta > 0 && newQty > productsCache[id].stock) return alert("Stok mentok!");
    else cart[idx].qty = newQty;
    updateCartUI();
}

window.clearCart = () => { if(confirm("Hapus semua?")) { cart = []; updateCartUI(); } }

function updateCartUI() {
    cartItemsEl.innerHTML = "";
    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.3); margin-top:50px;">Belum ada pesanan</div>`;
        btnCheckout.disabled = true; totalPriceEl.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.3);">Siap Cuan?</div>`; btnTotalLabel.innerText = "Rp 0";
        return;
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
    
    const tax = subtotal * (storeConfig.taxRate / 100);
    const service = subtotal * (storeConfig.serviceRate / 100);
    const grand = subtotal + tax + service;

    totalPriceEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#ccc;"><span>Subtotal</span><span>${subtotal.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#ccc;"><span>Tax (${storeConfig.taxRate}%)</span><span>${tax.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#ccc;"><span>Service (${storeConfig.serviceRate}%)</span><span>${service.toLocaleString('id-ID')}</span></div>
    `;
    btnTotalLabel.innerText = "Rp " + grand.toLocaleString('id-ID');
    btnCheckout.disabled = false;
}

// --- 3. PEMBAYARAN & KEMBALIAN ---
const cleanNum = (val) => Number(String(val).replace(/\./g, "").replace(/,/g, ""));
const formatNum = (num) => new Intl.NumberFormat('id-ID').format(num);

window.toggleTableInput = () => {
    const type = document.getElementById('order-type').value;
    const tableInput = document.getElementById('table-num');
    if (type === 'takeaway') {
        tableInput.value = ''; tableInput.disabled = true; tableInput.placeholder = "X"; tableInput.style.opacity = "0.5";
    } else {
        tableInput.disabled = false; tableInput.placeholder = "No. Meja"; tableInput.style.opacity = "1"; tableInput.focus();
    }
}

btnCheckout.addEventListener('click', () => {
    const custName = document.getElementById('cust-name').value.trim();
    const tableNum = document.getElementById('table-num').value.trim();
    const orderType = document.getElementById('order-type').value;

    if (!custName) return alert("⚠️ Isi nama pelanggan!");
    if (orderType === 'dine-in' && !tableNum) return alert("⚠️ Nomor meja wajib diisi!");

    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    const tax = subtotal * (storeConfig.taxRate / 100);
    const service = subtotal * (storeConfig.serviceRate / 100);
    const grand = Math.ceil(subtotal + tax + service); 

    currentTransaction = {
        customer_name: custName,
        table_number: orderType === 'takeaway' ? 0 : tableNum,
        order_type: orderType,
        subtotal, tax, service, grand_total: grand,
        items: cart
    };

    payTotalDisplay.innerText = "Rp " + formatNum(grand);
    payInput.value = "";
    payChange.innerText = "Rp 0";
    document.getElementById('edc-ref').value = ""; 
    setPaymentMethod('cash'); 
    modalPayment.style.display = "flex"; 
});

window.setPaymentMethod = (method) => {
    currentMethod = method;
    [btnCash, btnQris, btnEdc].forEach(btn => {
        btn.style.borderColor = 'rgba(255,255,255,0.2)'; btn.style.color = '#ccc'; btn.style.background = 'var(--bg-main)';
    });
    
    const activeBtn = method === 'cash' ? btnCash : (method === 'qris' ? btnQris : btnEdc);
    activeBtn.style.borderColor = 'var(--accent-green)';
    activeBtn.style.color = 'var(--accent-green)';
    activeBtn.style.background = 'rgba(0,255,136,0.1)';

    areaCash.style.display = 'none';
    areaQris.style.display = 'none';
    areaEdc.style.display = 'none';

    if (method === 'cash') {
        areaCash.style.display = 'block';
        setTimeout(() => payInput.focus(), 100);
    } else if (method === 'qris') {
        areaQris.style.display = 'block';
    } else {
        areaEdc.style.display = 'block';
    }
};

window.calcChange = (input) => {
    if(input) { 
        let val = input.value.replace(/\D/g, "");
        input.value = formatNum(val);
    }
    const received = cleanNum(payInput.value);
    const total = currentTransaction.grand_total;
    const change = received - total;

    if (received >= total) {
        payChange.innerText = "Rp " + formatNum(change);
        payChange.style.color = "var(--accent-green)"; 
    } else {
        payChange.innerText = "Kurang: Rp " + formatNum(Math.abs(change));
        payChange.style.color = "var(--danger)"; 
    }
};

window.fastCash = (amount) => {
    if (amount === 'pas') {
        payInput.value = formatNum(currentTransaction.grand_total);
    } else {
        payInput.value = formatNum(amount);
    }
    calcChange();
};

window.closePayment = () => {
    modalPayment.style.display = "none";
};

// --- FINALISASI ---
window.processFinalPayment = async () => {
    const received = cleanNum(payInput.value);
    const total = currentTransaction.grand_total;
    const edcRef = document.getElementById('edc-ref').value;

    if (currentMethod === 'cash') {
        if (received < total) return alert("⚠️ Uang diterima kurang!");
    } 

    if (!confirm("Konfirmasi pembayaran?")) return;

    try {
        const nomor = "INV-" + Date.now();
        const batch = writeBatch(db);
        
        currentTransaction.items.forEach(i => {
            batch.update(doc(db, "products", i.id), { stock: productsCache[i.id].stock - i.qty });
        });

        const orderData = {
            ...currentTransaction,
            order_number: nomor,
            status: 'paid',
            created_at: serverTimestamp(),
            payment_method: currentMethod, 
            payment_ref: currentMethod === 'edc' ? edcRef : '-', 
            amount_received: currentMethod === 'cash' ? received : total,
            change_amount: currentMethod === 'cash' ? (received - total) : 0
        };
        
        batch.set(doc(collection(db, "orders")), orderData);
        await batch.commit();

        modalPayment.style.display = "none"; 
        renderStruk(orderData);
        modalStruk.style.display = "flex"; 
        
        document.getElementById('cust-name').value = "";
        document.getElementById('table-num').value = "";
        
    } catch (e) {
        alert("Gagal: " + e.message);
    }
};

function renderStruk(data) {
    document.querySelector('.struk-header h2').innerText = storeConfig.storeName || "CUAN-IN";
    document.querySelector('.struk-header p').innerText = storeConfig.storeAddress || "";
    document.querySelector('.struk-footer p:first-child').innerText = storeConfig.storeFooter || "Terima Kasih!";

    const labelMeja = data.order_type === 'takeaway' ? "TAKEAWAY" : `Meja: ${data.table_number}`;
    
    strukContent.innerHTML = `
        <div style="border-bottom:1px dashed #000; padding-bottom:5px; margin-bottom:5px; font-size:12px;">
            ${labelMeja} / <strong>${data.customer_name}</strong>
        </div>`;
    
    data.items.forEach(i => {
        strukContent.innerHTML += `<div class="struk-item"><span>${i.name} (${i.qty})</span><span>${(i.price*i.qty).toLocaleString('id-ID')}</span></div>`;
    });
    
    let methodLabel = 'TUNAI';
    if(data.payment_method === 'qris') methodLabel = 'QRIS';
    if(data.payment_method === 'edc') methodLabel = 'EDC/BANK';

    strukContent.innerHTML += `
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <div class="struk-item"><span>Subtotal</span><span>${data.subtotal.toLocaleString('id-ID')}</span></div>
        ${data.tax>0 ? `<div class="struk-item"><span>Tax</span><span>${data.tax.toLocaleString('id-ID')}</span></div>`:''}
        ${data.service>0 ? `<div class="struk-item"><span>Srvc</span><span>${data.service.toLocaleString('id-ID')}</span></div>`:''}
        <div class="struk-item" style="font-weight:bold; margin-top:5px;"><span>TOTAL</span><span>${data.grand_total.toLocaleString('id-ID')}</span></div>
        <div class="struk-item"><span>Bayar (${methodLabel})</span><span>${data.amount_received.toLocaleString('id-ID')}</span></div>
        <div class="struk-item"><span>Kembali</span><span>${data.change_amount.toLocaleString('id-ID')}</span></div>
        ${data.payment_ref !== '-' ? `<div class="struk-item" style="font-size:10px;">Ref: ${data.payment_ref}</div>` : ''}
    `;
    
    strukTotal.innerText = "Rp " + data.grand_total.toLocaleString('id-ID'); 
    strukDate.innerText = new Date().toLocaleString('id-ID');
    strukId.innerText = data.order_number;
}

if (btnTutupStruk) btnTutupStruk.addEventListener('click', () => { modalStruk.style.display = "none"; cart = []; updateCartUI(); });