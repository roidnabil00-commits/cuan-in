import { db } from './firebase-config.js'; 
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, writeBatch, doc, getDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const daftarMenuEl = document.getElementById('daftar-menu');
const cartItemsEl = document.getElementById('cart-items');
const totalPriceEl = document.getElementById('total-price');
const btnCheckout = document.getElementById('btn-checkout');
const btnTotalLabel = document.getElementById('btn-total'); // Label harga di tombol

// Struk Elements
const modalStruk = document.getElementById('modal-struk');
const strukContent = document.getElementById('struk-content');
const strukTotal = document.getElementById('struk-total-price');
const strukDate = document.getElementById('struk-date');
const strukId = document.getElementById('struk-id');
const btnTutupStruk = document.getElementById('btn-tutup-struk');

let cart = []; 
let productsCache = {}; 
let allProductsList = []; // Simpan semua produk buat filter
let storeConfig = { taxRate: 0, serviceRate: 0, storeName: "CUAN-IN", storeAddress: "Loading...", storeFooter: "Terima Kasih" };

// 0. CONFIG
async function loadConfig() {
    try {
        const docSnap = await getDoc(doc(db, "settings", "store_config"));
        if (docSnap.exists()) storeConfig = docSnap.data();
    } catch (e) { console.error(e); }
}
loadConfig();

// 1. LOAD MENU & FILTER LOGIC
const q = query(collection(db, "products"), orderBy("created_at", "desc"));
onSnapshot(q, (snapshot) => {
    allProductsList = [];
    productsCache = {}; 
    
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const item = { ...data, id: id };
        productsCache[id] = item;
        allProductsList.push(item);
    });
    
    // Render awal (Semua menu)
    renderMenu('all');
});

// Fungsi Render Menu berdasarkan Kategori
window.filterMenu = (kategori, btnElement) => {
    // Ubah warna tombol aktif
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');

    renderMenu(kategori);
}

function renderMenu(kategori) {
    daftarMenuEl.innerHTML = "";
    
    // Filter Data
    const filtered = kategori === 'all' 
        ? allProductsList 
        : allProductsList.filter(p => p.category === kategori);

    if(filtered.length === 0) {
        daftarMenuEl.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#888;">Menu kategori ini kosong.</p>`;
        return;
    }

    filtered.forEach(data => {
        const currentStock = data.stock !== undefined ? data.stock : 0;
        const isHabis = currentStock <= 0;
        
        const card = document.createElement('div');
        card.className = 'card';
        card.style.opacity = isHabis ? "0.6" : "1";
        card.style.background = isHabis ? "#f9f9f9" : "white";
        
        const statusText = isHabis 
            ? "<span style='color:#dc3545; font-size:12px; font-weight:bold;'>HABIS</span>" 
            : `<span style='color:#666; font-size:12px;'>Stok: ${currentStock}</span>`;

        card.innerHTML = `
            <h3>${data.name}</h3>
            ${statusText}
            <div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>
        `;
        if (!isHabis) card.addEventListener('click', () => addToCart(data.id));
        daftarMenuEl.appendChild(card);
    });
}

// 2. LOGIC CART (ADD & CHANGE QTY)
window.addToCart = (id) => {
    const product = productsCache[id];
    const itemInCart = cart.find(item => item.id === id);
    const qtyInCart = itemInCart ? itemInCart.qty : 0;

    if (qtyInCart + 1 > product.stock) return alert("⚠️ Stok habis!");

    if (itemInCart) { 
        itemInCart.qty += 1; 
    } else { 
        cart.push({ id: id, name: product.name, price: product.price, qty: 1 }); 
    }
    updateCartUI();
}

// Fitur Baru: Ubah Qty (+ -) dari keranjang
window.changeQty = (id, delta) => {
    const itemIndex = cart.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const item = cart[itemIndex];
    const product = productsCache[id];
    
    const newQty = item.qty + delta;

    // Hapus kalau qty jadi 0
    if (newQty <= 0) {
        cart.splice(itemIndex, 1);
    } 
    // Cek stok kalau nambah
    else if (delta > 0 && newQty > product.stock) {
        alert("⚠️ Stok mentok!");
        return;
    } 
    else {
        item.qty = newQty;
    }
    updateCartUI();
}

window.clearCart = () => {
    if(confirm("Kosongkan keranjang?")) {
        cart = [];
        updateCartUI();
    }
}

