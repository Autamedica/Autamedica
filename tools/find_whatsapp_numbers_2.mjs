import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function findWhatsAppInHtml(html) {
    const cheerioData = cheerio.load(html);
    let waUrl = null;
    cheerioData('a').each((i, el) => {
        const href = cheerioData(el).attr('href');
        if (href && (href.includes('wa.me/') || href.includes('api.whatsapp.com/send'))) {
            waUrl = href;
            return false;
        }
    });
    return waUrl;
}

async function processAccounts() {
    let hasMore = true;
    let offset = 0;
    const limit = 50;
    
    while(hasMore) {
        const response = await supabase
            .schema('growth_os')
            .from('crm_accounts')
            .select('id, name, website')
            .not('website', 'is', null)
            .like('website', 'http%')
            .is('whatsapp_url', null)
            .range(offset, offset + limit - 1);
            
        const accounts = response.data;
        if (!accounts || accounts.length === 0) {
            hasMore = false;
            break;
        }
            
        console.log("Checking batch of " + accounts.length);
        
        for (const account of accounts) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                
                const res = await fetch(account.website, { 
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                    const html = await res.text();
                    const waUrl = await findWhatsAppInHtml(html);
                    
                    if (waUrl) {
                        console.log("FOUND WHATSAPP: " + account.name + " -> " + waUrl);
                        await supabase.schema('growth_os').from('crm_accounts').update({ whatsapp_url: waUrl }).eq('id', account.id);
                    }
                }
            } catch (e) {
                // ignore timeouts
            }
        }
        offset += limit;
    }
    console.log("Done.");
}

processAccounts();
