const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.error('Failed to parse .env.local');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Searching for users with role="website_admin" in profiles...');
  const { data: pAdmins, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('role', 'website_admin');
  
  if (pErr) console.error('Profiles search error:', pErr);
  else console.log('Profiles website_admins:', pAdmins);

  console.log('\nSearching for admin roles in admin_roles...');
  const { data: rAdmins, error: rErr } = await supabase
    .from('admin_roles')
    .select('id, role');

  if (rErr) console.error('admin_roles search error:', rErr);
  else console.log('admin_roles entries:', rAdmins);
}

run();
