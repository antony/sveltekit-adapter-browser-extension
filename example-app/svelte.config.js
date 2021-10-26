import adapterBrowserExtension from '../adapter-browser-extension.mjs';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		appDir: 'ext',
		target: '#svelte',
		adapter: adapterBrowserExtension()
	}
};

export default config;
