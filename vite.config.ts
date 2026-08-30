import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import viteCopyPlugin from './build-scripts/vite-copy-plugin.js'

// CEP panels load assets relative to a file:// path, so `base` must be relative.
export default defineConfig({
	plugins: [react(), viteCopyPlugin()],
	base: './',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src/client-src'),
			'@lib': path.resolve(__dirname, './src/lib'),
		},
		dedupe: ['react', 'react-dom'],
	},
	server: {
		port: 5002,
		strictPort: false,
		host: true,
		cors: true,
		fs: { allow: ['..'] },
	},
	build: {
		outDir: 'dist',
		target: 'es2020',
		rollupOptions: {
			input: path.resolve(__dirname, 'index.html'),
		},
	},
})