function updateCartUI() {
    cartItemsEl.innerHTML = "";
    let subtotal = 0;
    
    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<p style="color: #888; text-align: center; margin-top:50px;">Keranjang kosong...</p>`;
        btnCheckout.disabled = true;
        totalPriceEl.innerHTML = "";
        btnTotalLabel.innerText = "Rp 0";
        return;
    }

    cart.forEach((item) => {
        subtotal += item.price * item.qty;
        
        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-price">@${item.price.toLocaleString('id-ID')}</span>
            </div>
            <div class="qty-controls">
                <button class="btn-qty red" onclick="changeQty('${item.id}', -1)">${item.qty === 1 ? '🗑️' : '-'}</button>
                <span style="font-size:14px; min-width:20px; text-align:center;">${item.qty}</span>
                <button class="btn-qty" onclick="changeQty('${item.id}', 1)">+</button>
            </div>
            <div style="font-weight:bold; font-size:14px; margin-left:10px;">
                ${(item.price * item.qty).toLocaleString('id-ID')}
            </div>
        `;
        cartItemsEl.appendChild(itemEl);
    });

    // Hitung Total + Pajak
    const tax = subtotal * (storeConfig.taxRate / 100);
    const service = subtotal * (storeConfig.serviceRate / 100);
    const grandTotal = subtotal + tax + service;

    // Tampilan Detail
    totalPriceEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#555;">
            <span>Subtotal</span><span>${subtotal.toLocaleString('id-ID')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#555;">
            <span>Pajak (${storeConfig.taxRate}%)</span><span>${tax.toLocaleString('id-ID')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#555;">
            <span>Service (${storeConfig.serviceRate}%)</span><span>${service.toLocaleString('id-ID')}</span>
        </div>
    `;
    
    btnTotalLabel.innerText = "Rp " + grandTotal.toLocaleString('id-ID');
    btnCheckout.disabled = false;
}

// 3. CHECKOUT
btnCheckout.addEventListener('click', async () => {
    if(!confirm("Proses transaksi ini?")) return;

    try {
        btnCheckout.disabled = true;
        btnTotalLabel.innerText = "Proses...";

        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const tax = subtotal * (storeConfig.taxRate / 100);
        const service = subtotal * (storeConfig.serviceRate / 100);
        const grandTotal = subtotal + tax + service;
        const nomorOrder = "INV-" + Date.now();

        const batch = writeBatch(db);
        cart.forEach(item => {
            const productRef = doc(db, "products", item.id);
            const newStock = productsCache[item.id].stock - item.qty;
            batch.update(productRef, { stock: newStock });
        });

        const orderRef = doc(collection(db, "orders"));
        const orderData = {
            order_number: nomorOrder, subtotal, tax, service, grand_total: grandTotal,
            items: cart, status: 'paid', created_at: serverTimestamp()
        };
        batch.set(orderRef, orderData);

        await batch.commit();
        renderStruk(orderData);
        modalStruk.style.display = "flex";

    } catch (error) {
        alert("Gagal: " + error.message);
        btnCheckout.disabled = false;
        updateCartUI();
    }
});

function renderStruk(data) {
    document.querySelector('.struk-header h2').innerText = storeConfig.storeName || "CUAN-IN";
    document.querySelector('.struk-header p').innerText = storeConfig.storeAddress || "";
    document.querySelector('.struk-footer p:first-child').innerText = storeConfig.storeFooter || "Terima Kasih!";

    strukContent.innerHTML = "";
    data.items.forEach(item => {
        strukContent.innerHTML += `
            <div class="struk-item">
                <span>${item.name} (${item.qty})</span>
                <span>${(item.price * item.qty).toLocaleString('id-ID')}</span>
            </div>`;
    });
    
    // Tambah detail pajak di struk
    strukContent.innerHTML += `
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <div class="struk-item"><span>Subtotal</span><span>${data.subtotal.toLocaleString('id-ID')}</span></div>
        ${data.tax > 0 ? `<div class="struk-item"><span>Tax</span><span>${data.tax.toLocaleString('id-ID')}</span></div>` : ''}
        ${data.service > 0 ? `<div class="struk-item"><span>Srvc</span><span>${data.service.toLocaleString('id-ID')}</span></div>` : ''}
    `;

    strukTotal.innerText = "Rp " + data.grand_total.toLocaleString('id-ID');
    strukDate.innerText = new Date().toLocaleString('id-ID');
    strukId.innerText = data.order_number;
}

btnTutupStruk.addEventListener('click', () => {
    modalStruk.style.display = "none";
    cart = [];
    updateCartUI();
});