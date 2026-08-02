import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    build: {
        // Three.js is intentionally isolated; its 174 kB gzipped runtime exceeds Vite's
        // generic default, while the application entry remains below 20 kB.
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                manualChunks: {
                    'three-core': ['three'],
                    'three-react': ['@react-three/fiber', '@react-three/drei'],
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                rewrite: function (path) { return path.replace(/^\/api/, ''); },
            },
        },
    },
});
