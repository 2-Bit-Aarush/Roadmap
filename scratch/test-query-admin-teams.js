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
  console.log('Running admin teams query...');
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`
      id,
      name,
      description,
      icon,
      goal,
      status,
      status_reason,
      created_at,
      owner_id,
      visibility,
      memberships(
        role,
        is_active,
        user_id,
        display_name,
        profiles(id, name, email)
      ),
      invites(
        id,
        code,
        is_revoked,
        expires_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Query failed:', error);
  } else {
    console.log('Query succeeded! Retrieved teams count:', teams.length);
    console.log('Teams data sample (first team):', JSON.stringify(teams[0], null, 2));
  }
}

run();
