const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.error('Failed to parse .env.local');
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

const userId = 'fa670848-a640-4cc6-8a34-a0fac236d5b2';

async function run() {
  console.log(`Checking profile for user ${userId}...`);
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  console.log('Profile:', profile);

  console.log(`Checking admin_roles for user ${userId}...`);
  const { data: adminRole } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('id', userId)
    .single();
  console.log('Admin Role:', adminRole);

  console.log('Fetching teams (without authenticated session)...');
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name, status, visibility');
  
  if (error) {
    console.error('Teams fetch error:', error);
  } else {
    console.log(`Teams fetched successfully: ${teams.length} teams.`);
    console.log('Teams list:', teams);
  }
}

run();
