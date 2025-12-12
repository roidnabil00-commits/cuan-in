import { db } from './firebase-config.js'; 
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const daftarMenuEl = document.getElementById('daftar-menu');
const cartItemsEl = document.getElementById('cart-items');
const totalPriceEl = document.getElementById('total-price');
const btnCheckout = document.getElementById('btn-checkout');

// Elemen Struk
const modalStruk = document.getElementById('modal-struk');
const strukContent = document.getElementById('struk-content');
const strukTotal = document.getElementById('struk-total-price');
const strukDate = document.getElementById('struk-date');
const strukId = document.getElementById('struk-id');
const btnTutupStruk = document.getElementById('btn-tutup-struk');

let cart = []; 

// 1. LOAD MENU
const q = query(collection(db, "products"), orderBy("created_at", "desc"));
onSnapshot(q, (snapshot) => {
    daftarMenuEl.innerHTML = "";
    snapshot.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h3>${data.name}</h3><div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>`;
        card.addEventListener('click', () => addToCart(id, data));
        daftarMenuEl.appendChild(card);
    });
});

// 2. LOGIC CART
function addToCart(id, product) {
    const existingItem = cart.find(item => item.id === id);
    if (existingItem) { existingItem.qty += 1; } 
    else { cart.push({ id: id, name: product.name, price: product.price, qty: 1 }); }
    updateCartUI();
}

function updateCartUI() {
    cartItemsEl.innerHTML = "";
    let total = 0;
    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<p style="color: #888; text-align: center;">Keranjang kosong...</p>`;
        btnCheckout.disabled = true;
        totalPriceEl.innerText = "Rp 0";
        return;
    }
    cart.forEach((item) => {
        total += item.price * item.qty;
        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `<span>${item.name} x${item.qty}</span><span>Rp ${(item.price * item.qty).toLocaleString('id-ID')}</span>`;
        cartItemsEl.appendChild(itemEl);
    });
    totalPriceEl.innerText = "Rp " + total.toLocaleString('id-ID');
    btnCheckout.disabled = false;
}

// 3. CHECKOUT & TAMPILKAN STRUK
btnCheckout.addEventListener('click', async () => {
    if(!confirm("Proses transaksi ini?")) return;

    try {
        btnCheckout.innerText = "Memproses...";
        btnCheckout.disabled = true;

        const grandTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const nomorOrder = "INV-" + Date.now(); // Nomor unik

        // Simpan ke Firebase
        const orderData = {
            order_number: nomorOrder,
            total_amount: grandTotal,
            items: cart,
            status: 'paid', // Langsung masuk dapur
            created_at: serverTimestamp()
        };
        await addDoc(collection(db, "orders"), orderData);

        // --- TAMPILKAN POPUP STRUK ---
        renderStruk(orderData, grandTotal);
        modalStruk.style.display = "flex"; // Munculkan modal

    } catch (error) {
        console.error(error);
        alert("❌ Transaksi Gagal");
        btnCheckout.disabled = false;
        btnCheckout.innerText = "BAYAR SEKARANG";
    }
});

// Fungsi Mengisi Data Struk
function renderStruk(data, total) {
    strukContent.innerHTML = "";
    
    // Loop barang belanjaan ke struk
    data.items.forEach(item => {
        strukContent.innerHTML += `
            <div class="struk-item">
                <span>${item.name} (${item.qty}x)</span>
                <span>${(item.price * item.qty).toLocaleString('id-ID')}</span>
            </div>
        `;
    });

    strukTotal.innerText = "Rp " + total.toLocaleString('id-ID');
    strukDate.innerText = new Date().toLocaleString('id-ID');
    strukId.innerText = data.order_number;
}

// 4. TUTUP STRUK & RESET
btnTutupStruk.addEventListener('click', () => {
    modalStruk.style.display = "none"; // Sembunyikan modal
    cart = []; // Kosongkan keranjang
    updateCartUI(); // Reset UI kasir
    btnCheckout.innerText = "BAYAR SEKARANG";
});