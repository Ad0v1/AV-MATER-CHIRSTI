import { describe, expect, it } from 'vitest';
import { NAV_BY_ROLE } from './nav';
import { ROUTE_META, routeMetaFor } from './route-meta';

describe('route-meta', () => {
  it('reconoce una ruta exacta, con o sin barra final', () => {
    expect(routeMetaFor('/admin/usuarios')?.title).toBe('Usuarios');
    expect(routeMetaFor('/admin/usuarios/')?.title).toBe('Usuarios');
  });

  it('no inventa metadatos para rutas desconocidas', () => {
    expect(routeMetaFor('/otra-cosa')).toBeUndefined();
    expect(routeMetaFor('/admin/estructura/anios/abc/otra')).toBeUndefined();
    expect(routeMetaFor('/curso/xyz/tareas')).toBeUndefined();
  });

  it('reconoce las pantallas internas con título y ruta de navegación', () => {
    const nuevo = routeMetaFor('/admin/usuarios/nuevo/docente');
    expect(nuevo?.title).toBe('Nuevo docente');
    expect(nuevo?.crumbs?.[0]).toEqual({ label: 'Usuarios', href: '/admin/usuarios' });
  });

  it('las pantallas con id usan un título genérico y enlazan al año de la propia ruta', () => {
    expect(routeMetaFor('/admin/estructura/anios/abc')?.title).toBe('Año académico');
    const clonar = routeMetaFor('/admin/estructura/anios/abc/clonar');
    expect(clonar?.title).toBe('Copiar estructura');
    expect(clonar?.crumbs).toContainEqual({ label: 'Año', href: '/admin/estructura/anios/abc' });
    expect(routeMetaFor('/admin/usuarios/123')?.title).toBe('Usuario');
  });

  it('la ruta fija "nuevo" gana a la que lleva id', () => {
    expect(routeMetaFor('/admin/estructura/anios/nuevo')?.title).toBe('Nuevo año académico');
  });

  it('cada módulo del menú tiene su título precargado (salvo el perfil)', () => {
    const hrefs = Object.values(NAV_BY_ROLE)
      .flat()
      .flatMap((g) => g.items.map((i) => i.href))
      .filter((h) => h !== '/mi-perfil');
    const missing = [...new Set(hrefs)].filter((h) => !routeMetaFor(h));
    expect(missing).toEqual([]);
  });

  it('todos los títulos están definidos', () => {
    for (const [route, meta] of Object.entries(ROUTE_META)) {
      expect(meta.title.length, route).toBeGreaterThan(0);
    }
  });
});
