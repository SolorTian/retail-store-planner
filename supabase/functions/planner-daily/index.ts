import {handler} from './handler.mjs';
Deno.serve(request=>handler(request,{
 SUPABASE_URL:Deno.env.get('SUPABASE_URL'),
 SUPABASE_ANON_KEY:JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default,
 SUPABASE_SERVICE_ROLE_KEY:JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default,
 PLANNER_GITHUB_TOKEN:Deno.env.get('PLANNER_GITHUB_TOKEN')
}));

