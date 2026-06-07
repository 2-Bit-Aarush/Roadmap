import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Protected paths
  const isDashboard = path.startsWith('/dashboard');
  const isRoadmap = path.startsWith('/roadmap');
  const isCategory = path.startsWith('/category');
  const isAdmin = path.startsWith('/admin');
  const isLogin = path.startsWith('/login');
  const isTeams = path.startsWith('/teams') || path.startsWith('/api/teams');
  const isInvites = path.startsWith('/api/invites');

  if (!user && (isDashboard || isRoadmap || isCategory || isAdmin || isTeams || isInvites)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectedFrom', path);
    
    // Create redirect response and copy session cookies
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value, {
        path: c.path,
        domain: c.domain,
        maxAge: c.maxAge,
        secure: c.secure,
        sameSite: c.sameSite,
        expires: c.expires,
        httpOnly: c.httpOnly,
      });
    });
    return redirectResponse;
  }

  if (user) {
    if (isLogin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      
      const redirectResponse = NextResponse.redirect(redirectUrl);
      response.cookies.getAll().forEach((c) => {
        redirectResponse.cookies.set(c.name, c.value, {
          path: c.path,
          domain: c.domain,
          maxAge: c.maxAge,
          secure: c.secure,
          sameSite: c.sameSite,
          expires: c.expires,
          httpOnly: c.httpOnly,
        });
      });
      return redirectResponse;
    }

    if (isAdmin) {
      // Check admin status
      const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!adminRole || adminRole.role !== 'admin') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/dashboard';
        
        const redirectResponse = NextResponse.redirect(redirectUrl);
        response.cookies.getAll().forEach((c) => {
          redirectResponse.cookies.set(c.name, c.value, {
            path: c.path,
            domain: c.domain,
            maxAge: c.maxAge,
            secure: c.secure,
            sameSite: c.sameSite,
            expires: c.expires,
            httpOnly: c.httpOnly,
          });
        });
        return redirectResponse;
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/roadmap/:path*',
    '/category/:path*',
    '/admin/:path*',
    '/teams/:path*',
    '/api/teams/:path*',
    '/api/invites/:path*',
    '/login',
  ],
};

