#!/usr/bin/env node
import crypto from 'node:crypto';

const [emailArg, password, nombre = ''] = process.argv.slice(2);
const email = (emailArg || '').trim().toLowerCase();

if (!email || !password) {
  console.error('Uso: node scripts/crear-usuario.mjs email contraseña "Nombre"');
  process.exit(1);
}
if (password.length < 10) {
  console.error('La contraseña debe tener al menos 10 caracteres.');
  process.exit(1);
}

const iterations = 120000;
const salt = crypto.randomBytes(16);
const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');

const b64 = b => b.toString('base64url');
const hash = `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(derived)}`;

const esc = s => String(s).replaceAll("'", "''");
console.log(`INSERT INTO usuarios (email, password_hash, nombre) VALUES ('${esc(email)}', '${hash}', '${esc(nombre || email.split('@')[0])}') ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, nombre=excluded.nombre, activo=1, actualizado=datetime('now');`);
console.log(`-- Luego asigná los permisos en perfiles, por ejemplo:`);
console.log(`-- INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES ('${esc(email)}', 'prensas', 'admin', '${esc(nombre || email.split('@')[0])}');`);
