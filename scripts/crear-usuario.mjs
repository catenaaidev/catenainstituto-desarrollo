#!/usr/bin/env node
// Genera el SQL para crear (o pisar) un usuario sin pasar por /admin.html.
// Lo normal es usar la pantalla de Usuarios; esto queda para emergencias, por
// ejemplo si se pierde la contraseña de todos los administradores.
import crypto from 'node:crypto';

const [usuarioArg, password, nombre = ''] = process.argv.slice(2);
const usuario = (usuarioArg || '').trim().toLowerCase();

if (!usuario || !password) {
  console.error('Uso: node scripts/crear-usuario.mjs usuario contraseña "Nombre"');
  process.exit(1);
}

// Workers no acepta más de 100.000 iteraciones (ver src/auth.ts).
const iterations = 100000;
const salt = crypto.randomBytes(16);
const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');

const b64 = b => b.toString('base64url');
const hash = `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(derived)}`;

const esc = s => String(s).replaceAll("'", "''");
const n = esc(nombre || usuario.split('@')[0]);
console.log(`INSERT INTO usuarios (email, password_hash, nombre, es_admin, debe_cambiar) VALUES ('${esc(usuario)}', '${hash}', '${n}', 1, 1) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, nombre=excluded.nombre, activo=1, es_admin=1, debe_cambiar=1, actualizado=datetime('now');`);
console.log(`-- Queda como administrador de usuarios y se le pide cambiar la contraseña al entrar.`);
console.log(`-- Permisos por módulo, por ejemplo:`);
console.log(`-- INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES ('${esc(usuario)}', 'prensas', 'admin', '${n}');`);
