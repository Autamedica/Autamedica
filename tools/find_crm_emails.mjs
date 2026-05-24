import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function extractEmailsFromHtml(html) {
    const emails = new Set();
    // Match common email patterns
    const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
        matches.forEach(email => {
            // Filter out common junk or image extensions
            const lower = email.toLowerCase();
            if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.svg') && !lower.includes('sentry') && !lower.includes('wix')) {
                emails.add(lower);
            }
        });
    }
    return Array.from(emails);
}

async function processAccounts() {
    console.log("Starting CRM Email Discovery...");
    
    // Fetch accounts that have a website but NO email recorded (if we had an email field)
    // Since I don't see an 'email' field in the crm_accounts type I saw earlier, 
    // I will check the schema first or assume we might want to store it in a new column or 'notes'.
    // Actually, I'll check if there's an email column.
    
    const { data: accounts } = await supabase
        .schema('growth_os')
        .from('crm_accounts')
        .select('id, name, website')
        .not('website', 'is', null)
        .like('website', 'http%');
        
    console.log("Processing " + accounts.length + " accounts...");

    for (const account of accounts) {
        console.log("Crawling: " + account.name + " (" + account.website + ")");
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            
            const res = await fetch(account.website, { 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                const html = await res.text();
                const foundEmails = await extractEmailsFromHtml(html);
                
                if (foundEmails.length > 0) {
                    const primaryEmail = foundEmails[0];
                    console.log("  FOUND EMAIL: " + primaryEmail);
                    
                    // Assuming we might need to add a column or use tags/notes.
                    // Let's try to update a hypothetical 'email' column or just log it for now to verify.
                    // I will check the actual columns first in the next step.
                }
            }
        } catch (e) {
            // silent fail for crawl errors
        }
    }
}

processAccounts();
