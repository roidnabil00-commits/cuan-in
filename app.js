import { db } from './firebase-config.js'; 
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, writeBatch, doc, getDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ELEMEN HTML ---
const daftarMenuEl = document.getElementById('daftar-menu');
const cartItemsEl = document.getElementById('cart-items');
const totalPriceEl = document.getElementById('total-price');
const btnCheckout = document.getElementById('btn-checkout');
const btnTotalLabel = document.getElementById('btn-total'); 

// Elemen Struk
const modalStruk = document.getElementById('modal-struk');
const strukContent = document.getElementById('struk-content');
const strukTotal = document.getElementById('struk-total-price');
const strukDate = document.getElementById('struk-date');
const strukId = document.getElementById('struk-id');
const btnTutupStruk = document.getElementById('btn-tutup-struk');

let cart = []; 
let productsCache = {}; 
let allProductsList = []; 
let storeConfig = { taxRate: 0, serviceRate: 0, storeName: "CUAN-IN", storeAddress: "Loading...", storeFooter: "Terima Kasih" };

// --- 0. CONFIG ---
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
    renderMenu('all');
});

window.filterMenu = (kategori, btnElement) => {
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    renderMenu(kategori);
}

function renderMenu(kategori) {
    daftarMenuEl.innerHTML = "";
    const filtered = kategori === 'all' ? allProductsList : allProductsList.filter(p => p.category === kategori);
    if(filtered.length === 0) { daftarMenuEl.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#888;">Kosong.</p>`; return; }

    filtered.forEach(data => {
        const stock = data.stock !== undefined ? data.stock : 0;
        const isHabis = stock <= 0;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.opacity = isHabis ? "0.6" : "1";
        card.style.background = isHabis ? "#f9f9f9" : "white";
        
        card.innerHTML = `<h3>${data.name}</h3>${isHabis ? "<span style='color:red; font-size:12px;'>HABIS</span>" : `<span style='color:#666; font-size:12px;'>Stok: ${stock}</span>`}<div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>`;
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
        cartItemsEl.innerHTML = `<p style="color:#888; text-align:center; margin-top:50px;">Keranjang kosong...</p>`;
        btnCheckout.disabled = true; totalPriceEl.innerHTML = ""; btnTotalLabel.innerText = "Rp 0";
        return;
    }
    let subtotal = 0;
    cart.forEach(item => {
        subtotal += item.price * item.qty;
        cartItemsEl.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info"><span class="cart-item-name">${item.name}</span><span class="cart-item-price">@${item.price.toLocaleString('id-ID')}</span></div>
                <div class="qty-controls"><button class="btn-qty red" onclick="changeQty('${item.id}', -1)">${item.qty===1?'🗑️':'-'}</button><span>${item.qty}</span><button class="btn-qty" onclick="changeQty('${item.id}', 1)">+</button></div>
                <div style="font-weight:bold; margin-left:10px;">${(item.price*item.qty).toLocaleString('id-ID')}</div>
            </div>`;
    });
    
    const tax = subtotal * (storeConfig.taxRate / 100);
    const service = subtotal * (storeConfig.serviceRate / 100);
    const grand = subtotal + tax + service;

    totalPriceEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#555;"><span>Subtotal</span><span>${subtotal.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#555;"><span>Tax (${storeConfig.taxRate}%)</span><span>${tax.toLocaleString('id-ID')}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#555;"><span>Service (${storeConfig.serviceRate}%)</span><span>${service.toLocaleString('id-ID')}</span></div>
    `;
    btnTotalLabel.innerText = "Rp " + grand.toLocaleString('id-ID');
    btnCheckout.disabled = false;
}

// --- 3. FITUR TAKEAWAY (BARU) ---
window.toggleTableInput = () => {
    const type = document.getElementById('order-type').value;
    const tableInput = document.getElementById('table-num');
    
    if (type === 'takeaway') {
        tableInput.value = '';
        tableInput.disabled = true; // Matikan input meja
        tableInput.placeholder = "X";
        tableInput.style.backgroundColor = "#e9ecef";
    } else {
        tableInput.disabled = false; // Hidupkan lagi
        tableInput.placeholder = "No. Meja";
        tableInput.style.backgroundColor = "white";
        tableInput.focus();
    }
}

// --- 4. CHECKOUT ---
btnCheckout.addEventListener('click', async () => {
    const custName = document.getElementById('cust-name').value.trim();
    const tableNum = document.getElementById('table-num').value.trim();
    const orderType = document.getElementById('order-type').value;

    // VALIDASI CERDAS: Kalau Dine-in wajib isi meja, kalau Takeaway gak usah
    if (!custName) return alert("⚠️ Isi nama pelanggan!");
    if (orderType === 'dine-in' && !tableNum) return alert("⚠️ Untuk Dine-in, nomor meja wajib diisi!");

    if(!confirm("Proses transaksi?")) return;

    try {
        btnCheckout.disabled = true; btnTotalLabel.innerText = "Proses...";
        const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
        const tax = subtotal * (storeConfig.taxRate / 100);
        const service = subtotal * (storeConfig.serviceRate / 100);
        const grand = subtotal + tax + service;
        const nomor = "INV-" + Date.now();

        const batch = writeBatch(db);
        cart.forEach(i => batch.update(doc(db, "products", i.id), { stock: productsCache[i.id].stock - i.qty }));
        
        // Simpan data (Meja 0 kalau Takeaway)
        const orderData = {
            order_number: nomor, customer_name: custName, 
            table_number: orderType === 'takeaway' ? 0 : tableNum, // Logika Takeaway
            order_type: orderType, // Simpan tipe pesanan
            subtotal, tax, service, grand_total: grand, items: cart, status: 'paid', created_at: serverTimestamp()
        };
        batch.set(doc(collection(db, "orders")), orderData);
        await batch.commit();

        renderStruk(orderData);
        modalStruk.style.display = "flex";
        document.getElementById('cust-name').value = ""; document.getElementById('table-num').value = "";

    } catch (e) { alert("Gagal: " + e.message); btnCheckout.disabled = false; updateCartUI(); }
});

function renderStruk(data) {
    document.querySelector('.struk-header h2').innerText = storeConfig.storeName || "CUAN-IN";
    document.querySelector('.struk-header p').innerText = storeConfig.storeAddress || "";
    document.querySelector('.struk-footer p:first-child').innerText = storeConfig.storeFooter || "Terima Kasih!";

    // Tampilan Meja di Struk
    const labelMeja = data.order_type === 'takeaway' ? "TAKEAWAY (Bungkus)" : `Meja: ${data.table_number}`;
    
    strukContent.innerHTML = `
        <div style="border-bottom:1px dashed #000; padding-bottom:5px; margin-bottom:5px; font-size:12px;">
            ${labelMeja}<br>
            <strong>${data.customer_name}</strong>
        </div>`;
    
    data.items.forEach(i => {
        strukContent.innerHTML += `<div class="struk-item"><span>${i.name} (${i.qty})</span><span>${(i.price*i.qty).toLocaleString('id-ID')}</span></div>`;
    });
    
    strukContent.innerHTML += `
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <div class="struk-item"><span>Subtotal</span><span>${data.subtotal.toLocaleString('id-ID')}</span></div>
        ${data.tax>0 ? `<div class="struk-item"><span>Tax</span><span>${data.tax.toLocaleString('id-ID')}</span></div>`:''}
        ${data.service>0 ? `<div class="struk-item"><span>Service</span><span>${data.service.toLocaleString('id-ID')}</span></div>`:''}
    `;
    strukTotal.innerText = "Rp " + data.grand_total.toLocaleString('id-ID');
    strukDate.innerText = new Date().toLocaleString('id-ID');
    strukId.innerText = data.order_number;
}

if (btnTutupStruk) btnTutupStruk.addEventListener('click', () => { modalStruk.style.display = "none"; cart = []; updateCartUI(); });