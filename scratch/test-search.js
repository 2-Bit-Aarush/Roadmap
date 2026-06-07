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
  const { data: teams } = await supabase.from('teams').select('id').limit(1);
  if (!teams || teams.length === 0) return;
  const teamId = teams[0].id;
  
  console.log('Fetching all memberships:');
  const { data: memberships, error } = await supabase
    .from('memberships')
    .select(`
      user_id,
      joined_at,
      display_name,
      profiles!inner (
        id,
        name,
        email
      )
    `)
    .eq('team_id', teamId)
    .eq('is_active', true);
    
  if (error) {
    console.error('Query error:', error);
    return;
  }

  const search = 'Aarush';
  const cleanSearch = search.toLowerCase();
  
  // 1. Filter
  let filtered = memberships.filter(m => {
    const displayName = (m.display_name || '').toLowerCase();
    const profileName = (m.profiles?.name || '').toLowerCase();
    const profileEmail = (m.profiles?.email || '').toLowerCase();
    return displayName.includes(cleanSearch) || 
           profileName.includes(cleanSearch) || 
           profileEmail.includes(cleanSearch);
  });

  // 2. Sort
  filtered.sort((a, b) => {
    const nameA = (a.display_name || a.profiles?.name || 'Unknown User').toLowerCase();
    const nameB = (b.display_name || b.profiles?.name || 'Unknown User').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  console.log('Filtered and sorted rows count:', filtered.length);
  console.log('Sample rows:', JSON.stringify(filtered, null, 2));
}

run();
