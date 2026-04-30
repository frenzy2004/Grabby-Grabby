import { NextRequest, NextResponse } from 'next/server';

const REALM = 'Matcha Moments Admin';

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = atob(header.slice('Basic '.length));
    const splitAt = decoded.indexOf(':');
    if (splitAt < 0) return null;

    return {
      username: decoded.slice(0, splitAt),
      password: decoded.slice(splitAt + 1),
    };
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return unauthorized();
  }

  const credentials = parseBasicAuth(req.headers.get('authorization'));
  if (
    credentials?.username !== expectedUsername ||
    credentials.password !== expectedPassword
  ) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
