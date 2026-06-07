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
  console.log('Fetching all users in profiles table...');
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, email, role');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${profiles.length} profiles:`);
    console.log(profiles);
  }
}

run();
