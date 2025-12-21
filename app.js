import { db, auth } from './db-config.js'; 

// --- STATE ---
let storeId = localStorage.getItem('store_id');
let shiftId = localStorage.getItem('shift_id');
let currentCashierName = 'Kasir'; // <--- (BARU) Variabel simpan nama
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
// Helper Anti-XSS (Taruh di paling atas app.js)
const escapeHtml = (unsafe) => {
    return (unsafe || "").replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

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

// --- HELPER FORMAT RUPIAH INPUT ---
window.formatRupiah = (el) => {
    if(!el.value) return;
    // 1. Hapus semua karakter selain angka
    let raw = el.value.replace(/\D/g, '');
    // 2. Format jadi 1.000.000
    el.value = Number(raw).toLocaleString('id-ID');
};

// Helper untuk membersihkan titik sebelum save ke DB
const cleanNum = (val) => Number(String(val).replace(/\./g,''));

// --- INIT ---
async function init() {
    if(!storeId) window.location.href = 'login.html';
    
    // (BARU) AMBIL NAMA KASIR DARI DATABASE
    const { data: { user } } = await auth.getUser();
    if(user) {
        const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single();
        if(profile && profile.full_name) {
            currentCashierName = profile.full_name;
        }
    }

    // 1. Cek Shift Aktif
    const { data: shift } = await db.from('shifts')
        .select('*')
        .eq('store_id', storeId)
        .eq('user_id', user.id)
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
    // Reset input value
    document.getElementById('shift-input').value = "";
    
    if(mode === 'open') {
        // (BARU) Tampilkan sapaan nama kasir
        document.getElementById('shift-title').innerText = `☀️ Halo, ${currentCashierName}!`;
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
    // BERSIHKAN TITIK DULU SEBELUM SAVE
    const startCash = cleanNum(document.getElementById('shift-input').value);
    
    if(startCash === 0 && !confirm("Modal 0? Yakin?")) return;

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
    // BERSIHKAN TITIK DULU SEBELUM SAVE
    const endCash = cleanNum(document.getElementById('shift-input').value);
    
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
        
        // --- LOGIKA TAMPILAN STOK ---
        const isHabis = p.stock <= 0;
        const cardStyle = isHabis ? "opacity:0.6; background:#2a0f0f; border:1px solid red; cursor:not-allowed;" : "";
        const clickEvent = isHabis ? "alert('Stok Habis!')" : `handleClickProduct(${JSON.stringify(p).replace(/"/g, '&quot;')})`; // Escape quote aman
        const labelHabis = isHabis ? "<div style='color:red; font-weight:bold; font-size:12px; margin-bottom:5px;'>❌ HABIS</div>" : "";
        
        els.menu.innerHTML += `
            <div class="card" style="${cardStyle}" onclick="${clickEvent}">
                ${labelHabis}
                <h3>${p.name} ${hasVar ? '<span style="font-size:10px; background:#764ba2; padding:2px 5px; border-radius:4px;">Varian</span>' : ''}</h3>
                <div class="price">Rp ${p.price.toLocaleString()} <span style="font-size:10px; color:#aaa;">(Stok: ${p.stock})</span></div>
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

function addToCart(p, variant) {
    // 1. CEK STOK DASAR
    if (p.stock <= 0) {
        return alert("❌ Stok Habis! Tidak bisa dipilih.");
    }

    const uniqueId = p.id + (variant ? '-' + variant.name : '');
    
    // 2. HITUNG TOTAL ITEM INI YANG SUDAH ADA DI KERANJANG
    // Kita harus filter berdasarkan productId karena varian beda tetap mengurangi stok produk yang sama
    const totalQtyInCart = cart
        .filter(item => item.productId === p.id)
        .reduce((sum, item) => sum + item.qty, 0);

    // 3. CEK APAKAH JIKA DITAMBAH 1 MASIH CUKUP?
    if (totalQtyInCart + 1 > p.stock) {
        return alert(`⚠️ Stok tidak cukup! Sisa stok fisik hanya: ${p.stock}`);
    }

    // --- LOGIC LAMA (BAWAH) TETAP SAMA ---
    const price = p.price + (variant ? variant.price : 0);
    const name = p.name + (variant ? ` (${variant.name})` : '');
    const cost = p.cost_price || 0; 

    const exist = cart.find(c => c.uniqueId === uniqueId);
    if(exist) exist.qty++;
    else cart.push({ uniqueId, productId: p.id, name, price, cost: cost, qty: 1 });
    
    updateCartUI();
}

window.changeQty = (uid, delta) => {
    const item = cart.find(c => c.uniqueId === uid);
    if(!item) return;

    // JIKA MENAMBAH (+), CEK STOK DULU
    if (delta > 0) {
        // Ambil data produk asli dari list global (allProductsList)
        const productAsli = allProductsList.find(p => p.id === item.productId);
        
        if (productAsli) {
            // Hitung total qty produk ini di keranjang saat ini
            const totalQtyInCart = cart
                .filter(c => c.productId === item.productId)
                .reduce((sum, i) => sum + i.qty, 0);

            if (totalQtyInCart + 1 > productAsli.stock) {
                return alert(`⚠️ Mentok! Stok sisa ${productAsli.stock}`);
            }
        }
    }

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
    // Reset input bayar
    document.getElementById('pay-input').value = "";
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

    if(m === 'edc') window.updateEdcCode();
};

window.calcChange = (el) => {
    // 1. Format dulu tampilannya jadi Rupiah
    window.formatRupiah(el);
    
    // 2. Ambil angka aslinya (bersihkan titik) untuk hitung kembalian
    const val = cleanNum(el.value);
    const change = val - currentTransaction.grand_total;
    
    document.getElementById('pay-change').innerText = change >= 0 ? "Rp "+change.toLocaleString() : "Kurang!";
};

window.fastCash = (amt) => {
    const val = amt === 'pas' ? currentTransaction.grand_total : amt;
    // Format juga tombol fast cash
    document.getElementById('pay-input').value = val.toLocaleString('id-ID');
    // Trigger hitung kembalian
    window.calcChange(document.getElementById('pay-input'));
};

// --- UPDATE APP.JS: PROCESS PAYMENT ---
// --- UPDATE APP.JS: PROCESS PAYMENT (ANTI DOUBLE CLICK) ---
window.processFinalPayment = async () => {
    const btnProses = document.getElementById('btn-process-pay');
    if (btnProses && btnProses.disabled) return;

    // UI Loading
    if (btnProses) {
        btnProses.disabled = true;
        btnProses.innerText = "⏳ MENGHITUNG DI SERVER...";
        btnProses.style.backgroundColor = "#555";
    }

    try {
        // 1. SIAPKAN DATA INPUT (Hanya data mentah, jangan kirim hasil hitungan!)
        const rawAmountInput = cleanNum(document.getElementById('pay-input').value);
        
        let methodToSave = currentMethod.toUpperCase();
        if(currentMethod === 'edc') {
            const bank = document.getElementById('edc-bank').value;
            const code = document.getElementById('edc-code').value;
            methodToSave = `EDC ${bank} (${code})`;
        } else if (currentMethod === 'cash') {
            methodToSave = 'TUNAI'; // Standarisasi string untuk SQL
        } else if (currentMethod === 'qris') {
            methodToSave = 'QRIS';
        }

        // 2. FORMAT ITEM UNTUK DIKIRIM KE SQL (Perhatikan 'variant_name')
        // Kita perlu extract nama varian murni dari cart item name
        // Cart name format di app.js lama: "Kopi (Es)" -> kita butuh "Es"
        const cleanItems = cart.map(item => {
            let varName = null;
            // Cek logic cart kamu: UniqueId = "12-Es" atau nama = "Kopi (Es)"
            // Kita coba ambil dari UniqueId atau parsing nama
            // Paling aman: kita parsing nama yang ada kurungnya
            const match = item.name.match(/\(([^)]+)\)$/);
            if (match) varName = match[1]; // Ambil text dalam kurung sebagai varian

            return {
                product_id: item.productId,
                qty: item.qty,
                variant_name: varName // Kirim nama varian, biarkan DB cari harganya
            };
        });

        // 3. PANGGIL FUNGSI SERVER (RPC)
        const payload = {
            p_store_id: storeId,
            p_cashier_name: currentCashierName,
            p_shift_id: shiftId,
            p_customer_name: currentTransaction.customer_name,
            p_table_number: currentTransaction.table_number,
            p_order_type: currentTransaction.order_type,
            p_payment_method: methodToSave,
            p_amount_received: rawAmountInput || 0,
            p_items: cleanItems
        };

        const { data: resultStruk, error } = await db.rpc('process_transaction_secure', payload);

        if (error) throw new Error(error.message); // Error stok/uang kurang akan muncul disini

        // 4. SUKSES! UPDATE UI DENGAN HASIL DARI SERVER
        // Kita perlu menyusun objek 'order' agar fungsi renderStruk(order) tetap jalan
        // Karena RPC cuma return sedikit data, kita gabungkan manual untuk tampilan struk
        const orderForStruk = {
            order_number: resultStruk.order_number,
            customer_name: currentTransaction.customer_name,
            cashier_name: currentCashierName,
            subtotal: currentTransaction.subtotal, // Visual sementara (karena DB sudah hitung ulang)
            tax: currentTransaction.tax,           // Visual sementara
            service: currentTransaction.service,   // Visual sementara
            grand_total: resultStruk.grand_total,  // PENTING: Ini dari server
            payment_method: methodToSave,
            amount_received: rawAmountInput || resultStruk.grand_total,
            change_amount: resultStruk.change_amount // PENTING: Ini dari server
        };

        els.modalPay.style.display = 'none';
        renderStruk(orderForStruk); // Panggil fungsi render struk lama
        els.modalStruk.style.display = 'flex';
        
        // Reset
        cart = []; 
        updateCartUI(); 
        document.getElementById('cust-name').value = ""; 
        document.getElementById('table-num').value = ""; 
        document.getElementById('pay-input').value = ""; 

    } catch (err) {
        alert("⚠️ Transaksi Gagal: " + err.message);
        console.error(err);
    } finally {
        if (btnProses) {
            btnProses.disabled = false;
            btnProses.innerText = "PROSES";
            btnProses.style.backgroundColor = ""; 
        }
    }
};
function renderStruk(o) {
    const headerHtml = `
        <div style="border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px; text-align:center;">
            <h3 style="margin:0;">${storeConfig.store_name}</h3>
            <p style="margin:0; font-size:10px;">${storeConfig.store_address}</p>
            <br>
            <div style="display:flex; justify-content:space-between; font-size:10px;">
                <span>NO: ${o.order_number}</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div style="text-align:left; font-size:10px;">
        <div>Pelanggan: ${escapeHtml(o.customer_name)}</div> <div>Kasir: ${escapeHtml(o.cashier_name || 'Staff')}</div> 
    </div>
    `;

    let itemsHtml = '';
    currentTransaction.items.forEach(i => {
        itemsHtml += `
            <div style="display:flex; justify-content:space-between; font-size:12px;">
                <span>${i.qty}x ${i.name}</span>
                <span>${(i.price * i.qty).toLocaleString()}</span>
            </div>`;
    });

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

// ============================================================
// 🔌 FITUR DETEKSI KONEKSI INTERNET (OFFLINE PROTECTION)
// Paste kode ini di bagian paling bawah file app.js
// ============================================================

function checkConnectionStatus() {
    const isOnline = navigator.onLine;
    const btnCheckout = document.getElementById('btn-checkout');
    const displayTotal = document.getElementById('btn-total');

    if (!isOnline) {
        // --- LOGIKA SAAT OFFLINE ---
        // 1. Matikan tombol bayar
        btnCheckout.disabled = true;
        
        // 2. Ubah tampilan visual agar kasir sadar
        btnCheckout.style.backgroundColor = "#555"; // Jadi abu-abu
        btnCheckout.style.color = "#aaa";
        btnCheckout.style.cursor = "not-allowed";
        
        // 3. Beri peringatan teks
        if (displayTotal) displayTotal.innerText = "🚫 OFFLINE";
        
    } else {
        // --- LOGIKA SAAT ONLINE KEMBALI ---
        // 1. Reset style ke default (mengikuti CSS)
        btnCheckout.style.backgroundColor = ""; 
        btnCheckout.style.color = "";
        btnCheckout.style.cursor = "";

        // 2. Panggil ulang fungsi updateCartUI() yang sudah ada di atas
        // Ini penting agar tombol kembali enable/disable sesuai jumlah keranjang
        // dan angka total harga kembali muncul.
        updateCartUI(); 
    }
}

// Pasang "Telinga" (Event Listener) untuk memantau koneksi
window.addEventListener('online', checkConnectionStatus);
window.addEventListener('offline', checkConnectionStatus);

// Jalankan pengecekan sekali saat aplikasi baru dibuka
checkConnectionStatus();