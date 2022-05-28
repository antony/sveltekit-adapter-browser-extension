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

function generate_manifest (html, manifest = {}) {
	return {...{
		browser_action: {
			default_title: 'SvelteKit',
			default_popup: 'index.html'
		},
		content_security_policy: generate_csp(html),
		manifest_version: 2,
		name: 'TODO',
		version: '0.1'
	}, ...manifest}
}

function load_manifest () {
	if (existsSync(manifest_filename)) {
		return JSON.parse(readFileSync(manifest_filename, 'utf-8'))
	}

	return {}
}


/** @type {import('.')} */
export default function ({ pages = 'build', assets = pages, manifest={}, fallback } = {}) {
	return {
		name: 'sveltekit-adapter-browser-extension',

		async adapt(builder) {
			if (!fallback && !builder.config.kit.prerender.default) {
				builder.log.warn(
					'You should set `config.kit.prerender.default` to `true` if no fallback is specified'
				);
			}


			const provided_manifest = load_manifest()

			builder.rimraf(assets)
			builder.rimraf(pages)

			builder.writeStatic(assets)
			builder.writeClient(assets)

			builder.writePrerendered(pages, { fallback });

			const index_page = join(assets, 'index.html')
			const index = readFileSync(index_page)

			const generated_manifest = generate_manifest(index.toString(), manifest)
			const merged_manifest = applyToDefaults(generated_manifest, provided_manifest, { nullOverride: true })

			writeFileSync(join(assets, manifest_filename), JSON.stringify(merged_manifest))
			builder.rimraf(join(assets, '_app'))
		}
	}
}
