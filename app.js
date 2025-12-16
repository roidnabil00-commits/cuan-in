import { db } from './firebase-config.js'; 

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

// --- 0. LOAD CONFIG (SUPABASE) ---
async function loadConfig() {
    try {
        const { data, error } = await db.from('settings').select('*').single();
        if (data) storeConfig = data;
    } catch (e) { console.error("Gagal load config:", e); }
}
loadConfig();

// --- 1. MENU LOGIC (SUPABASE) ---
async function fetchMenu() {
    // Ambil data menu dari tabel 'products'
    const { data, error } = await db
        .from('products')
        .select('*')
        .order('id', { ascending: true }); // Urutkan biar rapi

    if (error) {
        console.error("Gagal ambil menu:", error);
        return;
    }

    // Masukkan data ke variabel global
    allProductsList = data; 
    productsCache = {};
    
    // Simpan ke cache untuk keperluan Cart nanti
    data.forEach(item => {
        productsCache[item.id] = item;
    });

    renderMenu(activeCategory);
}

// Fitur Realtime Supabase (Kalau stok berubah, menu refresh otomatis)
db.channel('public:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('Update Menu Realtime:', payload);
        fetchMenu(); 
    })
    .subscribe();

// Panggil fungsi pertama kali
fetchMenu();


window.filterMenu = (kategori, btnElement) => {
    activeCategory = kategori;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) {
        btnElement.classList.add('active');
    } else {
        // Cari tombol yang sesuai teksnya (agak tricky tapi works)
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
        
        // Visual Update kalau habis
        if(isHabis) {
            card.style.opacity = "0.5";
            card.style.background = "rgba(0,0,0,0.5)";
        }
        
        const statusText = isHabis 
            ? "<span style='color:#ff4757; font-size:12px; font-weight:bold;'>HABIS</span>" 
            : `<span style='color:#a0aec0; font-size:12px;'>Stok: ${stock}</span>`;

        card.innerHTML = `
            <h3>${data.name}</h3>
            ${statusText}
            <div class="price">Rp ${data.price.toLocaleString('id-ID')}</div>
        `;
        // Jangan lupa: Kirim ID produk saat diklik
        if (!isHabis) card.addEventListener('click', () => addToCart(data.id));
        daftarMenuEl.appendChild(card);
    });
}

// --- 2. CART LOGIC (SAMA SEPERTI SEBELUMNYA) ---
window.addToCart = (id) => {
    // Pastikan ID tipe data sama (Supabase ID = number)
    const item = cart.find(i => i.id === id);
    const product = productsCache[id];
    
    if (!product) return;

    if ((item ? item.qty : 0) + 1 > product.stock) return alert("Stok habis!");
    
    if (item) {
        item.qty++;
    } else {
        cart.push({ id, name: product.name, price: product.price, qty: 1 });
    }
    updateCartUI();
}

window.changeQty = (id, delta) => {
    // Convert ID string ke number kalau perlu (karena HTML attribute selalu string)
    const numId = Number(id);
    const idx = cart.findIndex(i => i.id === numId);
    
    if (idx === -1) return;
    
    const newQty = cart[idx].qty + delta;
    const maxStock = productsCache[numId].stock;

    if (newQty <= 0) cart.splice(idx, 1);
    else if (delta > 0 && newQty > maxStock) return alert("Stok mentok!");
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
    
    // Pakai nama field yang sesuai tabel settings SQL (snake_case)
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
    const tax = subtotal * ((storeConfig.tax_rate||0) / 100);
    const service = subtotal * ((storeConfig.service_rate||0) / 100);
    const grand = Math.ceil(subtotal + tax + service); 

    currentTransaction = {
        customer_name: custName,
        table_number: orderType === 'takeaway' ? '' : tableNum, // Kosongkan string kalau takeaway
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

// --- 4. FINALISASI TRANSAKSI (SUPABASE) ---
window.processFinalPayment = async () => {
    const received = cleanNum(payInput.value);
    const total = currentTransaction.grand_total;
    const edcRef = document.getElementById('edc-ref').value;

    if (currentMethod === 'cash') {
        if (received < total) return alert("⚠️ Uang diterima kurang!");
    } 

    if (!confirm("Konfirmasi pembayaran?")) return;

    try {
        const nomorInv = "INV-" + Date.now();
        
        // 1. Simpan Header Transaksi (Tabel 'orders')
        const { data: orderData, error: orderError } = await db.from('orders').insert({
            order_number: nomorInv,
            customer_name: currentTransaction.customer_name,
            table_number: currentTransaction.table_number,
            order_type: currentTransaction.order_type,
            
            subtotal: currentTransaction.subtotal,
            tax: currentTransaction.tax,
            service: currentTransaction.service,
            grand_total: currentTransaction.grand_total,
            
            payment_method: currentMethod,
            amount_received: (currentMethod === 'cash' ? received : total),
            change_amount: (currentMethod === 'cash' ? (received - total) : 0),
            
            status: 'paid'
        }).select().single(); // .select().single() penting biar kita dapat ID transaksi barunya

        if (orderError) throw new Error("Gagal simpan order: " + orderError.message);
        
        const newOrderId = orderData.id; // Ini ID transaksi di database (contoh: 1, 2, 3...)

        // 2. Simpan Detail Item & Potong Stok
        // Kita loop satu per satu item di keranjang
        for (const item of currentTransaction.items) {
            
            // Masukkan ke tabel 'order_items'
            await db.from('order_items').insert({
                order_id: newOrderId,
                product_id: item.id,
                product_name: item.name,
                price_at_purchase: item.price,
                qty: item.qty,
                subtotal: item.price * item.qty
            });

            // Update Stok di tabel 'products'
            const currentStock = productsCache[item.id].stock;
            await db.from('products')
                .update({ stock: currentStock - item.qty })
                .eq('id', item.id);
        }

        // 3. Reset UI & Tampilkan Struk
        modalPayment.style.display = "none"; 
        
        // Tambahkan data ID & Tanggal biar struk lengkap
        const strukData = {
            ...currentTransaction,
            order_number: nomorInv,
            amount_received: (currentMethod === 'cash' ? received : total),
            change_amount: (currentMethod === 'cash' ? (received - total) : 0),
            payment_ref: (currentMethod === 'edc' ? edcRef : '-'),
            payment_method: currentMethod
        };
        
        renderStruk(strukData);
        modalStruk.style.display = "flex"; 
        
        // Bersihkan Form
        document.getElementById('cust-name').value = "";
        document.getElementById('table-num').value = "";
        
    } catch (e) {
        alert("Error Transaksi: " + e.message);
        console.error(e);
    }
};

function renderStruk(data) {
    document.querySelector('.struk-header h2').innerText = storeConfig.store_name || "CUAN-IN";
    document.querySelector('.struk-header p').innerText = storeConfig.store_address || "";
    document.querySelector('.struk-footer p:first-child').innerText = storeConfig.store_footer || "Terima Kasih!";

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