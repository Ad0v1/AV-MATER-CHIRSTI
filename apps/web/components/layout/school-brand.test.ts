import { afterEach, describe, expect, it, vi } from 'vitest';

// A2 (QA): logica del bloque logo + nombre del colegio. Sin DOM: se inspecciona el arbol de
// elementos React que devuelven SchoolBrand y BrandView.
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/server', () => ({ apiServer: { get } }));

import { BrandView, SchoolBrand, safeLogoUrl } from './school-brand';

type El = { type: unknown; props: Record<string, unknown> };

function find(node: unknown, pred: (e: El) => boolean): El[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, pred));
  if (node === null || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as El;
  const own = pred(el) ? [el] : [];
  return [...own, ...find(el.props.children, pred)];
}

async function brandProps(branding: unknown) {
  if (branding instanceof Error) {
    get.mockImplementation(async () => {
      throw branding;
    });
  } else get.mockResolvedValue(branding);
  const el = (await SchoolBrand({ subtitle: 'Docente' })) as unknown as El;
  return el.props as { name: string; logo: string | null; subtitle: string };
}

describe('SchoolBrand (A2)', () => {
  it('con logo y nombre: pasa ambos a la vista', async () => {
    const p = await brandProps({
      name: 'Colegio Mater',
      logo: { url: 'https://bucket.test/institution/a.png?X-Amz=1', expiresAt: 'x' },
    });
    expect(p).toMatchObject({
      name: 'Colegio Mater',
      logo: 'https://bucket.test/institution/a.png?X-Amz=1',
      subtitle: 'Docente',
    });
  });

  it('sin logo: logo null y el nombre se conserva', async () => {
    const p = await brandProps({ name: 'Colegio Mater', logo: null });
    expect(p.logo).toBeNull();
    expect(p.name).toBe('Colegio Mater');
  });

  it('si la API falla: nombre generico, sin logo y sin lanzar', async () => {
    const p = await brandProps(new Error('ECONNREFUSED'));
    expect(p).toMatchObject({ name: 'Aula Virtual', logo: null });
  });

  it('respuesta null o nombre en blanco: nombre generico', async () => {
    expect((await brandProps(null)).name).toBe('Aula Virtual');
    expect((await brandProps({ name: '   ', logo: null })).name).toBe('Aula Virtual');
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'file:///etc/passwd',
    'ftp://host/logo.png',
    'no es una url',
    '',
  ])('URL que no es http(s) (%s): se descarta el logo', async (url) => {
    const p = await brandProps({ name: 'Colegio', logo: { url, expiresAt: 'x' } });
    expect(p.logo).toBeNull();
  });

  it('http (MinIO local) se acepta', async () => {
    const p = await brandProps({
      name: 'C',
      logo: { url: 'http://127.0.0.1:9000/b/institution/a.png', expiresAt: 'x' },
    });
    expect(p.logo).toBe('http://127.0.0.1:9000/b/institution/a.png');
  });
});

describe('BrandView (A2)', () => {
  it('con logo: una sola img decorativa (alt vacio, aria-hidden); el nombre va como texto', () => {
    const tree = BrandView({ name: 'Colegio', logo: 'https://x.test/l.png', subtitle: 's' });
    const imgs = find(tree, (e) => e.type === 'img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].props).toMatchObject({
      src: 'https://x.test/l.png',
      alt: '',
      'aria-hidden': 'true',
    });
    const texts = find(tree, (e) => typeof e.props.children === 'string').map(
      (e) => e.props.children,
    );
    expect(texts).toContain('Colegio');
  });

  it('sin logo: no hay img y se muestran nombre y subtitulo', () => {
    const tree = BrandView({ name: 'Colegio', logo: null, subtitle: 'Admin' });
    expect(find(tree, (e) => e.type === 'img')).toHaveLength(0);
    const texts = find(tree, (e) => typeof e.props.children === 'string').map(
      (e) => e.props.children,
    );
    expect(texts).toEqual(['Colegio', 'Admin']);
  });
});

describe('safeLogoUrl en produccion (B4)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('solo https y solo el origen del bucket', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_PUBLIC_ORIGIN', 'https://files.colegio.pe');
    expect(safeLogoUrl('https://files.colegio.pe/b/l.png?sig=1')).toBe(
      'https://files.colegio.pe/b/l.png?sig=1',
    );
    expect(safeLogoUrl('http://files.colegio.pe/b/l.png')).toBeNull();
    expect(safeLogoUrl('https://otro.test/l.png')).toBeNull();
  });

  it('sin S3_PUBLIC_ORIGIN: sin logo', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_PUBLIC_ORIGIN', '');
    expect(safeLogoUrl('https://files.colegio.pe/l.png')).toBeNull();
  });
});
