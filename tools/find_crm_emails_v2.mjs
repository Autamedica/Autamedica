import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
        } catch (e) {
            console.debug("Crawl failed for " + account.name + ":", e.message);
        }
    }
    console.log("Done.");
}

processAccounts();
