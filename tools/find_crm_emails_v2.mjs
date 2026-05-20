import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

function extractEmailsFromHtml(html) {
    const emails = new Set();
    const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
        matches.forEach(email => {
            const lower = email.toLowerCase();
            const junk = ['.png', '.jpg', '.svg', '.gif', 'sentry', 'wix', 'example', 'email@', 'yourname'];
            if (!junk.some(j => lower.includes(j))) {
                emails.add(lower);
            }
        });
    }
    return Array.from(emails);
}

async function processAccounts() {
    const { data: accounts } = await supabase
        .schema('growth_os')
        .from('crm_accounts')
        .select('id, name, website')
        .not('website', 'is', null)
        .like('website', 'http%')
        .is('main_email', null);
        
    console.log("Processing " + (accounts?.length || 0) + " accounts for emails...");

    if (!accounts) return;

    for (const account of accounts) {
        console.log("Crawling: " + account.name);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const res = await fetch(account.website, { 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                const html = await res.text();
                const foundEmails = extractEmailsFromHtml(html);
                
                if (foundEmails.length > 0) {
                    const email = foundEmails[0];
                    console.log("  FOUND: " + email);
                    await supabase.schema('growth_os').from('crm_accounts').update({ main_email: email }).eq('id', account.id);
                }
            }
        } catch (e) {}
    }
    console.log("Done.");
}

processAccounts();
