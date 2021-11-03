import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import sjcl from 'sjcl'
import cheerio from 'cheerio'
import { applyToDefaults } from '@hapi/hoek'

const manifest_filename = 'manifest.json'

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

function generate_manifest (html) {
	return {
		browser_action: {
			default_title: 'SvelteKit',
			default_popup: 'index.html'
		},
		content_security_policy: generate_csp(html),
		manifest_version: 2,
		name: 'TODO',
		version: '0.1'
	}
}

function load_manifest () {
	if (existsSync(manifest_filename)) {
		return JSON.parse(readFileSync(manifest_filename, 'utf-8'))
	}

	return {}
}

/** @type {import('.')} */
export default function ({ pages = 'build', assets = pages, fallback } = {}) {
	return {
		name: 'sveltekit-adapter-browser-extension',

		async adapt({ utils }) {
			const provided_manifest = load_manifest()

			utils.rimraf(assets)
			utils.rimraf(pages)

			utils.copy_static_files(assets)
			utils.copy_client_files(assets)

			await utils.prerender({
				fallback,
				all: !fallback,
				dest: pages
			})

			const index_page = join(assets, 'index.html')
			const index = readFileSync(index_page)

			const generated_manifest = generate_manifest(index.toString())
			const merged_manifest = applyToDefaults(generated_manifest, provided_manifest, { nullOverride: true })

			writeFileSync(join(assets, manifest_filename), JSON.stringify(merged_manifest))
			utils.rimraf(join(assets, '_app'))
		}
	}
}