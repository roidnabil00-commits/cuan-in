// FILE: firebase-config.js (Namanya biarin aja dulu biar gak usah ubah import di file lain)

// Kita pakai CDN Supabase (Pengganti Firebase SDK)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// --- ISI DENGAN DATA DARI DASHBOARD SUPABASE KAMU ---
const supabaseUrl = 'https://anftjwlvwslsndjxwyij.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZnRqd2x2d3Nsc25kanh3eWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NjY3NjcsImV4cCI6MjA4MTQ0Mjc2N30.fIAKkktcun45-AqoHauuER8TcQI_H1NWgNN93elC9aA'; 
// ----------------------------------------------------

// Inisialisasi Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Kita export sebagai 'db' dan 'auth' supaya file app.js kamu gak kaget/error
// Trik ini biar kita gak perlu refactor banyak kode sekaligus.
const db = supabase; 
const auth = supabase.auth;

console.log("✅ Supabase Berhasil Dikoneksikan!");

export { db, auth };