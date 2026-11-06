import { argon2id, hash } from 'argon2';

// Hash de contrasenas con argon2id (RNF-04). Es una funcion simple, sin decoradores de Nest, para
// que tambien la usen el seed y los scripts de la raiz del repositorio.
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}

/**
 * Hash mas liviano para la contrasena INICIAL aleatoria de una importacion masiva. Esa clave tiene
 * unos 70 bits de entropia y se reemplaza en el primer ingreso (RF-71), asi que no necesita el costo
 * completo de una contrasena elegida por una persona; con el costo normal, 1000 cuentas tardarian
 * mas que el tiempo limite de la transaccion. `verify` lee los parametros del propio hash.
 */
export function hashInitialPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, memoryCost: 8192, timeCost: 2, parallelism: 1 });
}
