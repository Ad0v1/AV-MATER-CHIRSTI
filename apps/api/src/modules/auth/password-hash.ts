import { argon2id, hash } from 'argon2';

// Hash de contrasenas con argon2id (RNF-04). Es una funcion simple, sin decoradores de Nest, para
// que tambien la usen el seed y los scripts de la raiz del repositorio.
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}
