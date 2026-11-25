import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('./editor.jsx',import.meta.url))],outfile:fileURLToPath(new URL('../../public/vendimia/vendor/editor.js',import.meta.url)),bundle:true,minify:true,format:'esm',platform:'browser',target:['es2022'],jsx:'automatic',loader:{'.png':'dataurl','.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
