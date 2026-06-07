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

const userId = 'fa670848-a640-4cc6-8a34-a0fac236d5b2'; // Aarush Sharma

async function run() {
  console.log(`Inserting admin role for user ${userId}...`);
  const { data, error } = await supabase
    .from('admin_roles')
    .insert({
      id: userId,
      role: 'admin'
    })
    .select();

  if (error) {
    console.error('Error inserting admin role:', error);
  } else {
    console.log('Successfully inserted admin role:', data);
  }
}

run();
