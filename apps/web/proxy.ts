import { NextResponse, type NextRequest } from 'next/server';

// Comprobacion rapida y optimista: sin cookie de sesion, directo al login.
// No valida la sesion (eso lo hace getSession contra la API en cada pagina protegida).
export function proxy(request: NextRequest) {
  if (!request.cookies.has('aula_sid')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Excluye la API, los archivos de Next, los iconos, la marca y el login.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand|login).*)',
  ],
};
