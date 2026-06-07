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

async function run() {
  const { data: teams, error: teamsErr } = await supabase.from('teams').select('id, name').limit(5);
  if (teamsErr) {
    console.error('Teams fetch error:', teamsErr);
    return;
  }
  console.log('Available teams:', teams);
  
  if (teams.length > 0) {
    const teamId = teams[0].id;
    console.log(`\nFetching members for team ID: ${teamId}`);
    const { data: memberships, error: memErr } = await supabase
      .from('memberships')
      .select(`
        user_id,
        role,
        joined_at,
        is_active,
        last_active_at,
        display_name,
        profiles (
          id,
          name,
          email
        )
      `)
      .eq('team_id', teamId);
      
    if (memErr) {
      console.error('Memberships query error:', memErr);
    } else {
      console.log('Memberships response sample:', JSON.stringify(memberships, null, 2));
    }
  }
}

run();
