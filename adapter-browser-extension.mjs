import { join } from 'path'
import { writeFileSync, readFileSync } from 'fs'
import sjcl from 'sjcl'
import cheerio from 'cheerio'

/** @type {import('.')} */
export default function ({ pages = 'build', assets = pages, fallback } = {}) {
	function generate_manifest (html) {
		return JSON.stringify({
			browser_action: {
				default_title: 'SvelteKit',
				default_popup: 'index.html'
			},
			content_security_policy: generate_csp(html),
			manifest_version: 2,
			name: 'TODO',
			version: '0.1'
		})
	};

	function hash_script (s) {
		const hashed = sjcl.hash.sha256.hash(s);
		return sjcl.codec.base64.fromBits(hashed);
	}

	function generate_csp (html) {
		const $ = cheerio.load(html)
		const csp_hashes = $('script[type="module"]')
			.map((i, el) => hash_script($(el).get()[0].children[0].data))
			.toArray()
			.map(h => `'sha256-${h}'`)
			.join(' ')
		return `script-src 'self' ${csp_hashes}; object-src 'self'`
	}

	return {
		name: 'sveltekit-adapter-browser-extension',

		async adapt({ utils }) {
			utils.rimraf(assets)
			utils.rimraf(pages)

			utils.copy_static_files(assets);
			utils.copy_client_files(assets);

			await utils.prerender({
				fallback,
				all: !fallback,
				dest: pages
			})

			const indexPage = join(assets, 'index.html')
			const index = readFileSync(indexPage)

			writeFileSync(join(assets, 'manifest.json'), generate_manifest(index.toString()))
			utils.rimraf(join(assets, '_app'))
		}
	}
}