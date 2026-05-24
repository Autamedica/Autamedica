import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error("Missing Supabase Service Role Key environment variable");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findWhatsAppInHtml(html) {
    const cheerioData = cheerio.load(html);
    let waUrl = null;
    
    // Look for explicit wa.me or api.whatsapp.com links
    cheerioData('a').each((i, el) => {
        const href = cheerioData(el).attr('href');
        if (href && (href.includes('wa.me/') || href.includes('api.whatsapp.com/send'))) {
            waUrl = href;
            return false; // Break loop
        }
    });
    return waUrl;
}

async function processAccounts() {
    console.log("Fetching accounts with websites...");
    
    const response = await supabase
        .schema('growth_os')
        .from('crm_accounts')
        .select('id, name, website')
        .not('website', 'is', null)
        .like('website', 'http%')
        .limit(20);
        
    const accounts = response.data;
        
    console.log("Found " + accounts.length + " accounts to check.");
    
    for (const account of accounts) {
        console.log("Checking: " + account.name);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const res = await fetch(account.website, { 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                const html = await res.text();
                const waUrl = await findWhatsAppInHtml(html);
                
                if (waUrl) {
                    console.log("FOUND WHATSAPP: " + waUrl);
                } else {
                    console.log("No WhatsApp link found.");
                }
            } else {
                console.log("HTTP " + res.status);
            }
        } catch (e) {
            console.log("Fetch failed");
        }
    }
}

processAccounts();
