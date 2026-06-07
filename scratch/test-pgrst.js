const url = 'https://wlmcwxnmkahonxotmkmu.supabase.co/rest/v1';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsbWN3eG5ta2Fob254b3Rta211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDQxMDYsImV4cCI6MjA5NTI4MDEwNn0.RMuofoCFZJIdbTwUmrMnCmW9HsuITXhY86K_0N51BOU';

async function test() {
  const headers = {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    const targetId = 'fa670848-a640-4cc6-8a34-a0fac236d5b2';
    console.log(`--- Trying to insert profile with ID ${targetId} ---`);
    const pRes = await fetch(`${url}/profiles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: targetId,
        name: 'Test Admin',
        avatar_url: null,
        updated_at: new Date().toISOString()
      })
    });
    console.log('Insert response status:', pRes.status);
    console.log('Insert response body:', await pRes.text());
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

test();
